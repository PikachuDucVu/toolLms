import {
  CheckpointExamKeySchema,
  type CheckpointBranch,
  type CheckpointExamKey,
  type CheckpointGradeExamMeta,
  type CheckpointGradeResult,
  type CheckpointGradeSubmission,
  type CheckpointNumber,
  type GradeCheckpointRequest,
} from "@tool-lms/contracts";
import type { Env, SessionRecord } from "../types";
import { extractCheckpointExamKeyWithAi, gradeCheckpointEssayWithAi } from "./aiClient";
import {
  CheckpointGradeNotFoundError,
  fetchCheckpointExamPdf,
  fetchCheckpointGradePayload,
  resolveGradeBranch,
} from "./checkpointGradeClient";
import {
  buildTeacherNotes,
  emptyMcResult,
  gradeMcAnswers,
  isScratchFileName,
  roundCheckpointScore,
  theoryScoreFromMc,
} from "./checkpointGrading";
import {
  CommentContextInvalidError,
  loadRegularSlotContext,
} from "./commentSubmissionService";
import { getConfig } from "./configService";
import { resolveHomeworkAiKey } from "./homeworkService";
import type { LmsClient } from "./lmsClient";
import { classifyRemoteFile, loadRemoteFile, MAX_EXAM_PDF_BYTES } from "./remoteFileContent";

export class CheckpointGradeApiKeyRequiredError extends Error {
  readonly code = "API_KEY_REQUIRED";
  constructor(readonly provider: string, readonly modelId: string) {
    super("Cần API key để sử dụng model đã chọn.");
    this.name = "CheckpointGradeApiKeyRequiredError";
  }
}

export class CheckpointGradeUnavailableError extends Error {}

export async function gradeCheckpointStudent(
  env: Env,
  client: Pick<LmsClient, "callApi">,
  session: SessionRecord,
  request: GradeCheckpointRequest,
): Promise<{ result: CheckpointGradeResult; session: SessionRecord }> {
  const loaded = await loadRegularSlotContext(client, session, {
    classId: request.classId,
    slotId: request.slotId,
    studentId: request.studentId,
  });
  if (![5, 9].includes(loaded.context.sessionNumber)) {
    throw new CommentContextInvalidError("Buổi học này không phải buổi Checkpoint.");
  }
  const expectedCheckpoint: CheckpointNumber = loaded.context.sessionNumber === 5 ? 1 : 2;
  if (request.checkpoint !== expectedCheckpoint) {
    throw new CommentContextInvalidError("Checkpoint không khớp buổi học.");
  }

  const config = await getConfig(env);
  const keyState = resolveHomeworkAiKey(env, config, request);
  if (!keyState.available) throw new CheckpointGradeApiKeyRequiredError(keyState.provider, keyState.modelId);

  const payload = await fetchCheckpointGradePayload(env, {
    classId: request.classId,
    checkpoint: request.checkpoint,
    studentId: request.studentId,
  });
  const resolved = resolveGradeBranch(payload, request.studentId, request.branch);
  const branchPayload = resolved.branch === "makeup" ? payload.makeup : payload.original;
  const submission = branchPayload?.submissions[request.studentId];
  const exam = submission ? branchPayload?.exams[submission.examId] : undefined;
  if (!submission || !exam) throw new CheckpointGradeNotFoundError("Học sinh chưa nộp bài kiểm tra Checkpoint.");

  const result = await gradeLoadedSubmission(env, {
    classId: request.classId,
    checkpoint: request.checkpoint,
    branch: resolved.branch,
    exam,
    submission,
    studentName: loaded.context.attendance?.displayName || submission.studentName,
    modelId: request.modelId,
    customModelId: request.customModelId,
    thinkingLevel: request.thinkingLevel,
    apiKey: request.apiKey,
  });
  return { result, session: loaded.session };
}

async function gradeLoadedSubmission(
  env: Env,
  input: {
    classId: string;
    checkpoint: CheckpointNumber;
    branch: CheckpointBranch;
    exam: CheckpointGradeExamMeta;
    submission: CheckpointGradeSubmission;
    studentName: string;
    modelId?: string;
    customModelId?: string;
    thinkingLevel?: string;
    apiKey?: string;
  },
): Promise<CheckpointGradeResult> {
  const config = await getConfig(env);
  const essayFiles = input.submission.essayFiles.filter((file) => !isScratchFileName(file.fileName));
  const hasMc = input.exam.mcQuestionCount > 0;
  const hasEssayQuestions = input.exam.essayQuestionCount > 0;
  const hasEssayText = Object.keys(input.submission.essayAnswers).length > 0;
  const hasEssayFiles = essayFiles.length > 0;
  const hasEssayWork = hasEssayQuestions || hasEssayText || hasEssayFiles;

  if (!hasMc && !hasEssayWork) {
    throw new CheckpointGradeUnavailableError("Không có bài trắc nghiệm hoặc tự luận để chấm (đã bỏ qua Scratch).");
  }

  let pdfBytes: Uint8Array | undefined;
  const needPdf = hasMc || hasEssayWork;
  if (needPdf) {
    const cachedKey = hasMc ? await loadCachedExamKey(env, input.exam.id) : null;
    if (!cachedKey || hasEssayWork) {
      const downloaded = await fetchCheckpointExamPdf(env, input.exam.pdfPath);
      if (downloaded.byteLength > MAX_EXAM_PDF_BYTES) {
        throw new CheckpointGradeUnavailableError("File đề bài quá lớn để chấm bằng AI.");
      }
      pdfBytes = downloaded;
    }
  }

  let examKey: CheckpointExamKey = { mc: [], essay: [] };
  if (hasMc || hasEssayQuestions) {
    const cached = await loadCachedExamKey(env, input.exam.id);
    if (cached) {
      examKey = cached;
    } else {
      if (!pdfBytes) pdfBytes = await fetchCheckpointExamPdf(env, input.exam.pdfPath);
      const extracted = await extractCheckpointExamKeyWithAi(env, config, {
        pdfBytes,
        mcQuestionCount: input.exam.mcQuestionCount,
        essayQuestionCount: input.exam.essayQuestionCount,
        modelId: input.modelId,
        customModelId: input.customModelId,
        thinkingLevel: input.thinkingLevel,
        apiKey: input.apiKey,
      });
      if (!extracted.success) throw new CheckpointGradeUnavailableError(extracted.error);
      examKey = extracted.key;
      await saveCachedExamKey(env, input, examKey, input.modelId || "");
    }
  }

  const mc = hasMc
    ? gradeMcAnswers(input.submission.mcAnswers, examKey.mc, input.exam.mcQuestionCount)
    : emptyMcResult();
  const theoryScore = hasMc ? theoryScoreFromMc(mc.correct, mc.total) : null;

  let practiceScore: number | null = null;
  let essayNotes = "";
  let essayItems: CheckpointGradeResult["essay"]["items"] = [];

  if (hasEssayWork) {
    if (!hasEssayText && !hasEssayFiles && hasEssayQuestions) {
      practiceScore = 0;
      essayNotes = "Học sinh không nộp bài tự luận.";
    } else {
      const textFiles: Array<{ name: string; content: string }> = [];
      const imageUrls: string[] = [];
      const otherFiles: string[] = [];
      for (const file of essayFiles) {
        const kind = classifyRemoteFile(file.fileName, file.contentType);
        if (kind === "scratch") continue;
        if (!isSafeFileUrl(file.url)) {
          otherFiles.push(file.fileName);
          continue;
        }
        try {
          const loaded = await loadRemoteFile({ url: file.url, fileName: file.fileName, contentType: file.contentType });
          if (loaded.kind === "scratch") continue;
          if (loaded.imageDataUrl) imageUrls.push(loaded.imageDataUrl);
          if (loaded.textFiles.length) textFiles.push(...loaded.textFiles);
          else if (loaded.kind === "other" || loaded.kind === "pdf") otherFiles.push(loaded.name);
        } catch {
          otherFiles.push(file.fileName);
        }
      }

      const graded = await gradeCheckpointEssayWithAi(env, config, {
        studentName: input.studentName,
        pdfBytes,
        rubric: examKey.essay,
        essayAnswers: input.submission.essayAnswers,
        textFiles,
        imageUrls,
        otherFiles,
        modelId: input.modelId,
        customModelId: input.customModelId,
        thinkingLevel: input.thinkingLevel,
        apiKey: input.apiKey,
      });
      if (!graded.success) throw new CheckpointGradeUnavailableError(graded.error);
      practiceScore = roundCheckpointScore(graded.practiceScore);
      essayNotes = graded.notes;
      essayItems = graded.items.map((item) => ({
        number: item.number,
        score: roundCheckpointScore(item.score),
        note: item.note,
      }));
    }
  }

  const teacherNotes = buildTeacherNotes({
    theoryScore,
    practiceScore,
    mc,
    essayNotes,
    skippedScratch: true,
  });

  return {
    studentId: input.submission.studentId,
    examId: input.exam.id,
    branch: input.branch,
    skippedScratch: true,
    theoryScore,
    practiceScore,
    mc,
    essay: { notes: essayNotes, items: essayItems },
    teacherNotes,
  };
}

function isSafeFileUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

async function loadCachedExamKey(env: Env, examId: string): Promise<CheckpointExamKey | null> {
  try {
    const row = await env.DB.prepare("SELECT answer_key_json FROM checkpoint_exam_keys WHERE exam_id = ?")
      .bind(examId)
      .first<{ answer_key_json: string }>();
    if (!row?.answer_key_json) return null;
    const parsed = CheckpointExamKeySchema.safeParse(JSON.parse(row.answer_key_json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function saveCachedExamKey(
  env: Env,
  input: { classId: string; checkpoint: CheckpointNumber; exam: CheckpointGradeExamMeta },
  key: CheckpointExamKey,
  modelId: string,
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO checkpoint_exam_keys (exam_id, class_id, checkpoint, mc_question_count, essay_question_count, answer_key_json, model_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(exam_id) DO UPDATE SET
         answer_key_json = excluded.answer_key_json,
         model_id = excluded.model_id,
         updated_at = excluded.updated_at`,
    )
      .bind(
        input.exam.id,
        input.classId,
        input.checkpoint,
        input.exam.mcQuestionCount,
        input.exam.essayQuestionCount,
        JSON.stringify(key),
        modelId,
        now,
        now,
      )
      .run();
  } catch {
    // Cache is best-effort.
  }
}

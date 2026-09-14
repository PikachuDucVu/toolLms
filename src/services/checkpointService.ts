import { CheckpointStatusResultSchema } from "@tool-lms/contracts";
import type {
  CheckpointBranch,
  CheckpointNumber,
  CheckpointScoreInput,
  CheckpointStatusResult,
  CheckpointStudentBranchStatus,
  CheckpointSubmitRequest,
  ClassDetail,
  Slot,
  StudentAttendance,
} from "@tool-lms/contracts";
import type { Env, LmsGraphqlResponse, SessionRecord } from "../types";
import { fetchClassDetail } from "./classService";
import { appendCommentLog } from "./commentService";
import {
  CommentContextInvalidError,
  CommentContextNotFoundError,
  CommentUpstreamError,
  loadRegularSlotContext,
  updateSlotComment,
} from "./commentSubmissionService";
import type { LmsClient } from "./lmsClient";

export type RandomSource = () => number;
export type Fetcher = typeof fetch;

const CHECKPOINT_STATUS_BASE_URL = "https://kiemtra.ducvu.io.vn";
const CHECKPOINT_STATUS_TIMEOUT_MS = 8_000;

const CHECKPOINT_QUESTION_IDS = [
  "668e2f99e71f90e7630d4594", "668e2f99e71f90e7630d4595", "668e2f99e71f90e7630d4596",
  "668e2f99e71f90e7630d4597", "668e2f99e71f90e7630d4598", "668e2f99e71f90e7630d4599",
  "668e2f99e71f90e7630d459a", "668e2f99e71f90e7630d459b", "668e2f99e71f90e7630d459c",
  "668e2f99e71f90e7630d459d",
] as const;

const CHECKPOINT_RATE_AREAS = [
  { grade: 5, content: "- Học viên chủ động liên hệ giáo viên tìm thêm nguồn/ sách để ôn tập và học kiến thức mới tại nhà ngoài những tài liệu đã được cung cấp mà không cần yêu cầu từ giáo viên", commentAreaId: "665e7d33181e0e47f6c63768", type: "RATE", courseProcessCheckpointEvaluationId: "66c866a56ae1a9fab6399329", courseProcessCheckpointEvaluationTitle: "KIẾN THỨC" },
  { grade: 5, content: "- Ngoài việc nắm vững các kiến thức được giảng dạy, học viên còn có sự chủ động, đặt câu hỏi mở rộng trực tiếp tại lớp từ những kiến thức vừa được cung cấp", commentAreaId: "668d69d8e71f90e7630ce16c", type: "RATE", courseProcessCheckpointEvaluationId: "66c866a56ae1a9fab6399329", courseProcessCheckpointEvaluationTitle: "KIẾN THỨC" },
  { grade: 5, content: "- Học viên phản biện và phân tích các giải pháp một cách sâu rộng, biết thử đi thử lại nhiều lần đến khi ra kết quả từ đó Học viên có thể tổng quát cho nhiều vấn đề tương tự sau này\n- Học viên đưa sản phẩm cá nhân go live và có tiếp nhận người dùng thật", commentAreaId: "668e0f48e71f90e7630d2db6", type: "RATE", courseProcessCheckpointEvaluationId: "66c866a56ae1a9fab639932a", courseProcessCheckpointEvaluationTitle: "KỸ NĂNG" },
  { grade: 5, content: "- Học viên trình bày ý kiến rõ ràng, chủ động hỏi khi gặp vấn đề, thuyết trình trước lớp mạch lạc, rõ ràng\n- Học viên nhìn nhận được những ưu - nhược điểm của bản thân sau khi nhận đánh giá từ giáo viên, bạn bè", commentAreaId: "668e2e7de71f90e7630d4316", type: "RATE", courseProcessCheckpointEvaluationId: "66c866a56ae1a9fab639932a", courseProcessCheckpointEvaluationTitle: "KỸ NĂNG" },
  { grade: 5, content: "- Tốc độ sử dụng chuột/bàn phím rất thành thạo, có thể sử dụng gõ phím bằng 2 tay không cần nhìn phím.\n- Học viên tận dụng tối ưu các phần mềm máy tính, sử dụng các công cụ hỗ trợ xây dựng sơ đồ tư duy, công cụ quản lý tiến độ dự án, công cụ xây dựng sơ đồ thuật toán", commentAreaId: "668e2ce1e71f90e7630d406f", type: "RATE", courseProcessCheckpointEvaluationId: "66c866a56ae1a9fab639932a", courseProcessCheckpointEvaluationTitle: "KỸ NĂNG" },
  { grade: 5, content: "- Học viên thành thạo trong việc sử dụng ngôn ngữ lập trình\n- Học viên có thể tự xây dựng mô hình/sơ đồ tư duy tuần tự các bước lập trình cho dự án cá nhân của mình mà không cần sự hỗ trợ từ Giáo viên", commentAreaId: "668d6a25e71f90e7630ce187", type: "RATE", courseProcessCheckpointEvaluationId: "66c866a56ae1a9fab639932a", courseProcessCheckpointEvaluationTitle: "KỸ NĂNG" },
  { grade: 5, content: "- Học viên chủ động trong việc phát hiện ra những ý tưởng sáng tạo cho các tính năng của sản phẩm dựa trên những kiến thức vừa được học và đặt câu hỏi với Giáo viên.\n- Học viên tự mình thiết kế trò chơi, câu chuyện hoặc dự án hoàn toàn mới, có khả năng thu hút sự chú ý và hứng thú của người khác, hoặc tạo ra một trào lưu trong cộng đồng", commentAreaId: "668d6a69e71f90e7630ce198", type: "RATE", courseProcessCheckpointEvaluationId: "66c866a56ae1a9fab639932a", courseProcessCheckpointEvaluationTitle: "KỸ NĂNG" },
  { grade: 5, content: "- Học viên tập trung lắng nghe bài giảng, tự giác học tập, mentor hầu như không phải nhắc nhở con, hiệu quả buổi học cao\n- Học viên tuân thủ tuyệt đối các quy tắc trong lớp học, luôn có mặt đúng giờ, lễ phép khi giao tiếp với giáo viên", commentAreaId: "668e2eaee71f90e7630d434f", type: "RATE", courseProcessCheckpointEvaluationId: "66c866a56ae1a9fab639932b", courseProcessCheckpointEvaluationTitle: "THÁI ĐỘ" },
  { grade: 5, content: "- Học viên chủ động tìm kiếm thêm các bài tập, dự án để luyện tập và đặt các câu hỏi luyện tập với giáo viên", commentAreaId: "668e2f5be71f90e7630d44c1", type: "RATE", courseProcessCheckpointEvaluationId: "66c866a56ae1a9fab639932b", courseProcessCheckpointEvaluationTitle: "THÁI ĐỘ" },
] as const;

const SURVEY_AREA = { grade: 0, content: "Chúng tôi rất cảm ơn Quý phụ huynh đã tin tưởng và lựa chọn đăng ký học cho con tại Học viện công nghệ MindX. Để nâng cao chất lượng đào tạo và dịch vụ, xin Quý phụ huynh dành chút thời gian để hoàn thành khảo sát dưới đây.\nhttps://forms.office.com/r/aD9aPGAw2A", commentAreaId: "670777c055bde44038509a1b", type: "RATE" } as const;
const CONTENT_AREA_ID = "67b54307f79c7bc326e017ff";
const CHECKPOINT_AREA_ID = "668e2f99e71f90e7630d4593";

export class CheckpointStatusTimeoutError extends Error {}
export class CheckpointStatusUpstreamError extends Error {}
export class CheckpointStatusMalformedError extends Error {}

export function checkpointRank(score: number): "A" | "B" | "C" | "D" {
  return score >= 4.5 ? "A" : score >= 3.5 ? "B" : score >= 2.5 ? "C" : "D";
}

export function parseCheckpointScore(value: unknown, label = "Điểm checkpoint"): number | null {
  if (value === "" || value == null) return null;
  const score = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(score) || score < 0 || score > 5) throw new CommentContextInvalidError(`${label} phải nằm trong khoảng 0-5.`);
  if (Math.abs(score * 2 - Math.round(score * 2)) > 0.0001) throw new CommentContextInvalidError(`${label} phải nhập theo bước 0.5.`);
  return score;
}

function randomCheckpointScore(rng: RandomSource): number {
  return [4, 4.5, 5][Math.floor(rng() * 3)];
}

export function resolveCheckpointScores(input: CheckpointScoreInput, rng: RandomSource = Math.random): { theoryScore: number; practiceScore: number } {
  if (input.strategy === "auto") return { theoryScore: randomCheckpointScore(rng), practiceScore: randomCheckpointScore(rng) };
  return {
    theoryScore: input.theoryScore == null ? randomCheckpointScore(rng) : input.theoryScore,
    practiceScore: input.practiceScore == null ? randomCheckpointScore(rng) : input.practiceScore,
  };
}

export function shuffleCheckpointResults(values: boolean[], rng: RandomSource = Math.random): boolean[] {
  const results = [...values];
  for (let index = results.length - 1; index > 0; index -= 1) {
    const target = Math.floor(rng() * (index + 1));
    [results[index], results[target]] = [results[target], results[index]];
  }
  return results;
}

function scoreOnlyComment(attendance: StudentAttendance, requested?: string): string {
  const existing = attendance.commentByAreas.find((area) => area.type === "CONTENT" && area.content)?.content;
  return existing || requested || "<p>Học sinh hoàn thành bài kiểm tra checkpoint.</p>";
}

export function buildCheckpointPayload(input: {
  classDetail: ClassDetail;
  slot: Slot;
  attendance: StudentAttendance;
  classSiteId: string;
  courseProcessId: string;
  sessionNumber: number;
  request: CheckpointSubmitRequest;
}, rng: RandomSource = Math.random) {
  const { theoryScore, practiceScore } = resolveCheckpointScores(input.request.scores, rng);
  const numCorrect = Math.max(0, Math.min(10, Math.floor(theoryScore / 0.5)));
  const results = shuffleCheckpointResults(Array(numCorrect).fill(true).concat(Array(10 - numCorrect).fill(false)), rng);
  const checkpointQuestions = results.map((correct, index) => ({ title: `${index + 1}. `, result: correct, score: correct ? 0.5 : 0, id: CHECKPOINT_QUESTION_IDS[index] }));
  const totalScore = Math.round(((theoryScore + practiceScore) / 2) * 10) / 10;
  const rank = checkpointRank(totalScore);
  const comment = input.request.mode === "score_only" ? scoreOnlyComment(input.attendance, input.request.comment) : input.request.comment;
  const contentArea = { content: comment || "<p>Học sinh hoàn thành bài kiểm tra tốt.</p>", commentAreaId: CONTENT_AREA_ID, type: "CONTENT" };
  const checkpointArea = {
    checkpoint: { practiceScore, checkpointScore: theoryScore, checkpointQuestions },
    content: `Điểm thực hành: ${practiceScore}\n    <p>Điểm trắc nghiệm: ${theoryScore}</p>`,
    commentAreaId: CHECKPOINT_AREA_ID,
    type: "CHECKPOINT",
  };
  const byAreas = [...CHECKPOINT_RATE_AREAS, SURVEY_AREA, contentArea, checkpointArea];
  const theoryItems = checkpointQuestions.map((question) => `<li data-list="bullet"><span class="ql-ui"></span><span style="color:rgb(0, 0, 0)">${question.title}: ${question.result ? "0.5 điểm" : "0 điểm"}</span></li>`).join("");
  const fullContent = `<div style="list-style-type:circle"><p><strong style="color:rgb(0, 0, 0)">Điểm lý thuyết</strong><span style="color:rgb(0, 0, 0)">: </span><strong style="color:rgb(226, 80, 65)">${theoryScore} điểm</strong></p><ul>${theoryItems}</ul><p><strong style="color:rgb(0, 0, 0)">Điểm thực hành</strong><span style="color:rgb(0, 0, 0)">: </span><strong style="color:rgb(226, 80, 65)">${practiceScore} điểm</strong></p></div>`;
  return {
    payload: {
      slotId: input.slot.id, classSiteId: input.classSiteId, sessionNumber: input.sessionNumber,
      classId: input.classDetail.id, courseProcessId: input.courseProcessId,
      slotType: "CheckPoint", totalScore, rank,
      ...(input.request.summary === undefined ? {} : { summary: `<p>${input.request.summary}</p>` }),
      studentComment: { studentAttendanceId: input.attendance.id, studentId: input.attendance.studentId, content: fullContent, byAreas },
    },
    theoryScore,
    practiceScore,
    totalScore,
    rank,
    questions: checkpointQuestions.map((question, index) => ({ number: index + 1, correct: question.result, score: question.score as 0 | 0.5 })),
  };
}

export async function submitCheckpoint(
  env: Env,
  client: Pick<LmsClient, "callApi">,
  session: SessionRecord,
  slotId: string,
  request: CheckpointSubmitRequest,
  rng: RandomSource = Math.random,
) {
  const loaded = await loadRegularSlotContext(client, session, { classId: request.classId, slotId, studentId: request.studentId, attendanceId: request.attendanceId });
  if (![5, 9].includes(loaded.context.sessionNumber)) throw new CommentContextInvalidError("Buổi học này không phải buổi Checkpoint.");
  const built = buildCheckpointPayload({ ...loaded.context, attendance: loaded.context.attendance!, request }, rng);
  const updatedSession = await updateSlotComment(client, loaded.session, built.payload);
  let logged = true;
  try {
    await appendCommentLog(env, { class_id: loaded.context.classDetail.id, class_name: loaded.context.classDetail.name, session_number: loaded.context.sessionNumber, student_id: loaded.context.attendance!.studentId, student_name: loaded.context.attendance!.displayName, comment: request.comment || "", slot_type: request.mode === "score_only" ? "CheckPointScore" : "CheckPoint", scores: { theory: built.theoryScore, practice: built.practiceScore, total: built.totalScore, rank: built.rank }, success: true });
  } catch { logged = false; }
  return { session: updatedSession, context: loaded.context, built, logged };
}

function firstUpstreamError(body: LmsGraphqlResponse): string | null { return body.errors?.[0]?.message || body.error || null; }

export async function loadCheckpointStatusContext(
  client: Pick<LmsClient, "callApi">,
  session: SessionRecord,
  classId: string,
): Promise<{ classDetail: ClassDetail; session: SessionRecord }> {
  const loaded = await fetchClassDetail(client, session, classId);
  const upstreamError = firstUpstreamError(loaded.body);
  if (upstreamError) throw new CommentUpstreamError(upstreamError);
  if (loaded.invalidDetail) throw new CommentUpstreamError("Dữ liệu lớp từ LMS không hợp lệ.");
  if (!loaded.classDetail || loaded.classDetail.id !== classId) throw new CommentContextNotFoundError("Không tìm thấy lớp học.");
  return { classDetail: loaded.classDetail, session: loaded.session };
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function stringValue(value: unknown): string { return typeof value === "string" ? value : value == null ? "" : String(value); }
function nullableString(value: unknown): string | null { const valueString = stringValue(value); return valueString || null; }
function liveExam(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (!isRecord(value)) throw new CheckpointStatusMalformedError("Dữ liệu kỳ kiểm tra không hợp lệ.");
  const status = stringValue(value.status);
  if (!status) throw new CheckpointStatusMalformedError("Kỳ kiểm tra thiếu trạng thái.");
  if (status.toUpperCase() === "DELETED") return null;
  const id = stringValue(value.id || value.examId || value._id);
  if (!id) throw new CheckpointStatusMalformedError("Kỳ kiểm tra thiếu định danh.");
  return value;
}
function safeExternalUrl(value: unknown): string | null {
  const raw = stringValue(value);
  if (!raw) return null;
  try { const parsed = new URL(raw); return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null; } catch { return null; }
}
function normalizeExam(value: Record<string, unknown> | null, branch: CheckpointBranch) {
  if (!value) return null;
  return {
    id: stringValue(value.id || value.examId || value._id),
    branch,
    title: stringValue(value.title || value.name),
    status: stringValue(value.status),
    practiceType: nullableString(value.practiceType),
  };
}
function normalizeBranch(value: unknown, branch: CheckpointBranch, examLive: boolean, studentId: string): CheckpointStudentBranchStatus | null {
  if (!examLive || value == null) return null;
  if (!isRecord(value)) throw new CheckpointStatusMalformedError("Dữ liệu lượt nộp checkpoint không hợp lệ.");
  const submittedAt = stringValue(value.submittedAt);
  const examId = stringValue(value.examId || value.id);
  if (!submittedAt || !Number.isFinite(Date.parse(submittedAt)) || !examId) throw new CheckpointStatusMalformedError("Lượt nộp checkpoint thiếu dữ liệu bắt buộc.");
  const practiceType = nullableString(value.practiceType);
  const links: CheckpointStudentBranchStatus["links"] = [];
  if (practiceType === "SCRATCH" && value.hasScratchFinal === true) {
    links.push({ kind: "scratch", label: "Xem Scratch", url: `${CHECKPOINT_STATUS_BASE_URL}/view/scratch/${encodeURIComponent(examId)}/${encodeURIComponent(studentId)}` });
  }
  if (value.essayFiles != null && !Array.isArray(value.essayFiles)) throw new CheckpointStatusMalformedError("Danh sách tệp checkpoint không hợp lệ.");
  for (const file of Array.isArray(value.essayFiles) ? value.essayFiles : []) {
    if (!isRecord(file)) throw new CheckpointStatusMalformedError("Tệp checkpoint không hợp lệ.");
    const url = safeExternalUrl(file.url);
    if (!url) throw new CheckpointStatusMalformedError("Liên kết tệp checkpoint không hợp lệ.");
    links.push({ kind: "essay", label: stringValue(file.fileName) || "File", url });
  }
  return { branch, submittedAt, practiceType, links };
}

export function normalizeCheckpointStatus(raw: unknown, classId: string, checkpoint: CheckpointNumber): CheckpointStatusResult {
  if (!isRecord(raw) || !Array.isArray(raw.students)) throw new CheckpointStatusMalformedError("Phản hồi trạng thái checkpoint không hợp lệ.");
  const originalRaw = liveExam(raw.original);
  const makeupRaw = liveExam(raw.makeup);
  const original = normalizeExam(originalRaw, "original");
  const makeup = normalizeExam(makeupRaw, "makeup");
  const students = raw.students.map((student) => {
    if (!isRecord(student)) throw new CheckpointStatusMalformedError("Dữ liệu học sinh checkpoint không hợp lệ.");
    const studentId = stringValue(student.studentId);
    if (!studentId) throw new CheckpointStatusMalformedError("Trạng thái checkpoint thiếu mã học sinh.");
    const originalBranch = normalizeBranch(student.original, "original", original !== null, studentId);
    const makeupBranch = normalizeBranch(student.makeup, "makeup", makeup !== null, studentId);
    const originalAt = originalBranch?.submittedAt || "";
    const makeupAt = makeupBranch?.submittedAt || "";
    const defaultBranch: CheckpointBranch | null = makeupAt && (!originalAt || makeupAt > originalAt) ? "makeup" : originalAt ? "original" : null;
    return { studentId, original: originalBranch, makeup: makeupBranch, defaultBranch };
  }).filter((student) => student.original || student.makeup);
  const normalized = CheckpointStatusResultSchema.safeParse({ classId, checkpoint, original, makeup, students });
  if (!normalized.success) throw new CheckpointStatusMalformedError("Phản hồi trạng thái checkpoint vượt ngoài hợp đồng dữ liệu.");
  return normalized.data;
}

export async function fetchCheckpointStatus(
  classId: string,
  checkpoint: CheckpointNumber,
  fetcher: Fetcher = fetch,
  timeoutMs = CHECKPOINT_STATUS_TIMEOUT_MS,
): Promise<CheckpointStatusResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `${CHECKPOINT_STATUS_BASE_URL}/api/public/checkpoint-status?classId=${encodeURIComponent(classId)}&checkpoint=${checkpoint}`;
    let response: Response;
    try { response = await fetcher(url, { signal: controller.signal }); }
    catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) throw new CheckpointStatusTimeoutError("Dịch vụ trạng thái checkpoint phản hồi quá thời gian.");
      throw new CheckpointStatusUpstreamError("Không thể kết nối dịch vụ trạng thái checkpoint.");
    }
    if (!response.ok) throw new CheckpointStatusUpstreamError(`Dịch vụ trạng thái checkpoint trả về HTTP ${response.status}.`);
    let raw: unknown;
    try { raw = await response.json(); }
    catch { throw new CheckpointStatusMalformedError("Phản hồi trạng thái checkpoint không phải JSON hợp lệ."); }
    return normalizeCheckpointStatus(raw, classId, checkpoint);
  } finally { clearTimeout(timeout); }
}

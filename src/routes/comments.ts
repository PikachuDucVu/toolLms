import { Hono } from "hono";
import { isLearningLevel, normalizeLearningLevel } from "../constants/learningLevels";
import type { Env } from "../types";
import { appendCommentLog } from "../services/commentService";
import { getConfig } from "../services/configService";
import { generateCheckpointCommentWithAi, generateCommentWithAi } from "../services/aiClient";
import { requireSession, readJsonBody } from "./helpers";

export const commentsRoutes = new Hono<{ Bindings: Env }>();

commentsRoutes.post("/log_comment", async (c) => {
  const session = await requireSession(c);
  if (session instanceof Response) return session;

  const body = await readJsonBody(c);
  await appendCommentLog(c.env, body);
  return c.json({ success: true, logged: true });
});

commentsRoutes.post("/generate_comment", async (c) => {
  const session = await requireSession(c);
  if (session instanceof Response) return session;

  const data = await readJsonBody<any>(c);
  const hasSnakeLevel = Object.prototype.hasOwnProperty.call(data, "learning_level");
  const hasCamelLevel = Object.prototype.hasOwnProperty.call(data, "learningLevel");
  if (hasSnakeLevel && !isLearningLevel(data.learning_level)) {
    return c.json({ success: false, error: "Invalid learning level" }, { status: 400 });
  }
  if (hasCamelLevel && !isLearningLevel(data.learningLevel)) {
    return c.json({ success: false, error: "Invalid learning level" }, { status: 400 });
  }
  if (hasSnakeLevel && hasCamelLevel && data.learning_level !== data.learningLevel) {
    return c.json({ success: false, error: "Conflicting learning levels" }, { status: 400 });
  }
  const learningLevel = hasSnakeLevel ? data.learning_level : hasCamelLevel ? data.learningLevel : undefined;
  const config = await getConfig(c.env);
  let pastComments = "";
  for (const slot of data.past_slots ?? []) {
    for (const area of slot.commentByAreas ?? []) {
      if (area.type === "CONTENT" && area.content) pastComments = `Buổi ${slot.index ?? "?"}: ${area.content}`;
    }
  }
  const currentTeacherNote = String(data.teacher_note ?? data.teacherNote ?? "").trim();

  const generated = await generateCommentWithAi(c.env, config, {
    studentName: String(data.student_name || ""),
    studentCallName: String(data.student_call_name ?? data.studentCallName ?? "").trim() || undefined,
    pastComments,
    notes: currentTeacherNote,
    learningLevel: normalizeLearningLevel(learningLevel),
    attendanceStatus: data.attendance_status ?? data.attendanceStatus,
    isLate: typeof data.is_late === "boolean" ? data.is_late : undefined,
    sessionSummary: String(data.session_summary || ""),
    sessionNumber: data.session_number ?? data.sessionNumber ?? data.slot_index ?? data.slotIndex,
    modelId: data.model_id,
    customModelId: data.custom_model_id,
    thinkingLevel: data.thinking_level,
    commentLength: data.comment_length || "medium",
    customPrompt: data.custom_prompt || "",
    aiApiKey: data.ai_api_key || data.api_key || "",
    homeworkStatus: data.homework_status || data.homeworkStatus,
  });
  return c.json({
    comment: generated.comment,
    ...(generated.error ? { success: false, error: generated.error } : {}),
    ...(generated.generationMeta
      ? {
          generation_meta: {
            source: generated.generationMeta.source,
            transport: generated.generationMeta.transport,
            validation_issues: generated.generationMeta.validationIssues,
          },
        }
      : {}),
    ...(generated.directFallback
      ? {
          direct_fallback: {
            messages: generated.directFallback.messages,
            validation_policy: generated.directFallback.validationPolicy,
            safe_comment: generated.directFallback.safeComment,
          },
        }
      : {}),
  });
});

commentsRoutes.post("/generate_checkpoint_comment", async (c) => {
  const session = await requireSession(c);
  if (session instanceof Response) return session;

  const data = await readJsonBody<any>(c);
  const config = await getConfig(c.env);
  const comment = await generateCheckpointCommentWithAi(c.env, config, {
    studentName: String(data.student_name || ""),
    teacherDescription: String(data.teacher_description || ""),
    modelId: data.model_id,
    customModelId: data.custom_model_id,
    thinkingLevel: data.thinking_level,
    aiApiKey: data.ai_api_key || data.api_key || "",
  });
  return c.json({ comment });
});

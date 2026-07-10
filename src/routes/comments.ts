import { Hono } from "hono";
import type { Env } from "../types";
import { appendCommentLog, getCommentHistory } from "../services/commentService";
import { getConfig } from "../services/configService";
import { getNotes } from "../services/notesService";
import { generateCheckpointCommentWithAi, generateCommentWithAi } from "../services/aiClient";
import { readJsonBody } from "./helpers";

export const commentsRoutes = new Hono<{ Bindings: Env }>();

commentsRoutes.post("/log_comment", async (c) => {
  const body = await readJsonBody(c);
  await appendCommentLog(c.env, body);
  return c.json({ success: true, logged: true });
});

commentsRoutes.get("/comment_history", async (c) => {
  const url = new URL(c.req.url);
  const history = await getCommentHistory(c.env, {
    classId: url.searchParams.get("class_id"),
    studentId: url.searchParams.get("student_id"),
  });
  return c.json({ history });
});

commentsRoutes.post("/generate_comment", async (c) => {
  const data = await readJsonBody<any>(c);
  const config = await getConfig(c.env);
  let pastComments = "";
  for (const slot of data.past_slots ?? []) {
    for (const area of slot.commentByAreas ?? []) {
      if (area.type === "CONTENT" && area.content) pastComments += `- Buổi ${slot.index ?? "?"}: ${area.content}\n`;
    }
  }
  const notes = await getNotes(c.env);
  const studentNotes = notes[String(data.student_id || "")] ?? [];
  const noteLines = studentNotes.map((note) => note.note).filter(Boolean);
  const currentTeacherNote = String(data.teacher_note || data.teacherNote || "").trim();
  if (currentTeacherNote && !noteLines.includes(currentTeacherNote)) noteLines.push(currentTeacherNote);
  let notesText = noteLines.join("\n");
  if (data.is_late) notesText = `Học sinh đi học muộn buổi này.\n${notesText}`;

  const comment = await generateCommentWithAi(c.env, config, {
    studentName: String(data.student_name || ""),
    pastComments,
    notes: notesText,
    sessionSummary: String(data.session_summary || ""),
    modelId: data.model_id,
    customModelId: data.custom_model_id,
    thinkingLevel: data.thinking_level,
    commentLength: data.comment_length || "medium",
    customPrompt: data.custom_prompt || "",
    aiApiKey: data.ai_api_key || data.api_key || "",
    homeworkStatus: data.homework_status || data.homeworkStatus,
  });
  return c.json({ comment });
});

commentsRoutes.post("/generate_checkpoint_comment", async (c) => {
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

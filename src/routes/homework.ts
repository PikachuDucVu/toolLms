import { Hono } from "hono";
import type { Env, GradingQueueMessage, HomeworkSubmission } from "../types";
import { getConfig } from "../services/configService";
import { LmsClient } from "../services/lmsClient";
import {
  aiGradeHomework,
  batchMarkHomework,
  cacheAttachment,
  firstGraphqlError,
  getDownloadUrl,
  getHomeworkSubmissions,
  markHomework,
  submissionAttachments,
} from "../services/homeworkService";
import { getCookie, SESSION_COOKIE } from "../services/sessionService";
import { requireSession, readJsonBody, saveUpdatedSession } from "./helpers";

export const homeworkRoutes = new Hono<{ Bindings: Env }>();

homeworkRoutes.get("/homework/download-url", async (c) => {
  const key = new URL(c.req.url).searchParams.get("key") || "";
  try {
    return c.json({ url: await getDownloadUrl(key) });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
});

homeworkRoutes.post("/homework/download-cache", async (c) => {
  const body = await readJsonBody<{ key?: string; submission_id?: string }>(c);
  try {
    const cached = await cacheAttachment(c.env, body.key || "", body.submission_id);
    return c.json({ success: true, ...cached });
  } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
});

homeworkRoutes.post("/homework/mark", async (c) => {
  const session = await requireSession(c);
  if (session instanceof Response) return session;
  const body = await readJsonBody<{ id?: string; score?: string | number; note?: string }>(c);
  if (!body.id || body.score == null) return c.json({ error: "Missing id or score" }, { status: 400 });
  const result = await markHomework(new LmsClient(c.env), session, { id: body.id, score: body.score, note: body.note });
  await saveUpdatedSession(c.env, session, result.session);
  const marked = result.body.data?.studentHomework?.markStudentSubmission;
  if (marked) return c.json({ success: true, result: marked });
  return c.json({ error: firstGraphqlError(result.body) }, { status: 400 });
});

homeworkRoutes.post("/homework/batch-mark", async (c) => {
  const session = await requireSession(c);
  if (session instanceof Response) return session;
  const body = await readJsonBody<{ submissions?: Array<{ id: string; score?: string | number; note?: string }> }>(c);
  const submissions = body.submissions || [];
  if (!submissions.length) return c.json({ error: "No submissions to mark" }, { status: 400 });
  const result = await batchMarkHomework(new LmsClient(c.env), session, submissions);
  await saveUpdatedSession(c.env, session, result.session);
  const successCount = result.results.filter((item) => item.success).length;
  return c.json({ success: true, total: submissions.length, success_count: successCount, results: result.results });
});

homeworkRoutes.post("/homework/ai-grade", async (c) => {
  const body = await readJsonBody<any>(c);
  const config = await getConfig(c.env);
  const result = await aiGradeHomework(c.env, config, {
    attachments: Array.isArray(body.attachments) ? body.attachments : [],
    lessonName: body.lesson_name || "",
    studentName: body.student_name || "",
    modelId: body.model_id || "",
    customModelId: body.custom_model_id || "",
    apiKey: body.api_key || "",
  });
  return c.json(result, { status: result.success ? 200 : 400 });
});

homeworkRoutes.post("/homework/batch-grade", async (c) => {
  const session = await requireSession(c);
  if (session instanceof Response) return session;
  const sessionId = getCookie(c.req.raw, SESSION_COOKIE);
  if (!sessionId) return c.json({ success: false, error: "Missing session" }, { status: 401 });
  const body = await readJsonBody<{
    class_id?: string;
    submissions?: HomeworkSubmission[];
    students?: Record<string, { displayName?: string }>;
    lessons?: Record<string, { name?: string }>;
    model_id?: string;
    custom_model_id?: string;
    api_key?: string;
  }>(c);
  const classId = body.class_id || body.submissions?.[0]?.classId || "";
  const submissions = body.submissions || [];
  if (!classId || !submissions.length) return c.json({ success: false, error: "Missing class_id or submissions" }, { status: 400 });

  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();
  await c.env.DB.prepare(
    "INSERT INTO grading_jobs (id, class_id, status, total_items, completed_items, failed_items, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0, ?, ?)",
  )
    .bind(jobId, classId, "queued", submissions.length, now, now)
    .run();

  for (const submission of submissions) {
    const itemId = crypto.randomUUID();
    await c.env.DB.prepare(
      "INSERT INTO grading_job_items (id, job_id, submission_id, student_uid, lesson_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(itemId, jobId, submission.id, submission.studentUid || "", submission.lessonId || "", "queued", now, now)
      .run();
    const studentName = body.students?.[String(submission.studentUid || "")]?.displayName || "";
    const lessonName = body.lessons?.[String(submission.lessonId || "")]?.name || "";
    const message: GradingQueueMessage = {
      jobId,
      itemId,
      sessionId,
      classId,
      submission,
      studentName,
      lessonName,
      modelId: body.model_id,
      customModelId: body.custom_model_id,
      apiKey: body.api_key,
    };
    await c.env.GRADING_QUEUE.send(message);
  }

  return c.json({ success: true, jobId });
});

homeworkRoutes.get("/homework/jobs/:jobId", async (c) => {
  const jobId = c.req.param("jobId");
  const job = await c.env.DB.prepare("SELECT * FROM grading_jobs WHERE id = ?").bind(jobId).first();
  if (!job) return c.json({ success: false, error: "Job not found" }, { status: 404 });
  const items = await c.env.DB.prepare("SELECT * FROM grading_job_items WHERE job_id = ? ORDER BY created_at ASC").bind(jobId).all();
  return c.json({ success: true, job, items: items.results ?? [] });
});

homeworkRoutes.post("/homework/jobs/:jobId/cancel", async (c) => {
  const now = new Date().toISOString();
  await c.env.DB.prepare("UPDATE grading_jobs SET status = ?, cancelled_at = ?, updated_at = ? WHERE id = ?")
    .bind("cancelled", now, now, c.req.param("jobId"))
    .run();
  return c.json({ success: true });
});

homeworkRoutes.post("/homework/jobs/:jobId/retry-failed", async (c) => {
  const sessionId = getCookie(c.req.raw, SESSION_COOKIE);
  if (!sessionId) return c.json({ success: false, error: "Missing session" }, { status: 401 });
  const jobId = c.req.param("jobId");
  const body = await readJsonBody<{
    submissions?: HomeworkSubmission[];
    students?: Record<string, { displayName?: string }>;
    lessons?: Record<string, { name?: string }>;
    model_id?: string;
    custom_model_id?: string;
    api_key?: string;
  }>(c);
  const submissions = body.submissions || [];
  if (!submissions.length) return c.json({ success: false, error: "Retry requires the original submissions payload" }, { status: 400 });

  const job = await c.env.DB.prepare("SELECT class_id FROM grading_jobs WHERE id = ?").bind(jobId).first<{ class_id: string }>();
  if (!job) return c.json({ success: false, error: "Job not found" }, { status: 404 });
  const failed = await c.env.DB.prepare("SELECT id, submission_id FROM grading_job_items WHERE job_id = ? AND status = 'failed'").bind(jobId).all<{ id: string; submission_id: string }>();
  let queued = 0;
  for (const item of failed.results ?? []) {
    const submission = submissions.find((candidate) => candidate.id === item.submission_id);
    if (!submission) continue;
    await c.env.DB.prepare("UPDATE grading_job_items SET status = ?, error = NULL, updated_at = ? WHERE id = ?")
      .bind("queued", new Date().toISOString(), item.id)
      .run();
    await c.env.GRADING_QUEUE.send({
      jobId,
      itemId: item.id,
      sessionId,
      classId: job.class_id,
      submission,
      studentName: body.students?.[String(submission.studentUid || "")]?.displayName || "",
      lessonName: body.lessons?.[String(submission.lessonId || "")]?.name || "",
      modelId: body.model_id,
      customModelId: body.custom_model_id,
      apiKey: body.api_key,
    });
    queued++;
  }
  await c.env.DB.prepare("UPDATE grading_jobs SET status = ?, cancelled_at = NULL, updated_at = ? WHERE id = ?")
    .bind("running", new Date().toISOString(), jobId)
    .run();
  return c.json({ success: true, queued });
});

homeworkRoutes.get("/homework/:classId", async (c) => {
  const session = await requireSession(c);
  if (session instanceof Response) return session;
  const result = await getHomeworkSubmissions(new LmsClient(c.env), session, c.req.param("classId"));
  await saveUpdatedSession(c.env, session, result.session);
  if (result.body.error) return c.json({ error: result.body.error }, { status: 401 });
  if (result.body.errors?.length) return c.json({ error: result.body.errors[0]?.message || "Unknown error" }, { status: 400 });
  return c.json((result.body.data as any)?.findStudentSubmissionByClass ?? {});
});

export function attachmentsForQueue(submission: HomeworkSubmission): string[] {
  return submissionAttachments(submission);
}

import type { Env, GradingQueueMessage } from "../types";
import { getConfig } from "../services/configService";
import { aiGradeHomework, firstGraphqlError, markHomework, submissionAttachments } from "../services/homeworkService";
import { LmsAuthenticationError, LmsClient } from "../services/lmsClient";
import { destroySessionById, getSessionById, saveSession } from "../services/sessionService";

async function setItemStatus(
  env: Env,
  itemId: string,
  status: string,
  data: { score?: number; note?: string; error?: string; result?: unknown } = {},
): Promise<void> {
  await env.DB.prepare(
    "UPDATE grading_job_items SET status = ?, score = ?, note = ?, error = ?, result_json = ?, updated_at = ? WHERE id = ?",
  )
    .bind(
      status,
      data.score ?? null,
      data.note ?? null,
      data.error ?? null,
      data.result ? JSON.stringify(data.result) : null,
      new Date().toISOString(),
      itemId,
    )
    .run();
}

async function refreshJobCounters(env: Env, jobId: string): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE grading_jobs
     SET completed_items = (SELECT COUNT(*) FROM grading_job_items WHERE job_id = ? AND status = 'completed'),
         failed_items = (SELECT COUNT(*) FROM grading_job_items WHERE job_id = ? AND status = 'failed'),
         status = CASE
           WHEN cancelled_at IS NOT NULL THEN 'cancelled'
           WHEN total_items <= (SELECT COUNT(*) FROM grading_job_items WHERE job_id = ? AND status IN ('completed', 'failed', 'cancelled')) THEN 'completed'
           ELSE 'running'
         END,
         updated_at = ?
     WHERE id = ?`,
  )
    .bind(jobId, jobId, jobId, now, jobId)
    .run();
}

export async function processGradingMessage(env: Env, message: GradingQueueMessage): Promise<void> {
  const job = await env.DB.prepare("SELECT status, cancelled_at FROM grading_jobs WHERE id = ?").bind(message.jobId).first<{ status: string; cancelled_at?: string }>();
  if (!job || job.cancelled_at || job.status === "cancelled") {
    await setItemStatus(env, message.itemId, "cancelled", { error: "Job cancelled" });
    await refreshJobCounters(env, message.jobId);
    return;
  }

  await setItemStatus(env, message.itemId, "processing");
  await env.DB.prepare("UPDATE grading_jobs SET status = ?, updated_at = ? WHERE id = ? AND status = ?")
    .bind("running", new Date().toISOString(), message.jobId, "queued")
    .run();

  const session = await getSessionById(env, message.sessionId);
  if (!session) {
    await setItemStatus(env, message.itemId, "failed", { error: "Session expired" });
    await refreshJobCounters(env, message.jobId);
    return;
  }

  const config = await getConfig(env);
  const grade = await aiGradeHomework(env, config, {
    attachments: submissionAttachments(message.submission),
    lessonName: message.lessonName,
    studentName: message.studentName,
    modelId: message.modelId,
    customModelId: message.customModelId,
    thinkingLevel: message.thinkingLevel,
    apiKey: message.apiKey,
  });
  if (!grade.success) {
    await setItemStatus(env, message.itemId, "failed", { error: grade.error, result: grade.raw ? { raw: grade.raw } : undefined });
    await refreshJobCounters(env, message.jobId);
    return;
  }

  let mark: Awaited<ReturnType<typeof markHomework>>;
  try {
    mark = await markHomework(new LmsClient(env), session, {
      id: message.submission.id,
      score: grade.score,
      note: grade.note,
    });
  } catch (error) {
    if (!(error instanceof LmsAuthenticationError)) throw error;
    await destroySessionById(env, message.sessionId);
    await setItemStatus(env, message.itemId, "failed", {
      score: grade.score,
      note: grade.note,
      error: "Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại rồi chạy lại các bài chưa chấm.",
    });
    await refreshJobCounters(env, message.jobId);
    return;
  }
  await saveSession(env, mark.session);
  const marked = mark.body.data?.studentHomework?.markStudentSubmission;
  if (!marked) {
    await setItemStatus(env, message.itemId, "failed", { score: grade.score, note: grade.note, error: firstGraphqlError(mark.body) });
    await refreshJobCounters(env, message.jobId);
    return;
  }

  await setItemStatus(env, message.itemId, "completed", { score: grade.score, note: grade.note, result: marked });
  await refreshJobCounters(env, message.jobId);
}

export async function processGradingBatch(batch: MessageBatch<GradingQueueMessage>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    await processGradingMessage(env, message.body);
  }
}

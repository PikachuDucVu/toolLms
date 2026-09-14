import { LegacyGradingQueueMessageSchema } from "@tool-lms/contracts";
import type { Env, GradingQueueMessage } from "../types";
import { getConfig } from "../services/configService";
import { aiGradeHomework, firstGraphqlError, markHomework, submissionAttachments } from "../services/homeworkService";
import { LmsAuthenticationError, LmsClient } from "../services/lmsClient";
import { destroySessionById, getSessionById, saveSession } from "../services/sessionService";
import { structuredLog } from "../observability/structuredLogger";

async function setItemStatus(
  env: Env,
  jobId: string,
  itemId: string,
  fromStatus: string,
  status: string,
  data: { score?: number; note?: string; error?: string; result?: unknown } = {},
): Promise<boolean> {
  const result = await env.DB.prepare(
    "UPDATE grading_job_items SET status = ?, score = ?, note = ?, error = ?, result_json = ?, updated_at = ? WHERE id = ? AND status = ?",
  )
    .bind(
      status,
      data.score ?? null,
      data.note ?? null,
      data.error ?? null,
      data.result ? JSON.stringify(data.result) : null,
      new Date().toISOString(),
      itemId,
      fromStatus,
    )
    .run();
  if (!didChange(result)) return false;
  structuredLog("info", { jobId, itemId, fromStatus, toStatus: status, category: "grading_item_transition" });
  return true;
}

async function refreshJobCounters(env: Env, jobId: string, fromStatus = "running"): Promise<void> {
  const now = new Date().toISOString();
  const result = await env.DB.prepare(
    `UPDATE grading_jobs
     SET completed_items = (SELECT COUNT(*) FROM grading_job_items WHERE job_id = ? AND status = 'completed'),
         failed_items = (SELECT COUNT(*) FROM grading_job_items WHERE job_id = ? AND status = 'failed'),
         status = CASE
           WHEN cancelled_at IS NOT NULL THEN 'cancelled'
           WHEN total_items <= (SELECT COUNT(*) FROM grading_job_items WHERE job_id = ? AND status IN ('completed', 'failed', 'cancelled')) THEN 'completed'
           ELSE 'running'
         END,
         updated_at = ?
     WHERE id = ? AND status = ?`,
  )
    .bind(jobId, jobId, jobId, now, jobId, fromStatus)
    .run();
  if (!didChange(result)) return;
  const refreshed = await env.DB.prepare("SELECT status FROM grading_jobs WHERE id = ?").bind(jobId).first<{ status: string }>();
  if (refreshed && refreshed.status !== fromStatus) {
    structuredLog("info", { jobId, fromStatus, toStatus: refreshed.status, category: "grading_job_transition" });
  }
}

export async function processGradingMessage(env: Env, message: GradingQueueMessage): Promise<void> {
  const job = await env.DB.prepare("SELECT status, cancelled_at FROM grading_jobs WHERE id = ?").bind(message.jobId).first<{ status: string; cancelled_at?: string }>();
  if (!job || job.cancelled_at || job.status === "cancelled") {
    await setItemStatus(env, message.jobId, message.itemId, "queued", "cancelled", { error: "Job cancelled" });
    await refreshJobCounters(env, message.jobId, job?.status || "unknown");
    return;
  }

  const claimed = await setItemStatus(env, message.jobId, message.itemId, "queued", "processing");
  if (!claimed) return;
  const jobUpdate = await env.DB.prepare("UPDATE grading_jobs SET status = ?, updated_at = ? WHERE id = ? AND status = ?")
    .bind("running", new Date().toISOString(), message.jobId, "queued")
    .run();
  if (didChange(jobUpdate)) structuredLog("info", { jobId: message.jobId, fromStatus: "queued", toStatus: "running", category: "grading_job_transition" });

  const session = await getSessionById(env, message.sessionId);
  if (!session) {
    await setItemStatus(env, message.jobId, message.itemId, "processing", "failed", { error: "Session expired" });
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
    await setItemStatus(env, message.jobId, message.itemId, "processing", "failed", { error: grade.error, result: grade.raw ? { raw: grade.raw } : undefined });
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
    await setItemStatus(env, message.jobId, message.itemId, "processing", "failed", {
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
    await setItemStatus(env, message.jobId, message.itemId, "processing", "failed", { score: grade.score, note: grade.note, error: firstGraphqlError(mark.body) });
    await refreshJobCounters(env, message.jobId);
    return;
  }

  await setItemStatus(env, message.jobId, message.itemId, "processing", "completed", { score: grade.score, note: grade.note, result: marked });
  await refreshJobCounters(env, message.jobId);
}

export function decodeGradingQueueMessage(value: unknown): GradingQueueMessage {
  const parsed = LegacyGradingQueueMessageSchema.parse(value);
  const rawSubmission = parsed.submission as Record<string, unknown>;
  const rawContent = rawSubmission.content;
  const content = rawContent && typeof rawContent === "object" && !Array.isArray(rawContent)
    ? rawContent as Record<string, unknown>
    : undefined;
  const attachments = Array.isArray(content?.attachments)
    ? content.attachments.filter((attachment): attachment is string => typeof attachment === "string")
    : [];
  return {
    ...parsed,
    submission: {
      ...rawSubmission,
      id: parsed.submission.id,
      ...(content ? { content: { ...content, attachments } } : {}),
    },
    apiKey: parsed.apiKey?.trim() || undefined,
  } as GradingQueueMessage;
}

async function releaseItemForRetry(env: Env, jobId: string, itemId: string): Promise<void> {
  const result = await env.DB.prepare("UPDATE grading_job_items SET status = 'queued', updated_at = ? WHERE id = ? AND status = 'processing'")
    .bind(new Date().toISOString(), itemId).run();
  if (didChange(result)) {
    structuredLog("info", { jobId, itemId, fromStatus: "processing", toStatus: "queued", category: "grading_item_transition" });
  }
}

function didChange(result: D1Result<unknown>): boolean {
  return Number(result.meta?.changes || 0) > 0;
}

export async function processGradingBatch(batch: MessageBatch<GradingQueueMessage>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    let decoded: GradingQueueMessage;
    try {
      decoded = decodeGradingQueueMessage(message.body);
    } catch {
      structuredLog("error", { category: "grading_queue_invalid_message" });
      message.ack();
      continue;
    }

    try {
      await processGradingMessage(env, decoded);
      message.ack();
    } catch {
      try { await releaseItemForRetry(env, decoded.jobId, decoded.itemId); } catch { /* retry even if the database is unavailable */ }
      structuredLog("error", { jobId: decoded.jobId, itemId: decoded.itemId, category: "grading_queue_processing_error" });
      message.retry();
    }
  }
}

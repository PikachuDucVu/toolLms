import type { GradingJob, GradingJobItem, HomeworkLesson, HomeworkStudent } from "@tool-lms/contracts";
import type { Env, GradingQueueMessage, HomeworkSubmission } from "../types";
import { getConfig } from "./configService";
import { resolveHomeworkAiKey } from "./homeworkService";
import { structuredLog } from "../observability/structuredLogger";

export class HomeworkApiKeyRequiredError extends Error {
  readonly code = "API_KEY_REQUIRED";
  constructor(readonly provider: string, readonly modelId: string) {
    super("Cần API key để sử dụng model đã chọn.");
    this.name = "HomeworkApiKeyRequiredError";
  }
}

export class GradingQueueEnqueueError extends Error {
  readonly code = "GRADING_QUEUE_UNAVAILABLE";
  constructor(
    readonly jobId: string,
    readonly enqueuedItems: number,
    readonly totalItems: number,
    options?: ErrorOptions,
  ) {
    super(
      enqueuedItems > 0
        ? `Chỉ đưa được ${enqueuedItems}/${totalItems} bài vào hàng đợi chấm. Các bài còn lại có thể thử lại.`
        : "Không thể đưa bài vào hàng đợi chấm. Các bài vẫn có thể thử lại.",
      options,
    );
    this.name = "GradingQueueEnqueueError";
  }

  get failedItems(): number {
    return this.totalItems - this.enqueuedItems;
  }
}

const ENQUEUE_PENDING_ERROR = "Bài chưa được đưa vào hàng đợi chấm.";
const ENQUEUE_FAILED_ERROR = "Không thể đưa bài vào hàng đợi chấm. Vui lòng thử lại.";

export interface GradingJobPayload {
  classId: string;
  submissions: HomeworkSubmission[];
  students?: Record<string, { displayName?: string }> | HomeworkStudent[];
  lessons?: Record<string, { name?: string }> | HomeworkLesson[];
  modelId?: string;
  customModelId?: string;
  thinkingLevel?: string;
  apiKey?: string;
}

interface CreateOptions {
  ownerEmail?: string;
  enforceApiKey?: boolean;
}

export async function createGradingJob(
  env: Env,
  sessionId: string,
  payload: GradingJobPayload,
  options: CreateOptions = {},
): Promise<GradingJob> {
  const ephemeralApiKey = await requireKeyBeforeSideEffects(env, payload, options.enforceApiKey === true);
  const jobId = crypto.randomUUID();
  const now = new Date().toISOString();
  const items = payload.submissions.map((submission) => ({
    id: crypto.randomUUID(),
    submission,
  }));
  const statements: D1PreparedStatement[] = [];
  if (options.ownerEmail) {
    statements.push(env.DB.prepare(
      "INSERT INTO grading_jobs (id, class_id, status, total_items, completed_items, failed_items, created_at, updated_at, owner_email) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)",
    ).bind(jobId, payload.classId, "queued", items.length, items.length, now, now, options.ownerEmail));
  } else {
    statements.push(env.DB.prepare(
      "INSERT INTO grading_jobs (id, class_id, status, total_items, completed_items, failed_items, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)",
    ).bind(jobId, payload.classId, "queued", items.length, items.length, now, now));
  }
  for (const item of items) {
    statements.push(env.DB.prepare(
      "INSERT INTO grading_job_items (id, job_id, submission_id, student_uid, lesson_id, status, error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'failed', ?, ?, ?)",
    ).bind(item.id, jobId, item.submission.id, item.submission.studentUid || "", item.submission.lessonId || "", ENQUEUE_PENDING_ERROR, now, now));
  }
  await runPrecreation(env, statements);
  structuredLog("info", { jobId, fromStatus: "none", toStatus: "queued", category: "grading_job_transition" });
  for (const item of items) structuredLog("info", { jobId, itemId: item.id, fromStatus: "none", toStatus: "failed", category: "grading_item_transition" });

  let enqueued = 0;
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const claimed = await markItemQueued(env, jobId, item.id);
    if (!claimed) {
      await markPendingItemsEnqueueFailed(env, items.slice(index + 1).map((candidate) => candidate.id));
      await refreshJobCounters(env, jobId, "queued");
      throw new GradingQueueEnqueueError(jobId, enqueued, items.length);
    }
    try {
      await env.GRADING_QUEUE.send(buildQueueMessage(jobId, item.id, sessionId, payload, item.submission, ephemeralApiKey));
      enqueued++;
    } catch (error) {
      await markItemEnqueueFailed(env, jobId, item.id);
      await markPendingItemsEnqueueFailed(env, items.slice(index + 1).map((candidate) => candidate.id));
      await refreshJobCounters(env, jobId, "queued");
      throw new GradingQueueEnqueueError(jobId, enqueued, items.length, { cause: error });
    }
  }
  await syncFailedCounter(env, jobId);

  return {
    id: jobId,
    classId: payload.classId,
    status: "queued",
    totalItems: payload.submissions.length,
    completedItems: 0,
    failedItems: 0,
    createdAt: now,
    updatedAt: now,
    cancelledAt: null,
  };
}

export async function getOwnedGradingJob(env: Env, jobId: string, ownerEmail: string): Promise<{ job: GradingJob; items: GradingJobItem[] } | null> {
  const row = await env.DB.prepare("SELECT * FROM grading_jobs WHERE id = ? AND owner_email = ?").bind(jobId, ownerEmail).first<Record<string, unknown>>();
  if (!row) return null;
  const items = await env.DB.prepare("SELECT * FROM grading_job_items WHERE job_id = ? ORDER BY created_at ASC").bind(jobId).all<Record<string, unknown>>();
  return { job: normalizeJob(row), items: (items.results ?? []).map(normalizeJobItem) };
}

export async function getLegacyGradingJob(env: Env, jobId: string): Promise<{ job: Record<string, unknown>; items: Record<string, unknown>[] } | null> {
  const job = await env.DB.prepare("SELECT * FROM grading_jobs WHERE id = ?").bind(jobId).first<Record<string, unknown>>();
  if (!job) return null;
  const items = await env.DB.prepare("SELECT * FROM grading_job_items WHERE job_id = ? ORDER BY created_at ASC").bind(jobId).all<Record<string, unknown>>();
  return { job, items: items.results ?? [] };
}

export async function cancelOwnedGradingJob(env: Env, jobId: string, ownerEmail: string): Promise<GradingJob | null> {
  const owned = await getOwnedJobRow(env, jobId, ownerEmail);
  if (!owned) return null;
  const now = new Date().toISOString();
  const fromStatus = String(owned.status || "queued");
  const result = await env.DB.prepare("UPDATE grading_jobs SET status = ?, cancelled_at = ?, updated_at = ? WHERE id = ? AND owner_email = ? AND status = ?")
    .bind("cancelled", now, now, jobId, ownerEmail, fromStatus).run();
  if (didChange(result) && fromStatus !== "cancelled") {
    structuredLog("info", { jobId, fromStatus, toStatus: "cancelled", category: "grading_job_transition" });
    return normalizeJob({ ...owned, status: "cancelled", cancelled_at: now, updated_at: now });
  }
  const current = await getOwnedJobRow(env, jobId, ownerEmail);
  return current ? normalizeJob(current) : null;
}

export async function cancelLegacyGradingJob(env: Env, jobId: string): Promise<void> {
  const current = await env.DB.prepare("SELECT status FROM grading_jobs WHERE id = ?").bind(jobId).first<{ status: string }>();
  if (!current) return;
  const now = new Date().toISOString();
  const result = await env.DB.prepare("UPDATE grading_jobs SET status = ?, cancelled_at = ?, updated_at = ? WHERE id = ? AND status = ?")
    .bind("cancelled", now, now, jobId, current.status).run();
  if (didChange(result) && current.status !== "cancelled") {
    structuredLog("info", { jobId, fromStatus: current.status, toStatus: "cancelled", category: "grading_job_transition" });
  }
}

export async function retryOwnedFailedItems(
  env: Env,
  sessionId: string,
  jobId: string,
  ownerEmail: string,
  payload: Omit<GradingJobPayload, "classId">,
): Promise<{ job: GradingJob; queued: number } | null> {
  const owned = await getOwnedJobRow(env, jobId, ownerEmail);
  if (!owned) return null;
  const completePayload: GradingJobPayload = { ...payload, classId: String(owned.class_id || "") };
  const ephemeralApiKey = await requireKeyBeforeSideEffects(env, completePayload, true);
  const failed = await env.DB.prepare("SELECT id, submission_id FROM grading_job_items WHERE job_id = ? AND status = 'failed'")
    .bind(jobId).all<{ id: string; submission_id: string }>();
  const retryable = (failed.results ?? []).flatMap((item) => {
    const submission = payload.submissions.find((candidate) => candidate.id === item.submission_id);
    return submission ? [{ item, submission }] : [];
  });
  let queued = 0;
  for (const candidate of retryable) {
    if (!await markItemQueued(env, jobId, candidate.item.id)) continue;
    try {
      await env.GRADING_QUEUE.send(buildQueueMessage(jobId, candidate.item.id, sessionId, completePayload, candidate.submission, ephemeralApiKey));
      queued++;
    } catch (error) {
      await markItemEnqueueFailed(env, jobId, candidate.item.id);
      await refreshJobCounters(env, jobId, String(owned.status || "completed"));
      throw new GradingQueueEnqueueError(jobId, queued, retryable.length, { cause: error });
    }
  }
  const now = new Date().toISOString();
  const previousStatus = normalizeJob(owned).status;
  const jobUpdate = await env.DB.prepare(
    `UPDATE grading_jobs
     SET completed_items = (SELECT COUNT(*) FROM grading_job_items WHERE job_id = ? AND status = 'completed'),
         failed_items = (SELECT COUNT(*) FROM grading_job_items WHERE job_id = ? AND status = 'failed'),
         status = CASE
           WHEN total_items <= (SELECT COUNT(*) FROM grading_job_items WHERE job_id = ? AND status IN ('completed', 'failed', 'cancelled')) THEN 'completed'
           ELSE 'running'
         END,
         cancelled_at = NULL,
         updated_at = ?
     WHERE id = ? AND owner_email = ? AND status = ?`,
  ).bind(jobId, jobId, jobId, now, jobId, ownerEmail, previousStatus).run();
  const returnedStatus = queued > 0 ? "running" : previousStatus;
  if (didChange(jobUpdate) && queued > 0 && previousStatus !== "running") {
    structuredLog("info", { jobId, fromStatus: normalizeJob(owned).status, toStatus: "running", category: "grading_job_transition" });
  }
  return {
    queued,
    job: normalizeJob({ ...owned, status: returnedStatus, cancelled_at: null, updated_at: now }),
  };
}

export async function retryLegacyFailedItems(
  env: Env,
  sessionId: string,
  jobId: string,
  payload: Omit<GradingJobPayload, "classId">,
): Promise<number | null> {
  const job = await env.DB.prepare("SELECT class_id, status FROM grading_jobs WHERE id = ?").bind(jobId).first<{ class_id: string; status: string }>();
  if (!job) return null;
  const completePayload: GradingJobPayload = { ...payload, classId: job.class_id };
  const failed = await env.DB.prepare("SELECT id, submission_id FROM grading_job_items WHERE job_id = ? AND status = 'failed'")
    .bind(jobId).all<{ id: string; submission_id: string }>();
  const retryable = (failed.results ?? []).flatMap((item) => {
    const submission = payload.submissions.find((candidate) => candidate.id === item.submission_id);
    return submission ? [{ item, submission }] : [];
  });
  let queued = 0;
  for (const candidate of retryable) {
    if (!await markItemQueued(env, jobId, candidate.item.id)) continue;
    try {
      await env.GRADING_QUEUE.send(buildQueueMessage(jobId, candidate.item.id, sessionId, completePayload, candidate.submission, payload.apiKey?.trim() || undefined));
      queued++;
    } catch (error) {
      await markItemEnqueueFailed(env, jobId, candidate.item.id);
      await refreshJobCounters(env, jobId, job.status);
      throw new GradingQueueEnqueueError(jobId, queued, retryable.length, { cause: error });
    }
  }
  if (queued > 0) {
    const jobUpdate = await env.DB.prepare(
      `UPDATE grading_jobs
       SET completed_items = (SELECT COUNT(*) FROM grading_job_items WHERE job_id = ? AND status = 'completed'),
           failed_items = (SELECT COUNT(*) FROM grading_job_items WHERE job_id = ? AND status = 'failed'),
           status = CASE
             WHEN total_items <= (SELECT COUNT(*) FROM grading_job_items WHERE job_id = ? AND status IN ('completed', 'failed', 'cancelled')) THEN 'completed'
             ELSE 'running'
           END,
           cancelled_at = NULL,
           updated_at = ?
       WHERE id = ? AND status = ?`,
    ).bind(jobId, jobId, jobId, new Date().toISOString(), jobId, job.status).run();
    if (didChange(jobUpdate) && job.status !== "running") structuredLog("info", { jobId, fromStatus: job.status, toStatus: "running", category: "grading_job_transition" });
  }
  return queued;
}

async function runPrecreation(env: Env, statements: D1PreparedStatement[]): Promise<void> {
  if (typeof env.DB.batch === "function") {
    await env.DB.batch(statements);
    return;
  }
  for (const statement of statements) await statement.run();
}

async function markItemQueued(env: Env, jobId: string, itemId: string): Promise<boolean> {
  const result = await env.DB.prepare("UPDATE grading_job_items SET status = 'queued', error = NULL, updated_at = ? WHERE id = ? AND status = 'failed'")
    .bind(new Date().toISOString(), itemId).run();
  if (!didChange(result)) return false;
  structuredLog("info", { jobId, itemId, fromStatus: "failed", toStatus: "queued", category: "grading_item_transition" });
  return true;
}

async function markItemEnqueueFailed(env: Env, jobId: string, itemId: string): Promise<boolean> {
  const result = await env.DB.prepare("UPDATE grading_job_items SET status = 'failed', error = ?, updated_at = ? WHERE id = ? AND status = 'queued'")
    .bind(ENQUEUE_FAILED_ERROR, new Date().toISOString(), itemId).run();
  if (!didChange(result)) return false;
  structuredLog("info", { jobId, itemId, fromStatus: "queued", toStatus: "failed", category: "grading_item_transition" });
  return true;
}

async function markPendingItemsEnqueueFailed(env: Env, itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  const placeholders = itemIds.map(() => "?").join(", ");
  await env.DB.prepare(`UPDATE grading_job_items SET error = ?, updated_at = ? WHERE status = 'failed' AND error = ? AND id IN (${placeholders})`)
    .bind(ENQUEUE_FAILED_ERROR, new Date().toISOString(), ENQUEUE_PENDING_ERROR, ...itemIds).run();
}

async function syncFailedCounter(env: Env, jobId: string): Promise<void> {
  await env.DB.prepare(
    "UPDATE grading_jobs SET failed_items = (SELECT COUNT(*) FROM grading_job_items WHERE job_id = ? AND status = 'failed') WHERE id = ?",
  ).bind(jobId, jobId).run();
}

async function refreshJobCounters(env: Env, jobId: string, expectedStatus: string): Promise<void> {
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
  ).bind(jobId, jobId, jobId, now, jobId, expectedStatus).run();
  if (!didChange(result)) return;
  const refreshed = await env.DB.prepare("SELECT status FROM grading_jobs WHERE id = ?").bind(jobId).first<{ status: string }>();
  if (refreshed && refreshed.status !== expectedStatus) {
    structuredLog("info", { jobId, fromStatus: expectedStatus, toStatus: refreshed.status, category: "grading_job_transition" });
  }
}

function didChange(result: D1Result<unknown>): boolean {
  return Number(result.meta?.changes || 0) > 0;
}

async function requireKeyBeforeSideEffects(env: Env, payload: GradingJobPayload, enforce: boolean): Promise<string | undefined> {
  const ephemeralApiKey = payload.apiKey?.trim() || undefined;
  if (!enforce) return ephemeralApiKey;
  const config = await getConfig(env);
  const availability = resolveHomeworkAiKey(env, config, payload);
  if (!availability.available) throw new HomeworkApiKeyRequiredError(availability.provider, availability.modelId);
  return availability.ephemeralApiKey;
}

function buildQueueMessage(
  jobId: string,
  itemId: string,
  sessionId: string,
  payload: GradingJobPayload,
  submission: HomeworkSubmission,
  ephemeralApiKey?: string,
): GradingQueueMessage {
  return {
    version: 1,
    jobId,
    itemId,
    sessionId,
    classId: payload.classId,
    submission,
    studentName: studentName(payload.students, submission.studentUid || ""),
    lessonName: lessonName(payload.lessons, submission.lessonId || ""),
    modelId: payload.modelId,
    customModelId: payload.customModelId,
    thinkingLevel: payload.thinkingLevel,
    apiKey: ephemeralApiKey,
  };
}

function studentName(source: GradingJobPayload["students"], uid: string): string {
  if (Array.isArray(source)) return source.find((student) => student.studentUid === uid)?.displayName || "";
  return source?.[uid]?.displayName || "";
}

function lessonName(source: GradingJobPayload["lessons"], id: string): string {
  if (Array.isArray(source)) return source.find((lesson) => lesson.id === id)?.name || "";
  return source?.[id]?.name || "";
}

async function getOwnedJobRow(env: Env, jobId: string, ownerEmail: string): Promise<Record<string, unknown> | null> {
  return env.DB.prepare("SELECT * FROM grading_jobs WHERE id = ? AND owner_email = ?").bind(jobId, ownerEmail).first<Record<string, unknown>>();
}

function normalizeJob(row: Record<string, unknown>): GradingJob {
  const status = row.status === "running" || row.status === "completed" || row.status === "cancelled" ? row.status : "queued";
  return {
    id: String(row.id || ""),
    classId: String(row.class_id || ""),
    status,
    totalItems: nonnegativeInteger(row.total_items),
    completedItems: nonnegativeInteger(row.completed_items),
    failedItems: nonnegativeInteger(row.failed_items),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
    cancelledAt: row.cancelled_at ? String(row.cancelled_at) : null,
  };
}

function normalizeJobItem(row: Record<string, unknown>): GradingJobItem {
  const allowed = new Set(["queued", "processing", "completed", "failed", "cancelled"]);
  const status = String(row.status || "queued") as GradingJobItem["status"];
  return {
    id: String(row.id || ""),
    submissionId: String(row.submission_id || ""),
    studentUid: String(row.student_uid || ""),
    lessonId: String(row.lesson_id || ""),
    status: allowed.has(status) ? status : "queued",
    score: finiteNumber(row.score),
    note: row.note == null ? null : String(row.note),
    error: row.error == null ? null : String(row.error),
    result: parseResult(row.result_json),
    createdAt: String(row.created_at || ""),
    updatedAt: String(row.updated_at || ""),
  };
}

function nonnegativeInteger(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.trunc(number)) : 0;
}

function finiteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseResult(value: unknown): unknown | null {
  if (typeof value !== "string" || !value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

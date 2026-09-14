import { Hono, type Context } from "hono";
import {
  EntityIdSchema,
  GradingJobCreateRequestSchema,
  GradingJobRetryRequestSchema,
  HomeworkAiGradeRequestSchema,
  HomeworkAttachmentRequestSchema,
  HomeworkBatchMarkRequestSchema,
  HomeworkMarkRequestSchema,
} from "@tool-lms/contracts";
import type { Env, SessionRecord } from "../../types";
import type { RequestContextVariables } from "../../middleware/requestContext";
import { getConfig } from "../../services/configService";
import {
  cancelOwnedGradingJob,
  createGradingJob,
  getOwnedGradingJob,
  GradingQueueEnqueueError,
  HomeworkApiKeyRequiredError,
  retryOwnedFailedItems,
} from "../../services/gradingJobService";
import {
  aiGradeHomework,
  assertAttachmentBelongsToSubmission,
  batchMarkHomework,
  cacheAttachment,
  findHomeworkSubmission,
  firstGraphqlError,
  getDownloadUrl,
  getHomeworkSubmissions,
  markHomework,
  normalizeHomeworkData,
  normalizeMarkedSubmission,
  resolveHomeworkAiKey,
  type NormalizedHomeworkData,
} from "../../services/homeworkService";
import { LmsClient } from "../../services/lmsClient";
import { getCookie, saveSession, SESSION_COOKIE } from "../../services/sessionService";
import { parseV2Json, requireV2Session, v2Error, v2Success } from "./helpers";

interface V2Bindings { Bindings: Env; Variables: RequestContextVariables }
type V2Context = Context<V2Bindings>;

export const v2HomeworkRoutes = new Hono<V2Bindings>();
export const v2ClassHomeworkRoutes = new Hono<V2Bindings>();

v2ClassHomeworkRoutes.get("/:classId/homework", async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;
  const classId = pathId(c, "classId");
  if (classId instanceof Response) return classId;
  const loaded = await loadHomework(c, session, classId);
  if (loaded instanceof Response) return loaded;
  return v2Success(c, { classId, ...loaded });
});

v2HomeworkRoutes.get("/download-url", async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;
  const search = new URL(c.req.url).searchParams;
  const parsed = HomeworkAttachmentRequestSchema.safeParse({
    classId: search.get("classId"),
    submissionId: search.get("submissionId"),
    key: search.get("key"),
  });
  if (!parsed.success) return v2Error(c, "VALIDATION_ERROR", "Thông tin tệp đính kèm không hợp lệ.", 422, parsed.error.flatten());
  const loaded = await loadHomework(c, session, parsed.data.classId);
  if (loaded instanceof Response) return loaded;
  if (!assertAttachmentBelongsToSubmission(loaded, parsed.data.submissionId, parsed.data.key)) {
    return v2Error(c, "NOT_FOUND", "Không tìm thấy tệp đính kèm.", 404);
  }
  try {
    return v2Success(c, { url: await getDownloadUrl(parsed.data.key) });
  } catch {
    return v2Error(c, "UPSTREAM_ERROR", "Không thể tạo đường dẫn tải tệp.", 502);
  }
});

v2HomeworkRoutes.post("/download-cache", async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;
  const body = await parseV2Json(c, HomeworkAttachmentRequestSchema);
  if (body instanceof Response) return body;
  const loaded = await loadHomework(c, session, body.classId);
  if (loaded instanceof Response) return loaded;
  if (!assertAttachmentBelongsToSubmission(loaded, body.submissionId, body.key)) {
    return v2Error(c, "NOT_FOUND", "Không tìm thấy tệp đính kèm.", 404);
  }
  try {
    const cached = await cacheAttachment(c.env, body.key, body.submissionId);
    return v2Success(c, {
      r2Key: cached.r2Key,
      size: cached.size ?? null,
      contentType: cached.contentType ?? null,
    }, 201);
  } catch {
    return v2Error(c, "UPSTREAM_ERROR", "Không thể lưu tệp đính kèm vào bộ nhớ đệm.", 502);
  }
});

v2HomeworkRoutes.post("/mark", async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;
  const body = await parseV2Json(c, HomeworkMarkRequestSchema);
  if (body instanceof Response) return body;
  const loaded = await loadHomework(c, session, body.classId);
  if (loaded instanceof Response) return loaded;
  if (!findHomeworkSubmission(loaded, body.id)) return v2Error(c, "NOT_FOUND", "Không tìm thấy bài nộp.", 404);
  const result = await markHomework(new LmsClient(c.env), session, body);
  await saveSession(c.env, result.session);
  const marked = normalizeMarkedSubmission(result.body.data?.studentHomework?.markStudentSubmission);
  if (!marked) return v2Error(c, "UPSTREAM_ERROR", firstGraphqlError(result.body), 502);
  return v2Success(c, { submission: marked });
});

v2HomeworkRoutes.post("/batch-mark", async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;
  const body = await parseV2Json(c, HomeworkBatchMarkRequestSchema);
  if (body instanceof Response) return body;
  const loaded = await loadHomework(c, session, body.classId);
  if (loaded instanceof Response) return loaded;
  const authorized = body.submissions.filter((item) => findHomeworkSubmission(loaded, item.id));
  const marked = authorized.length
    ? await batchMarkHomework(new LmsClient(c.env), session, authorized)
    : { session, results: [] };
  await saveSession(c.env, marked.session);
  const resultById = new Map(marked.results.map((result) => [result.id, result]));
  const results = body.submissions.map((item) => {
    if (!findHomeworkSubmission(loaded, item.id)) return { id: item.id, success: false as const, error: "Không tìm thấy bài nộp." };
    const result = resultById.get(item.id);
    const submission = normalizeMarkedSubmission(result?.result);
    return result?.success && submission
      ? { id: item.id, success: true as const, submission }
      : { id: item.id, success: false as const, error: result?.error || "Không thể chấm bài." };
  });
  const successCount = results.filter((item) => item.success).length;
  return v2Success(c, { total: results.length, successCount, failureCount: results.length - successCount, results });
});

v2HomeworkRoutes.post("/ai-grade", async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;
  const body = await parseV2Json(c, HomeworkAiGradeRequestSchema);
  if (body instanceof Response) return body;
  const config = await getConfig(c.env);
  const availability = resolveHomeworkAiKey(c.env, config, body);
  if (!availability.available) return apiKeyRequired(c, availability.provider, availability.modelId);
  const loaded = await loadHomework(c, session, body.classId);
  if (loaded instanceof Response) return loaded;
  const submission = findHomeworkSubmission(loaded, body.submissionId);
  if (!submission) return v2Error(c, "NOT_FOUND", "Không tìm thấy bài nộp.", 404);
  const result = await aiGradeHomework(c.env, config, {
    attachments: submission.content.attachments,
    lessonName: body.lessonName,
    studentName: body.studentName,
    modelId: body.modelId,
    customModelId: body.customModelId,
    thinkingLevel: body.thinkingLevel,
    apiKey: availability.ephemeralApiKey,
  });
  if (!result.success) return v2Error(c, "UPSTREAM_ERROR", result.error, 502);
  return v2Success(c, { score: result.score, note: result.note });
});

v2HomeworkRoutes.post("/jobs", async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;
  const body = await parseV2Json(c, GradingJobCreateRequestSchema);
  if (body instanceof Response) return body;
  const keyError = await validateJobKey(c, body);
  if (keyError) return keyError;
  const loaded = await loadHomework(c, session, body.classId);
  if (loaded instanceof Response) return loaded;
  const submissions = canonicalSubmissions(loaded, body.submissions.map((item) => item.id));
  if (!submissions) return v2Error(c, "NOT_FOUND", "Một hoặc nhiều bài nộp không còn tồn tại.", 404);
  const sessionId = getCookie(c.req.raw, SESSION_COOKIE);
  if (!sessionId) return v2Error(c, "AUTH_REQUIRED", "Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.", 401);
  try {
    const job = await createGradingJob(c.env, sessionId, { ...body, submissions }, { ownerEmail: session.email, enforceApiKey: true });
    return v2Success(c, { job }, 201);
  } catch (error) {
    if (error instanceof HomeworkApiKeyRequiredError) return apiKeyRequired(c, error.provider, error.modelId);
    if (error instanceof GradingQueueEnqueueError) return gradingQueueUnavailable(c, error);
    throw error;
  }
});

v2HomeworkRoutes.get("/jobs/:jobId", async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;
  const jobId = pathId(c, "jobId");
  if (jobId instanceof Response) return jobId;
  const result = await getOwnedGradingJob(c.env, jobId, session.email);
  if (!result) return v2Error(c, "NOT_FOUND", "Không tìm thấy job chấm bài.", 404);
  return v2Success(c, result);
});

v2HomeworkRoutes.post("/jobs/:jobId/cancel", async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;
  const jobId = pathId(c, "jobId");
  if (jobId instanceof Response) return jobId;
  const job = await cancelOwnedGradingJob(c.env, jobId, session.email);
  if (!job) return v2Error(c, "NOT_FOUND", "Không tìm thấy job chấm bài.", 404);
  return v2Success(c, { job });
});

v2HomeworkRoutes.post("/jobs/:jobId/retry-failed", async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;
  const jobId = pathId(c, "jobId");
  if (jobId instanceof Response) return jobId;
  const body = await parseV2Json(c, GradingJobRetryRequestSchema);
  if (body instanceof Response) return body;
  const owned = await getOwnedGradingJob(c.env, jobId, session.email);
  if (!owned) return v2Error(c, "NOT_FOUND", "Không tìm thấy job chấm bài.", 404);
  const keyError = await validateJobKey(c, body);
  if (keyError) return keyError;
  const loaded = await loadHomework(c, session, owned.job.classId);
  if (loaded instanceof Response) return loaded;
  const submissions = canonicalSubmissions(loaded, body.submissions.map((item) => item.id));
  if (!submissions) return v2Error(c, "NOT_FOUND", "Một hoặc nhiều bài nộp không còn tồn tại.", 404);
  const sessionId = getCookie(c.req.raw, SESSION_COOKIE);
  if (!sessionId) return v2Error(c, "AUTH_REQUIRED", "Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.", 401);
  try {
    const result = await retryOwnedFailedItems(c.env, sessionId, jobId, session.email, { ...body, submissions });
    if (!result) return v2Error(c, "NOT_FOUND", "Không tìm thấy job chấm bài.", 404);
    return v2Success(c, result);
  } catch (error) {
    if (error instanceof HomeworkApiKeyRequiredError) return apiKeyRequired(c, error.provider, error.modelId);
    if (error instanceof GradingQueueEnqueueError) return gradingQueueUnavailable(c, error);
    throw error;
  }
});

async function loadHomework(c: V2Context, session: SessionRecord, classId: string): Promise<NormalizedHomeworkData | Response> {
  const result = await getHomeworkSubmissions(new LmsClient(c.env), session, classId);
  await saveSession(c.env, result.session);
  if (result.body.error || result.body.errors?.length) {
    return v2Error(c, "UPSTREAM_ERROR", result.body.errors?.[0]?.message || result.body.error || "Không thể tải bài tập.", 502);
  }
  return normalizeHomeworkData(result.body.data?.findStudentSubmissionByClass);
}

async function validateJobKey(c: V2Context, input: { modelId?: string; customModelId?: string; apiKey?: string }): Promise<Response | null> {
  const availability = resolveHomeworkAiKey(c.env, await getConfig(c.env), input);
  return availability.available ? null : apiKeyRequired(c, availability.provider, availability.modelId);
}

function apiKeyRequired(c: V2Context, provider: string, modelId: string): Response {
  return v2Error(c, "API_KEY_REQUIRED", "Cần API key để sử dụng model đã chọn.", 422, { provider, modelId });
}

function gradingQueueUnavailable(c: V2Context, error: GradingQueueEnqueueError): Response {
  return v2Error(c, "UPSTREAM_ERROR", error.message, 502, {
    reason: error.code,
    jobId: error.jobId,
    enqueuedItems: error.enqueuedItems,
    failedItems: error.failedItems,
    totalItems: error.totalItems,
  });
}

function pathId(c: V2Context, name: string): string | Response {
  const parsed = EntityIdSchema.safeParse(c.req.param(name));
  return parsed.success ? parsed.data : v2Error(c, "VALIDATION_ERROR", "Định danh không hợp lệ.", 422, parsed.error.flatten());
}

function canonicalSubmissions(data: NormalizedHomeworkData, ids: string[]) {
  const submissions = ids.map((id) => findHomeworkSubmission(data, id));
  return submissions.some((item) => !item) ? null : submissions.filter((item): item is NonNullable<typeof item> => Boolean(item));
}

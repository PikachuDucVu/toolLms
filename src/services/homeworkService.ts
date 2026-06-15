import { FIND_SUBMISSIONS_QUERY, MARK_SUBMISSION_QUERY } from "../constants/lmsQueries";
import type { AppConfig, Env, HomeworkSubmission, LmsGraphqlResponse, SessionRecord } from "../types";
import { gradeHomeworkWithAi } from "./aiClient";
import { LmsClient, type LmsCallResult } from "./lmsClient";

const PRESIGNED_URL_API = "https://resources.mindx.edu.vn/api/v1/get-presigned-url";
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);

export function validateFileKey(fileKey: string): void {
  if (!fileKey || fileKey.length > 2048) throw new Error("Missing file key");
  if (/^https?:\/\//i.test(fileKey) || fileKey.includes("..")) throw new Error("Invalid file key");
}

function extensionOf(fileKey: string): string {
  const filename = fileKey.split("/").at(-1) || fileKey;
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

export async function getDownloadUrl(fileKey: string): Promise<string> {
  validateFileKey(fileKey);
  const response = await fetch(`${PRESIGNED_URL_API}?key=${encodeURIComponent(fileKey)}`);
  if (!response.ok) throw new Error("Failed to get download URL");
  const data = await response.json<{ success?: boolean; url?: string }>();
  if (!data.success || !data.url) throw new Error("Failed to get download URL");
  return data.url;
}

export async function cacheAttachment(env: Env, fileKey: string, submissionId?: string): Promise<{ r2Key: string; size?: number; contentType?: string }> {
  const url = await getDownloadUrl(fileKey);
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error("Download failed");
  const filename = fileKey.split("/").at(-1) || "attachment";
  const r2Key = `homework/${submissionId || "unknown"}/${crypto.randomUUID()}-${filename}`;
  await env.ATTACHMENTS.put(r2Key, response.body, {
    httpMetadata: { contentType: response.headers.get("Content-Type") || undefined },
  });
  const now = new Date().toISOString();
  const sizeHeader = response.headers.get("Content-Length");
  const size = sizeHeader ? Number(sizeHeader) : undefined;
  const contentType = response.headers.get("Content-Type") || undefined;
  await env.DB.prepare(
    "INSERT INTO attachment_cache (id, submission_id, file_key, r2_key, content_type, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(crypto.randomUUID(), submissionId || "", fileKey, r2Key, contentType || "", size ?? null, now)
    .run();
  return { r2Key, size, contentType };
}

export async function getHomeworkSubmissions(
  client: LmsClient,
  session: SessionRecord,
  classId: string,
): Promise<LmsCallResult<{ findStudentSubmissionByClass: unknown }>> {
  return client.callApi(session, "FindStudentSubmissionByClass", FIND_SUBMISSIONS_QUERY, { payload: { classId } });
}

export async function markHomework(
  client: LmsClient,
  session: SessionRecord,
  input: { id: string; score: string | number; note?: string },
): Promise<LmsCallResult<{ studentHomework: { markStudentSubmission: unknown } }>> {
  const payload: Record<string, string> = { id: input.id, score: String(input.score) };
  if (input.note) payload.note = input.note;
  return client.callApi(session, "MarkStudentSubmission", MARK_SUBMISSION_QUERY, { payload });
}

export async function batchMarkHomework(
  client: LmsClient,
  session: SessionRecord,
  submissions: Array<{ id: string; score?: string | number; note?: string }>,
): Promise<{ session: SessionRecord; results: Array<{ id: string; success: boolean; result?: unknown; error?: string }> }> {
  let activeSession = session;
  const results: Array<{ id: string; success: boolean; result?: unknown; error?: string }> = [];
  for (const submission of submissions) {
    const result = await markHomework(client, activeSession, { id: submission.id, score: submission.score ?? 100, note: submission.note });
    activeSession = result.session;
    const marked = result.body.data?.studentHomework?.markStudentSubmission;
    if (marked) results.push({ id: submission.id, success: true, result: marked });
    else results.push({ id: submission.id, success: false, error: result.body.errors?.[0]?.message || result.body.error || "Unknown error" });
  }
  return { session: activeSession, results };
}

export async function aiGradeHomework(
  env: Env,
  config: AppConfig,
  input: {
    attachments: string[];
    lessonName: string;
    studentName: string;
    modelId?: string;
    customModelId?: string;
    apiKey?: string;
  },
): Promise<{ success: true; score: number; note: string } | { success: false; error: string; raw?: string }> {
  if (!input.attachments.length) return { success: false, error: "Không có tệp đính kèm để chấm" };
  const imageUrls: string[] = [];
  for (const attachment of input.attachments) {
    if (!IMAGE_EXTENSIONS.has(extensionOf(attachment))) continue;
    try {
      imageUrls.push(await getDownloadUrl(attachment));
    } catch {
      continue;
    }
  }
  if (!imageUrls.length) return { success: false, error: "Hiện chỉ hỗ trợ chấm AI từ file ảnh" };
  return gradeHomeworkWithAi(env, config, { ...input, imageUrls });
}

export function firstGraphqlError(body: LmsGraphqlResponse): string {
  return body.errors?.[0]?.message || body.error || "Unknown error";
}

export function submissionAttachments(submission: HomeworkSubmission): string[] {
  return Array.isArray(submission.content?.attachments) ? submission.content.attachments : [];
}

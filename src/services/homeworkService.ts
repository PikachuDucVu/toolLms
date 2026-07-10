import { unzipSync } from "fflate";
import { FIND_SUBMISSIONS_QUERY, MARK_SUBMISSION_QUERY } from "../constants/lmsQueries";
import type { AppConfig, Env, HomeworkSubmission, LmsGraphqlResponse, SessionRecord } from "../types";
import { gradeHomeworkWithAi } from "./aiClient";
import { LmsClient, type LmsCallResult } from "./lmsClient";

const PRESIGNED_URL_API = "https://resources.mindx.edu.vn/api/v1/get-presigned-url";
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);
const TEXT_EXTENSIONS = new Set([
  ".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".ts", ".jsx", ".tsx",
  ".py", ".json", ".txt", ".md", ".xml", ".csv", ".yml", ".yaml", ".sql",
  ".java", ".c", ".cpp", ".cs", ".php", ".rb", ".go",
]);
// Archives we can crack open to read text/code inside (GameMaker export, plain zip)
const ARCHIVE_EXTENSIONS = new Set([".yyz", ".zip"]);
// Text-ish files worth extracting from inside an archive. Note: GameMaker .yy files are pure
// resource metadata (GUIDs, sprite layer coords) — huge and useless for grading, so we skip them
// and keep only real code (.gml) plus the project manifest (.yyp).
const ARCHIVE_TEXT_EXTENSIONS = new Set([...TEXT_EXTENSIONS, ".gml", ".yyp", ".shader", ".vsh", ".fsh"]);
// Rank inner files so code survives the budget before lower-value manifests.
const ARCHIVE_EXT_PRIORITY = new Map<string, number>([
  [".gml", 0],
  [".yyp", 2],
]);
const MAX_TEXT_FILE_CHARS = 40000;
// Guard against a huge project dumping thousands of tiny resource files into the prompt
const MAX_ARCHIVE_FILES = 40;
// Total chars an archive may contribute to the prompt. GameMaker code is tiny (~500 chars);
// keeping this small stops the self-hosted AI from timing out (Cloudflare 522) on bloated prompts.
const MAX_ARCHIVE_TOTAL_CHARS = 15000;
// Skip archives too large to unzip in a Worker without blowing memory/CPU
const MAX_ARCHIVE_BYTES = 15 * 1024 * 1024;

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

export async function getTextFileContent(fileKey: string): Promise<string> {
  const url = await getDownloadUrl(fileKey);
  const response = await fetch(url);
  if (!response.ok) throw new Error("Download failed");
  const text = await response.text();
  return text.length > MAX_TEXT_FILE_CHARS ? `${text.slice(0, MAX_TEXT_FILE_CHARS)}\n... (nội dung bị cắt bớt)` : text;
}

function innerExtensionOf(path: string): string {
  const filename = path.split("/").at(-1) || path;
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

// Download an archive (.yyz/.zip) and extract the text/code files inside as prompt-ready entries.
export async function extractArchiveTextFiles(fileKey: string): Promise<Array<{ name: string; content: string }>> {
  const url = await getDownloadUrl(fileKey);
  const response = await fetch(url);
  if (!response.ok) throw new Error("Download failed");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) throw new Error("Archive too large");
  const entries = unzipSync(bytes, {
    filter: (file) => ARCHIVE_TEXT_EXTENSIONS.has(innerExtensionOf(file.name)) && !file.name.endsWith("/"),
  });
  const decoder = new TextDecoder();
  const priority = (path: string) => ARCHIVE_EXT_PRIORITY.get(innerExtensionOf(path)) ?? 1;
  const paths = Object.keys(entries)
    // Code (.gml) first, then generic text, then the .yyp manifest last
    .sort((a, b) => priority(a) - priority(b))
    .slice(0, MAX_ARCHIVE_FILES);

  const archiveName = fileKey.split("/").at(-1) || "archive";
  let budget = MAX_ARCHIVE_TOTAL_CHARS;
  const files: Array<{ name: string; content: string }> = [];
  for (const path of paths) {
    if (budget <= 0) break;
    let content = decoder.decode(entries[path]);
    if (content.length > budget) content = `${content.slice(0, budget)}\n... (nội dung bị cắt bớt)`;
    budget -= content.length;
    files.push({ name: `${archiveName}:${path}`, content });
  }
  return files;
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
    thinkingLevel?: string;
    apiKey?: string;
  },
): Promise<{ success: true; score: number; note: string } | { success: false; error: string; raw?: string }> {
  if (!input.attachments.length) return { success: false, error: "Không có tệp đính kèm để chấm" };
  const imageUrls: string[] = [];
  const textFiles: Array<{ name: string; content: string }> = [];
  const otherFiles: string[] = [];
  for (const attachment of input.attachments) {
    const ext = extensionOf(attachment);
    const name = attachment.split("/").at(-1) || attachment;
    if (IMAGE_EXTENSIONS.has(ext)) {
      try {
        imageUrls.push(await getDownloadUrl(attachment));
      } catch {
        continue;
      }
    } else if (TEXT_EXTENSIONS.has(ext)) {
      try {
        textFiles.push({ name, content: await getTextFileContent(attachment) });
      } catch {
        otherFiles.push(name);
      }
    } else if (ARCHIVE_EXTENSIONS.has(ext)) {
      try {
        const extracted = await extractArchiveTextFiles(attachment);
        if (extracted.length) textFiles.push(...extracted);
        else otherFiles.push(name);
      } catch {
        otherFiles.push(name);
      }
    } else {
      otherFiles.push(name);
    }
  }
  if (!imageUrls.length && !textFiles.length) {
    return { success: false, error: "Không có nội dung chấm được (chỉ hỗ trợ file ảnh và file code/văn bản)" };
  }
  return gradeHomeworkWithAi(env, config, { ...input, imageUrls, textFiles, otherFiles });
}

export function firstGraphqlError(body: LmsGraphqlResponse): string {
  return body.errors?.[0]?.message || body.error || "Unknown error";
}

export function submissionAttachments(submission: HomeworkSubmission): string[] {
  return Array.isArray(submission.content?.attachments) ? submission.content.attachments : [];
}

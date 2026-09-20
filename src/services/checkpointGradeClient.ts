import {
  CheckpointGradePayloadSchema,
  type CheckpointBranch,
  type CheckpointGradePayload,
  type CheckpointNumber,
} from "@tool-lms/contracts";
import type { Env } from "../types";
import { kiemtraAuthHeaders, kiemtraBaseUrl } from "./kiemtraConfig";

export class CheckpointGradeTimeoutError extends Error {}
export class CheckpointGradeUpstreamError extends Error {}
export class CheckpointGradeMalformedError extends Error {}
export class CheckpointGradeNotFoundError extends Error {}

const GRADE_PAYLOAD_TIMEOUT_MS = 12_000;
const PDF_TIMEOUT_MS = 20_000;

export async function fetchCheckpointGradePayload(
  env: Env,
  input: { classId: string; checkpoint: CheckpointNumber; studentId?: string },
  fetcher: typeof fetch = fetch,
  timeoutMs = GRADE_PAYLOAD_TIMEOUT_MS,
): Promise<CheckpointGradePayload> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const params = new URLSearchParams({ classId: input.classId, checkpoint: String(input.checkpoint) });
  if (input.studentId) params.set("studentId", input.studentId);
  const url = `${kiemtraBaseUrl(env)}/api/public/checkpoint-grade-payload?${params.toString()}`;
  try {
    let response: Response;
    try {
      response = await fetcher(url, { headers: kiemtraAuthHeaders(env), signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        throw new CheckpointGradeTimeoutError("Dịch vụ bài kiểm tra phản hồi quá thời gian.");
      }
      throw new CheckpointGradeUpstreamError("Không thể kết nối dịch vụ bài kiểm tra.");
    }
    if (response.status === 401) throw new CheckpointGradeUpstreamError("Không có quyền đọc bài kiểm tra từ kiemtra.");
    if (response.status === 404) throw new CheckpointGradeNotFoundError("Không tìm thấy bài kiểm tra trên kiemtra. Cần deploy API chấm điểm.");
    if (!response.ok) throw new CheckpointGradeUpstreamError(`Dịch vụ bài kiểm tra trả về HTTP ${response.status}.`);
    const contentType = response.headers.get("content-type") || "";
    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new CheckpointGradeMalformedError(
        contentType.includes("json")
          ? "Phản hồi bài kiểm tra không phải JSON hợp lệ."
          : "kiemtra chưa có API chấm điểm (phản hồi không phải JSON). Cần deploy kiemtra.",
      );
    }
    const parsed = CheckpointGradePayloadSchema.safeParse(raw);
    if (!parsed.success) throw new CheckpointGradeMalformedError("Phản hồi bài kiểm tra vượt ngoài hợp đồng dữ liệu.");
    return parsed.data;
  } finally {
    clearTimeout(timeout);
  }
}

export function resolveGradeBranch(
  payload: CheckpointGradePayload,
  studentId: string,
  preferred?: CheckpointBranch,
): { branch: CheckpointBranch; examId: string } {
  const original = payload.original?.submissions[studentId];
  const makeup = payload.makeup?.submissions[studentId];
  if (preferred === "original" && original) return { branch: "original", examId: original.examId };
  if (preferred === "makeup" && makeup) return { branch: "makeup", examId: makeup.examId };
  if (makeup && original) {
    return makeup.submittedAt >= original.submittedAt
      ? { branch: "makeup", examId: makeup.examId }
      : { branch: "original", examId: original.examId };
  }
  if (makeup) return { branch: "makeup", examId: makeup.examId };
  if (original) return { branch: "original", examId: original.examId };
  throw new CheckpointGradeNotFoundError("Học sinh chưa nộp bài kiểm tra Checkpoint.");
}

export async function fetchCheckpointExamPdf(
  env: Env,
  pdfPath: string,
  fetcher: typeof fetch = fetch,
  timeoutMs = PDF_TIMEOUT_MS,
): Promise<Uint8Array> {
  const path = pdfPath.startsWith("http") ? pdfPath : `${kiemtraBaseUrl(env)}${pdfPath.startsWith("/") ? "" : "/"}${pdfPath}`;
  const cached = await readCachedPdf(env, path);
  if (cached) return cached;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let response: Response;
    try {
      response = await fetcher(path, { headers: kiemtraAuthHeaders(env), signal: controller.signal });
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        throw new CheckpointGradeTimeoutError("Không tải được đề bài kiểm tra (quá thời gian).");
      }
      throw new CheckpointGradeUpstreamError("Không tải được đề bài kiểm tra.");
    }
    if (!response.ok) throw new CheckpointGradeUpstreamError(`Không tải được đề bài kiểm tra (HTTP ${response.status}).`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    await writeCachedPdf(env, path, bytes);
    return bytes;
  } finally {
    clearTimeout(timeout);
  }
}

function pdfCacheKey(path: string): string {
  return `checkpoint-exams/${encodeURIComponent(path)}/exam.pdf`;
}

async function readCachedPdf(env: Env, path: string): Promise<Uint8Array | null> {
  try {
    const object = await env.ATTACHMENTS?.get(pdfCacheKey(path));
    if (!object) return null;
    return new Uint8Array(await object.arrayBuffer());
  } catch {
    return null;
  }
}

async function writeCachedPdf(env: Env, path: string, bytes: Uint8Array): Promise<void> {
  try {
    await env.ATTACHMENTS?.put(pdfCacheKey(path), bytes, {
      httpMetadata: { contentType: "application/pdf" },
    });
  } catch {
    // Cache is best-effort; grading can continue without it.
  }
}

import type { StorageProductFile } from "@tool-lms/contracts";
import { normalizeStorageName } from "@tool-lms/contracts";

export const DEFAULT_CLOUD_STORAGE_BASE_URL = "https://spck.ducvu.io.vn";
const MAX_FILES = 500;
const MAX_BODY_CHARS = 2_000_000;
const SHARE_TOKEN = /^[a-f0-9]{32}$/i;

interface StorageStudent {
  id: number;
  lmsStudentId: string;
  name: string;
}

interface StorageProduct {
  id: string;
  studentId: number | null;
  studentName: string;
  originalName: string;
  fileSize: number;
  mimeType: string;
  shareToken: string;
  createdAt: string;
  fileName: string;
  description: string;
}

export function cloudStorageBaseUrl(env?: { CLOUD_STORAGE_BASE_URL?: string }): string {
  const configured = env?.CLOUD_STORAGE_BASE_URL?.trim();
  let url: URL;
  try {
    url = new URL(configured || DEFAULT_CLOUD_STORAGE_BASE_URL);
  } catch {
    throw new Error("Cloud storage URL is invalid");
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Cloud storage URL is invalid");
  }
  return url.origin;
}

export function isSafeStorageClassId(classId: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(classId);
}

export function mapStorageCatalog(input: {
  products: unknown;
  students: unknown;
  baseUrl: string;
}): StorageProductFile[] {
  const students = indexStudents(input.students);
  const files: StorageProductFile[] = [];
  const seen = new Set<string>();
  for (const item of asArray(input.products)) {
    const product = parseProduct(item);
    if (!product || seen.has(product.id)) continue;
    seen.add(product.id);
    files.push({
      id: product.id,
      lmsStudentId: resolveLmsStudentId(product, students),
      studentName: product.studentName,
      originalName: product.originalName,
      fileSize: product.fileSize,
      mimeType: product.mimeType,
      downloadUrl: `${input.baseUrl}/api/public/download/${product.shareToken}`,
      createdAt: product.createdAt,
      kind: linkTarget(product) ? "link" : "file",
      linkUrl: linkTarget(product),
    });
    if (files.length >= MAX_FILES) break;
  }
  files.sort((left, right) => right.createdAt.localeCompare(left.createdAt) || left.originalName.localeCompare(right.originalName));
  return files;
}

export async function fetchClassStorageProducts(
  env: { CLOUD_STORAGE_BASE_URL?: string } | undefined,
  classId: string,
): Promise<StorageProductFile[]> {
  if (!isSafeStorageClassId(classId)) throw new Error("Invalid class id");
  const baseUrl = cloudStorageBaseUrl(env);
  const encodedClassId = encodeURIComponent(classId);
  const [productsResponse, studentsResponse] = await Promise.all([
    fetchJson(`${baseUrl}/api/public/products/${encodedClassId}`),
    fetchJson(`${baseUrl}/api/public/classes/${encodedClassId}/students`),
  ]);
  if (productsResponse.status === 404) return [];
  if (!isSuccess(productsResponse.status) || productsResponse.body == null) {
    throw new Error(`Cloud storage products failed (${productsResponse.status})`);
  }
  const students = isSuccess(studentsResponse.status) ? field(studentsResponse.body, "students") : [];
  return mapStorageCatalog({
    products: field(productsResponse.body, "products"),
    students,
    baseUrl,
  });
}

function resolveLmsStudentId(
  product: StorageProduct,
  students: { byLocalId: Map<number, StorageStudent>; byName: Map<string, StorageStudent[]> },
): string | null {
  if (product.studentId != null) {
    const linked = students.byLocalId.get(product.studentId);
    if (linked?.lmsStudentId) return linked.lmsStudentId;
  }
  const matches = students.byName.get(normalizeStorageName(product.studentName)) || [];
  const ids = [...new Set(matches.map((student) => student.lmsStudentId).filter(Boolean))];
  return ids.length === 1 ? ids[0] : null;
}

function indexStudents(value: unknown): { byLocalId: Map<number, StorageStudent>; byName: Map<string, StorageStudent[]> } {
  const byLocalId = new Map<number, StorageStudent>();
  const byName = new Map<string, StorageStudent[]>();
  for (const item of asArray(value)) {
    const record = asRecord(item);
    const id = integer(record?.id);
    const lmsStudentId = text(record?.lms_student_id, 200);
    const name = text(record?.name, 500);
    if (id == null || !lmsStudentId) continue;
    const student = { id, lmsStudentId, name };
    byLocalId.set(id, student);
    const key = normalizeStorageName(name);
    if (!key) continue;
    const list = byName.get(key) || [];
    list.push(student);
    byName.set(key, list);
  }
  return { byLocalId, byName };
}

function parseProduct(value: unknown): StorageProduct | null {
  const record = asRecord(value);
  if (!record) return null;
  const id = text(record.id, 40);
  const shareToken = text(record.share_token, 64).toLowerCase();
  const fileSize = integer(record.file_size);
  const originalName = text(record.original_name, 500) || (id ? `file-${id}` : "");
  if (!id || !SHARE_TOKEN.test(shareToken) || fileSize == null || !originalName) return null;
  return {
    id,
    studentId: integer(record.student_id),
    studentName: text(record.student_name, 500),
    originalName,
    fileSize,
    mimeType: text(record.mime_type, 255),
    fileName: text(record.file_name, 255),
    description: text(record.description, 4_000),
    shareToken,
    createdAt: createdAt(record.created_at),
  };
}

function linkTarget(product: StorageProduct): string | null {
  const mime = product.mimeType.toLowerCase();
  const linkSubmission = mime.startsWith("text/plain") || product.fileName.startsWith("text_");
  if (!linkSubmission) return null;
  return extractHttpUrl(product.description) || extractHttpUrl(product.originalName);
}

function extractHttpUrl(value: string): string | null {
  const match = value.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return null;
  try {
    const url = new URL(match[0]);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString().slice(0, 2000);
  } catch {
    return null;
  }
}

async function fetchJson(url: string): Promise<{ status: number; body: unknown | null }> {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
    headers: { Accept: "application/json" },
  });
  const text = await response.text();
  if (text.length > MAX_BODY_CHARS) throw new Error("Cloud storage response is too large");
  if (!text) return { status: response.status, body: null };
  try {
    return { status: response.status, body: JSON.parse(text) as unknown };
  } catch {
    return { status: response.status, body: null };
  }
}

function isSuccess(status: number): boolean {
  return status >= 200 && status < 300;
}

function field(body: unknown, key: string): unknown {
  return asRecord(body)?.[key];
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function text(value: unknown, max: number): string {
  if (typeof value === "number" && Number.isFinite(value)) return String(value).slice(0, max);
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function integer(value: unknown): number | null {
  const number = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 0) return null;
  return number;
}

function createdAt(value: unknown): string {
  if (typeof value === "string") return value.trim().slice(0, 100);
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value).toISOString();
  return "";
}

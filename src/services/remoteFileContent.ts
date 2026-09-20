import { unzipSync } from "fflate";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"]);
const TEXT_EXTENSIONS = new Set([
  ".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".ts", ".jsx", ".tsx",
  ".py", ".json", ".ipynb", ".txt", ".md", ".xml", ".csv", ".yml", ".yaml", ".sql",
  ".java", ".c", ".cpp", ".cs", ".php", ".rb", ".go", ".gml", ".yyp",
]);
const ARCHIVE_EXTENSIONS = new Set([".zip", ".yyz"]);
const ARCHIVE_TEXT_EXTENSIONS = new Set([...TEXT_EXTENSIONS, ".shader", ".vsh", ".fsh"]);
const MAX_TEXT_FILE_CHARS = 40_000;
const MAX_ARCHIVE_FILES = 40;
const MAX_ARCHIVE_TOTAL_CHARS = 15_000;
const MAX_ARCHIVE_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12_000;

export type RemoteFileKind = "image" | "text" | "archive" | "pdf" | "scratch" | "other";

export interface LoadedRemoteFile {
  name: string;
  contentType: string;
  kind: RemoteFileKind;
  textFiles: Array<{ name: string; content: string }>;
  imageDataUrl?: string;
  pdfBytes?: Uint8Array;
}

export function extensionOf(fileName: string): string {
  const filename = fileName.split("/").at(-1) || fileName;
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot).toLowerCase() : "";
}

export function classifyRemoteFile(fileName: string, contentType = ""): RemoteFileKind {
  const ext = extensionOf(fileName);
  const type = contentType.toLowerCase();
  if (ext === ".sb3" || ext === ".sb2" || ext === ".sprite3") return "scratch";
  if (IMAGE_EXTENSIONS.has(ext) || type.startsWith("image/")) return "image";
  if (ext === ".pdf" || type.includes("pdf")) return "pdf";
  if (ARCHIVE_EXTENSIONS.has(ext) || type.includes("zip")) return "archive";
  if (TEXT_EXTENSIONS.has(ext) || type.startsWith("text/") || type.includes("json") || type.includes("javascript")) return "text";
  return "other";
}

export async function fetchBoundedBytes(url: string, maxBytes: number, timeoutMs = FETCH_TIMEOUT_MS): Promise<{ bytes: Uint8Array; contentType: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok || !response.body) throw new Error(`Không tải được tệp (${response.status})`);
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error("Tệp quá lớn");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { bytes, contentType };
  } finally {
    clearTimeout(timeout);
  }
}

export function bytesToDataUrl(bytes: Uint8Array, contentType: string): string {
  let binary = "";
  const chunk = 0x2000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return `data:${contentType || "application/octet-stream"};base64,${btoa(binary)}`;
}

export async function loadRemoteFile(input: { url: string; fileName: string; contentType?: string }): Promise<LoadedRemoteFile> {
  const kind = classifyRemoteFile(input.fileName, input.contentType);
  const name = input.fileName.split("/").at(-1) || input.fileName;
  if (kind === "scratch" || kind === "other") {
    return { name, contentType: input.contentType || "", kind, textFiles: [] };
  }

  if (kind === "text") {
    const { bytes, contentType } = await fetchBoundedBytes(input.url, MAX_TEXT_FILE_CHARS * 4);
    const content = new TextDecoder().decode(bytes);
    return {
      name,
      contentType,
      kind,
      textFiles: [{ name, content: content.length > MAX_TEXT_FILE_CHARS ? `${content.slice(0, MAX_TEXT_FILE_CHARS)}\n... (nội dung bị cắt bớt)` : content }],
    };
  }

  if (kind === "image") {
    const { bytes, contentType } = await fetchBoundedBytes(input.url, MAX_IMAGE_BYTES);
    return {
      name,
      contentType,
      kind,
      textFiles: [],
      imageDataUrl: bytesToDataUrl(bytes, contentType.startsWith("image/") ? contentType : "image/png"),
    };
  }

  if (kind === "pdf") {
    const { bytes, contentType } = await fetchBoundedBytes(input.url, MAX_PDF_BYTES);
    return { name, contentType, kind, textFiles: [], pdfBytes: bytes };
  }

  const { bytes, contentType } = await fetchBoundedBytes(input.url, MAX_ARCHIVE_BYTES);
  return {
    name,
    contentType,
    kind,
    textFiles: extractArchiveText(name, bytes),
  };
}

function extractArchiveText(archiveName: string, bytes: Uint8Array): Array<{ name: string; content: string }> {
  const entries = unzipSync(bytes, {
    filter: (file) => ARCHIVE_TEXT_EXTENSIONS.has(extensionOf(file.name)) && !file.name.endsWith("/"),
  });
  const decoder = new TextDecoder();
  const paths = Object.keys(entries).slice(0, MAX_ARCHIVE_FILES);
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

export const MAX_EXAM_PDF_BYTES = MAX_PDF_BYTES;

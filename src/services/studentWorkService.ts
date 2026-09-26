import type { SaveStudentWorkInput, StudentWork } from "@tool-lms/contracts";
import {
  CREATE_STUDENT_WORK_MUTATION,
  DELETE_STUDENT_WORK_MUTATION,
  FIND_ALL_STUDENT_WORKS_QUERY,
  UPDATE_STUDENT_WORK_MUTATION,
} from "../constants/lmsQueries";
import type { SessionRecord } from "../types";
import type { LmsCallResult, LmsClient } from "./lmsClient";
import { cloudStorageBaseUrl } from "./storageProductService";

type StudentWorkClient = Pick<LmsClient, "callApi">;

function lmsRequiredText(value: string | undefined): string {
  return value?.trim() || " ";
}

type FindAllStudentWorksResult = {
  findAllStudentWorks?: {
    data?: unknown[];
  };
};

type CreateStudentWorkResult = {
  studentWorks?: {
    create?: unknown;
  };
};

type UpdateStudentWorkResult = {
  studentWorks?: {
    update?: unknown;
  };
};

type DeleteStudentWorkResult = {
  studentWorks?: {
    del?: {
      id?: string;
    };
  };
};

export function normalizeStudentWork(raw: unknown): StudentWork | null {
  if (!raw || typeof raw !== "object") return null;
  const item = raw as Record<string, unknown>;
  const id = typeof item.id === "string" ? item.id : "";
  const studentId = typeof item.studentId === "string" ? item.studentId : "";
  const classSessionId = typeof item.classSessionId === "string" ? item.classSessionId : "";
  const classId = typeof item.classId === "string" ? item.classId : "";
  if (!id || !studentId) return null;

  const rawLatest = (item.latestData && typeof item.latestData === "object" ? item.latestData : {}) as Record<string, unknown>;
  const rawRelated = Array.isArray(rawLatest.relatedUrls) ? rawLatest.relatedUrls : [];
  const relatedUrls = rawRelated.filter((u): u is Record<string, unknown> => Boolean(u && typeof u === "object")).map((u) => ({
    name: typeof u.name === "string" ? u.name : "",
    url: typeof u.url === "string" ? u.url : "",
  }));

  const latestData = {
    title: typeof rawLatest.title === "string" ? rawLatest.title : "",
    thumbnail: typeof rawLatest.thumbnail === "string" ? rawLatest.thumbnail : "",
    videoUrls: Array.isArray(rawLatest.videoUrls) ? rawLatest.videoUrls.filter((x): x is string => typeof x === "string") : [],
    imageUrl: Array.isArray(rawLatest.imageUrl) ? rawLatest.imageUrl.filter((x): x is string => typeof x === "string") : [],
    attachmentUrls: Array.isArray(rawLatest.attachmentUrls) ? rawLatest.attachmentUrls.filter((x): x is string => typeof x === "string") : [],
    comment: typeof rawLatest.comment === "string" ? rawLatest.comment : "",
    rejectReason: typeof rawLatest.rejectReason === "string" ? rawLatest.rejectReason : null,
    relatedUrls,
  };

  const createdByRaw = item.createdBy && typeof item.createdBy === "object" ? (item.createdBy as Record<string, unknown>) : null;
  const lastModifiedByRaw = item.lastModifiedBy && typeof item.lastModifiedBy === "object" ? (item.lastModifiedBy as Record<string, unknown>) : null;

  return {
    id,
    status: typeof item.status === "string" ? item.status : "pending",
    studentId,
    classSessionId: classSessionId || "",
    classId: classId || "",
    version: typeof item.version === "number" ? item.version : 1,
    displayOrder: typeof item.displayOrder === "number" ? item.displayOrder : 0,
    latestData,
    createdBy: createdByRaw ? { displayName: typeof createdByRaw.displayName === "string" ? createdByRaw.displayName : null } : null,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : null,
    lastModifiedBy: lastModifiedByRaw ? { displayName: typeof lastModifiedByRaw.displayName === "string" ? lastModifiedByRaw.displayName : null } : null,
    lastModifiedAt: typeof item.lastModifiedAt === "string" ? item.lastModifiedAt : null,
  };
}

export async function fetchStudentWorks(
  client: StudentWorkClient,
  session: SessionRecord,
  params: { classId: string; classSessionId: string; studentId?: string }
): Promise<LmsCallResult<FindAllStudentWorksResult> & { studentWorks: StudentWork[] }> {
  const variables: Record<string, unknown> = {
    classId: params.classId,
    classSessionId: params.classSessionId,
  };
  if (params.studentId) {
    variables.studentId = params.studentId;
  }

  const result = await client.callApi<FindAllStudentWorksResult>(
    session,
    "findAllStudentWorks",
    FIND_ALL_STUDENT_WORKS_QUERY,
    variables
  );

  const rawList = result.body.data?.findAllStudentWorks?.data ?? [];
  const studentWorks = Array.isArray(rawList)
    ? rawList.flatMap((item) => {
        const norm = normalizeStudentWork(item);
        return norm ? [norm] : [];
      })
    : [];

  return { ...result, studentWorks };
}

export async function createStudentWork(
  client: StudentWorkClient,
  session: SessionRecord,
  input: SaveStudentWorkInput
): Promise<LmsCallResult<CreateStudentWorkResult> & { studentWork: StudentWork | null }> {
  const payload: Record<string, unknown> = {
    classId: input.classId,
    classSessionId: input.classSessionId,
    studentId: input.studentId,
    displayOrder: input.displayOrder ?? 0,
    latestData: {
      title: input.title,
      thumbnail: input.thumbnail || "",
      videoUrls: input.videoUrls || [],
      imageUrl: input.imageUrl || [],
      attachmentUrls: input.attachmentUrls || [],
      comment: lmsRequiredText(input.comment),
      rejectReason: input.rejectReason || "",
      relatedUrls: input.relatedUrls || [],
    },
  };
  if (typeof input.classSessionNumber === "number" && !Number.isNaN(input.classSessionNumber)) {
    payload.classSessionNumber = input.classSessionNumber;
  }

  const result = await client.callApi<CreateStudentWorkResult>(
    session,
    "CreateStudentWork",
    CREATE_STUDENT_WORK_MUTATION,
    { payload }
  );

  const created = result.body.data?.studentWorks?.create;
  const studentWork = created ? normalizeStudentWork(created) : null;
  return { ...result, studentWork };
}

export async function updateStudentWork(
  client: StudentWorkClient,
  session: SessionRecord,
  input: SaveStudentWorkInput & { id: string }
): Promise<LmsCallResult<UpdateStudentWorkResult> & { studentWork: StudentWork | null }> {
  const payload = {
    id: input.id,
    payload: {
      classId: input.classId,
      classSessionId: input.classSessionId,
      studentId: input.studentId,
      displayOrder: input.displayOrder ?? 0,
      latestData: {
        title: input.title,
        thumbnail: input.thumbnail || "",
        videoUrls: input.videoUrls || [],
        imageUrl: input.imageUrl || [],
        attachmentUrls: input.attachmentUrls || [],
        comment: lmsRequiredText(input.comment),
        rejectReason: input.rejectReason || "",
        relatedUrls: input.relatedUrls || [],
      },
    },
  };

  const result = await client.callApi<UpdateStudentWorkResult>(
    session,
    "UpdateStudentWork",
    UPDATE_STUDENT_WORK_MUTATION,
    { payload }
  );

  const updated = result.body.data?.studentWorks?.update;
  const studentWork = updated ? normalizeStudentWork(updated) : null;
  return { ...result, studentWork };
}

export async function deleteStudentWork(
  client: StudentWorkClient,
  session: SessionRecord,
  id: string
): Promise<LmsCallResult<DeleteStudentWorkResult> & { deleted: boolean }> {
  const result = await client.callApi<DeleteStudentWorkResult>(
    session,
    "DeleteStudentWork",
    DELETE_STUDENT_WORK_MUTATION,
    { payload: { id } }
  );

  const deletedId = result.body.data?.studentWorks?.del?.id;
  return { ...result, deleted: Boolean(deletedId) };
}

const STORAGE_DOWNLOAD_PATH = /^\/api\/public\/download\/([a-f0-9]{32})$/i;
const MAX_REHOST_BYTES = 80 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v"]);

type HostedStorageFile = { url: string; kind: "image" | "video" | "file" };

export async function uploadThumbnailResource(
  file: Blob | ArrayBuffer | Uint8Array,
  fileName = "thumbnail.png"
): Promise<{ link: string; url: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = file instanceof Blob ? file : new Blob([file as any]);
  return uploadResourceFile(blob, fileName);
}

export async function rehostCloudStorageAssets(
  input: SaveStudentWorkInput,
  env?: { CLOUD_STORAGE_BASE_URL?: string },
): Promise<SaveStudentWorkInput> {
  const names = new Map<string, string>();
  for (const link of input.relatedUrls || []) {
    const canonical = canonicalStorageDownloadUrl(link.url, env);
    if (canonical && link.name.trim()) names.set(canonical, link.name);
  }
  const urls = uniqueStorageUrls([
    input.thumbnail,
    ...(input.videoUrls || []),
    ...(input.imageUrl || []),
    ...(input.attachmentUrls || []),
    ...(input.relatedUrls || []).map((link) => link.url),
  ], env);
  if (!urls.length) {
    if (input.thumbnail?.trim()) return input;
    return { ...input, thumbnail: await uploadPlaceholderThumbnail() };
  }

  const hosted: HostedStorageFile[] = [];
  for (const url of urls) {
    hosted.push(await downloadAndUploadToLms(url, names.get(url) || fileNameFromUrl(url)));
  }
  const keep = (url: string) => !canonicalStorageDownloadUrl(url, env);
  return {
    ...input,
    thumbnail: await uploadPlaceholderThumbnail(),
    videoUrls: (input.videoUrls || []).filter(keep),
    imageUrl: (input.imageUrl || []).filter(keep),
    attachmentUrls: [...hosted.map((file) => file.url), ...(input.attachmentUrls || []).filter(keep)],
    relatedUrls: (input.relatedUrls || []).filter((link) => keep(link.url)),
  };
}

async function downloadAndUploadToLms(url: string, fileName: string): Promise<HostedStorageFile> {
  const storageOrigin = new URL(url).origin;
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(25_000),
  });
  const finalUrl = new URL(response.url || url);
  if (finalUrl.origin !== storageOrigin || !STORAGE_DOWNLOAD_PATH.test(finalUrl.pathname)) {
    throw new Error("Đường dẫn file kho sản phẩm không hợp lệ.");
  }
  if (!response.ok) throw new Error(`Không tải được file từ kho sản phẩm (${response.status}).`);
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > MAX_REHOST_BYTES) throw new Error("File quá lớn để nộp lên LMS (tối đa 80MB).");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_REHOST_BYTES) throw new Error("File quá lớn để nộp lên LMS (tối đa 80MB).");
  const type = response.headers.get("content-type") || "application/octet-stream";
  const name = safeUploadName(fileName);
  const uploaded = await uploadResourceFile(new File([bytes], name, { type }), name);
  return { url: uploaded.url, kind: resourceKind(type, name) };
}

async function uploadPlaceholderThumbnail(): Promise<string> {
  const binary = atob("iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAQKADAAQAAAABAAAAQAAAAABGUUKwAAAAsUlEQVRoBe3S0Q2AIBTFUHEQB2NOBzTMcD7MS8p/b6BlPfu9Jp978uXP3XvA3wUrUAE00BdCgYxXgBXiQAVQIOMVYIU4UAEUyHgFWCEOVAAFMl4BVogDFUCBjFeAFeJABVAg4xVghThQARTIeAVYIQ5UAAUyXgFWiAMVQIGMV4AV4kAFUCDjFWCFOFABFMh4BVghDlQABTJeAVaIAxVAgYxXgBXiQAVQIOMVYIU4ML7AB8xOAawOskzeAAAAAElFTkSuQmCC");
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const uploaded = await uploadResourceFile(new File([bytes], "thumbnail.png", { type: "image/png" }), "thumbnail.png");
  return uploaded.url;
}

async function uploadResourceFile(file: Blob, fileName: string): Promise<{ link: string; url: string }> {
  const formData = new FormData();
  formData.append("files", file, fileName);
  const res = await fetch("https://resources.mindx.edu.vn/api/v1/resources", {
    method: "POST",
    headers: {
      Accept: "*/*",
      Origin: "https://lms.mindx.edu.vn",
      Referer: "https://lms.mindx.edu.vn/",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
    },
    body: formData,
  });
  if (!res.ok) {
    const detail = (await res.text()).replace(/\s+/g, " ").slice(0, 180);
    console.error("mindx resource upload failed", res.status, file.size, detail);
    throw new Error(`Upload file lên LMS thất bại (${res.status}).`);
  }
  const data = (await res.json()) as { link?: string; message?: string };
  const link = data.link || "";
  if (!link.startsWith("/") && !link.startsWith("https://resources.mindx.edu.vn/")) {
    throw new Error(data.message || "LMS không trả về link file hợp lệ.");
  }
  return {
    link,
    url: link.startsWith("http") ? link : `https://resources.mindx.edu.vn${link}`,
  };
}

function uniqueStorageUrls(urls: Array<string | undefined>, env?: { CLOUD_STORAGE_BASE_URL?: string }): string[] {
  const seen = new Set<string>();
  for (const url of urls) {
    const canonical = url ? canonicalStorageDownloadUrl(url, env) : null;
    if (canonical) seen.add(canonical);
  }
  return [...seen];
}

export function canonicalStorageDownloadUrl(url: string, env?: { CLOUD_STORAGE_BASE_URL?: string }): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
    if (parsed.origin !== cloudStorageBaseUrl(env) || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    if (!STORAGE_DOWNLOAD_PATH.test(parsed.pathname)) return null;
  } catch {
    return null;
  }
  return parsed.toString();
}

function resourceKind(mimeType: string, fileName: string): HostedStorageFile["kind"] {
  const mime = mimeType.toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  return "file";
}

function fileNameFromUrl(url: string): string {
  return `san-pham-${new URL(url).pathname.split("/").pop() || "file"}`;
}

function safeUploadName(name: string): string {
  const base = name.split(/[/\\]/).pop()?.replace(/["\r\n]/g, "").trim() || "";
  return (base || "tep-san-pham").slice(0, 180);
}

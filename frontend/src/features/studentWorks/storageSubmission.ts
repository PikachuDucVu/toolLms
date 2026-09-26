import type { SaveStudentWorkInput, StorageProductFile, StudentWork } from "@tool-lms/contracts";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "m4v"]);

export function storageFileKind(file: Pick<StorageProductFile, "mimeType" | "originalName">): "image" | "video" | "file" {
  const mime = file.mimeType.toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  const extension = file.originalName.split(".").pop()?.toLowerCase() || "";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  return "file";
}

export function buildStorageStudentWork(input: {
  classId: string;
  classSessionId: string;
  studentId: string;
  sessionNumber?: number;
  title: string;
  comment?: string;
  displayOrder: number;
  id?: string;
  files: StorageProductFile[];
}): SaveStudentWorkInput {
  const attachments: string[] = [];
  const relatedUrls: { name: string; url: string }[] = [];
  for (const file of input.files) {
    if (file.kind === "link") {
      if (!file.linkUrl) continue;
      relatedUrls.push({ name: file.originalName.slice(0, 500) || file.linkUrl, url: file.linkUrl.slice(0, 2000) });
      continue;
    }
    attachments.push(file.downloadUrl);
    relatedUrls.push({ name: file.originalName.slice(0, 500), url: file.downloadUrl });
  }
  return {
    id: input.id,
    classId: input.classId,
    classSessionId: input.classSessionId,
    studentId: input.studentId,
    displayOrder: input.displayOrder,
    classSessionNumber: input.sessionNumber,
    title: input.title.trim(),
    thumbnail: "",
    videoUrls: [],
    imageUrl: [],
    attachmentUrls: attachments,
    comment: input.comment?.trim() || "",
    rejectReason: "",
    relatedUrls,
  };
}

export function latestStudentWork(works: StudentWork[]): StudentWork | undefined {
  return [...works].sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")))[0];
}

export function submittedProductItems(works: StudentWork[]): { name: string; kind: "file" | "link" }[] {
  const items: { name: string; kind: "file" | "link" }[] = [];
  for (const work of works) {
    for (const link of work.latestData.relatedUrls || []) {
      const url = link.url?.trim();
      if (!url || isStorageDownloadUrl(url)) continue;
      items.push({ kind: "link", name: (link.name || url).slice(0, 80) });
    }
    for (const url of work.latestData.attachmentUrls || []) {
      items.push({ kind: "file", name: resourceFileName(url) });
    }
  }
  return items;
}

function isStorageDownloadUrl(url: string): boolean {
  try {
    return /\/api\/public\/download\/[a-f0-9]{32}$/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function resourceFileName(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() || "") || "File";
  } catch {
    return "File";
  }
}

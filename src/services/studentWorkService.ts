import type { SaveStudentWorkInput, StudentWork } from "@tool-lms/contracts";
import {
  CREATE_STUDENT_WORK_MUTATION,
  DELETE_STUDENT_WORK_MUTATION,
  FIND_ALL_STUDENT_WORKS_QUERY,
  UPDATE_STUDENT_WORK_MUTATION,
} from "../constants/lmsQueries";
import type { SessionRecord } from "../types";
import type { LmsCallResult, LmsClient } from "./lmsClient";

type StudentWorkClient = Pick<LmsClient, "callApi">;

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
      comment: input.comment || "",
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
        comment: input.comment || "",
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

export async function uploadThumbnailResource(
  file: Blob | ArrayBuffer | Uint8Array,
  fileName = "thumbnail.png"
): Promise<{ link: string; url: string }> {
  const formData = new FormData();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const blob = file instanceof Blob ? file : new Blob([file as any]);
  formData.append("files", blob, fileName);

  const res = await fetch("https://resources.mindx.edu.vn/api/v1/resources", {
    method: "POST",
    headers: {
      Origin: "https://lms.mindx.edu.vn",
      Referer: "https://lms.mindx.edu.vn/",
    },
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload ảnh thất bại (${res.status}): ${text.slice(0, 100)}`);
  }

  const data = (await res.json()) as { link?: string; message?: string };
  const link = data.link || "";
  if (!link) {
    throw new Error(data.message || "Không nhận được link ảnh tải lên.");
  }
  return {
    link,
    url: link.startsWith("http") ? link : `https://resources.mindx.edu.vn${link}`,
  };
}

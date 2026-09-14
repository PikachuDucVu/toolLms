import {
  DeleteStudentWorkResponseSchema,
  SaveStudentWorkInputSchema,
  SaveStudentWorkResponseSchema,
  StudentWorksResponseSchema,
  UploadResourceResponseSchema,
  type DeleteStudentWorkResponse,
  type SaveStudentWorkInput,
  type SaveStudentWorkResponse,
  type StudentWorksResponse,
  type UploadResourceResponse,
} from "@tool-lms/contracts";
import { apiRequest } from "../../lib/apiClient";

export async function fetchStudentWorks(
  slotId: string,
  classId: string,
  signal?: AbortSignal,
): Promise<StudentWorksResponse> {
  return apiRequest(`/api/v2/slots/${encodeURIComponent(slotId)}/student-works?classId=${encodeURIComponent(classId)}`, {
    schema: StudentWorksResponseSchema,
    signal,
  });
}

export async function saveStudentWork(
  slotId: string,
  input: SaveStudentWorkInput,
  signal?: AbortSignal,
): Promise<SaveStudentWorkResponse> {
  const validated = SaveStudentWorkInputSchema.parse(input);
  return apiRequest(`/api/v2/slots/${encodeURIComponent(slotId)}/student-works`, {
    method: "POST",
    body: validated,
    schema: SaveStudentWorkResponseSchema,
    signal,
  });
}

export async function deleteStudentWork(
  slotId: string,
  workId: string,
  signal?: AbortSignal,
): Promise<DeleteStudentWorkResponse> {
  return apiRequest(`/api/v2/slots/${encodeURIComponent(slotId)}/student-works/${encodeURIComponent(workId)}`, {
    method: "DELETE",
    schema: DeleteStudentWorkResponseSchema,
    signal,
  });
}

export async function uploadThumbnail(
  file: File,
  signal?: AbortSignal,
): Promise<UploadResourceResponse> {
  const formData = new FormData();
  formData.append("file", file, file.name);
  return apiRequest("/api/v2/resources/upload", {
    method: "POST",
    body: formData,
    schema: UploadResourceResponseSchema,
    signal,
  });
}

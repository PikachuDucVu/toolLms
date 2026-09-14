import {
  ClassDetailResponseSchema,
  ClassesResponseSchema,
  SaveSummaryRequestSchema,
  SaveSummaryResponseSchema,
  type SaveSummaryRequest,
} from "@tool-lms/contracts";
import { apiRequest } from "../../lib/apiClient";

export function getClasses(signal?: AbortSignal) {
  return apiRequest("/api/v2/classes", { schema: ClassesResponseSchema, signal });
}

export function getClassDetail(classId: string, signal?: AbortSignal) {
  return apiRequest(`/api/v2/classes/${encodeURIComponent(classId)}`, { schema: ClassDetailResponseSchema, signal });
}

export function saveSlotSummary(slotId: string, request: SaveSummaryRequest, signal?: AbortSignal) {
  return apiRequest(`/api/v2/slots/${encodeURIComponent(slotId)}/summary`, {
    method: "PUT",
    body: SaveSummaryRequestSchema.parse(request),
    schema: SaveSummaryResponseSchema,
    signal,
  });
}

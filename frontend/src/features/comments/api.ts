import {
  GenerateCommentRequestSchema,
  GenerateCommentResponseSchema,
  HomeworkLoadResponseSchema,
  SaveSummaryRequestSchema,
  SaveSummaryResponseSchema,
  SubmitCommentRequestSchema,
  SubmitCommentResponseSchema,
  type GenerateCommentRequest,
  type SaveSummaryRequest,
  type SubmitCommentRequest,
} from '@tool-lms/contracts';
import { apiRequest } from '../../lib/apiClient';

export function generateComment(request: GenerateCommentRequest, signal?: AbortSignal) {
  return apiRequest('/api/v2/comments/generate', { method: 'POST', body: GenerateCommentRequestSchema.parse(request), schema: GenerateCommentResponseSchema, signal });
}

export function saveSummary(slotId: string, request: SaveSummaryRequest, signal?: AbortSignal) {
  return apiRequest(`/api/v2/slots/${encodeURIComponent(slotId)}/summary`, { method: 'PUT', body: SaveSummaryRequestSchema.parse(request), schema: SaveSummaryResponseSchema, signal });
}

export function submitComment(slotId: string, request: SubmitCommentRequest, signal?: AbortSignal) {
  return apiRequest(`/api/v2/slots/${encodeURIComponent(slotId)}/comments/submit`, { method: 'POST', body: SubmitCommentRequestSchema.parse(request), schema: SubmitCommentResponseSchema, signal });
}

export function getCommentHomework(classId: string, signal?: AbortSignal) {
  return apiRequest(`/api/v2/classes/${encodeURIComponent(classId)}/homework`, { schema: HomeworkLoadResponseSchema, signal });
}

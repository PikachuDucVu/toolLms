import {
  DemoRandomPreviewRequestSchema,
  DemoRandomPreviewResponseSchema,
  DemoSchemaResponseSchema,
  DemoSubmitRequestSchema,
  DemoSubmitResponseSchema,
  type DemoRandomPreviewRequest,
  type DemoSubmitRequest,
} from '@tool-lms/contracts';
import { apiRequest } from '../../lib/apiClient';

export function getDemoSchema(slotId: string, classId: string, signal?: AbortSignal) {
  return apiRequest(`/api/v2/slots/${encodeURIComponent(slotId)}/demo?classId=${encodeURIComponent(classId)}`, { schema: DemoSchemaResponseSchema, signal });
}

export function previewDemoScores(slotId: string, request: DemoRandomPreviewRequest, signal?: AbortSignal) {
  return apiRequest(`/api/v2/slots/${encodeURIComponent(slotId)}/demo/random-scores`, {
    method: 'POST', body: DemoRandomPreviewRequestSchema.parse(request), schema: DemoRandomPreviewResponseSchema, signal,
  });
}

export function submitDemoScores(slotId: string, request: DemoSubmitRequest, signal?: AbortSignal) {
  return apiRequest(`/api/v2/slots/${encodeURIComponent(slotId)}/demo/submit`, {
    method: 'POST', body: DemoSubmitRequestSchema.parse(request), schema: DemoSubmitResponseSchema, signal,
  });
}

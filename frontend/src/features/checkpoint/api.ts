import {
  CheckpointGradeResponseSchema,
  CheckpointStatusResponseSchema,
  CheckpointSubmitRequestSchema,
  CheckpointSubmitResponseSchema,
  GenerateCheckpointCommentRequestSchema,
  GenerateCheckpointCommentResponseSchema,
  GradeCheckpointRequestSchema,
  type CheckpointNumber,
  type CheckpointSubmitRequest,
  type GenerateCheckpointCommentRequest,
  type GradeCheckpointRequest,
} from '@tool-lms/contracts';
import { apiRequest } from '../../lib/apiClient';

export function getCheckpointStatus(classId: string, checkpoint: CheckpointNumber, signal?: AbortSignal) {
  return apiRequest(`/api/v2/classes/${encodeURIComponent(classId)}/checkpoints/${checkpoint}/status`, {
    schema: CheckpointStatusResponseSchema,
    signal,
  });
}

export function gradeCheckpointExam(request: GradeCheckpointRequest, signal?: AbortSignal) {
  return apiRequest('/api/v2/checkpoints/grade', {
    method: 'POST',
    body: GradeCheckpointRequestSchema.parse(request),
    schema: CheckpointGradeResponseSchema,
    signal,
  });
}

export function generateCheckpointComment(request: GenerateCheckpointCommentRequest, signal?: AbortSignal) {
  return apiRequest('/api/v2/checkpoints/comments/generate', {
    method: 'POST',
    body: GenerateCheckpointCommentRequestSchema.parse(request),
    schema: GenerateCheckpointCommentResponseSchema,
    signal,
  });
}

export function submitCheckpoint(slotId: string, request: CheckpointSubmitRequest, signal?: AbortSignal) {
  return apiRequest(`/api/v2/slots/${encodeURIComponent(slotId)}/checkpoints/submit`, {
    method: 'POST',
    body: CheckpointSubmitRequestSchema.parse(request),
    schema: CheckpointSubmitResponseSchema,
    signal,
  });
}

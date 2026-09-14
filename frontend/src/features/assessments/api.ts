import {
  AssessmentLearningLevelResponseSchema,
  AssessmentLoadResponseSchema,
  AssessmentSaveResponseSchema,
  type AssessmentLearningLevelRequest,
  type AssessmentSaveRequest,
} from '@tool-lms/contracts';
import { apiRequest } from '../../lib/apiClient';

export function getAssessments(slotId: string, classId: string, previousSlotIds: string[], signal?: AbortSignal) {
  const params = new URLSearchParams({ classId });
  previousSlotIds.forEach((previousSlotId) => params.append('previousSlotId', previousSlotId));
  return apiRequest(`/api/v2/slots/${encodeURIComponent(slotId)}/assessments?${params}`, {
    schema: AssessmentLoadResponseSchema,
    signal,
  });
}

export function saveAssessment(slotId: string, studentId: string, request: AssessmentSaveRequest, signal?: AbortSignal) {
  return apiRequest(`/api/v2/slots/${encodeURIComponent(slotId)}/assessments/${encodeURIComponent(studentId)}`, {
    method: 'PUT',
    body: request,
    schema: AssessmentSaveResponseSchema,
    signal,
  });
}

export function saveLearningLevel(slotId: string, studentId: string, request: AssessmentLearningLevelRequest, signal?: AbortSignal) {
  return apiRequest(`/api/v2/slots/${encodeURIComponent(slotId)}/assessments/${encodeURIComponent(studentId)}/learning-level`, {
    method: 'PATCH',
    body: request,
    schema: AssessmentLearningLevelResponseSchema,
    signal,
  });
}

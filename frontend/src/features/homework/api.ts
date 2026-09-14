import {
  ClassesResponseSchema,
  GradingJobCancelResponseSchema,
  GradingJobCreateRequestSchema,
  GradingJobCreateResponseSchema,
  GradingJobResponseSchema,
  GradingJobRetryRequestSchema,
  GradingJobRetryResponseSchema,
  HomeworkAiGradeRequestSchema,
  HomeworkAiGradeResponseSchema,
  HomeworkBatchMarkRequestSchema,
  HomeworkBatchMarkResponseSchema,
  HomeworkDownloadUrlResponseSchema,
  HomeworkLoadResponseSchema,
  HomeworkMarkRequestSchema,
  HomeworkMarkResponseSchema,
  type GradingJobCreateRequest,
  type GradingJobRetryRequest,
  type HomeworkAiGradeRequest,
  type HomeworkBatchMarkRequest,
  type HomeworkMarkRequest,
} from '@tool-lms/contracts';
import { apiRequest } from '../../lib/apiClient';

export function getClasses(signal?: AbortSignal) {
  return apiRequest('/api/v2/classes', { schema: ClassesResponseSchema, signal });
}

export function getHomework(classId: string, signal?: AbortSignal) {
  return apiRequest(`/api/v2/classes/${encodeURIComponent(classId)}/homework`, { schema: HomeworkLoadResponseSchema, signal });
}

export function getDownloadUrl(classId: string, submissionId: string, key: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ classId, submissionId, key });
  return apiRequest(`/api/v2/homework/download-url?${query}`, { schema: HomeworkDownloadUrlResponseSchema, signal });
}

export function markHomework(request: HomeworkMarkRequest, signal?: AbortSignal) {
  return apiRequest('/api/v2/homework/mark', { method: 'POST', body: HomeworkMarkRequestSchema.parse(request), schema: HomeworkMarkResponseSchema, signal });
}

export function batchMarkHomework(request: HomeworkBatchMarkRequest, signal?: AbortSignal) {
  return apiRequest('/api/v2/homework/batch-mark', { method: 'POST', body: HomeworkBatchMarkRequestSchema.parse(request), schema: HomeworkBatchMarkResponseSchema, signal });
}

export function aiGradeHomework(request: HomeworkAiGradeRequest, signal?: AbortSignal) {
  return apiRequest('/api/v2/homework/ai-grade', { method: 'POST', body: HomeworkAiGradeRequestSchema.parse(request), schema: HomeworkAiGradeResponseSchema, signal });
}

export function createGradingJob(request: GradingJobCreateRequest, signal?: AbortSignal) {
  return apiRequest('/api/v2/homework/jobs', { method: 'POST', body: GradingJobCreateRequestSchema.parse(request), schema: GradingJobCreateResponseSchema, signal });
}

export function getGradingJob(jobId: string, signal?: AbortSignal) {
  return apiRequest(`/api/v2/homework/jobs/${encodeURIComponent(jobId)}`, { schema: GradingJobResponseSchema, signal });
}

export function cancelGradingJob(jobId: string, signal?: AbortSignal) {
  return apiRequest(`/api/v2/homework/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST', schema: GradingJobCancelResponseSchema, signal });
}

export function retryGradingJob(jobId: string, request: GradingJobRetryRequest, signal?: AbortSignal) {
  return apiRequest(`/api/v2/homework/jobs/${encodeURIComponent(jobId)}/retry-failed`, { method: 'POST', body: GradingJobRetryRequestSchema.parse(request), schema: GradingJobRetryResponseSchema, signal });
}

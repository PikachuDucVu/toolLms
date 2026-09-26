import { z } from 'zod';
import { BATCH_MAX_ITEMS, EntityIdSchema, NoteSchema, successEnvelope } from './common';
import { ThinkingLevelSchema } from './config';

const NullableTimestampSchema = z.string().max(100).nullable();
const ModelIdSchema = z.string().trim().max(300);
const EphemeralApiKeySchema = z.string().trim().min(1).max(2_000);

export const HomeworkSubmissionStatusSchema = z.enum(['SUBMITTED', 'MARKED', 'UNKNOWN']);
export type HomeworkSubmissionStatus = z.infer<typeof HomeworkSubmissionStatusSchema>;

export const HomeworkStudentSchema = z.object({
  id: EntityIdSchema,
  studentUid: EntityIdSchema,
  displayName: z.string().max(500),
});
export type HomeworkStudent = z.infer<typeof HomeworkStudentSchema>;

export const HomeworkLessonSchema = z.object({
  id: EntityIdSchema,
  name: z.string().max(500),
  type: z.string().max(100),
  isActive: z.boolean(),
  displayOrder: z.number().int(),
});
export type HomeworkLesson = z.infer<typeof HomeworkLessonSchema>;

/** Canonical, bounded submission shape used by v2 responses and grading-job requests. */
export const HomeworkSubmissionSchema = z.object({
  id: EntityIdSchema,
  type: z.string().max(100),
  note: NoteSchema,
  score: z.number().min(0).max(100).nullable(),
  status: HomeworkSubmissionStatusSchema,
  category: z.string().max(100).nullable(),
  classId: EntityIdSchema,
  lessonId: EntityIdSchema,
  learningCourseId: z.string().max(200).nullable(),
  studentUid: EntityIdSchema,
  markedAt: NullableTimestampSchema,
  markedBy: z.string().max(500).nullable(),
  submittedAt: NullableTimestampSchema,
  submittedCount: z.number().int().nonnegative(),
  content: z.object({
    attachments: z.array(z.string().min(1).max(2_000)).max(50),
  }),
});
export type HomeworkSubmission = z.infer<typeof HomeworkSubmissionSchema>;

export const HomeworkLoadResponseSchema = successEnvelope(z.object({
  classId: EntityIdSchema,
  students: z.array(HomeworkStudentSchema).max(2_000),
  lessons: z.array(HomeworkLessonSchema).max(1_000),
  submissions: z.array(HomeworkSubmissionSchema).max(10_000),
}));
export type HomeworkLoadResponse = z.infer<typeof HomeworkLoadResponseSchema>;

export const HomeworkAttachmentRequestSchema = z.object({
  classId: EntityIdSchema,
  submissionId: EntityIdSchema,
  key: z.string().min(1).max(2_000),
});
export type HomeworkAttachmentRequest = z.infer<typeof HomeworkAttachmentRequestSchema>;
export const HomeworkDownloadUrlResponseSchema = successEnvelope(z.object({ url: z.string().url().max(4_000) }));
export type HomeworkDownloadUrlResponse = z.infer<typeof HomeworkDownloadUrlResponseSchema>;
export const HomeworkCacheResponseSchema = successEnvelope(z.object({
  r2Key: z.string().min(1).max(4_000),
  size: z.number().int().nonnegative().nullable(),
  contentType: z.string().max(500).nullable(),
}));
export type HomeworkCacheResponse = z.infer<typeof HomeworkCacheResponseSchema>;

export const HomeworkMarkRequestSchema = z.object({
  classId: EntityIdSchema,
  id: EntityIdSchema,
  score: z.coerce.number().min(0).max(100),
  note: NoteSchema.default(''),
});
export type HomeworkMarkRequest = z.infer<typeof HomeworkMarkRequestSchema>;
export const HomeworkBatchMarkItemSchema = HomeworkMarkRequestSchema.omit({ classId: true });
export type HomeworkBatchMarkItem = z.infer<typeof HomeworkBatchMarkItemSchema>;
export const HomeworkBatchMarkRequestSchema = z.object({
  classId: EntityIdSchema,
  submissions: z.array(HomeworkBatchMarkItemSchema).min(1).max(BATCH_MAX_ITEMS),
});
export type HomeworkBatchMarkRequest = z.infer<typeof HomeworkBatchMarkRequestSchema>;

export const HomeworkMarkedSubmissionSchema = z.object({
  id: EntityIdSchema,
  score: z.number().min(0).max(100),
  status: z.string().max(100),
  markedAt: NullableTimestampSchema,
  markedBy: z.string().max(500).nullable(),
});
export type HomeworkMarkedSubmission = z.infer<typeof HomeworkMarkedSubmissionSchema>;
export const HomeworkMarkResponseSchema = successEnvelope(z.object({ submission: HomeworkMarkedSubmissionSchema }));
export type HomeworkMarkResponse = z.infer<typeof HomeworkMarkResponseSchema>;

export const HomeworkBatchMarkResultSchema = z.discriminatedUnion('success', [
  z.object({ id: EntityIdSchema, success: z.literal(true), submission: HomeworkMarkedSubmissionSchema }),
  z.object({ id: EntityIdSchema, success: z.literal(false), error: z.string().min(1).max(1_000) }),
]);
export type HomeworkBatchMarkResult = z.infer<typeof HomeworkBatchMarkResultSchema>;
export const HomeworkBatchMarkResponseSchema = successEnvelope(z.object({
  total: z.number().int().nonnegative(),
  successCount: z.number().int().nonnegative(),
  failureCount: z.number().int().nonnegative(),
  results: z.array(HomeworkBatchMarkResultSchema).max(BATCH_MAX_ITEMS),
}));
export type HomeworkBatchMarkResponse = z.infer<typeof HomeworkBatchMarkResponseSchema>;

export const HomeworkAiOptionsSchema = z.object({
  modelId: ModelIdSchema.default(''),
  customModelId: ModelIdSchema.default(''),
  thinkingLevel: ThinkingLevelSchema.optional(),
  apiKey: EphemeralApiKeySchema.optional(),
});
export const HomeworkAiGradeRequestSchema = HomeworkAiOptionsSchema.extend({
  classId: EntityIdSchema,
  submissionId: EntityIdSchema,
  lessonName: z.string().max(500),
  studentName: z.string().max(500),
  attachments: z.array(z.string().min(1).max(2_000)).max(50).optional(),
});
export type HomeworkAiGradeRequest = z.infer<typeof HomeworkAiGradeRequestSchema>;
export const HomeworkAiGradeResponseSchema = successEnvelope(z.object({
  score: z.number().min(0).max(100),
  note: NoteSchema,
}));
export type HomeworkAiGradeResponse = z.infer<typeof HomeworkAiGradeResponseSchema>;

export const GradingJobScopeSchema = HomeworkAiOptionsSchema.extend({
  submissions: z.array(HomeworkSubmissionSchema).min(1).max(BATCH_MAX_ITEMS),
  students: z.array(HomeworkStudentSchema).max(2_000),
  lessons: z.array(HomeworkLessonSchema).max(1_000),
});
export type GradingJobScope = z.infer<typeof GradingJobScopeSchema>;
export const GradingJobCreateRequestSchema = GradingJobScopeSchema.extend({ classId: EntityIdSchema });
export type GradingJobCreateRequest = z.infer<typeof GradingJobCreateRequestSchema>;
export const GradingJobRetryRequestSchema = GradingJobScopeSchema;
export type GradingJobRetryRequest = z.infer<typeof GradingJobRetryRequestSchema>;

export const GradingJobStatusSchema = z.enum(['queued', 'running', 'completed', 'cancelled']);
export const GradingJobItemStatusSchema = z.enum(['queued', 'processing', 'completed', 'failed', 'cancelled']);
export const GradingJobSchema = z.object({
  id: EntityIdSchema,
  classId: EntityIdSchema,
  status: GradingJobStatusSchema,
  totalItems: z.number().int().nonnegative(),
  completedItems: z.number().int().nonnegative(),
  failedItems: z.number().int().nonnegative(),
  createdAt: z.string().max(100),
  updatedAt: z.string().max(100),
  cancelledAt: NullableTimestampSchema,
});
export type GradingJob = z.infer<typeof GradingJobSchema>;
export const GradingJobItemSchema = z.object({
  id: EntityIdSchema,
  submissionId: EntityIdSchema,
  studentUid: z.string().max(200),
  lessonId: z.string().max(200),
  status: GradingJobItemStatusSchema,
  score: z.number().min(0).max(100).nullable(),
  note: z.string().max(10_000).nullable(),
  error: z.string().max(2_000).nullable(),
  result: z.unknown().nullable(),
  createdAt: z.string().max(100),
  updatedAt: z.string().max(100),
});
export type GradingJobItem = z.infer<typeof GradingJobItemSchema>;
export const GradingJobResponseSchema = successEnvelope(z.object({
  job: GradingJobSchema,
  items: z.array(GradingJobItemSchema).max(BATCH_MAX_ITEMS),
}));
export type GradingJobResponse = z.infer<typeof GradingJobResponseSchema>;
export const GradingJobCreateResponseSchema = successEnvelope(z.object({ job: GradingJobSchema }));
export type GradingJobCreateResponse = z.infer<typeof GradingJobCreateResponseSchema>;
export const GradingJobCancelResponseSchema = successEnvelope(z.object({ job: GradingJobSchema }));
export type GradingJobCancelResponse = z.infer<typeof GradingJobCancelResponseSchema>;
export const GradingJobRetryResponseSchema = successEnvelope(z.object({ job: GradingJobSchema, queued: z.number().int().nonnegative() }));
export type GradingJobRetryResponse = z.infer<typeof GradingJobRetryResponseSchema>;

/**
 * Frozen runtime queue contract. This intentionally does not reuse bounded HTTP schemas:
 * messages already accepted from legacy producers must remain decodable after HTTP limits change.
 */
export const LegacyGradingQueueSubmissionSchema = z.object({
  id: z.string(),
}).passthrough();
export type GradingQueueSubmission = z.infer<typeof LegacyGradingQueueSubmissionSchema>;

/** Required legacy top-level fields stay frozen; version 1 is additive and optional. */
export const LegacyGradingQueueMessageSchema = z.object({
  version: z.literal(1).optional(),
  jobId: z.string(),
  itemId: z.string(),
  sessionId: z.string(),
  classId: z.string(),
  submission: LegacyGradingQueueSubmissionSchema,
  studentName: z.string(),
  lessonName: z.string(),
  modelId: z.string().optional(),
  customModelId: z.string().optional(),
  thinkingLevel: z.string().optional(),
  apiKey: z.string().optional(),
});
export type GradingQueueMessage = z.infer<typeof LegacyGradingQueueMessageSchema>;

/** Backward-compatible export name for existing queue producers and consumers. */
export const GradingQueueSubmissionSchema = LegacyGradingQueueSubmissionSchema;
export const GradingQueueMessageSchema = LegacyGradingQueueMessageSchema;

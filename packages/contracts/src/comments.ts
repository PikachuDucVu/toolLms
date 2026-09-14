import { z } from 'zod';
import { COMMENT_MAX_LENGTH, EntityIdSchema, NOTE_MAX_LENGTH, successEnvelope } from './common';
import { LearningLevelSchema } from './assessments';

const PreservedNonEmptyTextSchema = z.string().min(1).max(COMMENT_MAX_LENGTH).refine((value) => value.trim().length > 0, {
  message: 'Text must not be blank',
});

export const CommentGenerationSourceSchema = z.enum(['ai', 'ai_repair', 'safe_template']);
export type CommentGenerationSource = z.infer<typeof CommentGenerationSourceSchema>;
export const CommentGenerationTransportSchema = z.enum(['server', 'direct']);
export type CommentGenerationTransport = z.infer<typeof CommentGenerationTransportSchema>;
export const CommentGenerationMetaSchema = z.object({
  source: CommentGenerationSourceSchema,
  transport: CommentGenerationTransportSchema,
  validationIssues: z.array(z.string().max(1_000)).max(100).default([]),
});
export type CommentGenerationMeta = z.infer<typeof CommentGenerationMetaSchema>;

export const CommentAttendanceStatusSchema = z.enum([
  'ATTENDED',
  'LATE_ARRIVED',
  'ABSENT',
  'ABSENT_WITH_NOTICE',
  'ABSENT_WITHOUT_NOTICE',
  'NOT_ATTENDED',
  'UNKNOWN',
]);
export type CommentAttendanceStatus = z.infer<typeof CommentAttendanceStatusSchema>;

export const CommentHomeworkStatusSchema = z.object({
  shouldMention: z.boolean().optional(),
  previousSession: z.number().int().positive().max(500).optional(),
  submitted: z.boolean(),
  marked: z.boolean().optional(),
  evaluationNote: z.string().max(1_500).optional(),
  score: z.union([z.string().max(100), z.number().finite(), z.null()]).optional(),
  status: z.string().max(100).optional(),
  lessonName: z.string().max(500).optional(),
});
export type CommentHomeworkStatus = z.infer<typeof CommentHomeworkStatusSchema>;

export const PastCommentAreaSchema = z.object({
  type: z.string().max(100),
  content: z.string().max(COMMENT_MAX_LENGTH).optional(),
});
export const PastCommentSlotSchema = z.object({
  index: z.union([z.number().int().nonnegative().max(500), z.string().max(100)]),
  commentByAreas: z.array(PastCommentAreaSchema).max(2_000),
});
export type PastCommentSlot = z.infer<typeof PastCommentSlotSchema>;

export const GenerateCommentRequestSchema = z.object({
  classId: EntityIdSchema,
  slotId: EntityIdSchema,
  studentId: EntityIdSchema,
  studentName: z.string().trim().min(1).max(500),
  studentCallName: z.string().trim().min(1).max(500).optional(),
  pastSlots: z.array(PastCommentSlotSchema).max(500).default([]),
  sessionSummary: z.string().max(3_000),
  teacherNote: z.string().max(NOTE_MAX_LENGTH),
  learningLevel: LearningLevelSchema,
  attendanceStatus: CommentAttendanceStatusSchema,
  isLate: z.boolean().optional(),
  homeworkStatus: CommentHomeworkStatusSchema.nullable().optional(),
  modelId: z.string().trim().min(1).max(500).optional(),
  customModelId: z.string().trim().max(500).optional(),
  thinkingLevel: z.string().max(100).optional(),
  commentLength: z.enum(['short', 'medium', 'long']).default('medium'),
  customPrompt: z.string().max(2_000).default(''),
  apiKey: z.string().max(2_000).optional(),
  sessionNumber: z.number().int().positive().max(500).optional(),
});
export type GenerateCommentRequest = z.infer<typeof GenerateCommentRequestSchema>;
export const GenerateCommentResponseSchema = successEnvelope(z.object({
  comment: PreservedNonEmptyTextSchema,
  meta: CommentGenerationMetaSchema,
}));
export type GenerateCommentResponse = z.infer<typeof GenerateCommentResponseSchema>;

export const SaveSummaryRequestSchema = z.object({
  classId: EntityIdSchema,
  summary: PreservedNonEmptyTextSchema,
});
export type SaveSummaryRequest = z.infer<typeof SaveSummaryRequestSchema>;
export const SaveSummaryResponseSchema = successEnvelope(z.object({
  slotId: EntityIdSchema,
  summary: PreservedNonEmptyTextSchema,
  saved: z.literal(true),
}));
export type SaveSummaryResponse = z.infer<typeof SaveSummaryResponseSchema>;

export const SubmitCommentRequestSchema = z.object({
  classId: EntityIdSchema,
  studentId: EntityIdSchema,
  attendanceId: EntityIdSchema,
  comment: PreservedNonEmptyTextSchema,
  summary: PreservedNonEmptyTextSchema.optional(),
  learningLevel: LearningLevelSchema.optional(),
  generationMeta: CommentGenerationMetaSchema.optional(),
});
export type SubmitCommentRequest = z.infer<typeof SubmitCommentRequestSchema>;
export const SubmitCommentResponseSchema = successEnvelope(z.object({
  slotId: EntityIdSchema,
  studentId: EntityIdSchema,
  attendanceId: EntityIdSchema,
  submitted: z.literal(true),
  summaryIncluded: z.boolean(),
  logged: z.boolean(),
}));
export type SubmitCommentResponse = z.infer<typeof SubmitCommentResponseSchema>;

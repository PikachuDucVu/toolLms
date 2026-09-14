import { z } from 'zod';
import { COMMENT_MAX_LENGTH, EntityIdSchema, successEnvelope } from './common';

const PreservedTextSchema = z.string().min(1).max(COMMENT_MAX_LENGTH).refine((value) => value.trim().length > 0, {
  message: 'Text must not be blank',
});

export const SummaryModeSchema = z.enum(['required', 'optional']);
export type SummaryMode = z.infer<typeof SummaryModeSchema>;

export const DemoFallbackKindSchema = z.enum(['GA', 'GB', 'HACKATHON']);
export type DemoFallbackKind = z.infer<typeof DemoFallbackKindSchema>;

export const DemoQuestionDefinitionSchema = z.object({
  id: EntityIdSchema,
  title: z.string().max(500),
  maxScore: z.number().finite().positive().max(100),
});
export type DemoQuestionDefinition = z.infer<typeof DemoQuestionDefinitionSchema>;

export const DemoResolvedSchemaSchema = z.object({
  source: z.enum(['dynamic', 'fallback']),
  fallbackKind: DemoFallbackKindSchema.nullable(),
  label: z.string().max(500),
  questions: z.array(DemoQuestionDefinitionSchema).min(1).max(100),
  maxScore: z.number().finite().positive().max(1_000),
});
export type DemoResolvedSchema = z.infer<typeof DemoResolvedSchemaSchema>;

export const DemoCustomScoreSchema = z.object({
  questionId: EntityIdSchema,
  score: z.number().finite().nonnegative().max(100),
});
export type DemoCustomScore = z.infer<typeof DemoCustomScoreSchema>;

export const DemoSchemaResponseSchema = successEnvelope(z.object({ schema: DemoResolvedSchemaSchema }));
export type DemoSchemaResponse = z.infer<typeof DemoSchemaResponseSchema>;

export const DemoRandomPreviewRequestSchema = z.object({
  classId: EntityIdSchema,
  minScore: z.number().finite().min(0).max(5).optional(),
  maxScore: z.number().finite().min(0).max(5).optional(),
  minPercent: z.number().finite().min(0).max(100).optional(),
  maxPercent: z.number().finite().min(0).max(100).optional(),
}).superRefine((value, ctx) => {
  if (value.minScore !== undefined && value.maxScore !== undefined && value.minScore > value.maxScore) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['minScore'], message: 'minScore must be less than or equal to maxScore' });
  }
  if (value.minPercent !== undefined && value.maxPercent !== undefined && value.minPercent > value.maxPercent) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['minPercent'], message: 'minPercent must be less than or equal to maxPercent' });
  }
});
export type DemoRandomPreviewRequest = z.infer<typeof DemoRandomPreviewRequestSchema>;

export const DemoSubmitRequestSchema = z.object({
  classId: EntityIdSchema,
  studentId: EntityIdSchema,
  attendanceId: EntityIdSchema,
  summaryMode: SummaryModeSchema,
  summary: PreservedTextSchema.optional(),
  customScores: z.array(DemoCustomScoreSchema).max(100).optional(),
  autoRate: z.boolean().default(true),
}).superRefine((value, ctx) => {
  if (value.summaryMode === 'required' && value.summary === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['summary'], message: 'Summary is required for this request mode' });
  }
});
export type DemoSubmitRequest = z.infer<typeof DemoSubmitRequestSchema>;

export const DemoScoreResultSchema = DemoQuestionDefinitionSchema.extend({ score: z.number().finite().nonnegative() });
export type DemoScoreResult = z.infer<typeof DemoScoreResultSchema>;
export const DemoRandomPreviewResponseSchema = successEnvelope(z.object({
  schema: DemoResolvedSchemaSchema,
  questions: z.array(DemoScoreResultSchema).min(1).max(100),
  demoScore: z.number().finite().nonnegative(),
}));
export type DemoRandomPreviewResponse = z.infer<typeof DemoRandomPreviewResponseSchema>;

export const DemoSubmitResultSchema = z.object({
  slotId: EntityIdSchema,
  studentId: EntityIdSchema,
  attendanceId: EntityIdSchema,
  submitted: z.literal(true),
  summaryIncluded: z.boolean(),
  logged: z.boolean(),
  schema: DemoResolvedSchemaSchema,
  questions: z.array(DemoScoreResultSchema).min(1).max(100),
  demoScore: z.number().finite().nonnegative(),
  abilityScore: z.number().finite().nonnegative(),
  totalScore: z.number().finite().nonnegative(),
  rank: z.enum(['A', 'B', 'C', 'D']),
});
export type DemoSubmitResult = z.infer<typeof DemoSubmitResultSchema>;
export const DemoSubmitResponseSchema = successEnvelope(DemoSubmitResultSchema);
export type DemoSubmitResponse = z.infer<typeof DemoSubmitResponseSchema>;

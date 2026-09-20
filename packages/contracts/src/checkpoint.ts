import { z } from 'zod';
import { COMMENT_MAX_LENGTH, EntityIdSchema, successEnvelope } from './common';
import { SummaryModeSchema } from './demo';

const PreservedTextSchema = z.string().min(1).max(COMMENT_MAX_LENGTH).refine((value) => value.trim().length > 0, {
  message: 'Text must not be blank',
});

export const CheckpointNumberSchema = z.union([z.literal(1), z.literal(2)]);
export type CheckpointNumber = z.infer<typeof CheckpointNumberSchema>;

export const CheckpointScoreSchema = z.number().finite().min(0).max(5).refine(
  (value) => Math.abs(value * 2 - Math.round(value * 2)) <= 0.0001,
  { message: 'Checkpoint scores must use 0.5 increments' },
);

export const CheckpointScoreInputSchema = z.discriminatedUnion('strategy', [
  z.object({ strategy: z.literal('auto') }),
  z.object({
    strategy: z.literal('explicit'),
    theoryScore: CheckpointScoreSchema.nullable(),
    practiceScore: CheckpointScoreSchema.nullable(),
  }),
]);
export type CheckpointScoreInput = z.infer<typeof CheckpointScoreInputSchema>;

const CheckpointSubmitBaseSchema = z.object({
  classId: EntityIdSchema,
  studentId: EntityIdSchema,
  attendanceId: EntityIdSchema,
  summaryMode: SummaryModeSchema,
  summary: PreservedTextSchema.optional(),
  scores: CheckpointScoreInputSchema,
});

export const CheckpointSubmitRequestSchema = z.discriminatedUnion('mode', [
  CheckpointSubmitBaseSchema.extend({
    mode: z.literal('score_only'),
    comment: PreservedTextSchema.optional(),
  }),
  CheckpointSubmitBaseSchema.extend({
    mode: z.literal('full'),
    comment: PreservedTextSchema,
  }),
]).superRefine((value, ctx) => {
  if (value.summaryMode === 'required' && value.summary === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['summary'], message: 'Summary is required for this request mode' });
  }
});
export type CheckpointSubmitRequest = z.infer<typeof CheckpointSubmitRequestSchema>;

export const CheckpointQuestionResultSchema = z.object({
  number: z.number().int().min(1).max(10),
  correct: z.boolean(),
  score: z.union([z.literal(0), z.literal(0.5)]),
});
export type CheckpointQuestionResult = z.infer<typeof CheckpointQuestionResultSchema>;

export const CheckpointSubmitResultSchema = z.object({
  slotId: EntityIdSchema,
  studentId: EntityIdSchema,
  attendanceId: EntityIdSchema,
  submitted: z.literal(true),
  mode: z.enum(['score_only', 'full']),
  summaryIncluded: z.boolean(),
  logged: z.boolean(),
  theoryScore: CheckpointScoreSchema,
  practiceScore: CheckpointScoreSchema,
  totalScore: z.number().finite().min(0).max(5),
  rank: z.enum(['A', 'B', 'C', 'D']),
  questions: z.array(CheckpointQuestionResultSchema).length(10),
});
export type CheckpointSubmitResult = z.infer<typeof CheckpointSubmitResultSchema>;
export const CheckpointSubmitResponseSchema = successEnvelope(CheckpointSubmitResultSchema);
export type CheckpointSubmitResponse = z.infer<typeof CheckpointSubmitResponseSchema>;

export const GenerateCheckpointCommentRequestSchema = z.object({
  classId: EntityIdSchema,
  slotId: EntityIdSchema,
  studentId: EntityIdSchema,
  teacherDescription: z.string().max(10_000).default(''),
  modelId: z.string().trim().min(1).max(500).optional(),
  customModelId: z.string().trim().max(500).optional(),
  thinkingLevel: z.string().max(100).optional(),
  apiKey: z.string().max(2_000).optional(),
});
export type GenerateCheckpointCommentRequest = z.infer<typeof GenerateCheckpointCommentRequestSchema>;
export const GenerateCheckpointCommentResponseSchema = successEnvelope(z.object({ comment: PreservedTextSchema }));
export type GenerateCheckpointCommentResponse = z.infer<typeof GenerateCheckpointCommentResponseSchema>;

export const CheckpointBranchSchema = z.enum(['original', 'makeup']);
export type CheckpointBranch = z.infer<typeof CheckpointBranchSchema>;

export const CheckpointExamSchema = z.object({
  id: EntityIdSchema,
  branch: CheckpointBranchSchema,
  title: z.string().max(500),
  status: z.string().max(100),
  practiceType: z.string().max(100).nullable(),
});
export type CheckpointExam = z.infer<typeof CheckpointExamSchema>;

export const CheckpointSubmissionLinkSchema = z.object({
  kind: z.enum(['scratch', 'essay']),
  label: z.string().min(1).max(500),
  url: z.string().url().max(5_000),
});
export type CheckpointSubmissionLink = z.infer<typeof CheckpointSubmissionLinkSchema>;

export const CheckpointStudentBranchStatusSchema = z.object({
  branch: CheckpointBranchSchema,
  submittedAt: z.string().min(1).max(200),
  practiceType: z.string().max(100).nullable(),
  links: z.array(CheckpointSubmissionLinkSchema).max(100),
});
export type CheckpointStudentBranchStatus = z.infer<typeof CheckpointStudentBranchStatusSchema>;

export const CheckpointStudentStatusSchema = z.object({
  studentId: EntityIdSchema,
  original: CheckpointStudentBranchStatusSchema.nullable(),
  makeup: CheckpointStudentBranchStatusSchema.nullable(),
  defaultBranch: CheckpointBranchSchema.nullable(),
});
export type CheckpointStudentStatus = z.infer<typeof CheckpointStudentStatusSchema>;

export const CheckpointStatusResultSchema = z.object({
  classId: EntityIdSchema,
  checkpoint: CheckpointNumberSchema,
  original: CheckpointExamSchema.nullable(),
  makeup: CheckpointExamSchema.nullable(),
  students: z.array(CheckpointStudentStatusSchema).max(2_000),
});
export type CheckpointStatusResult = z.infer<typeof CheckpointStatusResultSchema>;
export const CheckpointStatusResponseSchema = successEnvelope(CheckpointStatusResultSchema);
export type CheckpointStatusResponse = z.infer<typeof CheckpointStatusResponseSchema>;

export const CheckpointEssayQuestionModeSchema = z.enum(['TEXT', 'FILES', 'TEXT_AND_FILES']);
export type CheckpointEssayQuestionMode = z.infer<typeof CheckpointEssayQuestionModeSchema>;

export const CheckpointEssayQuestionConfigSchema = z.object({
  question: z.number().int().min(1).max(50),
  mode: CheckpointEssayQuestionModeSchema,
  maxFiles: z.number().int().min(1).max(20),
});
export type CheckpointEssayQuestionConfig = z.infer<typeof CheckpointEssayQuestionConfigSchema>;

export const CheckpointGradeEssayFileSchema = z.object({
  question: z.string().min(1).max(20),
  key: z.string().min(1).max(2_000),
  url: z.string().min(1).max(5_000),
  fileName: z.string().min(1).max(500),
  contentType: z.string().max(200),
  size: z.number().finite().nonnegative(),
});
export type CheckpointGradeEssayFile = z.infer<typeof CheckpointGradeEssayFileSchema>;

export const CheckpointGradeExamMetaSchema = z.object({
  id: EntityIdSchema,
  className: z.string().max(500),
  checkpoint: z.number().int().min(1).max(4),
  status: z.string().max(100),
  practiceType: z.string().max(100),
  mcQuestionCount: z.number().int().min(0).max(50),
  essayQuestionCount: z.number().int().min(0).max(50),
  essayQuestionConfigs: z.array(CheckpointEssayQuestionConfigSchema).max(50),
  pdfPath: z.string().min(1).max(2_000),
});
export type CheckpointGradeExamMeta = z.infer<typeof CheckpointGradeExamMetaSchema>;

export const CheckpointGradeSubmissionSchema = z.object({
  studentId: EntityIdSchema,
  studentName: z.string().max(500),
  examId: EntityIdSchema,
  submittedAt: z.string().min(1).max(200),
  mcAnswers: z.record(z.string(), z.string().max(200)).default({}),
  essayAnswers: z.record(z.string(), z.string().max(50_000)).default({}),
  essayFiles: z.array(CheckpointGradeEssayFileSchema).max(100),
});
export type CheckpointGradeSubmission = z.infer<typeof CheckpointGradeSubmissionSchema>;

export const CheckpointGradeBranchPayloadSchema = z.object({
  newestExamId: EntityIdSchema,
  exams: z.record(z.string(), CheckpointGradeExamMetaSchema),
  submissions: z.record(z.string(), CheckpointGradeSubmissionSchema),
});
export type CheckpointGradeBranchPayload = z.infer<typeof CheckpointGradeBranchPayloadSchema>;

export const CheckpointGradePayloadSchema = z.object({
  classId: EntityIdSchema,
  checkpoint: CheckpointNumberSchema,
  original: CheckpointGradeBranchPayloadSchema.nullable(),
  makeup: CheckpointGradeBranchPayloadSchema.nullable(),
});
export type CheckpointGradePayload = z.infer<typeof CheckpointGradePayloadSchema>;

export const CheckpointMcKeyItemSchema = z.object({
  number: z.number().int().min(1).max(50),
  correct: z.string().min(1).max(20),
  explanation: z.string().max(2_000).optional().default(''),
});
export type CheckpointMcKeyItem = z.infer<typeof CheckpointMcKeyItemSchema>;

export const CheckpointEssayRubricItemSchema = z.object({
  number: z.number().int().min(1).max(50),
  prompt: z.string().max(5_000).default(''),
  rubric: z.string().max(5_000).default(''),
});
export type CheckpointEssayRubricItem = z.infer<typeof CheckpointEssayRubricItemSchema>;

export const CheckpointExamKeySchema = z.object({
  mc: z.array(CheckpointMcKeyItemSchema).max(50),
  essay: z.array(CheckpointEssayRubricItemSchema).max(50),
});
export type CheckpointExamKey = z.infer<typeof CheckpointExamKeySchema>;

export const CheckpointMcGradeItemSchema = z.object({
  number: z.number().int().min(1).max(50),
  studentAnswer: z.string().max(50).default(''),
  correctAnswer: z.string().max(50).default(''),
  correct: z.boolean(),
});
export type CheckpointMcGradeItem = z.infer<typeof CheckpointMcGradeItemSchema>;

export const CheckpointEssayGradeItemSchema = z.object({
  number: z.number().int().min(1).max(50),
  score: CheckpointScoreSchema,
  note: z.string().max(2_000).default(''),
});
export type CheckpointEssayGradeItem = z.infer<typeof CheckpointEssayGradeItemSchema>;

export const CheckpointGradeResultSchema = z.object({
  studentId: EntityIdSchema,
  examId: EntityIdSchema,
  branch: CheckpointBranchSchema,
  skippedScratch: z.literal(true),
  theoryScore: CheckpointScoreSchema.nullable(),
  practiceScore: CheckpointScoreSchema.nullable(),
  mc: z.object({
    total: z.number().int().min(0).max(50),
    correct: z.number().int().min(0).max(50),
    items: z.array(CheckpointMcGradeItemSchema).max(50),
  }),
  essay: z.object({
    notes: z.string().max(5_000).default(''),
    items: z.array(CheckpointEssayGradeItemSchema).max(50),
  }),
  teacherNotes: z.string().max(5_000).default(''),
});
export type CheckpointGradeResult = z.infer<typeof CheckpointGradeResultSchema>;
export const CheckpointGradeResponseSchema = successEnvelope(CheckpointGradeResultSchema);
export type CheckpointGradeResponse = z.infer<typeof CheckpointGradeResponseSchema>;

export const GradeCheckpointRequestSchema = z.object({
  classId: EntityIdSchema,
  slotId: EntityIdSchema,
  studentId: EntityIdSchema,
  checkpoint: CheckpointNumberSchema,
  branch: CheckpointBranchSchema.optional(),
  modelId: z.string().trim().min(1).max(500).optional(),
  customModelId: z.string().trim().max(500).optional(),
  thinkingLevel: z.string().max(100).optional(),
  apiKey: z.string().max(2_000).optional(),
});
export type GradeCheckpointRequest = z.infer<typeof GradeCheckpointRequestSchema>;

import { z } from 'zod';
import { EntityIdSchema, successEnvelope } from './common';

export const ASSESSMENT_NOTE_MAX_LENGTH = 4_000;
export const ASSESSMENT_PREVIOUS_SLOT_IDS_MAX_ITEMS = 100;
export const ASSESSMENTS_MAX_ITEMS = 500;

export const LearningLevelSchema = z.enum([
  'independent',
  'understands_and_asks',
  'needs_prompting',
  'needs_support',
]);
export type LearningLevel = z.infer<typeof LearningLevelSchema>;

export const AssessmentNoteSchema = z.string().max(ASSESSMENT_NOTE_MAX_LENGTH);
export const AssessmentTimestampSchema = z.iso.datetime({ offset: true });

const StoredAssessmentSchema = z.object({
  id: EntityIdSchema,
  studentId: EntityIdSchema,
  slotId: EntityIdSchema,
  classId: EntityIdSchema,
  learningLevel: LearningLevelSchema,
  note: AssessmentNoteSchema,
  createdAt: AssessmentTimestampSchema,
  updatedAt: AssessmentTimestampSchema,
});

export const CurrentAssessmentSchema = StoredAssessmentSchema.extend({
  inherited: z.literal(false),
  sourceSlotId: EntityIdSchema,
});
export type CurrentAssessment = z.infer<typeof CurrentAssessmentSchema>;

export const InheritedAssessmentSchema = StoredAssessmentSchema.extend({
  inherited: z.literal(true),
  sourceSlotId: EntityIdSchema,
  note: z.literal(''),
});
export type InheritedAssessment = z.infer<typeof InheritedAssessmentSchema>;

export const AssessmentSchema = z.discriminatedUnion('inherited', [
  CurrentAssessmentSchema,
  InheritedAssessmentSchema,
]);
export type Assessment = z.infer<typeof AssessmentSchema>;

export const AssessmentLoadQuerySchema = z.object({
  classId: EntityIdSchema,
  previousSlotIds: z.array(EntityIdSchema).max(ASSESSMENT_PREVIOUS_SLOT_IDS_MAX_ITEMS).default([]),
});
export type AssessmentLoadQuery = z.infer<typeof AssessmentLoadQuerySchema>;

export const AssessmentLoadResponseSchema = successEnvelope(z.object({
  assessments: z.array(AssessmentSchema).max(ASSESSMENTS_MAX_ITEMS),
}));
export type AssessmentLoadResponse = z.infer<typeof AssessmentLoadResponseSchema>;

export const AssessmentSaveRequestSchema = z.object({
  classId: EntityIdSchema,
  learningLevel: LearningLevelSchema,
  note: AssessmentNoteSchema,
});
export type AssessmentSaveRequest = z.infer<typeof AssessmentSaveRequestSchema>;

export const AssessmentLearningLevelRequestSchema = z.object({
  classId: EntityIdSchema,
  learningLevel: LearningLevelSchema,
});
export type AssessmentLearningLevelRequest = z.infer<typeof AssessmentLearningLevelRequestSchema>;

export const AssessmentSaveResponseSchema = successEnvelope(z.object({
  assessment: CurrentAssessmentSchema,
}));
export type AssessmentSaveResponse = z.infer<typeof AssessmentSaveResponseSchema>;
export const AssessmentLearningLevelResponseSchema = AssessmentSaveResponseSchema;
export type AssessmentLearningLevelResponse = AssessmentSaveResponse;

// Compatibility aliases for consumers created during the v2 foundation phase.
export const AssessmentsResponseSchema = AssessmentLoadResponseSchema;
export type AssessmentsResponse = AssessmentLoadResponse;
export const SaveAssessmentRequestSchema = AssessmentSaveRequestSchema;
export type SaveAssessmentRequest = AssessmentSaveRequest;
export const PatchLearningLevelRequestSchema = AssessmentLearningLevelRequestSchema;
export type PatchLearningLevelRequest = AssessmentLearningLevelRequest;
export const AssessmentResponseSchema = AssessmentSaveResponseSchema;
export type AssessmentResponse = AssessmentSaveResponse;

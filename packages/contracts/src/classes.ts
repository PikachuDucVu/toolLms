import { z } from 'zod';
import { EntityIdSchema, successEnvelope } from './common';

const NullableIdSchema = EntityIdSchema.nullable();
const NullableNumberSchema = z.number().finite().nullable();
const NullableResultSchema = z.union([z.boolean(), z.string().max(30_000), z.number().finite()]).nullable();

export const ClassStatusSchema = z.string().trim().min(1).max(100);
export const CourseSummarySchema = z.object({
  id: EntityIdSchema,
  name: z.string().max(500),
  shortName: z.string().max(200),
});
export type CourseSummary = z.infer<typeof CourseSummarySchema>;

export const ClassSiteSchema = z.object({
  id: EntityIdSchema,
  name: z.string().max(500),
});
export type ClassSite = z.infer<typeof ClassSiteSchema>;

export const ClassCommentProgressSchema = z.object({
  state: z.enum(['unknown', 'pending', 'done']),
  badgeText: z.enum(['Chưa có dữ liệu', 'Chưa nhận xét', 'Đã nhận xét']),
  slotNumber: z.number().int().positive().nullable(),
  present: z.number().int().nonnegative().nullable(),
  completed: z.number().int().nonnegative().nullable(),
  missing: z.number().int().nonnegative().nullable(),
});
export type ClassCommentProgress = z.infer<typeof ClassCommentProgressSchema>;

/** Normalized class data shared by the class selector and homework workflow. */
export const ClassSummarySchema = z.object({
  id: EntityIdSchema,
  name: z.string().trim().min(1).max(500),
  status: ClassStatusSchema,
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  recentlyEnded: z.boolean(),
  course: CourseSummarySchema.nullable(),
  sites: z.array(ClassSiteSchema).max(100),
  slotCount: z.number().int().nonnegative().max(500),
  commentProgress: ClassCommentProgressSchema,
});
export type ClassSummary = z.infer<typeof ClassSummarySchema>;

export const ClassesResponseSchema = successEnvelope(z.object({
  classes: z.array(ClassSummarySchema).max(500),
}));
export type ClassesResponse = z.infer<typeof ClassesResponseSchema>;

export const CommentRateSchema = z.object({
  value: z.union([z.string().max(500), z.number().finite()]).nullable(),
  commentSamples: z.array(z.string().max(30_000)).max(500),
});
export type CommentRate = z.infer<typeof CommentRateSchema>;

export const CourseProcessCommentAreaSchema = z.object({
  id: EntityIdSchema,
  name: z.string().max(500),
  type: z.string().max(100),
  rates: z.array(CommentRateSchema).max(500),
});
export type CourseProcessCommentArea = z.infer<typeof CourseProcessCommentAreaSchema>;

export const FinalEvaluationSchema = z.object({
  id: EntityIdSchema,
  title: z.string().max(500),
  commentAreas: z.array(CourseProcessCommentAreaSchema).max(500),
});
export type FinalEvaluation = z.infer<typeof FinalEvaluationSchema>;

export const DemoCriterionSchema = z.object({
  id: EntityIdSchema,
  title: z.string().max(500),
  maxScore: z.number().finite().nonnegative(),
});
export type DemoCriterion = z.infer<typeof DemoCriterionSchema>;

export const DemoCommentAreaSchema = z.object({
  id: EntityIdSchema,
  name: z.string().max(500),
  type: z.string().max(100),
  demo: z.array(DemoCriterionSchema).max(100),
});
export type DemoCommentArea = z.infer<typeof DemoCommentAreaSchema>;

export const CourseProcessSchema = z.object({
  id: EntityIdSchema,
  name: z.string().max(500),
  finalSession: z.object({
    finalEvaluations: z.array(FinalEvaluationSchema).max(500),
    demoScore: z.object({
      id: EntityIdSchema,
      commentAreas: z.array(DemoCommentAreaSchema).max(500),
    }).nullable(),
  }).nullable(),
});
export type CourseProcess = z.infer<typeof CourseProcessSchema>;

export const CheckpointQuestionSchema = z.object({
  id: EntityIdSchema,
  title: z.string().max(500),
  result: NullableResultSchema,
  score: NullableNumberSchema,
});
export type CheckpointQuestion = z.infer<typeof CheckpointQuestionSchema>;

export const CheckpointResultSchema = z.object({
  practiceScore: NullableNumberSchema,
  checkpointScore: NullableNumberSchema,
  checkpointQuestions: z.array(CheckpointQuestionSchema).max(500),
});
export type CheckpointResult = z.infer<typeof CheckpointResultSchema>;

export const DemoQuestionResultSchema = z.object({
  courseProcessDemoDetailId: NullableIdSchema,
  title: z.string().max(500),
  result: NullableResultSchema,
  score: NullableNumberSchema,
  maxScore: NullableNumberSchema,
});
export type DemoQuestionResult = z.infer<typeof DemoQuestionResultSchema>;

/** Full normalized LMS area payload retained for Phase 9 checkpoint/final/demo builders. */
export const CommentByAreaSchema = z.object({
  grade: NullableNumberSchema,
  content: z.string().max(30_000),
  commentAreaId: NullableIdSchema,
  type: z.string().max(100),
  checkpoint: CheckpointResultSchema.nullable(),
  courseProcessDemoId: NullableIdSchema,
  courseProcessFinalEvaluationTitle: z.string().max(500).nullable(),
  courseProcessFinalEvaluationId: NullableIdSchema,
  demoQuestions: z.array(DemoQuestionResultSchema).max(500),
});
export type CommentByArea = z.infer<typeof CommentByAreaSchema>;

export const StudentAttendanceSchema = z.object({
  id: EntityIdSchema,
  studentId: EntityIdSchema,
  displayName: z.string().max(500),
  status: z.string().max(100),
  commentByAreas: z.array(CommentByAreaSchema).max(2_000),
});
export type StudentAttendance = z.infer<typeof StudentAttendanceSchema>;

export const SlotSchema = z.object({
  id: EntityIdSchema,
  index: z.number().int(),
  date: z.string().nullable(),
  summary: z.string().max(30_000),
  studentAttendance: z.array(StudentAttendanceSchema).max(2_000),
});
export type Slot = z.infer<typeof SlotSchema>;

/** Complete read DTO for comments now and assessment/review/demo/checkpoint phases later. */
export const ClassDetailSchema = ClassSummarySchema.extend({
  courseProcessId: NullableIdSchema,
  courseProcess: CourseProcessSchema.nullable(),
  slots: z.array(SlotSchema).max(500),
});
export type ClassDetail = z.infer<typeof ClassDetailSchema>;
export const ClassDetailResponseSchema = successEnvelope(z.object({ class: ClassDetailSchema }));
export type ClassDetailResponse = z.infer<typeof ClassDetailResponseSchema>;

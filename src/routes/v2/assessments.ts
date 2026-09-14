import { Hono, type Context } from "hono";
import {
  AssessmentLearningLevelRequestSchema,
  AssessmentLoadQuerySchema,
  AssessmentSaveRequestSchema,
  EntityIdSchema,
  type CurrentAssessment,
} from "@tool-lms/contracts";
import type { Env } from "../../types";
import type { RequestContextVariables } from "../../middleware/requestContext";
import {
  AssessmentClassConflictError,
  getSlotAssessments,
  upsertStudentLearningLevel,
  upsertStudentSessionAssessment,
  type EffectiveStudentSessionAssessment,
  type StudentSessionAssessment,
} from "../../services/assessmentService";
import { parseV2Json, requireV2Session, v2Error, v2Success } from "./helpers";

interface V2Bindings { Bindings: Env; Variables: RequestContextVariables }
type V2Context = Context<V2Bindings>;

export const v2AssessmentsRoutes = new Hono<V2Bindings>();

v2AssessmentsRoutes.get("/:slotId/assessments", async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;
  const slotId = pathId(c, "slotId");
  if (slotId instanceof Response) return slotId;

  const search = new URL(c.req.url).searchParams;
  const query = AssessmentLoadQuerySchema.safeParse({
    classId: search.get("classId"),
    previousSlotIds: search.getAll("previousSlotId"),
  });
  if (!query.success) {
    return v2Error(c, "VALIDATION_ERROR", "Thông tin tải đánh giá không hợp lệ.", 422, query.error.flatten());
  }

  const assessments = await getSlotAssessments(
    c.env,
    teacherEmail(session.email),
    slotId,
    query.data.classId,
    query.data.previousSlotIds,
  );
  return v2Success(c, { assessments: Object.values(assessments).map(effectiveAssessmentDto) });
});

v2AssessmentsRoutes.put("/:slotId/assessments/:studentId", async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;
  const ids = assessmentPathIds(c);
  if (ids instanceof Response) return ids;
  const body = await parseV2Json(c, AssessmentSaveRequestSchema);
  if (body instanceof Response) return body;

  try {
    const assessment = await upsertStudentSessionAssessment(c.env, {
      teacherEmail: teacherEmail(session.email),
      classId: body.classId,
      slotId: ids.slotId,
      studentId: ids.studentId,
      learningLevel: body.learningLevel,
      note: body.note,
    });
    return v2Success(c, { assessment: currentAssessmentDto(assessment) });
  } catch (error) {
    return classConflict(c, error);
  }
});

v2AssessmentsRoutes.patch("/:slotId/assessments/:studentId/learning-level", async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;
  const ids = assessmentPathIds(c);
  if (ids instanceof Response) return ids;
  const body = await parseV2Json(c, AssessmentLearningLevelRequestSchema);
  if (body instanceof Response) return body;

  try {
    const assessment = await upsertStudentLearningLevel(c.env, {
      teacherEmail: teacherEmail(session.email),
      classId: body.classId,
      slotId: ids.slotId,
      studentId: ids.studentId,
      learningLevel: body.learningLevel,
    });
    return v2Success(c, { assessment: currentAssessmentDto(assessment) });
  } catch (error) {
    return classConflict(c, error);
  }
});

function teacherEmail(email: string): string {
  return email.trim().toLowerCase();
}

function pathId(c: V2Context, name: string): string | Response {
  const parsed = EntityIdSchema.safeParse(c.req.param(name));
  return parsed.success
    ? parsed.data
    : v2Error(c, "VALIDATION_ERROR", "Định danh đánh giá không hợp lệ.", 422, parsed.error.flatten());
}

function assessmentPathIds(c: V2Context): { slotId: string; studentId: string } | Response {
  const slotId = pathId(c, "slotId");
  if (slotId instanceof Response) return slotId;
  const studentId = pathId(c, "studentId");
  return studentId instanceof Response ? studentId : { slotId, studentId };
}

function currentAssessmentDto(assessment: StudentSessionAssessment): CurrentAssessment {
  return {
    ...assessment,
    inherited: false,
    sourceSlotId: assessment.slotId,
  };
}

function effectiveAssessmentDto(assessment: EffectiveStudentSessionAssessment) {
  return assessment.inherited
    ? { ...assessment, inherited: true as const, note: "" as const }
    : { ...assessment, inherited: false as const };
}

function classConflict(c: V2Context, error: unknown): Response {
  if (error instanceof AssessmentClassConflictError) {
    return v2Error(c, "CONFLICT", error.message, 409);
  }
  throw error;
}

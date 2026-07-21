import { Hono, type Context } from "hono";
import { isLearningLevel } from "../constants/learningLevels";
import {
  AssessmentClassConflictError,
  getSlotAssessments,
  upsertStudentSessionAssessment,
} from "../services/assessmentService";
import type { Env } from "../types";
import { requireSession, readJsonBody } from "./helpers";

export const assessmentsRoutes = new Hono<{ Bindings: Env }>();

const MAX_ID_LENGTH = 200;
const MAX_NOTE_LENGTH = 4000;

function normalizedId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.length <= MAX_ID_LENGTH ? normalized : null;
}

assessmentsRoutes.get("/assessments/:slotId", async (c) => {
  const session = await requireSession(c);
  if (session instanceof Response) return session;

  const slotId = normalizedId(c.req.param("slotId"));
  if (!slotId) return c.json({ success: false, error: "Invalid slot id" }, { status: 400 });

  const teacherEmail = session.email.trim().toLowerCase();
  if (!teacherEmail) return c.json({ success: false, error: "Invalid session email" }, { status: 400 });

  const assessments = await getSlotAssessments(c.env, teacherEmail, slotId);
  return c.json({ success: true, assessments });
});

async function upsertAssessment(c: Context<{ Bindings: Env }>) {
  const session = await requireSession(c);
  if (session instanceof Response) return session;

  const slotId = normalizedId(c.req.param("slotId"));
  const studentId = normalizedId(c.req.param("studentId"));
  const body = await readJsonBody<{
    class_id?: unknown;
    classId?: unknown;
    learning_level?: unknown;
    learningLevel?: unknown;
    note?: unknown;
  }>(c);

  const classIdValue = body.class_id ?? body.classId;
  const classId = normalizedId(classIdValue);
  const learningLevel = body.learning_level ?? body.learningLevel;
  const note = body.note ?? "";

  if (!slotId || !studentId || !classId) {
    return c.json({ success: false, error: "Invalid class, slot, or student id" }, { status: 400 });
  }
  if (!isLearningLevel(learningLevel)) {
    return c.json({ success: false, error: "Invalid learning level" }, { status: 400 });
  }
  if (typeof note !== "string" || note.length > MAX_NOTE_LENGTH) {
    return c.json({ success: false, error: "Invalid note" }, { status: 400 });
  }

  const teacherEmail = session.email.trim().toLowerCase();
  if (!teacherEmail) return c.json({ success: false, error: "Invalid session email" }, { status: 400 });

  try {
    const assessment = await upsertStudentSessionAssessment(c.env, {
      teacherEmail,
      classId,
      slotId,
      studentId,
      learningLevel,
      note,
    });
    return c.json({ success: true, assessment });
  } catch (error) {
    if (error instanceof AssessmentClassConflictError) {
      return c.json({ success: false, error: error.message }, { status: 409 });
    }
    throw error;
  }
}

assessmentsRoutes.put("/assessments/:slotId/:studentId", upsertAssessment);
assessmentsRoutes.post("/assessments/:slotId/:studentId", upsertAssessment);

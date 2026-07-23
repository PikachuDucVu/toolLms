import { Hono, type Context } from "hono";
import { isLearningLevel } from "../constants/learningLevels";
import {
  AssessmentClassConflictError,
  getSlotAssessments,
  upsertStudentLearningLevel,
  upsertStudentSessionAssessment,
} from "../services/assessmentService";
import type { Env } from "../types";
import { requireSession, readJsonBody } from "./helpers";

export const assessmentsRoutes = new Hono<{ Bindings: Env }>();

const MAX_ID_LENGTH = 200;
const MAX_NOTE_LENGTH = 4000;
const MAX_PREVIOUS_SLOT_IDS = 100;

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

  const classIdValue = c.req.query("class_id") ?? c.req.query("classId");
  const classId = classIdValue === undefined ? undefined : normalizedId(classIdValue);
  if (classIdValue !== undefined && !classId) {
    return c.json({ success: false, error: "Invalid class id" }, { status: 400 });
  }

  const previousSlotValues = c.req.queries("previous_slot_id") ?? [];
  if (previousSlotValues.length > MAX_PREVIOUS_SLOT_IDS) {
    return c.json({ success: false, error: "Too many previous slot ids" }, { status: 400 });
  }
  const previousSlotIds = previousSlotValues.map(normalizedId);
  if (previousSlotIds.some((id) => !id)) {
    return c.json({ success: false, error: "Invalid previous slot id" }, { status: 400 });
  }

  const assessments = await getSlotAssessments(
    c.env,
    teacherEmail,
    slotId,
    classId ?? undefined,
    previousSlotIds as string[],
  );
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

assessmentsRoutes.patch("/assessments/:slotId/:studentId/learning-level", async (c) => {
  const session = await requireSession(c);
  if (session instanceof Response) return session;

  const slotId = normalizedId(c.req.param("slotId"));
  const studentId = normalizedId(c.req.param("studentId"));
  const body = await readJsonBody<{
    class_id?: unknown;
    classId?: unknown;
    learning_level?: unknown;
    learningLevel?: unknown;
  }>(c);
  const classId = normalizedId(body.class_id ?? body.classId);
  const learningLevel = body.learning_level ?? body.learningLevel;

  if (!slotId || !studentId || !classId) {
    return c.json({ success: false, error: "Invalid class, slot, or student id" }, { status: 400 });
  }
  if (!isLearningLevel(learningLevel)) {
    return c.json({ success: false, error: "Invalid learning level" }, { status: 400 });
  }

  const teacherEmail = session.email.trim().toLowerCase();
  if (!teacherEmail) return c.json({ success: false, error: "Invalid session email" }, { status: 400 });

  try {
    const assessment = await upsertStudentLearningLevel(c.env, {
      teacherEmail,
      classId,
      slotId,
      studentId,
      learningLevel,
    });
    return c.json({ success: true, assessment });
  } catch (error) {
    if (error instanceof AssessmentClassConflictError) {
      return c.json({ success: false, error: error.message }, { status: 409 });
    }
    throw error;
  }
});

assessmentsRoutes.put("/assessments/:slotId/:studentId", upsertAssessment);
assessmentsRoutes.post("/assessments/:slotId/:studentId", upsertAssessment);

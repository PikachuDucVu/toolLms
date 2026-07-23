import { normalizeLearningLevel, type LearningLevel } from "../constants/learningLevels";
import type { Env } from "../types";

export interface StudentSessionAssessment {
  id: string;
  classId: string;
  slotId: string;
  studentId: string;
  learningLevel: LearningLevel;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface EffectiveStudentSessionAssessment extends StudentSessionAssessment {
  inherited: boolean;
  sourceSlotId: string;
}

interface AssessmentRow {
  id: string;
  class_id: string;
  slot_id: string;
  student_id: string;
  learning_level: LearningLevel;
  note: string;
  created_at: string;
  updated_at: string;
}

export class AssessmentClassConflictError extends Error {
  constructor() {
    super("Buổi học đã được lưu với một lớp khác");
    this.name = "AssessmentClassConflictError";
  }
}

function assessmentId(): string {
  return crypto.randomUUID();
}

function mapAssessment(row: AssessmentRow): StudentSessionAssessment {
  return {
    id: row.id,
    classId: row.class_id,
    slotId: row.slot_id,
    studentId: row.student_id,
    learningLevel: normalizeLearningLevel(row.learning_level),
    note: row.note || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getSlotAssessments(
  env: Env,
  teacherEmail: string,
  slotId: string,
  classId?: string,
  previousSlotIds: string[] = [],
): Promise<Record<string, EffectiveStudentSessionAssessment>> {
  const currentResult = await env.DB.prepare(
    `SELECT id, class_id, slot_id, student_id, learning_level, note, created_at, updated_at
     FROM student_session_assessments
     WHERE teacher_email = ? AND slot_id = ?`,
  )
    .bind(teacherEmail, slotId)
    .all<AssessmentRow>();

  const assessments: Record<string, EffectiveStudentSessionAssessment> = {};
  for (const row of currentResult.results ?? []) {
    assessments[row.student_id] = {
      ...mapAssessment(row),
      inherited: false,
      sourceSlotId: row.slot_id,
    };
  }

  const uniquePreviousSlotIds = Array.from(new Set(previousSlotIds)).filter((id) => id !== slotId);
  if (!classId || uniquePreviousSlotIds.length === 0) return assessments;

  const placeholders = uniquePreviousSlotIds.map(() => "?").join(", ");
  const previousResult = await env.DB.prepare(
    `SELECT id, class_id, slot_id, student_id, learning_level, note, created_at, updated_at
     FROM student_session_assessments
     WHERE teacher_email = ? AND class_id = ? AND slot_id IN (${placeholders})`,
  )
    .bind(teacherEmail, classId, ...uniquePreviousSlotIds)
    .all<AssessmentRow>();

  const slotPriority = new Map(uniquePreviousSlotIds.map((id, index) => [id, index]));
  const previousRows = [...(previousResult.results ?? [])].sort(
    (left, right) => (slotPriority.get(left.slot_id) ?? Number.MAX_SAFE_INTEGER)
      - (slotPriority.get(right.slot_id) ?? Number.MAX_SAFE_INTEGER),
  );

  for (const row of previousRows) {
    if (assessments[row.student_id]) continue;
    const inherited = mapAssessment(row);
    assessments[row.student_id] = {
      ...inherited,
      note: "",
      inherited: true,
      sourceSlotId: row.slot_id,
    };
  }
  return assessments;
}

export async function upsertStudentLearningLevel(
  env: Env,
  input: {
    teacherEmail: string;
    classId: string;
    slotId: string;
    studentId: string;
    learningLevel: LearningLevel;
  },
): Promise<StudentSessionAssessment> {
  const now = new Date().toISOString();
  const saved = await env.DB.prepare(
    `INSERT INTO student_session_assessments (
       id, teacher_email, class_id, slot_id, student_id, learning_level, note, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, '', ?, ?)
     ON CONFLICT(teacher_email, slot_id, student_id) DO UPDATE SET
       learning_level = excluded.learning_level,
       updated_at = excluded.updated_at
     WHERE student_session_assessments.class_id = excluded.class_id
     RETURNING id, class_id, slot_id, student_id, learning_level, note, created_at, updated_at`,
  )
    .bind(
      assessmentId(),
      input.teacherEmail,
      input.classId,
      input.slotId,
      input.studentId,
      input.learningLevel,
      now,
      now,
    )
    .first<AssessmentRow>();

  if (!saved) throw new AssessmentClassConflictError();
  return mapAssessment(saved);
}

export async function upsertStudentSessionAssessment(
  env: Env,
  input: {
    teacherEmail: string;
    classId: string;
    slotId: string;
    studentId: string;
    learningLevel: LearningLevel;
    note: string;
  },
): Promise<StudentSessionAssessment> {
  const now = new Date().toISOString();
  const note = input.note.trim();

  const saved = await env.DB.prepare(
    `INSERT INTO student_session_assessments (
       id, teacher_email, class_id, slot_id, student_id, learning_level, note, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(teacher_email, slot_id, student_id) DO UPDATE SET
       learning_level = excluded.learning_level,
       note = excluded.note,
       updated_at = excluded.updated_at
     WHERE student_session_assessments.class_id = excluded.class_id
     RETURNING id, class_id, slot_id, student_id, learning_level, note, created_at, updated_at`,
  )
    .bind(
      assessmentId(),
      input.teacherEmail,
      input.classId,
      input.slotId,
      input.studentId,
      input.learningLevel,
      note,
      now,
      now,
    )
    .first<AssessmentRow>();

  if (!saved) throw new AssessmentClassConflictError();
  return mapAssessment(saved);
}

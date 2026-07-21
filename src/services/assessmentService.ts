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
): Promise<Record<string, StudentSessionAssessment>> {
  const result = await env.DB.prepare(
    `SELECT id, class_id, slot_id, student_id, learning_level, note, created_at, updated_at
     FROM student_session_assessments
     WHERE teacher_email = ? AND slot_id = ?`,
  )
    .bind(teacherEmail, slotId)
    .all<AssessmentRow>();

  const assessments: Record<string, StudentSessionAssessment> = {};
  for (const row of result.results ?? []) assessments[row.student_id] = mapAssessment(row);
  return assessments;
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

import { HOMEWORK_SCORE_LOG_MAX, type HomeworkScoreLogEntry, type HomeworkScoreSource } from "@tool-lms/contracts";
import type { Env } from "../types";
import type { NormalizedHomeworkData } from "./homeworkService";
import { structuredLog } from "../observability/structuredLogger";

export interface HomeworkScoreRecord {
  classId: string;
  submissionId: string;
  studentUid?: string;
  studentName?: string;
  lessonId?: string;
  lessonName?: string;
  score: number;
  previousScore?: number | null;
  note?: string;
  source: HomeworkScoreSource;
  jobId?: string | null;
}

/**
 * Appends score history rows. History is best-effort: a logging failure must never
 * turn a score that was already written to the LMS into an error for the teacher.
 */
export async function recordHomeworkScores(env: Env, ownerEmail: string, records: HomeworkScoreRecord[]): Promise<void> {
  if (!ownerEmail || records.length === 0) return;
  try {
    const now = new Date().toISOString();
    const statements = records.map((record) => env.DB.prepare(
      "INSERT INTO homework_score_log (id, owner_email, class_id, submission_id, student_uid, student_name, lesson_id, lesson_name, score, previous_score, note, source, job_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      crypto.randomUUID(),
      ownerEmail,
      record.classId,
      record.submissionId,
      record.studentUid || "",
      record.studentName || "",
      record.lessonId || "",
      record.lessonName || "",
      record.score,
      record.previousScore ?? null,
      record.note || "",
      record.source,
      record.jobId ?? null,
      now,
    ));
    if (typeof env.DB.batch === "function") await env.DB.batch(statements);
    else for (const statement of statements) await statement.run();
  } catch {
    structuredLog("error", { category: "homework_score_log_write_failed" });
  }
}

/** Builds a history record from the canonical homework data the route already loaded. */
export function scoreRecordFromHomework(
  data: NormalizedHomeworkData,
  classId: string,
  submissionId: string,
  score: number,
  note: string,
  source: HomeworkScoreSource,
): HomeworkScoreRecord {
  const submission = data.submissions.find((item) => item.id === submissionId);
  const studentUid = submission?.studentUid || "";
  const lessonId = submission?.lessonId || "";
  return {
    classId,
    submissionId,
    studentUid,
    studentName: data.students.find((student) => student.studentUid === studentUid)?.displayName || "",
    lessonId,
    lessonName: data.lessons.find((lesson) => lesson.id === lessonId)?.name || "",
    score,
    previousScore: submission?.status === "MARKED" ? submission.score : null,
    note,
    source,
  };
}

export async function listHomeworkScoreLog(env: Env, ownerEmail: string, classId: string, limit = HOMEWORK_SCORE_LOG_MAX): Promise<HomeworkScoreLogEntry[]> {
  const bounded = Math.max(1, Math.min(HOMEWORK_SCORE_LOG_MAX, Math.trunc(limit) || HOMEWORK_SCORE_LOG_MAX));
  const rows = await env.DB.prepare(
    "SELECT * FROM homework_score_log WHERE owner_email = ? AND class_id = ? ORDER BY created_at DESC LIMIT ?",
  ).bind(ownerEmail, classId, bounded).all<Record<string, unknown>>();
  return (rows.results ?? []).map(normalizeScoreLogRow);
}

function normalizeScoreLogRow(row: Record<string, unknown>): HomeworkScoreLogEntry {
  const source = row.source === "manual" || row.source === "batch" ? row.source : "ai_job";
  return {
    id: String(row.id || ""),
    classId: String(row.class_id || ""),
    submissionId: String(row.submission_id || ""),
    studentUid: String(row.student_uid || ""),
    studentName: String(row.student_name || ""),
    lessonId: String(row.lesson_id || ""),
    lessonName: String(row.lesson_name || ""),
    score: clampScore(row.score) ?? 0,
    previousScore: clampScore(row.previous_score),
    note: String(row.note || ""),
    source,
    jobId: row.job_id ? String(row.job_id) : null,
    createdAt: String(row.created_at || ""),
  };
}

function clampScore(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : null;
}

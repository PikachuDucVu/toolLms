import type { Env } from "../types";

export interface StudentNote {
  id?: string;
  date: string;
  note: string;
}

function noteId(studentId: string): string {
  return `${studentId}:${crypto.randomUUID()}`;
}

export async function getNotes(env: Env): Promise<Record<string, StudentNote[]>> {
  const result = await env.DB.prepare(
    "SELECT id, student_id, note, created_at FROM student_notes ORDER BY created_at ASC",
  ).all<{ id: string; student_id: string; note: string; created_at: string }>();
  const notes: Record<string, StudentNote[]> = {};
  for (const row of result.results ?? []) {
    notes[row.student_id] ??= [];
    notes[row.student_id].push({ id: row.id, date: row.created_at, note: row.note });
  }
  return notes;
}

export async function addStudentNote(env: Env, studentId: string, note: string): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO student_notes (id, student_id, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(noteId(studentId), studentId, note, now, now)
    .run();
}

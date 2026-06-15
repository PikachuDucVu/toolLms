import type { Env } from "../types";

export interface CommentLogInput {
  class_id?: string;
  class_name?: string;
  session_number?: string | number;
  student_id?: string;
  student_name?: string;
  comment?: string;
  slot_type?: string;
  scores?: unknown;
  success?: boolean;
  [key: string]: unknown;
}

export async function appendCommentLog(env: Env, input: CommentLogInput): Promise<void> {
  const timestamp = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO comment_log (
      id, timestamp, class_id, class_name, session_number, student_id, student_name,
      comment, slot_type, scores_json, success, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      timestamp,
      input.class_id ?? "",
      input.class_name ?? "",
      String(input.session_number ?? ""),
      input.student_id ?? "",
      input.student_name ?? "",
      input.comment ?? "",
      input.slot_type ?? "Default",
      JSON.stringify(input.scores ?? {}),
      input.success === false ? 0 : 1,
      JSON.stringify(input),
    )
    .run();
}

export async function getCommentHistory(
  env: Env,
  filters: { classId?: string | null; studentId?: string | null },
): Promise<CommentLogInput[]> {
  let sql = "SELECT * FROM comment_log WHERE 1 = 1";
  const params: string[] = [];
  if (filters.classId) {
    sql += " AND class_id = ?";
    params.push(filters.classId);
  }
  if (filters.studentId) {
    sql += " AND student_id = ?";
    params.push(filters.studentId);
  }
  sql += " ORDER BY timestamp ASC";
  const result = await env.DB.prepare(sql).bind(...params).all<Record<string, string | number>>();
  return (result.results ?? []).map((row) => ({
    timestamp: String(row.timestamp ?? ""),
    class_id: String(row.class_id ?? ""),
    class_name: String(row.class_name ?? ""),
    session_number: String(row.session_number ?? ""),
    student_id: String(row.student_id ?? ""),
    student_name: String(row.student_name ?? ""),
    comment: String(row.comment ?? ""),
    slot_type: String(row.slot_type ?? "Default"),
    scores: row.scores_json ? JSON.parse(String(row.scores_json)) : {},
    success: Number(row.success ?? 1) === 1,
  }));
}

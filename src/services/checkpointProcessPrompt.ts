import type { CheckpointLearningProcess } from "@tool-lms/contracts";

/** From this many late (or absent) sessions on, the paragraph mentions it — only in general terms. */
export const ATTENDANCE_MENTION_THRESHOLD = 3;

function sessionList(sessions: number[]): string {
  return sessions.map((session) => `buổi ${session}`).join(", ");
}

/**
 * Turns the session-by-session facts into explicit writing instructions, so the
 * rules (skip 1–2 late sessions, name every missing homework) don't depend on the model.
 */
export function buildLearningProcessFacts(process: CheckpointLearningProcess): string {
  const range = `buổi ${process.fromSession} đến buổi ${process.toSession}`;
  const lines: string[] = [`Giai đoạn đánh giá: từ ${range}.`];

  const late = process.lateSessions.length;
  const absent = process.absentSessions.length;
  if (late >= ATTENDANCE_MENTION_THRESHOLD) {
    lines.push("- Giờ giấc: thời gian này con đi học chưa thật sự đúng giờ. Nhắc chung chung, nhẹ nhàng, KHÔNG nêu số buổi hay buổi cụ thể; có thể nhờ phụ huynh nhắc con sắp xếp thời gian.");
  } else {
    lines.push("- Giờ giấc: coi như con đi học đúng giờ. KHÔNG nhắc đến việc đi muộn.");
  }
  if (absent >= ATTENDANCE_MENTION_THRESHOLD) {
    lines.push("- Chuyên cần: con nghỉ học một số buổi trong giai đoạn này. Nhắc chung chung, KHÔNG nêu số buổi hay buổi cụ thể.");
  } else {
    lines.push("- Chuyên cần: KHÔNG nhắc đến việc nghỉ học.");
  }

  if (!process.homework || !process.homework.assignedSessions.length) {
    lines.push("- Bài tập về nhà: không có dữ liệu, KHÔNG nhắc đến bài tập về nhà.");
  } else if (!process.homework.missingSessions.length) {
    lines.push(`- Bài tập về nhà: con nộp đầy đủ BTVN các buổi (${sessionList(process.homework.assignedSessions)}). Ghi nhận con làm bài tập đầy đủ.`);
  } else {
    const missing = sessionList(process.homework.missingSessions);
    const done = process.homework.assignedSessions.length - process.homework.missingSessions.length;
    lines.push(`- Bài tập về nhà: con chưa nộp BTVN ${missing} trên LMS (đã nộp ${done}/${process.homework.assignedSessions.length} bài). Nêu RÕ các buổi còn thiếu và nhờ phụ huynh nhắc con bổ sung.`);
  }

  if (process.previousCheckpointScore !== null) {
    lines.push(`- Điểm Checkpoint 1: ${process.previousCheckpointScore}/5. Nếu điểm lần này khác rõ rệt, có thể nêu sự thay đổi.`);
  }

  if (process.sessionComments.length) {
    lines.push("- Nhận xét giáo viên đã gửi ở các buổi trước (dùng để đánh giá thái độ học tập và khả năng nắm bắt kiến thức, chú ý sự THAY ĐỔI theo thời gian):");
    for (const item of process.sessionComments) lines.push(`  Buổi ${item.session}: ${item.comment}`);
  } else {
    lines.push("- Chưa có nhận xét các buổi trước: đánh giá thái độ và khả năng nắm bắt một cách ngắn gọn, dựa vào mô tả của giáo viên.");
  }
  return lines.join("\n");
}

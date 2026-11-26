import type { CheckpointLearningProcess, ClassDetail, HomeworkLoadResponse, Slot, StudentAttendance } from '@tool-lms/contracts';
import { isPresent, stripHtml } from '../classes/public/domain';
import { homeworkSubmittedForSession, shouldMentionPreviousHomework } from '../comments/public/homework';

const MILESTONE_SESSIONS = new Set([5, 9, 14]);
const COMMENT_MAX_CHARS = 450;

/**
 * Facts for "Đánh giá quá trình học của con": attendance, homework and the daily
 * comments from session 1 up to (and including) the checkpoint session.
 */
export function buildCheckpointLearningProcess(
  detail: ClassDetail,
  slot: Slot,
  studentId: string,
  homework: HomeworkLoadResponse | null,
): CheckpointLearningProcess {
  const currentIndex = Math.max(0, detail.slots.findIndex((item) => item.id === slot.id));
  const toSession = currentIndex + 1;
  const lateSessions: number[] = [];
  const absentSessions: number[] = [];
  const sessionComments: CheckpointLearningProcess['sessionComments'] = [];
  let identity: Pick<StudentAttendance, 'studentId' | 'displayName'> | null = null;
  let previousCheckpointScore: number | null = null;

  detail.slots.slice(0, toSession).forEach((item, index) => {
    const session = index + 1;
    const attendance = item.studentAttendance.find((student) => student.studentId === studentId);
    if (!attendance) return;
    identity = attendance;
    if (attendance.status === 'LATE_ARRIVED') lateSessions.push(session);
    else if (!isPresent(attendance)) absentSessions.push(session);
    if (session === toSession) return;

    if (session === 5 && toSession === 9) previousCheckpointScore = checkpointAverage(attendance);
    if (MILESTONE_SESSIONS.has(session)) return;
    const comment = dailyComment(attendance);
    if (comment) sessionComments.push({ session, comment });
  });

  return {
    fromSession: 1,
    toSession,
    lateSessions,
    absentSessions,
    homework: homework && identity ? homeworkFacts(homework, identity, toSession) : null,
    sessionComments,
    previousCheckpointScore,
  };
}

function homeworkFacts(response: HomeworkLoadResponse, student: Pick<StudentAttendance, 'studentId' | 'displayName'>, toSession: number) {
  const assignedSessions: number[] = [];
  const missingSessions: number[] = [];
  // Same rule as the daily comment: homework of session N is checked in session N+1.
  for (let session = 1; session < toSession; session += 1) {
    if (!shouldMentionPreviousHomework(session + 1)) continue;
    const submitted = homeworkSubmittedForSession(response, session, student);
    if (submitted === null) continue;
    assignedSessions.push(session);
    if (!submitted) missingSessions.push(session);
  }
  return { assignedSessions, missingSessions };
}

function dailyComment(attendance: StudentAttendance): string {
  const area = attendance.commentByAreas.find((item) => item.type === 'CONTENT' && stripHtml(item.content));
  const text = stripHtml(area?.content || attendance.comment || '');
  return text.length > COMMENT_MAX_CHARS ? `${text.slice(0, COMMENT_MAX_CHARS - 1).trimEnd()}…` : text;
}

function checkpointAverage(attendance: StudentAttendance): number | null {
  const scores = attendance.commentByAreas.find((item) => item.type === 'CHECKPOINT')?.checkpoint;
  if (scores?.checkpointScore == null || scores.practiceScore == null) return null;
  return Math.round(((scores.checkpointScore + scores.practiceScore) / 2) * 10) / 10;
}

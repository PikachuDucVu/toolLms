import type { ClassDetail, HomeworkLoadResponse, Slot } from '@tool-lms/contracts';
import { describe, expect, it } from 'vitest';
import { buildCheckpointLearningProcess } from './learningProcess';

const area = { grade: null, commentAreaId: null, checkpoint: null, courseProcessDemoId: null, courseProcessFinalEvaluationTitle: null, courseProcessFinalEvaluationId: null, demoQuestions: [] };
const STATUS: Record<number, string> = { 2: 'LATE_ARRIVED', 4: 'ABSENT', 7: 'LATE_ARRIVED' };

function slot(session: number): Slot {
  const commentByAreas = session === 5
    ? [{ ...area, type: 'CHECKPOINT', content: '', checkpoint: { practiceScore: 3, checkpointScore: 4, checkpointQuestions: [] } }, { ...area, type: 'CONTENT', content: 'Điểm mạnh: ...' }]
    : session < 9 && session !== 4 ? [{ ...area, type: 'CONTENT', content: `<p>Nhận xét buổi ${session}</p>` }] : [];
  return { id: `slot-${session}`, index: session - 1, date: null, summary: '', studentAttendance: [
    { id: `att-${session}`, studentId: 'student-1', displayName: 'Nguyễn An', status: STATUS[session] ?? 'ATTENDED', commentByAreas },
  ] };
}

const slots = Array.from({ length: 14 }, (_, i) => slot(i + 1));
const detail = { id: 'class-1', slots } as unknown as ClassDetail;
const lesson = (n: number) => ({ id: `lesson-${n}`, name: `Buổi ${n}: Bài tập`, type: 'HOMEWORK', isActive: true, displayOrder: n });
const submission = (n: number) => ({ id: `sub-${n}`, type: 'HOMEWORK', note: '', score: null, status: 'SUBMITTED' as const, category: null, classId: 'class-1', lessonId: `lesson-${n}`, learningCourseId: null, studentUid: 'student-1', markedAt: null, markedBy: null, submittedAt: '2026-01-01', submittedCount: 1, content: { attachments: [] } });
const homework: HomeworkLoadResponse = { success: true, requestId: 'hw', data: {
  classId: 'class-1',
  students: [{ id: 'student-1', studentUid: 'student-1', displayName: 'Nguyễn An' }],
  lessons: [1, 2, 3, 6, 7].map(lesson),
  submissions: [1, 2, 3, 7].map(submission),
} };

describe('buildCheckpointLearningProcess', () => {
  it('collects attendance, homework, daily comments and the first checkpoint score up to checkpoint 2', () => {
    const process = buildCheckpointLearningProcess(detail, slots[8], 'student-1', homework);
    expect(process).toMatchObject({ fromSession: 1, toSession: 9, lateSessions: [2, 7], absentSessions: [4], previousCheckpointScore: 3.5 });
    expect(process.homework).toEqual({ assignedSessions: [1, 2, 3, 6, 7], missingSessions: [6] });
    // Checkpoint sessions and sessions without a comment are left out; HTML is stripped.
    expect(process.sessionComments.map((item) => item.session)).toEqual([1, 2, 3, 6, 7, 8]);
    expect(process.sessionComments[0].comment).toBe('Nhận xét buổi 1');
  });

  it('only looks at sessions before checkpoint 1 and drops homework when it is unavailable', () => {
    const process = buildCheckpointLearningProcess(detail, slots[4], 'student-1', null);
    expect(process).toMatchObject({ toSession: 5, lateSessions: [2], absentSessions: [4], homework: null, previousCheckpointScore: null });
    expect(process.sessionComments.map((item) => item.session)).toEqual([1, 2, 3]);
  });
});

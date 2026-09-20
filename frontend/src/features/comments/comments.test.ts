import type { ClassDetail } from '@tool-lms/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAssessmentStore } from '../assessments/assessmentStore';
import { useCommentStore } from './commentStore';
import { classZaloText, individualZaloText, regularCommentsCsv } from './copyExport';
import { copyExportFixtures } from './copyExport.testFixtures';
import { getStudentCallName, hasUnsavedComments, homeworkStatuses, pastCommentSlots } from './selectors';

const detail = fixtureDetail();

beforeEach(() => { useCommentStore.getState().reset(); useAssessmentStore.getState().reset(); });

describe('comment workflow store and selectors', () => {
  it('tracks generated/manual drafts independently and clears AI provenance after editing', () => {
    useCommentStore.getState().activate({ classId: 'class-1', slotId: 'slot-2', epoch: 1 }, 'Tóm tắt');
    useCommentStore.getState().setDraft('student-1', { content: 'AI draft', kind: 'generated', generationMeta: { source: 'ai_repair', transport: 'server', validationIssues: ['Đã sửa'] } });
    expect(hasUnsavedComments(useCommentStore.getState())).toBe(true);
    useCommentStore.getState().editDraft('student-1', 'Giáo viên sửa');
    expect(useCommentStore.getState().drafts['student-1']).toEqual({ content: 'Giáo viên sửa', kind: 'manual', generationMeta: null });
    useCommentStore.getState().setDraft('student-2', { content: 'Bản nháp khác', kind: 'manual', generationMeta: null });
    useCommentStore.getState().removeDraft('student-1');
    expect(useCommentStore.getState().drafts).toEqual({ 'student-2': { content: 'Bản nháp khác', kind: 'manual', generationMeta: null } });
  });

  it('distinguishes duplicate Vietnamese call names and snapshots normalized past comments', () => {
    const roster = detail.slots[1].studentAttendance;
    expect(getStudentCallName('Nguyễn Văn An', roster)).toBe('Văn An');
    expect(getStudentCallName('Trần Minh An', roster)).toBe('Minh An');
    expect(getStudentCallName('Lê Chi', roster)).toBe('Chi');
    expect(pastCommentSlots(detail, detail.slots[1], 'student-1')).toEqual([{ index: 1, commentByAreas: [{ type: 'CONTENT', content: '<p>Buổi trước</p>' }] }]);
    const legacyDetail = {
      ...detail,
      slots: [
        { ...detail.slots[0], studentAttendance: [{ id: 'legacy-attendance', studentId: 'student-1', displayName: 'Nguyễn Văn An', status: 'ATTENDED' as const, comment: 'Dũng có thái độ học tập tích cực', commentByAreas: [] }] },
        detail.slots[1],
      ],
    };
    expect(pastCommentSlots(legacyDetail, legacyDetail.slots[1], 'student-1')).toEqual([{ index: 1, commentByAreas: [{ type: 'CONTENT', content: 'Dũng có thái độ học tập tích cực' }] }]);
  });

  it('derives previous-homework facts only for legacy-supported regular sessions', () => {
    const response = { success: true as const, requestId: 'fixture', data: {
      classId: 'class-1', students: [{ id: 'row-1', studentUid: 'student-1', displayName: 'Nguyễn Văn An' }],
      lessons: [{ id: 'lesson-1', name: 'BTVN buổi 1', type: 'HOMEWORK', isActive: true, displayOrder: 1 }],
      submissions: [{ id: 'submission-1', type: 'UPLOAD_FILE', note: 'Làm đúng vòng lặp', score: 90, status: 'MARKED' as const, category: null, classId: 'class-1', lessonId: 'lesson-1', learningCourseId: null, studentUid: 'student-1', markedAt: '2026-01-01', markedBy: 'Teacher', submittedAt: '2026-01-01', submittedCount: 1, content: { attachments: [] } }],
    } };
    expect(homeworkStatuses(response, 2, detail.slots[1].studentAttendance)['student-1']).toMatchObject({ previousSession: 1, submitted: true, marked: true, evaluationNote: 'Làm đúng vòng lặp', lessonName: 'BTVN buổi 1' });
    expect(homeworkStatuses(response, 6, detail.slots[1].studentAttendance)['student-1']).toBeNull();
  });
});

describe('copy and export parity helpers', () => {
  it('matches exact individual and class Zalo fixtures', () => {
    expect(individualZaloText('Nguyễn Văn An', '<p>Con học tốt.</p>', 'Vòng lặp')).toBe(copyExportFixtures.individualZalo);
    const result = classZaloText({ slot: detail.slots[1], sessionNumber: 2, summary: 'Vòng lặp', drafts: { 'student-1': { content: 'Con chủ động.', kind: 'manual', generationMeta: null } } });
    expect(result).toEqual({ count: 1, text: copyExportFixtures.classZalo });
  });

  it('matches the exact quoted UTF-8 CSV fixture', () => {
    useAssessmentStore.setState({ drafts: { 'student-1': { learningLevel: 'independent', note: 'Nhanh, "chính xác"' } } });
    const csv = regularCommentsCsv(detail.slots[1].studentAttendance, { 'student-1': { content: 'AI draft', kind: 'generated', generationMeta: null } }, useAssessmentStore.getState());
    expect(csv).toBe(copyExportFixtures.csv);
  });
});

function fixtureDetail(): ClassDetail {
  const area = (content: string) => ({ grade: null, content, commentAreaId: 'content', type: 'CONTENT', checkpoint: null, courseProcessDemoId: null, courseProcessFinalEvaluationTitle: null, courseProcessFinalEvaluationId: null, demoQuestions: [] });
  const common = { id: 'class-1', name: 'Lớp A', status: 'RUNNING', startDate: null, endDate: null, recentlyEnded: false, course: null, sites: [], slotCount: 2, commentProgress: { state: 'pending' as const, badgeText: 'Chưa nhận xét' as const, slotNumber: 2, present: 2, completed: 0, missing: 2 }, courseProcessId: null, courseProcess: null };
  return { ...common, slots: [
    { id: 'slot-1', index: 0, date: '2026-01-01', summary: '', studentAttendance: [{ id: 'old-attendance', studentId: 'student-1', displayName: 'Nguyễn Văn An', status: 'ATTENDED', commentByAreas: [area('<p>Buổi trước</p>')] }] },
    { id: 'slot-2', index: 1, date: '2026-01-02', summary: '', studentAttendance: [
      { id: 'attendance-1', studentId: 'student-1', displayName: 'Nguyễn Văn An', status: 'ATTENDED', commentByAreas: [] },
      { id: 'attendance-2', studentId: 'student-2', displayName: 'Trần Minh An', status: 'LATE_ARRIVED', commentByAreas: [] },
      { id: 'attendance-3', studentId: 'student-3', displayName: 'Lê Chi', status: 'ABSENT_WITH_NOTICE', commentByAreas: [] },
    ] },
  ] };
}

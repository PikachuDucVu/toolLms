import type { CheckpointStatusResult, Slot } from '@tool-lms/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { activateCheckpointContext, hydrateCheckpointContext, resetCheckpointController } from './checkpointController';
import { dirtyCheckpointStudentIds, effectiveCheckpointComment, hasUnsavedCheckpointWork, isCheckpointOperationActive, useCheckpointStore } from './checkpointStore';

const slot: Slot = {
  id: 'slot-5', index: 4, date: null, summary: 'Tổng kết cũ', studentAttendance: [
    { id: 'attendance-1', studentId: 'student-1', displayName: 'An', status: 'ATTENDED', commentByAreas: [checkpointArea(4, 4.5)] },
    { id: 'attendance-2', studentId: 'student-2', displayName: 'Bình', status: 'LATE_ARRIVED', commentByAreas: [] },
  ],
};

beforeEach(() => { resetCheckpointController(); useCheckpointStore.getState().reset(); });

describe('checkpoint store', () => {
  it('isolates score, description, comments and expansion by class/slot/student key', () => {
    const context = activateCheckpointContext('class-1', slot.id, 1, 'Tổng kết cũ');
    hydrateCheckpointContext(context, slot, { 'student-1': 'Ghi chú An', 'student-2': 'Ghi chú Bình' });
    useCheckpointStore.getState().setTheoryInput('student-1', '5');
    useCheckpointStore.getState().setTeacherDescription('student-1', 'Mô tả mới');
    useCheckpointStore.getState().setManualComment('student-1', 'Nhận xét tay');
    useCheckpointStore.getState().setExpanded('student-1', true);
    expect(useCheckpointStore.getState().drafts['student-1']).toMatchObject({ theoryInput: '5', practiceInput: '4.5', teacherDescription: 'Mô tả mới', manualComment: 'Nhận xét tay', currentComment: 'Nhận xét tay', provenance: 'manual' });
    expect(useCheckpointStore.getState().drafts['student-2']).toMatchObject({ theoryInput: '', practiceInput: '', teacherDescription: 'Ghi chú Bình', manualComment: '' });
    expect(useCheckpointStore.getState().expanded).toEqual({ 'student-1': true });
    expect(dirtyCheckpointStudentIds()).toEqual(['student-1']);
    expect(hasUnsavedCheckpointWork()).toBe(true);

    activateCheckpointContext('class-2', 'slot-9', 2, 'Khác');
    expect(useCheckpointStore.getState().drafts).toEqual({});
    expect(useCheckpointStore.getState().expanded).toEqual({});
    expect(useCheckpointStore.getState().context).toMatchObject({ classId: 'class-2', slotId: 'slot-9', checkpoint: 2 });
  });

  it('reconciles clean same-slot baselines field-by-field while preserving dirty newer edits', () => {
    const context = activateCheckpointContext('class-1', slot.id, 1, 'Tổng kết cũ');
    hydrateCheckpointContext(context, slot, { 'student-1': 'Ghi chú cũ' });
    useCheckpointStore.getState().setManualComment('student-1', 'Giáo viên đang sửa');
    useCheckpointStore.getState().setTeacherDescription('student-1', 'Mô tả đang sửa');
    const refreshed: Slot = {
      ...slot,
      summary: 'Tổng kết máy chủ mới',
      studentAttendance: [
        { ...slot.studentAttendance[0], commentByAreas: [checkpointArea(5, 3.5)] },
        slot.studentAttendance[1],
      ],
    };
    hydrateCheckpointContext(context, refreshed, { 'student-1': 'Ghi chú máy chủ mới' }, refreshed.summary);
    expect(useCheckpointStore.getState().drafts['student-1']).toMatchObject({ theoryInput: '5', practiceInput: '3.5', teacherDescription: 'Mô tả đang sửa', manualComment: 'Giáo viên đang sửa' });
    expect(useCheckpointStore.getState().synced['student-1']).toMatchObject({ theoryInput: '5', practiceInput: '3.5', teacherDescription: 'Ghi chú máy chủ mới', manualComment: '' });
    expect(useCheckpointStore.getState().summaryDraft).toBe('Tổng kết máy chủ mới');
    expect(hasUnsavedCheckpointWork()).toBe(true);

    useCheckpointStore.getState().discardUnsaved();
    expect(useCheckpointStore.getState().drafts['student-1']).toMatchObject({ teacherDescription: 'Ghi chú máy chủ mới', manualComment: '', theoryInput: '5', practiceInput: '3.5' });
    expect(hasUnsavedCheckpointWork()).toBe(false);
  });

  it('reconciles theory/practice baselines and submission results independently', () => {
    const context = activateCheckpointContext('class-1', slot.id, 1);
    hydrateCheckpointContext(context, slot);
    useCheckpointStore.getState().setTheoryInput('student-1', '5');
    useCheckpointStore.getState().setPracticeInput('student-2', '4');
    const theoryDirtyVersion = useCheckpointStore.getState().drafts['student-1'].theoryVersion;
    const practiceCleanVersion = useCheckpointStore.getState().drafts['student-1'].practiceVersion;
    const theoryCleanVersion = useCheckpointStore.getState().drafts['student-2'].theoryVersion;
    const practiceDirtyVersion = useCheckpointStore.getState().drafts['student-2'].practiceVersion;
    const refreshed: Slot = {
      ...slot,
      studentAttendance: [
        { ...slot.studentAttendance[0], commentByAreas: [checkpointArea(3.5, 3)] },
        { ...slot.studentAttendance[1], commentByAreas: [checkpointArea(4.5, 2.5)] },
      ],
    };
    hydrateCheckpointContext(context, refreshed);
    expect(useCheckpointStore.getState().drafts['student-1']).toMatchObject({ theoryInput: '5', practiceInput: '3', theoryVersion: theoryDirtyVersion });
    expect(useCheckpointStore.getState().drafts['student-1'].practiceVersion).toBeGreaterThan(practiceCleanVersion);
    expect(useCheckpointStore.getState().drafts['student-2']).toMatchObject({ theoryInput: '4.5', practiceInput: '4', practiceVersion: practiceDirtyVersion });
    expect(useCheckpointStore.getState().drafts['student-2'].theoryVersion).toBeGreaterThan(theoryCleanVersion);
    expect(useCheckpointStore.getState().synced['student-1']).toMatchObject({ theoryInput: '3.5', practiceInput: '3' });
    expect(useCheckpointStore.getState().synced['student-2']).toMatchObject({ theoryInput: '4.5', practiceInput: '2.5' });

    const submitted1 = { ...useCheckpointStore.getState().drafts['student-1'] };
    useCheckpointStore.getState().setTheoryInput('student-1', '4.5');
    useCheckpointStore.getState().applySubmitSuccess('student-1', result('student-1', 'attendance-1', 4, 4.5), submitted1, false);
    expect(useCheckpointStore.getState().drafts['student-1']).toMatchObject({ theoryInput: '4.5', practiceInput: '4.5' });
    expect(useCheckpointStore.getState().synced['student-1']).toMatchObject({ theoryInput: '3.5', practiceInput: '4.5' });

    const submitted2 = { ...useCheckpointStore.getState().drafts['student-2'] };
    useCheckpointStore.getState().setPracticeInput('student-2', '5');
    useCheckpointStore.getState().applySubmitSuccess('student-2', result('student-2', 'attendance-2', 4, 4.5), submitted2, false);
    expect(useCheckpointStore.getState().drafts['student-2']).toMatchObject({ theoryInput: '4', practiceInput: '5' });
    expect(useCheckpointStore.getState().synced['student-2']).toMatchObject({ theoryInput: '4', practiceInput: '2.5' });
  });

  it('applies generated comments only to the captured description/comment version and clears full submits only when unchanged', () => {
    const context = activateCheckpointContext('class-1', slot.id, 1);
    hydrateCheckpointContext(context, slot);
    const initial = { ...useCheckpointStore.getState().drafts['student-1'] };
    useCheckpointStore.getState().setManualComment('student-1', 'Bản mới hơn');
    expect(useCheckpointStore.getState().applyGeneratedComment('student-1', '<p>AI cũ</p>', initial.descriptionVersion, initial.commentVersion)).toBe(false);
    expect(useCheckpointStore.getState().drafts['student-1'].manualComment).toBe('Bản mới hơn');

    const current = { ...useCheckpointStore.getState().drafts['student-1'] };
    expect(useCheckpointStore.getState().applyGeneratedComment('student-1', '<p>AI mới</p>', current.descriptionVersion, current.commentVersion)).toBe(true);
    expect(useCheckpointStore.getState().drafts['student-1']).toMatchObject({ generatedComment: '<p>AI mới</p>', currentComment: 'AI mới', provenance: 'generated' });
    expect(effectiveCheckpointComment(useCheckpointStore.getState().drafts['student-1'])).toBe('<p>AI mới</p>');
    useCheckpointStore.getState().setCurrentComment('student-1', 'AI đã được giáo viên sửa');
    expect(useCheckpointStore.getState().drafts['student-1'].generatedComment).toBe('<p>AI mới</p>');
    expect(effectiveCheckpointComment(useCheckpointStore.getState().drafts['student-1'])).toBe('AI đã được giáo viên sửa');
    const submitted = { ...useCheckpointStore.getState().drafts['student-1'] };
    useCheckpointStore.getState().setCurrentComment('student-1', 'AI được sửa sau submit');
    useCheckpointStore.getState().applySubmitSuccess('student-1', result('student-1', 'attendance-1'), submitted, true);
    expect(useCheckpointStore.getState().drafts['student-1'].currentComment).toBe('AI được sửa sau submit');

    const finalSubmitted = { ...useCheckpointStore.getState().drafts['student-1'] };
    useCheckpointStore.getState().setRowError('student-1', 'generation', 'AI fallback failed');
    useCheckpointStore.getState().setRowError('student-1', 'submission', 'Old submit error');
    useCheckpointStore.getState().applySubmitSuccess('student-1', result('student-1', 'attendance-1'), finalSubmitted, true);
    expect(useCheckpointStore.getState().drafts['student-1']).toMatchObject({ generatedComment: '', manualComment: '', currentComment: '', theoryInput: '4', practiceInput: '4.5' });
    expect(useCheckpointStore.getState().rowErrors['student-1']).toEqual({ generation: 'AI fallback failed' });
  });

  it('uses server default branches, preserves a valid user branch, and excludes passive status from operation locks', () => {
    const context = activateCheckpointContext('class-1', slot.id, 1);
    hydrateCheckpointContext(context, slot);
    useCheckpointStore.getState().setStatusLoading(context);
    expect(isCheckpointOperationActive()).toBe(false);
    useCheckpointStore.getState().applyStatus(context, status('makeup'));
    expect(useCheckpointStore.getState().selectedBranches['student-1']).toBe('makeup');
    useCheckpointStore.getState().setSelectedBranch('student-1', 'original');
    useCheckpointStore.getState().applyStatus(context, status('makeup'));
    expect(useCheckpointStore.getState().selectedBranches['student-1']).toBe('original');
    useCheckpointStore.getState().setGenerationBusy('student-1', true);
    expect(isCheckpointOperationActive()).toBe(true);
    useCheckpointStore.getState().setGenerationBusy('student-1', false);
    expect(isCheckpointOperationActive()).toBe(false);
    useCheckpointStore.getState().setGradeBusy('student-1', true);
    expect(isCheckpointOperationActive()).toBe(true);
    useCheckpointStore.getState().setGradeBusy('student-1', false);
    expect(isCheckpointOperationActive()).toBe(false);
  });

  it('applies AI grade scores only when captured versions still match and fills empty teacher notes', () => {
    const context = activateCheckpointContext('class-1', slot.id, 1);
    hydrateCheckpointContext(context, slot);
    const initial = useCheckpointStore.getState().drafts['student-1'];
    useCheckpointStore.getState().setTheoryInput('student-1', '1');
    expect(useCheckpointStore.getState().applyGradeResult('student-1', gradeResult(4.5, null), {
      theoryVersion: initial.theoryVersion,
      practiceVersion: initial.practiceVersion,
      descriptionVersion: initial.descriptionVersion,
    })).toBe(false);
    expect(useCheckpointStore.getState().drafts['student-1'].theoryInput).toBe('1');
    expect(useCheckpointStore.getState().gradeResults['student-1'].theoryScore).toBe(4.5);

    const current = useCheckpointStore.getState().drafts['student-1'];
    useCheckpointStore.getState().setTeacherDescription('student-1', '');
    const emptyDescription = useCheckpointStore.getState().drafts['student-1'];
    expect(useCheckpointStore.getState().applyGradeResult('student-1', gradeResult(5, 4.5, 'LT: 10/10.'), {
      theoryVersion: current.theoryVersion,
      practiceVersion: current.practiceVersion,
      descriptionVersion: emptyDescription.descriptionVersion,
    })).toBe(true);
    expect(useCheckpointStore.getState().drafts['student-1']).toMatchObject({
      theoryInput: '5',
      practiceInput: '4.5',
      teacherDescription: 'LT: 10/10.',
    });
  });
});

function checkpointArea(theory: number, practice: number) {
  return { grade: null, content: 'Điểm', commentAreaId: 'checkpoint-area', type: 'CHECKPOINT', checkpoint: { practiceScore: practice, checkpointScore: theory, checkpointQuestions: [] }, courseProcessDemoId: null, courseProcessFinalEvaluationTitle: null, courseProcessFinalEvaluationId: null, demoQuestions: [] };
}
function result(studentId: string, attendanceId: string, theoryScore = 4, practiceScore = 4.5) {
  return { slotId: slot.id, studentId, attendanceId, submitted: true as const, mode: 'full' as const, summaryIncluded: true, logged: true, theoryScore, practiceScore, totalScore: 4.3, rank: 'B' as const, questions: Array.from({ length: 10 }, (_, index) => ({ number: index + 1, correct: index < 8, score: index < 8 ? 0.5 as const : 0 as const })) };
}
function gradeResult(theoryScore: number | null, practiceScore: number | null, teacherNotes = '') {
  return {
    studentId: 'student-1', examId: 'exam-1', branch: 'original' as const, skippedScratch: true as const,
    theoryScore, practiceScore, teacherNotes,
    mc: { total: 10, correct: 9, items: [] },
    essay: { notes: '', items: [] },
  };
}
function status(defaultBranch: 'original' | 'makeup'): CheckpointStatusResult {
  const branch = (value: 'original' | 'makeup') => ({ branch: value, submittedAt: value === 'original' ? '2026-01-01T00:00:00Z' : '2026-01-02T00:00:00Z', practiceType: 'SCRATCH', links: [] });
  return { classId: 'class-1', checkpoint: 1, original: { id: 'exam-1', branch: 'original', title: 'Gốc', status: 'ACTIVE', practiceType: 'SCRATCH' }, makeup: { id: 'exam-2', branch: 'makeup', title: 'Bù', status: 'ACTIVE', practiceType: 'SCRATCH' }, students: [{ studentId: 'student-1', original: branch('original'), makeup: branch('makeup'), defaultBranch }] };
}

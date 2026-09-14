import type { DemoResolvedSchema, Slot } from '@tool-lms/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { activateDemoContext, resetDemoController } from './demoController';
import { dirtyDemoStudentIds, hasUnsavedDemoWork, isDemoOperationActive, useDemoStore } from './demoStore';

const schema: DemoResolvedSchema = { source: 'dynamic', fallbackKind: null, label: 'Sản phẩm', maxScore: 5, questions: [{ id: 'q-2', title: 'Trình bày', maxScore: 2 }, { id: 'q-1', title: 'Sản phẩm', maxScore: 3 }] };
const slot: Slot = {
  id: 'slot-14', index: 13, date: null, summary: '<p>Tổng kết</p>', studentAttendance: [
    { id: 'attendance-1', studentId: 'student-1', displayName: 'An', status: 'ATTENDED', commentByAreas: [{ grade: null, content: 'Demo', commentAreaId: 'demo-area', type: 'DEMO', checkpoint: null, courseProcessDemoId: 'demo-1', courseProcessFinalEvaluationTitle: null, courseProcessFinalEvaluationId: null, demoQuestions: [{ courseProcessDemoDetailId: 'q-1', title: 'Sản phẩm', result: false, score: 2.5, maxScore: 3 }, { courseProcessDemoDetailId: 'q-2', title: 'Trình bày', result: false, score: 1.5, maxScore: 2 }] }, { grade: 5, content: 'Rate', commentAreaId: 'rate-1', type: 'RATE', checkpoint: null, courseProcessDemoId: null, courseProcessFinalEvaluationTitle: 'Kỹ năng', courseProcessFinalEvaluationId: 'final-1', demoQuestions: [] }] },
    { id: 'attendance-2', studentId: 'student-2', displayName: 'Bình', status: 'ATTENDED', commentByAreas: [] },
  ],
};

beforeEach(() => { resetDemoController(); useDemoStore.getState().reset(); });

describe('Demo store', () => {
  it('hydrates authoritative schema order and keeps Demo state isolated and student keyed', () => {
    const context = activateDemoContext('class-1', slot.id, 'Tổng kết');
    useDemoStore.getState().hydrateSchema(context, schema, slot, 'Tổng kết');
    expect(useDemoStore.getState().drafts['student-1']).toMatchObject({ scores: { 'q-2': 1.5, 'q-1': 2.5 }, autoRate: true });
    expect(useDemoStore.getState().drafts['student-2']).toMatchObject({ scores: { 'q-2': null, 'q-1': null }, autoRate: true });
    expect(dirtyDemoStudentIds()).toEqual([]);
  });

  it('tracks dirty scores/summary, discards to synchronized values, and always unlocks operations', () => {
    const context = activateDemoContext('class-1', slot.id, 'Tổng kết');
    useDemoStore.getState().hydrateSchema(context, schema, slot, 'Tổng kết');
    useDemoStore.getState().setScore('student-1', 'q-2', 1.75);
    useDemoStore.getState().setAutoRate('student-2', false);
    useDemoStore.getState().setSummaryDraft('Tổng kết mới');
    expect(dirtyDemoStudentIds()).toEqual(['student-1', 'student-2']);
    expect(hasUnsavedDemoWork()).toBe(true);
    useDemoStore.getState().setRandomBusy('student-1', true);
    expect(isDemoOperationActive()).toBe(true);
    useDemoStore.getState().setRandomBusy('student-1', false);
    useDemoStore.getState().discardUnsaved();
    expect(useDemoStore.getState().drafts['student-1'].scores['q-2']).toBe(1.5);
    expect(useDemoStore.getState().drafts['student-2'].autoRate).toBe(true);
    expect(useDemoStore.getState().summaryDraft).toBe('Tổng kết');
    expect(hasUnsavedDemoWork()).toBe(false);
    expect(isDemoOperationActive()).toBe(false);
  });

  it('distributes an editable total score across schema questions without losing quarter-step bounds', () => {
    const context = activateDemoContext('class-1', slot.id, 'Tổng kết');
    useDemoStore.getState().hydrateSchema(context, schema, slot, 'Tổng kết');
    useDemoStore.getState().setTotalScore('student-2', 4.5);
    expect(useDemoStore.getState().drafts['student-2'].scores).toEqual({ 'q-2': 1.75, 'q-1': 2.75 });
    useDemoStore.getState().setTotalScore('student-2', null);
    expect(useDemoStore.getState().drafts['student-2'].scores).toEqual({ 'q-2': null, 'q-1': null });
  });

  it('same-slot refresh rehydrates clean score, autoRate, and summary baselines', () => {
    const context = activateDemoContext('class-1', slot.id, 'Tổng kết');
    useDemoStore.getState().hydrateSchema(context, schema, slot, 'Tổng kết');
    useDemoStore.getState().hydrateSchema(context, schema, refreshedSlot(1.75, false), 'Tổng kết từ máy chủ');
    expect(useDemoStore.getState().drafts['student-1']).toMatchObject({ scores: { 'q-2': 1.75, 'q-1': 3 }, autoRate: false });
    expect(useDemoStore.getState().summaryDraft).toBe('Tổng kết từ máy chủ');
    expect(useDemoStore.getState().summarySynced).toBe('Tổng kết từ máy chủ');
    expect(hasUnsavedDemoWork()).toBe(false);
  });

  it('same-slot refresh advances synced baselines while preserving genuinely dirty newer edits', () => {
    const context = activateDemoContext('class-1', slot.id, 'Tổng kết');
    useDemoStore.getState().hydrateSchema(context, schema, slot, 'Tổng kết');
    useDemoStore.getState().setScore('student-1', 'q-2', 2);
    useDemoStore.getState().setAutoRate('student-1', false);
    useDemoStore.getState().setSummaryDraft('Tổng kết giáo viên đang sửa');
    useDemoStore.getState().hydrateSchema(context, schema, refreshedSlot(1.75, true), 'Tổng kết mới từ máy chủ');
    expect(useDemoStore.getState().drafts['student-1']).toMatchObject({ scores: { 'q-2': 2, 'q-1': 2.5 }, autoRate: false });
    expect(useDemoStore.getState().synced['student-1']).toMatchObject({ scores: { 'q-2': 1.75, 'q-1': 3 }, autoRate: true });
    expect(useDemoStore.getState().summaryDraft).toBe('Tổng kết giáo viên đang sửa');
    expect(useDemoStore.getState().summarySynced).toBe('Tổng kết mới từ máy chủ');
    expect(hasUnsavedDemoWork()).toBe(true);
  });

  it('stale previews and late submit responses do not overwrite newer edits', () => {
    const context = activateDemoContext('class-1', slot.id, 'Tổng kết');
    useDemoStore.getState().hydrateSchema(context, schema, slot, 'Tổng kết');
    const original = { ...useDemoStore.getState().drafts['student-2'], scores: { 'q-2': 1.5, 'q-1': 2.5 } };
    useDemoStore.getState().setScore('student-2', 'q-2', 1.25);
    expect(useDemoStore.getState().applyPreview('student-2', { 'q-2': 1.75, 'q-1': 2.75 }, 4.5, original.version)).toBe(false);
    const submitted = { ...useDemoStore.getState().drafts['student-2'], scores: { ...useDemoStore.getState().drafts['student-2'].scores } };
    useDemoStore.getState().setScore('student-2', 'q-2', 2);
    useDemoStore.getState().applySubmitSuccess('student-2', {
      slotId: slot.id, studentId: 'student-2', attendanceId: 'attendance-2', submitted: true, summaryIncluded: true, logged: true, schema,
      questions: [{ ...schema.questions[0], score: 1.25 }, { ...schema.questions[1], score: 2.5 }], demoScore: 3.75, abilityScore: 5, totalScore: 4.3, rank: 'B',
    }, submitted, 'Tổng kết', 0);
    expect(useDemoStore.getState().drafts['student-2'].scores['q-2']).toBe(2);
    expect(useDemoStore.getState().results['student-2']).toMatchObject({ demoScore: 3.75, abilityScore: 5, totalScore: 4.3, rank: 'B' });
  });
});

function refreshedSlot(presentationScore: number, withRate: boolean): Slot {
  const student = slot.studentAttendance[0];
  return {
    ...slot,
    summary: '<p>Tổng kết mới từ máy chủ</p>',
    studentAttendance: [{
      ...student,
      commentByAreas: [
        { grade: null, content: 'Demo refreshed', commentAreaId: 'demo-area', type: 'DEMO', checkpoint: null, courseProcessDemoId: 'demo-1', courseProcessFinalEvaluationTitle: null, courseProcessFinalEvaluationId: null, demoQuestions: [{ courseProcessDemoDetailId: 'q-2', title: 'Trình bày', result: false, score: presentationScore, maxScore: 2 }, { courseProcessDemoDetailId: 'q-1', title: 'Sản phẩm', result: false, score: 3, maxScore: 3 }] },
        ...(withRate ? [{ grade: 5, content: 'Rate', commentAreaId: 'rate-1', type: 'RATE', checkpoint: null, courseProcessDemoId: null, courseProcessFinalEvaluationTitle: 'Kỹ năng', courseProcessFinalEvaluationId: 'final-1', demoQuestions: [] }] : []),
      ],
    }, slot.studentAttendance[1]],
  };
}

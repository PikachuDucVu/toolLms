import { describe, expect, it } from 'vitest';
import type { ClassDetail, ClassSummary, Slot, StudentAttendance } from '@tool-lms/contracts';
import { applySubmittedComments, autoSelectedSlotIndex, classCommentMeta, classesWithDetailProgress, computeClassCommentProgress, currentSessionNumber, detailForSelectedClass, getSlotDisplayNumber, orderClassSummaries, preferRicherCommentProgress, selectedSlot, sessionMode, slotCommentProgress, studentStats, visibleStudents } from './selectors';

const area = (type: string, content = '') => ({ grade: null, content, commentAreaId: null, type, checkpoint: null, courseProcessDemoId: null, courseProcessFinalEvaluationTitle: null, courseProcessFinalEvaluationId: null, demoQuestions: [] });
const student = (id: string, name: string, status: string, areas: ReturnType<typeof area>[] = []): StudentAttendance => ({ id: `attendance-${id}`, studentId: id, displayName: name, status, commentByAreas: areas });
const slot = (id: string, index: number, students: StudentAttendance[], date = '2026-07-01'): Slot => ({ id, index, date, summary: '', studentAttendance: students });

describe('class workspace selectors', () => {
  it('keeps running order and sorts recently ended classes newest first', () => {
    const values = [
      { id: 'ended-old', recentlyEnded: true, endDate: '2026-07-01' },
      { id: 'run-a', recentlyEnded: false, endDate: null },
      { id: 'ended-new', recentlyEnded: true, endDate: '2026-07-20' },
      { id: 'run-b', recentlyEnded: false, endDate: null },
    ] as ClassSummary[];
    expect(orderClassSummaries(values).map((item) => item.id)).toEqual(['run-a', 'run-b', 'ended-new', 'ended-old']);
  });

  it('activates the first slot for option value "0" and keeps only the empty placeholder inactive', () => {
    const detail = { slots: [slot('slot-1', 0, [])] } as ClassDetail;
    expect(getSlotDisplayNumber(detail.slots[0], 0)).toBe(1);
    expect(selectedSlot(detail, '0')).toBe(detail.slots[0]);
    expect(selectedSlot(detail, '')).toBeNull();
    expect(currentSessionNumber(detail.slots[0], '0')).toBe(1);
  });

  it('detects regular/checkpoint/demo by characterized option positions', () => {
    expect(sessionMode(slot('regular', 3, []), '3')).toBe('regular');
    expect(sessionMode(slot('checkpoint-1', 4, []), '4')).toBe('checkpoint');
    expect(sessionMode(slot('checkpoint-2', 8, []), '8')).toBe('checkpoint');
    expect(sessionMode(slot('demo', 13, []), '13')).toBe('demo');
  });

  it('auto-selects the earliest unfinished commentable slot, otherwise latest', () => {
    const an = student('an', 'An', 'ATTENDED');
    const done = student('binh', 'Bình', 'ATTENDED', [area('CONTENT', 'Đã gửi')]);
    const slots = [slot('one', 0, [an]), slot('two', 1, [done]), slot('three', 2, [an])];
    expect(autoSelectedSlotIndex(slots, Date.parse('2026-07-28'))).toBe('0');
    expect(autoSelectedSlotIndex(slots.map((item) => ({ ...item, studentAttendance: [done] })), Date.parse('2026-07-28'))).toBe('2');
    expect(slotCommentProgress(slots[2], 2)).toMatchObject({ present: 1, completed: 0, missing: 1 });
  });

  it('formats golden class-list progress metadata for unknown, pending and completed states', () => {
    expect(classCommentMeta({ state: 'unknown', badgeText: 'Chưa có dữ liệu', slotNumber: null, present: null, completed: null, missing: null })).toBe('Chưa có buổi đã điểm danh');
    expect(classCommentMeta({ state: 'pending', badgeText: 'Chưa nhận xét', slotNumber: 2, present: 3, completed: 1, missing: 2 })).toBe('Buổi 2: còn 2/3 học sinh chưa nhận xét');
    expect(classCommentMeta({ state: 'done', badgeText: 'Đã nhận xét', slotNumber: 4, present: 2, completed: 2, missing: 0 })).toBe('Buổi 4: 2/2 học sinh đã nhận xét');
  });

  it('filters Vietnamese names, attendance and mode progress and derives counts', () => {
    const students = [
      student('an', 'Nguyễn Văn Án', 'ATTENDED', [area('CONTENT', 'Tốt')]),
      student('binh', 'Trần Bình', 'LATE_ARRIVED'),
      student('chi', 'Lê Chi', 'ABSENT'),
    ];
    expect(visibleStudents(students, { search: 'nguyen van an', attendance: 'present', progress: 'submitted' }, 'regular').map((item) => item.studentId)).toEqual(['an']);
    expect(visibleStudents(students, { search: '', attendance: 'absent', progress: 'pending' }, 'regular').map((item) => item.studentId)).toEqual(['chi']);
    expect(studentStats(students, 'regular')).toEqual({ total: 3, present: 2, draft: 0, submitted: 1 });
  });

  it('ignores stale class details that no longer match selection', () => {
    const detail = { id: 'class-old' } as ClassDetail;
    expect(detailForSelectedClass(detail, 'class-new')).toBeUndefined();
    expect(detailForSelectedClass(detail, 'class-old')).toBe(detail);
  });

  it('overlays selected class comment progress from the loaded class detail', () => {
    const unknown = { state: 'unknown' as const, badgeText: 'Chưa có dữ liệu' as const, slotNumber: null, present: null, completed: null, missing: null };
    const pending = { state: 'pending' as const, badgeText: 'Chưa nhận xét' as const, slotNumber: 2, present: 3, completed: 1, missing: 2 };
    const classes = [
      { id: 'class-a', name: 'Lớp A', status: 'RUNNING', startDate: null, endDate: null, recentlyEnded: false, course: null, sites: [], slotCount: 1, commentProgress: unknown },
      { id: 'class-b', name: 'Lớp B', status: 'RUNNING', startDate: null, endDate: null, recentlyEnded: false, course: null, sites: [], slotCount: 1, commentProgress: unknown },
    ] as ClassSummary[];
    const detail = { id: 'class-a', commentProgress: pending, slots: [slot('slot-1', 0, []), slot('slot-2', 1, [])] } as ClassDetail;
    expect(classesWithDetailProgress(classes, detail).map((item) => [item.id, item.commentProgress.state, item.slotCount])).toEqual([
      ['class-a', 'pending', 2],
      ['class-b', 'unknown', 1],
    ]);
  });

  it('keeps a richer list-cache done badge when the selected class detail is still stale', () => {
    const pending = { state: 'pending' as const, badgeText: 'Chưa nhận xét' as const, slotNumber: 10, present: 8, completed: 0, missing: 8 };
    const done = { state: 'done' as const, badgeText: 'Đã nhận xét' as const, slotNumber: 10, present: 8, completed: 8, missing: 0 };
    const classes = [
      { id: 'class-a', name: 'HDT-JSI41', status: 'RUNNING', startDate: null, endDate: null, recentlyEnded: false, course: null, sites: [], slotCount: 14, commentProgress: done },
    ] as ClassSummary[];
    const staleStudents = Array.from({ length: 8 }, (_, index) => student(`s${index + 1}`, `HS ${index + 1}`, 'ATTENDED'));
    const detail = { id: 'class-a', commentProgress: pending, slots: [slot('slot-10', 9, staleStudents)] } as ClassDetail;
    expect(preferRicherCommentProgress(pending, done)).toMatchObject(done);
    expect(classesWithDetailProgress(classes, detail)[0].commentProgress).toMatchObject(done);
  });

  it('recomputes selected class progress from live slots even if detail.commentProgress is stale', () => {
    const pending = { state: 'pending' as const, badgeText: 'Chưa nhận xét' as const, slotNumber: 1, present: 2, completed: 0, missing: 2 };
    const classes = [
      { id: 'class-a', name: 'Lớp A', status: 'RUNNING', startDate: null, endDate: null, recentlyEnded: false, course: null, sites: [], slotCount: 1, commentProgress: pending },
    ] as ClassSummary[];
    const an = student('an', 'An', 'ATTENDED', [area('CONTENT', 'Đã gửi')]);
    const binh = student('binh', 'Bình', 'ATTENDED', [area('CONTENT', 'Đã gửi')]);
    const detail = { id: 'class-a', commentProgress: pending, slots: [slot('slot-1', 0, [an, binh])] } as ClassDetail;
    expect(classesWithDetailProgress(classes, detail)[0].commentProgress).toMatchObject({
      state: 'done', badgeText: 'Đã nhận xét', slotNumber: 1, present: 2, completed: 2, missing: 0,
    });
  });

  it('marks submitted students and flips class progress to done', () => {
    const an = student('an', 'An', 'ATTENDED');
    const binh = student('binh', 'Bình', 'ATTENDED');
    const detail = {
      id: 'class-a',
      commentProgress: { state: 'pending', badgeText: 'Chưa nhận xét', slotNumber: 1, present: 2, completed: 0, missing: 2 },
      slots: [slot('slot-1', 0, [an, binh])],
    } as ClassDetail;
    expect(computeClassCommentProgress(detail.slots)).toMatchObject({ state: 'pending', missing: 2, completed: 0 });
    const next = applySubmittedComments(detail, 'slot-1', ['an', 'binh'], 'regular');
    expect(next.commentProgress).toMatchObject({ state: 'done', badgeText: 'Đã nhận xét', present: 2, completed: 2, missing: 0 });
    expect(next.slots[0].studentAttendance.every((item) => item.commentByAreas.some((area) => area.type === 'CONTENT'))).toBe(true);
  });
});

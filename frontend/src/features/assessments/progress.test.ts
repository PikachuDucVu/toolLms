import type { ClassDetail, StudentAttendance } from '@tool-lms/contracts';
import { describe, expect, it } from 'vitest';
import { previousSessionLevel, progressHistorySlots, progressTrend } from './progress';

const detail = classDetail(12);
const slotFor = (sessionNumber: number) => detail.slots[sessionNumber - 1];
const sessionsOf = (sessionNumber: number) => progressHistorySlots(detail, slotFor(sessionNumber)).map((item) => item.sessionNumber);

describe('progress baseline sessions', () => {
  it('lists earlier regular sessions newest first, without session 1 or checkpoint sessions', () => {
    expect(sessionsOf(8)).toEqual([7, 6, 4]);
    expect(sessionsOf(11)).toEqual([10, 8, 7]);
    expect(sessionsOf(3)).toEqual([2]);
    expect(sessionsOf(2)).toEqual([]);
    expect(sessionsOf(1)).toEqual([]);
  });

  it('uses the last session the student attended and was assessed in', () => {
    const history = { 'student-1': { 'slot-7': 'independent', 'slot-6': 'needs_prompting', 'slot-4': 'needs_support' } } as const;
    const absentInSeven = withStatus(detail, 'slot-7', 'student-1', 'ABSENT');

    expect(previousSessionLevel(history, detail, slotFor(8), 8, 'student-1', {})).toEqual({ slotId: 'slot-7', sessionNumber: 7, learningLevel: 'independent' });
    expect(previousSessionLevel(history, absentInSeven, absentInSeven.slots[7], 8, 'student-1', {})).toEqual({ slotId: 'slot-6', sessionNumber: 6, learningLevel: 'needs_prompting' });
    expect(previousSessionLevel({ 'student-1': { 'slot-4': 'needs_support' } }, detail, slotFor(8), 8, 'student-1', {})).toMatchObject({ sessionNumber: 4 });
    expect(previousSessionLevel(history, detail, slotFor(8), 8, 'student-2', {})).toBeNull();
  });

  it('never compares with session 1', () => {
    expect(previousSessionLevel({ 'student-1': { 'slot-1': 'needs_support' } }, detail, slotFor(2), 2, 'student-1', {})).toBeNull();
  });

  it('only compares sessions on the same scale, honoring per-session comment modes', () => {
    const history = { 'student-1': { 'slot-10': 'needs_support', 'slot-8': 'independent' } } as const;

    expect(previousSessionLevel(history, detail, slotFor(11), 11, 'student-1', {})).toMatchObject({ sessionNumber: 10 });
    expect(previousSessionLevel(history, detail, slotFor(10), 10, 'student-1', {})).toBeNull();
    expect(previousSessionLevel(history, detail, slotFor(11), 11, 'student-1', { [modeKey('slot-11')]: 'regular' })).toMatchObject({ sessionNumber: 8 });
    expect(previousSessionLevel(history, detail, slotFor(11), 11, 'student-1', { [modeKey('slot-10')]: 'regular' })).toBeNull();
  });

  it('classifies the trend by level code', () => {
    expect(progressTrend('needs_prompting', 'understands_and_asks')).toBe('improved');
    expect(progressTrend('independent', 'needs_support')).toBe('declined');
    expect(progressTrend('needs_prompting', 'needs_prompting')).toBe('same');
  });
});

function modeKey(slotId: string) {
  return JSON.stringify(['class-1', slotId]);
}

function withStatus(source: ClassDetail, slotId: string, studentId: string, status: StudentAttendance['status']): ClassDetail {
  return {
    ...source,
    slots: source.slots.map((slot) => slot.id !== slotId ? slot : {
      ...slot,
      studentAttendance: slot.studentAttendance.map((student) => student.studentId === studentId ? { ...student, status } : student),
    }),
  };
}

function classDetail(slotCount: number): ClassDetail {
  const students: StudentAttendance[] = [
    { id: 'attendance-1', studentId: 'student-1', displayName: 'Nguyễn An', status: 'ATTENDED', commentByAreas: [] },
    { id: 'attendance-2', studentId: 'student-2', displayName: 'Trần Bình', status: 'ATTENDED', commentByAreas: [] },
  ];
  return {
    id: 'class-1', name: 'Lớp A', status: 'RUNNING', startDate: null, endDate: null, recentlyEnded: false,
    course: null, sites: [], slotCount, courseProcessId: null, courseProcess: null,
    commentProgress: { state: 'pending', badgeText: 'Chưa nhận xét', slotNumber: 1, present: 2, completed: 0, missing: 2 },
    slots: Array.from({ length: slotCount }, (_, index) => ({
      id: `slot-${index + 1}`, index, date: '2026-01-01', summary: '', studentAttendance: students,
    })),
  };
}

import type { StudentAttendance } from '@tool-lms/contracts';
import { describe, expect, it } from 'vitest';
import { buildCheckpointReviewRows, filterCheckpointReviewRows, type CheckpointReviewState } from './checkpointReviewSelectors';
import type { CheckpointStudentDraft } from './checkpointStore';

const attendance = (studentId: string, displayName: string, status = 'ATTENDED', comment = ''): StudentAttendance => ({
  id: `att-${studentId}`, studentId, displayName, status, comment, commentByAreas: [],
} as unknown as StudentAttendance);

const draft = (overrides: Partial<CheckpointStudentDraft> = {}): CheckpointStudentDraft => ({
  theoryInput: '', practiceInput: '', teacherDescription: '', generatedComment: '', manualComment: '', currentComment: '', provenance: 'none',
  theoryVersion: 1, practiceVersion: 1, descriptionVersion: 1, commentVersion: 1, ...overrides,
});

const state = (drafts: Record<string, CheckpointStudentDraft>, extra: Partial<CheckpointReviewState> = {}): CheckpointReviewState => ({
  drafts, results: {}, rowErrors: {}, generationBusy: new Set(), submitBusy: new Set(), gradeBusy: new Set(), ...extra,
});

const longComment = (name: string) => `${name} đã hoàn thành rất tốt bài kiểm tra checkpoint và biết cách vận dụng kiến thức đã học vào bài thực hành. Em cần luyện thêm.`;

describe('checkpoint review rows', () => {
  const students = [attendance('a', 'An'), attendance('b', 'Bình'), attendance('c', 'Chi', 'ABSENT', '<p>Nhận xét cũ</p>')];

  it('classifies draft, submitted and missing comments', () => {
    const rows = buildCheckpointReviewRows(students, state({
      a: draft({ currentComment: 'Em làm tốt' }), b: draft(), c: draft(),
    }));
    expect(rows.map((row) => row.source)).toEqual(['draft', 'missing', 'submitted']);
    expect(rows[2].existingComment).toBe('Nhận xét cũ');
    expect(rows[2].isPresent).toBe(false);
  });

  it('computes the score readout from typed inputs', () => {
    const [row] = buildCheckpointReviewRows([students[0]], state({ a: draft({ theoryInput: '4', practiceInput: '5' }) }));
    expect(row.averageText).toBe('4.5');
    expect(row.rank).toBe('A');
    expect(row.hasScore).toBe(true);
  });

  it('flags row errors and duplicate openings as warnings', () => {
    const rows = buildCheckpointReviewRows(students.slice(0, 2), state({
      a: draft({ currentComment: longComment('An') }),
      b: draft({ currentComment: longComment('Bình') }),
    }, { rowErrors: { a: { submission: 'Mất kết nối' } } }));
    expect(rows[0].operationError).toBe('Lỗi submit: Mất kết nối');
    expect(rows[0].hasWarning).toBe(true);
    expect(rows[0].duplicateCount).toBe(2);
    expect(rows[1].duplicateCount).toBe(2);
  });

  it('filters by search and alert, and sorts warnings first', () => {
    const rows = buildCheckpointReviewRows(students, state({
      a: draft({ currentComment: 'Em làm tốt' }), b: draft(), c: draft(),
    }, { rowErrors: { b: { generation: 'timeout' } } }));
    expect(filterCheckpointReviewRows(rows, { search: 'binh', alertFilter: 'all', sort: 'name' }).map((row) => row.studentId)).toEqual(['b']);
    expect(filterCheckpointReviewRows(rows, { search: '', alertFilter: 'missing', sort: 'name' }).map((row) => row.studentId)).toEqual(['b']);
    expect(filterCheckpointReviewRows(rows, { search: '', alertFilter: 'all', sort: 'warning' })[0].studentId).toBe('b');
  });
});

import type { StudentAttendance } from '@tool-lms/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAssessmentStore } from '../assessments/assessmentStore';
import { useCommentStore } from '../comments/commentStore';
import { allDraftIds, buildReviewDuplicateCounts, buildReviewRows, filterReviewRows, getReviewSignature, reviewWarningText } from './selectors';
import { freezeReviewSubmitScope } from './scopedActions';

const students: StudentAttendance[] = [
  student('student-1', 'Nguyễn Minh Anh'), student('student-2', 'Trần Gia Huy'), student('student-3', 'Lê Khánh Linh', 'LATE_ARRIVED'), student('student-4', 'Phạm Bảo Ngọc', 'ABSENT_WITH_NOTICE'),
];

beforeEach(() => {
  useCommentStore.getState().reset(); useAssessmentStore.getState().reset();
  useCommentStore.setState({ drafts: {
    'student-1': draft('Minh Anh đi học đúng giờ và tuân thủ tốt nội quy lớp học. Con tự vận dụng kiến thức tốt.'),
    'student-2': draft('Gia Huy đi học đúng giờ và tuân thủ tốt nội quy lớp học. Con chủ động hỏi lại khi chưa hiểu.'),
    'student-3': draft('Khánh Linh đi học muộn nhưng nhanh chóng ổn định và tham gia bài học. Con cần thêm gợi ý.'),
    'student-4': draft('Bảo Ngọc có bản nháp riêng nhưng hôm nay vắng có phép. Gia đình vui lòng theo dõi thêm.'),
  } });
  useAssessmentStore.setState({ drafts: {
    'student-1': { learningLevel: 'independent', note: '' }, 'student-2': { learningLevel: 'understands_and_asks', note: '' }, 'student-3': { learningLevel: 'needs_prompting', note: '' }, 'student-4': { learningLevel: 'understands_and_asks', note: '' },
  } });
});

describe('React review pure selectors', () => {
  it('strips student names and flags only repeated long first-sentence signatures', () => {
    expect(getReviewSignature('Minh Anh đi học đúng giờ và tuân thủ tốt nội quy lớp học. Con làm bài tốt.', 'Nguyễn Minh Anh')).toBe(getReviewSignature('Gia Huy đi học đúng giờ và tuân thủ tốt nội quy lớp học. Con chủ động hỏi.', 'Trần Gia Huy'));
    expect(buildReviewDuplicateCounts([
      row('student-1', 'Nguyễn Minh Anh', 'Minh Anh đi học đúng giờ và tuân thủ tốt nội quy lớp học.'), row('student-2', 'Trần Gia Huy', 'Gia Huy đi học đúng giờ và tuân thủ tốt nội quy lớp học.'), row('student-3', 'Lê Khánh Linh', 'Một câu ngắn.'),
    ])).toEqual({ 'student-1': 2, 'student-2': 2 });
  });

  it('searches Vietnamese-normalized names and comments and filters/sorts deterministically', () => {
    const rows = currentRows();
    expect(filterReviewRows(rows, filters({ search: 'gia huy' })).map((item) => item.studentId)).toEqual(['student-2']);
    expect(filterReviewRows(rows, filters({ search: 'tuan thu tot' })).map((item) => item.studentId)).toEqual(['student-1', 'student-2']);
    expect(filterReviewRows(rows, filters({ levelFilter: 'needs_prompting' })).map((item) => item.studentId)).toEqual(['student-3']);
    expect(new Set(filterReviewRows(rows, filters({ alertFilter: 'duplicate' })).map((item) => item.studentId))).toEqual(new Set(['student-1', 'student-2']));
    expect(filterReviewRows(rows, filters({ sort: 'level' })).map((item) => item.studentId)).toEqual(['student-3', 'student-4', 'student-2', 'student-1']);
  });

  it('includes safe-template and validation status in warning counts and the attention filter exactly once', () => {
    useCommentStore.getState().setDraft('student-1', { content: 'Nhận xét an toàn đủ nội dung.', kind: 'generated', generationMeta: { source: 'safe_template', transport: 'server', validationIssues: [] } });
    useCommentStore.getState().setDraft('student-2', { content: 'Nhận xét cần kiểm tra nội dung.', kind: 'generated', generationMeta: { source: 'ai', transport: 'server', validationIssues: ['level_mismatch'] } });
    const rows = currentRows();
    const attention = filterReviewRows(rows, filters({ alertFilter: 'attention' }));
    expect(new Set(attention.map((item) => item.studentId))).toEqual(new Set(['student-1', 'student-2']));
    expect(reviewWarningText(rows.find((item) => item.studentId === 'student-1')!)).toBe('Nhận xét dùng mẫu an toàn');
    expect(reviewWarningText(rows.find((item) => item.studentId === 'student-2')!)).toBe('1 cảnh báo kiểm tra nội dung');
  });

  it('uses only present non-empty drafts for all/filtered submit and present students for regeneration', () => {
    const rows = currentRows();
    expect(new Set(allDraftIds(rows))).toEqual(new Set(['student-1', 'student-2', 'student-3']));
    const filtered = filterReviewRows(rows, filters({ search: 'khanh linh' }));
    expect(allDraftIds(filtered)).toEqual(['student-3']);
    useCommentStore.getState().removeDraft('student-3');
    const next = currentRows();
    expect(allDraftIds(filterReviewRows(next, filters({ search: 'khanh linh' })))).toEqual([]);
    expect(filterReviewRows(next, filters({ search: 'khanh linh' })).filter((item) => item.isPresent).map((item) => item.studentId)).toEqual(['student-3']);
  });

  it('freezes exact IDs, content, metadata and summary without owning canonical copies', () => {
    const rows = currentRows();
    const frozen = freezeReviewSubmitScope(rows.filter((item) => item.studentId === 'student-3'), useCommentStore.getState().drafts, '  Tổng kết  ');
    useCommentStore.getState().editDraft('student-3', 'Nội dung mới');
    expect(frozen.ids).toEqual(['student-3']);
    expect(frozen.drafts['student-3'].content).toContain('đi học muộn');
    expect(frozen.summary).toBe('Tổng kết');
    expect(useCommentStore.getState()).not.toHaveProperty('reviewDrafts');
    expect(useAssessmentStore.getState()).not.toHaveProperty('reviewLevels');
  });
});

function currentRows() { return buildReviewRows(students, useCommentStore.getState(), useAssessmentStore.getState()); }
function filters(overrides: Partial<Parameters<typeof filterReviewRows>[1]> = {}) { return { search: '', alertFilter: 'all' as const, levelFilter: 'all' as const, sort: 'name' as const, ...overrides }; }
function student(id: string, displayName: string, status: StudentAttendance['status'] = 'ATTENDED'): StudentAttendance { return { id: `attendance-${id}`, studentId: id, displayName, status, commentByAreas: [] }; }
function draft(content: string) { return { content, kind: 'generated' as const, generationMeta: null }; }
function row(studentId: string, studentName: string, commentText: string) { return { studentId, studentName, commentText, isDraft: true }; }

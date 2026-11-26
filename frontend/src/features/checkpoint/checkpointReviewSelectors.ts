import type { CheckpointSubmitResult, StudentAttendance } from '@tool-lms/contracts';
import { attendancePresentation, existingContentComment, isPresent, normalizeVietnameseText, stripHtml } from '../classes/public/domain';
import type { ReviewAlertFilter, ReviewSort } from '../review/public/store';
import { buildReviewDuplicateCounts } from '../review/public/components';
import { checkpointScoreReadout } from './checkpointScore';
import type { CheckpointRowError, CheckpointStudentDraft } from './checkpointStore';

export type CheckpointReviewSource = 'draft' | 'submitted' | 'missing';
export type CheckpointReviewRow = {
  index: number;
  student: StudentAttendance;
  studentId: string;
  studentName: string;
  attendance: ReturnType<typeof attendancePresentation>;
  isPresent: boolean;
  theoryInput: string;
  practiceInput: string;
  averageText: string;
  rank: string;
  hasScore: boolean;
  teacherDescription: string;
  currentComment: string;
  commentText: string;
  existingComment: string;
  isDraft: boolean;
  hasExistingComment: boolean;
  hasCheckpoint: boolean;
  source: CheckpointReviewSource;
  characterCount: number;
  operationError: string;
  generationBusy: boolean;
  submitBusy: boolean;
  gradeBusy: boolean;
  busy: boolean;
  duplicateCount: number;
  hasWarning: boolean;
};

export type CheckpointReviewState = {
  drafts: Record<string, CheckpointStudentDraft>;
  results: Record<string, CheckpointSubmitResult>;
  rowErrors: Record<string, CheckpointRowError>;
  generationBusy: Set<string>;
  submitBusy: Set<string>;
  gradeBusy: Set<string>;
};

export type CheckpointReviewFilters = { search: string; alertFilter: ReviewAlertFilter; sort: ReviewSort };

export function checkpointRowErrorText(error: CheckpointRowError | undefined): string {
  if (!error) return '';
  if (error.grading) return `Lỗi AI chấm: ${error.grading}`;
  if (error.generation) return `Lỗi tạo AI: ${error.generation}`;
  if (error.submission) return `Lỗi submit: ${error.submission}`;
  return '';
}

export function buildCheckpointReviewRows(
  students: StudentAttendance[],
  state: CheckpointReviewState,
  analysis: Pick<CheckpointReviewState, 'drafts' | 'rowErrors'> = state,
): CheckpointReviewRow[] {
  const base = students.map((student, index) => buildBaseRow(student, index, state, state.drafts, state.rowErrors));
  const analysisBase = students.map((student, index) => buildBaseRow(student, index, state, analysis.drafts, analysis.rowErrors));
  const duplicateCounts = buildReviewDuplicateCounts(analysisBase);
  return base.map((row) => {
    const operationError = checkpointRowErrorText(analysis.rowErrors[row.studentId]);
    const duplicateCount = duplicateCounts[row.studentId] || 0;
    return { ...row, operationError, duplicateCount, hasWarning: Boolean(operationError || duplicateCount) };
  });
}

function buildBaseRow(student: StudentAttendance, index: number, state: CheckpointReviewState, drafts: Record<string, CheckpointStudentDraft>, rowErrors: Record<string, CheckpointRowError>): CheckpointReviewRow {
  const draft = drafts[student.studentId];
  const result = state.results[student.studentId];
  const currentComment = draft?.currentComment || '';
  const isDraft = Boolean(currentComment.trim());
  const existingComment = stripHtml(existingContentComment(student));
  const hasExistingComment = Boolean(existingComment);
  const commentText = stripHtml(isDraft ? currentComment : existingComment);
  const readout = draft ? checkpointScoreReadout(student, draft, result) : { averageText: '?', rank: '', hasBoth: false };
  const generationBusy = state.generationBusy.has(student.studentId);
  const submitBusy = state.submitBusy.has(student.studentId);
  const gradeBusy = state.gradeBusy.has(student.studentId);
  return {
    index,
    student,
    studentId: student.studentId,
    studentName: student.displayName,
    attendance: attendancePresentation(student.status),
    isPresent: isPresent(student),
    theoryInput: draft?.theoryInput || '',
    practiceInput: draft?.practiceInput || '',
    averageText: readout.averageText,
    rank: readout.rank,
    hasScore: readout.hasBoth,
    teacherDescription: draft?.teacherDescription || '',
    currentComment,
    commentText,
    existingComment,
    isDraft,
    hasExistingComment,
    hasCheckpoint: Boolean(result) || student.commentByAreas.some((area) => area.type === 'CHECKPOINT'),
    source: isDraft ? 'draft' : hasExistingComment ? 'submitted' : 'missing',
    characterCount: commentText.length,
    operationError: checkpointRowErrorText(rowErrors[student.studentId]),
    generationBusy,
    submitBusy,
    gradeBusy,
    busy: generationBusy || submitBusy || gradeBusy,
    duplicateCount: 0,
    hasWarning: false,
  };
}

export function filterCheckpointReviewRows(rows: CheckpointReviewRow[], filters: CheckpointReviewFilters): CheckpointReviewRow[] {
  const search = normalizeVietnameseText(filters.search);
  return rows.filter((row) => {
    const matchesSearch = !search || normalizeVietnameseText(`${row.studentName} ${row.commentText}`).includes(search);
    const matchesAlert = filters.alertFilter === 'all'
      || (filters.alertFilter === 'attention' && row.hasWarning)
      || (filters.alertFilter === 'duplicate' && row.duplicateCount > 0)
      || (filters.alertFilter === 'missing' && row.source === 'missing');
    return matchesSearch && matchesAlert;
  }).sort(checkpointReviewComparator(filters.sort));
}

function checkpointReviewComparator(sort: ReviewSort) {
  const byName = (left: CheckpointReviewRow, right: CheckpointReviewRow) => left.studentName.localeCompare(right.studentName, 'vi') || left.studentId.localeCompare(right.studentId);
  return (left: CheckpointReviewRow, right: CheckpointReviewRow) => {
    if (sort === 'warning') return Number(right.hasWarning) - Number(left.hasWarning) || right.duplicateCount - left.duplicateCount || byName(left, right);
    if (sort === 'attendance') return Number(right.isPresent) - Number(left.isPresent) || byName(left, right);
    return byName(left, right);
  };
}

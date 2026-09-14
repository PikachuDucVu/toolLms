import type { LearningLevel, StudentAttendance } from '@tool-lms/contracts';
import type { AssessmentState } from '../assessments/public/store';
import { assessmentDraft, assessmentStatus, levelCatalog } from '../assessments/public/selectors';
import { attendancePresentation, existingContentComment, isPresent, normalizeVietnameseText, stripHtml } from '../classes/public/domain';
import type { CommentDraft } from '../comments/public/store';
import type { ReviewAlertFilter, ReviewLevelFilter, ReviewSort } from './reviewStore';

export const REVIEW_DUPLICATE_MIN_CHARS = 45;
export const REVIEW_DUPLICATE_MIN_WORDS = 8;

export type ReviewSource = 'draft' | 'submitted' | 'missing';
export type ReviewRow = {
  index: number;
  student: StudentAttendance;
  studentId: string;
  studentName: string;
  attendance: ReturnType<typeof attendancePresentation>;
  isPresent: boolean;
  learningLevel: LearningLevel;
  learningLevelInfo: ReturnType<typeof levelCatalog>[LearningLevel];
  assessmentStatus: ReturnType<typeof assessmentStatus>;
  commentText: string;
  isDraft: boolean;
  hasExistingComment: boolean;
  source: ReviewSource;
  characterCount: number;
  operationError: string;
  busy: boolean;
  duplicateCount: number;
  hasWarning: boolean;
  generationWarning: string;
};

export type ReviewCommentState = {
  drafts: Record<string, CommentDraft>;
  errors: Record<string, string>;
  studentBusy: Set<string>;
};

export type ReviewFilters = {
  search: string;
  alertFilter: ReviewAlertFilter;
  levelFilter: ReviewLevelFilter;
  sort: ReviewSort;
};

export function normalizeReviewText(value: string): string {
  return stripHtml(String(value || ''))
    .normalize('NFC')
    .toLocaleLowerCase('vi-VN')
    .replace(/[“”"'`()\[\]{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getReviewSignature(comment: string, studentName = ''): string {
  const firstSentence = normalizeReviewText(comment).split(/[.!?]+/)[0]?.trim() || '';
  if (!firstSentence) return '';
  const normalizedName = normalizeReviewText(studentName);
  const parts = normalizedName.split(' ').filter(Boolean);
  const candidates = Array.from(new Set([normalizedName, parts.slice(-2).join(' '), parts.at(-1) || '']))
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  let signature = firstSentence;
  const matchingName = candidates.find((name) => signature.startsWith(`${name} `));
  if (matchingName) signature = signature.slice(matchingName.length).trim();
  signature = signature.replace(/^(em|con)\s+/, '').trim();
  const words = signature.split(' ').filter(Boolean);
  return signature.length >= REVIEW_DUPLICATE_MIN_CHARS && words.length >= REVIEW_DUPLICATE_MIN_WORDS ? signature : '';
}

export function buildReviewDuplicateCounts(rows: Array<Pick<ReviewRow, 'studentId' | 'studentName' | 'commentText' | 'isDraft'>>): Record<string, number> {
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.isDraft) continue;
    const signature = getReviewSignature(row.commentText, row.studentName);
    if (!signature) continue;
    groups.set(signature, [...(groups.get(signature) || []), row.studentId]);
  }
  const counts: Record<string, number> = {};
  for (const ids of groups.values()) if (ids.length >= 2) for (const id of ids) counts[id] = ids.length;
  return counts;
}

export function buildReviewRows(
  students: StudentAttendance[],
  comments: ReviewCommentState,
  assessments: AssessmentState,
  analysis: Pick<ReviewCommentState, 'drafts' | 'errors'> = comments,
  sessionNumber?: number,
): ReviewRow[] {
  const base = students.map((student, index) => buildBaseRow(student, index, comments, assessments, sessionNumber));
  const analysisBase = students.map((student, index) => buildBaseRow(student, index, { ...comments, drafts: analysis.drafts, errors: analysis.errors }, assessments, sessionNumber));
  const duplicateCounts = buildReviewDuplicateCounts(analysisBase);
  return base.map((row) => {
    const operationError = analysis.errors[row.studentId] || '';
    const duplicateCount = duplicateCounts[row.studentId] || 0;
    return { ...row, operationError, duplicateCount, hasWarning: Boolean(operationError || duplicateCount || row.generationWarning) };
  });
}

function buildBaseRow(student: StudentAttendance, index: number, comments: ReviewCommentState, assessments: AssessmentState, sessionNumber?: number): ReviewRow {
  const draft = comments.drafts[student.studentId];
  const draftContent = draft?.content || '';
  const existingContent = existingContentComment(student);
  const isDraft = Boolean(draftContent.trim());
  const hasExistingComment = Boolean(stripHtml(existingContent));
  const commentText = stripHtml(isDraft ? draftContent : existingContent);
  const learningLevel = assessmentDraft(assessments, student.studentId).learningLevel;
  const validationCount = draft?.generationMeta?.validationIssues.length || 0;
  const generationWarning = draft?.generationMeta?.source === 'safe_template'
    ? 'Nhận xét dùng mẫu an toàn'
    : validationCount ? `${validationCount} cảnh báo kiểm tra nội dung` : '';
  return {
    index,
    student,
    studentId: student.studentId,
    studentName: student.displayName,
    attendance: attendancePresentation(student.status),
    isPresent: isPresent(student),
    learningLevel,
    learningLevelInfo: levelCatalog(sessionNumber)[learningLevel],
    assessmentStatus: assessmentStatus(assessments, student.studentId),
    commentText,
    isDraft,
    hasExistingComment,
    source: isDraft ? 'draft' : hasExistingComment ? 'submitted' : 'missing',
    characterCount: commentText.length,
    operationError: comments.errors[student.studentId] || '',
    busy: comments.studentBusy.has(student.studentId),
    duplicateCount: 0,
    hasWarning: false,
    generationWarning,
  };
}

export function filterReviewRows(rows: ReviewRow[], filters: ReviewFilters): ReviewRow[] {
  const search = normalizeVietnameseText(filters.search);
  return rows.filter((row) => {
    const searchable = normalizeVietnameseText(`${row.studentName} ${row.commentText}`);
    const matchesSearch = !search || searchable.includes(search);
    const matchesLevel = filters.levelFilter === 'all' || row.learningLevel === filters.levelFilter;
    const matchesAlert = filters.alertFilter === 'all'
      || (filters.alertFilter === 'attention' && row.hasWarning)
      || (filters.alertFilter === 'duplicate' && row.duplicateCount > 0)
      || (filters.alertFilter === 'missing' && row.source === 'missing');
    return matchesSearch && matchesLevel && matchesAlert;
  }).sort(reviewComparator(filters.sort));
}

function reviewComparator(sort: ReviewSort) {
  const levelOrder: Record<LearningLevel, number> = { needs_support: 1, needs_prompting: 2, understands_and_asks: 3, independent: 4 };
  const byName = (left: ReviewRow, right: ReviewRow) => left.studentName.localeCompare(right.studentName, 'vi') || left.studentId.localeCompare(right.studentId);
  return (left: ReviewRow, right: ReviewRow) => {
    if (sort === 'level') return levelOrder[left.learningLevel] - levelOrder[right.learningLevel] || byName(left, right);
    if (sort === 'warning') return Number(right.hasWarning) - Number(left.hasWarning) || right.duplicateCount - left.duplicateCount || byName(left, right);
    if (sort === 'attendance') return Number(right.isPresent) - Number(left.isPresent) || byName(left, right);
    return byName(left, right);
  };
}

export function allPresentIds(rows: ReviewRow[]): string[] { return rows.filter((row) => row.isPresent).map((row) => row.studentId); }
export function allDraftIds(rows: ReviewRow[]): string[] { return rows.filter((row) => row.isPresent && row.isDraft).map((row) => row.studentId); }
export function filteredPresentIds(rows: ReviewRow[]): string[] { return allPresentIds(rows); }
export function filteredDraftIds(rows: ReviewRow[]): string[] { return allDraftIds(rows); }
export function reviewWarningText(row: ReviewRow): string {
  if (row.operationError) return row.operationError;
  if (row.duplicateCount > 0) return `Câu mở đầu tương tự ${row.duplicateCount - 1} nhận xét khác`;
  return row.generationWarning;
}

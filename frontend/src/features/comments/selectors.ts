import type {
  ClassDetail,
  CommentAttendanceStatus,
  CommentHomeworkStatus,
  HomeworkLoadResponse,
  PastCommentSlot,
  Slot,
  StudentAttendance,
} from '@tool-lms/contracts';
import { normalizeVietnameseText, stripHtml } from '../classes/public/domain';
import type { CommentDraft } from './commentStore';

// Kept structural so selectors remain easy to use in tests without a bound Zustand hook.
export type CommentStoreSnapshot = {
  drafts: Record<string, CommentDraft>;
  summaryDraft: string;
  summarySynced: string;
  studentBusy: Set<string>;
  batch: unknown;
  summaryBusy: boolean;
};

export const NOTE_TEMPLATES = {
  good: 'Tự hoàn thành phần thực hành nhanh và chính xác',
  asks: 'Những phần chưa hiểu con chủ động hỏi lại thầy',
  needwork: 'Cần thầy gợi ý ở một số bước khi thực hành',
  naughty: 'Hay nói chuyện riêng, đôi khi mất tập trung',
} as const;

export function hasUnsavedComments(state: CommentStoreSnapshot): boolean {
  return Object.keys(state.drafts).length > 0 || state.summaryDraft.trim() !== state.summarySynced.trim();
}

export function isCommentBusy(state: CommentStoreSnapshot): boolean {
  return state.studentBusy.size > 0 || Boolean(state.batch) || state.summaryBusy;
}

export function getStudentCallName(fullName: string, roster: Array<Pick<StudentAttendance, 'displayName'>>): string {
  const normalizedFullName = String(fullName || '').normalize('NFC').trim().replace(/\s+/g, ' ');
  const parts = normalizedFullName.split(' ').filter(Boolean);
  if (!parts.length) return 'em';
  const finalName = parts.at(-1)!;
  const finalKey = finalName.toLocaleLowerCase('vi-VN');
  const matches = roster.filter((entry) => entry.displayName.normalize('NFC').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean).at(-1)?.toLocaleLowerCase('vi-VN') === finalKey).length;
  return matches > 1 && parts.length > 1 ? parts.slice(-2).join(' ') : finalName;
}

export function commentAttendanceStatus(status: string): CommentAttendanceStatus {
  if (status === 'ATTENDED' || status === 'LATE_ARRIVED' || status === 'ABSENT_WITH_NOTICE') return status;
  if (status === 'ABSENT_WITHOUT_NOTICE' || status === 'NOT_ATTENDED') return status;
  return status === 'UNKNOWN' ? 'UNKNOWN' : 'ABSENT';
}

export function pastCommentSlots(detail: ClassDetail, currentSlot: Slot, studentId: string): PastCommentSlot[] {
  return detail.slots
    .filter((slot) => Number(slot.index) < Number(currentSlot.index))
    .sort((left, right) => Number(left.index) - Number(right.index))
    .flatMap((slot) => {
      const attendance = slot.studentAttendance.find((item) => item.studentId === studentId);
      if (!attendance) return [];
      const commentByAreas = attendance.commentByAreas.map((area) => ({ type: area.type, ...(area.content ? { content: area.content } : {}) }));
      if (!commentByAreas.length && attendance.comment) {
        commentByAreas.push({ type: 'CONTENT', content: attendance.comment });
      }
      if (!commentByAreas.length) return [];
      return [{
        index: Number(slot.index) + 1,
        commentByAreas,
      }];
    });
}

export function shouldMentionPreviousHomework(sessionNumber: number): boolean {
  return [2, 3, 4, 7, 8].includes(Number(sessionNumber));
}

export function homeworkStatuses(
  response: HomeworkLoadResponse | null,
  sessionNumber: number,
  students: StudentAttendance[],
): Record<string, CommentHomeworkStatus | null> {
  const result = Object.fromEntries(students.map((student) => [student.studentId, null])) as Record<string, CommentHomeworkStatus | null>;
  if (!response || !shouldMentionPreviousHomework(sessionNumber)) return result;
  const previousSession = sessionNumber - 1;
  const data = response.data;
  const lessons = data.lessons.filter((lesson) => lesson.isActive);
  const lesson = lessons.find((item) => lessonNameLooksLikeSession(item.name, previousSession)) || lessonForOrder(lessons, previousSession);
  if (!lesson) return result;
  for (const attendance of students) {
    const student = data.students.find((item) => item.studentUid === attendance.studentId || item.id === attendance.studentId)
      || data.students.find((item) => normalizeVietnameseText(item.displayName) === normalizeVietnameseText(attendance.displayName));
    if (!student) continue;
    const ids = new Set([student.studentUid, student.id, attendance.studentId]);
    const candidates = data.submissions.filter((submission) => submission.lessonId === lesson.id && ids.has(submission.studentUid));
    const submission = candidates.sort((left, right) => {
      const submittedDiff = Number(isSubmittedHomework(right)) - Number(isSubmittedHomework(left));
      if (submittedDiff) return submittedDiff;
      return String(right.submittedAt || right.markedAt || '').localeCompare(String(left.submittedAt || left.markedAt || ''));
    })[0];
    const submitted = isSubmittedHomework(submission);
    result[attendance.studentId] = {
      shouldMention: true,
      previousSession,
      submitted,
      marked: submission?.status === 'MARKED',
      evaluationNote: submission?.note.trim() || '',
      status: submission?.status || (submitted ? 'SUBMITTED' : 'NOT_SUBMITTED'),
      lessonName: lesson.name || `BTVN buổi ${previousSession}`,
    };
  }
  return result;
}

function lessonNameLooksLikeSession(name: string, sessionNumber: number): boolean {
  const normalized = normalizeVietnameseText(name);
  const value = String(Number(sessionNumber));
  return new RegExp(`\\b(buoi|bai|lesson|session)\\s*(tap\\s*)?0?${value}\\b`).test(normalized)
    || new RegExp(`\\b0?${value}\\s*[-:]`).test(normalized);
}

function lessonForOrder<T extends { displayOrder: number }>(lessons: T[], sessionNumber: number): T | undefined {
  const orders = lessons.map((lesson) => Number(lesson.displayOrder)).filter(Number.isFinite);
  if (orders.length) {
    const expected = Math.min(...orders) === 0 ? sessionNumber - 1 : sessionNumber;
    const exact = lessons.find((lesson) => Number(lesson.displayOrder) === expected);
    if (exact) return exact;
  }
  return lessons.find((lesson) => Number(lesson.displayOrder) === sessionNumber)
    || lessons.find((lesson) => Number(lesson.displayOrder) === sessionNumber - 1);
}

function isSubmittedHomework(submission: HomeworkLoadResponse['data']['submissions'][number] | undefined): boolean {
  if (!submission) return false;
  return submission.status === 'SUBMITTED' || submission.status === 'MARKED' || Boolean(submission.submittedAt)
    || submission.submittedCount > 0 || submission.content.attachments.length > 0;
}

export function commentText(draft: CommentDraft | undefined): string { return draft?.content || ''; }
export function cleanComment(value: string): string { return stripHtml(value).trim(); }

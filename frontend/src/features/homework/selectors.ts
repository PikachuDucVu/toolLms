import type { ClassSummary, HomeworkLesson, HomeworkSubmission, HomeworkStudent } from '@tool-lms/contracts';
import type { HomeworkDraft, HomeworkStatusFilter } from './store';

export function uploadSubmissions(submissions: HomeworkSubmission[] = []) {
  return submissions.filter((submission) => submission.type === 'UPLOAD_FILE');
}

export function filterHomeworkSubmissions(submissions: HomeworkSubmission[], lessonId: string, status: HomeworkStatusFilter) {
  return uploadSubmissions(submissions).filter((submission) => (!lessonId || submission.lessonId === lessonId) && (!status || submission.status === status));
}

export function homeworkStats(submissions: HomeworkSubmission[]) {
  const uploads = uploadSubmissions(submissions);
  return {
    total: uploads.length,
    pending: uploads.filter((submission) => submission.status === 'SUBMITTED').length,
    marked: uploads.filter((submission) => submission.status === 'MARKED').length,
  };
}

export function pendingSubmissions(submissions: HomeworkSubmission[]) {
  return uploadSubmissions(submissions).filter((submission) => submission.status === 'SUBMITTED');
}

export function groupedClasses(classes: ClassSummary[]) {
  return { active: classes.filter((item) => !item.recentlyEnded), ended: classes.filter((item) => item.recentlyEnded) };
}

export function selectedVisibleSubmissions(submissions: HomeworkSubmission[], selectedIds: Set<string>) {
  return submissions.filter((submission) => selectedIds.has(submission.id));
}

export function draftFor(submission: HomeworkSubmission, drafts: Record<string, HomeworkDraft>): HomeworkDraft {
  return drafts[submission.id] || { score: submission.status === 'MARKED' && submission.score != null ? String(submission.score) : '100', note: submission.note || '' };
}

export function studentById(students: HomeworkStudent[], uid: string) { return students.find((student) => student.studentUid === uid); }
export function lessonById(lessons: HomeworkLesson[], id: string) { return lessons.find((lesson) => lesson.id === id); }

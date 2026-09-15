import type { ClassDetail, ClassDetailResponse, ClassesResponse } from '@tool-lms/contracts';
import { appQueryClient } from '../../app/providers';
import { classDetailQuery, commentsClassesQuery } from './queries';
import { applySubmittedComments, computeClassCommentProgress, hasModeSubmission, type SessionMode } from './selectors';

export function syncClassProgressFromDetail(detail: ClassDetail): ClassDetail {
  const next = { ...detail, slotCount: detail.slots.length, commentProgress: computeClassCommentProgress(detail.slots) };
  const client = appQueryClient();
  client.setQueryData(classDetailQuery(next.id).queryKey, (old: ClassDetailResponse | undefined) => {
    if (!old?.data?.class || old.data.class.id !== next.id) return old;
    return { ...old, data: { ...old.data, class: { ...old.data.class, ...next } } };
  });
  client.setQueryData(commentsClassesQuery().queryKey, (old: ClassesResponse | undefined) => {
    if (!old?.data?.classes) return old;
    return {
      ...old,
      data: {
        ...old.data,
        classes: old.data.classes.map((item) =>
          item.id === next.id
            ? { ...item, commentProgress: next.commentProgress, slotCount: next.slotCount || item.slotCount }
            : item,
        ),
      },
    };
  });
  return next;
}

export function applyOptimisticClassSubmissions(input: {
  classId: string;
  slotId: string;
  studentIds: string[];
  mode?: SessionMode;
}): ClassDetail | null {
  const mode = input.mode ?? 'regular';
  const current = appQueryClient().getQueryData<ClassDetailResponse>(classDetailQuery(input.classId).queryKey)?.data.class;
  if (!current || current.id !== input.classId) return null;
  return syncClassProgressFromDetail(applySubmittedComments(current, input.slotId, input.studentIds, mode));
}

export function reconcileClassSubmissionsAfterRefetch(input: {
  classId: string;
  slotId: string;
  studentIds: string[];
  mode?: SessionMode;
}): ClassDetail | null {
  const mode = input.mode ?? 'regular';
  const detail = appQueryClient().getQueryData<ClassDetailResponse>(classDetailQuery(input.classId).queryKey)?.data.class;
  if (!detail || detail.id !== input.classId) return applyOptimisticClassSubmissions(input);
  const slot = detail.slots.find((item) => item.id === input.slotId);
  const missing = input.studentIds.filter((studentId) => {
    const student = slot?.studentAttendance.find((item) => item.studentId === studentId);
    return !student || !hasModeSubmission(student, mode);
  });
  if (missing.length) return applyOptimisticClassSubmissions({ ...input, studentIds: missing, mode });
  return syncClassProgressFromDetail(detail);
}

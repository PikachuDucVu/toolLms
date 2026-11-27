import type { GradingJobItem, GradingJobListResponse, GradingJobWithItems, HomeworkStudent, HomeworkSubmission } from '@tool-lms/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { useToast } from '../../components/ui/Toast';
import { homeworkJobsQuery, homeworkQuery, homeworkScoreLogQuery } from './queries';
import { studentById } from './selectors';
import { useHomeworkStore } from './store';

export const QUEUE_POLL_INTERVAL_MS = 3_000;

export function isActiveJob(entry: GradingJobWithItems): boolean {
  return entry.job.status === 'queued' || entry.job.status === 'running';
}

/** 'Chấm tất cả' / 'Chấm đã chọn' jobs: shown in the floating batch dock, never mixed with per-row AI. */
export function isBatchJob(entry: GradingJobWithItems): boolean {
  return entry.job.kind === 'all' || entry.job.kind === 'selected';
}

/** Per-row AI clicks: a suggestion ('single') or grade-and-send ('single_submit'). */
export function isRowJob(entry: GradingJobWithItems): boolean {
  return entry.job.kind === 'single' || entry.job.kind === 'single_submit';
}

/** Every kind except a plain suggestion writes the score to the LMS. */
export function marksOnLms(entry: GradingJobWithItems): boolean {
  return entry.job.kind !== 'single';
}

export function isPendingItem(item: GradingJobItem): boolean {
  return item.status === 'queued' || item.status === 'processing';
}

/**
 * The server is the source of truth for the AI queue, so it survives reloads and navigation:
 * this polls the class's recent jobs, marks rows that are still in flight, and copies finished
 * per-row suggestions into the drafts once (the teacher still reviews and sends them).
 */
export function useHomeworkQueue({ enabled, classId, submissions, students, homeworkReady }: {
  enabled: boolean;
  classId: string;
  submissions: HomeworkSubmission[];
  students: HomeworkStudent[];
  homeworkReady: boolean;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const query = useQuery({
    ...homeworkJobsQuery(classId),
    enabled: enabled && Boolean(classId),
    refetchInterval: (current: { state: { data?: GradingJobListResponse } }) => current.state.data?.data.jobs.some(isActiveJob) ? QUEUE_POLL_INTERVAL_MS : false,
  });
  const jobs = useMemo(() => query.data?.data.jobs ?? [], [query.data]);

  const busyIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entry of jobs) if (isActiveJob(entry)) for (const item of entry.items) if (isPendingItem(item)) ids.add(item.submissionId);
    return ids;
  }, [jobs]);

  const handledItems = useRef(new Set<string>());
  const primed = useRef(false);
  const lastMarkProgress = useRef('');
  useEffect(() => {
    handledItems.current = new Set();
    primed.current = false;
    lastMarkProgress.current = '';
  }, [classId]);

  const markProgress = useMemo(() => jobs.filter(marksOnLms).map((entry) => `${entry.job.id}:${entry.job.status}:${entry.job.completedItems}`).join('|'), [jobs]);
  useEffect(() => {
    if (!classId || !query.data) return;
    const previous = lastMarkProgress.current;
    lastMarkProgress.current = markProgress;
    if (!previous || previous === markProgress) return;
    void queryClient.invalidateQueries({ queryKey: homeworkScoreLogQuery(classId).queryKey, exact: true });
    const finished = jobs.some((entry) => marksOnLms(entry) && !isActiveJob(entry) && (previous.includes(`${entry.job.id}:queued`) || previous.includes(`${entry.job.id}:running`)));
    if (finished) void queryClient.invalidateQueries({ queryKey: homeworkQuery(classId).queryKey, exact: true });
  }, [classId, jobs, markProgress, query.data, queryClient]);

  useEffect(() => {
    if (!homeworkReady || !query.data) return;
    const restoring = !primed.current;
    primed.current = true;
    const byId = new Map(submissions.map((submission) => [submission.id, submission]));
    const latest = new Map<string, GradingJobItem>();
    const failures: GradingJobItem[] = [];
    const sent: GradingJobItem[] = [];
    for (const entry of jobs) {
      if (!isRowJob(entry)) continue;
      for (const item of entry.items) {
        if (handledItems.current.has(item.id) || isPendingItem(item)) continue;
        handledItems.current.add(item.id);
        if (item.status === 'failed') { failures.push(item); continue; }
        if (item.status !== 'completed' || item.score == null) continue;
        // Grade-and-send rows are already on the LMS; the homework refetch brings the score in.
        if (entry.job.kind === 'single_submit') { sent.push(item); continue; }
        const current = latest.get(item.submissionId);
        if (!current || current.updatedAt < item.updatedAt) latest.set(item.submissionId, item);
      }
    }
    const store = useHomeworkStore.getState();
    let applied = 0;
    for (const item of latest.values()) {
      const submission = byId.get(item.submissionId);
      if (!submission || submission.status !== 'SUBMITTED') continue;
      store.setScoreDraft(item.submissionId, String(item.score));
      store.setNoteDraft(item.submissionId, item.note || '');
      applied++;
      if (!restoring) toast.show(`AI đề xuất ${item.score} điểm cho ${studentById(students, submission.studentUid)?.displayName || 'học sinh'}. Kiểm tra rồi bấm "Gửi".`, 'info');
    }
    if (restoring && applied) toast.show(`Đã khôi phục ${applied} đề xuất AI chưa gửi.`, 'info');
    if (sent.length && classId && !restoring) {
      void queryClient.invalidateQueries({ queryKey: homeworkQuery(classId).queryKey, exact: true });
      void queryClient.invalidateQueries({ queryKey: homeworkScoreLogQuery(classId).queryKey, exact: true });
    }
    if (!restoring) for (const item of sent) toast.show(`AI đã chấm và gửi ${item.score} điểm cho ${studentById(students, item.studentUid)?.displayName || 'học sinh'}.`, 'success');
    if (!restoring) for (const item of failures) toast.show(`AI lỗi (${studentById(students, item.studentUid)?.displayName || 'học sinh'}): ${item.error || 'không rõ nguyên nhân'}`, 'error');
  }, [classId, homeworkReady, jobs, query.data, queryClient, students, submissions, toast]);

  return { ...query, jobs, busyIds };
}

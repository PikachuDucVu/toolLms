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

  const markProgress = useMemo(() => jobs.filter((entry) => entry.job.kind !== 'single').map((entry) => `${entry.job.id}:${entry.job.status}:${entry.job.completedItems}`).join('|'), [jobs]);
  useEffect(() => {
    if (!classId || !query.data) return;
    const previous = lastMarkProgress.current;
    lastMarkProgress.current = markProgress;
    if (!previous || previous === markProgress) return;
    void queryClient.invalidateQueries({ queryKey: homeworkScoreLogQuery(classId).queryKey, exact: true });
    const finished = jobs.some((entry) => entry.job.kind !== 'single' && !isActiveJob(entry) && (previous.includes(`${entry.job.id}:queued`) || previous.includes(`${entry.job.id}:running`)));
    if (finished) void queryClient.invalidateQueries({ queryKey: homeworkQuery(classId).queryKey, exact: true });
  }, [classId, jobs, markProgress, query.data, queryClient]);

  useEffect(() => {
    if (!homeworkReady || !query.data) return;
    const restoring = !primed.current;
    primed.current = true;
    const byId = new Map(submissions.map((submission) => [submission.id, submission]));
    const latest = new Map<string, GradingJobItem>();
    const failures: GradingJobItem[] = [];
    for (const entry of jobs) {
      if (entry.job.kind !== 'single') continue;
      for (const item of entry.items) {
        if (handledItems.current.has(item.id) || isPendingItem(item)) continue;
        handledItems.current.add(item.id);
        if (item.status === 'failed') { failures.push(item); continue; }
        if (item.status !== 'completed' || item.score == null) continue;
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
    if (!restoring) for (const item of failures) toast.show(`AI lỗi (${studentById(students, item.studentUid)?.displayName || 'học sinh'}): ${item.error || 'không rõ nguyên nhân'}`, 'error');
  }, [homeworkReady, jobs, query.data, students, submissions, toast]);

  return { ...query, jobs, busyIds };
}

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { getGradingJob } from './api';
import { captureHomeworkContext, createHomeworkOperationController, isCurrentHomeworkContext, releaseHomeworkOperationController } from './homeworkContext';
import { gradingJobQuery } from './queries';
import { useHomeworkStore } from './store';

const POLL_INTERVAL_MS = 3_000;

export function useGradingJob(onTerminal: (classId: string, status: 'completed' | 'cancelled') => void) {
  const jobId = useHomeworkStore((state) => state.activeJobId);
  const classId = useHomeworkStore((state) => state.classId);
  const queryClient = useQueryClient();
  const query = useQuery(gradingJobQuery(jobId || 'inactive'));
  const [generation, setGeneration] = useState(0);
  const [pollError, setPollError] = useState<unknown>(null);
  const restart = useCallback(() => { setPollError(null); setGeneration((value) => value + 1); }, []);

  useEffect(() => {
    if (!jobId) return;
    const context = captureHomeworkContext(classId);
    const controller = createHomeworkOperationController();
    let disposed = false;
    let timer: number | undefined;
    const definition = gradingJobQuery(jobId);
    const key = definition.queryKey;

    const isCurrent = () => !disposed && !controller.signal.aborted && isCurrentHomeworkContext(context) && useHomeworkStore.getState().activeJobId === jobId;
    const schedule = () => { timer = window.setTimeout(() => void poll(), POLL_INTERVAL_MS); };
    const poll = async () => {
      try {
        const response = await queryClient.fetchQuery({
          ...definition,
          queryFn: ({ signal }) => getGradingJob(jobId, AbortSignal.any([signal, controller.signal])),
        });
        if (!isCurrent()) return;
        setPollError(null);
        const status = response.data.job.status;
        if (status === 'completed' || status === 'cancelled') {
          onTerminal(response.data.job.classId, status);
          return;
        }
        schedule();
      } catch (error) {
        if (!isCurrent()) return;
        setPollError(error);
      }
    };

    schedule();
    return () => {
      disposed = true;
      if (timer !== undefined) window.clearTimeout(timer);
      controller.abort();
      releaseHomeworkOperationController(controller);
      void queryClient.cancelQueries({ queryKey: key, exact: true });
    };
  }, [classId, generation, jobId, onTerminal, queryClient]);

  return { ...query, pollError, restart, intervalMs: POLL_INTERVAL_MS };
}

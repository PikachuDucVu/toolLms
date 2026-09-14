import type { CheckpointNumber } from '@tool-lms/contracts';
import { queryOptions } from '@tanstack/react-query';
import { getCheckpointStatus } from './api';

export const checkpointStatusQuery = (classId: string, checkpoint: CheckpointNumber) => queryOptions({
  queryKey: ['checkpoint-status', classId, checkpoint] as const,
  queryFn: ({ signal }) => getCheckpointStatus(classId, checkpoint, signal),
  staleTime: 30_000,
  retry: false,
});

import { getClasses, getGradingJob, getHomework } from './api';

export const homeworkClassesQuery = () => ({
  queryKey: ['homework', 'classes'] as const,
  queryFn: ({ signal }: { signal: AbortSignal }) => getClasses(signal),
});

export const homeworkQuery = (classId: string) => ({
  queryKey: ['homework', 'class', classId] as const,
  queryFn: ({ signal }: { signal: AbortSignal }) => getHomework(classId, signal),
  enabled: Boolean(classId),
});

export const gradingJobQuery = (jobId: string) => ({
  queryKey: ['homework', 'job', jobId] as const,
  queryFn: ({ signal }: { signal: AbortSignal }) => getGradingJob(jobId, signal),
  enabled: false,
});

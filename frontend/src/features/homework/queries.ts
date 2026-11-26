import { getClasses, getGradingJob, getHomework, getScoreLog, listGradingJobs } from './api';

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

export const homeworkJobsQuery = (classId: string) => ({
  queryKey: ['homework', 'jobs', classId] as const,
  queryFn: ({ signal }: { signal: AbortSignal }) => listGradingJobs(classId, signal),
  enabled: Boolean(classId),
});

export const homeworkScoreLogQuery = (classId: string) => ({
  queryKey: ['homework', 'score-log', classId] as const,
  queryFn: ({ signal }: { signal: AbortSignal }) => getScoreLog(classId, signal),
  enabled: Boolean(classId),
});

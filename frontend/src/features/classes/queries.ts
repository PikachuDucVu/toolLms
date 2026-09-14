import { getClassDetail, getClasses } from './api';

export const commentsClassesQuery = () => ({
  queryKey: ['comments', 'classes'] as const,
  queryFn: ({ signal }: { signal: AbortSignal }) => getClasses(signal),
});

export const classDetailQuery = (classId: string) => ({
  queryKey: ['comments', 'class', classId] as const,
  queryFn: ({ signal }: { signal: AbortSignal }) => getClassDetail(classId, signal),
  enabled: Boolean(classId),
});

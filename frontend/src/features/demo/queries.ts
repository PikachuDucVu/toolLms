import { queryOptions } from '@tanstack/react-query';
import { getDemoSchema } from './api';

export const demoSchemaQuery = (classId: string, slotId: string) => queryOptions({
  queryKey: ['demo-schema', classId, slotId] as const,
  queryFn: ({ signal }) => getDemoSchema(slotId, classId, signal),
  staleTime: 30_000,
});

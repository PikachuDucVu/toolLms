import type { AssessmentLoadResponse } from '@tool-lms/contracts';
import { useQuery } from '@tanstack/react-query';
import { getAssessments } from './api';
import type { AssessmentContext } from './assessmentStore';

export function assessmentQuery(context: AssessmentContext, previousSlotIds: string[]) {
  return {
    queryKey: ['comments', 'assessments', context.classId, context.slotId, context.epoch, ...previousSlotIds] as const,
    queryFn: ({ signal }: { signal: AbortSignal }) => getAssessments(context.slotId, context.classId, previousSlotIds, signal),
    retry: false as const,
  };
}

export function useAssessmentsQuery(context: AssessmentContext | null, previousSlotIds: string[]) {
  return useQuery<AssessmentLoadResponse>({
    queryKey: ['comments', 'assessments', context?.classId || '', context?.slotId || '', context?.epoch || 0, ...previousSlotIds],
    queryFn: ({ signal }) => {
      if (!context) throw new Error('Assessment context is inactive');
      return getAssessments(context.slotId, context.classId, previousSlotIds, signal);
    },
    enabled: Boolean(context),
    retry: false,
  });
}

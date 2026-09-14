import { assessmentStatus } from './selectors';
import { useAssessmentStore } from './assessmentStore';

export function InheritedAssessmentBadge({ studentId }: { studentId: string }) {
  const status = assessmentStatus(useAssessmentStore(), studentId);
  if (status.kind !== 'inherited' && status.kind !== 'default') return null;
  return <span className={`badge assessment-origin ${status.kind}`}>{status.text}</span>;
}

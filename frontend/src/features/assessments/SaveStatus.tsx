import { assessmentStatus } from './selectors';
import { useAssessmentStore } from './assessmentStore';

export function SaveStatus({ studentId, onRetry, disabled = false }: { studentId: string; onRetry: () => void; disabled?: boolean }) {
  const status = assessmentStatus(useAssessmentStore(), studentId);
  return <span className={`assessment-save-status status-${status.kind}`} role="status" aria-live="polite">
    <span>{status.text}</span>
    {status.error && status.kind === 'save-error' && <><small>{status.error}</small><button type="button" className="assessment-retry" disabled={disabled} onClick={onRetry}>Thử lại</button></>}
  </span>;
}

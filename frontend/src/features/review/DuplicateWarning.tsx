import type { ReviewRow } from './selectors';
import { reviewWarningText } from './selectors';

export function DuplicateWarning({ row }: { row: ReviewRow }) {
  const warning = reviewWarningText(row);
  return <span className="regular-review-warning" role={row.operationError ? 'alert' : undefined}>{warning ? `Cảnh báo: ${warning}` : ''}</span>;
}

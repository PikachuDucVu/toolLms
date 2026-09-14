import { safeErrorMessage } from '../../app/providers';
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) { return <section role="alert" className="state-card state-error"><h2>Không thể tải dữ liệu</h2><p>{safeErrorMessage(error)}</p>{onRetry && <button className="btn btn-primary" onClick={onRetry}>Thử lại</button>}</section>; }
export function EmptyState({ children }: { children: React.ReactNode }) { return <section className="state-card"><p>{children}</p></section>; }

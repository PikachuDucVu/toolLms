export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) { return <span className={`badge badge-${tone}`}>{children}</span>; }
export function StatusDot({ online = false }: { online?: boolean }) { return <span aria-hidden="true" className={`status-dot ${online ? 'online' : ''}`} />; }
export function Skeleton({ className = '' }: { className?: string }) { return <span aria-hidden="true" className={`skeleton ${className}`} />; }

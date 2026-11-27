import type { GradingJobWithItems, HomeworkLesson, HomeworkStudent } from '@tool-lms/contracts';
import { ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { formatTime, itemRank, QueueItem, queueItemLabel, type QueueItemLabel } from './HomeworkSidebar';
import { isActiveJob, isBatchJob } from './useHomeworkQueue';

/**
 * Floating dock in the bottom corner for batch AI jobs ("AI chấm tất cả" / "AI chấm đã chọn").
 * It stays on screen whatever the layout, shows each job's progress bar until it finishes, and
 * keeps the tracked job (with its cancel / retry controls) until the teacher closes it.
 * Per-row AI clicks are listed separately in the sidebar.
 */
export function BatchQueueDock({ jobs, activeJobId, activeJobSlot, students, lessons }: {
  jobs: GradingJobWithItems[];
  activeJobId: string | null;
  activeJobSlot: ReactNode;
  students: HomeworkStudent[];
  lessons: HomeworkLesson[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const shown = jobs.filter((entry) => isBatchJob(entry) && (isActiveJob(entry) || entry.job.id === activeJobId));
  const trackedListed = shown.some((entry) => entry.job.id === activeJobId);
  if (!shown.length && !activeJobSlot) return null;
  const label = queueItemLabel(students, lessons);
  const running = shown.filter(isActiveJob).length;
  return <section className={`batch-dock${collapsed ? ' is-collapsed' : ''}`} aria-label="Tiến độ AI chấm hàng loạt">
    <header className="batch-dock-header">
      <h2><Layers size={16} />AI chấm hàng loạt{running > 0 && <span className="homework-side-badge is-live">{running} đang chạy</span>}</h2>
      <button type="button" className="icon-button" aria-label={collapsed ? 'Mở rộng danh sách chấm hàng loạt' : 'Thu gọn danh sách chấm hàng loạt'} aria-expanded={!collapsed} onClick={() => setCollapsed((value) => !value)}>{collapsed ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
    </header>
    <div className="batch-dock-body">
      {activeJobSlot && !trackedListed && <div className="batch-dock-card is-tracked">{activeJobSlot}</div>}
      {shown.map((entry) => <BatchCard key={entry.job.id} entry={entry} slot={entry.job.id === activeJobId ? activeJobSlot : null} label={label} collapsed={collapsed} />)}
    </div>
  </section>;
}

function BatchCard({ entry, slot, label, collapsed }: { entry: GradingJobWithItems; slot: ReactNode; label: QueueItemLabel; collapsed: boolean }) {
  const { job, items } = entry;
  const ordered = [...items].sort((left, right) => itemRank(left) - itemRank(right));
  const list = collapsed ? null : <ul className="queue-items">{ordered.map((item) => <QueueItem key={item.id} item={item} {...label(item)} />)}</ul>;
  // The job the page is tracking keeps its controls (cancel / retry / close) above its student list.
  if (slot) return <div className="batch-dock-card is-tracked">{slot}{list}</div>;
  const cancelled = items.filter((item) => item.status === 'cancelled').length;
  const done = job.completedItems + job.failedItems + cancelled;
  const percent = job.totalItems ? Math.min(100, Math.round(done / job.totalItems * 100)) : 0;
  return <div className="batch-dock-card">
    <div className="queue-batch-head">
      <div className="queue-batch-title"><strong>{batchTitle(job.kind)}</strong><span>{formatTime(job.createdAt)} · {done}/{job.totalItems} bài{job.failedItems ? ` · ${job.failedItems} lỗi` : ''}</span></div>
      <span className={`job-status job-status-${job.status}`}>{job.status === 'queued' ? 'Đang chờ' : job.status === 'running' ? 'Đang chấm' : job.status === 'completed' ? 'Xong' : 'Đã hủy'}</span>
    </div>
    <div className="progress-track size-sm" aria-label={`Tiến độ ${percent}%`}><span style={{ width: `${percent}%` }} /></div>
    {list}
  </div>;
}

export function batchTitle(kind: GradingJobWithItems['job']['kind'] | undefined): string {
  return kind === 'selected' ? 'AI chấm đã chọn' : 'AI chấm tất cả';
}

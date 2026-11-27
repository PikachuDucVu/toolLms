import type { GradingJobItem, GradingJobWithItems, HomeworkLesson, HomeworkScoreLogEntry, HomeworkStudent } from '@tool-lms/contracts';
import { History, ListChecks, RefreshCw } from 'lucide-react';
import { safeErrorMessage } from '../../app/providers';
import { lessonById, studentById } from './selectors';
import { isActiveJob, isPendingItem, isRowJob } from './useHomeworkQueue';

export function HomeworkSidebar({ classSelected, jobs, jobsLoading, students, lessons, scoreLog, scoreLogLoading, scoreLogError, scoreLogRefreshing, onRefreshScoreLog }: {
  classSelected: boolean;
  jobs: GradingJobWithItems[];
  jobsLoading: boolean;
  students: HomeworkStudent[];
  lessons: HomeworkLesson[];
  scoreLog: HomeworkScoreLogEntry[];
  scoreLogLoading: boolean;
  scoreLogError: unknown;
  scoreLogRefreshing: boolean;
  onRefreshScoreLog: () => void;
}) {
  return <aside className="homework-sidebar" aria-label="Hàng đợi AI và lịch sử điểm">
    <QueuePanel classSelected={classSelected} jobs={jobs} loading={jobsLoading} students={students} lessons={lessons} />
    <ScoreHistoryPanel classSelected={classSelected} entries={scoreLog} loading={scoreLogLoading} error={scoreLogError} refreshing={scoreLogRefreshing} onRefresh={onRefreshScoreLog} />
  </aside>;
}

export type QueueItemLabel = (item: GradingJobItem) => { student: string; lesson: string };

export function queueItemLabel(students: HomeworkStudent[], lessons: HomeworkLesson[]): QueueItemLabel {
  return (item) => ({ student: studentById(students, item.studentUid)?.displayName || 'Học sinh', lesson: lessonById(lessons, item.lessonId)?.name || '' });
}

/** Per-row AI only ("AI" suggestions and "AI chấm & gửi"); batch jobs live in the floating dock. */
function QueuePanel({ classSelected, jobs, loading, students, lessons }: {
  classSelected: boolean;
  jobs: GradingJobWithItems[];
  loading: boolean;
  students: HomeworkStudent[];
  lessons: HomeworkLesson[];
}) {
  const rows = jobs.filter(isRowJob);
  const pending = rows.filter(isActiveJob).reduce((total, entry) => total + entry.items.filter(isPendingItem).length, 0);
  const label = queueItemLabel(students, lessons);
  return <section className="card homework-side-card homework-queue-card" aria-label="Hàng đợi AI chấm">
    <header className="homework-side-header">
      <h2><ListChecks size={17} />AI chấm từng bài</h2>
      {pending > 0 && <span className="homework-side-badge is-live" role="status">{pending} đang chờ</span>}
    </header>
    <div className="homework-side-body">
      {!classSelected ? <p className="homework-side-empty">Chọn lớp để xem hàng đợi.</p>
        : loading && !jobs.length ? <span className="skeleton homework-side-skeleton" aria-hidden="true" />
        : !rows.length ? <p className="homework-side-empty">Chưa có lượt AI chấm từng bài nào trong 24 giờ qua.</p>
        : <ul className="queue-items">{rows.flatMap((entry) => entry.items.map((item) => <QueueItem key={item.id} item={item} {...label(item)} time={entry.job.createdAt} sent={entry.job.kind === 'single_submit'} />))}</ul>}
    </div>
  </section>;
}

export function QueueItem({ item, student, lesson, time, sent }: { item: GradingJobItem; student: string; lesson: string; time?: string; sent?: boolean }) {
  const meta = [lesson, time && formatTime(time)].filter(Boolean).join(' · ');
  return <li className={`queue-item queue-item-${item.status}`} title={item.error || item.note || undefined}>
    <span className="queue-item-main"><strong>{student}</strong>{(meta || sent) && <span>{sent && <span className="queue-item-mode">Chấm & gửi</span>}{meta}</span>}</span>
    <ItemChip item={item} />
  </li>;
}

function ItemChip({ item }: { item: GradingJobItem }) {
  if (item.status === 'queued') return <span className="queue-chip is-queued">Chờ</span>;
  if (item.status === 'processing') return <span className="queue-chip is-processing"><span className="queue-spinner" aria-hidden="true" />Đang chấm</span>;
  if (item.status === 'completed') return <span className="queue-chip is-completed">{item.score ?? '—'}đ</span>;
  if (item.status === 'cancelled') return <span className="queue-chip is-cancelled">Đã hủy</span>;
  return <span className="queue-chip is-failed">Lỗi</span>;
}

export function itemRank(item: GradingJobItem): number {
  return item.status === 'processing' ? 0 : item.status === 'queued' ? 1 : item.status === 'failed' ? 2 : 3;
}

const sourceLabels: Record<HomeworkScoreLogEntry['source'], string> = { manual: 'Tay', batch: 'Hàng loạt', ai_job: 'AI' };

function ScoreHistoryPanel({ classSelected, entries, loading, error, refreshing, onRefresh }: {
  classSelected: boolean;
  entries: HomeworkScoreLogEntry[];
  loading: boolean;
  error: unknown;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return <section className="card homework-side-card homework-history-card" aria-label="Lịch sử điểm">
    <header className="homework-side-header">
      <h2><History size={17} />Lịch sử điểm{entries.length > 0 && <span className="homework-side-badge">{entries.length}</span>}</h2>
      <button type="button" className="icon-button homework-side-refresh" aria-label="Làm mới lịch sử điểm" disabled={!classSelected || refreshing} onClick={onRefresh}><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /></button>
    </header>
    <div className="homework-history-scroll">
      {!classSelected ? <p className="homework-side-empty">Chọn lớp để xem lịch sử điểm.</p>
        : error ? <p className="homework-side-empty is-error" role="alert">{safeErrorMessage(error)}</p>
        : loading ? <span className="skeleton homework-side-skeleton" aria-hidden="true" />
        : !entries.length ? <p className="homework-side-empty">Chưa có lần chấm nào được ghi lại cho lớp này.</p>
        : <table className="score-history-table">
          <thead><tr><th className="is-time">Lúc</th><th>Học sinh</th><th className="is-score">Điểm</th><th className="is-source">Nguồn</th></tr></thead>
          <tbody>{entries.map((entry) => <tr key={entry.id} title={entry.note || undefined}>
            <td className="is-time"><TimeStamp value={entry.createdAt} /></td>
            <td><span className="score-history-student">{entry.studentName || 'Học sinh'}</span>{entry.lessonName && <span className="score-history-lesson">{entry.lessonName}</span>}</td>
            <td className="is-score">{entry.previousScore != null && entry.previousScore !== entry.score && <span className="score-history-prev">{entry.previousScore}→</span>}<strong>{entry.score}</strong></td>
            <td className="is-source"><span className={`queue-chip source-${entry.source}`}>{sourceLabels[entry.source]}</span></td>
          </tr>)}</tbody>
        </table>}
    </div>
  </section>;
}

function TimeStamp({ value }: { value: string }) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const time = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const today = date.toDateString() === new Date().toDateString();
  return <time dateTime={value}>{time}{!today && <span className="score-history-date">{date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}</span>}</time>;
}

export function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const time = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  return date.toDateString() === new Date().toDateString() ? time : `${date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} ${time}`;
}

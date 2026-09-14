import type { ClassSummary } from '@tool-lms/contracts';
import { GraduationCap, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import emptyClassesUrl from '../../assets/empty-classes.jpg';
import { classCommentMeta, classCommentProgress } from './selectors';

export function ClassList({
  classes,
  selectedId,
  loading,
  disabled = false,
  onSelect,
}: {
  classes: ClassSummary[];
  selectedId: string;
  loading: boolean;
  disabled?: boolean;
  onSelect: (id: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<'all' | 'done' | 'pending' | 'unknown'>('all');

  const counts = useMemo(() => {
    let done = 0;
    let pending = 0;
    let unknown = 0;
    for (const item of classes) {
      const p = classCommentProgress(item);
      if (p.state === 'done') done++;
      else if (p.state === 'pending') pending++;
      else unknown++;
    }
    return { done, pending, unknown };
  }, [classes]);

  const filteredClasses = useMemo(() => {
    if (statusFilter === 'all') return classes;
    return classes.filter((item) => classCommentProgress(item).state === statusFilter);
  }, [classes, statusFilter]);

  if (loading) {
    return (
      <div className="class-list-skeleton" aria-label="Đang tải danh sách lớp">
        {Array.from({ length: 5 }, (_, index) => (
          <span className="skeleton" key={index} />
        ))}
      </div>
    );
  }

  const toggleFilter = (filter: 'done' | 'pending' | 'unknown') => {
    setStatusFilter((current) => (current === filter ? 'all' : filter));
  };

  const split = filteredClasses.findIndex((item) => item.recentlyEnded);

  return (
    <>
      <div className="class-status-legend" aria-label="Chú thích trạng thái nhận xét lớp">
        <button
          type="button"
          className={`legend-chip ${statusFilter === 'done' ? 'active' : ''}`}
          data-filter="done"
          onClick={() => toggleFilter('done')}
        >
          <span className="legend-dot done" aria-hidden="true" />
          <span>Đã nhận xét</span>
          <span className="legend-count" id="countClassDone">({counts.done})</span>
        </button>
        <button
          type="button"
          className={`legend-chip ${statusFilter === 'pending' ? 'active' : ''}`}
          data-filter="pending"
          onClick={() => toggleFilter('pending')}
        >
          <span className="legend-dot pending" aria-hidden="true" />
          <span>Chưa nhận xét</span>
          <span className="legend-count" id="countClassPending">({counts.pending})</span>
        </button>
        <button
          type="button"
          className={`legend-chip ${statusFilter === 'unknown' ? 'active' : ''}`}
          data-filter="unknown"
          onClick={() => toggleFilter('unknown')}
        >
          <span className="legend-dot unknown" aria-hidden="true" />
          <span>Chưa có dữ liệu</span>
          <span className="legend-count" id="countClassUnknown">({counts.unknown})</span>
        </button>
      </div>

      <div className="class-list" role="listbox" aria-label="Danh sách lớp">
        {!filteredClasses.length ? (
          <div className="empty-state">
            <img
              className="empty-state-visual compact"
              src={emptyClassesUrl}
              alt="Minh họa danh sách lớp học"
              width={640}
              height={480}
              loading="lazy"
              decoding="async"
            />
            <div className="empty-state-text">
              {classes.length === 0 ? 'Đăng nhập để xem danh sách lớp' : 'Không có lớp phù hợp bộ lọc'}
            </div>
          </div>
        ) : (
          filteredClasses.map((item, index) => {
            const commentProgress = classCommentProgress(item);
            const isPending = commentProgress.state === 'pending';
            const isBlue = (item.name || '').includes('SA66') || (item.course?.name || '').toLowerCase().includes('scratch');
            const iconColor = isPending ? 'red' : isBlue ? 'blue' : 'green';
            const metaText = classCommentMeta(commentProgress);
            const percent = commentProgress.present && commentProgress.present > 0
              ? Math.round(((commentProgress.completed || 0) / commentProgress.present) * 100)
              : (commentProgress.state === 'done' ? 100 : 0);
            const endDate = item.recentlyEnded && item.endDate ? new Date(item.endDate).toLocaleDateString('vi-VN') : '';
            const endText = endDate ? ` • Kết thúc: ${endDate}` : '';

            return (
              <div key={item.id} className="class-list-row">
                {index === split && (
                  <div className="class-ended-divider">
                    <span />
                    <small>Đã kết thúc gần đây</small>
                    <span />
                  </div>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={selectedId === item.id}
                  disabled={disabled}
                  className={`class-item comment-${commentProgress.state} ${selectedId === item.id ? 'selected' : ''} ${item.recentlyEnded ? 'recently-ended' : ''}`}
                  onClick={() => onSelect(item.id)}
                >
                  <div className="class-item-top">
                    <div className={`class-avatar-icon ${iconColor}`} aria-hidden="true">
                      {isPending ? <Users size={16} /> : <GraduationCap size={16} />}
                    </div>
                    <div className="class-item-body">
                      <div className="class-item-title-row">
                        <h3>
                          {item.name}
                          {item.recentlyEnded && <small className="class-item-ended"> (Đã kết thúc)</small>}
                        </h3>
                        <span className={`class-status-badge ${commentProgress.state}`}>
                          {commentProgress.badgeText}
                        </span>
                      </div>
                      <div className="class-course-subtitle">
                        {item.course?.name || 'Chưa có khóa học'} • {item.slotCount || 0} buổi{endText}
                      </div>
                    </div>
                  </div>
                  <div className="class-item-footer">
                    {metaText && (
                      <div className="class-comment-meta">
                        <span className={`class-meta-dot ${commentProgress.state}`} aria-hidden="true" />
                        <span>{metaText}</span>
                      </div>
                    )}
                    <div className="class-progress-row">
                      <div className="class-progress-bar">
                        <div className={`class-progress-fill ${commentProgress.state}`} style={{ width: `${percent}%` }} />
                      </div>
                      <span className="class-progress-label">{percent}%</span>
                    </div>
                  </div>
                </button>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

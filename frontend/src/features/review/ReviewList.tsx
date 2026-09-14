import { useLayoutEffect, useRef } from 'react';
import type { ReviewRow as ReviewRowData } from './selectors';
import { ReviewRow } from './ReviewRow';
import { useReviewStore } from './reviewStore';

export function ReviewList({
  rows,
  selectedStudentId,
  locked,
  sessionNumber,
  onOpenDetail,
  onGenerate,
}: {
  rows: ReviewRowData[];
  selectedStudentId: string | null;
  locked: boolean;
  sessionNumber: number;
  onOpenDetail: (studentId: string, trigger: HTMLButtonElement) => void;
  onGenerate: (studentId: string, hasDraft: boolean) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const savedScroll = useReviewStore((state) => state.listScrollTop);

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = savedScroll;
  }, [savedScroll, rows.length]);

  return (
    <div className="regular-review-table-container">
      <div className="regular-review-table-header" role="row">
        <span>Học sinh</span>
        <span>Mức</span>
        <span>Nhận xét gửi phụ huynh</span>
        <span>Thao tác</span>
      </div>
      <div
        ref={scrollRef}
        className="regular-review-scroll"
        role="list"
        aria-label="Nhận xét của cả lớp"
        onScroll={(event) => useReviewStore.getState().setListScrollTop(event.currentTarget.scrollTop)}
      >
        {rows.length ? (
          rows.map((row) => (
            <ReviewRow
              key={row.studentId}
              row={row}
              selected={row.studentId === selectedStudentId}
              locked={locked}
              sessionNumber={sessionNumber}
              onOpenDetail={onOpenDetail}
              onGenerate={onGenerate}
            />
          ))
        ) : (
          <div className="regular-review-empty">
            <p>Không có nhận xét phù hợp với bộ lọc.</p>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              onClick={() => useReviewStore.getState().resetFilters()}
            >
              Xóa bộ lọc review
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

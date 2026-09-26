import type { StorageProductFile, StudentWork } from '@tool-lms/contracts';
import { useLayoutEffect, useRef } from 'react';
import type { ReviewRow as ReviewRowData } from './selectors';
import { ReviewRow } from './ReviewRow';
import { useReviewStore } from './reviewStore';

const EMPTY_REVIEW_WORKS: StudentWork[] = [];

export function ReviewList({
  rows,
  selectedStudentId,
  locked,
  sessionNumber,
  onOpenDetail,
  onGenerate,
  showProductColumn = false,
  storageFiles = [],
  storageLoading = false,
  storageError = null,
  productMenuStudentId = null,
  worksByStudent,
  onToggleProductMenu,
  onCloseProductMenu,
  onRetryStorage,
  onSubmitProducts,
}: {
  rows: ReviewRowData[];
  selectedStudentId: string | null;
  locked: boolean;
  sessionNumber: number;
  showProductColumn?: boolean;
  storageFiles?: StorageProductFile[];
  storageLoading?: boolean;
  storageError?: string | null;
  productMenuStudentId?: string | null;
  worksByStudent?: Map<string, StudentWork[]>;
  onOpenDetail: (studentId: string, trigger: HTMLButtonElement) => void;
  onGenerate: (studentId: string, hasDraft: boolean) => void;
  onToggleProductMenu?: (studentId: string) => void;
  onCloseProductMenu?: () => void;
  onRetryStorage?: () => void;
  onSubmitProducts?: (studentId: string, files: StorageProductFile[], title: string, comment: string) => Promise<void>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const savedScroll = useReviewStore((state) => state.listScrollTop);

  useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = savedScroll;
  }, [savedScroll, rows.length]);

  return (
    <div className={`regular-review-table-container${showProductColumn ? ' has-product-column' : ''}`}>
      <div className="regular-review-table-header" role="row">
        <span>Học sinh</span>
        <span>Mức</span>
        {showProductColumn && <span className="regular-review-product-heading">Sản phẩm</span>}
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
              showProductColumn={showProductColumn}
              storageFiles={storageFiles}
              storageLoading={storageLoading}
              storageError={storageError}
              productMenuOpen={productMenuStudentId === row.studentId}
              works={worksByStudent?.get(row.studentId) ?? EMPTY_REVIEW_WORKS}
              onOpenDetail={onOpenDetail}
              onGenerate={onGenerate}
              onToggleProductMenu={onToggleProductMenu}
              onCloseProductMenu={onCloseProductMenu}
              onRetryStorage={onRetryStorage}
              onSubmitProducts={onSubmitProducts}
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

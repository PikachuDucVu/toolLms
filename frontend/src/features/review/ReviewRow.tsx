import type { LearningLevel, StorageProductFile, StudentWork } from '@tool-lms/contracts';
import {
  CheckCircle2,
  ChevronDown,
  Eye,
  FileEdit,
  FileText,
  GraduationCap,
  Loader2,
  MinusCircle,
  Send,
  Sparkles,
} from 'lucide-react';
import { memo, useLayoutEffect, useRef } from 'react';
import { ProductColumnCell } from '../studentWorks/public/ProductColumnCell';
import { useToast } from '../../components/ui/Toast';
import { queueLearningLevelAutosave } from '../assessments/public/controller';
import { LEARNING_LEVEL_ORDER, levelCatalog } from '../assessments/public/selectors';
import { useAssessmentStore } from '../assessments/public/store';
import { useCommentStore } from '../comments/public/store';
import { DuplicateWarning } from './DuplicateWarning';
import type { ReviewRow as ReviewRowData } from './selectors';

export const REVIEW_AVATAR_TONES = [
  { bg: '#ffedd5', fg: '#c2410c' }, // peach/orange (Row 1: BL)
  { bg: '#dbeafe', fg: '#1d4ed8' }, // blue (Row 2: ĐM)
  { bg: '#dcfce7', fg: '#15803d' }, // green (Row 3: ĐN)
  { bg: '#ede9fe', fg: '#6d28d9' }, // purple (Row 4: NP)
  { bg: '#fef3c7', fg: '#b45309' }, // amber/yellow (Row 5: PH)
  { bg: '#e0f2fe', fg: '#0369a1' }, // sky
  { bg: '#fce7f3', fg: '#be185d' }, // pink
  { bg: '#e0e7ff', fg: '#4338ca' }, // indigo
];

export function studentAvatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const first = parts[0][0];
  const last = parts[parts.length - 1];
  if (parts.length >= 3 && last.toLowerCase() === 'anh') {
    return `${first}${parts[1][0]}`.toUpperCase();
  }
  return `${first}${last[0]}`.toUpperCase();
}

export type ReviewRowProps = {
  row: ReviewRowData;
  selected: boolean;
  locked: boolean;
  sessionNumber: number;
  showProductColumn?: boolean;
  storageFiles?: StorageProductFile[];
  storageLoading?: boolean;
  storageError?: string | null;
  productMenuOpen?: boolean;
  existingWorkCount?: number;
  works?: StudentWork[];
  onOpenDetail: (studentId: string, trigger: HTMLButtonElement) => void;
  onGenerate: (studentId: string, hasDraft: boolean) => void;
  onToggleProductMenu?: (studentId: string) => void;
  onCloseProductMenu?: () => void;
  onRetryStorage?: () => void;
  onSubmitProducts?: (studentId: string, files: StorageProductFile[], title: string, comment: string, workId?: string) => Promise<void>;
};

export const ReviewRow = memo(function ReviewRow({
  row,
  selected,
  locked,
  sessionNumber,
  showProductColumn = false,
  storageFiles = [],
  storageLoading = false,
  storageError = null,
  productMenuOpen = false,
  works = [],
  onOpenDetail,
  onGenerate,
  onToggleProductMenu,
  onCloseProductMenu,
  onRetryStorage,
  onSubmitProducts,
}: ReviewRowProps) {
  const toast = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const assessmentBlocked =
    row.assessmentStatus.kind === 'loading' ||
    row.assessmentStatus.kind === 'load-error' ||
    row.assessmentStatus.kind === 'saving';

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(72, textarea.scrollHeight)}px`;
  }, [row.commentText]);

  const setLevel = (learningLevel: LearningLevel) => {
    useAssessmentStore.getState().setLearningLevelDraft(row.studentId, learningLevel);
    void queueLearningLevelAutosave(row.studentId);
  };

  const tone = REVIEW_AVATAR_TONES[row.index % REVIEW_AVATAR_TONES.length];


  return (
    <article
      className={`regular-review-row ${selected ? 'is-selected' : ''} ${row.hasWarning ? 'has-warning' : ''} ${!row.isPresent ? 'is-absent' : ''}`}
      data-review-row={row.studentId}
      role="listitem"
      aria-current={selected ? 'true' : undefined}
    >
      <div className="regular-review-student-cell">
        <div
          className="regular-review-avatar"
          style={{ backgroundColor: tone.bg, color: tone.fg }}
          aria-hidden="true"
        >
          {studentAvatarInitials(row.studentName)}
        </div>
        <div className="regular-review-student-info">
          <strong>{row.studentName}</strong>
          <div className="regular-review-row-meta">
            {row.isPresent ? (
              <span className="regular-review-badge-pill is-attended">
                <CheckCircle2 size={12} />
                <span>{row.attendance.label}</span>
              </span>
            ) : row.attendance.label.includes('phép') ? (
              <span className="regular-review-badge-pill is-notice">
                <Send size={11} className="rotate-[-45deg]" />
                <span>{row.attendance.label}</span>
              </span>
            ) : (
              <span className="regular-review-badge-pill is-absent">
                <MinusCircle size={12} />
                <span>{row.attendance.label}</span>
              </span>
            )}

            {row.isDraft ? (
              <span className="regular-review-badge-pill is-draft">
                <FileEdit size={12} />
                <span>Bản nháp</span>
              </span>
            ) : row.source === 'submitted' ? (
              <span className="regular-review-badge-pill is-submitted">
                <GraduationCap size={13} />
                <span>Đã có trên LMS</span>
              </span>
            ) : (
              <span className="regular-review-badge-pill is-missing">
                <FileText size={12} />
                <span>Chưa có nhận xét</span>
              </span>
            )}

            {row.busy && (
              <span className="regular-review-badge-pill is-busy" role="status">
                <Loader2 size={12} className="animate-spin" />
                <span>Đang xử lý</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="regular-review-level-cell">
        {row.isPresent ? (
          <label className="regular-review-level-control">
            <span className="sr-only">Đổi mức học của {row.studentName}</span>
            <div className="regular-review-select-wrap">
              <select
                className="form-select regular-review-level-select"
                aria-label={`Đổi mức học của ${row.studentName}`}
                value={row.learningLevel}
                disabled={locked || assessmentBlocked}
                onChange={(event) => setLevel(event.target.value as LearningLevel)}
              >
                {LEARNING_LEVEL_ORDER.map((level) => (
                  <option key={level} value={level}>
                    {levelCatalog(sessionNumber)[level].code} · {levelCatalog(sessionNumber)[level].shortLabel}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} className="regular-review-select-chevron" />
            </div>
          </label>
        ) : (
          <span className="regular-review-level-unavailable">Không đánh giá học sinh vắng</span>
        )}
        <span className="regular-review-level-text">
          {row.learningLevelInfo.code} · {row.learningLevelInfo.shortLabel}
        </span>
        <small className={`regular-review-level-status review-assessment-status status-${row.assessmentStatus.kind}`}>
          {row.assessmentStatus.text}
        </small>
      </div>

      {showProductColumn && (
        <div className="regular-review-product-cell">
          <ProductColumnCell
            studentId={row.studentId}
            studentName={row.studentName}
            files={storageFiles}
            works={works}
            loading={storageLoading}
            error={storageError}
            locked={locked}
            menuOpen={productMenuOpen}
            onToggle={onToggleProductMenu}
            onClose={onCloseProductMenu}
            onRetry={onRetryStorage}
            onSubmit={onSubmitProducts}
          />
        </div>
      )}

      <div className="regular-review-comment-cell">
        {row.isDraft ? (
          <>
            <label className="sr-only" htmlFor={`review-comment-${safeId(row.studentId)}`}>
              Nhận xét của {row.studentName}
            </label>
            <textarea
              ref={textareaRef}
              id={`review-comment-${safeId(row.studentId)}`}
              className="regular-review-comment"
              rows={3}
              value={useCommentStore.getState().drafts[row.studentId]?.content || ''}
              disabled={locked}
              onChange={(event) => useCommentStore.getState().editDraft(row.studentId, event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                  event.preventDefault();
                  toast.show('Đã cập nhật bản nháp trong phiên làm việc', 'success');
                }
              }}
            />
          </>
        ) : (
          <div
            className={`regular-review-comment-placeholder ${row.hasExistingComment ? 'has-existing' : ''} ${!row.isPresent ? 'is-absent' : ''}`}
          >
            {row.hasExistingComment
              ? row.commentText
              : row.isPresent
                ? 'Chưa có bản nháp AI cho học sinh này.'
                : 'Học sinh vắng, không nằm trong thao tác hàng loạt.'}
          </div>
        )}
        <div className="regular-review-comment-meta">
          <DuplicateWarning row={row} />
          <span className="character-count">{row.characterCount} ký tự</span>
        </div>
      </div>

      <div className="regular-review-actions-cell">
        <button
          type="button"
          id={`review-detail-${safeId(row.studentId)}`}
          data-review-detail={row.studentId}
          className="btn btn-sm btn-outline regular-review-action-btn"
          aria-expanded={selected}
          disabled={locked}
          onClick={(event) => onOpenDetail(row.studentId, event.currentTarget)}
        >
          <Eye size={13} />
          <span>Chi tiết</span>
        </button>
        <button
          type="button"
          className={`btn btn-sm ${row.isDraft ? 'btn-outline' : 'btn-primary'} regular-review-action-btn ${!row.isPresent ? 'is-disabled-ai' : ''}`}
          disabled={locked || !row.isPresent || assessmentBlocked}
          aria-busy={row.busy}
          onClick={() => onGenerate(row.studentId, row.isDraft)}
        >
          {row.busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          <span>{row.busy ? 'Đang tạo...' : row.isDraft ? 'Tạo lại' : 'Tạo AI'}</span>
        </button>
      </div>
    </article>
  );
}, sameReviewRowProps);

export function sameReviewRowProps(left: ReviewRowProps, right: ReviewRowProps): boolean {
  const leftRow = left.row;
  const rightRow = right.row;
  return (
    left.selected === right.selected &&
    left.locked === right.locked &&
    left.sessionNumber === right.sessionNumber &&
    left.onOpenDetail === right.onOpenDetail &&
    left.onGenerate === right.onGenerate &&
    left.showProductColumn === right.showProductColumn &&
    left.storageFiles === right.storageFiles &&
    left.storageLoading === right.storageLoading &&
    left.storageError === right.storageError &&
    left.productMenuOpen === right.productMenuOpen &&
    left.works === right.works &&
    left.onToggleProductMenu === right.onToggleProductMenu &&
    left.onCloseProductMenu === right.onCloseProductMenu &&
    left.onRetryStorage === right.onRetryStorage &&
    left.onSubmitProducts === right.onSubmitProducts &&
    leftRow.student === rightRow.student &&
    leftRow.studentId === rightRow.studentId &&
    leftRow.studentName === rightRow.studentName &&
    leftRow.attendance.label === rightRow.attendance.label &&
    leftRow.attendance.tone === rightRow.attendance.tone &&
    leftRow.isPresent === rightRow.isPresent &&
    leftRow.learningLevel === rightRow.learningLevel &&
    leftRow.assessmentStatus.kind === rightRow.assessmentStatus.kind &&
    leftRow.assessmentStatus.text === rightRow.assessmentStatus.text &&
    leftRow.commentText === rightRow.commentText &&
    leftRow.isDraft === rightRow.isDraft &&
    leftRow.hasExistingComment === rightRow.hasExistingComment &&
    leftRow.source === rightRow.source &&
    leftRow.characterCount === rightRow.characterCount &&
    leftRow.operationError === rightRow.operationError &&
    leftRow.busy === rightRow.busy &&
    leftRow.duplicateCount === rightRow.duplicateCount &&
    leftRow.hasWarning === rightRow.hasWarning &&
    leftRow.generationWarning === rightRow.generationWarning
  );
}

export function safeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

import { CheckCircle2, ClipboardCheck, FileEdit, FileText, GraduationCap, Loader2, MinusCircle, Send, Sparkles } from 'lucide-react';
import { memo, useLayoutEffect, useRef } from 'react';
import { REVIEW_AVATAR_TONES, safeId, studentAvatarInitials } from '../review/public/components';
import type { CheckpointReviewRow as RowData } from './checkpointReviewSelectors';
import { useCheckpointStore } from './checkpointStore';

export type CheckpointReviewRowProps = {
  row: RowData;
  locked: boolean;
  canSubmit: boolean;
  canGrade: boolean;
  onGenerate: (studentId: string) => void;
  onGrade: (studentId: string) => void;
  onSubmit: (studentId: string) => void;
};

export const CheckpointReviewRow = memo(function CheckpointReviewRow({ row, locked, canSubmit, canGrade, onGenerate, onGrade, onSubmit }: CheckpointReviewRowProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tone = REVIEW_AVATAR_TONES[row.index % REVIEW_AVATAR_TONES.length];
  const id = safeId(row.studentId);
  const store = useCheckpointStore.getState;

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.max(72, textarea.scrollHeight)}px`;
  }, [row.currentComment]);

  return (
    <article
      className={`regular-review-row ${row.hasWarning ? 'has-warning' : ''} ${!row.isPresent ? 'is-absent' : ''}`}
      data-review-row={row.studentId}
      role="listitem"
    >
      <div className="regular-review-student-cell">
        <div className="regular-review-avatar" style={{ backgroundColor: tone.bg, color: tone.fg }} aria-hidden="true">
          {studentAvatarInitials(row.studentName)}
        </div>
        <div className="regular-review-student-info">
          <strong>{row.studentName}</strong>
          <div className="regular-review-row-meta">
            {row.isPresent ? (
              <span className="regular-review-badge-pill is-attended"><CheckCircle2 size={12} /><span>{row.attendance.label}</span></span>
            ) : (
              <span className="regular-review-badge-pill is-absent"><MinusCircle size={12} /><span>{row.attendance.label}</span></span>
            )}
            {row.isDraft ? (
              <span className="regular-review-badge-pill is-draft"><FileEdit size={12} /><span>Bản nháp</span></span>
            ) : row.source === 'submitted' ? (
              <span className="regular-review-badge-pill is-submitted"><GraduationCap size={13} /><span>Đã có trên LMS</span></span>
            ) : (
              <span className="regular-review-badge-pill is-missing"><FileText size={12} /><span>Chưa có nhận xét</span></span>
            )}
            {row.busy && (
              <span className="regular-review-badge-pill is-busy" role="status"><Loader2 size={12} className="animate-spin" /><span>Đang xử lý</span></span>
            )}
          </div>
        </div>
      </div>

      <div className="regular-review-level-cell checkpoint-review-score-cell">
        {row.isPresent ? (
          <>
            <div className="checkpoint-review-score-inputs">
              <label>
                <span>LT</span>
                <input
                  type="number"
                  inputMode="decimal"
                  className="checkpoint-score-input"
                  min={0}
                  max={5}
                  step={0.5}
                  placeholder="Auto"
                  value={row.theoryInput}
                  disabled={locked}
                  aria-label={`Điểm lý thuyết Checkpoint của ${row.studentName}`}
                  onChange={(event) => store().setTheoryInput(row.studentId, event.target.value)}
                />
              </label>
              <label>
                <span>TH</span>
                <input
                  type="number"
                  inputMode="decimal"
                  className="checkpoint-score-input"
                  min={0}
                  max={5}
                  step={0.5}
                  placeholder="Auto"
                  value={row.practiceInput}
                  disabled={locked}
                  aria-label={`Điểm thực hành Checkpoint của ${row.studentName}`}
                  onChange={(event) => store().setPracticeInput(row.studentId, event.target.value)}
                />
              </label>
            </div>
            <small className="regular-review-level-status">
              {row.hasScore ? (
                <>TB <b>{row.averageText}</b>/5{row.rank && <span className={`checkpoint-rank ${row.rank}`}>{row.rank}</span>}</>
              ) : 'Để trống = random 4–5'}
            </small>
          </>
        ) : (
          <span className="regular-review-level-unavailable">Vắng — không chấm điểm</span>
        )}
      </div>

      <div className="regular-review-comment-cell">
        {row.isPresent ? (
          <>
            <label className="sr-only" htmlFor={`checkpoint-review-note-${id}`}>Ghi chú cho AI của {row.studentName}</label>
            <textarea
              id={`checkpoint-review-note-${id}`}
              className="regular-review-comment checkpoint-review-note"
              rows={2}
              placeholder="Ghi chú cho AI: điểm mạnh, điểm cần cải thiện…"
              value={row.teacherDescription}
              disabled={locked}
              onChange={(event) => store().setTeacherDescription(row.studentId, event.target.value)}
            />
            {!row.isDraft && row.hasExistingComment && (
              <div className="regular-review-comment-placeholder has-existing">{row.existingComment}</div>
            )}
            <label className="sr-only" htmlFor={`checkpoint-review-comment-${id}`}>Nhận xét của {row.studentName}</label>
            <textarea
              ref={textareaRef}
              id={`checkpoint-review-comment-${id}`}
              className="regular-review-comment"
              rows={3}
              placeholder={row.hasExistingComment && !row.isDraft ? 'Nhập nhận xét mới để thay thế nhận xét trên LMS…' : 'Nhập nhận xét thủ công, hoặc bấm Tạo AI…'}
              value={row.currentComment}
              disabled={locked}
              onChange={(event) => store().setCurrentComment(row.studentId, event.target.value)}
            />
          </>
        ) : (
          <div className={`regular-review-comment-placeholder is-absent ${row.hasExistingComment ? 'has-existing' : ''}`}>
            {row.hasExistingComment ? row.existingComment : 'Học sinh vắng, không nằm trong thao tác Checkpoint.'}
          </div>
        )}
        <div className="regular-review-comment-meta">
          <span className="regular-review-warning" role={row.operationError ? 'alert' : undefined}>
            {row.operationError ? `Cảnh báo: ${row.operationError}` : row.duplicateCount > 0 ? `Cảnh báo: Câu mở đầu tương tự ${row.duplicateCount - 1} nhận xét khác` : ''}
          </span>
          <span className="character-count">{row.characterCount} ký tự</span>
        </div>
      </div>

      <div className="regular-review-actions-cell">
        {row.isPresent && (
          <>
            <button type="button" className="btn btn-sm btn-outline regular-review-action-btn" disabled={locked || !canGrade} title={canGrade ? 'Chấm trắc nghiệm và tự luận từ bài nộp kiemtra' : 'Học sinh chưa nộp bài trên kiemtra'} aria-busy={row.gradeBusy} onClick={() => onGrade(row.studentId)}>
              {row.gradeBusy ? <Loader2 size={13} className="animate-spin" /> : <ClipboardCheck size={13} />}
              <span>{row.gradeBusy ? 'Đang chấm...' : 'AI chấm'}</span>
            </button>
            <button type="button" className={`btn btn-sm ${row.isDraft ? 'btn-outline' : 'btn-primary'} regular-review-action-btn`} disabled={locked} aria-busy={row.generationBusy} onClick={() => onGenerate(row.studentId)}>
              {row.generationBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              <span>{row.generationBusy ? 'Đang tạo...' : row.isDraft ? 'Tạo lại' : 'Tạo AI'}</span>
            </button>
            <button type="button" className="btn btn-sm btn-checkpoint regular-review-action-btn" disabled={locked || !canSubmit} aria-busy={row.submitBusy} onClick={() => onSubmit(row.studentId)}>
              {row.submitBusy ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              <span>{row.submitBusy ? 'Đang gửi...' : row.hasCheckpoint ? 'Gửi lại' : 'Gửi'}</span>
            </button>
          </>
        )}
      </div>
    </article>
  );
}, sameCheckpointReviewRowProps);

export function sameCheckpointReviewRowProps(left: CheckpointReviewRowProps, right: CheckpointReviewRowProps): boolean {
  if (left.locked !== right.locked || left.canSubmit !== right.canSubmit || left.canGrade !== right.canGrade) return false;
  if (left.onGenerate !== right.onGenerate || left.onGrade !== right.onGrade || left.onSubmit !== right.onSubmit) return false;
  const a = left.row as Record<string, unknown>;
  const b = right.row as Record<string, unknown>;
  return Object.keys(a).every((key) => key === 'attendance' ? left.row.attendance.label === right.row.attendance.label : a[key] === b[key]);
}

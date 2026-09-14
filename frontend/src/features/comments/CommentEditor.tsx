import type { ClassDetail, Slot, StudentAttendance } from '@tool-lms/contracts';
import { Copy, MoreVertical, Send, Sparkles, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { existingContentComment, stripHtml } from '../classes/public/domain';
import { CopyDialog } from './CopyDialog';
import { copyWithFallback, individualZaloText } from './copyExport';
import { useCommentStore } from './commentStore';
import { generateSingleComment, submitSingleComment, type RegularCommentScope } from './generationController';
import { isProductProgressSession } from '../assessments/public/selectors';

export function CommentEditor({
  detail,
  slot,
  sessionNumber,
  student,
  selectedStudentId,
  locked = false,
}: {
  detail: ClassDetail;
  slot: Slot;
  sessionNumber: number;
  student: StudentAttendance;
  selectedStudentId: string | null;
  locked?: boolean;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const draft = useCommentStore((state) => state.drafts[student.studentId]);
  const error = useCommentStore((state) => state.errors[student.studentId]);
  const studentBusy = useCommentStore((state) => state.studentBusy.has(student.studentId));
  const operationBusy = useCommentStore(
    (state) => state.studentBusy.size > 0 || Boolean(state.batch) || state.summaryBusy,
  );
  const summary = useCommentStore((state) => state.summaryDraft);
  const [copyText, setCopyText] = useState('');
  const scope: RegularCommentScope = { detail, slot, sessionNumber, selectedStudentId };

  const existingComment = stripHtml(existingContentComment(student));
  const hasComment = Boolean(draft?.content.trim() || existingComment.trim());

  const generate = async () => {
    if (draft) {
      const accepted = await confirm({
        title: 'Tạo lại nhận xét?',
        description: 'Bản nháp hiện tại sẽ được thay thế sau khi AI tạo thành công.',
        confirmLabel: 'Tạo lại',
      });
      if (!accepted) return;
    }
    try {
      const meta = await generateSingleComment(scope, student.studentId);
      toast.show(
        meta.source === 'safe_template'
          ? 'AI chưa bám đúng level; hệ thống đã dùng mẫu an toàn.'
          : 'Đã tạo nhận xét!',
        meta.source === 'safe_template' ? 'info' : 'success',
      );
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
        toast.show(`Lỗi tạo nhận xét: ${cause instanceof Error ? cause.message : String(cause)}`, 'error');
      }
    }
  };

  const remove = async () => {
    if (!draft) return;
    const accepted = await confirm({
      title: 'Xóa bản nháp nhận xét',
      description: 'Xóa bản nháp của học sinh này?',
      confirmLabel: 'Xóa',
    });
    if (!accepted) return;
    useCommentStore.getState().removeDraft(student.studentId);
    toast.show('Đã xóa nhận xét');
  };

  const submit = async () => {
    try {
      await submitSingleComment(scope, student.studentId);
      toast.show('Đã gửi nhận xét lên LMS!', 'success');
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
        toast.show(`Lỗi submit: ${cause instanceof Error ? cause.message : String(cause)}`, 'error');
      }
    }
  };

  const copy = async () => {
    const comment = draft?.content || existingComment;
    if (!comment.trim()) return toast.show('Chưa có nhận xét', 'error');
    const text = individualZaloText(student.displayName, comment, summary);
    const mobile = window.innerWidth <= 768 || 'ontouchstart' in window;
    if (!mobile && (await copyWithFallback(text))) toast.show('Đã copy nhận xét Zalo!', 'success');
    else setCopyText(text);
  };

  const status = draft?.kind === 'generated'
    ? 'Bản nháp AI'
    : draft?.kind === 'manual'
      ? 'Bản nháp thủ công'
      : existingComment
        ? 'Đã gửi LMS'
        : '';

  return (
    <section className="student-detail-section comment-editor" aria-label={`Nhận xét gửi phụ huynh của ${student.displayName}`}>
      <div className="student-detail-title">
        <span>Nhận xét gửi phụ huynh</span>
        {status && (
          <span className={`badge ${draft ? 'badge-generated' : 'badge-success'}`}>
            {status}
          </span>
        )}
      </div>

      {studentBusy ? (
        <div className="regular-ai-generating" role="status" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <div className="regular-ai-generating-title">AI đang tạo nhận xét cho {student.displayName}...</div>
          <div className="regular-ai-generating-desc">{isProductProgressSession(sessionNumber) ? 'Đang tổng hợp tiến độ sản phẩm, ghi chú và lịch sử buổi học.' : 'Đang tổng hợp mức độ nắm bài, ghi chú và lịch sử buổi học.'}</div>
        </div>
      ) : (
        <textarea
          className="form-input comment-draft-input comment-edit"
          rows={5}
          aria-label={`Chỉnh sửa nhận xét của ${student.displayName}`}
          value={draft?.content || ''}
          disabled={locked || operationBusy}
          placeholder="Nhập nhận xét thủ công, hoặc bấm Tạo nhận xét AI..."
          onChange={(event) => useCommentStore.getState().editDraft(student.studentId, event.target.value)}
        />
      )}

      {draft?.generationMeta?.source === 'safe_template' && (
        <p className="comment-warning">AI chưa bám đúng level; hệ thống đã dùng mẫu an toàn.</p>
      )}

      {draft?.generationMeta?.validationIssues.length ? (
        <details className="comment-validation">
          <summary>Cảnh báo kiểm tra nội dung ({draft.generationMeta.validationIssues.length})</summary>
          <ul>
            {draft.generationMeta.validationIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {error && <p className="comment-error" role="alert">{error}</p>}

      <div className="student-detail-actions" style={{ marginTop: 12 }}>
        <button
          type="button"
          className={`btn btn-sm ${draft ? 'btn-outline' : 'btn-primary'}`}
          disabled={locked || operationBusy}
          aria-busy={studentBusy}
          onClick={() => void generate()}
        >
          <Sparkles size={14} />
          {studentBusy ? 'Đang tạo...' : draft ? 'Tạo lại nhận xét' : 'Tạo nhận xét AI'}
        </button>

        {draft && (
          <button
            type="button"
            className="btn btn-sm btn-outline"
            disabled={!draft || locked || operationBusy}
            onClick={() => void remove()}
          >
            <Trash2 size={14} />
            Xóa
          </button>
        )}

        {draft && (
          <button
            type="button"
            className="btn btn-sm btn-success detail-primary"
            disabled={!draft.content.trim() || !summary.trim() || locked || operationBusy}
            onClick={() => void submit()}
          >
            <Send size={14} />
            Gửi lên LMS
          </button>
        )}

        {hasComment && (
          <details className="detail-overflow">
            <summary className="btn btn-sm btn-outline" aria-label={`Thêm thao tác với ${student.displayName}`}>
              <MoreVertical size={14} />
              Thêm
            </summary>
            <div className="detail-menu-popover">
              <button
                type="button"
                className="menu-action"
                onClick={(e) => {
                  (e.target as HTMLElement).closest('details')?.removeAttribute('open');
                  void copy();
                }}
              >
                <Copy size={14} />
                Sao chép cho Zalo
              </button>
              {draft && (
                <button
                  type="button"
                  className="menu-action danger"
                  onClick={(e) => {
                    (e.target as HTMLElement).closest('details')?.removeAttribute('open');
                    void remove();
                  }}
                >
                  <Trash2 size={14} />
                  Xóa bản nháp AI
                </button>
              )}
            </div>
          </details>
        )}
      </div>

      <CopyDialog
        open={Boolean(copyText)}
        title="Copy nhận xét"
        text={copyText}
        onClose={() => setCopyText('')}
        onCopied={() => toast.show('Đã copy nhận xét Zalo!', 'success')}
      />
    </section>
  );
}

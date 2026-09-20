import type { ClassDetail, Slot, StudentAttendance } from '@tool-lms/contracts';
import { Copy, Download, MoreVertical, Rows3, Send, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { BatchProgressBar } from '../../components/ui/ProgressBar';
import { useToast } from '../../components/ui/Toast';
import { useAssessmentStore } from '../assessments/public/store';
import { existingContentComment, isPresent, stripHtml } from '../classes/public/domain';
import { useReviewStore } from '../review/public/store';
import { CopyDialog } from './CopyDialog';
import { classZaloText, copyWithFallback, downloadCsv, regularCommentsCsv } from './copyExport';
import { useCommentStore, type CommentBatchState } from './commentStore';
import { generateBatchComments, submitBatchComments, type RegularCommentScope } from './generationController';

export function BatchActions({
  detail,
  slot,
  sessionNumber,
  selectedStudentId,
  visibleStudents,
  locked = false,
}: {
  detail: ClassDetail;
  slot: Slot;
  sessionNumber: number;
  selectedStudentId: string | null;
  visibleStudents: StudentAttendance[];
  locked?: boolean;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const drafts = useCommentStore((state) => state.drafts);
  const batch = useCommentStore((state) => state.batch);
  const operationBusy = useCommentStore(
    (state) => state.studentBusy.size > 0 || Boolean(state.batch) || state.summaryBusy,
  );
  const summary = useCommentStore((state) => state.summaryDraft);
  const [copyText, setCopyText] = useState('');
  const presentIds = slot.studentAttendance.filter(isPresent).map((student) => student.studentId);
  const visiblePresentIds = visibleStudents.filter(isPresent).map((student) => student.studentId);
  const allDraftIds = presentIds.filter((id) => drafts[id]?.content.trim());
  const filteredDraftIds = visiblePresentIds.filter((id) => drafts[id]?.content.trim());
  const filtered = visiblePresentIds.length !== presentIds.length;
  const scope: RegularCommentScope = { detail, slot, sessionNumber, selectedStudentId };
  const studentNames = Object.fromEntries(slot.studentAttendance.map((s) => [s.studentId, s.displayName]));

  const generate = async (ids: string[], filteredScope: boolean) => {
    const frozenIds = [...ids];
    if (!frozenIds.length) return toast.show('Không có học sinh phù hợp để tạo nhận xét', 'info');
    const accepted = await confirm({
      title: filteredScope ? 'Tạo nhận xét AI cho học sinh đang lọc' : 'Tạo nhận xét AI cho cả lớp',
      description: `AI sẽ tạo nhận xét cho ${frozenIds.length} học sinh có mặt${filteredScope ? ' trong bộ lọc hiện tại' : ''}. Danh sách này sẽ không đổi nếu bộ lọc thay đổi. Tiếp tục?`,
      confirmLabel: 'Tạo AI',
    });
    if (!accepted) return;
    try {
      const result = await generateBatchComments(scope, frozenIds);
      const failedNames = result.failures
        .slice(0, 3)
        .map(
          (failure) =>
            slot.studentAttendance.find((student) => student.studentId === failure.studentId)?.displayName ||
            failure.studentId,
        );
      const message = result.failures.length
        ? `Đã tạo ${result.successfulIds.length}/${result.total} nhận xét. Lỗi: ${failedNames.join(', ')}${result.failures.length > 3 ? '...' : ''}`
        : result.safeTemplateCount
          ? 'AI chưa bám đúng level; hệ thống đã dùng mẫu an toàn.'
          : `Đã tạo ${result.successfulIds.length} nhận xét!`;
      toast.show(message, result.failures.length || result.safeTemplateCount ? 'info' : 'success');
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
        toast.show(`Lỗi tạo nhận xét cả lớp: ${cause instanceof Error ? cause.message : String(cause)}`, 'error');
      }
    }
  };

  const submit = async (ids: string[], filteredScope: boolean) => {
    const frozenIds = [...ids];
    if (!summary.trim()) return toast.show('Vui lòng nhập tổng kết buổi học', 'error');
    if (!frozenIds.length) return toast.show('Không có bản nháp phù hợp để gửi', 'info');
    const accepted = await confirm({
      title: filteredScope ? 'Gửi các bản nháp đang lọc?' : 'Gửi tất cả bản nháp?',
      description: `Sẽ gửi tuần tự ${frozenIds.length} nhận xét lên LMS. Chỉ bản nháp gửi thành công bị xóa; thao tác lỗi sẽ không tự thử lại.`,
      confirmLabel: `Gửi ${frozenIds.length} nhận xét`,
    });
    if (!accepted) return;
    try {
      const result = await submitBatchComments(scope, frozenIds);
      toast.show(
        result.failures.length
          ? `Đã gửi ${result.successfulIds.length}/${result.total}; còn ${result.failures.length} nhận xét chưa gửi, bản nháp vẫn được giữ lại.`
          : `Đã gửi ${result.successfulIds.length}/${result.total} nhận xét lên LMS!`,
        result.failures.length ? 'info' : 'success',
      );
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
        toast.show(`Lỗi gửi nhận xét cả lớp: ${cause instanceof Error ? cause.message : String(cause)}`, 'error');
      }
    }
  };

  const copyAll = async () => {
    const value = classZaloText({ slot, sessionNumber, summary, drafts });
    if (!value.count) return toast.show('Chưa có nhận xét nào', 'error');
    const mobile = window.innerWidth <= 768 || 'ontouchstart' in window;
    if (!mobile && (await copyWithFallback(value.text))) {
      toast.show(`Đã copy ${value.count} nhận xét Zalo!`, 'success');
    } else {
      setCopyText(value.text);
    }
  };

  const exportCsv = () => {
    downloadCsv(detail, slot, regularCommentsCsv(slot.studentAttendance, drafts, useAssessmentStore.getState(), sessionNumber), sessionNumber);
    toast.show('Đã export CSV!', 'success');
  };

  return (
    <>
      <div className="action-bar" id="defaultActionBar" style={{ display: 'flex' }}>
        <div className="batch-action-copy">
          <strong>Thao tác cả lớp</strong>
          <span id="batchActionHint">Áp dụng cho học sinh có mặt</span>
        </div>
        <div className="batch-action-buttons">
          <button
            type="button"
            className="btn btn-primary"
            id="autoCommentBtn"
            disabled={locked || operationBusy || !presentIds.length}
            onClick={() => void generate(presentIds, false)}
          >
            <Sparkles size={14} />
            <span id="autoCommentBtnLabel">Tạo AI cho cả lớp ({presentIds.length})</span>
          </button>

          {filtered && (
            <button
              type="button"
              className="btn btn-outline"
              disabled={locked || operationBusy || !visiblePresentIds.length}
              onClick={() => void generate(visiblePresentIds, true)}
            >
              <Sparkles size={14} />
              <span>Tạo AI đang lọc ({visiblePresentIds.length})</span>
            </button>
          )}

          <button
            type="button"
            className="btn btn-outline"
            id="reviewAllBtn"
            onClick={() => useReviewStore.getState().openReview()}
          >
            <Rows3 size={14} />
            <span id="reviewAllBtnLabel">Review nhận xét</span>
          </button>

          <button
            type="button"
            className="btn btn-success"
            id="submitAllBtn"
            disabled={locked || operationBusy || !allDraftIds.length || !summary.trim()}
            onClick={() => void submit(allDraftIds, false)}
          >
            <Send size={14} />
            <span id="submitAllBtnLabel">Gửi lên LMS ({allDraftIds.length})</span>
          </button>

          {filtered && filteredDraftIds.length !== allDraftIds.length && (
            <button
              type="button"
              className="btn btn-outline"
              disabled={locked || operationBusy || !filteredDraftIds.length || !summary.trim()}
              onClick={() => void submit(filteredDraftIds, true)}
            >
              <Send size={14} />
              <span>Gửi đang lọc ({filteredDraftIds.length})</span>
            </button>
          )}

          <details className="batch-overflow">
            <summary className="btn btn-outline" aria-label="Mở thêm thao tác cả lớp" title="Thêm thao tác">
              <MoreVertical size={14} />
            </summary>
            <div className="detail-menu-popover">
              <button
                type="button"
                className="menu-action"
                id="copyZaloBtn"
                disabled={!slot.studentAttendance.some((student) => drafts[student.studentId]?.content || existing(student))}
                onClick={(e) => {
                  (e.target as HTMLElement).closest('details')?.removeAttribute('open');
                  void copyAll();
                }}
              >
                <Copy size={14} />
                <span id="copyZaloBtnLabel">Sao chép Zalo cả lớp</span>
              </button>
              <button
                type="button"
                className="menu-action"
                disabled={!slot.studentAttendance.length}
                onClick={(e) => {
                  (e.target as HTMLElement).closest('details')?.removeAttribute('open');
                  exportCsv();
                }}
              >
                <Download size={14} />
                <span>Xuất file CSV</span>
              </button>
            </div>
          </details>
        </div>
      </div>

      {batch && <BatchProgress batch={batch} studentNames={studentNames} />}

      <CopyDialog
        open={Boolean(copyText)}
        title="Copy nhận xét cả lớp"
        text={copyText}
        onClose={() => setCopyText('')}
        onCopied={() => toast.show('Đã copy nhận xét Zalo!', 'success')}
      />
    </>
  );
}

function BatchProgress({
  batch,
  studentNames = {},
}: {
  batch: CommentBatchState;
  studentNames?: Record<string, string>;
}) {
  const percent = Math.round((batch.completed / Math.max(batch.total, 1)) * 100);
  const phase =
    batch.phase === 'persisting'
      ? 'Đang lưu đánh giá'
      : batch.phase === 'generating'
        ? 'Đang tạo nhận xét AI'
        : 'Đang gửi LMS';
  const currentName =
    batch.kind === 'generate'
      ? null
      : batch.currentStudentId
        ? studentNames[batch.currentStudentId] || batch.currentStudentId
        : null;

  return (
    <BatchProgressBar
      className="comment-batch-progress"
      role="status"
      aria-live="polite"
      aria-label={`${phase}: ${batch.completed}/${batch.total}`}
      phaseLabel={phase}
      completed={batch.completed}
      total={batch.total}
      percent={percent}
      successful={batch.successful}
      failureCount={Object.keys(batch.failures).length}
      currentStudentName={currentName}
      variant="primary"
      statusText={`${percent}% (${batch.completed}/${batch.total})`}
      failuresNotice={
        Object.keys(batch.failures).length > 0
          ? `${Object.keys(batch.failures).length} học sinh lỗi; bản nháp liên quan được giữ lại.`
          : undefined
      }
      extraMeta={
        batch.safeTemplateCount > 0 ? (
          <div className="progress-notice progress-notice-warning">
            <small>{batch.safeTemplateCount} nhận xét dùng mẫu an toàn.</small>
          </div>
        ) : undefined
      }
    />
  );
}

function existing(student: StudentAttendance): boolean {
  return Boolean(stripHtml(existingContentComment(student)));
}

import type { ClassDetail, Slot } from '@tool-lms/contracts';
import { Send, Sparkles } from 'lucide-react';
import { useCallback } from 'react';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { useClassWorkspaceStore } from '../classes/public/domain';
import { useCommentStore } from '../comments/public/store';
import { generateBatchComments, generateSingleComment, submitBatchComments, type RegularCommentScope } from '../comments/public/controller';
import { allPresentIds, type ReviewRow } from './selectors';
import { freezeReviewGenerationScope, freezeReviewSubmitScope } from './scopedActions';

export function useReviewScopedActions({ detail, slot, sessionNumber }: { detail: ClassDetail; slot: Slot; sessionNumber: number }) {
  const confirm = useConfirm();
  const toast = useToast();
  const scope = useCallback((selectedStudentId: string | null): RegularCommentScope => ({ detail, slot, sessionNumber, selectedStudentId }), [detail, sessionNumber, slot]);

  const generate = useCallback(async (ids: string[], filtered: boolean) => {
    const frozenIds = freezeReviewGenerationScope(ids);
    if (!frozenIds.length) return toast.show('Không có học sinh có mặt phù hợp bộ lọc', 'info');
    const accepted = await confirm({
      title: filtered ? `Tạo lại ${frozenIds.length} nhận xét đang lọc?` : `Tạo lại nhận xét cho ${frozenIds.length} học sinh?`,
      description: `Phạm vi gồm đúng ${frozenIds.length} học sinh có mặt tại thời điểm xác nhận và sẽ không đổi nếu bộ lọc thay đổi.`,
      confirmLabel: `Tạo AI (${frozenIds.length})`,
    });
    if (!accepted) return;
    try {
      const result = await generateBatchComments(scope(useClassWorkspaceStore.getState().studentId), frozenIds);
      toast.show(result.failures.length ? `Đã tạo ${result.successfulIds.length}/${result.total}; ${result.failures.length} học sinh lỗi.` : `Đã tạo ${result.successfulIds.length} nhận xét!`, result.failures.length || result.safeTemplateCount ? 'info' : 'success');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) toast.show(`Lỗi tạo nhận xét cả lớp: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }, [confirm, scope, toast]);

  const submit = useCallback(async (rows: ReviewRow[], filtered: boolean) => {
    const commentState = useCommentStore.getState();
    const frozen = freezeReviewSubmitScope(rows, commentState.drafts, commentState.summaryDraft);
    if (!frozen.summary) return toast.show('Vui lòng nhập tổng kết buổi học', 'error');
    if (!frozen.ids.length) return toast.show('Không có bản nháp phù hợp để gửi', 'info');
    const accepted = await confirm({
      title: filtered ? `Gửi ${frozen.ids.length} nhận xét đang lọc?` : `Gửi tất cả ${frozen.ids.length} nhận xét?`,
      description: `Đã chụp đúng ${frozen.ids.length} học sinh và nội dung bản nháp hiện tại. Thay đổi bộ lọc sau đây không thể đổi phạm vi gửi tuần tự.`,
      confirmLabel: `Gửi ${frozen.ids.length} nhận xét`,
    });
    if (!accepted) return;
    try {
      const result = await submitBatchComments(scope(useClassWorkspaceStore.getState().studentId), frozen.ids, { drafts: frozen.drafts, summary: frozen.summary });
      toast.show(result.failures.length ? `Đã gửi ${result.successfulIds.length}/${result.total}; còn ${result.failures.length} nhận xét chưa gửi, bản nháp vẫn được giữ lại.` : `Đã gửi ${result.successfulIds.length}/${result.total} nhận xét lên LMS!`, result.failures.length ? 'info' : 'success');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) toast.show(`Lỗi gửi nhận xét cả lớp: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }, [confirm, scope, toast]);

  const generateOne = useCallback(async (studentId: string, hasDraft: boolean) => {
    if (hasDraft) {
      const accepted = await confirm({ title: 'Tạo lại nhận xét?', description: 'Bản nháp hiện tại chỉ bị thay thế sau khi AI tạo thành công.', confirmLabel: 'Tạo lại' });
      if (!accepted) return;
    }
    useClassWorkspaceStore.getState().setStudentId(studentId);
    try {
      const meta = await generateSingleComment(scope(studentId), studentId);
      toast.show(meta.source === 'safe_template' ? 'AI chưa bám đúng level; hệ thống đã dùng mẫu an toàn.' : 'Đã tạo nhận xét!', meta.source === 'safe_template' ? 'info' : 'success');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) toast.show(`Lỗi tạo nhận xét: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }, [confirm, scope, toast]);
  return { generate, submit, generateOne };
}

export function ReviewSubmitActions({ allRows, filteredRows, locked, onGenerate, onSubmit }: {
  allRows: ReviewRow[]; filteredRows: ReviewRow[]; locked: boolean;
  onGenerate: (ids: string[], filtered: boolean) => void; onSubmit: (rows: ReviewRow[], filtered: boolean) => void;
}) {
  const allPresent = allPresentIds(allRows);
  const filteredPresent = allPresentIds(filteredRows);
  const allDraftCount = allRows.filter((row) => row.isPresent && row.isDraft).length;
  const filteredDraftCount = filteredRows.filter((row) => row.isPresent && row.isDraft).length;
  return (
    <div className="regular-review-action-buttons">
      <button
        type="button"
        className="btn btn-sm btn-primary regular-review-batch-btn"
        disabled={locked || !allPresent.length}
        onClick={() => onGenerate(allPresent, false)}
      >
        <Sparkles size={14} />
        <span>Tạo nhận xét tất cả {allPresent.length}</span>
      </button>
      <button
        type="button"
        className="btn btn-sm btn-success regular-review-batch-btn"
        disabled={locked || !allDraftCount}
        onClick={() => onSubmit(allRows, false)}
      >
        <Send size={14} />
        <span>Gửi tất cả {allDraftCount}</span>
      </button>
      <button
        type="button"
        className="btn btn-sm btn-outline regular-review-batch-btn btn-outline-primary"
        disabled={locked || !filteredPresent.length}
        onClick={() => onGenerate(filteredPresent, true)}
      >
        <Sparkles size={14} />
        <span>Tạo nhận xét {filteredPresent.length} mục đang lọc</span>
      </button>
      <button
        type="button"
        className={`btn btn-sm btn-outline regular-review-batch-btn ${!filteredDraftCount || locked ? 'is-disabled-filtered-send' : 'btn-outline-secondary'}`}
        disabled={locked || !filteredDraftCount}
        onClick={() => onSubmit(filteredRows, true)}
      >
        <Send size={14} />
        <span>Gửi {filteredDraftCount} mục đang lọc</span>
      </button>
    </div>
  );
}

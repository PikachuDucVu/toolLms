import { ClipboardCheck, CheckCircle, Send, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../../components/ui/Toast';
import { ReviewFilters, trapFocus } from '../review/public/components';
import { useReviewStore } from '../review/public/store';
import { CheckpointBatchProgress } from './CheckpointBatchProgress';
import { CheckpointBatchResult } from './CheckpointBatchResult';
import {
  generateCheckpointStudent,
  gradeCheckpointStudent,
  studentHasGradableSubmission,
  submitCheckpointFullSingle,
  type CheckpointGenerationOptions,
  type CheckpointScope,
} from './checkpointController';
import { buildCheckpointReviewRows, filterCheckpointReviewRows } from './checkpointReviewSelectors';
import { CheckpointReviewRow } from './CheckpointReviewRow';
import { formatScore } from './checkpointScore';
import { useCheckpointStore } from './checkpointStore';
import { useCheckpointBatchRunners } from './useCheckpointBatchRunners';

export function CheckpointReviewDialog({ scope, generationOptions, sessionNumber, locked: externalLocked = false }: {
  scope: CheckpointScope; generationOptions: CheckpointGenerationOptions; sessionNumber: number; locked?: boolean;
}) {
  const { detail, slot } = scope;
  const toast = useToast();
  const open = useReviewStore((state) => state.open);
  const search = useReviewStore((state) => state.search);
  const alertFilter = useReviewStore((state) => state.alertFilter);
  const sort = useReviewStore((state) => state.sort);
  const savedScroll = useReviewStore((state) => state.listScrollTop);
  const drafts = useCheckpointStore((state) => state.drafts);
  const results = useCheckpointStore((state) => state.results);
  const rowErrors = useCheckpointStore((state) => state.rowErrors);
  const generationBusy = useCheckpointStore((state) => state.generationBusy);
  const submitBusy = useCheckpointStore((state) => state.submitBusy);
  const gradeBusy = useCheckpointStore((state) => state.gradeBusy);
  const batch = useCheckpointStore((state) => state.batch);
  const summary = useCheckpointStore((state) => state.summaryDraft);
  useCheckpointStore((state) => state.statusResult);
  useCheckpointStore((state) => state.selectedBranches);
  const analysis = useDebouncedAnalysis(drafts, rowErrors, 180);
  const dialogRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const { runGrade, runGenerate, runScoreOnly, runFull, result, dismissResult } = useCheckpointBatchRunners(scope, generationOptions);

  const allRows = useMemo(
    () => buildCheckpointReviewRows(slot.studentAttendance, { drafts, results, rowErrors, generationBusy, submitBusy, gradeBusy }, analysis),
    [analysis, drafts, generationBusy, gradeBusy, results, rowErrors, slot.studentAttendance, submitBusy],
  );
  const filteredRows = useMemo(() => filterCheckpointReviewRows(allRows, { search, alertFilter, sort }), [alertFilter, allRows, search, sort]);
  const operationActive = generationBusy.size > 0 || submitBusy.size > 0 || gradeBusy.size > 0 || Boolean(batch);
  const locked = externalLocked || operationActive;
  const presentCount = allRows.filter((row) => row.isPresent).length;
  const draftCount = allRows.filter((row) => row.isPresent && row.isDraft).length;
  const warningCount = allRows.filter((row) => row.hasWarning).length;
  const studentNames = useMemo(() => Object.fromEntries(slot.studentAttendance.map((student) => [student.studentId, student.displayName])), [slot.studentAttendance]);
  const hasSummary = Boolean(summary.trim());

  const actionRef = useRef({ scope, generationOptions, toast });
  actionRef.current = { scope, generationOptions, toast };
  const fail = useCallback((studentId: string, phase: 'generation' | 'submission' | 'grading', cause: unknown) => {
    if (cause instanceof DOMException && cause.name === 'AbortError') return;
    const message = cause instanceof Error ? cause.message : String(cause || 'Lỗi không xác định');
    useCheckpointStore.getState().setRowError(studentId, phase, message);
    actionRef.current.toast.show(message, 'error');
  }, []);
  const nameOf = (studentId: string) => actionRef.current.scope.slot.studentAttendance.find((student) => student.studentId === studentId)?.displayName || studentId;
  const generateOne = useCallback(async (studentId: string) => {
    const { scope: current, generationOptions: options, toast: notify } = actionRef.current;
    try {
      if (options.modelId === '__custom__' && !options.customModelId?.trim()) throw new Error('Model custom cần có tên model.');
      await generateCheckpointStudent(current, studentId, options);
      notify.show(`Đã tạo nhận xét Checkpoint cho ${nameOf(studentId)}`, 'success');
    } catch (cause) { fail(studentId, 'generation', cause); }
  }, [fail]);
  const gradeOne = useCallback(async (studentId: string) => {
    const { scope: current, generationOptions: options, toast: notify } = actionRef.current;
    try {
      const outcome = await gradeCheckpointStudent(current, studentId, options);
      const parts = [
        outcome.theoryScore != null ? `LT ${formatScore(outcome.theoryScore)}` : null,
        outcome.practiceScore != null ? `TH ${formatScore(outcome.practiceScore)}` : null,
      ].filter(Boolean);
      notify.show(`Đã AI chấm ${nameOf(studentId)}${parts.length ? `: ${parts.join(' • ')}` : ''}`, 'success');
    } catch (cause) { fail(studentId, 'grading', cause); }
  }, [fail]);
  const submitOne = useCallback(async (studentId: string) => {
    const { scope: current, toast: notify } = actionRef.current;
    try {
      const outcome = await submitCheckpointFullSingle(current, studentId);
      notify.show(`Đã submit Checkpoint cho ${nameOf(studentId)}: ${formatScore(outcome.result.totalScore)}/5 • Rank ${outcome.result.rank}`, 'success');
    } catch (cause) { fail(studentId, 'submission', cause); }
  }, [fail]);

  useEffect(() => {
    useReviewStore.getState().reset();
    return () => useReviewStore.getState().reset();
  }, [detail.id, slot.id]);

  useLayoutEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = savedScroll;
  }, [open, savedScroll, filteredRows.length]);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = document.getElementById('root');
    const oldAriaHidden = background?.getAttribute('aria-hidden');
    const oldInert = background?.inert || false;
    if (background) { background.inert = true; background.setAttribute('aria-hidden', 'true'); }
    document.body.classList.add('regular-review-active');
    requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>('[aria-label="Đóng modal review"]')?.focus());
    return () => {
      if (background) {
        background.inert = oldInert;
        if (oldAriaHidden == null) background.removeAttribute('aria-hidden'); else background.setAttribute('aria-hidden', oldAriaHidden);
      }
      document.body.classList.remove('regular-review-active');
      const target = returnFocusRef.current;
      const fallback = document.querySelector<HTMLElement>('[data-review-focus-fallback]');
      requestAnimationFrame(() => (target?.isConnected ? target : fallback)?.focus());
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const higherDialog = Array.from(document.querySelectorAll<HTMLElement>('[role="alertdialog"], [role="dialog"]')).find((item) => item !== dialog.closest('[role="dialog"]'));
      if (higherDialog) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        useReviewStore.getState().closeReview();
        return;
      }
      if (event.key === 'Tab') trapFocus(dialog, event);
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open]);

  if (!open) return null;
  const batchBlocked = locked || presentCount === 0;
  return createPortal(
    <div className="regular-review-modal" role="dialog" aria-modal="true" aria-labelledby="checkpointReviewTitle" data-review-dialog onMouseDown={(event) => { if (event.target === event.currentTarget) useReviewStore.getState().closeReview(); }}>
      <div ref={dialogRef} className="regular-review-modal-dialog" role="document">
        <section className="regular-review-workspace" aria-busy={locked}>
          <div className="regular-review-main">
            <header className="regular-review-header">
              <div className="regular-review-title-block">
                <button type="button" className="btn btn-sm btn-outline regular-review-close-btn" aria-label="Đóng modal review" onClick={() => useReviewStore.getState().closeReview()}>
                  <X size={15} />
                  <span>Đóng</span>
                </button>
                <div>
                  <h2 id="checkpointReviewTitle">Review Checkpoint {scope.checkpoint} cả lớp</h2>
                  <p>{draftCount} bản nháp · {warningCount} cần chú ý · {filteredRows.length}/{allRows.length} đang hiển thị</p>
                </div>
              </div>
            </header>
            {batch && (
              <div className="regular-review-progress-banner show">
                <CheckpointBatchProgress batch={batch} studentNames={studentNames} />
              </div>
            )}
            {result && (
              <div className="regular-review-progress-banner show">
                <CheckpointBatchResult result={result} studentNames={studentNames} onDismiss={dismissResult} />
              </div>
            )}
            <div className="regular-review-toolbar" aria-label="Bộ lọc review nhận xét Checkpoint">
              <ReviewFilters sessionNumber={sessionNumber} showLevel={false} />
              <div className="regular-review-filter-actions">
                <div className="regular-review-action-buttons">
                  <button type="button" className="btn btn-sm btn-outline regular-review-batch-btn" disabled={batchBlocked} onClick={() => void runGrade()}>
                    <ClipboardCheck size={14} /><span>AI chấm tất cả đã nộp</span>
                  </button>
                  <button type="button" className="btn btn-sm btn-primary regular-review-batch-btn" disabled={batchBlocked} onClick={() => void runGenerate()}>
                    <Sparkles size={14} /><span>Tạo nhận xét tất cả {presentCount}</span>
                  </button>
                  <button type="button" className="btn btn-sm btn-outline regular-review-batch-btn" disabled={batchBlocked} onClick={() => void runScoreOnly()}>
                    <CheckCircle size={14} /><span>Submit điểm tất cả</span>
                  </button>
                  <button type="button" className="btn btn-sm btn-checkpoint regular-review-batch-btn" disabled={batchBlocked || !draftCount} onClick={() => void runFull()}>
                    <Send size={14} /><span>Submit đầy đủ {draftCount}</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="regular-review-table-container">
              <div className="regular-review-table-header" role="row">
                <span>Học sinh</span>
                <span>Điểm</span>
                <span>Nhận xét gửi phụ huynh</span>
                <span>Thao tác</span>
              </div>
              <div ref={scrollRef} className="regular-review-scroll" role="list" aria-label="Nhận xét Checkpoint của cả lớp" onScroll={(event) => useReviewStore.getState().setListScrollTop(event.currentTarget.scrollTop)}>
                {filteredRows.length ? filteredRows.map((row) => (
                  <CheckpointReviewRow
                    key={row.studentId}
                    row={row}
                    locked={locked}
                    canSubmit={row.isDraft && hasSummary}
                    canGrade={studentHasGradableSubmission(row.studentId)}
                    onGenerate={generateOne}
                    onGrade={gradeOne}
                    onSubmit={submitOne}
                  />
                )) : (
                  <div className="regular-review-empty">
                    <p>Không có nhận xét phù hợp với bộ lọc.</p>
                    <button type="button" className="btn btn-sm btn-outline" onClick={() => useReviewStore.getState().resetFilters()}>Xóa bộ lọc review</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>,
    document.body,
  );
}

function useDebouncedAnalysis<TDrafts, TErrors>(drafts: TDrafts, rowErrors: TErrors, delay: number) {
  const [value, setValue] = useState({ drafts, rowErrors });
  useEffect(() => {
    const timer = window.setTimeout(() => setValue({ drafts, rowErrors }), delay);
    return () => window.clearTimeout(timer);
  }, [delay, drafts, rowErrors]);
  return value;
}

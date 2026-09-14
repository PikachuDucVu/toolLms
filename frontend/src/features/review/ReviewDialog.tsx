import type { ClassDetail, Slot } from '@tool-lms/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAssessmentStore } from '../assessments/public/store';
import { useClassWorkspaceStore } from '../classes/public/domain';
import { useCommentStore } from '../comments/public/store';
import { ReviewDrawer } from './ReviewDrawer';
import { ReviewList } from './ReviewList';
import { useReviewScopedActions } from './ReviewSubmitActions';
import { ReviewToolbar } from './ReviewToolbar';
import { buildReviewRows, filterReviewRows } from './selectors';
import { useReviewStore } from './reviewStore';
import { safeId } from './ReviewRow';

export function ReviewDialog({ detail, slot, sessionNumber }: { detail: ClassDetail; slot: Slot; sessionNumber: number }) {
  const open = useReviewStore((state) => state.open);
  const selectedStudentId = useReviewStore((state) => state.selectedStudentId);
  const search = useReviewStore((state) => state.search);
  const alertFilter = useReviewStore((state) => state.alertFilter);
  const levelFilter = useReviewStore((state) => state.levelFilter);
  const sort = useReviewStore((state) => state.sort);
  const drafts = useCommentStore((state) => state.drafts);
  const errors = useCommentStore((state) => state.errors);
  const studentBusy = useCommentStore((state) => state.studentBusy);
  const batch = useCommentStore((state) => state.batch);
  const summaryBusy = useCommentStore((state) => state.summaryBusy);
  const assessments = useAssessmentStore();
  const analysis = useDebouncedAnalysis(drafts, errors, 180);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const drawerReturnFocusRef = useRef<HTMLElement | null>(null);
  const allRows = useMemo(() => buildReviewRows(slot.studentAttendance, { drafts, errors, studentBusy }, assessments, analysis, sessionNumber), [analysis, assessments, drafts, errors, sessionNumber, slot.studentAttendance, studentBusy]);
  const filteredRows = useMemo(() => filterReviewRows(allRows, { search, alertFilter, levelFilter, sort }), [alertFilter, allRows, levelFilter, search, sort]);
  const locked = Boolean(batch || summaryBusy || studentBusy.size || assessments.bulkBusy || assessments.classRefreshBusy || assessments.load.loading || assessments.load.error);
  const actions = useReviewScopedActions({ detail, slot, sessionNumber });
  const closeReview = useCallback(() => useReviewStore.getState().closeReview(), []);
  const openDetail = useCallback((studentId: string, trigger?: HTMLElement) => {
    if (locked) return;
    if (trigger) drawerReturnFocusRef.current = trigger;
    useClassWorkspaceStore.getState().setStudentId(studentId);
    useReviewStore.getState().selectStudent(studentId);
  }, [locked]);
  const closeDetail = useCallback(() => {
    const studentId = useReviewStore.getState().selectedStudentId;
    useReviewStore.getState().selectStudent(null);
    const fallback = studentId ? document.getElementById(`review-detail-${safeId(studentId)}`) : null;
    requestAnimationFrame(() => (drawerReturnFocusRef.current?.isConnected ? drawerReturnFocusRef.current : fallback)?.focus());
  }, []);

  useEffect(() => {
    useReviewStore.getState().reset();
    return () => useReviewStore.getState().reset();
  }, [detail.id, slot.id]);

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
      const returnTarget = returnFocusRef.current;
      const fallback = document.querySelector<HTMLElement>('[data-review-focus-fallback]');
      const target = returnTarget?.isConnected ? returnTarget : fallback;
      requestAnimationFrame(() => target?.isConnected && target.focus());
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const higherDialog = Array.from(document.querySelectorAll<HTMLElement>('[role="alertdialog"], [role="dialog"]')).find((item) => item !== dialog && !item.hasAttribute('data-review-dialog'));
      if (higherDialog) return;
      if (event.key === 'Escape') {
        const menu = dialog.querySelector<HTMLDetailsElement>('details[open]');
        if (menu) {
          event.preventDefault(); event.stopPropagation(); menu.open = false; menu.querySelector<HTMLElement>(':scope > summary')?.focus(); return;
        }
        event.preventDefault(); event.stopPropagation();
        if (useReviewStore.getState().selectedStudentId) closeDetail(); else useReviewStore.getState().closeReview();
        return;
      }
      if (event.key === 'Tab') { trapFocus(dialog, event); return; }
      const target = event.target;
      const editable = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
      if (locked || editable || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') || !filteredRows.length) return;
      const current = filteredRows.findIndex((row) => row.studentId === useReviewStore.getState().selectedStudentId);
      const next = event.key === 'ArrowDown' ? Math.min(filteredRows.length - 1, current < 0 ? 0 : current + 1) : Math.max(0, current < 0 ? 0 : current - 1);
      event.preventDefault();
      openDetail(filteredRows[next].studentId);
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [closeDetail, filteredRows, locked, open, openDetail]);

  if (!open) return null;
  return createPortal(<div className="regular-review-modal" role="dialog" aria-modal="true" aria-labelledby="regularReviewTitle" data-review-dialog onMouseDown={(event) => { if (event.target === event.currentTarget) useReviewStore.getState().closeReview(); }}>
    <div ref={dialogRef} className="regular-review-modal-dialog" role="document">
      <section className={`regular-review-workspace ${selectedStudentId ? 'has-drawer' : ''}`} aria-busy={locked}>
        <div className="regular-review-main"><ReviewToolbar detail={detail} slot={slot} sessionNumber={sessionNumber} allRows={allRows} filteredRows={filteredRows} locked={locked} onClose={closeReview} onGenerate={actions.generate} onSubmit={actions.submit} /><ReviewList rows={filteredRows} selectedStudentId={selectedStudentId} locked={locked} sessionNumber={sessionNumber} onOpenDetail={openDetail} onGenerate={actions.generateOne} /></div>
        {selectedStudentId && <ReviewDrawer detail={detail} slot={slot} sessionNumber={sessionNumber} rows={filteredRows} selectedStudentId={selectedStudentId} locked={locked} onSelect={openDetail} onClose={closeDetail} />}
      </section>
    </div>
  </div>, document.body);
}

function useDebouncedAnalysis<TDrafts, TErrors>(drafts: TDrafts, errors: TErrors, delay: number) {
  const [value, setValue] = useState({ drafts, errors });
  useEffect(() => {
    const timer = window.setTimeout(() => setValue({ drafts, errors }), delay);
    return () => window.clearTimeout(timer);
  }, [delay, drafts, errors]);
  return value;
}

function trapFocus(container: HTMLElement, event: KeyboardEvent) {
  const focusable = Array.from(container.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary:not([aria-disabled="true"]), [href], [tabindex]:not([tabindex="-1"])')).filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
  if (!focusable.length) return;
  const first = focusable[0]; const last = focusable[focusable.length - 1];
  if (event.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
}

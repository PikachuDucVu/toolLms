import type { ClassDetail, StudentAttendance } from '@tool-lms/contracts';
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../components/ui/ConfirmDialog';
import { ToastProvider } from '../../components/ui/Toast';
import { activateAssessmentContext, resetAssessmentController } from '../assessments/autosaveController';
import { useAssessmentStore } from '../assessments/assessmentStore';
import { useClassWorkspaceStore } from '../classes/store';
import { activateCommentContext, resetCommentController } from '../comments/generationController';
import { useCommentStore } from '../comments/commentStore';
import { ReviewDialog } from './ReviewDialog';
import { useReviewStore } from './reviewStore';

const students: StudentAttendance[] = [
  { id: 'attendance-1', studentId: 'student-1', displayName: 'Nguyễn Minh Anh', status: 'ATTENDED', commentByAreas: [] },
  { id: 'attendance-2', studentId: 'student-2', displayName: 'Trần Gia Huy', status: 'LATE_ARRIVED', commentByAreas: [] },
  { id: 'attendance-3', studentId: 'student-3', displayName: 'Lê Chi', status: 'ABSENT_WITH_NOTICE', commentByAreas: [] },
];
const detail = { id: 'class-1', name: 'Lớp Review', status: 'RUNNING', startDate: null, endDate: null, recentlyEnded: false, course: null, sites: [], slotCount: 1, commentProgress: { state: 'pending', badgeText: 'Chưa nhận xét', slotNumber: 1, present: 2, completed: 0, missing: 2 }, courseProcessId: null, courseProcess: null, slots: [{ id: 'slot-1', index: 0, date: '2026-01-01', summary: '<p>Tổng kết</p>', studentAttendance: students }] } as unknown as ClassDetail;

beforeEach(() => {
  document.body.innerHTML = '';
  useReviewStore.getState().reset(); useCommentStore.getState().reset(); useAssessmentStore.getState().reset(); useClassWorkspaceStore.getState().reset(); resetCommentController(); resetAssessmentController();
  useClassWorkspaceStore.getState().setClassId('class-1'); useClassWorkspaceStore.getState().setSlotIndex('0'); useClassWorkspaceStore.getState().setStudentId('student-1');
  const assessmentContext = activateAssessmentContext('class-1', 'slot-1'); useAssessmentStore.getState().hydrate(assessmentContext, []); activateCommentContext('class-1', 'slot-1', 'Tổng kết');
  useCommentStore.setState({ drafts: {
    'student-1': { content: 'Minh Anh đi học đúng giờ và tuân thủ tốt nội quy lớp học. Con tự vận dụng tốt.', kind: 'generated', generationMeta: null },
    'student-2': { content: 'Gia Huy đi học đúng giờ và tuân thủ tốt nội quy lớp học. Con chủ động hỏi.', kind: 'generated', generationMeta: null },
  } });
  vi.stubGlobal('fetch', vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('ReviewDialog modal interaction contract', () => {
  it('uses a real modal, makes the regular workspace inert, traps/returns focus, and closes drawer before modal', async () => {
    const user = userEvent.setup(); const { root, entry } = renderHarness();
    await user.click(entry);
    const dialog = await screen.findByRole('dialog', { name: 'Review cả lớp' });
    expect(dialog).toHaveAttribute('aria-modal', 'true'); expect(root).toHaveAttribute('aria-hidden', 'true'); expect(root.inert).toBe(true);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Đóng modal review' })).toHaveFocus());

    const detailButton = detailButtonFor('Nguyễn Minh Anh');
    await user.click(detailButton);
    expect(await screen.findByLabelText('Chi tiết học sinh Nguyễn Minh Anh')).toBeVisible();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Đóng chi tiết' })).toHaveFocus());
    await user.keyboard('{Escape}');
    expect(screen.queryByLabelText('Chi tiết học sinh Nguyễn Minh Anh')).not.toBeInTheDocument();
    await waitFor(() => expect(detailButton).toHaveFocus());
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Review cả lớp' })).not.toBeInTheDocument();
    await waitFor(() => expect(entry).toHaveFocus());
    expect(root).not.toHaveAttribute('aria-hidden'); expect(root.inert).toBe(false);
  });

  it('preserves active textarea focus/caret and list/drawer scroll across debounced warning rerenders', async () => {
    const user = userEvent.setup(); renderHarness(); await user.click(screen.getByRole('button', { name: 'Mở review' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Đóng modal review' })).toHaveFocus());
    const textarea = screen.getByLabelText('Nhận xét của Nguyễn Minh Anh') as HTMLTextAreaElement;
    textarea.focus(); textarea.setSelectionRange(12, 12);
    const list = screen.getByRole('list', { name: 'Nhận xét của cả lớp' });
    Object.defineProperty(list, 'scrollTop', { value: 91, writable: true }); fireEvent.scroll(list);
    useCommentStore.getState().setError('student-1', 'Lỗi theo hàng');
    await waitFor(() => expect(screen.getByText('Cảnh báo: Lỗi theo hàng')).toBeVisible(), { timeout: 700 });
    expect(textarea).toHaveFocus(); expect(textarea.selectionStart).toBe(12); expect(list.scrollTop).toBe(91);

    await user.click(detailButtonFor('Nguyễn Minh Anh'));
    const drawer = screen.getByLabelText('Chi tiết học sinh Nguyễn Minh Anh');
    Object.defineProperty(drawer, 'scrollTop', { value: 73, writable: true }); fireEvent.scroll(drawer);
    useAssessmentStore.getState().setNoteDraft('student-1', 'Ghi chú canonical');
    await waitFor(() => expect(screen.getByLabelText('Ghi chú bổ sung cho Nguyễn Minh Anh')).toHaveValue('Ghi chú canonical'));
    expect(drawer.scrollTop).toBe(73);
  });

  it('debounces Vietnamese search, keeps arrow navigation out of editables, wraps Tab, and Ctrl/Cmd+Enter only updates the draft', async () => {
    const user = userEvent.setup(); renderHarness(); await user.click(screen.getByRole('button', { name: 'Mở review' }));
    const search = screen.getByLabelText('Tìm học sinh hoặc nội dung nhận xét');
    await user.type(search, 'gia huy');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(1), { timeout: 600 });
    expect(screen.getByText('Trần Gia Huy')).toBeVisible();
    await user.clear(search); await waitFor(() => expect(screen.getAllByRole('listitem')).toHaveLength(3), { timeout: 600 });

    const textarea = screen.getByLabelText('Nhận xét của Nguyễn Minh Anh'); textarea.focus();
    await user.keyboard('{ArrowDown}'); expect(screen.queryByLabelText(/Chi tiết học sinh/)).not.toBeInTheDocument();
    await user.keyboard('{Control>}{Enter}{/Control}'); expect(useCommentStore.getState().drafts['student-1'].content).toContain('Minh Anh'); expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    screen.getByRole('button', { name: 'Đóng modal review' }).focus(); await user.keyboard('{ArrowDown}'); expect(await screen.findByLabelText('Chi tiết học sinh Lê Chi')).toBeVisible();

    await user.keyboard('{Escape}');
    const dialog = screen.getByRole('dialog', { name: 'Review cả lớp' });
    const selector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary:not([aria-disabled="true"]), [href], [tabindex]:not([tabindex="-1"])';
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(selector));
    focusable[0].focus(); fireEvent.keyDown(focusable[0], { key: 'Tab', shiftKey: true }); expect(focusable.at(-1)).toHaveFocus();
  });

  it('blocks row, drawer, and arrow navigation while a student operation is active', async () => {
    const user = userEvent.setup(); renderHarness(); await user.click(screen.getByRole('button', { name: 'Mở review' }));
    await user.click(detailButtonFor('Nguyễn Minh Anh'));
    useCommentStore.getState().setStudentBusy('student-1', true);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Học sinh tiếp theo' })).toBeDisabled());
    expect(detailButtonFor('Trần Gia Huy')).toBeDisabled();
    screen.getByRole('button', { name: 'Đóng modal review' }).focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByLabelText('Chi tiết học sinh Nguyễn Minh Anh')).toBeVisible();
    expect(useClassWorkspaceStore.getState().studentId).toBe('student-1');
  });

  it('restores focus to a stable workspace fallback if submit-all removes the Review trigger', async () => {
    const user = userEvent.setup(); const { entry, fallback, hideEntry } = renderHarness(); await user.click(entry);
    act(() => hideEntry());
    await user.keyboard('{Escape}');
    await waitFor(() => expect(fallback).toHaveFocus());
  });

  it('gives confirmation dialogs higher Escape priority than drawer and review modal', async () => {
    const user = userEvent.setup(); renderHarness(); await user.click(screen.getByRole('button', { name: 'Mở review' }));
    await user.click(screen.getAllByRole('button', { name: 'Tạo lại' })[0]);
    expect(await screen.findByRole('alertdialog')).toBeVisible();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Review cả lớp' })).toBeVisible();
  });
});

function detailButtonFor(studentName: string): HTMLButtonElement {
  const row = screen.getByText(studentName).closest('[data-review-row]');
  if (!row) throw new Error(`Missing review row for ${studentName}`);
  return row.querySelector('button[aria-expanded]') as HTMLButtonElement;
}

function renderHarness() {
  const root = document.createElement('div'); root.id = 'root'; document.body.appendChild(root);
  let hideEntry = () => {};
  function Harness() {
    const [showEntry, setShowEntry] = useState(true);
    hideEntry = () => setShowEntry(false);
    return <ToastProvider><ConfirmProvider>{showEntry && <button type="button" onClick={() => useReviewStore.getState().openReview()}>Mở review</button>}<section aria-label="Thống kê học sinh" data-review-focus-fallback tabIndex={-1}>Fallback</section><ReviewDialog detail={detail} slot={detail.slots[0]} sessionNumber={1} /></ConfirmProvider></ToastProvider>;
  }
  const result = render(<Harness />, { container: root });
  return { ...result, root, entry: screen.getByRole('button', { name: 'Mở review' }), fallback: screen.getByRole('region', { name: 'Thống kê học sinh' }), hideEntry };
}

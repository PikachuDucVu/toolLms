import type { ClassDetail, Slot } from '@tool-lms/contracts';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../components/ui/ConfirmDialog';
import { ToastProvider } from '../../components/ui/Toast';
import { useReviewStore } from '../review/public/store';
import { CheckpointReviewDialog } from './CheckpointReviewDialog';
import { activateCheckpointContext, hydrateCheckpointContext, resetCheckpointController } from './checkpointController';
import { useCheckpointStore } from './checkpointStore';

const slot: Slot = { id: 'slot-5', index: 4, date: null, summary: 'Tổng kết Checkpoint', studentAttendance: [
  { id: 'attendance-1', studentId: 'student-1', displayName: 'Nguyễn An', status: 'ATTENDED', commentByAreas: [] },
  { id: 'attendance-2', studentId: 'student-2', displayName: 'Trần Bình', status: 'LATE_ARRIVED', commentByAreas: [] },
  { id: 'attendance-3', studentId: 'student-3', displayName: 'Lê Chi', status: 'ABSENT', commentByAreas: [] },
] };
const detail: ClassDetail = { id: 'class-1', name: 'Lớp Checkpoint', status: 'RUNNING', startDate: null, endDate: null, recentlyEnded: false, course: null, sites: [], slotCount: 5, commentProgress: { state: 'unknown', badgeText: 'Chưa có dữ liệu', slotNumber: null, present: null, completed: null, missing: null }, courseProcessId: 'process-1', courseProcess: null, slots: [slot] };
const scope = { detail, slot, checkpoint: 1 as const };

function renderDialog() {
  return render(<ToastProvider><ConfirmProvider><CheckpointReviewDialog scope={scope} generationOptions={{ modelId: 'gpt-fixture' }} sessionNumber={5} /></ConfirmProvider></ToastProvider>);
}

beforeEach(() => {
  resetCheckpointController(); useCheckpointStore.getState().reset(); useReviewStore.getState().reset();
  const context = activateCheckpointContext(detail.id, slot.id, 1, slot.summary);
  hydrateCheckpointContext(context, slot, { 'student-1': 'Mô tả An' }, slot.summary);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); useReviewStore.getState().reset(); });

describe('CheckpointReviewDialog', () => {
  it('renders nothing until review is opened, then lists every student with absent rows editable', async () => {
    renderDialog();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    act(() => useReviewStore.getState().openReview());
    const dialog = await screen.findByRole('dialog', { name: /Review Checkpoint 1 cả lớp/ });
    const rows = within(dialog).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    const absent = rows.find((row) => row.getAttribute('data-review-row') === 'student-3')!;
    expect(within(absent).getAllByRole('textbox').length).toBeGreaterThan(0);
    expect(within(absent).getAllByRole('spinbutton')).toHaveLength(2);
    expect(within(dialog).getByLabelText('Ghi chú cho AI của Nguyễn An')).toHaveValue('Mô tả An');
  });

  it('edits scores and comments straight into the checkpoint drafts', async () => {
    const user = userEvent.setup();
    renderDialog();
    act(() => useReviewStore.getState().openReview());
    const comment = await screen.findByLabelText('Nhận xét của Nguyễn An');
    await user.type(comment, 'Em làm tốt');
    expect(useCheckpointStore.getState().drafts['student-1'].currentComment).toBe('Em làm tốt');
    await user.type(screen.getByLabelText('Điểm lý thuyết Checkpoint của Nguyễn An'), '4.5');
    expect(useCheckpointStore.getState().drafts['student-1'].theoryInput).toBe('4.5');
    expect(screen.getByText('Bản nháp')).toBeVisible();
  });

  it('generates one comment with AI for the chosen row', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/comments/generate')) return new Response(JSON.stringify({ success: true, requestId: 'r', data: { comment: '<p>AI nhận xét fixture</p>' } }), { status: 200, headers: { 'content-type': 'application/json' } });
      throw new Error(`Unexpected ${String(input)}`);
    }));
    renderDialog();
    act(() => useReviewStore.getState().openReview());
    const row = (await screen.findByLabelText('Nhận xét của Nguyễn An')).closest('article') as HTMLElement;
    await user.click(within(row).getByRole('button', { name: /Tạo AI/ }));
    await waitFor(() => expect(screen.getByLabelText('Nhận xét của Nguyễn An')).toHaveValue('AI nhận xét fixture'));
    expect(within(row).getByRole('button', { name: /Tạo lại/ })).toBeVisible();
  });

  it('filters by search text and closes with Escape', async () => {
    const user = userEvent.setup();
    renderDialog();
    act(() => useReviewStore.getState().openReview());
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('searchbox', { name: /Tìm học sinh/ }), 'binh');
    await waitFor(() => expect(within(dialog).getAllByRole('listitem')).toHaveLength(1));
    expect(within(dialog).getByText('Trần Bình')).toBeVisible();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

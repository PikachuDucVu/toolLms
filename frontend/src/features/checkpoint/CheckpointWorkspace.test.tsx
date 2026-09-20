import type { CheckpointStatusResult, ClassDetail, Slot } from '@tool-lms/contracts';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../components/ui/ConfirmDialog';
import { ToastProvider } from '../../components/ui/Toast';
import { CheckpointBatchActions } from './CheckpointBatchActions';
import { CheckpointStatus } from './CheckpointStatus';
import { CheckpointStudentCard } from './CheckpointStudentCard';
import { activateCheckpointContext, hydrateCheckpointContext, resetCheckpointController } from './checkpointController';
import { useCheckpointStore } from './checkpointStore';

const slot: Slot = { id: 'slot-5', index: 4, date: null, summary: 'Tổng kết Checkpoint', studentAttendance: [
  { id: 'attendance-1', studentId: 'student-1', displayName: 'Nguyễn An', status: 'ATTENDED', commentByAreas: [] },
  { id: 'attendance-2', studentId: 'student-2', displayName: 'Trần Bình', status: 'LATE_ARRIVED', commentByAreas: [] },
] };
const detail: ClassDetail = { id: 'class-1', name: 'Lớp Checkpoint', status: 'RUNNING', startDate: null, endDate: null, recentlyEnded: false, course: null, sites: [], slotCount: 5, commentProgress: { state: 'unknown', badgeText: 'Chưa có dữ liệu', slotNumber: null, present: null, completed: null, missing: null }, courseProcessId: 'process-1', courseProcess: null, slots: [slot] };
const scope = { detail, slot, checkpoint: 1 as const };

beforeEach(() => {
  resetCheckpointController(); useCheckpointStore.getState().reset();
  const context = activateCheckpointContext(detail.id, slot.id, 1, slot.summary);
  hydrateCheckpointContext(context, slot, { 'student-1': 'Mô tả An', 'student-2': 'Mô tả Bình' });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('CheckpointStatus', () => {
  it('renders loading, unavailable, no-live-exam and missing-student states without disabling the editor contract', async () => {
    const context = useCheckpointStore.getState().context!;
    useCheckpointStore.getState().setStatusLoading(context);
    const view = render(<CheckpointStatus studentId="student-1" studentName="Nguyễn An" />);
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải trạng thái');
    useCheckpointStore.getState().setStatusError(context, { kind: 'timeout', message: 'Quá thời gian fixture' });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('phản hồi quá thời gian'));
    useCheckpointStore.getState().applyStatus(context, status('none'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Chưa có kỳ Checkpoint đang hoạt động'));
    useCheckpointStore.getState().applyStatus(context, status('original', []));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Chưa nộp bài'));
    view.unmount();
  });

  it('renders original/makeup/both branches, safe normalized links, timestamp, Bù marker and an accessible branch selector only for both', async () => {
    const user = userEvent.setup(); const context = useCheckpointStore.getState().context!;
    useCheckpointStore.getState().applyStatus(context, status('both'));
    render(<CheckpointStatus studentId="student-1" studentName="Nguyễn An" />);
    expect(screen.getByRole('status')).toHaveTextContent('Đã nộp • Bù');
    const branch = screen.getByRole('group', { name: 'Chọn bài nộp Checkpoint của Nguyễn An' });
    expect(within(branch).getByRole('button', { name: 'Bù' })).toHaveAttribute('aria-pressed', 'true');
    const essay = screen.getByRole('link', { name: /Bài tự luận của Nguyễn An/ });
    expect(essay).toHaveAttribute('target', '_blank'); expect(essay).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('link', { name: /Không an toàn/ })).not.toBeInTheDocument();
    await user.click(within(branch).getByRole('button', { name: 'Gốc' }));
    expect(screen.getByRole('status')).not.toHaveTextContent('• Bù');
    expect(screen.getByRole('link', { name: /Xem Scratch của Nguyễn An/ })).toHaveAttribute('href', 'https://fixture.test/scratch');
  });
});

describe('Checkpoint student and batch UI', () => {
  it('supports accessible expansion, score hints/one-sided input, single AI, score-only and full submit with no confirmation', async () => {
    const user = userEvent.setup(); const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input); const body = JSON.parse(String(init?.body)) as Record<string, unknown>; bodies.push(body);
      if (path.endsWith('/comments/generate')) return json(ok({ comment: '<p>AI nhận xét fixture</p>' }));
      return json(ok(submitResult(String(body.studentId), String(body.attendanceId), body.mode as 'score_only' | 'full', 'summary' in body)));
    }));
    render(<ToastProvider><ConfirmProvider><CheckpointStudentCard scope={scope} student={slot.studentAttendance[0]} generationOptions={{ modelId: 'gpt-fixture' }} /></ConfirmProvider></ToastProvider>);
    const toggle = screen.getByRole('button', { name: /Nguyễn An/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const theory = screen.getByLabelText('Điểm lý thuyết Checkpoint của Nguyễn An');
    expect(theory).toHaveAttribute('min', '0'); expect(theory).toHaveAttribute('max', '5'); expect(theory).toHaveAttribute('step', '0.5');
    await user.clear(theory); await user.type(theory, '4.5');
    const scoreRegion = screen.getByRole('region', { name: 'Điểm Checkpoint của Nguyễn An' });
    expect(within(scoreRegion).getByText('Đã nhập một phía')).toBeVisible();
    expect(within(scoreRegion).getByText('Kết quả trung bình và rank do máy chủ tính sau khi submit.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'AI nhận xét' }));
    await waitFor(() => expect(screen.getByDisplayValue('AI nhận xét fixture')).toBeVisible());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Submit điểm' }));
    await waitFor(() => expect(bodies.some((body) => body.mode === 'score_only')).toBe(true));
    expect(screen.getByDisplayValue('AI nhận xét fixture')).toBeVisible();
    expect(bodies.find((body) => body.mode === 'score_only')).toMatchObject({ comment: '<p>AI nhận xét fixture</p>' });
    await user.click(screen.getByRole('button', { name: /(?:Re-)?submit Checkpoint$/ }));
    await waitFor(() => expect(bodies.some((body) => body.mode === 'full')).toBe(true));
    expect(screen.getByLabelText('Kết quả Checkpoint từ máy chủ của Nguyễn An')).toHaveTextContent('Rank B');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('grades a submitted checkpoint exam into theory/practice fields and skips scratch', async () => {
    const user = userEvent.setup();
    const context = useCheckpointStore.getState().context!;
    useCheckpointStore.getState().applyStatus(context, status('original'));
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith('/checkpoints/grade')) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body).toMatchObject({ classId: 'class-1', studentId: 'student-1', checkpoint: 1, branch: 'original' });
        return json(ok({
          studentId: 'student-1', examId: 'exam-original', branch: 'original', skippedScratch: true,
          theoryScore: 4.5, practiceScore: null, teacherNotes: 'LT: 9/10 câu đúng (4.5/5). Đã bỏ qua phần Scratch.',
          mc: { total: 10, correct: 9, items: [] }, essay: { notes: '', items: [] },
        }));
      }
      throw new Error(`Unexpected ${path}`);
    }));
    render(<ToastProvider><ConfirmProvider><CheckpointStudentCard scope={scope} student={slot.studentAttendance[0]} generationOptions={{ modelId: 'gpt-fixture' }} /></ConfirmProvider></ToastProvider>);
    await user.click(screen.getByRole('button', { name: 'AI chấm bài' }));
    await waitFor(() => expect(screen.getByLabelText('Kết quả AI chấm của Nguyễn An')).toHaveTextContent('9/10 đúng'));
    expect(screen.getByLabelText('Điểm lý thuyết Checkpoint của Nguyễn An')).toHaveValue(4.5);
    expect(screen.getByLabelText(`Mô tả của giáo viên cho AI của Nguyễn An`)).toHaveValue('Mô tả An');
    expect(screen.getByLabelText('Kết quả AI chấm của Nguyễn An')).toHaveTextContent('Đã bỏ qua phần Scratch');
  });

  it('prevalidates score batches before confirm and cancellation performs no generation/submission I/O', async () => {
    const user = userEvent.setup(); const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    useCheckpointStore.getState().setTheoryInput('student-1', '4.25');
    const { rerender } = render(<ToastProvider><ConfirmProvider><CheckpointBatchActions scope={scope} generationOptions={{ modelId: 'gpt-fixture' }} presentCount={2} studentNames={{ 'student-1': 'Nguyễn An', 'student-2': 'Trần Bình' }} /></ConfirmProvider></ToastProvider>);
    await user.click(screen.getByRole('button', { name: 'Submit điểm tất cả' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(await screen.findByText(/bước 0.5/)).toBeVisible();
    useCheckpointStore.getState().setTheoryInput('student-1', '4.5');
    rerender(<ToastProvider><ConfirmProvider><CheckpointBatchActions scope={scope} generationOptions={{ modelId: 'gpt-fixture' }} presentCount={2} studentNames={{ 'student-1': 'Nguyễn An', 'student-2': 'Trần Bình' }} /></ConfirmProvider></ToastProvider>);
    await user.click(screen.getByRole('button', { name: 'AI nhận xét tất cả' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('2 học sinh có mặt');
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Hủy' }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('runs full batch with omitted model/key when all AI comments exist and rejects only malformed explicit custom generation', async () => {
    const user = userEvent.setup(); const bodies: Array<Record<string, unknown>> = [];
    for (const studentId of ['student-1', 'student-2']) {
      const draft = useCheckpointStore.getState().drafts[studentId];
      useCheckpointStore.getState().applyGeneratedComment(studentId, `<p>AI ${studentId}</p>`, draft.descriptionVersion, draft.commentVersion);
    }
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>; bodies.push({ path: String(input), ...body });
      return json(ok(submitResult(String(body.studentId), String(body.attendanceId), 'full', 'summary' in body)));
    }));
    const view = render(<ToastProvider><ConfirmProvider><CheckpointBatchActions scope={scope} generationOptions={{}} presentCount={2} studentNames={{ 'student-1': 'Nguyễn An', 'student-2': 'Trần Bình' }} /></ConfirmProvider></ToastProvider>);
    await user.click(screen.getByRole('button', { name: 'Submit đầy đủ (AI + điểm)' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Submit 2 học sinh' }));
    await waitFor(() => expect(screen.getByLabelText('Kết quả thao tác Checkpoint cả lớp')).toHaveTextContent('2/2'));
    expect(bodies.filter((body) => String(body.path).endsWith('/comments/generate'))).toHaveLength(0);
    expect(bodies.filter((body) => String(body.path).endsWith('/checkpoints/submit'))).toHaveLength(2);
    view.unmount(); vi.stubGlobal('fetch', vi.fn());
    render(<ToastProvider><ConfirmProvider><CheckpointBatchActions scope={scope} generationOptions={{ modelId: '__custom__' }} presentCount={2} studentNames={{ 'student-1': 'Nguyễn An', 'student-2': 'Trần Bình' }} /></ConfirmProvider></ToastProvider>);
    await user.click(screen.getByRole('button', { name: 'AI nhận xét tất cả' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(await screen.findByText('Model custom cần có tên model.')).toBeVisible();
  });
});

function status(kind: 'none' | 'original' | 'makeup' | 'both', students?: CheckpointStatusResult['students']): CheckpointStatusResult {
  const original = kind === 'original' || kind === 'both' ? { id: 'exam-original', branch: 'original' as const, title: 'Gốc', status: 'ACTIVE', practiceType: 'SCRATCH' } : null;
  const makeup = kind === 'makeup' || kind === 'both' ? { id: 'exam-makeup', branch: 'makeup' as const, title: 'Bù', status: 'ACTIVE', practiceType: 'ESSAY' } : null;
  const originalBranch = { branch: 'original' as const, submittedAt: '2026-07-28T01:00:00Z', practiceType: 'SCRATCH', links: [{ kind: 'scratch' as const, label: 'Xem Scratch', url: 'https://fixture.test/scratch' }] };
  const makeupBranch = { branch: 'makeup' as const, submittedAt: '2026-07-29T01:00:00Z', practiceType: 'ESSAY', links: [{ kind: 'essay' as const, label: 'Bài tự luận', url: 'https://fixture.test/essay.pdf' }, { kind: 'essay' as const, label: 'Không an toàn', url: 'javascript:alert(1)' }] };
  return { classId: detail.id, checkpoint: 1, original, makeup, students: students ?? (kind === 'none' ? [] : [{ studentId: 'student-1', original: original ? originalBranch : null, makeup: makeup ? makeupBranch : null, defaultBranch: makeup ? 'makeup' : 'original' }]) };
}
function submitResult(studentId: string, attendanceId: string, mode: 'score_only' | 'full', summaryIncluded: boolean) { return { slotId: slot.id, studentId, attendanceId, submitted: true as const, mode, summaryIncluded, logged: true, theoryScore: 4.5, practiceScore: 4, totalScore: 4.3, rank: 'B' as const, questions: Array.from({ length: 10 }, (_, index) => ({ number: index + 1, correct: index < 9, score: index < 9 ? 0.5 as const : 0 as const })) }; }
function ok(data: unknown) { return { success: true, requestId: 'checkpoint-ui-test', data }; }
function json(data: unknown, statusCode = 200) { return new Response(JSON.stringify(data), { status: statusCode, headers: { 'content-type': 'application/json' } }); }

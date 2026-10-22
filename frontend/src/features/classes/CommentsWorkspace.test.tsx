import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, appQueryClient } from '../../app/providers';
import { useAssessmentStore } from '../assessments';
import { useCommentStore } from '../comments/commentStore';
import { sessionCommentModeFor, useSessionCommentModeStore } from '../comments/sessionMode';
import { CommentsWorkspace } from './CommentsWorkspace';
import { useClassWorkspaceStore } from './store';

const progress = { state: 'unknown' as const, badgeText: 'Chưa có dữ liệu' as const, slotNumber: null, present: null, completed: null, missing: null };
const classes = [summary('class-a', 'Lớp A'), summary('class-b', 'Lớp B')];
let resolveRefresh!: (response: Response) => void;
let classACalls = 0;
let assessmentWrites: Array<{ path: string; method: string }> = [];

function summary(id: string, name: string) {
  return { id, name, status: 'RUNNING', startDate: null, endDate: null, recentlyEnded: false, course: null, sites: [], slotCount: 1, commentProgress: progress };
}

function detail(id: string, name: string, studentName: string) {
  return {
    ...summary(id, name),
    commentProgress: { state: 'pending' as const, badgeText: 'Chưa nhận xét' as const, slotNumber: 1, present: 1, completed: 0, missing: 1 },
    courseProcessId: null, courseProcess: null,
    slots: [
      { id: `${id}-slot-1`, index: 0, date: '2020-01-01', summary: `<p>Tổng kết ${name}</p>`, studentAttendance: [{ id: `${id}-attendance-1`, studentId: `${id}-student-1`, displayName: studentName, status: 'ATTENDED', commentByAreas: [] }] },
      { id: `${id}-slot-2`, index: 1, date: '2020-01-02', summary: `<p>Buổi hai ${name}</p>`, studentAttendance: [{ id: `${id}-attendance-2`, studentId: `${id}-student-1`, displayName: studentName, status: 'ATTENDED', commentByAreas: [] }] },
    ],
  };
}

function envelope(data: unknown) { return { success: true, data, requestId: 'comments-workspace-test' }; }
function studentRow(name: string) { return screen.findByRole('button', { name }); }
async function openStudentDrawer(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await studentRow(name));
  return screen.findByRole('dialog', { name });
}
function json(data: unknown) { return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } }); }

beforeEach(() => {
  localStorage.clear();
  useSessionCommentModeStore.setState({ modes: {} });
  appQueryClient().clear();
  useClassWorkspaceStore.getState().reset();
  useCommentStore.getState().reset();
  classACalls = 0;
  assessmentWrites = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    const path = typeof input === 'string' ? input : input instanceof URL ? input.pathname : new URL(input.url).pathname;
    if (path === '/api/v2/auth/session') return json(envelope({ authenticated: true, email: 'teacher@example.com', tokenExpiry: 9_999_999_999 }));
    if (path === '/api/v2/classes') return json(envelope({ classes }));
    if (path === '/api/v2/classes/class-a') {
      classACalls += 1;
      if (classACalls === 1) return json(envelope({ class: detail('class-a', 'Lớp A', 'Học sinh A') }));
      return new Promise<Response>((resolve) => { resolveRefresh = resolve; });
    }
    if (path === '/api/v2/classes/class-b') return json(envelope({ class: detail('class-b', 'Lớp B', 'Học sinh B') }));
    if (path.includes('/storage-products')) return json(envelope({ classId: 'class-a', files: [] }));
    if (/^\/api\/v2\/slots\/[^/]+\/assessments(?:\?|$)/.test(path)) return json(envelope({ assessments: [] }));
    if (/^\/api\/v2\/slots\/[^/]+\/assessments\//.test(path)) {
      assessmentWrites.push({ path, method: options?.method || 'GET' });
      return json(envelope({ assessment: { id: 'assessment-1', classId: 'class-a', slotId: 'class-a-slot-1', studentId: 'class-a-student-1', learningLevel: 'independent', note: '', createdAt: '2026-01-01', updatedAt: '2026-01-01', inherited: false, sourceSlotId: 'class-a-slot-1' } }));
    }
    throw new Error(`Unhandled request ${path}`);
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  appQueryClient().clear();
});

describe('comments workspace context safety', () => {
  it('switches an early session to SPCK and keeps the override separate from other sessions', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AppProviders><CommentsWorkspace /></AppProviders></MemoryRouter>);
    await user.click(await screen.findByRole('option', { name: /Lớp A/ }));
    await studentRow('Học sinh A');
    await waitFor(() => expect(useAssessmentStore.getState().load.loading).toBe(false));
    const select = screen.getByLabelText('Loại nhận xét');
    expect(screen.queryByText('Chỉ buổi này · lưu trên trình duyệt này')).not.toBeInTheDocument();
    expect(select).toHaveValue('auto');
    await user.selectOptions(select, 'spck');
    expect(select).toHaveValue('spck');
    expect(within(await openStudentDrawer(user, 'Học sinh A')).getByText('Đánh giá tiến độ sản phẩm')).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.getByLabelText('Level cả lớp')).toHaveTextContent('Vượt tiến độ');
    expect(sessionCommentModeFor('class-a', 'class-a-slot-1')).toBe('spck');
    await user.selectOptions(screen.getByLabelText('Buổi học'), '1');
    expect(screen.getByLabelText('Loại nhận xét')).toHaveValue('auto');
    expect(screen.getByLabelText('Level cả lớp')).toHaveTextContent('Nắm vững');
    await user.selectOptions(screen.getByLabelText('Buổi học'), '0');
    expect(screen.getByLabelText('Loại nhận xét')).toHaveValue('spck');
    await user.click(screen.getByRole('option', { name: /Lớp B/ }));
    await studentRow('Học sinh B');
    expect(screen.getByLabelText('Loại nhận xét')).toHaveValue('auto');
  });

  it('asks before changing mode with drafts and preserves them after confirmation', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AppProviders><CommentsWorkspace /></AppProviders></MemoryRouter>);
    await user.click(await screen.findByRole('option', { name: /Lớp A/ }));
    await studentRow('Học sinh A');
    act(() => useCommentStore.getState().editDraft('class-a-student-1', 'Bản nháp giữ nguyên'));
    await user.selectOptions(screen.getByLabelText('Loại nhận xét'), 'spck');
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Bản nháp và nhận xét đã gửi được giữ nguyên');
    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(screen.getByLabelText('Loại nhận xét')).toHaveValue('auto');
    await user.selectOptions(screen.getByLabelText('Loại nhận xét'), 'spck');
    await user.click(screen.getByRole('button', { name: 'Đổi loại nhận xét' }));
    expect(screen.getByLabelText('Loại nhận xét')).toHaveValue('spck');
    expect(useCommentStore.getState().drafts['class-a-student-1'].content).toBe('Bản nháp giữ nguyên');
  });

  it('auto-selects slot zero and ignores a delayed refresh after the live class context changes', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AppProviders><CommentsWorkspace /></AppProviders></MemoryRouter>);

    await user.click(await screen.findByRole('option', { name: /Lớp A/ }));
    expect(await studentRow('Học sinh A')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Lớp A/ })).toHaveTextContent('Chưa nhận xét');
      expect(screen.getByRole('option', { name: /Lớp A/ })).toHaveTextContent('Buổi 1: còn 1/1 học sinh chưa nhận xét');
    });
    expect(screen.getByRole('option', { name: /Lớp B/ })).toHaveTextContent('Chưa có dữ liệu');
    expect(screen.getByLabelText('Buổi học')).toHaveValue('0');
    expect(useClassWorkspaceStore.getState()).toMatchObject({ classId: 'class-a', slotIndex: '0', activeSlotIndex: '0' });
    expect(useClassWorkspaceStore.getState()).not.toHaveProperty('summaryDraft');
    expect(useCommentStore.getState()).toMatchObject({ summaryDraft: 'Tổng kết Lớp A', summarySynced: 'Tổng kết Lớp A' });

    await user.click(screen.getByRole('button', { name: 'Refresh dữ liệu lớp' }));
    await waitFor(() => expect(classACalls).toBe(2));
    expect(screen.getByRole('option', { name: /Lớp B/ })).toBeDisabled();
    useClassWorkspaceStore.getState().setClassId('class-b');
    expect(await screen.findByRole('button', { name: 'Học sinh B' }, { timeout: 6000 })).toBeInTheDocument();

    resolveRefresh(json(envelope({ class: detail('class-a', 'Lớp A stale', 'Học sinh A stale') })));
    await waitFor(() => expect(useClassWorkspaceStore.getState()).toMatchObject({ classId: 'class-b', slotIndex: '0', activeSlotIndex: '0' }));
    expect(screen.getByRole('button', { name: 'Học sinh B' })).toBeVisible();
    expect(screen.queryByText('Đã refresh dữ liệu!')).not.toBeInTheDocument();
  });

  it('locks navigation and assessment controls throughout delayed refresh without accepting edits or autosaves', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AppProviders><CommentsWorkspace /></AppProviders></MemoryRouter>);
    await user.click(await screen.findByRole('option', { name: /Lớp A/ }));
    await studentRow('Học sinh A');
    await waitFor(() => expect(useAssessmentStore.getState().load).toEqual({ loading: false, error: null }));

    await user.click(screen.getByRole('button', { name: 'Refresh dữ liệu lớp' }));
    await waitFor(() => expect(classACalls).toBe(2));
    expect(useAssessmentStore.getState().classRefreshBusy).toBe(true);
    expect(screen.getByRole('option', { name: /Lớp B/ })).toBeDisabled();
    expect(screen.getByLabelText('Buổi học')).toBeDisabled();
    expect(screen.getByLabelText('Loại nhận xét')).toBeDisabled();
    expect(screen.getByLabelText('Level cả lớp')).toBeDisabled();
    // The student sheet can still be opened mid-refresh, but everything in it is locked.
    const detailPanel = await openStudentDrawer(user, 'Học sinh A');
    const note = within(detailPanel).getByLabelText('Ghi chú bổ sung cho Học sinh A') as HTMLTextAreaElement;
    const level = within(detailPanel).getByRole('button', { name: /^Chọn L4/ });
    const save = within(detailPanel).getByRole('button', { name: 'Lưu đánh giá' });
    expect(note).toBeDisabled();
    expect(level).toBeDisabled();
    expect(save).toBeDisabled();

    await user.type(note, 'Không được nhận');
    await user.click(level);
    expect(note).toHaveValue('');
    expect(useAssessmentStore.getState().drafts['class-a-student-1']).toBeUndefined();
    expect(useAssessmentStore.getState().touched.size).toBe(0);
    expect(assessmentWrites).toEqual([]);

    resolveRefresh(json(envelope({ class: detail('class-a', 'Lớp A refreshed', 'Học sinh A') })));
    await waitFor(() => expect(useAssessmentStore.getState().classRefreshBusy).toBe(false));
    expect(note).toHaveValue('');
    expect(useAssessmentStore.getState().touched.size).toBe(0);
    expect(assessmentWrites).toEqual([]);
    expect(screen.getByText('Đã refresh dữ liệu!')).toBeVisible();
  });

  it('guards dirty assessment drafts on beforeunload, slot changes, and class changes', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AppProviders><CommentsWorkspace /></AppProviders></MemoryRouter>);
    await user.click(await screen.findByRole('option', { name: /Lớp A/ }));
    await studentRow('Học sinh A');
    await waitFor(() => expect(useAssessmentStore.getState().load).toEqual({ loading: false, error: null }));
    const note = within(await openStudentDrawer(user, 'Học sinh A')).getByLabelText('Ghi chú bổ sung cho Học sinh A');
    await waitFor(() => expect(note).toBeEnabled());
    await user.type(note, 'Chưa lưu');
    await user.keyboard('{Escape}');

    const beforeUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);

    await user.selectOptions(screen.getByLabelText('Buổi học'), '1');
    expect(screen.getByRole('alertdialog')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(screen.getByLabelText('Buổi học')).toHaveValue('0');
    await user.selectOptions(screen.getByLabelText('Buổi học'), '1');
    await user.click(screen.getByRole('button', { name: 'Bỏ thay đổi' }));
    await waitFor(() => expect(screen.getByLabelText('Buổi học')).toHaveValue('1'));

    await waitFor(() => expect(useAssessmentStore.getState().load).toEqual({ loading: false, error: null }));
    const nextNote = within(await openStudentDrawer(user, 'Học sinh A')).getByLabelText('Ghi chú bổ sung cho Học sinh A');
    await waitFor(() => expect(nextNote).toBeEnabled());
    await user.type(nextNote, 'Lại chưa lưu');
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('option', { name: /Lớp B/ }));
    expect(screen.getByRole('alertdialog')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(useClassWorkspaceStore.getState().classId).toBe('class-a');
    await user.click(screen.getByRole('option', { name: /Lớp B/ }));
    await user.click(screen.getByRole('button', { name: 'Bỏ thay đổi' }));
    await waitFor(() => expect(useClassWorkspaceStore.getState().classId).toBe('class-b'));
  });
});

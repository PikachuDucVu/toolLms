import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, appQueryClient } from '../../app/providers';
import { useAssessmentStore } from '../assessments';
import { useCommentStore } from '../comments/commentStore';
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
function json(data: unknown) { return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } }); }

beforeEach(() => {
  localStorage.clear();
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
  it('auto-selects slot zero and ignores a delayed refresh after the live class context changes', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AppProviders><CommentsWorkspace /></AppProviders></MemoryRouter>);

    await user.click(await screen.findByRole('option', { name: /Lớp A/ }));
    expect((await screen.findAllByRole('heading', { name: 'Học sinh A' })).length).toBeGreaterThan(0);
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
    expect((await screen.findAllByRole('heading', { name: 'Học sinh B' }, { timeout: 6000 })).length).toBeGreaterThan(0);

    resolveRefresh(json(envelope({ class: detail('class-a', 'Lớp A stale', 'Học sinh A stale') })));
    await waitFor(() => expect(useClassWorkspaceStore.getState()).toMatchObject({ classId: 'class-b', slotIndex: '0', activeSlotIndex: '0' }));
    expect(screen.getAllByRole('heading', { name: 'Học sinh B' })[0]).toBeVisible();
    expect(screen.queryByText('Đã refresh dữ liệu!')).not.toBeInTheDocument();
  });

  it('locks navigation and assessment controls throughout delayed refresh without accepting edits or autosaves', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><AppProviders><CommentsWorkspace /></AppProviders></MemoryRouter>);
    await user.click(await screen.findByRole('option', { name: /Lớp A/ }));
    await screen.findAllByRole('heading', { name: 'Học sinh A' });
    await waitFor(() => expect(useAssessmentStore.getState().load).toEqual({ loading: false, error: null }));
    const detailPanel = document.querySelector('.desktop-student-detail') as HTMLElement;
    const note = detailPanel.querySelector('textarea[id^="student-note-"]') as HTMLTextAreaElement;
    const level = detailPanel.querySelector('button[aria-label^="Chọn L4"]') as HTMLButtonElement;
    const save = Array.from(detailPanel.querySelectorAll('button')).find((button) => button.textContent === 'Lưu đánh giá') as HTMLButtonElement;

    await user.click(screen.getByRole('button', { name: 'Refresh dữ liệu lớp' }));
    await waitFor(() => expect(classACalls).toBe(2));
    expect(useAssessmentStore.getState().classRefreshBusy).toBe(true);
    expect(screen.getByRole('option', { name: /Lớp B/ })).toBeDisabled();
    expect(screen.getByLabelText('Buổi học')).toBeDisabled();
    expect(screen.getByLabelText('Level cả lớp')).toBeDisabled();
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
    await screen.findAllByRole('heading', { name: 'Học sinh A' });
    const note = document.querySelector('.desktop-student-detail textarea[id^="student-note-"]') as HTMLTextAreaElement;
    await waitFor(() => expect(useAssessmentStore.getState().load).toEqual({ loading: false, error: null }));
    await waitFor(() => expect(note).toBeEnabled());
    await user.type(note, 'Chưa lưu');

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

    const nextNote = document.querySelector('.desktop-student-detail textarea[id^="student-note-"]') as HTMLTextAreaElement;
    await waitFor(() => expect(nextNote).toBeEnabled());
    await user.type(nextNote, 'Lại chưa lưu');
    await user.click(screen.getByRole('option', { name: /Lớp B/ }));
    expect(screen.getByRole('alertdialog')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Hủy' }));
    expect(useClassWorkspaceStore.getState().classId).toBe('class-a');
    await user.click(screen.getByRole('option', { name: /Lớp B/ }));
    await user.click(screen.getByRole('button', { name: 'Bỏ thay đổi' }));
    await waitFor(() => expect(useClassWorkspaceStore.getState().classId).toBe('class-b'));
  });
});

import type { ClassDetail } from '@tool-lms/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, MemoryRouter, RouterProvider, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Header } from '../../components/layout/Header';
import { useCommentStore } from '../comments/commentStore';
import { AssessmentNavigationGuard } from './AssessmentNavigationGuard';
import { ConfirmProvider } from '../../components/ui/ConfirmDialog';
import { ToastProvider } from '../../components/ui/Toast';
import { activateAssessmentContext, resetAssessmentController } from './autosaveController';
import { AssessmentWorkspace } from './AssessmentWorkspace';
import { useAssessmentStore } from './assessmentStore';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const detail = assessmentDetail();
const activeNavigationCases = (['autosave', 'explicit', 'bulk', 'refresh'] as const).flatMap((operation) =>
  (['link', 'programmatic', 'back', 'forward'] as const).map((navigation) => ({ operation, navigation })),
);

beforeEach(() => {
  queryClient.clear();
  resetAssessmentController();
  useAssessmentStore.getState().reset();
  useCommentStore.getState().reset();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); queryClient.clear(); });

describe('regular assessment workspace', () => {
  it('shows inherited/default indicators and loads inherited level without its old note', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(loadEnvelope([
      assessment('student-1', 'needs_support', true, ''),
    ]))));
    renderWorkspace();
    const desktop = await desktopDetail();
    expect(within(desktop).getAllByText('Kế thừa L1 từ buổi trước')).toHaveLength(2);
    expect(within(desktop).getByRole('button', { name: /Chọn L1/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(desktop).getByLabelText(/Ghi chú bổ sung/)).toHaveValue('');
    await userEvent.setup().click(screen.getAllByRole('button', { name: /^Trần Bình/ })[0]);
    await screen.findAllByRole('heading', { name: 'Trần Bình' });
    expect((document.querySelector('.desktop-student-detail') as HTMLElement).textContent).toContain('Mặc định L3 · chưa lưu buổi này');
  });

  it('changes level immediately, shows saving, and sends only PATCH without AI calls', async () => {
    const patch = deferred<Response>();
    const requests: Array<{ path: string; method: string; body?: unknown }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const path = new URL(typeof input === 'string' ? `http://local${input}` : input.toString()).pathname;
      const method = options?.method || 'GET';
      requests.push({ path, method, body: options?.body ? JSON.parse(String(options.body)) : undefined });
      if (method === 'GET') return json(loadEnvelope([]));
      return patch.promise;
    }));
    renderWorkspace();
    const desktop = await desktopDetail();
    const l4 = within(desktop).getByRole('button', { name: /Chọn L4/ });
    await userEvent.setup().click(l4);
    expect(l4).toHaveAttribute('aria-pressed', 'true');
    expect(within(desktop).getByText('Đang lưu mức...')).toBeVisible();
    expect(requests.filter((request) => request.method === 'PATCH')).toHaveLength(1);
    expect(requests.some((request) => request.path.includes('generate'))).toBe(false);
    patch.resolve(json(saveEnvelope(assessment('student-1', 'independent', false, ''))));
    await waitFor(() => expect(within(desktop).getByText('Đã lưu')).toBeVisible());
  });

  it('does not autosave note input and explicit save trims/persists note and current level', async () => {
    const writes: Array<{ method: string; body: { note: string; learningLevel: string } }> = [];
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, options?: RequestInit) => {
      const method = options?.method || 'GET';
      if (method === 'GET') return json(loadEnvelope([]));
      const body = JSON.parse(String(options?.body));
      writes.push({ method, body });
      return json(saveEnvelope(assessment('student-1', body.learningLevel, false, body.note)));
    }));
    renderWorkspace();
    const desktop = await desktopDetail();
    const note = within(desktop).getByLabelText(/Ghi chú bổ sung/);
    await userEvent.setup().type(note, '  Chủ động hỏi  ');
    expect(writes).toEqual([]);
    expect(within(desktop).getByText('Chưa lưu')).toBeVisible();
    await userEvent.setup().click(within(desktop).getByRole('button', { name: 'Lưu đánh giá' }));
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({ method: 'PUT', body: { classId: 'class-1', learningLevel: 'understands_and_asks', note: 'Chủ động hỏi' } });
    await waitFor(() => expect(within(desktop).getByText('Đã lưu')).toBeVisible());
  });
});

describe('assessment navigation guard', () => {
  it('confirms dirty browser-history navigation and supports cancel then accept', async () => {
    const context = activateAssessmentContext('class-1', 'slot-current');
    useAssessmentStore.getState().hydrate(context, []);
    useAssessmentStore.getState().setNoteDraft('student-1', 'Chưa lưu');
    const router = renderGuardRouter(['/homework', '/'], 1);
    await screen.findByTestId('location');
    void router.navigate(-1);
    expect(await screen.findByRole('alertdialog')).toBeVisible();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Hủy' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/');
    void router.navigate(-1);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Bỏ thay đổi' }));
    await waitFor(() => expect(screen.getByTestId('homework-location')).toHaveTextContent('/homework'));
  });

  it.each(activeNavigationCases)('blocks active $operation operation through $navigation navigation without offering discard', async ({ operation, navigation }) => {
    const context = activateAssessmentContext('class-1', 'slot-current');
    useAssessmentStore.getState().hydrate(context, []);
    useAssessmentStore.getState().setNoteDraft('student-1', 'Chưa lưu');
    setActiveOperation(operation);
    const entries = navigation === 'back' ? ['/homework', '/'] : navigation === 'forward' ? ['/', '/homework'] : ['/'];
    const router = renderGuardRouter(entries, navigation === 'back' ? 1 : 0);
    if (navigation === 'link') await userEvent.setup().click(screen.getByRole('link', { name: /Chấm BTVN/ }));
    else if (navigation === 'programmatic') await userEvent.setup().click(screen.getByRole('button', { name: 'Điều hướng nội bộ' }));
    else void router.navigate(navigation === 'back' ? -1 : 1);
    expect(await screen.findByText('Vui lòng đợi thao tác đang chạy hoàn tất')).toBeVisible();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });

  it('keeps an active-operation transition blocked even if the operation completes before the blocker effect runs', async () => {
    const context = activateAssessmentContext('class-1', 'slot-current');
    useAssessmentStore.getState().hydrate(context, []);
    const router = renderGuardRouter(['/'], 0);
    useAssessmentStore.getState().setAutosaveBusy('student-1', true);
    void router.navigate('/homework');
    useAssessmentStore.getState().setAutosaveBusy('student-1', false);
    expect(await screen.findByText('Vui lòng đợi thao tác đang chạy hoàn tất')).toBeVisible();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });

  it('confirms dirty comment drafts and blocks active comment operations', async () => {
    useCommentStore.getState().activate({ classId: 'class-1', slotId: 'slot-current', epoch: 1 }, 'Tóm tắt');
    useCommentStore.getState().editDraft('student-1', 'Bản nháp chưa gửi');
    const router = renderGuardRouter(['/'], 0);
    await userEvent.setup().click(screen.getByRole('link', { name: /Chấm BTVN/ }));
    expect(await screen.findByRole('alertdialog')).toBeVisible();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Hủy' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/');

    useCommentStore.getState().setStudentBusy('student-1', true);
    await userEvent.setup().click(screen.getByRole('link', { name: /Chấm BTVN/ }));
    expect(await screen.findByText('Vui lòng đợi thao tác đang chạy hoàn tất')).toBeVisible();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/');
    void router;
  });

  it('blocks SPA navigation during an active comment operation even without dirty drafts', async () => {
    useCommentStore.getState().activate({ classId: 'class-1', slotId: 'slot-current', epoch: 1 }, 'Tóm tắt');
    useCommentStore.getState().setStudentBusy('student-1', true);
    renderGuardRouter(['/'], 0);

    await userEvent.setup().click(screen.getByRole('button', { name: 'Điều hướng nội bộ' }));
    expect(await screen.findByText('Vui lòng đợi thao tác đang chạy hoàn tất')).toBeVisible();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/');
  });

  it('allows clean programmatic internal navigation without confirmation', async () => {
    renderGuardRouter(['/'], 0);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Điều hướng nội bộ' }));
    await waitFor(() => expect(screen.getByTestId('homework-location')).toHaveTextContent('/homework'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

function renderWorkspace() {
  return render(<QueryClientProvider client={queryClient}><ToastProvider><ConfirmProvider><WorkspaceHarness /></ConfirmProvider></ToastProvider></QueryClientProvider>);
}

async function desktopDetail() {
  await screen.findAllByRole('heading', { name: 'Nguyễn Văn An' });
  return document.querySelector('.desktop-student-detail') as HTMLElement;
}

function WorkspaceHarness() {
  const [selectedId, setSelectedId] = useState('student-1');
  return <AssessmentWorkspace detail={detail} slot={detail.slots[1]} students={detail.slots[1].studentAttendance} selectedId={selectedId} search="" attendance="all" progress="all" onStudent={setSelectedId} onSearch={() => undefined} onAttendance={() => undefined} onProgress={() => undefined} onResetFilters={() => undefined} />;
}
function renderGuardRouter(initialEntries: string[], initialIndex: number) {
  const router = createMemoryRouter([
    { path: '/', element: <><AssessmentNavigationGuard /><Header /><ProgrammaticNavigation /><Location /></> },
    { path: '/homework', element: <Location testId="homework-location" /> },
  ], { initialEntries, initialIndex });
  render(<ToastProvider><ConfirmProvider><RouterProvider router={router} /></ConfirmProvider></ToastProvider>);
  return router;
}
function ProgrammaticNavigation() { const navigate = useNavigate(); return <button type="button" onClick={() => navigate('/homework')}>Điều hướng nội bộ</button>; }
function Location({ testId = 'location' }: { testId?: string }) { const location = useLocation(); return <output data-testid={testId}>{location.pathname}</output>; }
function setActiveOperation(operation: 'autosave' | 'explicit' | 'bulk' | 'refresh') {
  if (operation === 'autosave') useAssessmentStore.getState().setAutosaveBusy('student-1', true);
  else if (operation === 'explicit') useAssessmentStore.getState().setExplicitSaveBusy('student-1', true);
  else if (operation === 'bulk') useAssessmentStore.getState().setBulkBusy(true);
  else useAssessmentStore.getState().setClassRefreshBusy(true);
}
function json(value: unknown) { return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } }); }
function loadEnvelope(assessments: unknown[]) { return { success: true, data: { assessments }, requestId: 'component-test' }; }
function saveEnvelope(assessmentValue: unknown) { return { success: true, data: { assessment: assessmentValue }, requestId: 'component-test' }; }
function assessment(studentId: string, learningLevel: string, inherited: boolean, note: string) {
  const base = { id: `assessment-${studentId}`, classId: 'class-1', studentId, learningLevel, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
  return inherited ? { ...base, slotId: 'slot-1', sourceSlotId: 'slot-1', inherited: true, note: '' } : { ...base, slotId: 'slot-current', sourceSlotId: 'slot-current', inherited: false, note };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((res) => { resolve = res; }); return { promise, resolve }; }

function assessmentDetail(): ClassDetail {
  const progress = { state: 'pending' as const, badgeText: 'Chưa nhận xét' as const, slotNumber: 2, present: 2, completed: 0, missing: 2 };
  const common = { id: 'class-1', name: 'Lớp A', status: 'RUNNING', startDate: null, endDate: null, recentlyEnded: false, course: null, sites: [], slotCount: 2, commentProgress: progress };
  const students = [
    { id: 'attendance-1', studentId: 'student-1', displayName: 'Nguyễn Văn An', status: 'ATTENDED', commentByAreas: [] },
    { id: 'attendance-2', studentId: 'student-2', displayName: 'Trần Bình', status: 'LATE_ARRIVED', commentByAreas: [] },
  ];
  return { ...common, courseProcessId: null, courseProcess: null, slots: [
    { id: 'slot-1', index: 0, date: '2026-01-01', summary: '', studentAttendance: students.map((student) => ({ ...student, commentByAreas: [] })) },
    { id: 'slot-current', index: 1, date: '2026-01-02', summary: '', studentAttendance: students },
  ] };
}

import type { ClassDetail, StudentAttendance } from '@tool-lms/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../components/ui/ConfirmDialog';
import { ToastProvider } from '../../components/ui/Toast';
import { useCommentStore } from '../comments/commentStore';
import { useSessionCommentModeStore } from '../comments/sessionMode';
import { AssessmentWorkspace } from './AssessmentWorkspace';
import { resetAssessmentController } from './autosaveController';
import { useAssessmentStore } from './assessmentStore';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const detail = classDetail();
let loadUrls: string[] = [];

beforeEach(() => {
  queryClient.clear();
  resetAssessmentController();
  useAssessmentStore.getState().reset();
  useCommentStore.getState().reset();
  useSessionCommentModeStore.setState({ modes: {} });
  loadUrls = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = options?.method || 'GET';
    if (method === 'GET' && url.includes('/assessments?')) {
      loadUrls.push(url);
      return json({
        success: true,
        requestId: 'drawer-test',
        data: {
          assessments: [],
          history: [
            { studentId: 'student-an', slotId: 'slot-2', learningLevel: 'needs_prompting' },
            { studentId: 'student-binh', slotId: 'slot-1', learningLevel: 'independent' },
          ],
        },
      });
    }
    if (method === 'PATCH') {
      const studentId = decodeURIComponent(url.split('/assessments/')[1].split('/')[0]);
      const body = JSON.parse(String(options?.body));
      return json({ success: true, requestId: 'drawer-test', data: { assessment: {
        id: `assessment-${studentId}`, classId: 'class-1', slotId: 'slot-3', studentId, learningLevel: body.learningLevel, note: '',
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', inherited: false, sourceSlotId: 'slot-3',
      } } });
    }
    if (url.includes('/student-works')) return json({ success: true, requestId: 'drawer-test', data: { studentWorks: [] } });
    throw new Error(`Unhandled ${method} ${url}`);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); queryClient.clear(); });

describe('student detail drawer', () => {
  it('shows the previous session level and trend in the table and the drawer, never counting session 1', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    const anRow = await screen.findByRole('button', { name: 'Nguyễn An' });

    expect(new URL(loadUrls[0], 'http://local').searchParams.getAll('historySlotId')).toEqual(['slot-2']);
    expect(within(anRow).getByText('Buổi 2: L2')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: 'Trần Bình' })).queryByText(/^Buổi \d+:/)).not.toBeInTheDocument();

    await user.click(anRow);
    const drawer = await screen.findByRole('dialog', { name: 'Nguyễn An' });
    const compare = within(drawer).getByRole('group', { name: /So với buổi 2/ });
    expect(compare).toHaveTextContent('Tiến bộ');
    expect(compare).toHaveTextContent('Nhận xét AI sẽ có 1 câu khen con tiến bộ hơn buổi trước.');

    await user.click(within(drawer).getByRole('button', { name: /^Chọn L1/ }));
    expect(within(drawer).getByRole('group', { name: /So với buổi 2/ })).toHaveTextContent('Giảm');

    await user.click(within(drawer).getByRole('button', { name: 'Học sinh tiếp theo' }));
    const binh = await screen.findByRole('dialog', { name: 'Trần Bình' });
    expect(within(binh).getByText('Chưa có level buổi trước để so sánh tiến bộ (không tính buổi 1).')).toBeVisible();

    await user.click(within(binh).getByRole('button', { name: 'Học sinh tiếp theo' }));
    const chi = await screen.findByRole('dialog', { name: 'Lê Chi' });
    expect(within(chi).queryByText(/So với buổi|Chưa có level buổi trước/)).not.toBeInTheDocument();
  });

  it('renders one detail with the close button pinned outside the scrolling body and returns focus to the last row shown', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole('button', { name: 'Nguyễn An' }));
    const drawer = await screen.findByRole('dialog', { name: 'Nguyễn An' });

    expect(screen.getAllByLabelText('Ghi chú bổ sung cho Nguyễn An')).toHaveLength(1);
    const close = within(drawer).getByRole('button', { name: 'Đóng chi tiết' });
    const body = drawer.querySelector('.student-drawer-body') as HTMLElement;
    expect(body).toContainElement(within(drawer).getByLabelText('Ghi chú bổ sung cho Nguyễn An'));
    expect(body).not.toContainElement(close);
    await waitFor(() => expect(close).toHaveFocus());
    expect(within(drawer).getByRole('button', { name: 'Học sinh trước' })).toBeDisabled();

    body.scrollTop = 400;
    await user.click(within(drawer).getByRole('button', { name: 'Học sinh tiếp theo' }));
    await screen.findByRole('dialog', { name: 'Trần Bình' });
    expect(body.scrollTop).toBe(0);

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Trần Bình' }));
  });
});

function renderWorkspace() {
  return render(<QueryClientProvider client={queryClient}><ToastProvider><ConfirmProvider><Harness /></ConfirmProvider></ToastProvider></QueryClientProvider>);
}

function Harness() {
  const [selectedId, setSelectedId] = useState('student-an');
  const slot = detail.slots[2];
  return <AssessmentWorkspace detail={detail} slot={slot} sessionNumber={3} students={slot.studentAttendance} selectedId={selectedId} search="" attendance="all" progress="all" onStudent={setSelectedId} onSearch={() => undefined} onAttendance={() => undefined} onProgress={() => undefined} onResetFilters={() => undefined} />;
}

function json(value: unknown) { return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } }); }

function classDetail(): ClassDetail {
  const student = (studentId: string, displayName: string, status: StudentAttendance['status'] = 'ATTENDED'): StudentAttendance => ({
    id: `attendance-${studentId}`, studentId, displayName, status, commentByAreas: [],
  });
  const present = [student('student-an', 'Nguyễn An'), student('student-binh', 'Trần Bình'), student('student-chi', 'Lê Chi')];
  return {
    id: 'class-1', name: 'Lớp A', status: 'RUNNING', startDate: null, endDate: null, recentlyEnded: false,
    course: null, sites: [], slotCount: 3, courseProcessId: null, courseProcess: null,
    commentProgress: { state: 'pending', badgeText: 'Chưa nhận xét', slotNumber: 3, present: 2, completed: 0, missing: 2 },
    slots: [
      { id: 'slot-1', index: 0, date: '2026-01-01', summary: '', studentAttendance: present },
      { id: 'slot-2', index: 1, date: '2026-01-08', summary: '', studentAttendance: present },
      { id: 'slot-3', index: 2, date: '2026-01-15', summary: '', studentAttendance: [present[0], present[1], student('student-chi', 'Lê Chi', 'ABSENT')] },
    ],
  };
}

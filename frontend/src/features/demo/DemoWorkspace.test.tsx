import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ClassDetail, Slot } from '@tool-lms/contracts';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoWorkspace } from './DemoWorkspace';
import { resetDemoController } from './demoController';
import { useDemoStore } from './demoStore';

const slot: Slot = { id: 'slot-14', index: 13, date: null, summary: '<p>Tổng kết Demo</p>', studentAttendance: [
  { id: 'attendance-1', studentId: 'student-1', displayName: 'Nguyễn An', status: 'ATTENDED', commentByAreas: [] },
  { id: 'attendance-2', studentId: 'student-2', displayName: 'Lê Chi', status: 'ABSENT_WITH_NOTICE', commentByAreas: [] },
] };
const detail: ClassDetail = { id: 'class-1', name: 'Lớp Demo', status: 'RUNNING', startDate: null, endDate: null, recentlyEnded: false, course: null, sites: [], slotCount: 1, commentProgress: { state: 'unknown', badgeText: 'Chưa có dữ liệu', slotNumber: null, present: null, completed: null, missing: null }, courseProcessId: 'process-1', courseProcess: null, slots: [slot] };
const schema = { source: 'dynamic' as const, fallbackKind: null, label: 'Sản phẩm cuối khóa', maxScore: 5, questions: [{ id: 'question-b', title: 'Thuyết trình', maxScore: 2 }, { id: 'question-a', title: 'Hoàn thiện sản phẩm', maxScore: 3 }] };

beforeEach(() => { resetDemoController(); useDemoStore.getState().reset(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Demo workspace schema and UI', () => {
  it('shows passive schema loading then renders authoritative dynamic order, labels and max scores', async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((next) => { resolve = next; })));
    renderWorkspace();
    expect(screen.getByLabelText('Đang tải schema Demo')).toBeVisible();
    resolve(json(ok({ schema })));
    await screen.findByRole('button', { name: 'Nguyễn An' });
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Chấm điểm' })[0]);
    const desktop = within(await screen.findByRole('dialog'));
    const labels = desktop.getAllByRole('cell').filter((cell) => ['Thuyết trình', 'Hoàn thiện sản phẩm'].includes(cell.textContent || '')).map((cell) => cell.textContent);
    expect(labels).toEqual(['Thuyết trình', 'Hoàn thiện sản phẩm']);
    expect(desktop.getByText(/Tối đa 5 điểm/)).toBeVisible();
    const presentation = desktop.getByLabelText('Điểm Thuyết trình của Nguyễn An');
    expect(presentation).toHaveAttribute('max', '2');
    expect(desktop.getByLabelText('Điểm Hoàn thiện sản phẩm của Nguyễn An')).toHaveAttribute('step', '0.25');
    await userEvent.setup().clear(presentation);
    await userEvent.setup().type(presentation, '2.25');
    expect(presentation).toHaveValue(2.25);
  });

  it('renders recoverable schema errors and retries without activating a blocking Demo operation', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      return calls === 1 ? json({ success: false, error: { code: 'UPSTREAM_ERROR', message: 'Schema tạm lỗi', requestId: 'schema-error' } }, 502) : json(ok({ schema }));
    }));
    const user = userEvent.setup(); renderWorkspace();
    expect(await screen.findByRole('alert')).toHaveTextContent('Schema tạm lỗi');
    expect(useDemoStore.getState().batch).toBeNull();
    expect(useDemoStore.getState().randomBusy.size).toBe(0);
    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('button', { name: 'Nguyễn An' })).toBeVisible();
    expect(calls).toBe(2);
  });

  it('keeps absent students read-only and present-student actions backend driven', async () => {
    const requests: Array<{ path: string; method: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const path = String(input); requests.push({ path, method: options?.method || 'GET' });
      if (path.includes('random-scores')) return json(ok({ schema, questions: [{ ...schema.questions[0], score: 1.75 }, { ...schema.questions[1], score: 2.5 }], demoScore: 4.25 }));
      return json(ok({ schema }));
    }));
    const user = userEvent.setup(); renderWorkspace();
    await screen.findByRole('button', { name: 'Nguyễn An' });
    await user.click(screen.getAllByRole('button', { name: 'Chấm điểm' })[0]);
    const desktop = within(await screen.findByRole('dialog'));
    await user.click(desktop.getByRole('button', { name: 'Random 3.75–5' }));
    await waitFor(() => expect(desktop.getByLabelText('Điểm Thuyết trình của Nguyễn An')).toHaveValue(1.75));
    expect(desktop.getByText('4.25 / 5')).toBeVisible();
    expect(requests.some((item) => item.path === '/api/v2/slots/slot-14/demo/random-scores' && item.method === 'POST')).toBe(true);
    await user.click(desktop.getByRole('button', { name: 'Đóng' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Lê Chi' }));
    const absentDesktop = within(await screen.findByRole('dialog'));
    expect(absentDesktop.getByText('Học sinh vắng — không chấm Demo')).toBeVisible();
    expect(absentDesktop.queryByRole('button', { name: /Random/ })).not.toBeInTheDocument();
    expect(absentDesktop.queryByRole('button', { name: 'Submit Demo' })).not.toBeInTheDocument();
  });
});

function renderWorkspace() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>);
}
function Harness() {
  const [selectedId, setSelectedId] = useState('student-1');
  return <DemoWorkspace detail={detail} slot={slot} sessionNumber={14} students={slot.studentAttendance} selectedId={selectedId} search="" attendance="all" progress="all" onStudent={setSelectedId} onSearch={() => undefined} onAttendance={() => undefined} onProgress={() => undefined} onResetFilters={() => undefined} />;
}
function ok(data: unknown) { return { success: true, requestId: 'demo-workspace-test', data }; }
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }); }

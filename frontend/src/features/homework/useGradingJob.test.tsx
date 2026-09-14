import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { transitionAuthContext } from '../../lib/operationContext';
import { useHomeworkStore } from './store';
import { useGradingJob } from './useGradingJob';

const scope = { classId: 'class-1', submissions: [], students: [], lessons: [], modelId: 'gpt-5.4', customModelId: '', thinkingLevel: 'high' as const };
const response = (status: 'running' | 'completed' | 'cancelled', failedItems = 0) => new Response(JSON.stringify({ success: true, data: { job: { id: 'job-1', classId: 'class-1', status, totalItems: 2, completedItems: status === 'completed' ? 2 - failedItems : 0, failedItems, createdAt: 'now', updatedAt: 'now', cancelledAt: status === 'cancelled' ? 'now' : null }, items: [] }, requestId: 'job-request' }), { headers: { 'content-type': 'application/json' } });

const noopTerminal = () => undefined;
function Harness({ onTerminal }: { onTerminal?: (classId: string, status: 'completed' | 'cancelled') => void }) {
  const job = useGradingJob(onTerminal || noopTerminal);
  return <div>{job.data?.data.job.status || 'waiting'}</div>;
}
function renderHookHarness(onTerminal?: (classId: string, status: 'completed' | 'cancelled') => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={client}><Harness onTerminal={onTerminal} /></QueryClientProvider>);
  return Object.assign(view, { client });
}

beforeEach(() => { vi.useFakeTimers(); useHomeworkStore.getState().reset(); useHomeworkStore.getState().setClassId('class-1'); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('grading job polling', () => {
  it('waits 3 seconds before the first request and never overlaps requests', async () => {
    let resolveFirst!: (value: Response) => void;
    let resolveSecond!: (value: Response) => void;
    const first = new Promise<Response>((resolve) => { resolveFirst = resolve; });
    const second = new Promise<Response>((resolve) => { resolveSecond = resolve; });
    const fetchMock = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    vi.stubGlobal('fetch', fetchMock);
    useHomeworkStore.getState().startJob('job-1', scope);
    const view = renderHookHarness();
    await act(async () => { await vi.advanceTimersByTimeAsync(2_999); });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(6_000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { resolveFirst(response('running')); await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(2_999); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => {
      resolveSecond(response('completed'));
      for (let index = 0; index < 10; index += 1) await Promise.resolve();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(view.client.getQueryData(['homework', 'job', 'job-1'])).toMatchObject({ data: { job: { status: 'completed' } } });
    expect(screen.getByText('completed')).toBeInTheDocument();
  });

  it('reports a partially successful completed job once and stops polling', async () => {
    const onTerminal = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(response('completed', 1));
    vi.stubGlobal('fetch', fetchMock);
    useHomeworkStore.getState().startJob('job-1', scope);
    renderHookHarness(onTerminal);

    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(onTerminal).toHaveBeenCalledOnce();
    expect(onTerminal).toHaveBeenCalledWith('class-1', 'completed');
    await act(async () => { await vi.advanceTimersByTimeAsync(9_000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ignores a stale response after the active job changes', async () => {
    let resolveFirst!: (value: Response) => void;
    const first = new Promise<Response>((resolve) => { resolveFirst = resolve; });
    const fetchMock = vi.fn().mockReturnValueOnce(first).mockResolvedValue(response('running'));
    vi.stubGlobal('fetch', fetchMock);
    useHomeworkStore.getState().startJob('job-1', scope);
    renderHookHarness();
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    act(() => useHomeworkStore.getState().startJob('job-2', scope));
    await act(async () => { resolveFirst(response('completed')); await Promise.resolve(); });
    expect(screen.getByText('waiting')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('aborts the in-flight poll on unmount', async () => {
    let observedSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      observedSignal = init?.signal || undefined;
      return new Promise<Response>(() => undefined);
    }));
    useHomeworkStore.getState().startJob('job-1', scope);
    const view = renderHookHarness();
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(observedSignal?.aborted).toBe(false);
    view.unmount();
    expect(observedSignal?.aborted).toBe(true);
  });

  it('aborts an in-flight poll immediately when the auth epoch changes', async () => {
    let observedSignal: AbortSignal | undefined;
    const onTerminal = vi.fn();
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      observedSignal = init?.signal || undefined;
      return new Promise<Response>(() => undefined);
    }));
    useHomeworkStore.getState().startJob('job-1', scope);
    const view = renderHookHarness(onTerminal);
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(observedSignal?.aborted).toBe(false);
    await act(async () => { await transitionAuthContext(view.client); });
    expect(observedSignal?.aborted).toBe(true);
    expect(useHomeworkStore.getState().activeJobId).toBeNull();
    expect(onTerminal).not.toHaveBeenCalled();
  });
});

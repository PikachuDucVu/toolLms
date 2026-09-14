import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, appQueryClient, ThemeProvider, useAuth, useTheme, type AuthContextValue } from './providers';
import { apiRequest } from '../lib/apiClient';
import { createOperationController, currentAuthEpoch } from '../lib/operationContext';
import { useAssessmentStore } from '../features/assessments/assessmentStore';
import { useCheckpointStore } from '../features/checkpoint/checkpointStore';
import { useClassWorkspaceStore } from '../features/classes/store';
import { useCommentStore } from '../features/comments/commentStore';
import { useDemoStore } from '../features/demo/demoStore';
import { useHomeworkStore } from '../features/homework/store';
import { useGradingJob } from '../features/homework/useGradingJob';
import { useReviewStore } from '../features/review/reviewStore';

let auth: AuthContextValue;
let serverPrincipal: 'A' | 'B' | null;
let pollStarted: Promise<void>;
let markPollStarted: () => void;
let resolvePoll: (response: Response) => void;
let gradingPollCalls: number;
const onTerminal = vi.fn();

function Harness() {
  auth = useAuth();
  useGradingJob(onTerminal);
  return <div data-testid="principal">{auth.session?.email || 'signed-out'}</div>;
}

beforeEach(() => {
  localStorage.clear();
  serverPrincipal = 'A';
  gradingPollCalls = 0;
  pollStarted = new Promise((resolve) => { markPollStarted = resolve; });
  appQueryClient().clear();
  resetAllStores();
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(typeof input === 'string' ? `http://local${input}` : input instanceof URL ? input : input.url).pathname;
    if (path === '/api/v2/auth/session') {
      if (!serverPrincipal) return Promise.resolve(errorResponse('AUTH_REQUIRED', 'Expired', 401));
      return Promise.resolve(sessionResponse(serverPrincipal));
    }
    if (path === '/api/v2/private-expired') return Promise.resolve(errorResponse('AUTH_REQUIRED', 'Expired', 401));
    if (path === '/api/v2/homework/jobs/job-a') {
      gradingPollCalls += 1;
      markPollStarted();
      return new Promise<Response>((resolve) => {
        resolvePoll = resolve;
        init?.signal?.addEventListener('abort', () => undefined, { once: true });
      });
    }
    throw new Error(`Unhandled request ${path}`);
  }));
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllGlobals();
  appQueryClient().clear();
  resetAllStores();
});

describe('ThemeProvider legacy storage resync', () => {
  it('resyncs the exact lms-theme key on storage events and window focus', async () => {
    localStorage.setItem('lms-theme', 'light');
    function ThemeHarness() { const { theme } = useTheme(); return <output data-testid="theme">{theme}</output>; }
    render(<ThemeProvider><ThemeHarness /></ThemeProvider>);
    expect(screen.getByTestId('theme')).toHaveTextContent('light');

    localStorage.setItem('lms-theme', 'dark');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'lms-theme' })));
    await waitFor(() => expect(screen.getByTestId('theme')).toHaveTextContent('dark'));

    localStorage.setItem('lms-theme', 'light');
    act(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => expect(screen.getByTestId('theme')).toHaveTextContent('light'));
  });
});

describe('AppProviders principal isolation', () => {
  it.each(['logout', 'AUTH_REQUIRED'] as const)('isolates Teacher A from Teacher B after %s', async (transition) => {
    render(<AppProviders><Harness /></AppProviders>);
    await screen.findByText('teacher-a@example.com');

    populateTeacherAState();
    appQueryClient().setQueryData(['private', 'cached'], { teacher: 'A', token: 'teacher-a-private-token' });

    let resolveDeferredQuery!: (value: { teacher: string }) => void;
    let deferredQuerySignal: AbortSignal | undefined;
    const deferredQuery = appQueryClient().fetchQuery({
      queryKey: ['private', 'deferred-a'],
      queryFn: ({ signal }) => new Promise<{ teacher: string }>((resolve) => {
        deferredQuerySignal = signal;
        resolveDeferredQuery = resolve;
      }),
    }).catch(() => undefined);
    const operation = createOperationController();
    const initialEpoch = currentAuthEpoch();

    vi.useFakeTimers();
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    await pollStarted;
    expect(gradingPollCalls).toBe(1);

    vi.useRealTimers();
    serverPrincipal = null;
    if (transition === 'logout') {
      await act(async () => { await auth.clearSession(); });
    } else {
      await apiRequest('/api/v2/private-expired', { schema: z.unknown() }).catch(() => undefined);
      await waitFor(() => expect(currentAuthEpoch()).toBeGreaterThan(initialEpoch));
    }
    await waitFor(() => expect(screen.getByTestId('principal')).toHaveTextContent('signed-out'));

    expect(operation.signal.aborted).toBe(true);
    expect(deferredQuerySignal?.aborted).toBe(true);
    expect(appQueryClient().getQueryData(['private', 'cached'])).toBeUndefined();
    expect(appQueryClient().getQueryData(['private', 'deferred-a'])).toBeUndefined();
    expectAllStoresReset();

    serverPrincipal = 'B';
    await act(async () => { await auth.acceptSession({ email: 'teacher-b@example.com', tokenExpiry: 2_100_000_000 }); });
    await waitFor(() => expect(screen.getByTestId('principal')).toHaveTextContent('teacher-b@example.com'));
    appQueryClient().setQueryData(['private', 'cached'], { teacher: 'B' });
    useClassWorkspaceStore.getState().setClassId('class-b');
    useCommentStore.getState().activate({ classId: 'class-b', slotId: 'slot-b', epoch: 1 }, 'B only');

    resolveDeferredQuery({ teacher: 'A' });
    resolvePoll(gradingResponse('running', 'class-a'));
    await deferredQuery;
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(appQueryClient().getQueryData(['private', 'cached'])).toEqual({ teacher: 'B' });
    expect(appQueryClient().getQueryData(['private', 'deferred-a'])).toBeUndefined();
    expect(appQueryClient().getQueryData(['homework', 'job', 'job-a'])).toBeUndefined();
    expect(useClassWorkspaceStore.getState().classId).toBe('class-b');
    expect(useCommentStore.getState().summaryDraft).toBe('B only');

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(gradingPollCalls).toBe(1);
  });
});

function populateTeacherAState() {
  useClassWorkspaceStore.setState({ classId: 'class-a', slotIndex: '1', activeSlotIndex: '1', studentId: 'student-a', search: 'Teacher A' });
  useAssessmentStore.setState({ context: { classId: 'class-a', slotId: 'slot-a', epoch: 1 }, drafts: { 'student-a': { learningLevel: 'independent', note: 'private A note' } } });
  useCommentStore.setState({ context: { classId: 'class-a', slotId: 'slot-a', epoch: 1 }, summaryDraft: 'private A summary', drafts: { 'student-a': { content: 'private A comment', kind: 'manual', generationMeta: null } } });
  useDemoStore.setState({ context: { classId: 'class-a', slotId: 'slot-a', epoch: 1 }, summaryDraft: 'private A demo' });
  useCheckpointStore.setState({ context: { classId: 'class-a', slotId: 'slot-a', checkpoint: 1, epoch: 1 }, summaryDraft: 'private A checkpoint' });
  useReviewStore.setState({ open: true, selectedStudentId: 'student-a', search: 'Teacher A' });
  useHomeworkStore.getState().setClassId('class-a');
  useHomeworkStore.setState({ activeJobId: 'job-a', drafts: { 'submission-a': { score: '88', note: 'private A homework' } } });
}

function expectAllStoresReset() {
  expect(useClassWorkspaceStore.getState().classId).toBe('');
  expect(useAssessmentStore.getState().context).toBeNull();
  expect(useCommentStore.getState().context).toBeNull();
  expect(useDemoStore.getState().context).toBeNull();
  expect(useCheckpointStore.getState().context).toBeNull();
  expect(useReviewStore.getState().open).toBe(false);
  expect(useHomeworkStore.getState().classId).toBe('');
  expect(useHomeworkStore.getState().activeJobId).toBeNull();
}

function resetAllStores() {
  useClassWorkspaceStore.getState().reset();
  useAssessmentStore.getState().reset();
  useCommentStore.getState().reset();
  useDemoStore.getState().reset();
  useCheckpointStore.getState().reset();
  useReviewStore.getState().reset();
  useHomeworkStore.getState().reset();
}

function sessionResponse(principal: 'A' | 'B'): Response {
  const email = principal === 'A' ? 'teacher-a@example.com' : 'teacher-b@example.com';
  return Response.json({ success: true, requestId: `session-${principal}`, data: { authenticated: true, email, tokenExpiry: 2_100_000_000 } });
}

function errorResponse(code: string, message: string, status: number): Response {
  return Response.json({ success: false, error: { code, message, requestId: 'auth-transition' } }, { status });
}

function gradingResponse(status: 'running' | 'completed', classId: string): Response {
  return Response.json({
    success: true,
    requestId: 'poll-a',
    data: {
      job: { id: 'job-a', classId, status, totalItems: 1, completedItems: 0, failedItems: 0, createdAt: 'now', updatedAt: 'now', cancelledAt: null },
      items: [],
    },
  });
}

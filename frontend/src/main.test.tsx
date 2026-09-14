import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ApiError } from './lib/apiError';

type RootErrorInfo = { componentStack?: string | null; errorBoundary?: unknown };
type CapturedRootOptions = {
  onCaughtError?: (error: unknown, errorInfo: RootErrorInfo) => void;
  onUncaughtError?: (error: unknown, errorInfo: RootErrorInfo) => void;
};

const rootCapture = vi.hoisted(() => ({ options: undefined as CapturedRootOptions | undefined, render: vi.fn() }));

vi.mock('react-dom/client', () => ({
  createRoot: (_container: Element | DocumentFragment, options?: CapturedRootOptions) => {
    rootCapture.options = options;
    return { render: rootCapture.render };
  },
}));

beforeAll(async () => {
  document.body.innerHTML = '<div id="root"></div>';
  await import('./main');
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => { document.body.innerHTML = ''; });

describe('React root safe error hooks', () => {
  it('suppresses React default caught-error reporting so ErrorBoundary is the only logger', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const secret = 'caught student@example.com private note';
    const error = new Error(secret); error.stack = `STACK ${secret}`;

    rootCapture.options?.onCaughtError?.(error, { componentStack: `COMPONENT ${secret}` });

    expect(log).not.toHaveBeenCalled();
  });

  it('logs uncaught errors with safe type and allowlisted IDs only', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const secret = 'uncaught student@example.com private-note sk-or-v1-secret';
    const error = new ApiError(secret, 'UPSTREAM_ERROR', 'request-safe_123', 502, { secret });
    error.stack = `STACK ${secret}`;

    rootCapture.options?.onUncaughtError?.(error, { componentStack: `COMPONENT ${secret}` });

    const entry = structuredRootLog(log.mock.calls);
    expect(entry).toMatchObject({ category: 'react-root-uncaught', errorType: 'ApiError', requestId: 'request-safe_123' });
    expect(entry.incidentId).toMatch(/^client-[A-Za-z0-9-]+$/);
    expect(Object.keys(entry).sort()).toEqual(['category', 'errorType', 'incidentId', 'requestId']);
    expect(log.mock.calls.flat().join(' ')).not.toContain(secret);
    expect(log.mock.calls.flat().join(' ')).not.toContain('STACK');
    expect(log.mock.calls.flat().join(' ')).not.toContain('COMPONENT');
  });

  it('omits unsafe request IDs and never logs thrown non-Error values raw', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const secret = 'unsafe student@example.com';
    const error = new ApiError(secret, 'UPSTREAM_ERROR', `request ${secret}`, 500);

    rootCapture.options?.onUncaughtError?.(error, { componentStack: secret });
    const apiEntry = structuredRootLog(log.mock.calls);
    expect(apiEntry).not.toHaveProperty('requestId');
    expect(JSON.stringify(apiEntry)).not.toContain(secret);

    log.mockClear();
    rootCapture.options?.onUncaughtError?.({ secret }, { componentStack: secret });
    const unknownEntry = structuredRootLog(log.mock.calls);
    expect(unknownEntry).toMatchObject({ category: 'react-root-uncaught', errorType: 'UnknownError' });
    expect(log.mock.calls.flat().join(' ')).not.toContain(secret);
  });
});

function structuredRootLog(calls: ReadonlyArray<ReadonlyArray<unknown>>): Record<string, unknown> {
  const value = calls.map((call) => String(call[0])).find((entry) => entry.startsWith('{') && entry.includes('"category":"react-root-uncaught"'));
  if (!value) throw new Error('Missing structured root log');
  return JSON.parse(value) as Record<string, unknown>;
}

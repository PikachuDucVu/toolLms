import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/apiError';
import { ErrorBoundary } from './ErrorBoundary';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('ErrorBoundary recovery and safe reporting', () => {
  it('remounts the failed subtree and recovers from a transient render failure', async () => {
    let shouldThrow = true;
    let mounts = 0;
    function Transient() {
      mounts += 1;
      if (shouldThrow) throw new Error('private student name');
      return <p>Đã khôi phục</p>;
    }
    vi.spyOn(console, 'error').mockImplementation((entry) => {
      if (String(entry).includes('"category":"react-boundary"')) shouldThrow = false;
    });
    render(<ErrorBoundary><Transient /></ErrorBoundary>);
    expect(screen.getByRole('alert', { name: 'Ứng dụng gặp sự cố' })).toBeVisible();
    const mountsBeforeRetry = mounts;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByText('Đã khôi phục')).toBeVisible();
    expect(mounts).toBeGreaterThan(mountsBeforeRetry);
  });

  it('offers an accessible reload action after a persistent retry fails', async () => {
    const reload = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Persistent(): React.ReactNode { throw new Error('still broken'); }
    render(<ErrorBoundary reload={reload}><Persistent /></ErrorBoundary>);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('button', { name: 'Tải lại trang' })).toBeVisible();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tải lại trang' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('logs only safe incident/type/request IDs and redacts messages, stacks, PII, and unsafe IDs', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const secret = 'student@example.com private-note sk-or-v1-secret';
    function ApiFailure(): React.ReactNode { throw new ApiError(secret, 'UPSTREAM_ERROR', 'request-safe_123', 502, { secret }); }
    render(<ErrorBoundary><ApiFailure /></ErrorBoundary>);
    const entry = boundaryLog(log.mock.calls);
    expect(entry).toMatchObject({ category: 'react-boundary', errorType: 'ApiError', requestId: 'request-safe_123' });
    expect(entry.incidentId).toMatch(/^client-[A-Za-z0-9-]+$/);
    expect(Object.keys(entry).sort()).toEqual(['category', 'errorType', 'incidentId', 'requestId']);
    expect(JSON.stringify(entry)).not.toContain(secret);
    expect(screen.getByText(/Request ID:/)).toHaveTextContent('request-safe_123');

    cleanup(); log.mockClear();
    function UnsafeFailure(): React.ReactNode { throw new ApiError(secret, 'UPSTREAM_ERROR', 'unsafe student@example.com', 502); }
    render(<ErrorBoundary><UnsafeFailure /></ErrorBoundary>);
    const unsafeEntry = boundaryLog(log.mock.calls);
    expect(unsafeEntry).not.toHaveProperty('requestId');
    expect(document.body.textContent).not.toContain('unsafe student@example.com');
  });
});

function boundaryLog(calls: unknown[][]): Record<string, unknown> {
  const value = calls.map((call) => String(call[0])).find((entry) => entry.startsWith('{') && entry.includes('"category":"react-boundary"'));
  if (!value) throw new Error('Missing structured boundary log');
  return JSON.parse(value) as Record<string, unknown>;
}

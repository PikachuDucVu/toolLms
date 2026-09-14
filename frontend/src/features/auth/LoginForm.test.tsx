import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, appQueryClient } from '../../app/providers';
import { LoginForm } from './LoginForm';

const errorResponse = (code: 'AUTH_REQUIRED' | 'UPSTREAM_ERROR', message: string, status: number, requestId: string) => new Response(JSON.stringify({ success: false, error: { code, message, requestId } }), { status, headers: { 'content-type': 'application/json', 'x-request-id': requestId } });

beforeEach(() => { localStorage.clear(); appQueryClient().clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); appQueryClient().clear(); });

describe('login form', () => {
  it('uses exact legacy remembered values and keeps remember enabled by default', () => {
    localStorage.setItem('lms_email', 'legacy@mindx.test'); localStorage.setItem('lms_password', 'legacy-secret');
    vi.stubGlobal('fetch', vi.fn(async () => errorResponse('AUTH_REQUIRED', 'Expired', 401, 'session-default')));
    render(<AppProviders><LoginForm /></AppProviders>);
    expect(screen.getByLabelText('Email MindX')).toHaveValue('legacy@mindx.test');
    expect(screen.getByLabelText('Mật khẩu')).toHaveValue('legacy-secret');
    expect(screen.getByRole('checkbox', { name: 'Ghi nhớ đăng nhập' })).toBeChecked();
  });

  it('accepts a successful typed session and preserves remembered credentials', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      if (path.includes('/session')) return errorResponse('AUTH_REQUIRED', 'Expired', 401, 'session-1');
      return new Response(JSON.stringify({ success: true, data: { authenticated: true, email: 'teacher@example.com', tokenExpiry: 123 }, requestId: 'login-1' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    const user = userEvent.setup(); render(<AppProviders><LoginForm /></AppProviders>);
    await user.type(screen.getByLabelText('Email MindX'), 'teacher@example.com'); await user.type(screen.getByLabelText('Mật khẩu'), 'secret'); await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByText('Đăng nhập thành công!')).toBeInTheDocument();
    expect(localStorage.getItem('lms_email')).toBe('teacher@example.com'); expect(localStorage.getItem('lms_password')).toBe('secret');
  });

  it('removes both remembered keys after a successful login with remember disabled', async () => {
    localStorage.setItem('lms_email', 'old@mindx.test'); localStorage.setItem('lms_password', 'old-secret');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      if (path.includes('/session')) return errorResponse('AUTH_REQUIRED', 'Expired', 401, 'session-remove');
      return new Response(JSON.stringify({ success: true, data: { authenticated: true, email: 'new@mindx.test', tokenExpiry: 123 }, requestId: 'login-remove' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    const user = userEvent.setup(); render(<AppProviders><LoginForm /></AppProviders>);
    await user.clear(screen.getByLabelText('Email MindX')); await user.type(screen.getByLabelText('Email MindX'), 'new@mindx.test');
    await user.clear(screen.getByLabelText('Mật khẩu')); await user.type(screen.getByLabelText('Mật khẩu'), 'new-secret');
    await user.click(screen.getByRole('checkbox', { name: 'Ghi nhớ đăng nhập' })); await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByText('Đăng nhập thành công!')).toBeVisible();
    expect(localStorage.getItem('lms_email')).toBeNull(); expect(localStorage.getItem('lms_password')).toBeNull();
  });

  it('shows the safe server failure and does not persist credentials', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      return path.includes('/session') ? errorResponse('AUTH_REQUIRED', 'Expired', 401, 'session-2') : errorResponse('UPSTREAM_ERROR', 'Sai thông tin đăng nhập', 502, 'login-2');
    }));
    const user = userEvent.setup(); render(<AppProviders><LoginForm /></AppProviders>);
    await user.type(screen.getByLabelText('Email MindX'), 'teacher@example.com'); await user.type(screen.getByLabelText('Mật khẩu'), 'wrong'); await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(await screen.findByText('Lỗi đăng nhập: Sai thông tin đăng nhập')).toBeInTheDocument();
    expect(localStorage.getItem('lms_email')).toBeNull();
  });
});

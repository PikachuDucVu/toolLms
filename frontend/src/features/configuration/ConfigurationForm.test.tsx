import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicConfig, ThinkingLevel } from '@tool-lms/contracts';
import { AppProviders, appQueryClient, useAuth, type AuthContextValue } from '../../app/providers';
import { ConfigPanel } from './ConfigPanel';

let auth: AuthContextValue;
let serverPrincipal: 'A' | 'B';
let resolveTeacherASave: (response: Response) => void;
let teacherASaveSignal: AbortSignal | undefined;
let markTeacherASaveStarted: () => void;
let teacherASaveStarted: Promise<void>;
let putBodies: unknown[];
let savedConfig: PublicConfig;

function Harness() {
  auth = useAuth();
  return <><output data-testid="principal">{auth.session?.email || 'signed-out'}</output><ConfigPanel /></>;
}

async function openSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Cấu hình' }));
  await screen.findByLabelText('Model AI');
}

beforeEach(() => {
  localStorage.clear();
  appQueryClient().clear();
  serverPrincipal = 'A';
  putBodies = [];
  savedConfig = configData('A');
  teacherASaveStarted = new Promise((resolve) => { markTeacherASaveStarted = resolve; });
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(typeof input === 'string' ? `http://local${input}` : input, init);
    const path = new URL(request.url).pathname;
    if (path === '/api/v2/auth/session') return Promise.resolve(sessionResponse('A'));
    if (path === '/api/v2/config' && request.method === 'GET') return Promise.resolve(jsonEnvelope(savedConfig, `config-${serverPrincipal}`));
    if (path === '/api/v2/ai/models') return Promise.resolve(modelsResponse(serverPrincipal));
    if (path === '/api/v2/config' && request.method === 'PUT') {
      return request.json().then((body) => {
        putBodies.push(body);
        teacherASaveSignal = request.signal;
        markTeacherASaveStarted();
        return new Promise<Response>((resolve) => { resolveTeacherASave = resolve; });
      });
    }
    throw new Error(`Unhandled request ${request.method} ${path}`);
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  appQueryClient().clear();
});

describe('ConfigurationForm principal isolation', () => {
  it('aborts and ignores a delayed Teacher A save after Teacher B becomes current', async () => {
    const user = userEvent.setup();
    render(<AppProviders><Harness /></AppProviders>);

    await screen.findByText('teacher-a@example.com');
    await openSettings(user);
    await waitFor(() => expect(screen.getByLabelText('Model AI')).toHaveValue('model-a'));
    const save = screen.getByRole('button', { name: 'Lưu cấu hình' });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);
    await teacherASaveStarted;

    serverPrincipal = 'B';
    savedConfig = configData('B');
    await act(async () => { await auth.acceptSession({ email: 'teacher-b@example.com', tokenExpiry: 2_100_000_000 }); });
    await screen.findByText('teacher-b@example.com');
    await waitFor(() => expect(screen.getByLabelText('Model AI')).toHaveValue('model-b'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu cấu hình' })).toBeEnabled());
    expect(teacherASaveSignal?.aborted).toBe(true);

    resolveTeacherASave(jsonEnvelope(configData('A'), 'config-A'));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(appQueryClient().getQueryData(['configuration'])).toEqual(await jsonEnvelope(configData('B'), 'config-B').json());
    expect(screen.queryByText('Đã lưu cấu hình!')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Model AI')).toHaveValue('model-b');
  });
});

describe('ConfigurationForm persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(typeof input === 'string' ? `http://local${input}` : input, init);
      const path = new URL(request.url).pathname;
      if (path === '/api/v2/auth/session') return Promise.resolve(sessionResponse('A'));
      if (path === '/api/v2/config' && request.method === 'GET') return Promise.resolve(jsonEnvelope(savedConfig, 'config-A'));
      if (path === '/api/v2/ai/models') {
        return Promise.resolve(Response.json({
          success: true,
          requestId: 'models-remote',
          data: {
            source: 'remote',
            cachedAt: null,
            thinkingLevels: ['off', 'low', 'medium', 'high'],
            models: [
              { id: 'claude-opus-4-6-thinking', name: 'claude-opus-4-6-thinking (antigravity)', reasoning: true, thinkingLevels: ['off', 'high'] },
              { id: 'grok-4.6', name: 'grok-4.6 (xai)', reasoning: true, thinkingLevels: ['low', 'medium', 'high'] },
              { id: '__custom__', name: 'Tự nhập tên model', reasoning: true, thinkingLevels: ['off', 'high'] },
            ],
          },
        }));
      }
      if (path === '/api/v2/config' && request.method === 'PUT') {
        return request.json().then((body: Record<string, unknown>) => {
          putBodies.push(body);
          savedConfig = {
            aiModel: String(body.aiModel),
            customModelId: String(body.customModelId || ''),
            thinkingLevel: asThinkingLevel(body.thinkingLevel),
            thinkingLevels: ['off', 'low', 'medium', 'high'],
            commentLength: body.commentLength === 'short' || body.commentLength === 'long' ? body.commentLength : 'medium',
            customPrompt: String(body.customPrompt || ''),
            hasOpenRouterKey: false,
          };
          return jsonEnvelope(savedConfig, 'config-saved');
        });
      }
      throw new Error(`Unhandled request ${request.method} ${path}`);
    }));
  });

  it('shows the saved model even when the remote catalog no longer includes it', async () => {
    savedConfig = {
      ...configData('A'),
      aiModel: 'gpt-5.4',
      commentLength: 'long',
      customPrompt: 'Nhấn mạnh BTVN',
    };
    const user = userEvent.setup();
    render(<AppProviders><Harness /></AppProviders>);
    await screen.findByText('teacher-a@example.com');
    await openSettings(user);
    await waitFor(() => expect(screen.getByLabelText('Model AI')).toHaveValue('gpt-5.4'));
    expect(screen.getByRole('option', { name: 'GPT-5.4' })).toBeInTheDocument();
    expect(screen.getByLabelText('Độ dài nhận xét')).toHaveValue('long');
    expect(screen.getByLabelText('Prompt bổ sung (tùy chọn)')).toHaveValue('Nhấn mạnh BTVN');
  });

  it('saves comment length and extra prompt with the selected model', async () => {
    const user = userEvent.setup();
    savedConfig = { ...configData('A'), aiModel: 'grok-4.6' };
    render(<AppProviders><Harness /></AppProviders>);
    await screen.findByText('teacher-a@example.com');
    await openSettings(user);
    await waitFor(() => expect(screen.getByLabelText('Model AI')).toHaveValue('grok-4.6'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lưu cấu hình' })).toBeEnabled());

    await user.selectOptions(screen.getByLabelText('Độ dài nhận xét'), 'long');
    await user.clear(screen.getByLabelText('Prompt bổ sung (tùy chọn)'));
    await user.type(screen.getByLabelText('Prompt bổ sung (tùy chọn)'), 'Khen nhiều hơn');
    await user.click(screen.getByRole('button', { name: 'Lưu cấu hình' }));

    await screen.findByText('Đã lưu cấu hình!');
    expect(putBodies[0]).toMatchObject({
      aiModel: 'grok-4.6',
      commentLength: 'long',
      customPrompt: 'Khen nhiều hơn',
    });
  });

  it('keeps unsaved comment style when the config panel is collapsed', async () => {
    const user = userEvent.setup();
    savedConfig = { ...configData('A'), aiModel: 'grok-4.6' };
    render(<AppProviders><Harness /></AppProviders>);
    await openSettings(user);
    await waitFor(() => expect(screen.getByLabelText('Model AI')).toHaveValue('grok-4.6'));
    await user.selectOptions(screen.getByLabelText('Độ dài nhận xét'), 'short');
    await user.click(screen.getByRole('button', { name: 'Cấu hình' }));
    expect(screen.getByLabelText('Độ dài nhận xét')).not.toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cấu hình' }));
    expect(screen.getByLabelText('Độ dài nhận xét')).toHaveValue('short');
  });
});

function sessionResponse(principal: 'A' | 'B'): Response {
  return Response.json({ success: true, requestId: `session-${principal}`, data: { authenticated: true, email: principal === 'A' ? 'teacher-a@example.com' : 'teacher-b@example.com', tokenExpiry: 2_100_000_000 } });
}

function configData(principal: 'A' | 'B'): PublicConfig {
  return {
    aiModel: `model-${principal.toLowerCase()}`,
    customModelId: '',
    thinkingLevel: principal === 'A' ? 'high' : 'low',
    thinkingLevels: ['off', 'low', 'high'],
    commentLength: 'medium',
    customPrompt: '',
    hasOpenRouterKey: false,
  };
}

function asThinkingLevel(value: unknown): ThinkingLevel {
  return value === 'off' || value === 'minimal' || value === 'low' || value === 'medium' || value === 'xhigh' ? value : 'high';
}

function jsonEnvelope(data: unknown, requestId: string): Response {
  return Response.json({ success: true, requestId, data });
}

function modelsResponse(principal: 'A' | 'B'): Response {
  return Response.json({
    success: true,
    requestId: `models-${principal}`,
    data: {
      source: 'fallback',
      cachedAt: null,
      thinkingLevels: ['off', 'low', 'high'],
      models: [{ id: `model-${principal.toLowerCase()}`, name: `Model ${principal}`, reasoning: true, thinkingLevels: ['off', 'low', 'high'] }],
    },
  });
}

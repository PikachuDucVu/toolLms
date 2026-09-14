import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigResponseSchema } from '@tool-lms/contracts';
import { app } from '../../src/router';
import type { Env, SessionRecord } from '../../src/types';

const session: SessionRecord = {
  id: 'session-config',
  email: 'teacher@example.com',
  lmsToken: 'token',
  tokenExpiry: 2_000_000_000,
  createdAt: 'now',
  updatedAt: 'now',
};

function configDb() {
  const store = new Map<string, string>();
  return {
    store,
    prepare(sql: string) {
      let bindings: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          bindings = values;
          return this;
        },
        async all<T>() {
          if (sql.includes('FROM app_config')) {
            return { results: [...store.entries()].map(([key, value_json]) => ({ key, value_json })) as T[] };
          }
          return { results: [] as T[] };
        },
        async run() {
          if (sql.includes('INSERT INTO app_config')) store.set(String(bindings[0]), String(bindings[1]));
          return { success: true };
        },
      };
    },
  };
}

function env(db = configDb(), authenticated = true): Env {
  return {
    ASSETS: { fetch: async () => new Response('asset') },
    DB: db,
    SESSION_CACHE: {
      get: async () => (authenticated ? session : null),
      put: async () => undefined,
      delete: async () => undefined,
    },
    TOKEN_CACHE: { get: async () => null, put: async () => undefined },
  } as unknown as Env;
}

function request(path: string, init: RequestInit = {}, currentEnv = env()) {
  const headers = new Headers(init.headers);
  headers.set('cookie', 'lms_session=session-config');
  if (init.method && !['GET', 'HEAD', 'OPTIONS'].includes(init.method) && !headers.has('origin')) headers.set('origin', 'http://local.test');
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return app.request(`http://local.test${path}`, { ...init, headers }, currentEnv);
}

afterEach(() => vi.restoreAllMocks());

describe('v2 config persistence', () => {
  it('stores auto-comment style with the selected model and returns it on reload', async () => {
    const db = configDb();
    const currentEnv = env(db);
    const saved = await request('/api/v2/config', {
      method: 'PUT',
      body: JSON.stringify({
        aiModel: 'grok-4.6',
        customModelId: '',
        thinkingLevel: 'low',
        commentLength: 'long',
        customPrompt: 'Nhấn mạnh BTVN.',
      }),
    }, currentEnv);
    expect(saved.status).toBe(200);
    expect(ConfigResponseSchema.parse(await saved.json()).data).toMatchObject({
      aiModel: 'grok-4.6',
      thinkingLevel: 'low',
      commentLength: 'long',
      customPrompt: 'Nhấn mạnh BTVN.',
    });

    const loaded = await request('/api/v2/config', {}, currentEnv);
    expect(ConfigResponseSchema.parse(await loaded.json()).data).toMatchObject({
      aiModel: 'grok-4.6',
      commentLength: 'long',
      customPrompt: 'Nhấn mạnh BTVN.',
    });
  });

  it('does not blank comment style when a model-only save omits those fields', async () => {
    const db = configDb();
    const currentEnv = env(db);
    await request('/api/v2/config', {
      method: 'PUT',
      body: JSON.stringify({
        aiModel: 'gpt-5.5',
        customModelId: '',
        thinkingLevel: 'high',
        commentLength: 'short',
        customPrompt: 'Giọng thầy.',
      }),
    }, currentEnv);

    const modelOnly = await request('/api/v2/config', {
      method: 'PUT',
      body: JSON.stringify({
        aiModel: 'claude-sonnet-4-6',
        customModelId: '',
        thinkingLevel: 'medium',
      }),
    }, currentEnv);
    expect(ConfigResponseSchema.parse(await modelOnly.json()).data).toMatchObject({
      aiModel: 'claude-sonnet-4-6',
      thinkingLevel: 'medium',
      commentLength: 'short',
      customPrompt: 'Giọng thầy.',
    });
  });
});

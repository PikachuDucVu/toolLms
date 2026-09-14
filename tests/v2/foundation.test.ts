import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { app } from '../../src/router';
import { allowlistedLogFields } from '../../src/observability/structuredLogger';
import { MAX_V2_JSON_BYTES } from '../../src/routes/v2/helpers';
import { processGradingBatch } from '../../src/queues/gradingConsumer';
import type { GradingQueueMessage } from '../../src/types';

function env() {
  return {
    ASSETS: { fetch: () => Promise.resolve(new Response('asset')) },
    DB: {
      prepare() {
        return {
          bind() { return this; },
          first: async () => null,
          all: async () => ({ results: [] }),
          run: async () => ({ success: true }),
        };
      },
    },
    SESSION_CACHE: { get: async () => null, put: async () => undefined, delete: async () => undefined },
    TOKEN_CACHE: { get: async () => null, put: async () => undefined },
  } as any;
}

const localOrigin = 'http://local.test';
const sessionCookie = 'lms_session=session-security';

afterEach(() => vi.restoreAllMocks());

describe('v2 foundation', () => {
  it('correlates success and error responses with a validated request id', async () => {
    const health = await app.request(`${localOrigin}/api/v2/health`, { headers: { 'x-request-id': 'test-request.1' } }, env());
    expect(health.headers.get('x-request-id')).toBe('test-request.1');
    expect(await health.json()).toMatchObject({ success: true, requestId: 'test-request.1' });

    const missing = await app.request(`${localOrigin}/api/v2/missing`, {}, env());
    const body = await missing.json() as any;
    expect(missing.status).toBe(404);
    expect(body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    expect(body.error.requestId).toBe(missing.headers.get('x-request-id'));
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('requires exact same-origin Origin for cookie-authenticated %s requests', async (method) => {
    const path = method === 'POST' ? '/api/v2/auth/logout' : '/api/v2/missing';
    const accepted = await app.request(`${localOrigin}${path}`, {
      method,
      headers: { cookie: sessionCookie, origin: localOrigin },
    }, env());
    expect(accepted.status).not.toBe(403);

    for (const origin of [undefined, 'https://attacker.test', 'not a url', `${localOrigin}/`]) {
      const headers = new Headers({ cookie: sessionCookie });
      if (origin !== undefined) headers.set('origin', origin);
      const rejected = await app.request(`${localOrigin}${path}`, { method, headers }, env());
      expect(rejected.status).toBe(403);
      expect(await rejected.json()).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    }
  });

  it('uses Sec-Fetch-Site as defense-in-depth without weakening the required Origin check', async () => {
    const acceptedWithoutFetchMetadata = await app.request(`${localOrigin}/api/v2/auth/logout`, {
      method: 'POST', headers: { cookie: sessionCookie, origin: localOrigin },
    }, env());
    expect(acceptedWithoutFetchMetadata.status).toBe(200);

    const acceptedSameOrigin = await app.request(`${localOrigin}/api/v2/auth/logout`, {
      method: 'POST', headers: { cookie: sessionCookie, origin: localOrigin, 'sec-fetch-site': 'same-origin' },
    }, env());
    expect(acceptedSameOrigin.status).toBe(200);

    const rejectedCrossSite = await app.request(`${localOrigin}/api/v2/auth/logout`, {
      method: 'POST', headers: { cookie: sessionCookie, origin: localOrigin, 'sec-fetch-site': 'cross-site' },
    }, env());
    expect(rejectedCrossSite.status).toBe(403);

    const rejectedMissingOrigin = await app.request(`${localOrigin}/api/v2/auth/logout`, {
      method: 'POST', headers: { cookie: sessionCookie, 'sec-fetch-site': 'same-origin' },
    }, env());
    expect(rejectedMissingOrigin.status).toBe(403);
  });

  it('logs the matched route template instead of ordinary opaque path IDs', async () => {
    const opaqueId = 'class-opaque-7f83ab21';
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const response = await app.request(`${localOrigin}/api/v2/classes/${opaqueId}`, {}, env());
    expect(response.status).toBe(401);
    const completion = log.mock.calls.map(([entry]) => JSON.parse(String(entry)) as Record<string, unknown>)
      .find((entry) => entry.category === 'auth');
    expect(completion?.route).toEqual(expect.stringContaining(':classId'));
    expect(JSON.stringify(completion)).not.toContain(opaqueId);
  });

  it('keeps safe methods and unauthenticated same-origin login behavior compatible', async () => {
    const safe = await app.request(`${localOrigin}/api/v2/health`, {
      method: 'GET', headers: { cookie: sessionCookie, origin: 'https://attacker.test', 'sec-fetch-site': 'cross-site' },
    }, env());
    expect(safe.status).toBe(200);

    const publicLogin = await app.request(`${localOrigin}/api/v2/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    }, env());
    expect(publicLogin.status).toBe(422);
  });

  it('rejects oversized declared and streamed bodies before JSON parsing', async () => {
    const declared = await app.request(`${localOrigin}/api/v2/auth/login`, {
      method: 'POST',
      headers: { origin: localOrigin, 'content-type': 'application/json', 'content-length': String(MAX_V2_JSON_BYTES + 1) },
      body: '{}',
    }, env());
    expect(declared.status).toBe(413);

    const oversized = `${JSON.stringify({ padding: 'é'.repeat(Math.ceil(MAX_V2_JSON_BYTES / 2)) })}`;
    expect(new TextEncoder().encode(oversized).byteLength).toBeGreaterThan(MAX_V2_JSON_BYTES);
    const streamed = await streamedRequest(oversized, 16_384);
    expect(streamed.status).toBe(413);
    expect(await streamed.json()).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });
  });

  it('distinguishes missing/malformed/rejected/locked bodies, schema validation, exact limit, and multibyte byte limits', async () => {
    const missing = await app.request(`${localOrigin}/api/v2/auth/login`, {
      method: 'POST', headers: { origin: localOrigin, 'content-type': 'application/json' },
    }, env());
    expect(missing.status).toBe(400);

    const malformed = await app.request(`${localOrigin}/api/v2/auth/login`, {
      method: 'POST', headers: { origin: localOrigin, 'content-type': 'application/json' }, body: '{bad',
    }, env());
    expect(malformed.status).toBe(400);

    const rejected = new Request(`${localOrigin}/api/v2/auth/login`, {
      method: 'POST', headers: { origin: localOrigin, 'content-type': 'application/json' },
      body: new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error('private stream failure')); } }),
      duplex: 'half',
    } as RequestInit);
    expect((await app.fetch(rejected, env())).status).toBe(400);

    const locked = new Request(`${localOrigin}/api/v2/auth/login`, {
      method: 'POST', headers: { origin: localOrigin, 'content-type': 'application/json' }, body: '{}',
    });
    const lockedReader = locked.body!.getReader();
    expect((await app.fetch(locked, env())).status).toBe(400);
    lockedReader.releaseLock();

    const nearLimit = '{}'.padEnd(MAX_V2_JSON_BYTES - 1, ' ');
    const exactLimit = '{}'.padEnd(MAX_V2_JSON_BYTES, ' ');
    expect((await streamedRequest(nearLimit, 8_191)).status).toBe(422);
    expect((await streamedRequest(exactLimit, 8_191)).status).toBe(422);

    const multibyteExact = exactMultibyteJson(MAX_V2_JSON_BYTES);
    expect(multibyteExact.length).toBeLessThan(MAX_V2_JSON_BYTES);
    expect(new TextEncoder().encode(multibyteExact).byteLength).toBe(MAX_V2_JSON_BYTES);
    expect((await streamedRequest(multibyteExact, 7_777)).status).toBe(422);
  });

  it('never exposes stored secrets from public config', async () => {
    const response = await app.request(`${localOrigin}/api/v2/config`, {}, env());
    const body = await response.json() as any;
    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({ aiModel: 'gpt-5.4', hasOpenRouterKey: false });
    expect(JSON.stringify(body)).not.toContain('openrouter_key');
  });

  it('uses allowlisted structured logs and keeps upstream tokens, PII, and raw messages out of responses and logs', async () => {
    const token = 'sk-or-v1-super-secret-token';
    const pii = 'teacher.private@example.com';
    const raw = `Upstream rejected ${pii} with ${token} and private comment`;
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error(raw));

    const response = await app.request(`${localOrigin}/api/v2/auth/login`, {
      method: 'POST',
      headers: { origin: localOrigin, 'content-type': 'application/json' },
      body: JSON.stringify({ email: pii, password: token }),
    }, env());
    const responseText = await response.text();
    expect(response.status).toBe(502);
    expect(responseText).toContain('Dịch vụ bên ngoài tạm thời không khả dụng');
    expect(responseText).not.toContain(token);
    expect(responseText).not.toContain(pii);
    expect(responseText).not.toContain(raw);

    const logged = [...log.mock.calls, ...errorLog.mock.calls].flat().join(' ');
    expect(logged).not.toContain(token);
    expect(logged).not.toContain(pii);
    expect(logged).not.toContain(raw);
    for (const call of [...log.mock.calls, ...errorLog.mock.calls]) {
      const parsed = JSON.parse(String(call[0])) as Record<string, unknown>;
      expect(Object.keys(parsed).every((key) => ['requestId', 'route', 'method', 'status', 'duration', 'category', 'jobId', 'itemId', 'fromStatus', 'toStatus'].includes(key))).toBe(true);
    }

    expect(allowlistedLogFields({ requestId: token, route: `/api/v2/classes/${encodeURIComponent(pii)}`, email: pii, body: { password: token }, category: 'test' }))
      .toEqual({ requestId: '[REDACTED]', route: '[REDACTED]', category: 'test' });
  });

  it('does not log raw invalid queue bodies or processing errors', async () => {
    const secret = 'student@example.com private-note sk-ant-secret';
    const infoLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const invalidAck = vi.fn();
    const processingAck = vi.fn();
    const retry = vi.fn();
    const currentEnv = env();
    currentEnv.DB = {
      prepare(sql: string) {
        return {
          bind() { return this; },
          first: async () => sql.startsWith('SELECT status') ? { status: 'queued' } : null,
          run: async () => { throw new Error(secret); },
        };
      },
    };
    await processGradingBatch({
      messages: [
        { body: { token: secret }, ack: invalidAck, retry: vi.fn() },
        { body: { ...queueBase, apiKey: secret, studentName: secret }, ack: processingAck, retry },
      ],
    } as unknown as MessageBatch<GradingQueueMessage>, currentEnv);
    const logged = [...infoLog.mock.calls, ...errorLog.mock.calls].flat().join(' ');
    expect(logged).not.toContain(secret);
    expect(invalidAck).toHaveBeenCalledOnce();
    expect(processingAck).not.toHaveBeenCalled();
    expect(retry).toHaveBeenCalledOnce();
  });
});

describe('grading queue rollback compatibility', () => {
  const frozenLegacyDecoder = z.object({
    jobId: z.string(), itemId: z.string(), sessionId: z.string(), classId: z.string(),
    submission: z.object({ id: z.string() }).passthrough(), studentName: z.string(), lessonName: z.string(),
  });
  const base = {
    jobId: 'job', itemId: 'item', sessionId: 'session', classId: 'class',
    submission: { id: 'submission' }, studentName: 'Student', lessonName: 'Lesson',
  };

  it('new consumer type accepts legacy messages and old decoder accepts new messages', () => {
    const legacy: GradingQueueMessage = base;
    const current: GradingQueueMessage = { ...base, version: 1 };
    expect(legacy.version).toBeUndefined();
    expect(frozenLegacyDecoder.parse(current)).toEqual(base);
  });
});

const queueBase = {
  version: 1,
  jobId: 'job-safe',
  itemId: 'item-safe',
  sessionId: 'session-safe',
  classId: 'class-safe',
  submission: { id: 'submission-safe' },
  studentName: 'Student',
  lessonName: 'Lesson',
};

async function streamedRequest(text: string, chunkSize: number): Promise<Response> {
  const bytes = new TextEncoder().encode(text);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) controller.enqueue(bytes.slice(offset, offset + chunkSize));
      controller.close();
    },
  });
  const request = new Request(`${localOrigin}/api/v2/auth/login`, {
    method: 'POST',
    headers: { origin: localOrigin, 'content-type': 'application/json' },
    body: stream,
    duplex: 'half',
  } as RequestInit);
  return app.fetch(request, env());
}

function exactMultibyteJson(byteLength: number): string {
  const prefix = '{"padding":"';
  const suffix = '"}';
  const fixedBytes = new TextEncoder().encode(prefix + suffix).byteLength;
  const multibyteCount = Math.floor((byteLength - fixedBytes) / 2);
  const json = `${prefix}${'é'.repeat(multibyteCount)}${suffix}`;
  return json.padEnd(json.length + (byteLength - new TextEncoder().encode(json).byteLength), ' ');
}

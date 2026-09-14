import type { Context } from 'hono';
import type { z } from 'zod';
import type { ApiErrorCode } from '@tool-lms/contracts';
import type { Env, SessionRecord } from '../../types';
import type { RequestContextVariables } from '../../middleware/requestContext';
import { getSessionFromRequest } from '../../services/sessionService';

export const MAX_V2_JSON_BYTES = 256 * 1024;

type V2Context = Context<{ Bindings: Env; Variables: RequestContextVariables }>;
type V2ErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 422 | 500 | 502 | 504;

const PUBLIC_ERROR_MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  AUTH_REQUIRED: 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.',
  UPSTREAM_ERROR: 'Dịch vụ bên ngoài tạm thời không khả dụng. Vui lòng thử lại.',
  INTERNAL_ERROR: 'Đã xảy ra lỗi máy chủ.',
};

const ERROR_CATEGORIES: Record<ApiErrorCode, string> = {
  AUTH_REQUIRED: 'auth',
  VALIDATION_ERROR: 'validation',
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  UPSTREAM_ERROR: 'upstream',
  API_KEY_REQUIRED: 'api_key_required',
  INTERNAL_ERROR: 'internal',
};

export function requestId(c: V2Context): string {
  return c.get('requestId') || crypto.randomUUID();
}

export function v2Success<T>(c: V2Context, data: T, status: 200 | 201 = 200) {
  return c.json({ success: true as const, data, requestId: requestId(c) }, status);
}

export function v2Error(c: V2Context, code: ApiErrorCode, message: string, status: V2ErrorStatus, details?: unknown) {
  c.set('errorCategory', ERROR_CATEGORIES[code]);
  const safeMessage = PUBLIC_ERROR_MESSAGES[code] || message;
  const safeDetails = publicErrorDetails(code, details);
  return c.json({
    success: false as const,
    error: {
      code,
      message: safeMessage,
      requestId: requestId(c),
      ...(safeDetails === undefined ? {} : { details: safeDetails }),
    },
  }, status);
}

export async function parseV2Json<T>(c: V2Context, schema: z.ZodType<T>): Promise<T | Response> {
  const declaredLength = c.req.header('content-length');
  if (declaredLength && /^\d+$/.test(declaredLength) && BigInt(declaredLength) > BigInt(MAX_V2_JSON_BYTES)) {
    return v2Error(c, 'VALIDATION_ERROR', 'Nội dung yêu cầu quá lớn.', 413);
  }

  let body: unknown;
  try {
    const bytes = await readBoundedBody(c.req.raw.body, MAX_V2_JSON_BYTES);
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return v2Error(c, 'VALIDATION_ERROR', 'Nội dung yêu cầu quá lớn.', 413);
    }
    return v2Error(c, 'VALIDATION_ERROR', 'JSON không hợp lệ.', 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return v2Error(c, 'VALIDATION_ERROR', 'Dữ liệu yêu cầu không hợp lệ.', 422, parsed.error.flatten());
  return parsed.data;
}

export async function requireV2Session(c: V2Context): Promise<SessionRecord | Response> {
  const session = await getSessionFromRequest(c.env, c.req.raw);
  if (!session) return v2Error(c, 'AUTH_REQUIRED', 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.', 401);
  return session;
}

class BodyTooLargeError extends Error {}

async function readBoundedBody(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Uint8Array> {
  if (!body) return new Uint8Array();
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new BodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return combined;
}

function publicErrorDetails(code: ApiErrorCode, details: unknown): unknown {
  if (details === undefined || code === 'AUTH_REQUIRED' || code === 'INTERNAL_ERROR') return undefined;
  if (code !== 'UPSTREAM_ERROR') return details;
  if (!details || typeof details !== 'object' || Array.isArray(details)) return undefined;
  const source = details as Record<string, unknown>;
  const safeEntries: Array<[string, string | number]> = [];
  if (source.reason === 'GRADING_QUEUE_UNAVAILABLE') safeEntries.push(['reason', source.reason]);
  if (typeof source.jobId === 'string' && /^[A-Za-z0-9._:-]{1,200}$/.test(source.jobId)) safeEntries.push(['jobId', source.jobId]);
  for (const key of ['enqueuedItems', 'failedItems', 'totalItems'] as const) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) safeEntries.push([key, value]);
  }
  const safe = Object.fromEntries(safeEntries);
  return Object.keys(safe).length ? safe : undefined;
}

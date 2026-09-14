import { createMiddleware } from 'hono/factory';
import type { Env } from '../types';
import type { RequestContextVariables } from './requestContext';
import { SESSION_COOKIE } from '../services/sessionService';
import { v2Error } from '../routes/v2/helpers';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const v2Security = createMiddleware<{ Bindings: Env; Variables: RequestContextVariables }>(async (c, next) => {
  if (!SAFE_METHODS.has(c.req.method)) {
    const origin = c.req.header('origin');
    const hasSessionCookie = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=`).test(c.req.header('cookie') || '');

    if (!origin && hasSessionCookie) {
      return v2Error(c, 'VALIDATION_ERROR', 'Yêu cầu phải có nguồn hợp lệ.', 403);
    }
    if (origin && !isExactSameOrigin(origin, c.req.url)) {
      return v2Error(c, 'VALIDATION_ERROR', 'Yêu cầu khác nguồn không được phép.', 403);
    }

    const fetchSite = c.req.header('sec-fetch-site');
    if (fetchSite !== undefined && fetchSite !== 'same-origin') {
      return v2Error(c, 'VALIDATION_ERROR', 'Yêu cầu khác nguồn không được phép.', 403);
    }
  }
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'same-origin');
  c.header('Cache-Control', 'no-store');
});

function isExactSameOrigin(origin: string, requestUrl: string): boolean {
  try {
    const parsed = new URL(origin);
    return parsed.origin === origin && parsed.origin === new URL(requestUrl).origin;
  } catch {
    return false;
  }
}

const SENSITIVE_KEYS = /password|api.?key|token|comment|note|email/i;
export function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSensitive);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEYS.test(key) ? '[REDACTED]' : redactSensitive(item)]));
  }
  return value;
}

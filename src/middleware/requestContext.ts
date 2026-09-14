import { createMiddleware } from 'hono/factory';
import type { Env } from '../types';
import { matchedRouteTemplate, structuredLog } from '../observability/structuredLogger';

export type RequestContextVariables = { requestId: string; errorCategory?: string };

export const requestContext = createMiddleware<{ Bindings: Env; Variables: RequestContextVariables }>(async (c, next) => {
  const incoming = c.req.header('x-request-id');
  const requestId = incoming && /^[A-Za-z0-9._:-]{1,128}$/.test(incoming) ? incoming : crypto.randomUUID();
  c.set('requestId', requestId);
  const started = Date.now();
  try {
    await next();
  } finally {
    c.header('X-Request-ID', requestId);
    structuredLog('info', {
      requestId,
      route: matchedRouteTemplate(c),
      method: c.req.method,
      status: c.res.status,
      duration: Date.now() - started,
      category: c.get('errorCategory') || 'success',
    });
  }
});

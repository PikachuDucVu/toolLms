import { Hono } from 'hono';
import { LoginRequestSchema } from '@tool-lms/contracts';
import type { Env } from '../../types';
import type { RequestContextVariables } from '../../middleware/requestContext';
import { loginWithCredentials, refreshActiveSession } from '../../services/authService';
import { decodeJwtName } from '../../services/lmsClient';
import {
  buildExpiredSessionCookie,
  buildSessionCookie,
  destroySession,
} from '../../services/sessionService';
import { parseV2Json, requireV2Session, v2Error, v2Success } from './helpers';

export const v2AuthRoutes = new Hono<{ Bindings: Env; Variables: RequestContextVariables }>();

v2AuthRoutes.post('/login', async (c) => {
  const body = await parseV2Json(c, LoginRequestSchema);
  if (body instanceof Response) return body;
  try {
    const session = await loginWithCredentials(c.env, c.req.raw, body);
    c.header('Set-Cookie', buildSessionCookie(c.req.raw, session.id));
    const displayName = session.displayName || decodeJwtName(session.lmsToken) || session.email.split('@')[0];
    return v2Success(c, {
      authenticated: true as const,
      email: session.email,
      tokenExpiry: session.tokenExpiry,
      displayName,
    });
  } catch (error) {
    return v2Error(c, 'UPSTREAM_ERROR', error instanceof Error ? error.message : 'Không thể đăng nhập LMS.', 502);
  }
});

v2AuthRoutes.get('/session', async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) {
    c.header('Set-Cookie', buildExpiredSessionCookie(c.req.raw));
    return session;
  }
  try {
    const activeSession = await refreshActiveSession(c.env, session);
    c.header('Set-Cookie', buildSessionCookie(c.req.raw, activeSession.id));
    const displayName = activeSession.displayName || decodeJwtName(activeSession.lmsToken) || activeSession.email.split('@')[0];
    return v2Success(c, {
      authenticated: true as const,
      email: activeSession.email,
      tokenExpiry: activeSession.tokenExpiry,
      displayName,
    });
  } catch {
    await destroySession(c.env, c.req.raw);
    c.header('Set-Cookie', buildExpiredSessionCookie(c.req.raw));
    return v2Error(c, 'AUTH_REQUIRED', 'Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.', 401);
  }
});

v2AuthRoutes.post('/logout', async (c) => {
  await destroySession(c.env, c.req.raw);
  c.header('Set-Cookie', buildExpiredSessionCookie(c.req.raw));
  return v2Success(c, { loggedOut: true as const });
});

import type { Context } from "hono";
import type { Env, SessionRecord } from "../types";
import {
  buildExpiredSessionCookie,
  buildSessionCookie,
  getSessionFromRequest,
  saveSession,
} from "../services/sessionService";

export type AppContext = Context<{ Bindings: Env }>;

export function authRequiredResponse(c: AppContext): Response {
  c.header("Set-Cookie", buildExpiredSessionCookie(c.req.raw));
  return c.json(
    { success: false, code: "AUTH_REQUIRED", error: "Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại." },
    { status: 401 },
  );
}

export async function requireSession(c: AppContext): Promise<SessionRecord | Response> {
  const session = await getSessionFromRequest(c.env, c.req.raw);
  if (!session) return authRequiredResponse(c);
  return session;
}

export async function saveUpdatedSession(c: AppContext, original: SessionRecord, updated: SessionRecord): Promise<void> {
  const activeSession = JSON.stringify(original) === JSON.stringify(updated) ? original : updated;
  await saveSession(c.env, activeSession);
  c.header("Set-Cookie", buildSessionCookie(c.req.raw, activeSession.id));
}

export async function readJsonBody<T extends Record<string, unknown>>(c: AppContext): Promise<T> {
  try {
    const parsed = await c.req.json<unknown>();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {} as T;
    return parsed as T;
  } catch {
    return {} as T;
  }
}

import type { Context } from "hono";
import type { Env, SessionRecord } from "../types";
import { getSessionFromRequest, saveSession } from "../services/sessionService";

export type AppContext = Context<{ Bindings: Env }>;

export async function requireSession(c: AppContext): Promise<SessionRecord | Response> {
  const session = await getSessionFromRequest(c.env, c.req.raw);
  if (!session) return c.json({ success: false, error: "Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại." }, { status: 401 });
  return session;
}

export async function saveUpdatedSession(env: Env, original: SessionRecord, updated: SessionRecord): Promise<void> {
  if (JSON.stringify(original) !== JSON.stringify(updated)) await saveSession(env, updated);
}

export async function readJsonBody<T extends Record<string, unknown>>(c: AppContext): Promise<T> {
  try {
    return (await c.req.json()) as T;
  } catch {
    return {} as T;
  }
}

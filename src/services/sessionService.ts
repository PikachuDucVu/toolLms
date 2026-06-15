import type { Env, SessionRecord } from "../types";

export const SESSION_COOKIE = "lms_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function randomHex(bytes = 32): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return Array.from(data, (value) => value.toString(16).padStart(2, "0")).join("");
}

function cookieParts(request: Request): string[] {
  return request.headers.get("Cookie")?.split(";").map((part) => part.trim()) ?? [];
}

export function getCookie(request: Request, name: string): string | null {
  const prefix = `${name}=`;
  const found = cookieParts(request).find((part) => part.startsWith(prefix));
  return found ? decodeURIComponent(found.slice(prefix.length)) : null;
}

function isHttpsRequest(request: Request): boolean {
  const url = new URL(request.url);
  return url.protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
}

export function buildSessionCookie(request: Request, sessionId: string): string {
  const secure = isHttpsRequest(request) ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Max-Age=${SESSION_TTL_SECONDS}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export function buildExpiredSessionCookie(request: Request): string {
  const secure = isHttpsRequest(request) ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export async function createSession(
  env: Env,
  data: Omit<SessionRecord, "id" | "createdAt" | "updatedAt">,
): Promise<SessionRecord> {
  const now = new Date().toISOString();
  const session: SessionRecord = {
    ...data,
    id: randomHex(),
    createdAt: now,
    updatedAt: now,
  };
  await saveSession(env, session);
  return session;
}

export async function saveSession(env: Env, session: SessionRecord): Promise<void> {
  const updated: SessionRecord = { ...session, updatedAt: new Date().toISOString() };
  await env.SESSION_CACHE.put(`session:${updated.id}`, JSON.stringify(updated), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
}

export async function getSessionById(env: Env, sessionId: string | null): Promise<SessionRecord | null> {
  if (!sessionId) return null;
  return env.SESSION_CACHE.get<SessionRecord>(`session:${sessionId}`, "json");
}

export async function getSessionFromRequest(env: Env, request: Request): Promise<SessionRecord | null> {
  return getSessionById(env, getCookie(request, SESSION_COOKIE));
}

export async function destroySession(env: Env, request: Request): Promise<void> {
  const sessionId = getCookie(request, SESSION_COOKIE);
  if (sessionId) await env.SESSION_CACHE.delete(`session:${sessionId}`);
}

import { Hono } from "hono";
import type { Env } from "../types";
import { getConfig, saveConfig } from "../services/configService";
import { LmsClient } from "../services/lmsClient";
import {
  buildExpiredSessionCookie,
  buildSessionCookie,
  createSession,
  destroySession,
  getSessionFromRequest,
} from "../services/sessionService";
import { readJsonBody } from "./helpers";

export const authRoutes = new Hono<{ Bindings: Env }>();

async function loginHandler(c: any) {
  const data = await readJsonBody<{ email?: string; password?: string; firebase_key?: string }>(c);
  const email = (data.email || "").trim();
  const password = data.password || "";
  if (!email || !password) return c.json({ success: false, error: "Email and password required" }, { status: 400 });

  const config = await getConfig(c.env);
  const firebaseKey = data.firebase_key || String(config.firebase_key || "") || undefined;
  if (data.firebase_key) await saveConfig(c.env, { firebase_key: data.firebase_key });

  try {
    const login = await new LmsClient(c.env).login(email, password, firebaseKey);
    const session = await createSession(c.env, {
      email: login.email,
      firebaseToken: login.firebaseToken,
      firebaseKey,
      lmsToken: login.lmsToken,
      refreshToken: login.refreshToken,
      tokenExpiry: login.tokenExpiry,
    });
    c.header("Set-Cookie", buildSessionCookie(c.req.raw, session.id));
    return c.json({ success: true, message: "Đăng nhập thành công!", token_expiry: session.tokenExpiry });
  } catch (error) {
    return c.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

authRoutes.post("/auth/login", loginHandler);
authRoutes.post("/login", loginHandler);

authRoutes.get("/auth/me", async (c) => {
  const session = await getSessionFromRequest(c.env, c.req.raw);
  if (!session) return c.json({ authenticated: false }, { status: 401 });
  return c.json({ authenticated: true, email: session.email, token_expiry: session.tokenExpiry });
});

authRoutes.post("/auth/logout", async (c) => {
  await destroySession(c.env, c.req.raw);
  c.header("Set-Cookie", buildExpiredSessionCookie(c.req.raw));
  return c.json({ success: true });
});

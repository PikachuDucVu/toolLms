import { Hono } from "hono";
import { AI_MODELS } from "./constants/aiModels";
import { LmsAuthenticationError } from "./services/lmsClient";
import { buildExpiredSessionCookie, destroySession } from "./services/sessionService";
import type { Env } from "./types";
import { assessmentsRoutes } from "./routes/assessments";
import { authRoutes } from "./routes/auth";
import { classesRoutes } from "./routes/classes";
import { commentsRoutes } from "./routes/comments";
import { configRoutes } from "./routes/config";
import { healthRoutes } from "./routes/health";
import { homeworkRoutes } from "./routes/homework";
import { v2Routes } from "./routes/v2";

export const app = new Hono<{ Bindings: Env }>();

app.onError(async (error, c) => {
  if (error instanceof LmsAuthenticationError) {
    await destroySession(c.env, c.req.raw);
    c.header("Set-Cookie", buildExpiredSessionCookie(c.req.raw));
    return c.json(
      { success: false, code: "AUTH_REQUIRED", error: "Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại." },
      { status: 401 },
    );
  }
  return c.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
});

app.route("/api", healthRoutes);
app.route("/api", assessmentsRoutes);
app.route("/api", authRoutes);
app.route("/api", configRoutes);
app.route("/api", commentsRoutes);
app.route("/api", classesRoutes);
app.route("/api", homeworkRoutes);
app.route("/api/v2", v2Routes);
app.all("/api/v2/*", (c) => {
  const existing = (c as any).get?.("requestId") || c.res.headers.get("x-request-id");
  const incoming = c.req.header("x-request-id");
  const requestId = existing || (incoming && /^[A-Za-z0-9._:-]{1,128}$/.test(incoming) ? incoming : crypto.randomUUID());
  c.header("X-Request-ID", requestId);
  return c.json({ success: false, error: { code: "NOT_FOUND", message: "Không tìm thấy API.", requestId } }, { status: 404 });
});

async function assetRequest(c: any, pathname: string): Promise<Response> {
  const url = new URL(c.req.url);
  url.pathname = pathname;
  return c.env.ASSETS.fetch(new Request(url, c.req.raw));
}

function withDocumentHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "same-origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

const reactDocumentRoutes = [
  "/",
  "/homework",
  "/homework/",
  "/new",
  "/new/",
  "/new/homework",
  "/new/homework/",
] as const;
for (const route of reactDocumentRoutes) {
  app.get(route, async (c) => withDocumentHeaders(await assetRequest(c, "/new/index.html")));
}

app.get("/index.html", (c) => c.redirect("/", 301));
app.get("/homework.html", (c) => c.redirect("/homework", 301));

app.get("*", async (c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ success: false, error: "Not found" }, { status: 404 });
  return c.env.ASSETS.fetch(c.req.raw);
});

export { AI_MODELS };

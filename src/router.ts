import { Hono } from "hono";
import { AI_MODELS } from "./constants/aiModels";
import type { Env } from "./types";
import { authRoutes } from "./routes/auth";
import { classesRoutes } from "./routes/classes";
import { commentsRoutes } from "./routes/comments";
import { configRoutes } from "./routes/config";
import { healthRoutes } from "./routes/health";
import { homeworkRoutes } from "./routes/homework";
import { notesRoutes } from "./routes/notes";

export const app = new Hono<{ Bindings: Env }>();

app.onError((error, c) => c.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 }));

app.route("/api", healthRoutes);
app.route("/api", authRoutes);
app.route("/api", configRoutes);
app.route("/api", notesRoutes);
app.route("/api", commentsRoutes);
app.route("/api", classesRoutes);
app.route("/api", homeworkRoutes);

function assetRequest(c: any, pathname: string): Promise<Response> {
  const url = new URL(c.req.url);
  url.pathname = pathname;
  return c.env.ASSETS.fetch(new Request(url, c.req.raw));
}

app.get("/", (c) => assetRequest(c, "/index.html"));
app.get("/homework", (c) => assetRequest(c, "/homework.html"));
app.get("/homework/", (c) => assetRequest(c, "/homework.html"));

app.get("*", async (c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ success: false, error: "Not found" }, { status: 404 });
  return c.env.ASSETS.fetch(c.req.raw);
});

export { AI_MODELS };

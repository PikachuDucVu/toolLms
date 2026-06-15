import { Hono } from "hono";
import type { Env } from "../types";

export const healthRoutes = new Hono<{ Bindings: Env }>();

healthRoutes.get("/health", (c) =>
  c.json({
    ok: true,
    runtime: "cloudflare-worker",
    bindings: {
      db: Boolean(c.env.DB),
      sessionCache: Boolean(c.env.SESSION_CACHE),
      tokenCache: Boolean(c.env.TOKEN_CACHE),
      attachments: Boolean(c.env.ATTACHMENTS),
      gradingQueue: Boolean(c.env.GRADING_QUEUE),
      assets: Boolean(c.env.ASSETS),
    },
  }),
);

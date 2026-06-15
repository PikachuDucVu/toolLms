import { Hono } from "hono";
import { ALLOWED_LMS_OPERATIONS, GET_CLASSES_QUERY, GET_CLASS_DETAIL_QUERY } from "../constants/lmsQueries";
import type { Env } from "../types";
import { LmsClient } from "../services/lmsClient";
import { requireSession, readJsonBody, saveUpdatedSession } from "./helpers";

export const classesRoutes = new Hono<{ Bindings: Env }>();

function orderClasses(classes: any[]): any[] {
  const twoMonthsAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
  const running: any[] = [];
  const recentlyEnded: any[] = [];
  for (const cls of classes) {
    if (cls.status === "RUNNING") running.push(cls);
    else if (cls.status === "FINISHED" && cls.endDate) {
      const end = Date.parse(cls.endDate);
      if (Number.isFinite(end) && end >= twoMonthsAgo) recentlyEnded.push({ ...cls, recentlyEnded: true });
    }
  }
  recentlyEnded.sort((a, b) => String(b.endDate || "").localeCompare(String(a.endDate || "")));
  return [...running, ...recentlyEnded];
}

classesRoutes.get("/classes", async (c) => {
  const session = await requireSession(c);
  if (session instanceof Response) return session;
  const result = await new LmsClient(c.env).callApi(session, "GetClasses", GET_CLASSES_QUERY, {
    pageIndex: 0,
    itemsPerPage: 50,
    statusIn: ["RUNNING", "FINISHED"],
  });
  await saveUpdatedSession(c.env, session, result.session);
  if (result.body.error) return c.json({ error: result.body.error }, { status: 401 });
  if (result.body.errors?.length) return c.json({ error: result.body.errors[0]?.message || "Unknown error" }, { status: 400 });
  const classes = (result.body.data as any)?.classes?.data ?? [];
  return c.json({ classes: orderClasses(classes) });
});

classesRoutes.get("/class/:classId", async (c) => {
  const session = await requireSession(c);
  if (session instanceof Response) return session;
  const result = await new LmsClient(c.env).callApi(session, "GetClassById", GET_CLASS_DETAIL_QUERY, { id: c.req.param("classId") });
  await saveUpdatedSession(c.env, session, result.session);
  if (result.body.error) return c.json({ error: result.body.error }, { status: 401 });
  if (result.body.errors?.length) return c.json({ error: result.body.errors[0]?.message || "Unknown error" }, { status: 400 });
  return c.json({ class: (result.body.data as any)?.classesById ?? {} });
});

classesRoutes.post("/lms/graphql", async (c) => {
  const session = await requireSession(c);
  if (session instanceof Response) return session;
  const body = await readJsonBody<{ operationName?: string; query?: string; variables?: Record<string, unknown> }>(c);
  const operationName = body.operationName || "";
  if (!ALLOWED_LMS_OPERATIONS.has(operationName)) return c.json({ errors: [{ message: "Operation not allowed" }] }, { status: 403 });
  if (!body.query) return c.json({ errors: [{ message: "Missing query" }] }, { status: 400 });
  const result = await new LmsClient(c.env).callApi(session, operationName, body.query, body.variables || {});
  await saveUpdatedSession(c.env, session, result.session);
  return c.json(result.body);
});

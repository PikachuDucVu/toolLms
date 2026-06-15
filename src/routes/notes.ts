import { Hono } from "hono";
import type { Env } from "../types";
import { addStudentNote, getNotes } from "../services/notesService";
import { readJsonBody } from "./helpers";

export const notesRoutes = new Hono<{ Bindings: Env }>();

notesRoutes.get("/notes", async (c) => c.json(await getNotes(c.env)));

notesRoutes.post("/notes/:studentId", async (c) => {
  const studentId = c.req.param("studentId");
  const body = await readJsonBody<{ note?: string }>(c);
  if (!body.note) return c.json({ success: false, error: "Missing note" }, { status: 400 });
  await addStudentNote(c.env, studentId, body.note);
  return c.json({ success: true });
});

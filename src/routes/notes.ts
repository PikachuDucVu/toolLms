import { Hono } from "hono";
import type { Env } from "../types";
import { addStudentNote, getNotes } from "../services/notesService";
import { requireSession, readJsonBody } from "./helpers";

export const notesRoutes = new Hono<{ Bindings: Env }>();

const MAX_STUDENT_ID_LENGTH = 200;
const MAX_NOTE_LENGTH = 4000;

notesRoutes.get("/notes", async (c) => {
  const session = await requireSession(c);
  if (session instanceof Response) return session;
  return c.json(await getNotes(c.env));
});

notesRoutes.post("/notes/:studentId", async (c) => {
  const session = await requireSession(c);
  if (session instanceof Response) return session;

  const studentId = c.req.param("studentId").trim();
  const body = await readJsonBody<{ note?: unknown }>(c);
  if (!studentId || studentId.length > MAX_STUDENT_ID_LENGTH) {
    return c.json({ success: false, error: "Invalid student id" }, { status: 400 });
  }
  if (typeof body.note !== "string" || body.note.length > MAX_NOTE_LENGTH) {
    return c.json({ success: false, error: "Invalid note" }, { status: 400 });
  }

  await addStudentNote(c.env, studentId, body.note);
  return c.json({ success: true });
});

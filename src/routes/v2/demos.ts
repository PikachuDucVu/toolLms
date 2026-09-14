import { Hono, type Context } from "hono";
import { DemoRandomPreviewRequestSchema, DemoSubmitRequestSchema, EntityIdSchema } from "@tool-lms/contracts";
import type { Env } from "../../types";
import type { RequestContextVariables } from "../../middleware/requestContext";
import {
  CommentContextInvalidError,
  CommentContextNotFoundError,
  CommentUpstreamError,
  loadRegularSlotContext,
} from "../../services/commentSubmissionService";
import { buildDemoRandomPreview, resolveDemoSchema, submitDemo } from "../../services/demoSubmissionService";
import { LmsClient } from "../../services/lmsClient";
import { saveSession } from "../../services/sessionService";
import { parseV2Json, requireV2Session, v2Error, v2Success } from "./helpers";

interface Bindings { Bindings: Env; Variables: RequestContextVariables }
type V2Context = Context<Bindings>;

export const v2DemoSlotRoutes = new Hono<Bindings>();

v2DemoSlotRoutes.get("/:slotId/demo", async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;
  const slotId = pathId(c, "slotId");
  if (slotId instanceof Response) return slotId;
  const classId = EntityIdSchema.safeParse(c.req.query("classId"));
  if (!classId.success) return v2Error(c, "VALIDATION_ERROR", "Mã lớp không hợp lệ.", 422, classId.error.flatten());
  try {
    const loaded = await loadRegularSlotContext(new LmsClient(c.env), session, { classId: classId.data, slotId });
    if (loaded.context.sessionNumber !== 14) throw new CommentContextInvalidError("Buổi học này không phải buổi Demo cuối khóa.");
    await saveSession(c.env, loaded.session);
    return v2Success(c, { schema: resolveDemoSchema(loaded.context.classDetail) });
  } catch (error) {
    return demoError(c, error);
  }
});

v2DemoSlotRoutes.post("/:slotId/demo/random-scores", async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;
  const slotId = pathId(c, "slotId");
  if (slotId instanceof Response) return slotId;
  const body = await parseV2Json(c, DemoRandomPreviewRequestSchema);
  if (body instanceof Response) return body;
  try {
    const loaded = await loadRegularSlotContext(new LmsClient(c.env), session, { classId: body.classId, slotId });
    if (loaded.context.sessionNumber !== 14) throw new CommentContextInvalidError("Buổi học này không phải buổi Demo cuối khóa.");
    await saveSession(c.env, loaded.session);
    return v2Success(c, buildDemoRandomPreview(loaded.context.classDetail, Math.random, {
      minScore: body.minScore,
      maxScore: body.maxScore,
      minPercent: body.minPercent,
      maxPercent: body.maxPercent,
    }));
  } catch (error) {
    return demoError(c, error);
  }
});

v2DemoSlotRoutes.post("/:slotId/demo/submit", async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;
  const slotId = pathId(c, "slotId");
  if (slotId instanceof Response) return slotId;
  const body = await parseV2Json(c, DemoSubmitRequestSchema);
  if (body instanceof Response) return body;
  try {
    const result = await submitDemo(c.env, new LmsClient(c.env), session, slotId, body);
    await saveSession(c.env, result.session);
    return v2Success(c, {
      slotId: result.context.slot.id,
      studentId: result.context.attendance!.studentId,
      attendanceId: result.context.attendance!.id,
      submitted: true as const,
      summaryIncluded: body.summary !== undefined,
      logged: result.logged,
      schema: result.built.schema,
      questions: result.built.questions,
      demoScore: result.built.totalDemoScore,
      abilityScore: result.built.abilityScore,
      totalScore: result.built.totalScore,
      rank: result.built.rank,
    });
  } catch (error) {
    return demoError(c, error);
  }
});

function pathId(c: V2Context, name: string): string | Response {
  const parsed = EntityIdSchema.safeParse(c.req.param(name));
  return parsed.success ? parsed.data : v2Error(c, "VALIDATION_ERROR", "Định danh không hợp lệ.", 422, parsed.error.flatten());
}

function demoError(c: V2Context, error: unknown): Response {
  if (error instanceof CommentContextNotFoundError) return v2Error(c, "NOT_FOUND", error.message, 404);
  if (error instanceof CommentContextInvalidError) return v2Error(c, "VALIDATION_ERROR", error.message, 422);
  if (error instanceof CommentUpstreamError) return v2Error(c, "UPSTREAM_ERROR", error.message, 502);
  throw error;
}

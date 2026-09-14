import { Hono, type Context } from "hono";
import {
  EntityIdSchema,
  GenerateCommentRequestSchema,
  SaveSummaryRequestSchema,
  SubmitCommentRequestSchema,
} from "@tool-lms/contracts";
import type { Env } from "../../types";
import type { RequestContextVariables } from "../../middleware/requestContext";
import { generateRegularComment } from "../../services/commentGenerationService";
import { normalizeAttendanceStatus } from "../../services/commentPrompt";
import {
  assertRegularCommentSession,
  CommentContextInvalidError,
  CommentContextNotFoundError,
  CommentUpstreamError,
  loadRegularSlotContext,
  saveRegularSlotSummary,
  submitRegularComment,
} from "../../services/commentSubmissionService";
import { getConfig } from "../../services/configService";
import { LmsClient } from "../../services/lmsClient";
import { saveSession } from "../../services/sessionService";
import { parseV2Json, requireV2Session, v2Error, v2Success } from "./helpers";

interface V2Bindings { Bindings: Env; Variables: RequestContextVariables }
type V2Context = Context<V2Bindings>;

export const v2CommentsRoutes = new Hono<V2Bindings>();
export const v2SlotCommentsRoutes = new Hono<V2Bindings>();

v2CommentsRoutes.post("/generate", async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;
  const body = await parseV2Json(c, GenerateCommentRequestSchema);
  if (body instanceof Response) return body;

  try {
    const loaded = await loadRegularSlotContext(new LmsClient(c.env), session, {
      classId: body.classId,
      slotId: body.slotId,
      studentId: body.studentId,
    });
    assertRegularCommentSession(loaded.context);
    await saveSession(c.env, loaded.session);

    const authoritativeAttendance = loaded.context.attendance!;
    const generated = await generateRegularComment(c.env, await getConfig(c.env), {
      ...body,
      studentName: authoritativeAttendance.displayName,
      studentCallName: undefined,
      attendanceStatus: normalizeAttendanceStatus(authoritativeAttendance.status),
      isLate: authoritativeAttendance.status === "LATE_ARRIVED",
      sessionNumber: loaded.context.sessionNumber,
    });
    if (generated.error) {
      if (/Vui lòng nhập API Key|Please set OpenRouter API key/i.test(generated.error)) {
        return v2Error(c, "API_KEY_REQUIRED", "Cần API key để sử dụng model đã chọn.", 422);
      }
      return v2Error(c, "UPSTREAM_ERROR", generated.error, 502);
    }
    if (!generated.generationMeta) {
      return v2Error(c, "UPSTREAM_ERROR", "Không thể tạo nhận xét.", 502);
    }
    return v2Success(c, {
      comment: generated.comment,
      meta: {
        source: generated.generationMeta.source,
        transport: generated.generationMeta.transport,
        validationIssues: generated.generationMeta.validationIssues || [],
      },
    });
  } catch (error) {
    return commentServiceError(c, error);
  }
});

v2SlotCommentsRoutes.put("/:slotId/summary", async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;
  const slotId = pathId(c, "slotId");
  if (slotId instanceof Response) return slotId;
  const body = await parseV2Json(c, SaveSummaryRequestSchema);
  if (body instanceof Response) return body;

  try {
    const result = await saveRegularSlotSummary(new LmsClient(c.env), session, { ...body, slotId });
    await saveSession(c.env, result.session);
    return v2Success(c, { slotId: result.context.slot.id, summary: body.summary, saved: true as const });
  } catch (error) {
    return commentServiceError(c, error);
  }
});

v2SlotCommentsRoutes.post("/:slotId/comments/submit", async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;
  const slotId = pathId(c, "slotId");
  if (slotId instanceof Response) return slotId;
  const body = await parseV2Json(c, SubmitCommentRequestSchema);
  if (body instanceof Response) return body;

  try {
    const result = await submitRegularComment(c.env, new LmsClient(c.env), session, slotId, body);
    await saveSession(c.env, result.session);
    return v2Success(c, {
      slotId: result.context.slot.id,
      studentId: result.context.attendance!.studentId,
      attendanceId: result.context.attendance!.id,
      submitted: true as const,
      summaryIncluded: body.summary !== undefined,
      logged: result.logged,
    });
  } catch (error) {
    return commentServiceError(c, error);
  }
});

function pathId(c: V2Context, name: string): string | Response {
  const parsed = EntityIdSchema.safeParse(c.req.param(name));
  return parsed.success
    ? parsed.data
    : v2Error(c, "VALIDATION_ERROR", "Định danh không hợp lệ.", 422, parsed.error.flatten());
}

function commentServiceError(c: V2Context, error: unknown): Response {
  if (error instanceof CommentContextNotFoundError) return v2Error(c, "NOT_FOUND", error.message, 404);
  if (error instanceof CommentContextInvalidError) return v2Error(c, "VALIDATION_ERROR", error.message, 422);
  if (error instanceof CommentUpstreamError) return v2Error(c, "UPSTREAM_ERROR", error.message, 502);
  throw error;
}

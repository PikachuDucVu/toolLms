import { Hono, type Context } from "hono";
import {
  CheckpointNumberSchema,
  CheckpointSubmitRequestSchema,
  EntityIdSchema,
  GenerateCheckpointCommentRequestSchema,
} from "@tool-lms/contracts";
import type { Env } from "../../types";
import type { RequestContextVariables } from "../../middleware/requestContext";
import { generateCheckpointCommentWithAi } from "../../services/aiClient";
import {
  CheckpointStatusMalformedError,
  CheckpointStatusTimeoutError,
  CheckpointStatusUpstreamError,
  fetchCheckpointStatus,
  loadCheckpointStatusContext,
  submitCheckpoint,
} from "../../services/checkpointService";
import {
  CommentContextInvalidError,
  CommentContextNotFoundError,
  CommentUpstreamError,
  loadRegularSlotContext,
} from "../../services/commentSubmissionService";
import { getConfig } from "../../services/configService";
import { LmsClient } from "../../services/lmsClient";
import { saveSession } from "../../services/sessionService";
import { parseV2Json, requireV2Session, v2Error, v2Success } from "./helpers";

interface Bindings { Bindings: Env; Variables: RequestContextVariables }
type V2Context = Context<Bindings>;

export const v2CheckpointRoutes = new Hono<Bindings>();
export const v2CheckpointClassRoutes = new Hono<Bindings>();
export const v2CheckpointSlotRoutes = new Hono<Bindings>();

v2CheckpointClassRoutes.get("/:classId/checkpoints/:checkpoint/status", async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;
  const classId = pathId(c, "classId");
  if (classId instanceof Response) return classId;
  const checkpointRaw = Number(c.req.param("checkpoint"));
  const checkpoint = CheckpointNumberSchema.safeParse(checkpointRaw);
  if (!checkpoint.success) return v2Error(c, "VALIDATION_ERROR", "Checkpoint phải là 1 hoặc 2.", 422, checkpoint.error.flatten());
  try {
    const context = await loadCheckpointStatusContext(new LmsClient(c.env), session, classId);
    const targetSession = checkpoint.data === 1 ? 5 : 9;
    if (!context.classDetail.slots[targetSession - 1]) throw new CommentContextInvalidError("Lớp học chưa có buổi Checkpoint tương ứng.");
    await saveSession(c.env, context.session);
    const status = await fetchCheckpointStatus(classId, checkpoint.data);
    return v2Success(c, status);
  } catch (error) {
    return checkpointError(c, error);
  }
});

v2CheckpointRoutes.post("/comments/generate", async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;
  const body = await parseV2Json(c, GenerateCheckpointCommentRequestSchema);
  if (body instanceof Response) return body;
  try {
    const loaded = await loadRegularSlotContext(new LmsClient(c.env), session, { classId: body.classId, slotId: body.slotId, studentId: body.studentId });
    if (![5, 9].includes(loaded.context.sessionNumber)) throw new CommentContextInvalidError("Buổi học này không phải buổi Checkpoint.");
    await saveSession(c.env, loaded.session);
    const comment = await generateCheckpointCommentWithAi(c.env, await getConfig(c.env), {
      studentName: loaded.context.attendance!.displayName,
      teacherDescription: body.teacherDescription,
      modelId: body.modelId,
      customModelId: body.customModelId,
      thinkingLevel: body.thinkingLevel,
      aiApiKey: body.apiKey,
    });
    if (/^<p>Lỗi AI \(/.test(comment)) {
      if (/API key|api key/i.test(comment)) return v2Error(c, "API_KEY_REQUIRED", "Cần API key để sử dụng model đã chọn.", 422);
      return v2Error(c, "UPSTREAM_ERROR", comment.replace(/<[^>]+>/g, ""), 502);
    }
    return v2Success(c, { comment });
  } catch (error) {
    return checkpointError(c, error);
  }
});

v2CheckpointSlotRoutes.post("/:slotId/checkpoints/submit", async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;
  const slotId = pathId(c, "slotId");
  if (slotId instanceof Response) return slotId;
  const body = await parseV2Json(c, CheckpointSubmitRequestSchema);
  if (body instanceof Response) return body;
  try {
    const result = await submitCheckpoint(c.env, new LmsClient(c.env), session, slotId, body);
    await saveSession(c.env, result.session);
    return v2Success(c, {
      slotId: result.context.slot.id,
      studentId: result.context.attendance!.studentId,
      attendanceId: result.context.attendance!.id,
      submitted: true as const,
      mode: body.mode,
      summaryIncluded: body.summary !== undefined,
      logged: result.logged,
      theoryScore: result.built.theoryScore,
      practiceScore: result.built.practiceScore,
      totalScore: result.built.totalScore,
      rank: result.built.rank,
      questions: result.built.questions,
    });
  } catch (error) {
    return checkpointError(c, error);
  }
});

function pathId(c: V2Context, name: string): string | Response {
  const parsed = EntityIdSchema.safeParse(c.req.param(name));
  return parsed.success ? parsed.data : v2Error(c, "VALIDATION_ERROR", "Định danh không hợp lệ.", 422, parsed.error.flatten());
}

function checkpointError(c: V2Context, error: unknown): Response {
  if (error instanceof CommentContextNotFoundError) return v2Error(c, "NOT_FOUND", error.message, 404);
  if (error instanceof CommentContextInvalidError) return v2Error(c, "VALIDATION_ERROR", error.message, 422);
  if (error instanceof CommentUpstreamError || error instanceof CheckpointStatusUpstreamError || error instanceof CheckpointStatusMalformedError) return v2Error(c, "UPSTREAM_ERROR", error.message, 502);
  if (error instanceof CheckpointStatusTimeoutError) return v2Error(c, "UPSTREAM_ERROR", error.message, 504);
  throw error;
}

import { Hono } from "hono";
import { EntityIdSchema } from "@tool-lms/contracts";
import type { Env } from "../../types";
import type { RequestContextVariables } from "../../middleware/requestContext";
import { fetchClassDetail, fetchOrderedClasses, normalizeClassList } from "../../services/classService";
import { LmsClient } from "../../services/lmsClient";
import { saveSession } from "../../services/sessionService";
import { requireV2Session, v2Error, v2Success } from "./helpers";

export const v2ClassesRoutes = new Hono<{ Bindings: Env; Variables: RequestContextVariables }>();

v2ClassesRoutes.get("/", async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;
  const result = await fetchOrderedClasses(new LmsClient(c.env), session);
  await saveSession(c.env, result.session);
  if (result.body.error || result.body.errors?.length) {
    return v2Error(c, "UPSTREAM_ERROR", result.body.errors?.[0]?.message || result.body.error || "Không thể tải danh sách lớp.", 502);
  }
  return v2Success(c, { classes: normalizeClassList(result.classes) });
});

v2ClassesRoutes.get("/:classId", async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;
  const parsedId = EntityIdSchema.safeParse(c.req.param("classId"));
  if (!parsedId.success) return v2Error(c, "VALIDATION_ERROR", "Mã lớp không hợp lệ.", 422, parsedId.error.flatten());
  const result = await fetchClassDetail(new LmsClient(c.env), session, parsedId.data);
  await saveSession(c.env, result.session);
  if (result.body.error || result.body.errors?.length) {
    return v2Error(c, "UPSTREAM_ERROR", result.body.errors?.[0]?.message || result.body.error || "Không thể tải dữ liệu lớp.", 502);
  }
  if (result.invalidDetail) return v2Error(c, "UPSTREAM_ERROR", "Dữ liệu lớp từ LMS không hợp lệ.", 502);
  if (!result.classDetail) return v2Error(c, "NOT_FOUND", "Không tìm thấy lớp học.", 404);
  return v2Success(c, { class: result.classDetail });
});

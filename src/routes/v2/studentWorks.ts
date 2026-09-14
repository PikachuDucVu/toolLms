import { Hono, type Context } from "hono";
import { EntityIdSchema, SaveStudentWorkInputSchema } from "@tool-lms/contracts";
import type { Env } from "../../types";
import type { RequestContextVariables } from "../../middleware/requestContext";
import { LmsClient } from "../../services/lmsClient";
import { saveSession } from "../../services/sessionService";
import {
  createStudentWork,
  deleteStudentWork,
  fetchStudentWorks,
  updateStudentWork,
  uploadThumbnailResource,
} from "../../services/studentWorkService";
import { parseV2Json, requireV2Session, v2Error, v2Success } from "./helpers";

interface V2Bindings {
  Bindings: Env;
  Variables: RequestContextVariables;
}
type V2Context = Context<V2Bindings>;

export const v2SlotStudentWorkRoutes = new Hono<V2Bindings>();
export const v2ResourceRoutes = new Hono<V2Bindings>();

v2SlotStudentWorkRoutes.get("/:slotId/student-works", async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;

  const parsedSlotId = EntityIdSchema.safeParse(c.req.param("slotId"));
  if (!parsedSlotId.success) {
    return v2Error(c, "VALIDATION_ERROR", "Mã buổi học không hợp lệ.", 422, parsedSlotId.error.flatten());
  }

  const search = new URL(c.req.url).searchParams;
  const parsedClassId = EntityIdSchema.safeParse(search.get("classId"));
  if (!parsedClassId.success) {
    return v2Error(c, "VALIDATION_ERROR", "Mã lớp học không hợp lệ.", 422, parsedClassId.error.flatten());
  }

  const studentIdParam = search.get("studentId");
  const studentId = studentIdParam ? EntityIdSchema.safeParse(studentIdParam).data : undefined;

  const client = new LmsClient(c.env);
  const result = await fetchStudentWorks(client, session, {
    classId: parsedClassId.data,
    classSessionId: parsedSlotId.data,
    studentId,
  });

  await saveSession(c.env, result.session);

  if (result.body.error || result.body.errors?.length) {
    return v2Error(
      c,
      "UPSTREAM_ERROR",
      result.body.errors?.[0]?.message || result.body.error || "Không thể tải danh sách sản phẩm học viên.",
      502
    );
  }

  return v2Success(c, { studentWorks: result.studentWorks });
});

v2SlotStudentWorkRoutes.post("/:slotId/student-works", async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;

  const parsedSlotId = EntityIdSchema.safeParse(c.req.param("slotId"));
  if (!parsedSlotId.success) {
    return v2Error(c, "VALIDATION_ERROR", "Mã buổi học không hợp lệ.", 422, parsedSlotId.error.flatten());
  }

  const body = await parseV2Json(c, SaveStudentWorkInputSchema);
  if (body instanceof Response) return body;

  const client = new LmsClient(c.env);
  const result = body.id
    ? await updateStudentWork(client, session, body as typeof body & { id: string })
    : await createStudentWork(client, session, body);

  await saveSession(c.env, result.session);

  if (result.body.error || result.body.errors?.length) {
    return v2Error(
      c,
      "UPSTREAM_ERROR",
      result.body.errors?.[0]?.message || result.body.error || "Không thể lưu sản phẩm học viên.",
      502
    );
  }

  if (!result.studentWork) {
    return v2Error(c, "UPSTREAM_ERROR", "LMS không trả về dữ liệu sản phẩm.", 502);
  }

  return v2Success(c, { studentWork: result.studentWork });
});

v2SlotStudentWorkRoutes.delete("/:slotId/student-works/:workId", async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;

  const parsedWorkId = EntityIdSchema.safeParse(c.req.param("workId"));
  if (!parsedWorkId.success) {
    return v2Error(c, "VALIDATION_ERROR", "Mã sản phẩm không hợp lệ.", 422, parsedWorkId.error.flatten());
  }

  const client = new LmsClient(c.env);
  const result = await deleteStudentWork(client, session, parsedWorkId.data);

  await saveSession(c.env, result.session);

  if (result.body.error || result.body.errors?.length) {
    return v2Error(
      c,
      "UPSTREAM_ERROR",
      result.body.errors?.[0]?.message || result.body.error || "Không thể xóa sản phẩm học viên.",
      502
    );
  }

  return v2Success(c, { id: parsedWorkId.data, deleted: result.deleted });
});

v2ResourceRoutes.post("/upload", async (c) => {
  const session = await requireV2Session(c);
  if (session instanceof Response) return session;

  try {
    const formData = await c.req.formData();
    const file = formData.get("file") || formData.get("files");
    if (!file || typeof file === "string") {
      return v2Error(c, "VALIDATION_ERROR", "Vui lòng chọn file ảnh để tải lên.", 400);
    }

    const uploadedFile = file as File;
    const uploadResult = await uploadThumbnailResource(uploadedFile, uploadedFile.name || "thumbnail.png");
    return v2Success(c, uploadResult);
  } catch (error) {
    return v2Error(
      c,
      "UPSTREAM_ERROR",
      error instanceof Error ? error.message : "Upload ảnh thất bại.",
      502
    );
  }
});

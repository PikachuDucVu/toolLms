import type { ClassDetail, Slot, StudentAttendance, SubmitCommentRequest } from "@tool-lms/contracts";
import { UPDATE_SLOT_COMMENT_QUERY } from "../constants/lmsQueries";
import type { Env, LmsGraphqlResponse, SessionRecord } from "../types";
import { fetchClassDetail } from "./classService";
import { appendCommentLog } from "./commentService";
import type { LmsClient } from "./lmsClient";

const NEW_CLASS_CUTOFF_DATE = "2026-04-05";
const CONTENT_AREA_ID = "67b54307f79c7bc326e017ff";

const DEFAULT_RATE_AREAS = [
  { grade: 5, content: "- Học viên trình bày ý kiến rõ ràng, chủ động hỏi khi gặp vấn đề, thuyết trình trước lớp mạch lạc, rõ ràng.\n- Học viên nhìn nhận được những ưu - nhược điểm của bản thân sau khi nhận đánh giá từ giáo viên, bạn bè", commentAreaId: "66f12601cdcebc582a30307f", type: "RATE" },
  { grade: 5, content: "- Học viên phản biện và phân tích các giải pháp một cách sâu rộng, biết thử đi thử lại nhiều lần đến khi ra kết quả từ đó Học viên có thể tổng quát cho nhiều vấn đề tương tự sau này\n- Học viên đưa sản phẩm cá nhân go live và có tiếp nhận người dùng thật.", commentAreaId: "66f12569cdcebc582a302bd2", type: "RATE" },
  { grade: 5, content: "- Tốc độ sử dụng chuột/bàn phím rất thành thạo, có thể sử dụng gõ phím bằng 2 tay không cần nhìn phím.\n- Học viên tận dụng tối ưu các phần mềm máy tính, sử dụng các công cụ hỗ trợ xây dựng sơ đồ tư duy, công cụ quản lý tiến độ dự án, công cụ xây dựng sơ đồ thuật toán.", commentAreaId: "66f125d3cdcebc582a302f35", type: "RATE" },
  { grade: 5, content: "- Học viên tập trung lắng nghe bài giảng, tự giác học tập, giáo viên hầu như không phải nhắc nhở con, hiệu quả buổi học cao\n- Học viên tuân thủ tuyệt đối các quy tắc trong lớp học, luôn có mặt đúng giờ, lễ phép khi giao tiếp với giáo viên.\n", commentAreaId: "66f12637cdcebc582a30321c", type: "RATE" },
  { grade: 5, content: "- Ngoài việc nắm chắc kiến thức được hướng dẫn trong buổi học,  học viên có sự chủ động đặt câu hỏi với giáo viên để mở rộng/ nâng cao thêm vốn hiểu biết.", commentAreaId: "66f124bbcdcebc582a302727", type: "RATE" },
  { grade: 5, content: "- Học viên thành thạo trong việc sử dụng ngôn ngữ lập trình, biết tối ưu hoá đoạn code và sắp xếp chỉnh chu, gọn gàng\n- Học viên có thể tự xây dựng mô hình/sơ đồ tư duy tuần tự các bước lập trình cho dự án cá nhân của mình mà không cần sự hỗ trợ từ giáo viên", commentAreaId: "66f12525cdcebc582a302a65", type: "RATE" },
  { grade: 5, content: "- Học viên chủ động trong việc phát hiện ra những ý tưởng sáng tạo cho các tính năng của sản phẩm dựa trên những kiến thức vừa được học và đặt câu hỏi với Giáo viên.\n- Học viên tự mình thiết kế trò chơi, câu chuyện hoặc dự án hoàn toàn mới, có khả năng thu hút sự chú ý và hứng thú của người khác, hoặc tạo ra một trào lưu trong cộng đồng", commentAreaId: "66f1259bcdcebc582a302cd7", type: "RATE" },
] as const;

const AREA_NAMES = [
  "Kỹ năng giao tiếp, hợp tác",
  "Kỹ năng giải quyết vấn đề",
  "Kỹ năng sử dụng máy tính",
  "Thái độ học tập trên lớp",
  "Kiến thức học viên đã được học tại lớp",
  "Tư duy máy tính, tư duy thuật toán",
  "Tư duy sáng tạo",
] as const;

export interface RegularSlotContext {
  classDetail: ClassDetail;
  slot: Slot;
  attendance?: StudentAttendance;
  classSiteId: string;
  courseProcessId: string;
  sessionNumber: number;
  newFormat: boolean;
}

export class CommentContextNotFoundError extends Error {}
export class CommentContextInvalidError extends Error {}
export class CommentUpstreamError extends Error {}

function firstUpstreamError(body: LmsGraphqlResponse): string | null {
  return body.errors?.[0]?.message || body.error || null;
}

function slotDisplayNumber(slot: Slot, arrayIndex: number): number {
  const positionNumber = arrayIndex + 1;
  if ([5, 9, 14].includes(positionNumber)) return positionNumber;
  if (slot.index === positionNumber) return slot.index;
  if (slot.index + 1 === positionNumber) return positionNumber;
  return slot.index + 1;
}

export function isNewFormatStartDate(startDate: string | null): boolean {
  if (!startDate) return false;
  const timestamp = Date.parse(startDate);
  return Number.isFinite(timestamp) && timestamp >= Date.parse(NEW_CLASS_CUTOFF_DATE);
}

export function asLmsCommentHtml(value: string): string {
  const trimmed = value.trim();
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;
  return `<p>${trimmed.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</p>`;
}

export async function loadRegularSlotContext(
  client: Pick<LmsClient, "callApi">,
  session: SessionRecord,
  input: { classId: string; slotId: string; studentId?: string; attendanceId?: string },
): Promise<{ context: RegularSlotContext; session: SessionRecord }> {
  const loaded = await fetchClassDetail(client, session, input.classId);
  const upstreamError = firstUpstreamError(loaded.body);
  if (upstreamError) throw new CommentUpstreamError(upstreamError);
  if (loaded.invalidDetail) throw new CommentUpstreamError("Dữ liệu lớp từ LMS không hợp lệ.");
  if (!loaded.classDetail || loaded.classDetail.id !== input.classId) {
    throw new CommentContextNotFoundError("Không tìm thấy lớp học.");
  }

  const slotIndex = loaded.classDetail.slots.findIndex((slot) => slot.id === input.slotId);
  if (slotIndex < 0) throw new CommentContextNotFoundError("Không tìm thấy buổi học trong lớp.");
  const slot = loaded.classDetail.slots[slotIndex];
  const classSiteId = loaded.classDetail.sites[0]?.id;
  const courseProcessId = loaded.classDetail.courseProcessId;
  if (!classSiteId || !courseProcessId) throw new CommentContextInvalidError("Lớp học thiếu thông tin cơ sở hoặc tiến trình khóa học.");

  let attendance: StudentAttendance | undefined;
  if (input.studentId || input.attendanceId) {
    attendance = slot.studentAttendance.find((item) =>
      (!input.studentId || item.studentId === input.studentId)
      && (!input.attendanceId || item.id === input.attendanceId));
    if (!attendance) throw new CommentContextNotFoundError("Không tìm thấy học sinh trong buổi học.");
  }

  return {
    session: loaded.session,
    context: {
      classDetail: loaded.classDetail,
      slot,
      attendance,
      classSiteId,
      courseProcessId,
      sessionNumber: slotDisplayNumber(slot, slotIndex),
      newFormat: isNewFormatStartDate(loaded.classDetail.startDate),
    },
  };
}

interface DefaultPayloadInput {
  slotId: string;
  classSiteId: string;
  sessionNumber: number;
  classId: string;
  courseProcessId: string;
  attendanceId: string;
  studentId: string;
  comment: string;
  summary?: string;
  newFormat: boolean;
}

export function assertRegularCommentSession(context: RegularSlotContext): void {
  if ([5, 9, 14].includes(context.sessionNumber)) {
    throw new CommentContextInvalidError("Buổi học này không dùng định dạng nhận xét thường.");
  }
}

export function buildDefaultCommentPayload(input: DefaultPayloadInput): Record<string, unknown> {
  const commentHtml = asLmsCommentHtml(input.comment);
  const contentArea = { content: commentHtml, commentAreaId: CONTENT_AREA_ID, type: "CONTENT" };
  const byAreas = input.newFormat ? [contentArea] : [...DEFAULT_RATE_AREAS, contentArea];
  const contentParts = input.newFormat
    ? []
    : DEFAULT_RATE_AREAS.map((area, index) => `- [COD]  ${AREA_NAMES[index]}: ${area.content}`);
  contentParts.push(`- Đánh giá chung: ${commentHtml}`);

  return {
    slotId: input.slotId,
    classSiteId: input.classSiteId,
    sessionNumber: input.sessionNumber,
    classId: input.classId,
    courseProcessId: input.courseProcessId,
    slotType: "Default",
    rank: "N/A",
    totalScore: null,
    ...(input.summary === undefined ? {} : { summary: `<p>${input.summary}</p>` }),
    studentComment: {
      studentAttendanceId: input.attendanceId,
      studentId: input.studentId,
      content: contentParts.join("<br>"),
      byAreas,
    },
  };
}

export function buildSummaryPayload(input: {
  slotId: string;
  classSiteId: string;
  sessionNumber: number;
  classId: string;
  courseProcessId: string;
  summary: string;
}): Record<string, unknown> {
  return {
    slotId: input.slotId,
    classSiteId: input.classSiteId,
    sessionNumber: input.sessionNumber,
    classId: input.classId,
    courseProcessId: input.courseProcessId,
    slotType: "Default",
    totalScore: null,
    rank: "",
    summary: `<p>${input.summary}</p>`,
  };
}

export async function updateSlotComment(
  client: Pick<LmsClient, "callApi">,
  session: SessionRecord,
  payload: Record<string, unknown>,
): Promise<SessionRecord> {
  const result = await client.callApi(session, "UpdateSlotComment", UPDATE_SLOT_COMMENT_QUERY, { payload }, { retryAuthentication: false });
  const upstreamError = firstUpstreamError(result.body);
  if (upstreamError) throw new CommentUpstreamError(upstreamError);
  return result.session;
}

export async function saveRegularSlotSummary(
  client: Pick<LmsClient, "callApi">,
  session: SessionRecord,
  input: { classId: string; slotId: string; summary: string },
): Promise<{ session: SessionRecord; context: RegularSlotContext }> {
  const loaded = await loadRegularSlotContext(client, session, input);
  const updatedSession = await updateSlotComment(client, loaded.session, buildSummaryPayload({
    slotId: loaded.context.slot.id,
    classSiteId: loaded.context.classSiteId,
    sessionNumber: loaded.context.sessionNumber,
    classId: loaded.context.classDetail.id,
    courseProcessId: loaded.context.courseProcessId,
    summary: input.summary,
  }));
  return { session: updatedSession, context: loaded.context };
}

export async function submitRegularComment(
  env: Env,
  client: Pick<LmsClient, "callApi">,
  session: SessionRecord,
  slotId: string,
  input: SubmitCommentRequest,
): Promise<{ session: SessionRecord; context: RegularSlotContext; logged: boolean }> {
  const loaded = await loadRegularSlotContext(client, session, {
    classId: input.classId,
    slotId,
    studentId: input.studentId,
    attendanceId: input.attendanceId,
  });
  assertRegularCommentSession(loaded.context);

  const updatedSession = await updateSlotComment(client, loaded.session, buildDefaultCommentPayload({
    slotId: loaded.context.slot.id,
    classSiteId: loaded.context.classSiteId,
    sessionNumber: loaded.context.sessionNumber,
    classId: loaded.context.classDetail.id,
    courseProcessId: loaded.context.courseProcessId,
    attendanceId: loaded.context.attendance!.id,
    studentId: loaded.context.attendance!.studentId,
    comment: input.comment,
    summary: input.summary,
    newFormat: loaded.context.newFormat,
  }));

  let logged = true;
  try {
    await appendCommentLog(env, {
      class_id: loaded.context.classDetail.id,
      class_name: loaded.context.classDetail.name,
      session_number: loaded.context.sessionNumber,
      student_id: loaded.context.attendance!.studentId,
      student_name: loaded.context.attendance!.displayName,
      comment: input.comment,
      slot_type: "Default",
      learning_level: input.learningLevel,
      generation_source: input.generationMeta?.source || "unknown",
      transport: input.generationMeta?.transport || "server",
      repaired: input.generationMeta?.source === "ai_repair",
      validation_issues: input.generationMeta?.validationIssues || [],
      success: true,
    });
  } catch {
    logged = false;
  }

  return { session: updatedSession, context: loaded.context, logged };
}

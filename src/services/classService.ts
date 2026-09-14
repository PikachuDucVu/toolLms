import { GET_CLASSES_QUERY, GET_CLASS_DETAIL_QUERY } from "../constants/lmsQueries";
import type { SessionRecord } from "../types";
import type { LmsCallResult, LmsClient } from "./lmsClient";
import { ClassDetailSchema, ClassSummarySchema, type ClassCommentProgress, type ClassDetail, type ClassSummary } from "@tool-lms/contracts";

const RECENTLY_ENDED_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

type ClassListPayload = { classes: { data?: unknown[] } };
type ClassDetailPayload = { classesById?: unknown };
type ClassClient = Pick<LmsClient, "callApi">;

export function orderClasses<T extends Record<string, unknown>>(classes: T[], now = Date.now()): Array<T & { recentlyEnded?: true }> {
  const twoWeeksAgo = now - RECENTLY_ENDED_WINDOW_MS;
  const running: T[] = [];
  const recentlyEnded: Array<T & { recentlyEnded: true }> = [];
  for (const cls of classes) {
    const endDate = typeof cls.endDate === "string" ? cls.endDate : "";
    const end = endDate ? Date.parse(endDate) : Number.NaN;
    const hasValidEnd = Number.isFinite(end);
    const endedByDate = hasValidEnd && end < now;

    if (cls.status === "RUNNING" && !endedByDate) {
      running.push(cls);
    } else if ((cls.status === "FINISHED" || endedByDate) && hasValidEnd && end >= twoWeeksAgo) {
      recentlyEnded.push({ ...cls, recentlyEnded: true });
    }
  }
  recentlyEnded.sort((a, b) => String(b.endDate || "").localeCompare(String(a.endDate || "")));
  return [...running, ...recentlyEnded];
}

export async function fetchOrderedClasses(
  client: ClassClient,
  session: SessionRecord,
  now = Date.now(),
): Promise<LmsCallResult<ClassListPayload> & { classes: Array<Record<string, unknown>> }> {
  const result = await client.callApi<ClassListPayload>(session, "GetClasses", GET_CLASSES_QUERY, {
    pageIndex: 0,
    itemsPerPage: 200,
  });
  const raw = result.body.data?.classes?.data;
  const classes = orderClasses(Array.isArray(raw) ? raw.filter(isRecord) : [], now);
  return { ...result, classes };
}

export function normalizeClassSummary(value: Record<string, unknown>, now = Date.now()): ClassSummary | null {
  const id = stringValue(value.id);
  const name = stringValue(value.name);
  if (!id || !name) return null;
  const courseValue = isRecord(value.course) ? value.course : null;
  const courseId = courseValue ? stringValue(courseValue.id) : "";
  const sites = Array.isArray(value.classSites)
    ? value.classSites.filter(isRecord).flatMap((site) => {
        const siteId = stringValue(site._id || site.id);
        return siteId ? [{ id: siteId, name: stringValue(site.name) }] : [];
      })
    : [];
  const slots = Array.isArray(value.slots) ? value.slots.filter(isRecord) : [];
  const parsed = ClassSummarySchema.safeParse({
    id,
    name,
    status: stringValue(value.status) || "UNKNOWN",
    startDate: nullableString(value.startDate),
    endDate: nullableString(value.endDate),
    recentlyEnded: value.recentlyEnded === true,
    course: courseValue && courseId
      ? { id: courseId, name: stringValue(courseValue.name), shortName: stringValue(courseValue.shortName) }
      : null,
    sites,
    slotCount: slots.length,
    commentProgress: normalizeClassCommentProgress(slots, now),
  });
  return parsed.success ? parsed.data : null;
}

export function normalizeClassList(classes: Array<Record<string, unknown>>): ClassSummary[] {
  return classes.flatMap((item) => {
    const normalized = normalizeClassSummary(item);
    return normalized ? [normalized] : [];
  });
}

export async function fetchClassDetail(
  client: ClassClient,
  session: SessionRecord,
  classId: string,
): Promise<LmsCallResult<ClassDetailPayload> & { classDetail: ClassDetail | null; invalidDetail: boolean }> {
  const result = await client.callApi<ClassDetailPayload>(session, "GetClassById", GET_CLASS_DETAIL_QUERY, { id: classId });
  const raw = result.body.data?.classesById;
  if (raw == null) return { ...result, classDetail: null, invalidDetail: false };
  const classDetail = isRecord(raw) ? normalizeClassDetail(raw) : null;
  return { ...result, classDetail, invalidDetail: classDetail === null };
}

export function normalizeClassDetail(value: Record<string, unknown>, now = Date.now()): ClassDetail | null {
  const endDate = nullableString(value.endDate);
  const end = endDate ? Date.parse(endDate) : Number.NaN;
  const recentlyEnded = Number.isFinite(end)
    && end < now
    && end >= now - RECENTLY_ENDED_WINDOW_MS;
  const summary = normalizeClassSummary({ ...value, recentlyEnded }, now);
  if (!summary) return null;

  const courseProcessRaw = isRecord(value.courseProcess) ? value.courseProcess : null;
  const courseProcess = courseProcessRaw ? normalizeCourseProcess(courseProcessRaw) : null;
  const courseProcessId = stringValue(value.courseProcessId) || courseProcess?.id || null;
  const slots = Array.isArray(value.slots) ? value.slots.filter(isRecord).flatMap((slot) => {
    const normalized = normalizeSlot(slot);
    return normalized ? [normalized] : [];
  }) : [];
  const parsed = ClassDetailSchema.safeParse({ ...summary, courseProcessId, courseProcess, slots });
  return parsed.success ? parsed.data : null;
}

export function normalizeClassCommentProgress(slots: Record<string, unknown>[], now = Date.now()): ClassCommentProgress {
  const latestIndex = findLatestCommentableSlotIndex(slots, now);
  if (latestIndex < 0) {
    return { state: "unknown", badgeText: "Chưa có dữ liệu", slotNumber: null, present: null, completed: null, missing: null };
  }

  let pendingIndex = -1;
  let pendingProgress: ReturnType<typeof rawSlotCommentProgress> | null = null;
  for (let index = latestIndex; index >= 0; index -= 1) {
    const progress = rawSlotCommentProgress(slots[index], index);
    if (progress.present > 0 && progress.missing > 0) {
      pendingIndex = index;
      pendingProgress = progress;
    }
  }

  if (pendingIndex >= 0 && pendingProgress) {
    return {
      state: "pending",
      badgeText: "Chưa nhận xét",
      slotNumber: rawSlotDisplayNumber(slots[pendingIndex], pendingIndex),
      ...pendingProgress,
    };
  }

  return {
    state: "done",
    badgeText: "Đã nhận xét",
    slotNumber: rawSlotDisplayNumber(slots[latestIndex], latestIndex),
    ...rawSlotCommentProgress(slots[latestIndex], latestIndex),
  };
}

function findLatestCommentableSlotIndex(slots: Record<string, unknown>[], now: number): number {
  for (let index = slots.length - 1; index >= 0; index -= 1) {
    const slot = slots[index];
    const attendance = Array.isArray(slot.studentAttendance) ? slot.studentAttendance : [];
    if (!attendance.length) continue;
    const date = nullableString(slot.date);
    const timestamp = date ? Date.parse(date) : Number.NaN;
    if (!Number.isFinite(timestamp) || timestamp <= now) return index;
  }
  return -1;
}

function rawSlotCommentProgress(slot: Record<string, unknown>, slotIndex: number) {
  const attendance = Array.isArray(slot.studentAttendance) ? slot.studentAttendance.filter(isRecord) : [];
  const present = attendance.filter((item) => isPresentStatus(item.status));
  const completed = present.filter((item) => rawAttendanceCompleted(item, slot, slotIndex)).length;
  return { present: present.length, completed, missing: Math.max(present.length - completed, 0) };
}

function rawAttendanceCompleted(attendance: Record<string, unknown>, slot: Record<string, unknown>, slotIndex: number): boolean {
  const sessionNumber = rawSlotDisplayNumber(slot, slotIndex);
  if (sessionNumber === 14) return rawHasAreaType(attendance, "DEMO") || rawHasAreaType(attendance, "CONTENT", true);
  if (sessionNumber === 5 || sessionNumber === 9) return rawHasAreaType(attendance, "CHECKPOINT") || rawHasAreaType(attendance, "CONTENT", true);
  return rawHasAreaType(attendance, "CONTENT", true);
}

function rawHasAreaType(attendance: Record<string, unknown>, type: string, requireContent = false): boolean {
  const areas = Array.isArray(attendance.commentByAreas) ? attendance.commentByAreas.filter(isRecord) : [];
  return areas.some((area) => {
    if (stringValue(area.type) !== type) return false;
    if (!requireContent || !("content" in area)) return true;
    return stringValue(area.content).trim().length > 0;
  });
}

function rawSlotDisplayNumber(slot: Record<string, unknown>, arrayIndex: number): number {
  const slotIndex = numberValue(slot.index);
  const positionNumber = arrayIndex + 1;
  if (slotIndex == null) return positionNumber;
  if (slotIndex === positionNumber) return slotIndex;
  if (slotIndex + 1 === positionNumber) return positionNumber;
  return slotIndex + 1;
}

function isPresentStatus(value: unknown): boolean {
  return value === "ATTENDED" || value === "LATE_ARRIVED";
}

function normalizeCourseProcess(value: Record<string, unknown>) {
  const id = stringValue(value.id);
  if (!id) return null;
  const finalSessionRaw = isRecord(value.finalSession) ? value.finalSession : null;
  return {
    id,
    name: stringValue(value.name),
    finalSession: finalSessionRaw ? {
      finalEvaluations: Array.isArray(finalSessionRaw.finalEvaluations)
        ? finalSessionRaw.finalEvaluations.filter(isRecord).flatMap((item) => {
            const evaluationId = stringValue(item.id);
            if (!evaluationId) return [];
            return [{
              id: evaluationId,
              title: stringValue(item.title),
              commentAreas: normalizeProcessCommentAreas(item.commentAreas),
            }];
          })
        : [],
      demoScore: normalizeDemoScore(finalSessionRaw.demoScore),
    } : null,
  };
}

function normalizeProcessCommentAreas(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord).flatMap((area) => {
    const id = stringValue(area.id);
    if (!id) return [];
    const rates = Array.isArray(area.rates) ? area.rates.filter(isRecord).map((rate) => ({
      value: stringOrNumberOrNull(rate.value),
      commentSamples: Array.isArray(rate.commentSamples) ? rate.commentSamples.map(stringValue) : [],
    })) : [];
    return [{ id, name: stringValue(area.name), type: stringValue(area.type), rates }];
  }) : [];
}

function normalizeDemoScore(value: unknown) {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  if (!id) return null;
  return {
    id,
    commentAreas: Array.isArray(value.commentAreas) ? value.commentAreas.filter(isRecord).flatMap((area) => {
      const areaId = stringValue(area.id);
      if (!areaId) return [];
      const demoValues = Array.isArray(area.demo) ? area.demo.filter(isRecord) : isRecord(area.demo) ? [area.demo] : [];
      const demo = demoValues.flatMap((criterion) => {
        const criterionId = stringValue(criterion.id);
        return criterionId ? [{
          id: criterionId,
          title: stringValue(criterion.title),
          maxScore: numberValue(criterion.maxScore) ?? 0,
        }] : [];
      });
      return [{ id: areaId, name: stringValue(area.name), type: stringValue(area.type), demo }];
    }) : [],
  };
}

function normalizeSlot(value: Record<string, unknown>) {
  const id = stringValue(value._id || value.id);
  if (!id) return null;
  return {
    id,
    index: integerValue(value.index) ?? 0,
    date: nullableString(value.date),
    summary: stringValue(value.summary),
    studentAttendance: Array.isArray(value.studentAttendance)
      ? value.studentAttendance.filter(isRecord).flatMap((attendance) => {
          const normalized = normalizeAttendance(attendance);
          return normalized ? [normalized] : [];
        })
      : [],
  };
}

function normalizeAttendance(value: Record<string, unknown>) {
  const id = stringValue(value._id || value.id);
  const student = isRecord(value.student) ? value.student : null;
  const studentId = student ? stringValue(student.id) : "";
  if (!id || !studentId) return null;
  return {
    id,
    studentId,
    displayName: stringValue(student?.fullName),
    status: stringValue(value.status),
    commentByAreas: Array.isArray(value.commentByAreas)
      ? value.commentByAreas.filter(isRecord).map(normalizeCommentArea)
      : [],
  };
}

function normalizeCommentArea(value: Record<string, unknown>) {
  const checkpoint = isRecord(value.checkpoint) ? {
    practiceScore: numberValue(value.checkpoint.practiceScore),
    checkpointScore: numberValue(value.checkpoint.checkpointScore),
    checkpointQuestions: Array.isArray(value.checkpoint.checkpointQuestions)
      ? value.checkpoint.checkpointQuestions.filter(isRecord).flatMap((question) => {
          const id = stringValue(question.id);
          return id ? [{ id, title: stringValue(question.title), result: resultValue(question.result), score: numberValue(question.score) }] : [];
        })
      : [],
  } : null;
  return {
    grade: numberValue(value.grade),
    content: stringValue(value.content),
    commentAreaId: nullableString(value.commentAreaId),
    type: stringValue(value.type),
    checkpoint,
    courseProcessDemoId: nullableString(value.courseProcessDemoId),
    courseProcessFinalEvaluationTitle: nullableString(value.courseProcessFinalEvaluationTitle),
    courseProcessFinalEvaluationId: nullableString(value.courseProcessFinalEvaluationId),
    demoQuestions: Array.isArray(value.demoQuestions) ? value.demoQuestions.filter(isRecord).map((question) => ({
      courseProcessDemoDetailId: nullableString(question.courseProcessDemoDetailId),
      title: stringValue(question.title),
      result: resultValue(question.result),
      score: numberValue(question.score),
      maxScore: numberValue(question.maxScore),
    })) : [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function nullableString(value: unknown): string | null {
  const result = stringValue(value);
  return result || null;
}

function numberValue(value: unknown): number | null {
  if (value === "" || value == null) return null;
  const result = typeof value === "number" ? value : Number(value);
  return Number.isFinite(result) ? result : null;
}

function integerValue(value: unknown): number | null {
  const result = numberValue(value);
  return result != null && Number.isInteger(result) ? result : null;
}

function stringOrNumberOrNull(value: unknown): string | number | null {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value)) ? value : null;
}

function resultValue(value: unknown): string | number | boolean | null {
  return typeof value === "boolean" ? value : stringOrNumberOrNull(value);
}

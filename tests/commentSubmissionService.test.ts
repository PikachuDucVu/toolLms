import { describe, expect, it } from "vitest";
import {
  buildDefaultCommentPayload,
  buildSummaryPayload,
  isNewFormatStartDate,
} from "../src/services/commentSubmissionService";
import { regularCommentPayloadFixtures } from "./fixtures/regularCommentPayloads";

const base = {
  slotId: "slot-1",
  classSiteId: "site-1",
  sessionNumber: 3,
  classId: "class-1",
  courseProcessId: "process-1",
  comment: "<p>Nhận xét chính xác.</p>",
};

describe("regular LMS golden payloads", () => {
  it("matches the frozen full old-format present identity fixture with summary omitted", () => {
    expect(isNewFormatStartDate("2026-04-04")).toBe(false);
    expect(isNewFormatStartDate("invalid")).toBe(false);
    expect(buildDefaultCommentPayload({
      ...base,
      attendanceId: "attendance-present",
      studentId: "student-present",
      newFormat: false,
    })).toEqual(regularCommentPayloadFixtures.oldFormatPresentWithoutSummary);
  });

  it("matches the frozen full old-format absent identity fixture with summary included", () => {
    expect(buildDefaultCommentPayload({
      ...base,
      attendanceId: "attendance-absent",
      studentId: "student-absent",
      newFormat: false,
      summary: "Nội dung buổi học",
    })).toEqual(regularCommentPayloadFixtures.oldFormatAbsentWithSummary);
  });

  it("matches the frozen full cutoff new-format present identity fixture with summary omitted", () => {
    expect(isNewFormatStartDate("2026-04-05")).toBe(true);
    expect(isNewFormatStartDate("2026-04-06T00:00:00.000Z")).toBe(true);
    expect(buildDefaultCommentPayload({
      ...base,
      attendanceId: "attendance-present",
      studentId: "student-present",
      newFormat: true,
    })).toEqual(regularCommentPayloadFixtures.cutoffNewFormatPresentWithoutSummary);
  });

  it("matches the frozen full cutoff new-format absent identity fixture with summary included", () => {
    expect(buildDefaultCommentPayload({
      ...base,
      attendanceId: "attendance-absent",
      studentId: "student-absent",
      newFormat: true,
      summary: "Nội dung buổi học",
    })).toEqual(regularCommentPayloadFixtures.cutoffNewFormatAbsentWithSummary);
  });

  it("builds the exact summary-only payload with empty rank and no student comment", () => {
    expect(buildSummaryPayload({
      slotId: "slot-1", classSiteId: "site-1", sessionNumber: 3, classId: "class-1",
      courseProcessId: "process-1", summary: "Tổng kết",
    })).toEqual({
      slotId: "slot-1", classSiteId: "site-1", sessionNumber: 3, classId: "class-1",
      courseProcessId: "process-1", slotType: "Default", totalScore: null, rank: "", summary: "<p>Tổng kết</p>",
    });
  });
});

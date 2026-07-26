import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import "../public/js/index/constants.js";
import "../public/js/index/assessments.js";
import "../public/js/index/comments.js";
import { app } from "../public/js/index/registry.js";
import { state } from "../public/js/index/state.js";

const studentId = "student-1";
const attendance = { _id: "attendance-1", student: { id: studentId, fullName: "Nguyễn Minh Anh" } };

function uiState(overrides: Record<string, unknown> = {}) {
  return {
    studentId,
    fullName: "Nguyễn Minh Anh",
    initials: "MA",
    attendance: { badgeClass: "badge-success", text: "Có mặt" },
    existingComment: "",
    generatedComment: "",
    note: "",
    learningLevel: "understands_and_asks",
    learningLevelInfo: app.LEARNING_LEVELS.understands_and_asks,
    assessmentStatus: { loading: false, error: false, className: "is-saved", text: "Đã lưu" },
    progress: { badgeClass: "badge-warning", text: "Chưa xử lý" },
    progressState: "pending",
    isPresent: true,
    hasRateScore: false,
    ...overrides,
  };
}

describe("regular-session quick comment UI contract", () => {
  beforeEach(() => {
    state.students = [];
    state.generatedComments = {};
    state.generatedCommentMeta = {};
    state.regularLearningLevelDrafts = {};
    state.regularNoteDrafts = {};
    state.regularServerSyncedAssessments = {};
    state.regularAssessmentTouched.clear();
    state.regularBulkLevelBusy = false;
    state.regularStudentBusy.clear();
    state.regularAssessmentSaveBusy.clear();
    app.getRegularStudentDomId = () => "student_1";
    app.getRegularStudentUiState = () => uiState();
    app.isRegularOperationActive = () => false;
    app.isPresentAttendance = (item: { status: string }) => item.status === "ATTENDED" || item.status === "LATE_ARRIVED";
    app.stripHtmlText = (value: unknown) => String(value || "").replace(/<[^>]*>/g, "");
    app.escapeHtml = (value: unknown) => String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
    app.escapeAttr = app.escapeHtml;
    app.escapeInlineJsAttr = (value: unknown) => String(value || "").replaceAll("'", "\\'");
  });

  it("renders L1–L4 as one-click actions with L3 selected and no separate generate button", () => {
    const html = app.buildRegularStudentDetail(attendance, 0);
    const renderedLevels = [...html.matchAll(/data-level-value="([^"]+)"/g)].map((match) => match[1]);

    expect((html.match(/learning-level-action/g) || [])).toHaveLength(4);
    expect(renderedLevels).toEqual(["needs_support", "needs_prompting", "understands_and_asks", "independent"]);
    expect(html).toMatch(/data-level-value="understands_and_asks"[\s\S]*?aria-pressed="true"/);
    expect(html).not.toContain('id="gen-btn-student_1"');
    expect(html).toContain("L3 là mặc định · bấm một mức để lưu và tạo");
    expect(html).toContain('<details class="regular-extra-details">');
    expect(html).not.toContain('<details class="regular-extra-details" open>');
  });

  it("exposes a visible loading state on the selected level action", () => {
    state.regularStudentBusy.add(studentId);
    app.getRegularStudentUiState = () => uiState();
    const html = app.buildRegularStudentDetail(attendance, 0);

    expect(html).toMatch(/learning-level-action is-selected is-loading[\s\S]*?aria-busy="true"/);
    expect(html).toContain("Đang tạo...");
  });

  it("hides all learning levels for an absent student and shows the absence action", () => {
    app.getRegularStudentUiState = () => uiState({
      attendance: { badgeClass: "badge-gray", text: "Vắng có phép" },
      isPresent: false,
    });
    const html = app.buildRegularStudentDetail(attendance, 0);

    expect(html).not.toContain("learning-level-action");
    expect(html).not.toContain("badge-learning-level");
    expect(html).toContain("Tạo nhận xét vắng");
    expect(html).toContain('id="gen-btn-student_1"');
    expect(html).toContain("Không đánh giá level cho học sinh vắng");
  });

  it("auto-advances circularly to the next visible present student without a draft or LMS comment", () => {
    const students = [
      { student: { id: "a" }, status: "ATTENDED", commentByAreas: [] },
      { student: { id: "b" }, status: "ATTENDED", commentByAreas: [{ type: "CONTENT", content: "<p>Đã có</p>" }] },
      { student: { id: "absent" }, status: "ABSENT", commentByAreas: [] },
      { student: { id: "c" }, status: "LATE_ARRIVED", commentByAreas: [] },
    ];
    state.students = students;
    state.generatedComments = { a: "<p>Bản nháp hiện tại</p>" };
    app.getVisibleStudents = () => students;
    expect(app.getNextPendingRegularStudentId("a")).toBe("c");
    state.generatedComments.c = "<p>Đã tạo</p>";
    expect(app.getNextPendingRegularStudentId("a")).toBeNull();
  });

  it("renders an accessible batch-level menu with L1–L4 actions", () => {
    const html = readFileSync("public/index.html", "utf8");
    const batchLevelSection = html.match(/<details class="batch-level-menu"[\s\S]*?<\/details>/)?.[0] || "";

    expect(batchLevelSection).toContain("Thay đổi mức độ hiểu bài cho toàn bộ học sinh có mặt");
    expect((batchLevelSection.match(/batch-level-action/g) || [])).toHaveLength(4);
    expect([...batchLevelSection.matchAll(/<span class="batch-level-code">(L[1-4])<\/span>/g)].map(match => match[1]))
      .toEqual(["L1", "L2", "L3", "L4"]);
  });

  it("sets one level for every present student while preserving notes and excluding absences", async () => {
    const students = [
      { student: { id: "a", fullName: "An" }, status: "ATTENDED" },
      { student: { id: "b", fullName: "Bình" }, status: "LATE_ARRIVED" },
      { student: { id: "c", fullName: "Chi" }, status: "ABSENT" },
    ];
    state.students = students;
    state.regularLearningLevelDrafts = {
      a: "understands_and_asks",
      b: "needs_prompting",
      c: "needs_support",
    };
    state.regularNoteDrafts = { a: "Ghi chú A", b: "Ghi chú B", c: "Ghi chú C" };
    const saved: Array<{ studentId: string; assessment: { learningLevel: string; note: string } }> = [];
    const toasts: string[] = [];
    app.captureRegularContext = () => ({ classId: "class", slotId: "slot" });
    app.isRegularContextCurrent = () => true;
    app.ensureRegularAssessmentsLoaded = async () => undefined;
    app.confirmDialog = async () => true;
    app.runWithConcurrency = async (items: unknown[], _limit: number, worker: (item: unknown) => Promise<void>) => {
      for (const item of items) await worker(item);
    };
    app.persistStudentAssessment = async (_context: unknown, currentStudentId: string, assessment: { learningLevel: string; note: string }) => {
      saved.push({ studentId: currentStudentId, assessment: { ...assessment } });
      state.regularAssessmentTouched.delete(currentStudentId);
      return true;
    };
    app.renderStudents = () => undefined;
    app.updateStats = () => undefined;
    app.syncRegularOperationLock = () => undefined;
    app.showToast = (message: string) => toasts.push(message);

    await app.setLearningLevelForAll("independent");

    expect(saved.map(item => item.studentId)).toEqual(["a", "b"]);
    expect(saved.every(item => item.assessment.learningLevel === "independent")).toBe(true);
    expect(saved.map(item => item.assessment.note)).toEqual(["Ghi chú A", "Ghi chú B"]);
    expect(state.regularLearningLevelDrafts.c).toBe("needs_support");
    expect(state.regularBulkLevelBusy).toBe(false);
    expect(toasts.at(-1)).toContain("Đã đặt L4 cho 2 học sinh có mặt");
  });

  it("restores only students whose bulk level save fails", async () => {
    const students = [
      { student: { id: "a", fullName: "An" }, status: "ATTENDED" },
      { student: { id: "b", fullName: "Bình" }, status: "ATTENDED" },
    ];
    state.students = students;
    state.regularLearningLevelDrafts = { a: "understands_and_asks", b: "needs_prompting" };
    app.captureRegularContext = () => ({ classId: "class", slotId: "slot" });
    app.isRegularContextCurrent = () => true;
    app.ensureRegularAssessmentsLoaded = async () => undefined;
    app.confirmDialog = async () => true;
    app.runWithConcurrency = async (items: unknown[], _limit: number, worker: (item: unknown) => Promise<void>) => {
      for (const item of items) await worker(item);
    };
    app.persistStudentAssessment = async (_context: unknown, currentStudentId: string) => {
      if (currentStudentId === "b") throw new Error("Không lưu được");
      state.regularAssessmentTouched.delete(currentStudentId);
      return true;
    };
    app.renderStudents = () => undefined;
    app.updateStats = () => undefined;
    app.syncRegularOperationLock = () => undefined;
    app.showToast = () => undefined;

    await app.setLearningLevelForAll("needs_support");

    expect(state.regularLearningLevelDrafts.a).toBe("needs_support");
    expect(state.regularLearningLevelDrafts.b).toBe("needs_prompting");
    expect(state.regularBulkLevelBusy).toBe(false);
  });
});

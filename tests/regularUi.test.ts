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
    state.selectedRegularStudentId = null;
    state.regularReviewSelectedStudentId = null;
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

  it("renders save-only L1–L4 controls plus a separate AI generation button", () => {
    const html = app.buildRegularStudentDetail(attendance, 0);
    const renderedLevels = [...html.matchAll(/data-level-value="([^"]+)"/g)].map((match) => match[1]);

    expect(renderedLevels).toEqual(["needs_support", "needs_prompting", "understands_and_asks", "independent"]);
    expect(html).toMatch(/data-level-value="understands_and_asks"[\s\S]*?aria-pressed="true"/);
    expect((html.match(/onclick="onRegularLearningLevelChange\('/g) || [])).toHaveLength(4);
    expect(html).not.toContain("generateAtLearningLevel");
    expect(html).toContain('id="gen-btn-student_1"');
    expect(html).toContain("Tạo nhận xét AI");
    expect(html).toContain("L3 là mặc định · chọn một mức để tự lưu");
    expect(html).toContain('<details class="regular-extra-details">');
    expect(html).not.toContain('<details class="regular-extra-details" open>');
  });

  it("shows generation loading on the dedicated AI button without turning the level into an action", () => {
    state.regularStudentBusy.add(studentId);
    app.getRegularStudentUiState = () => uiState();
    const html = app.buildRegularStudentDetail(attendance, 0);

    expect(html).toMatch(/id="gen-btn-student_1"[\s\S]*?aria-busy="true"[\s\S]*?Đang tạo\.\.\./);
    expect(html).not.toMatch(/learning-level-option[^\"]*is-loading/);
  });

  it("changing a level queues autosave without invoking comment generation", () => {
    const originals = {
      refreshRegularAssessmentIndicators: app.refreshRegularAssessmentIndicators,
      queueRegularLearningLevelAutosave: app.queueRegularLearningLevelAutosave,
      generateRegularComment: app.generateRegularComment,
    };
    const saved: string[] = [];
    let generationCalls = 0;
    app.refreshRegularAssessmentIndicators = () => undefined;
    app.queueRegularLearningLevelAutosave = (currentStudentId: string) => {
      saved.push(currentStudentId);
      return Promise.resolve();
    };
    app.generateRegularComment = async () => {
      generationCalls += 1;
    };

    try {
      app.onRegularLearningLevelChange(studentId, "independent");
      expect(state.regularLearningLevelDrafts[studentId]).toBe("independent");
      expect(state.regularAssessmentTouched.has(studentId)).toBe(true);
      expect(saved).toEqual([studentId]);
      expect(generationCalls).toBe(0);
    } finally {
      Object.assign(app, originals);
    }
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

  it("uses the final name when unique and adds the preceding name only for duplicates", () => {
    const uniqueRoster = [
      { student: { fullName: "Nguyễn Minh Anh" } },
      { student: { fullName: "Trần Gia Huy" } },
      { student: { fullName: "Lê An" } },
      { student: { fullName: "Bin" } },
    ];
    expect(app.getStudentCallName("Nguyễn Minh Anh", uniqueRoster)).toBe("Anh");
    expect(app.getStudentCallName("Trần Gia Huy", uniqueRoster)).toBe("Huy");
    expect(app.getStudentCallName("Lê An", uniqueRoster)).toBe("An");
    expect(app.getStudentCallName("Bin", uniqueRoster)).toBe("Bin");

    const duplicateRoster = [
      { student: { fullName: "Nguyễn Minh Anh" } },
      { student: { fullName: "Trần Hoàng Anh" } },
      { student: { fullName: "Trần Gia Huy" } },
      { student: { fullName: "  Phạm Đức HUY  " } },
    ];
    expect(app.getStudentCallName("Nguyễn Minh Anh", duplicateRoster)).toBe("Minh Anh");
    expect(app.getStudentCallName("Trần Hoàng Anh", duplicateRoster)).toBe("Hoàng Anh");
    expect(app.getStudentCallName("Trần Gia Huy", duplicateRoster)).toBe("Gia Huy");
    expect(app.getStudentCallName("Phạm Đức HUY", duplicateRoster)).toBe("Đức HUY");
  });

  it("keeps both main and review selections on the requested student after single generation", async () => {
    const currentAttendance = {
      ...attendance,
      status: "ATTENDED",
      commentByAreas: [],
    };
    state.students = [
      currentAttendance,
      { _id: "attendance-2", student: { id: "student-2", fullName: "Trần Gia Huy" }, status: "ATTENDED", commentByAreas: [] },
    ];
    state.selectedRegularStudentId = studentId;
    state.regularReviewSelectedStudentId = studentId;
    state.regularLearningLevelDrafts[studentId] = "independent";

    const originalDocument = globalThis.document;
    const originals = {
      captureRegularContext: app.captureRegularContext,
      ensureRegularAssessmentsLoaded: app.ensureRegularAssessmentsLoaded,
      waitForRegularAssessmentAutosave: app.waitForRegularAssessmentAutosave,
      snapshotRegularStudent: app.snapshotRegularStudent,
      persistStudentAssessment: app.persistStudentAssessment,
      getPreviousHomeworkStatusForStudent: app.getPreviousHomeworkStatusForStudent,
      getSelectedModelConfig: app.getSelectedModelConfig,
      fetchJSON: app.fetchJSON,
      syncRegularOperationLock: app.syncRegularOperationLock,
      renderStudents: app.renderStudents,
      updateStats: app.updateStats,
      showToast: app.showToast,
      isRegularContextCurrent: app.isRegularContextCurrent,
    };
    let requestBody: Record<string, unknown> | null = null;
    let selectionSeenDuringRender: { regular: string | null; review: string | null } | null = null;

    globalThis.document = {
      getElementById: () => null,
    } as unknown as Document;
    app.captureRegularContext = () => ({
      classId: "class-1",
      className: "Lớp thử nghiệm",
      slotId: "slot-1",
      sessionNumber: 3,
      classSiteId: "site-1",
      courseProcessId: "course-1",
      assessmentEpoch: 1,
      summary: "Ôn tập vòng lặp",
    });
    app.isRegularContextCurrent = () => true;
    app.ensureRegularAssessmentsLoaded = async () => undefined;
    app.waitForRegularAssessmentAutosave = async () => undefined;
    app.snapshotRegularStudent = () => ({
      attendanceId: "attendance-1",
      studentId,
      studentName: "Nguyễn Minh Anh",
      studentCallName: "Anh",
      attendanceStatus: "ATTENDED",
      isLate: false,
      assessment: { learningLevel: "independent", note: "" },
      pastSlots: [],
    });
    app.persistStudentAssessment = async () => true;
    app.getPreviousHomeworkStatusForStudent = async () => null;
    app.getSelectedModelConfig = () => ({
      aiModel: "gpt-test",
      customModelId: "",
      thinkingLevel: "off",
      aiApiKey: "test-key",
    });
    app.fetchJSON = async (_url: string, body: Record<string, unknown>) => {
      requestBody = body;
      return { comment: "<p>Anh nắm vững kiến thức và tự hoàn thành bài.</p>" };
    };
    app.syncRegularOperationLock = () => undefined;
    app.renderStudents = () => {
      selectionSeenDuringRender = {
        regular: state.selectedRegularStudentId,
        review: state.regularReviewSelectedStudentId,
      };
    };
    app.updateStats = () => undefined;
    app.showToast = () => undefined;

    try {
      await app.generateSingle(studentId);
      expect(state.selectedRegularStudentId).toBe(studentId);
      expect(state.regularReviewSelectedStudentId).toBe(studentId);
      expect(selectionSeenDuringRender).toEqual({ regular: studentId, review: studentId });
      expect(state.generatedComments).toEqual({
        [studentId]: "<p>Anh nắm vững kiến thức và tự hoàn thành bài.</p>",
      });
      expect(requestBody).toMatchObject({
        student_id: studentId,
        student_name: "Nguyễn Minh Anh",
        student_call_name: "Anh",
      });
    } finally {
      Object.assign(app, originals);
      globalThis.document = originalDocument;
    }
  });

  it("uses the full student name before the colon in class-wide Zalo output", () => {
    const source = readFileSync("public/js/index/comments.js", "utf8");
    expect(source).toContain("allText += `- ${studentName}: ${cleanComment}\\n\\n`;");
    expect(source).not.toContain("allText += `- ${shortName}: ${cleanComment}\\n\\n`;");
  });

  it("passes the written homework evaluation to comments without passing the score", () => {
    const source = readFileSync("public/js/index/classes.js", "utf8");
    const helper = source.match(/async function getPreviousHomeworkStatusForStudent[\s\S]*?\nfunction getCheckpointNumber/)?.[0] || "";

    expect(helper).toContain("evaluation_note: String(submission?.note || '').trim()");
    expect(helper).not.toMatch(/\bscore\s*:/);
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

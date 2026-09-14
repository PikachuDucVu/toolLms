import { describe, expect, it } from "vitest";
import { normalizeClassDetail } from "../src/services/classService";
import {
  abilityScore,
  buildDemoRandomPreview,
  buildFinalDemoPayload,
  demoRank,
  finalDemoScore,
  randomScoreAbove75,
  randomScoreAtLeast75,
  resolveDemoSchema,
} from "../src/services/demoSubmissionService";
import {
  buildCheckpointPayload,
  checkpointRank,
  CheckpointStatusMalformedError,
  CheckpointStatusTimeoutError,
  CheckpointStatusUpstreamError,
  fetchCheckpointStatus,
  normalizeCheckpointStatus,
  parseCheckpointScore,
  resolveCheckpointScores,
} from "../src/services/checkpointService";

function rawClass(options: { course?: string; dynamic?: boolean } = {}) {
  const slots = Array.from({ length: 14 }, (_, index) => ({
    _id: `slot-${index + 1}`, index, date: "2026-07-01", summary: "",
    studentAttendance: [{ _id: "attendance-1", student: { id: "student-1", fullName: "Nguyễn Văn An" }, status: "ATTENDED", commentByAreas: [] }],
  }));
  return {
    id: "class-1", name: options.course || "Lớp Hackathon", status: "RUNNING", startDate: "2026-01-01", endDate: "2099-01-01",
    courseProcessId: "process-1", course: { id: "course-1", name: options.course || "Hackathon", shortName: options.course || "PTA" },
    classSites: [{ _id: "site-1", name: "Online" }],
    courseProcess: { id: "process-1", name: "Process", finalSession: {
      finalEvaluations: [{ id: "final-skills", title: "KỸ NĂNG", commentAreas: [{ id: "dynamic-rate", name: "Logic", type: "RATE", rates: [{ value: 5, commentSamples: ["- Mẫu năng lực động"] }] }] }],
      demoScore: options.dynamic ? { id: "dynamic-demo", commentAreas: [{ id: "dynamic-area", name: "Demo động", type: "DEMO", demo: [
        { id: "dynamic-q1", title: "Tiêu chí <một>", maxScore: 3 }, { id: "dynamic-q2", title: "Tiêu chí hai", maxScore: 2 },
      ] }] } : null,
    } }, slots,
  };
}

function detail(options: { course?: string; dynamic?: boolean } = {}) {
  const normalized = normalizeClassDetail(rawClass(options));
  if (!normalized) throw new Error("invalid fixture");
  return normalized;
}

function demoBuild(options: { course?: string; dynamic?: boolean; autoRate?: boolean; customScores?: Array<{ questionId: string; score: number }> } = {}) {
  const classDetail = detail(options);
  const slot = classDetail.slots[13];
  return buildFinalDemoPayload({
    classDetail, slot, attendance: slot.studentAttendance[0], classSiteId: "site-1", courseProcessId: "process-1", sessionNumber: 14,
    request: {
      classId: "class-1", studentId: "student-1", attendanceId: "attendance-1", summaryMode: "optional",
      autoRate: options.autoRate ?? true, customScores: options.customScores,
    },
  }, () => 0);
}

function checkpointBuild(scores: any, mode: "score_only" | "full" = "full") {
  const classDetail = detail();
  const slot = classDetail.slots[4];
  return buildCheckpointPayload({
    classDetail, slot, attendance: slot.studentAttendance[0], classSiteId: "site-1", courseProcessId: "process-1", sessionNumber: 5,
    request: {
      mode, classId: "class-1", studentId: "student-1", attendanceId: "attendance-1", summaryMode: "optional", scores,
      ...(mode === "full" ? { comment: "<p>Nhận xét checkpoint</p>" } : {}),
    },
  }, () => 0);
}

describe("Phase 9A Demo golden builders", () => {
  it("resolves dynamic and all fixed fallback schemas in legacy order", () => {
    expect(resolveDemoSchema(detail({ dynamic: true }))).toEqual({
      source: "dynamic", fallbackKind: null, label: "Demo động", maxScore: 5,
      questions: [{ id: "dynamic-q1", title: "Tiêu chí <một>", maxScore: 3 }, { id: "dynamic-q2", title: "Tiêu chí hai", maxScore: 2 }],
    });
    expect(resolveDemoSchema(detail({ course: "C4K-GA" })).fallbackKind).toBe("GA");
    expect(resolveDemoSchema(detail({ course: "C4K-GB" })).fallbackKind).toBe("GB");
    expect(resolveDemoSchema(detail({ course: "PTB" })).fallbackKind).toBe("HACKATHON");
    expect(resolveDemoSchema(detail({ course: "Unknown" })).fallbackKind).toBe("HACKATHON");
    expect(resolveDemoSchema(detail({ course: "C4K-GA" })).questions.map((q) => q.id)).toEqual([
      "67074e6255bde440385042da", "67074e6255bde440385042db", "67074e6255bde440385042dc", "67074e6255bde440385042dd", "67074e6255bde440385042de",
    ]);
  });

  it("preserves displayed >=75% preview versus submit fallback strictly >75%", () => {
    expect(randomScoreAtLeast75(5, () => 0)).toBe(3.75);
    expect(randomScoreAbove75(5, () => 0)).toBe(4);
    expect(buildDemoRandomPreview(detail(), () => 0)).toMatchObject({ demoScore: 3.75, questions: [{ score: 3.75 }] });
    expect(buildDemoRandomPreview(detail(), () => 0, { minScore: 4, maxScore: 4.5 })).toMatchObject({ demoScore: 4, questions: [{ score: 4 }] });
    expect(demoBuild({ autoRate: false }).totalDemoScore).toBe(4);
  });

  it("matches dynamic custom-score, RATE/DEMO order, HTML, score weighting and rank semantics", () => {
    const built = demoBuild({ dynamic: true, customScores: [{ questionId: "dynamic-q1", score: 2.5 }, { questionId: "dynamic-q2", score: 1.75 }] });
    const payload = built.payload as any;
    expect(built.totalDemoScore).toBe(4.25);
    expect(built.abilityScore).toBe(5);
    expect(built.totalScore).toBe(4.6);
    expect(built.rank).toBe("A");
    expect(payload.slotType).toBe("Final");
    expect(payload.studentComment.byAreas.map((area: any) => area.type)).toEqual(["RATE", "DEMO"]);
    expect(payload.studentComment.byAreas[0]).toEqual({
      grade: 5, content: "- Mẫu năng lực động", commentAreaId: "dynamic-rate", courseProcessFinalEvaluationTitle: "KỸ NĂNG", courseProcessFinalEvaluationId: "final-skills", demoQuestions: [], type: "RATE",
    });
    expect(payload.studentComment.byAreas[1]).toMatchObject({ commentAreaId: "dynamic-area", courseProcessDemoId: "dynamic-demo", type: "DEMO", demoQuestions: [
      { courseProcessDemoDetailId: "dynamic-q1", score: 2.5, title: "Tiêu chí <một>", result: false, maxScore: 3 },
      { courseProcessDemoDetailId: "dynamic-q2", score: 1.75, title: "Tiêu chí hai", result: false, maxScore: 2 },
    ] });
    expect(payload.studentComment.content).toContain("Tiêu chí &lt;một&gt;: 2.5 điểm");
    expect(payload.studentComment.content).toContain("​Điểm năng lực: </strong><strong style=\"color:rgb(226, 80, 65)\">5 điểm");
    expect(payload).not.toHaveProperty("summary");
    expect(payload).toMatchSnapshot("dynamic Demo payload with RATE areas and seeded custom scores");
  });

  it("omits RATE areas when autoRate is false and applies exact Demo ranks", () => {
    const built = demoBuild({ autoRate: false, customScores: [{ questionId: "66c44cf76ae1a9fab631679c", score: 4 }] });
    const payload = built.payload as any;
    expect(payload.studentComment.byAreas).toHaveLength(1);
    expect(payload.studentComment.byAreas[0]).toMatchObject({ grade: 0, type: "DEMO" });
    expect(payload.studentComment.content).not.toContain("Điểm năng lực");
    expect(abilityScore([])).toBe(0);
    expect(finalDemoScore(4.25, [])).toBe(4.3);
    expect([4.5, 4, 2.5, 2.49].map(demoRank)).toEqual(["A", "B", "C", "D"]);
    expect(payload).toMatchSnapshot("Hackathon fallback Demo payload with autoRate false");
  });
});

describe("Phase 9A Checkpoint golden builders", () => {
  it("parses 0-5 half-step scores and preserves blank/one/both score behavior", () => {
    expect(parseCheckpointScore(0)).toBe(0);
    expect(parseCheckpointScore("4.5")).toBe(4.5);
    expect(parseCheckpointScore("")).toBeNull();
    expect(() => parseCheckpointScore(4.25)).toThrow("bước 0.5");
    expect(() => parseCheckpointScore(5.5)).toThrow("0-5");
    expect(resolveCheckpointScores({ strategy: "auto" }, () => 0)).toEqual({ theoryScore: 4, practiceScore: 4 });
    expect(resolveCheckpointScores({ strategy: "explicit", theoryScore: 4.5, practiceScore: null }, () => 0)).toEqual({ theoryScore: 4.5, practiceScore: 4 });
    expect(resolveCheckpointScores({ strategy: "explicit", theoryScore: null, practiceScore: 5 }, () => 0)).toEqual({ theoryScore: 4, practiceScore: 5 });
  });

  it("matches ten fixed question IDs, seeded shuffle, areas, Quill HTML, average and ranks", () => {
    const built = checkpointBuild({ strategy: "explicit", theoryScore: 4.5, practiceScore: 4 });
    const payload = built.payload as any;
    const checkpointArea = payload.studentComment.byAreas.at(-1);
    expect(built).toMatchObject({ theoryScore: 4.5, practiceScore: 4, totalScore: 4.3, rank: "B" });
    expect(checkpointArea.checkpoint.checkpointQuestions.map((q: any) => q.id)).toEqual([
      "668e2f99e71f90e7630d4594", "668e2f99e71f90e7630d4595", "668e2f99e71f90e7630d4596", "668e2f99e71f90e7630d4597", "668e2f99e71f90e7630d4598",
      "668e2f99e71f90e7630d4599", "668e2f99e71f90e7630d459a", "668e2f99e71f90e7630d459b", "668e2f99e71f90e7630d459c", "668e2f99e71f90e7630d459d",
    ]);
    expect(checkpointArea.checkpoint.checkpointQuestions.map((q: any) => q.result)).toEqual([true, true, true, true, true, true, true, true, false, true]);
    expect(checkpointArea.checkpoint.checkpointQuestions.filter((q: any) => q.result)).toHaveLength(9);
    expect(payload.studentComment.byAreas.map((area: any) => area.type)).toEqual(["RATE", "RATE", "RATE", "RATE", "RATE", "RATE", "RATE", "RATE", "RATE", "RATE", "CONTENT", "CHECKPOINT"]);
    expect(payload.studentComment.byAreas[9].commentAreaId).toBe("670777c055bde44038509a1b");
    expect(payload.studentComment.byAreas[10]).toEqual({ content: "<p>Nhận xét checkpoint</p>", commentAreaId: "67b54307f79c7bc326e017ff", type: "CONTENT" });
    expect(checkpointArea.content).toBe("Điểm thực hành: 4\n    <p>Điểm trắc nghiệm: 4.5</p>");
    expect(payload.studentComment.content).toContain('<li data-list="bullet"><span class="ql-ui"></span><span style="color:rgb(0, 0, 0)">1. : 0.5 điểm</span></li>');
    expect([4.5, 3.5, 2.5, 2.49].map(checkpointRank)).toEqual(["A", "B", "C", "D"]);
    expect(payload).toMatchSnapshot("Checkpoint explicit-score payload with seeded shuffle");
  });

  it("uses score-only fallback comment and auto scores when both inputs are blank", () => {
    const built = checkpointBuild({ strategy: "auto" }, "score_only");
    const payload = built.payload as any;
    expect(built).toMatchObject({ theoryScore: 4, practiceScore: 4, totalScore: 4, rank: "B" });
    expect(payload.studentComment.byAreas[10].content).toBe("<p>Học sinh hoàn thành bài kiểm tra checkpoint.</p>");
    expect(payload).toMatchSnapshot("Checkpoint both-blank auto-score payload");
  });
});

describe("Phase 9A checkpoint status proxy normalization", () => {
  const raw = {
    original: { id: "exam-original", title: "Checkpoint 1", status: "ACTIVE", practiceType: "SCRATCH" },
    makeup: { id: "exam-makeup", title: "Kiểm tra bù", status: "ACTIVE", practiceType: "ESSAY" },
    students: [{ studentId: "student-1",
      original: { examId: "exam-original", submittedAt: "2026-07-01T10:00:00Z", practiceType: "SCRATCH", hasScratchFinal: true, essayFiles: [] },
      makeup: { examId: "exam-makeup", submittedAt: "2026-07-02T10:00:00Z", practiceType: "ESSAY", essayFiles: [{ fileName: "demo.zip", url: "https://files.example/demo.zip" }] },
    }],
  };

  it("normalizes original/makeup, latest branch and backend-owned links", () => {
    const result = normalizeCheckpointStatus(raw, "class-1", 1);
    expect(result.students[0]).toEqual({
      studentId: "student-1", defaultBranch: "makeup",
      original: { branch: "original", submittedAt: "2026-07-01T10:00:00Z", practiceType: "SCRATCH", links: [{ kind: "scratch", label: "Xem Scratch", url: "https://kiemtra.ducvu.io.vn/view/scratch/exam-original/student-1" }] },
      makeup: { branch: "makeup", submittedAt: "2026-07-02T10:00:00Z", practiceType: "ESSAY", links: [{ kind: "essay", label: "demo.zip", url: "https://files.example/demo.zip" }] },
    });
  });

  it("drops deleted exams and their student branches", () => {
    const result = normalizeCheckpointStatus({ ...raw, original: { id: "deleted", status: "DELETED" } }, "class-1", 1);
    expect(result.original).toBeNull();
    expect(result.students[0].original).toBeNull();
    expect(result.students[0].defaultBranch).toBe("makeup");
  });

  it("rejects malformed, non-2xx and timed-out external responses", async () => {
    expect(() => normalizeCheckpointStatus({ students: [{ studentId: "student-1", original: {} }], original: { id: "exam", status: "ACTIVE" } }, "class-1", 1)).toThrow(CheckpointStatusMalformedError);
    await expect(fetchCheckpointStatus("class-1", 1, async () => new Response("bad", { status: 503 }))).rejects.toBeInstanceOf(CheckpointStatusUpstreamError);
    await expect(fetchCheckpointStatus("class-1", 1, async () => new Response("not-json"))).rejects.toBeInstanceOf(CheckpointStatusMalformedError);
    const hanging: typeof fetch = async (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    });
    await expect(fetchCheckpointStatus("class-1", 1, hanging, 5)).rejects.toBeInstanceOf(CheckpointStatusTimeoutError);
  });
});

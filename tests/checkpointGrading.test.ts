import { describe, expect, it } from "vitest";
import { extractJsonObject } from "../src/services/aiJson";
import { resolveGradeBranch } from "../src/services/checkpointGradeClient";
import {
  buildTeacherNotes,
  combinePracticeScores,
  gradeMcAnswers,
  isScratchFileName,
  normalizeMcChoice,
  roundCheckpointScore,
  theoryScoreFromMc,
} from "../src/services/checkpointGrading";
import type { CheckpointGradePayload } from "@tool-lms/contracts";

describe("checkpoint grading pure helpers", () => {
  it("rounds to 0.5 steps and maps MC accuracy onto 0-5", () => {
    expect(roundCheckpointScore(4.24)).toBe(4);
    expect(roundCheckpointScore(4.25)).toBe(4.5);
    expect(roundCheckpointScore(5.8)).toBe(5);
    expect(theoryScoreFromMc(10, 10)).toBe(5);
    expect(theoryScoreFromMc(9, 10)).toBe(4.5);
    expect(theoryScoreFromMc(0, 10)).toBe(0);
    expect(theoryScoreFromMc(3, 0)).toBeNull();
  });

  it("grades MC answers case-insensitively and treats blanks as wrong", () => {
    const result = gradeMcAnswers(
      { 1: "a", 2: "B.", 3: "" },
      [
        { number: 1, correct: "A", explanation: "" },
        { number: 2, correct: "B", explanation: "" },
        { number: 3, correct: "C", explanation: "" },
      ],
      3,
    );
    expect(result).toMatchObject({ total: 3, correct: 2 });
    expect(result.items[2].correct).toBe(false);
    expect(normalizeMcChoice(" b. ")).toBe("B");
  });

  it("skips Scratch filenames and builds teacher notes", () => {
    expect(isScratchFileName("project.sb3")).toBe(true);
    expect(isScratchFileName("main.py")).toBe(false);
    expect(buildTeacherNotes({
      theoryScore: 4,
      practiceScore: 4.5,
      mc: { total: 10, correct: 8, items: [
        { number: 3, studentAnswer: "A", correctAnswer: "C", correct: false },
        { number: 7, studentAnswer: "", correctAnswer: "B", correct: false },
      ] },
      essayNotes: "Bài làm đúng yêu cầu.",
      scratch: null,
      skippedScratch: true,
    })).toContain("Đã bỏ qua phần Scratch.");
  });

  it("reports graded and missing Scratch work in teacher notes", () => {
    const base = { theoryScore: null, practiceScore: 4, mc: { total: 0, correct: 0, items: [] }, essayNotes: "" };
    const graded = buildTeacherNotes({ ...base, scratch: { score: 4, notes: "Có vòng lặp.", submitted: true } });
    expect(graded).toBe("TH: 4/5. Scratch 4/5: Có vòng lặp.");
    expect(graded).not.toContain("bỏ qua");
    expect(buildTeacherNotes({ ...base, practiceScore: 0, scratch: { score: 0, notes: "", submitted: false } }))
      .toBe("TH: 0/5. Học sinh không nộp bài Scratch.");
  });

  it("averages the practical parts that exist", () => {
    expect(combinePracticeScores([null, null])).toBeNull();
    expect(combinePracticeScores([null, 3.5])).toBe(3.5);
    expect(combinePracticeScores([4, 3])).toBe(3.5);
    expect(combinePracticeScores([5, 4])).toBe(4.5);
  });
});

describe("AI JSON extraction", () => {
  it("reads fenced and raw objects", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJsonObject('prefix {"score":4.5,"note":"ok"} suffix')).toEqual({ score: 4.5, note: "ok" });
  });
});

describe("grade branch resolution", () => {
  const payload = {
    classId: "class-1",
    checkpoint: 1,
    original: {
      newestExamId: "exam-o",
      exams: {},
      submissions: {
        "student-1": {
          studentId: "student-1",
          studentName: "An",
          examId: "exam-o",
          submittedAt: "2026-07-01T08:00:00.000Z",
          mcAnswers: {},
          essayAnswers: {},
          essayFiles: [],
        },
      },
    },
    makeup: {
      newestExamId: "exam-m",
      exams: {},
      submissions: {
        "student-1": {
          studentId: "student-1",
          studentName: "An",
          examId: "exam-m",
          submittedAt: "2026-07-02T08:00:00.000Z",
          mcAnswers: {},
          essayAnswers: {},
          essayFiles: [],
        },
      },
    },
  } as unknown as CheckpointGradePayload;

  it("prefers an explicit branch then the newer submission", () => {
    expect(resolveGradeBranch(payload, "student-1", "original")).toEqual({ branch: "original", examId: "exam-o" });
    expect(resolveGradeBranch(payload, "student-1")).toEqual({ branch: "makeup", examId: "exam-m" });
  });
});

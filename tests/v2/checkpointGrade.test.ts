import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckpointGradeResponseSchema } from "@tool-lms/contracts";
import { app } from "../../src/router";
import type { Env, SessionRecord } from "../../src/types";

const session: SessionRecord = {
  id: "grade-session",
  email: "teacher@example.com",
  lmsToken: "token",
  tokenExpiry: 2_000_000_000,
  createdAt: "now",
  updatedAt: "now",
};

function rawDetail() {
  return {
    id: "class-1", name: "C4K-GA", status: "RUNNING", startDate: "2026-01-01", endDate: "2099-01-01", courseProcessId: "process-1",
    course: { id: "course-1", name: "C4K-GA", shortName: "C4K-GA" }, classSites: [{ _id: "site-1", name: "Online" }],
    courseProcess: { id: "process-1", name: "Process", finalSession: { finalEvaluations: [], demoScore: null } },
    slots: Array.from({ length: 14 }, (_, index) => ({
      _id: `slot-${index + 1}`, index, date: "2026-07-01", summary: "",
      studentAttendance: [{ _id: "attendance-1", student: { id: "student-1", fullName: "Nguyễn Văn An" }, status: "ATTENDED", commentByAreas: [] }],
    })),
  };
}

function env(authenticated = true): Env {
  return {
    ASSETS: { fetch: async () => new Response("asset") },
    DB: {
      prepare: () => ({
        bind() { return this; },
        all: async () => ({ results: [] }),
        first: async () => null,
        run: async () => ({ success: true }),
      }),
    },
    SESSION_CACHE: { get: async () => authenticated ? session : null, put: async () => undefined, delete: async () => undefined },
    TOKEN_CACHE: { get: async () => null, put: async () => undefined },
    ANTIGRAVITY_API_KEY: "server-key",
  } as unknown as Env;
}

function request(path: string, init: RequestInit = {}, currentEnv = env()) {
  const headers = new Headers(init.headers);
  headers.set("cookie", "lms_session=grade-session");
  if (init.method && !["GET", "HEAD", "OPTIONS"].includes(init.method) && !headers.has("origin")) headers.set("origin", "http://local.test");
  if (init.body) headers.set("content-type", "application/json");
  return app.request(`http://local.test${path}`, { ...init, headers }, currentEnv);
}

function gradePayload() {
  return {
    classId: "class-1",
    checkpoint: 1,
    original: {
      newestExamId: "exam-1",
      exams: {
        "exam-1": {
          id: "exam-1",
          className: "C4K-GA",
          checkpoint: 1,
          status: "ENDED",
          practiceType: "SCRATCH",
          mcQuestionCount: 10,
          essayQuestionCount: 0,
          essayQuestionConfigs: [],
          pdfPath: "/api/public/exams/exam-1/pdf",
        },
      },
      submissions: {
        "student-1": {
          studentId: "student-1",
          studentName: "Nguyễn Văn An",
          examId: "exam-1",
          submittedAt: "2026-07-01T10:00:00.000Z",
          mcAnswers: Object.fromEntries(Array.from({ length: 10 }, (_, index) => [String(index + 1), index < 9 ? "A" : "B"])),
          essayAnswers: {},
          essayFiles: [],
        },
      },
    },
    makeup: null,
  };
}

function mockNetwork() {
  const calls: Array<{ url: string; body?: unknown }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    if (url.includes("lms-api.mindx.edu.vn")) return Response.json({ data: { classesById: rawDetail() } });
    if (url.includes("/api/public/checkpoint-grade-payload")) return Response.json(gradePayload());
    if (url.includes("/api/public/exams/") && url.includes("/pdf")) {
      return new Response("%PDF-1.4", { headers: { "content-type": "application/pdf" } });
    }
    if (url.includes("ai.ducvu.io.vn")) {
      return Response.json({
        choices: [{
          message: {
            content: JSON.stringify({
              mc: Array.from({ length: 10 }, (_, index) => ({ number: index + 1, correct: "A", explanation: "Đúng" })),
              essay: [],
            }),
          },
        }],
      });
    }
    throw new Error(`Unexpected URL ${url}`);
  });
  return calls;
}

afterEach(() => vi.restoreAllMocks());

describe("v2 checkpoint AI grading", () => {
  it("grades MC from the kiemtra payload, skips scratch, and fills theory score", async () => {
    const calls = mockNetwork();
    const response = await request("/api/v2/checkpoints/grade", {
      method: "POST",
      body: JSON.stringify({
        classId: "class-1",
        slotId: "slot-5",
        studentId: "student-1",
        checkpoint: 1,
        modelId: "gpt-5.4",
        apiKey: "test-key",
      }),
    });
    expect(response.status).toBe(200);
    const result = CheckpointGradeResponseSchema.parse(await response.json()).data;
    expect(result).toMatchObject({
      studentId: "student-1",
      examId: "exam-1",
      branch: "original",
      skippedScratch: true,
      theoryScore: 4.5,
      practiceScore: null,
    });
    expect(result.mc.correct).toBe(9);
    expect(result.teacherNotes).toContain("Đã bỏ qua phần Scratch");
    expect(calls.some((call) => String(call.url).includes("checkpoint-grade-payload"))).toBe(true);
    expect(calls.some((call) => String(call.url).includes("/pdf"))).toBe(true);
  });

  it("rejects unauthenticated grading and non-checkpoint slots", async () => {
    mockNetwork();
    expect((await request("/api/v2/checkpoints/grade", { method: "POST", body: JSON.stringify({
      classId: "class-1", slotId: "slot-5", studentId: "student-1", checkpoint: 1,
    }) }, env(false))).status).toBe(401);

    const wrongSlot = await request("/api/v2/checkpoints/grade", {
      method: "POST",
      body: JSON.stringify({ classId: "class-1", slotId: "slot-1", studentId: "student-1", checkpoint: 1, apiKey: "test-key" }),
    });
    expect(wrongSlot.status).toBe(422);
  });
});

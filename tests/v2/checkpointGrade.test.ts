import { afterEach, describe, expect, it, vi } from "vitest";
import { CheckpointGradeResponseSchema } from "@tool-lms/contracts";
import { zipSync, strToU8 } from "fflate";
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

function scratchSb3() {
  const project = {
    targets: [
      { isStage: true, name: "Stage", variables: {}, lists: {}, blocks: {}, costumes: [], sounds: [] },
      {
        isStage: false, name: "Mèo", variables: {}, lists: {}, costumes: [], sounds: [],
        blocks: {
          hat: { opcode: "event_whenflagclicked", next: "move", topLevel: true, inputs: {}, fields: {} },
          move: { opcode: "motion_movesteps", next: null, topLevel: false, inputs: { STEPS: [1, [4, "10"]] }, fields: {} },
        },
      },
    ],
  };
  return zipSync({ "project.json": strToU8(JSON.stringify(project)) });
}

function mockNetwork(options: { scratch?: "submitted" | "missing" | "broken" } = {}) {
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
    if (url.includes("/api/public/scratch-project")) {
      if (options.scratch === "missing") return Response.json({ error: "Không tìm thấy dự án Scratch" }, { status: 404 });
      return new Response(options.scratch === "broken" ? new Uint8Array([1, 2, 3]) : scratchSb3(), { headers: { "content-type": "application/x.scratch.sb3" } });
    }
    if (url.includes("ai.ducvu.io.vn")) {
      if (JSON.stringify(body).includes("THỰC HÀNH SCRATCH")) {
        return Response.json({ choices: [{ message: { content: JSON.stringify({ score: 3.5, notes: "Có sự kiện cờ xanh và di chuyển." }) } }] });
      }
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
  const gradeBody = JSON.stringify({
    classId: "class-1", slotId: "slot-5", studentId: "student-1", checkpoint: 1, modelId: "gpt-5.4", apiKey: "test-key",
  });

  it("grades MC and the submitted Scratch project from the kiemtra payload", async () => {
    const calls = mockNetwork({ scratch: "submitted" });
    const response = await request("/api/v2/checkpoints/grade", { method: "POST", body: gradeBody });
    expect(response.status).toBe(200);
    const result = CheckpointGradeResponseSchema.parse(await response.json()).data;
    expect(result).toMatchObject({
      studentId: "student-1",
      examId: "exam-1",
      branch: "original",
      skippedScratch: false,
      scratch: { score: 3.5, submitted: true },
      theoryScore: 4.5,
      practiceScore: 3.5,
    });
    expect(result.mc.correct).toBe(9);
    expect(result.teacherNotes).toContain("Scratch 3.5/5");
    expect(calls.some((call) => String(call.url).includes("checkpoint-grade-payload"))).toBe(true);
    expect(calls.some((call) => String(call.url).includes("/pdf"))).toBe(true);
    const scratchCall = calls.find((call) => String(call.url).includes("/api/public/scratch-project"));
    expect(scratchCall?.url).toContain("examId=exam-1");
    expect(scratchCall?.url).toContain("studentId=student-1");
    const prompt = JSON.stringify(calls.find((call) => JSON.stringify(call.body ?? "").includes("THỰC HÀNH SCRATCH"))?.body);
    expect(prompt).toContain("khi bấm cờ xanh");
    expect(prompt).toContain("di chuyển (10) bước");
  });

  it("gives 0 when a Scratch exam has no saved project", async () => {
    mockNetwork({ scratch: "missing" });
    const response = await request("/api/v2/checkpoints/grade", { method: "POST", body: gradeBody });
    expect(response.status).toBe(200);
    const result = CheckpointGradeResponseSchema.parse(await response.json()).data;
    expect(result).toMatchObject({ practiceScore: 0, scratch: { score: 0, submitted: false } });
    expect(result.teacherNotes).toContain("không nộp bài Scratch");
  });

  it("refuses to guess a score when the Scratch file is unreadable", async () => {
    mockNetwork({ scratch: "broken" });
    const response = await request("/api/v2/checkpoints/grade", { method: "POST", body: gradeBody });
    expect(response.ok).toBe(false);
    expect(await response.text()).toContain("Không đọc được file Scratch");
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

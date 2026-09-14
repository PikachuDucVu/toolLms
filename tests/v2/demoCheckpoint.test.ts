import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CheckpointStatusResponseSchema,
  CheckpointSubmitResponseSchema,
  DemoRandomPreviewResponseSchema,
  DemoSchemaResponseSchema,
  DemoSubmitResponseSchema,
  GenerateCheckpointCommentResponseSchema,
} from "@tool-lms/contracts";
import { app } from "../../src/router";
import type { Env, SessionRecord } from "../../src/types";

const session: SessionRecord = { id: "phase9-session", email: "teacher@example.com", lmsToken: "token", tokenExpiry: 2_000_000_000, createdAt: "now", updatedAt: "now" };

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
    ASSETS: { fetch: async () => new Response("asset") }, DB: { prepare: () => ({ bind() { return this; }, all: async () => ({ results: [] }), run: async () => ({ success: true }) }) },
    SESSION_CACHE: { get: async () => authenticated ? session : null, put: async () => undefined, delete: async () => undefined },
    TOKEN_CACHE: { get: async () => null, put: async () => undefined },
  } as unknown as Env;
}

function request(path: string, init: RequestInit = {}, currentEnv = env()) {
  const headers = new Headers(init.headers);
  headers.set("cookie", "lms_session=phase9-session");
  if (init.method && !["GET", "HEAD", "OPTIONS"].includes(init.method) && !headers.has("origin")) headers.set("origin", "http://local.test");
  if (init.body) headers.set("content-type", "application/json");
  return app.request(`http://local.test${path}`, { ...init, headers }, currentEnv);
}

function mockNetwork(options: { detail?: any; status?: any; ai?: string; mutation?: any } = {}) {
  const calls: Array<{ url: string; body?: any }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    if (url.includes("lms-api.mindx.edu.vn")) {
      if (body.operationName === "GetClassById") return Response.json({ data: { classesById: options.detail ?? rawDetail() } });
      return Response.json(options.mutation ?? { data: { classes: { updateSlotComment: { id: "class-1" } } } });
    }
    if (url.includes("kiemtra.ducvu.io.vn")) return Response.json(options.status ?? { original: null, makeup: null, students: [] });
    if (url.includes("ai.ducvu.io.vn")) return Response.json({ choices: [{ message: { content: options.ai ?? "Điểm mạnh: An làm tốt. Điểm cần cải thiện: Em cần cẩn thận hơn. Lời khuyên: Con nên luyện tập thêm." } }] });
    throw new Error(`Unexpected URL ${url}`);
  });
  return calls;
}

afterEach(() => vi.restoreAllMocks());

describe("Phase 9A v2 Demo and Checkpoint routes", () => {
  it("exposes normalized Demo fallback schema and backend random preview", async () => {
    mockNetwork();
    const schemaResponse = await request("/api/v2/slots/slot-14/demo?classId=class-1");
    expect(schemaResponse.status).toBe(200);
    const schema = DemoSchemaResponseSchema.parse(await schemaResponse.json()).data.schema;
    expect(schema).toMatchObject({ source: "fallback", fallbackKind: "GA", label: "Demo2024 | GA", maxScore: 5 });
    expect(schema.questions.map((question) => question.id)).toHaveLength(5);

    const previewResponse = await request("/api/v2/slots/slot-14/demo/random-scores", { method: "POST", body: JSON.stringify({ classId: "class-1" }) });
    expect(previewResponse.status).toBe(200);
    const preview = DemoRandomPreviewResponseSchema.parse(await previewResponse.json()).data;
    preview.questions.forEach((question) => {
      expect(question.score).toBeGreaterThanOrEqual(Math.ceil(question.maxScore * 0.75 / 0.25) * 0.25);
      expect(question.score).toBeLessThanOrEqual(question.maxScore);
      expect(question.score * 4).toBe(Math.round(question.score * 4));
    });
  });

  it("submits one Demo student with server-owned context and explicit summary placement", async () => {
    const calls = mockNetwork();
    const response = await request("/api/v2/slots/slot-14/demo/submit", { method: "POST", body: JSON.stringify({
      classId: "class-1", studentId: "student-1", attendanceId: "attendance-1", summaryMode: "required", summary: "Tổng kết Demo", autoRate: false,
      customScores: [
        { questionId: "67074e6255bde440385042da", score: 1.5 }, { questionId: "67074e6255bde440385042db", score: 1 },
        { questionId: "67074e6255bde440385042dc", score: 0.5 }, { questionId: "67074e6255bde440385042dd", score: 0.5 },
        { questionId: "67074e6255bde440385042de", score: 1 },
      ],
    }) });
    expect(response.status).toBe(200);
    expect(DemoSubmitResponseSchema.parse(await response.json()).data).toMatchObject({ submitted: true, summaryIncluded: true, demoScore: 4.5, totalScore: 4.5, rank: "A" });
    const payload = calls.find((call) => call.body?.operationName === "UpdateSlotComment")!.body.variables.payload;
    expect(payload).toMatchObject({ slotId: "slot-14", classSiteId: "site-1", sessionNumber: 14, classId: "class-1", courseProcessId: "process-1", summary: "<p>Tổng kết Demo</p>", slotType: "Final" });
    expect(payload.studentComment).toMatchObject({ studentId: "student-1", studentAttendanceId: "attendance-1" });
  });

  it("submits score-only/full Checkpoint modes and enforces summary mode independently", async () => {
    const requiredMissing = await request("/api/v2/slots/slot-5/checkpoints/submit", { method: "POST", body: JSON.stringify({
      mode: "full", classId: "class-1", studentId: "student-1", attendanceId: "attendance-1", summaryMode: "required", scores: { strategy: "auto" }, comment: "<p>Tốt</p>",
    }) });
    expect(requiredMissing.status).toBe(422);

    const calls = mockNetwork();
    const response = await request("/api/v2/slots/slot-5/checkpoints/submit", { method: "POST", body: JSON.stringify({
      mode: "score_only", classId: "class-1", studentId: "student-1", attendanceId: "attendance-1", summaryMode: "optional",
      scores: { strategy: "explicit", theoryScore: 4.5, practiceScore: null },
    }) });
    expect(response.status).toBe(200);
    const result = CheckpointSubmitResponseSchema.parse(await response.json()).data;
    expect(result).toMatchObject({ submitted: true, mode: "score_only", summaryIncluded: false, theoryScore: 4.5 });
    expect([4, 4.5, 5]).toContain(result.practiceScore);
    const payload = calls.find((call) => call.body?.operationName === "UpdateSlotComment")!.body.variables.payload;
    expect(payload).not.toHaveProperty("summary");
    expect(payload.slotType).toBe("CheckPoint");
    expect(payload.studentComment.byAreas).toHaveLength(12);

    const full = await request("/api/v2/slots/slot-5/checkpoints/submit", { method: "POST", body: JSON.stringify({
      mode: "full", classId: "class-1", studentId: "student-1", attendanceId: "attendance-1", summaryMode: "required", summary: "Tổng kết Checkpoint",
      scores: { strategy: "explicit", theoryScore: 5, practiceScore: 4.5 }, comment: "<p>Nhận xét đầy đủ</p>",
    }) });
    expect(full.status).toBe(200);
    expect(CheckpointSubmitResponseSchema.parse(await full.json()).data).toMatchObject({ mode: "full", summaryIncluded: true, theoryScore: 5, practiceScore: 4.5 });
    const mutations = calls.filter((call) => call.body?.operationName === "UpdateSlotComment");
    expect(mutations.at(-1)!.body.variables.payload.summary).toBe("<p>Tổng kết Checkpoint</p>");
  });

  it("proxies normalized checkpoint status only after LMS class ownership validation", async () => {
    const calls = mockNetwork({ status: {
      original: { id: "exam-1", title: "Checkpoint", status: "ACTIVE", practiceType: "SCRATCH" }, makeup: null,
      students: [{ studentId: "student-1", original: { examId: "exam-1", submittedAt: "2026-07-01T10:00:00Z", practiceType: "SCRATCH", hasScratchFinal: true, essayFiles: [] }, makeup: null }],
    } });
    const response = await request("/api/v2/classes/class-1/checkpoints/1/status");
    expect(response.status).toBe(200);
    const status = CheckpointStatusResponseSchema.parse(await response.json()).data;
    expect(status.students[0].original?.links[0].kind).toBe("scratch");
    expect(calls.map((call) => call.url)).toEqual(expect.arrayContaining([expect.stringContaining("lms-api.mindx.edu.vn"), expect.stringContaining("kiemtra.ducvu.io.vn/api/public/checkpoint-status")]));

    vi.restoreAllMocks();
    const unauthenticatedCalls = mockNetwork();
    const unauthenticated = await request("/api/v2/classes/class-1/checkpoints/1/status", {}, env(false));
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticatedCalls).toHaveLength(0);
  });

  it("generates checkpoint comments with authoritative student identity and preserves the legacy route", async () => {
    const calls = mockNetwork();
    const v2 = await request("/api/v2/checkpoints/comments/generate", { method: "POST", body: JSON.stringify({
      classId: "class-1", slotId: "slot-5", studentId: "student-1", teacherDescription: "Tư duy tốt", modelId: "claude-sonnet-4-6", apiKey: "test-key",
    }) });
    expect(v2.status).toBe(200);
    expect(GenerateCheckpointCommentResponseSchema.parse(await v2.json()).data.comment).toContain("Điểm mạnh");
    const aiPrompt = JSON.stringify(calls.find((call) => call.url.includes("ai.ducvu.io.vn"))!.body.messages);
    expect(aiPrompt).toContain("HỌC SINH: Nguyễn Văn An");

    vi.restoreAllMocks();
    mockNetwork();
    const legacy = await request("/api/generate_checkpoint_comment", { method: "POST", body: JSON.stringify({ student_name: "Tên legacy", teacher_description: "Mô tả", model_id: "claude-sonnet-4-6", ai_api_key: "test-key" }) });
    expect(legacy.status).toBe(200);
    expect(await legacy.json()).toEqual({ comment: expect.any(String) });
  });

  it("rejects cross-origin, wrong student/attendance, wrong session and malformed domain inputs", async () => {
    expect((await request("/api/v2/slots/slot-14/demo/submit", { method: "POST", headers: { origin: "https://evil.example" }, body: "{}" })).status).toBe(403);
    mockNetwork();
    const wrongStudent = await request("/api/v2/slots/slot-14/demo/submit", { method: "POST", body: JSON.stringify({ classId: "class-1", studentId: "other", attendanceId: "attendance-1", summaryMode: "optional", autoRate: true }) });
    expect(wrongStudent.status).toBe(404);
    const wrongSession = await request("/api/v2/slots/slot-1/checkpoints/submit", { method: "POST", body: JSON.stringify({ mode: "score_only", classId: "class-1", studentId: "student-1", attendanceId: "attendance-1", summaryMode: "optional", scores: { strategy: "auto" } }) });
    expect(wrongSession.status).toBe(422);
    const quarterScore = await request("/api/v2/slots/slot-5/checkpoints/submit", { method: "POST", body: JSON.stringify({ mode: "score_only", classId: "class-1", studentId: "student-1", attendanceId: "attendance-1", summaryMode: "optional", scores: { strategy: "explicit", theoryScore: 4.25, practiceScore: 4.5 } }) });
    expect(quarterScore.status).toBe(422);
  });
});

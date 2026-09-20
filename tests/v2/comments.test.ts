import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GenerateCommentResponseSchema,
  SaveSummaryResponseSchema,
  SubmitCommentResponseSchema,
} from "@tool-lms/contracts";
import { app } from "../../src/router";
import { buildCommentFacts, buildSafeComment } from "../../src/services/commentPrompt";
import type { Env, SessionRecord } from "../../src/types";

const session: SessionRecord = {
  id: "session-comments",
  email: "teacher@example.com",
  lmsToken: "token",
  tokenExpiry: 2_000_000_000,
  createdAt: "now",
  updatedAt: "now",
};

function rawDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: "class-1",
    name: "Lớp nhận xét",
    status: "RUNNING",
    startDate: "2026-04-04",
    endDate: "2099-01-01",
    courseProcessId: "process-1",
    course: { id: "course-1", name: "Course", shortName: "C" },
    classSites: [{ _id: "site-1", name: "Online" }],
    slots: [{
      _id: "slot-1",
      index: 0,
      date: "2026-07-01",
      summary: "",
      studentAttendance: [
        { _id: "attendance-present", student: { id: "student-present", fullName: "Nguyễn Văn An" }, status: "ATTENDED", commentByAreas: [] },
        { _id: "attendance-absent", student: { id: "student-absent", fullName: "Trần Văn Bình" }, status: "ABSENT", commentByAreas: [] },
      ],
    }],
    ...overrides,
  };
}

function testDb(options: { failLog?: boolean } = {}) {
  const logBindings: unknown[][] = [];
  return {
    logBindings,
    prepare(sql: string) {
      let bindings: unknown[] = [];
      return {
        bind(...values: unknown[]) { bindings = values; return this; },
        async all<T>() { return { results: [] as T[] }; },
        async run() {
          if (sql.includes("INSERT INTO comment_log")) {
            if (options.failLog) throw new Error("log unavailable");
            logBindings.push(bindings);
          }
          return { success: true };
        },
      };
    },
  };
}

function env(db = testDb(), authenticated = true): Env {
  return {
    ASSETS: { fetch: async () => new Response("asset") },
    DB: db,
    SESSION_CACHE: {
      get: async () => authenticated ? session : null,
      put: async () => undefined,
      delete: async () => undefined,
    },
    TOKEN_CACHE: { get: async () => null, put: async () => undefined },
  } as unknown as Env;
}

function request(path: string, init: RequestInit = {}, currentEnv = env()) {
  const headers = new Headers(init.headers);
  headers.set("cookie", "lms_session=session-comments");
  if (init.method && !["GET", "HEAD", "OPTIONS"].includes(init.method) && !headers.has("origin")) headers.set("origin", "http://local.test");
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  return app.request(`http://local.test${path}`, { ...init, headers }, currentEnv);
}

function graphqlMock(detail: unknown, mutation: unknown = { data: { classes: { updateSlotComment: { id: "class-1", name: "Lớp" } } } }) {
  const calls: Array<{ operationName: string; variables: any; query: string }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes("lms-api.mindx.edu.vn")) throw new Error(`Unexpected external fetch ${url}`);
    const body = JSON.parse(String(init?.body));
    calls.push(body);
    return Response.json(body.operationName === "GetClassById" ? { data: { classesById: detail } } : mutation);
  });
  return calls;
}

function generationMock(detail: unknown, aiResponses: Response[]) {
  const lmsCalls: any[] = [];
  const aiCalls: any[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const body = JSON.parse(String(init?.body));
    if (url.includes("lms-api.mindx.edu.vn")) {
      lmsCalls.push(body);
      return Response.json({ data: { classesById: detail } });
    }
    aiCalls.push(body);
    const response = aiResponses.shift();
    if (!response) throw new Error(`Unexpected AI fetch ${url}`);
    return response;
  });
  return { lmsCalls, aiCalls };
}

const submitBody = {
  classId: "class-1",
  studentId: "student-present",
  attendanceId: "attendance-present",
  comment: "<p>An đi học đúng giờ và hoàn thành tốt.</p>",
  summary: "Ôn tập vòng lặp",
  learningLevel: "independent",
  generationMeta: { source: "ai_repair", transport: "direct", validationIssues: ["Thiếu khả năng tự vận dụng."] },
};

afterEach(() => vi.restoreAllMocks());

describe("v2 regular comments routes", () => {
  it("returns typed generation metadata and never exposes direct fallback instructions", async () => {
    const safe = buildSafeComment(buildCommentFacts({
      studentName: "Nguyễn Văn An", learningLevel: "understands_and_asks", attendanceStatus: "ATTENDED", commentLength: "medium",
    }));
    generationMock(rawDetail(), [
      new Response("error code: 522", { status: 522 }),
      Response.json({ choices: [{ message: { content: safe } }] }),
    ]);

    const response = await request("/api/v2/comments/generate", {
      method: "POST",
      body: JSON.stringify({
        classId: "class-1", slotId: "slot-1", studentId: "student-present", studentName: "Nguyễn Minh Anh",
        pastSlots: [], sessionSummary: "", teacherNote: "", learningLevel: "understands_and_asks",
        attendanceStatus: "ATTENDED", modelId: "claude-sonnet-4-6", thinkingLevel: "off", apiKey: "test-key",
      }),
    });

    expect(response.status).toBe(200);
    const raw = await response.json() as any;
    expect(raw).not.toHaveProperty("direct_fallback");
    expect(JSON.stringify(raw)).not.toContain("validation_policy");
    expect(GenerateCommentResponseSchema.parse(raw).data.meta).toEqual({ source: "ai", transport: "direct", validationIssues: [] });
  });

  it("uses the loaded slot number so sessions 10-13 generate product-progress comments", async () => {
    const safe = buildSafeComment(buildCommentFacts({
      studentName: "Nguyễn Văn An", learningLevel: "independent", attendanceStatus: "ATTENDED", commentLength: "medium", sessionNumber: 10,
    }));
    const detail = rawDetail({
      slots: Array.from({ length: 10 }, (_, index) => ({
        _id: `slot-${index + 1}`,
        index,
        date: "2026-07-01",
        summary: "",
        studentAttendance: [
          { _id: "attendance-present", student: { id: "student-present", fullName: "Nguyễn Văn An" }, status: "ATTENDED", commentByAreas: [] },
        ],
      })),
    });
    const calls = generationMock(detail, [Response.json({ choices: [{ message: { content: safe } }] })]);
    const response = await request("/api/v2/comments/generate", {
      method: "POST",
      body: JSON.stringify({
        classId: "class-1", slotId: "slot-10", studentId: "student-present", studentName: "Nguyễn Văn An",
        pastSlots: [], sessionSummary: "", teacherNote: "", learningLevel: "independent",
        attendanceStatus: "ATTENDED", modelId: "claude-sonnet-4-6", thinkingLevel: "off", apiKey: "test-key",
      }),
    });
    expect(response.status).toBe(200);
    const prompt = JSON.stringify(calls.aiCalls[0]);
    expect(prompt).toContain("BỐI CẢNH BUỔI LÀM SẢN PHẨM CUỐI KHÓA (SPCK)");
    expect(prompt).toContain("Vượt tiến độ");
  });

  it("uses a server Antigravity key without a request key or server OpenRouter key", async () => {
    const safe = buildSafeComment(buildCommentFacts({
      studentName: "Nguyễn Văn An", learningLevel: "independent", attendanceStatus: "ATTENDED", commentLength: "medium",
    }));
    const calls = generationMock(rawDetail(), [Response.json({ choices: [{ message: { content: safe } }] })]);
    const currentEnv = { ...env(), ANTIGRAVITY_API_KEY: "server-antigravity-key", OPENROUTER_API_KEY: undefined } as Env;
    const response = await request("/api/v2/comments/generate", {
      method: "POST",
      body: JSON.stringify({
        classId: "class-1", slotId: "slot-1", studentId: "student-present", studentName: "Nguyễn Văn An",
        pastSlots: [], sessionSummary: "", teacherNote: "", learningLevel: "independent",
        attendanceStatus: "ATTENDED", modelId: "gpt-5.4", thinkingLevel: "off",
      }),
    }, currentEnv);

    expect(response.status).toBe(200);
    expect(GenerateCommentResponseSchema.parse(await response.json()).data.meta.source).toBe("ai");
    expect(calls.aiCalls).toHaveLength(1);
  });

  it("saves exact plain summary semantics through a backend-owned summary-only mutation", async () => {
    const calls = graphqlMock(rawDetail());
    const response = await request("/api/v2/slots/slot-1/summary", {
      method: "PUT",
      body: JSON.stringify({ classId: "class-1", summary: "Ôn tập vòng lặp" }),
    });

    expect(response.status).toBe(200);
    expect(SaveSummaryResponseSchema.parse(await response.json()).data.summary).toBe("Ôn tập vòng lặp");
    expect(calls.map((call) => call.operationName)).toEqual(["GetClassById", "UpdateSlotComment"]);
    expect(calls[1].variables.payload).toEqual({
      slotId: "slot-1", classSiteId: "site-1", sessionNumber: 1, classId: "class-1", courseProcessId: "process-1",
      slotType: "Default", totalScore: null, rank: "", summary: "<p>Ôn tập vòng lặp</p>",
    });
    expect(calls[1].query).toContain("mutation UpdateSlotComment");
  });

  it.each([
    ["student-present", "attendance-present", "ATTENDED"],
    ["student-absent", "attendance-absent", "ABSENT"],
  ])("submits and logs one %s student after LMS success", async (studentId, attendanceId) => {
    const db = testDb();
    const calls = graphqlMock(rawDetail());
    const response = await request("/api/v2/slots/slot-1/comments/submit", {
      method: "POST",
      body: JSON.stringify({ ...submitBody, studentId, attendanceId }),
    }, env(db));

    expect(response.status).toBe(200);
    const result = SubmitCommentResponseSchema.parse(await response.json());
    expect(result.data).toMatchObject({ studentId, attendanceId, submitted: true, summaryIncluded: true, logged: true });
    const payload = calls[1].variables.payload;
    expect(calls[0].query).toContain("startDate");
    expect(payload.studentComment.studentId).toBe(studentId);
    expect(payload.studentComment.studentAttendanceId).toBe(attendanceId);
    expect(payload.studentComment.byAreas).toHaveLength(8);
    expect(db.logBindings).toHaveLength(1);
    const metadata = JSON.parse(String(db.logBindings[0][11]));
    expect(metadata).toMatchObject({
      class_id: "class-1", class_name: "Lớp nhận xét", session_number: 1,
      student_id: studentId, slot_type: "Default", learning_level: "independent",
      generation_source: "ai_repair", transport: "direct", repaired: true,
      validation_issues: ["Thiếu khả năng tự vận dụng."], success: true,
    });
  });

  it("keeps logging non-fatal and supports omission of summary for frontend-managed batch sequencing", async () => {
    const db = testDb({ failLog: true });
    const calls = graphqlMock(rawDetail({ startDate: "2026-04-05" }));
    const { summary: _summary, ...withoutSummary } = submitBody;
    const response = await request("/api/v2/slots/slot-1/comments/submit", {
      method: "POST",
      body: JSON.stringify(withoutSummary),
    }, env(db));

    const result = SubmitCommentResponseSchema.parse(await response.json());
    expect(result.data).toMatchObject({ submitted: true, summaryIncluded: false, logged: false });
    expect(calls[1].variables.payload).not.toHaveProperty("summary");
    expect(calls[1].variables.payload.studentComment.byAreas).toHaveLength(1);
  });

  it("normalizes LMS errors, does not log failed writes, and does not auto-retry a mutation", async () => {
    const db = testDb();
    const calls = graphqlMock(rawDetail(), { errors: [{ message: "LMS rejected comment" }] });
    const rejected = await request("/api/v2/slots/slot-1/comments/submit", {
      method: "POST", body: JSON.stringify(submitBody),
    }, env(db));
    expect(rejected.status).toBe(502);
    const rejectedBody = await rejected.json();
    expect(rejectedBody).toMatchObject({ error: { code: "UPSTREAM_ERROR", message: "Dịch vụ bên ngoài tạm thời không khả dụng. Vui lòng thử lại." } });
    expect(JSON.stringify(rejectedBody)).not.toContain("LMS rejected comment");
    expect(calls).toHaveLength(2);
    expect(db.logBindings).toHaveLength(0);

    vi.restoreAllMocks();
    let fetchCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      fetchCount += 1;
      const body = JSON.parse(String(init?.body));
      if (body.operationName === "GetClassById") return Response.json({ data: { classesById: rawDetail() } });
      return new Response(JSON.stringify({ error: "INVALID_TOKEN" }), { status: 403 });
    });
    const authFailure = await request("/api/v2/slots/slot-1/comments/submit", {
      method: "POST", body: JSON.stringify(submitBody),
    }, env(testDb()));
    expect(authFailure.status).toBe(401);
    expect(fetchCount).toBe(2);
  });

  it.each([
    ["class", rawDetail({ id: "class-other" }), { classId: "class-1", slotId: "slot-1", studentId: "student-present" }],
    ["slot", rawDetail(), { classId: "class-1", slotId: "slot-other", studentId: "student-present" }],
    ["student", rawDetail(), { classId: "class-1", slotId: "slot-1", studentId: "student-other" }],
  ])("rejects a generation request with an LMS-mismatched %s", async (_label, detail, ids) => {
    graphqlMock(detail);
    const response = await request("/api/v2/comments/generate", {
      method: "POST",
      body: JSON.stringify({
        ...ids,
        studentName: "Tên phía client",
        pastSlots: [], sessionSummary: "", teacherNote: "", learningLevel: "independent",
        attendanceStatus: "ATTENDED", modelId: "claude-sonnet-4-6", thinkingLevel: "off", apiKey: "test-key",
      }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("overrides conflicting client identity and attendance facts with matched LMS attendance", async () => {
    const safe = buildSafeComment(buildCommentFacts({
      studentName: "Nguyễn Văn An", learningLevel: "independent", attendanceStatus: "ATTENDED", commentLength: "medium",
    }));
    const calls = generationMock(rawDetail(), [Response.json({ choices: [{ message: { content: safe } }] })]);
    const response = await request("/api/v2/comments/generate", {
      method: "POST",
      body: JSON.stringify({
        classId: "class-1", slotId: "slot-1", studentId: "student-present", studentName: "Tên giả", studentCallName: "Tên gọi giả",
        pastSlots: [], sessionSummary: "", teacherNote: "", learningLevel: "independent",
        attendanceStatus: "ABSENT", isLate: true, modelId: "claude-sonnet-4-6", thinkingLevel: "off", apiKey: "test-key",
      }),
    });

    expect(response.status).toBe(200);
    expect(GenerateCommentResponseSchema.parse(await response.json()).data.meta).toEqual({
      source: "ai", transport: "server", validationIssues: [],
    });
    expect(calls.lmsCalls).toHaveLength(1);
    expect(calls.aiCalls).toHaveLength(1);
    const prompt = JSON.stringify(calls.aiCalls[0].messages);
    expect(prompt).toContain("HỌC SINH: Nguyễn Văn An");
    expect(prompt).toContain("CHUYÊN CẦN: Có mặt và đúng giờ");
    expect(prompt).not.toContain("Tên giả");
    expect(prompt).not.toContain("Tên gọi giả");
    expect(prompt).toContain("GỌI TRONG NHẬN XÉT: Văn An");
    expect(prompt).not.toContain("Vắng học");
    expect(prompt).not.toContain("Đi học muộn");
  });

  it.each([5, 9, 14])("rejects specialized session %s before calling AI", async (sessionNumber) => {
    const detail = rawDetail({
      slots: Array.from({ length: sessionNumber }, (_, index) => ({
        _id: `slot-${index + 1}`, index, date: "2026-07-01", summary: "",
        studentAttendance: [{
          _id: "attendance-present", student: { id: "student-present", fullName: "Nguyễn Văn An" },
          status: "ATTENDED", commentByAreas: [],
        }],
      })),
    });
    const calls = generationMock(detail, []);
    const response = await request("/api/v2/comments/generate", {
      method: "POST",
      body: JSON.stringify({
        classId: "class-1", slotId: `slot-${sessionNumber}`, studentId: "student-present", studentName: "Nguyễn Văn An",
        pastSlots: [], sessionSummary: "", teacherNote: "", learningLevel: "independent",
        attendanceStatus: "ATTENDED", modelId: "claude-sonnet-4-6", thinkingLevel: "off", apiKey: "test-key",
      }),
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
    expect(calls.lmsCalls).toHaveLength(1);
    expect(calls.aiCalls).toHaveLength(0);
  });

  it("validates auth, same-origin, IDs, class ownership, and regular-session eligibility", async () => {
    expect((await request("/api/v2/comments/generate", { method: "POST", body: "{}" }, env(testDb(), false))).status).toBe(401);
    const crossOrigin = await request("/api/v2/slots/slot-1/summary", {
      method: "PUT", headers: { origin: "https://evil.example" }, body: JSON.stringify({ classId: "class-1", summary: "Tổng kết" }),
    });
    expect(crossOrigin.status).toBe(403);
    expect((await request(`/api/v2/slots/${"x".repeat(201)}/summary`, {
      method: "PUT", body: JSON.stringify({ classId: "class-1", summary: "Tổng kết" }),
    })).status).toBe(422);

    graphqlMock(rawDetail());
    const wrongStudent = await request("/api/v2/slots/slot-1/comments/submit", {
      method: "POST", body: JSON.stringify({ ...submitBody, studentId: "student-other" }),
    });
    expect(wrongStudent.status).toBe(404);
    vi.restoreAllMocks();

    graphqlMock(rawDetail({ slots: Array.from({ length: 5 }, (_, index) => ({
      _id: `slot-${index + 1}`, index, date: "2026-07-01", summary: "",
      studentAttendance: [{ _id: "attendance-present", student: { id: "student-present", fullName: "An" }, status: "ATTENDED", commentByAreas: [] }],
    })) }));
    const checkpoint = await request("/api/v2/slots/slot-5/comments/submit", {
      method: "POST", body: JSON.stringify(submitBody),
    });
    expect(checkpoint.status).toBe(422);
  });

  it("preserves the legacy generation response envelope and aliases", async () => {
    const safe = buildSafeComment(buildCommentFacts({
      studentName: "Nguyễn Minh Anh", learningLevel: "understands_and_asks", attendanceStatus: "ATTENDED", commentLength: "medium",
    }));
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ choices: [{ message: { content: safe } }] }));
    const response = await request("/api/generate_comment", {
      method: "POST",
      body: JSON.stringify({
        student_id: "student-1", student_name: "Nguyễn Minh Anh", past_slots: [], session_summary: "",
        teacher_note: "", learning_level: "understands_and_asks", attendance_status: "ATTENDED",
        model_id: "claude-sonnet-4-6", thinking_level: "off", ai_api_key: "test-key",
      }),
    });
    const body = await response.json() as any;
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ comment: `<p>${safe}</p>`, generation_meta: { source: "ai", transport: "server" } });
    expect(body).not.toHaveProperty("data");
    expect(body).not.toHaveProperty("requestId");
  });
});

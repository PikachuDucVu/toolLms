import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GenerateCommentRequest } from "@tool-lms/contracts";
import type { AppConfig, Env } from "../src/types";
import { collectPastComments, generateRegularComment } from "../src/services/commentGenerationService";
import { buildCommentFacts, buildSafeComment, formatCommentHtml } from "../src/services/commentPrompt";

const env = {} as Env;
const config: AppConfig = {};
const input: GenerateCommentRequest = {
  classId: "class-1",
  slotId: "slot-1",
  studentId: "student-1",
  studentName: "Nguyễn Minh Anh",
  pastSlots: [],
  sessionSummary: "Ôn tập",
  teacherNote: "",
  learningLevel: "understands_and_asks",
  attendanceStatus: "ATTENDED",
  modelId: "claude-sonnet-4-6",
  thinkingLevel: "off",
  commentLength: "medium",
  customPrompt: "",
  apiKey: "test-key",
};

function aiResponse(content: string, status = 200): Response {
  return new Response(
    status >= 200 && status < 300 ? JSON.stringify({ choices: [{ message: { content } }] }) : content,
    { status, headers: { "Content-Type": status === 200 ? "application/json" : "text/plain" } },
  );
}

function aiJsonResponse(body: unknown): Response {
  return Response.json(body);
}

function safeComment() {
  return buildSafeComment(buildCommentFacts({
    studentName: input.studentName,
    learningLevel: input.learningLevel,
    attendanceStatus: input.attendanceStatus,
    sessionSummary: input.sessionSummary,
    commentLength: input.commentLength,
  }));
}

describe("regular comment generation service", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("preserves the legacy latest CONTENT traversal semantics", () => {
    expect(collectPastComments([
      { index: 1, commentByAreas: [{ type: "CONTENT", content: "Cũ" }] },
      { index: 2, commentByAreas: [{ type: "RATE", content: "Bỏ qua" }, { type: "CONTENT", content: "Mới" }] },
    ])).toBe("Buổi 2: Mới");
  });

  it.each([522, 524])("executes the characterized %s fallback server-side without returning browser instructions", async (status) => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(aiResponse(`error code: ${status}`, status))
      .mockResolvedValueOnce(aiResponse(safeComment()));

    const result = await generateRegularComment(env, config, input);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      comment: formatCommentHtml(safeComment()),
      generationMeta: { source: "ai", transport: "direct" },
    });
    expect(result).not.toHaveProperty("directFallback");
    expect(result).not.toHaveProperty("error");
  });

  it("repairs once during the server-owned direct fallback and preserves validation issues", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(aiResponse("error code: 522", 522))
      .mockResolvedValueOnce(aiResponse("Minh Anh học bình thường."))
      .mockResolvedValueOnce(aiResponse(safeComment()));

    const result = await generateRegularComment(env, config, input);

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result.generationMeta).toMatchObject({ source: "ai_repair", transport: "direct" });
    expect(result.generationMeta?.validationIssues?.length).toBeGreaterThan(0);
  });

  it("keeps the legacy repair attempt for an empty primary server completion", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(aiJsonResponse({ choices: [] }))
      .mockResolvedValueOnce(aiResponse(safeComment()));

    const result = await generateRegularComment(env, config, input);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      comment: formatCommentHtml(safeComment()),
      generationMeta: {
        source: "ai_repair",
        transport: "server",
        validationIssues: expect.any(Array),
      },
    });
    const repairBody = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body));
    expect(repairBody.messages.at(-1).content).toContain("Bản nháp trên chưa đạt vì");
  });

  it.each([
    ["empty choices", { choices: [] }],
    ["missing message", { choices: [{}] }],
    ["blank content", { choices: [{ message: { content: "   \n" } }] }],
  ])("uses the safe template immediately when the first direct response has %s", async (_label, directBody) => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(aiResponse("error code: 522", 522))
      .mockResolvedValueOnce(aiJsonResponse(directBody));

    const result = await generateRegularComment(env, config, input);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      comment: formatCommentHtml(safeComment()),
      generationMeta: {
        source: "safe_template",
        transport: "direct",
        validationIssues: ["Direct AI thất bại: AI không trả về nội dung"],
      },
    });
  });

  it("strictly rejects a blank direct repair completion", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(aiResponse("error code: 522", 522))
      .mockResolvedValueOnce(aiResponse("Học ổn."))
      .mockResolvedValueOnce(aiJsonResponse({ choices: [{ message: { content: "  " } }] }));

    const result = await generateRegularComment(env, config, input);

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result.comment).toBe(formatCommentHtml(safeComment()));
    expect(result.generationMeta).toEqual({
      source: "safe_template",
      transport: "direct",
      validationIssues: [
        "Nhận xét dùng cụm đánh giá mơ hồ.",
        "Thiếu mức độ nắm được kiến thức chính.",
        "Thiếu sự chủ động hỏi lại.",
        "Thiếu khả năng làm tiếp sau khi được giải đáp.",
        "Thiếu thông tin đi học đúng giờ.",
        "Độ dài chưa phù hợp (1 câu; cần 2–5 câu).",
        "Direct AI thất bại: AI không trả về nội dung",
      ],
    });
  });

  it("uses the safe template with direct transport when fallback and repair both fail validation", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(aiResponse("error code: 522", 522))
      .mockResolvedValueOnce(aiResponse("Học ổn."))
      .mockResolvedValueOnce(aiResponse("Học bình thường."));

    const result = await generateRegularComment(env, config, input);

    expect(result.comment).toBe(formatCommentHtml(safeComment()));
    expect(result.generationMeta).toMatchObject({ source: "safe_template", transport: "direct" });
    expect(result.generationMeta?.validationIssues?.length).toBeGreaterThan(0);
  });

  it("keeps non-timeout upstream failures as errors instead of invoking direct fallback", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(aiResponse("unavailable", 503));

    const result = await generateRegularComment(env, config, input);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.error).toContain("unavailable");
    expect(result.directFallback).toBeUndefined();
  });
});

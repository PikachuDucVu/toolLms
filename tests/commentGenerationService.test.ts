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

  it("accepts direct fallback AI comment output without rejecting based on evaluation criteria", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(aiResponse("error code: 522", 522))
      .mockResolvedValueOnce(aiResponse("Minh Anh học bình thường."));

    const result = await generateRegularComment(env, config, input);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.comment).toBe("<p>Minh Anh học bình thường.</p>");
    expect(result.generationMeta).toEqual({ source: "ai", transport: "direct" });
  });

  it.each([
    ["empty choices", { choices: [] }],
    ["missing message", { choices: [{}] }],
    ["blank content", { choices: [{ message: { content: "   \n" } }] }],
  ])("returns an error when the first direct response has %s", async (_label, directBody) => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(aiResponse("error code: 522", 522))
      .mockResolvedValueOnce(aiJsonResponse(directBody));

    const result = await generateRegularComment(env, config, input);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.generationMeta).toBeUndefined();
    expect(result.comment).toBe("");
    expect(result.error).toContain("AI không trả về nội dung");
  });

  it("returns an error when the AI gateway fails for a non-timeout error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(aiResponse("unavailable", 503));

    const result = await generateRegularComment(env, config, input);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.error).toContain("unavailable");
    expect(result.generationMeta).toBeUndefined();
    expect(result.comment).toBe("");
  });
});

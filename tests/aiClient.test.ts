import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppConfig, Env } from "../src/types";
import { generateCheckpointCommentWithAi, generateCommentWithAi } from "../src/services/aiClient";
import {
  buildCommentFacts,
  buildCommentMessages,
  buildSafeComment,
  buildValidationPolicy,
  formatCommentHtml,
} from "../src/services/commentPrompt";

const env = {} as Env;
const config: AppConfig = {};
const baseInput = {
  studentName: "Nguyễn Minh Anh",
  pastComments: "",
  notes: "",
  learningLevel: "understands_and_asks" as const,
  attendanceStatus: "ATTENDED" as const,
  sessionSummary: "Ôn tập kiến thức chính",
  commentLength: "medium",
  modelId: "claude-sonnet-4-6",
  aiApiKey: "test-key",
};

function aiResponse(content: string, status = 200): Response {
  return new Response(
    status >= 200 && status < 300
      ? JSON.stringify({ choices: [{ message: { content } }] })
      : content,
    { status, headers: { "Content-Type": status === 200 ? "application/json" : "text/plain" } },
  );
}

describe("checkpoint comment AI orchestration", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the standard checkpoint prompt for every individually generated comment", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(aiResponse("Điểm mạnh: Minh Anh có tư duy logic tốt. Điểm cần cải thiện: Em cần luyện thêm phần thực hành. Lời khuyên: Con nên làm thêm bài tập."));

    await generateCheckpointCommentWithAi(env, config, {
      studentName: "Nguyễn Minh Anh",
      teacherDescription: "Tư duy logic tốt; cần luyện thêm phần thực hành",
      modelId: "claude-sonnet-4-6",
      aiApiKey: "test-key",
    });

    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    const prompt = body.messages[0].content;
    expect(prompt).toContain("Điểm mạnh của học viên");
    expect(prompt).toContain("Điểm cần cải thiện");
    expect(prompt).toContain("Lời khuyên");
    expect(prompt).toContain("Tư duy logic tốt; cần luyện thêm phần thực hành");
    expect(prompt).not.toContain("TRẠNG THÁI: Học sinh vắng");
  });
});

describe("regular comment AI orchestration", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses one AI call and accepts the AI response directly", async () => {
    const valid = buildSafeComment(buildCommentFacts(baseInput));
    vi.mocked(fetch).mockResolvedValueOnce(aiResponse(valid));

    const result = await generateCommentWithAi(env, config, baseInput);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.generationMeta).toEqual({ source: "ai", transport: "server" });
    expect(result.comment).toBe(formatCommentHtml(valid));
  });

  it("accepts AI response directly without rejecting on validation criteria", async () => {
    const rawAiComment = "Minh Anh đi học đầy đủ. Con tiếp thu bài tốt và rất chủ động trong giờ học.";
    vi.mocked(fetch).mockResolvedValueOnce(aiResponse(rawAiComment));

    const result = await generateCommentWithAi(env, config, baseInput);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.generationMeta).toEqual({ source: "ai", transport: "server" });
    expect(result.comment).toBe(formatCommentHtml(rawAiComment));
    expect(result.error).toBeUndefined();
  });

  it("returns an error when AI returns blank content", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(aiResponse("   "));

    const result = await generateCommentWithAi(env, config, baseInput);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.generationMeta).toBeUndefined();
    expect(result.error).toContain("AI không trả về nội dung nhận xét");
    expect(result.comment).toBe("");
  });

  it("returns an error when the AI gateway call fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(aiResponse("upstream unavailable", 503));

    const result = await generateCommentWithAi(env, config, baseInput);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.generationMeta).toBeUndefined();
    expect(result.error).toContain("upstream unavailable");
  });

  it("returns a 522 direct-fallback envelope built from the exact same policy", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(aiResponse("error code: 522", 522))
      .mockResolvedValueOnce(aiResponse("error code: 522", 522));
    const facts = buildCommentFacts(baseInput);

    const result = await generateCommentWithAi(env, config, baseInput);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.error).toContain("522");
    expect(result.directFallback).toEqual({
      messages: buildCommentMessages(facts),
      validationPolicy: buildValidationPolicy(facts),
    });
  });
});

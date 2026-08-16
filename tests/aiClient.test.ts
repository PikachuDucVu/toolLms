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

  it("uses one AI call when the first response is valid", async () => {
    const valid = buildSafeComment(buildCommentFacts(baseInput));
    vi.mocked(fetch).mockResolvedValueOnce(aiResponse(valid));

    const result = await generateCommentWithAi(env, config, baseInput);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.generationMeta).toEqual({ source: "ai", transport: "server" });
    expect(result.comment).toBe(formatCommentHtml(valid));
  });

  it("repairs exactly once when the first response misses the level", async () => {
    const valid = buildSafeComment(buildCommentFacts(baseInput));
    vi.mocked(fetch)
      .mockResolvedValueOnce(aiResponse("Minh Anh đi học đúng giờ. Con học bình thường."))
      .mockResolvedValueOnce(aiResponse(valid));

    const result = await generateCommentWithAi(env, config, baseInput);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.generationMeta?.source).toBe("ai_repair");
    expect(result.generationMeta?.transport).toBe("server");
    expect(result.generationMeta?.validationIssues?.length).toBeGreaterThan(0);
    const secondBody = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body));
    expect(secondBody.messages.at(-1).content).toContain("Bản nháp trên chưa đạt vì");
  });

  it("uses the safe template when both AI drafts are invalid", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(aiResponse("Minh Anh học ổn."))
      .mockResolvedValueOnce(aiResponse("Con học bình thường."));

    const result = await generateCommentWithAi(env, config, baseInput);
    const expectedSafe = buildSafeComment(buildCommentFacts(baseInput));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.generationMeta?.source).toBe("safe_template");
    expect(result.comment).toBe(formatCommentHtml(expectedSafe));
  });

  it("uses the safe template when the single repair call errors", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(aiResponse("Minh Anh học ổn."))
      .mockResolvedValueOnce(aiResponse("upstream unavailable", 503));

    const result = await generateCommentWithAi(env, config, baseInput);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.generationMeta?.source).toBe("safe_template");
    expect(result.generationMeta?.validationIssues?.at(-1)).toContain("Lần sửa AI thất bại");
  });

  it("returns a 522 direct-fallback envelope built from the exact same policy", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(aiResponse("error code: 522", 522));
    const facts = buildCommentFacts(baseInput);

    const result = await generateCommentWithAi(env, config, baseInput);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.error).toContain("522");
    expect(result.directFallback).toEqual({
      messages: buildCommentMessages(facts),
      validationPolicy: buildValidationPolicy(facts),
      safeComment: formatCommentHtml(buildSafeComment(facts)),
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../public/js/index/core.js";
import { app } from "../public/js/index/registry.js";
import {
  buildCommentFacts,
  buildCommentMessages,
  buildSafeComment,
  buildValidationPolicy,
} from "../src/services/commentPrompt";

const input = {
  studentName: "Nguyễn Minh Anh",
  learningLevel: "understands_and_asks" as const,
  attendanceStatus: "ATTENDED" as const,
  commentLength: "medium",
};

function aiResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("browser direct fallback", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    app.escapeHtml = (value: unknown) => String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the server-provided messages and policy, then repairs once", async () => {
    const facts = buildCommentFacts(input);
    const messages = buildCommentMessages(facts);
    const policy = buildValidationPolicy(facts);
    const valid = buildSafeComment(facts);
    vi.mocked(fetch)
      .mockResolvedValueOnce(aiResponse("Minh Anh học bình thường."))
      .mockResolvedValueOnce(aiResponse(valid));

    const result = await app.maybeDirectAiFallback(
      "/api/generate_comment",
      { model_id: "claude-sonnet-4-6", ai_api_key: "test-key", thinking_level: "off" },
      {
        error: "Lỗi AI: 522",
        direct_fallback: {
          messages,
          validation_policy: policy,
          safe_comment: `<p>${valid}</p>`,
        },
      },
    );

    expect(fetch).toHaveBeenCalledTimes(2);
    const firstRequest = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    const secondRequest = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body));
    expect(firstRequest.messages).toEqual(messages);
    expect(secondRequest.messages.slice(0, messages.length)).toEqual(messages);
    expect(secondRequest.messages.at(-1).content).toContain("Bản nháp trên chưa đạt vì");
    expect(result.generation_meta).toMatchObject({ source: "ai_repair", transport: "direct" });
    expect(result.comment).toBe(`<p>${valid}</p>`);
  });

  it("repairs a direct fallback response that exposes a homework score", async () => {
    const facts = buildCommentFacts({
      ...input,
      homeworkStatus: { submitted: true, marked: true, previousSession: 3 },
    });
    const messages = buildCommentMessages(facts);
    const policy = buildValidationPolicy(facts);
    const valid = buildSafeComment(facts);
    vi.mocked(fetch)
      .mockResolvedValueOnce(aiResponse(`${valid} BTVN/ 9.`))
      .mockResolvedValueOnce(aiResponse(valid));

    const result = await app.maybeDirectAiFallback(
      "/api/generate_comment",
      { model_id: "claude-sonnet-4-6", ai_api_key: "test-key", thinking_level: "off" },
      {
        error: "Lỗi AI: 522",
        direct_fallback: {
          messages,
          validation_policy: policy,
          safe_comment: `<p>${valid}</p>`,
        },
      },
    );

    expect(fetch).toHaveBeenCalledTimes(2);
    const repairRequest = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body));
    expect(repairRequest.messages.at(-1).content).toContain("Nhận xét không được nêu điểm số BTVN.");
    expect(result.generation_meta).toMatchObject({ source: "ai_repair", transport: "direct" });
    expect(result.comment).toBe(`<p>${valid}</p>`);
  });

  it("repairs a direct fallback response that omits the written homework evaluation", async () => {
    const facts = buildCommentFacts({
      ...input,
      homeworkStatus: {
        submitted: true,
        marked: true,
        previousSession: 3,
        evaluationNote: "Bài làm có logic rõ ràng và cách đặt tên biến dễ hiểu.",
      },
    });
    const messages = buildCommentMessages(facts);
    const policy = buildValidationPolicy(facts);
    const valid = buildSafeComment(facts);
    const withoutHomeworkSummary = buildSafeComment(buildCommentFacts(input));
    vi.mocked(fetch)
      .mockResolvedValueOnce(aiResponse(`${withoutHomeworkSummary} Về BTVN, con cần đạt kết quả tốt hơn.`))
      .mockResolvedValueOnce(aiResponse(valid));

    const result = await app.maybeDirectAiFallback(
      "/api/generate_comment",
      { model_id: "claude-sonnet-4-6", ai_api_key: "test-key", thinking_level: "off" },
      {
        error: "Lỗi AI: 522",
        direct_fallback: {
          messages,
          validation_policy: policy,
          safe_comment: `<p>${valid}</p>`,
        },
      },
    );

    expect(fetch).toHaveBeenCalledTimes(2);
    const repairRequest = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body));
    expect(repairRequest.messages.at(-1).content).toContain("Thiếu tóm tắt đánh giá BTVN.");
    expect(result.generation_meta).toMatchObject({ source: "ai_repair", transport: "direct" });
    expect(result.comment).toBe(`<p>${valid}</p>`);
  });
});

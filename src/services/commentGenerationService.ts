import type { GenerateCommentRequest } from "@tool-lms/contracts";
import type { AppConfig, Env } from "../types";
import {
  callChatCompletion,
  generateCommentWithAi,
  resolveModelId,
  resolveThinkingLevel,
  type GeneratedCommentResult,
} from "./aiClient";
import {
  formatCommentHtml,
  normalizeAiComment,
} from "./commentPrompt";

export type RegularCommentGenerationInput = GenerateCommentRequest;

async function callDirectFallbackChatCompletion(
  ...args: Parameters<typeof callChatCompletion>
): ReturnType<typeof callChatCompletion> {
  const result = await callChatCompletion(...args);
  if (!result.error && (typeof result.content !== "string" || result.content.trim().length === 0)) {
    return { error: "AI không trả về nội dung" };
  }
  return result;
}

export function collectPastComments(pastSlots: GenerateCommentRequest["pastSlots"]): string {
  let pastComments = "";
  for (const slot of pastSlots) {
    for (const area of slot.commentByAreas) {
      if (area.type === "CONTENT" && area.content) pastComments = `Buổi ${slot.index ?? "?"}: ${area.content}`;
    }
  }
  return pastComments;
}

export async function generateRegularComment(
  env: Env,
  config: AppConfig,
  input: RegularCommentGenerationInput,
  requestId?: string,
): Promise<GeneratedCommentResult> {
  const generated = await generateCommentWithAi(env, config, {
    studentName: input.studentName,
    studentCallName: input.studentCallName,
    pastComments: collectPastComments(input.pastSlots),
    notes: input.teacherNote,
    learningLevel: input.learningLevel,
    attendanceStatus: input.attendanceStatus,
    isLate: input.isLate,
    sessionSummary: input.sessionSummary,
    modelId: input.modelId,
    customModelId: input.customModelId,
    thinkingLevel: input.thinkingLevel,
    commentLength: input.commentLength,
    customPrompt: input.customPrompt,
    aiApiKey: input.apiKey,
    homeworkStatus: input.homeworkStatus ?? undefined,
    sessionNumber: input.sessionNumber,
    sessionCommentMode: input.sessionCommentMode,
    requestId,
  });
  if (!generated.directFallback) return generated;

  const model = resolveModelId(
    input.modelId,
    input.customModelId ?? String(config.custom_model_id || ""),
    String(config.ai_model || ""),
  );
  const thinkingLevel = resolveThinkingLevel(model, input.thinkingLevel, String(config.thinking_level || ""));
  const fallback = generated.directFallback;
  let accumulatedIssues: string[] = [];

  const first = await callDirectFallbackChatCompletion(
    env,
    "antigravity",
    model,
    fallback.messages,
    input.apiKey,
    undefined,
    thinkingLevel,
    requestId,
  );
  if (!first.error) {
    const firstComment = normalizeAiComment(first.content || "");
    if (firstComment) {
      return {
        comment: formatCommentHtml(firstComment),
        generationMeta: { source: "ai", transport: "direct" },
      };
    }
    accumulatedIssues = ["Direct AI không trả về nội dung nhận xét."];
  } else {
    accumulatedIssues = [`Direct AI thất bại: ${first.error}`];
  }

  return generationFailure(accumulatedIssues);
}

function generationFailure(issues: string[]): GeneratedCommentResult {
  const detail = issues.length ? ` ${issues.join(" ")}` : "";
  return {
    comment: "",
    error: `AI chưa tạo được nhận xét phù hợp sau khi kiểm tra nội dung.${detail}`.slice(0, 1_000),
  };
}

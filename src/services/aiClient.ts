import {
  AI_MODELS,
  ANTIGRAVITY_API_URL,
  CUSTOM_MODEL_OPTION_ID,
  DEFAULT_AI_MODEL,
  DEFAULT_THINKING_LEVEL,
  clampThinkingLevel,
  modelSupportsReasoning,
  type ThinkingLevel,
} from "../constants/aiModels";
import type { LearningLevel } from "../constants/learningLevels";
import type { AppConfig, Env } from "../types";
import {
  buildCommentFacts,
  buildCommentMessages,
  buildRepairMessages,
  buildSafeComment,
  buildValidationPolicy,
  formatCommentHtml,
  normalizeAiComment,
  validateComment,
  type AttendanceStatus,
  type ChatMessage,
  type CommentValidationPolicy,
  type HomeworkStatusInput,
} from "./commentPrompt";

interface ChatResult {
  content?: string;
  error?: string;
  status?: number;
}

export function cleanAiResponse(content: string): string {
  return formatCommentHtml(content);
}

export type CommentGenerationSource = "ai" | "ai_repair" | "safe_template";
export type CommentGenerationTransport = "server" | "direct";

export interface CommentGenerationMeta {
  source: CommentGenerationSource;
  transport: CommentGenerationTransport;
  validationIssues?: string[];
}

export interface DirectCommentFallback {
  messages: ChatMessage[];
  validationPolicy: CommentValidationPolicy;
  safeComment: string;
}

export interface GeneratedCommentResult {
  comment: string;
  generationMeta?: CommentGenerationMeta;
  error?: string;
  directFallback?: DirectCommentFallback;
}

export function resolveModelId(modelId?: string, customModelId?: string, fallback = DEFAULT_AI_MODEL): string {
  const model = (modelId || "").trim();
  const customModel = (customModelId || "").trim();
  let fallbackModel = (fallback || DEFAULT_AI_MODEL).trim();
  if (fallbackModel === CUSTOM_MODEL_OPTION_ID) fallbackModel = DEFAULT_AI_MODEL;
  if (model === CUSTOM_MODEL_OPTION_ID) return customModel || fallbackModel;
  if (model) return model;
  if (customModel) return customModel;
  return fallbackModel;
}

export function getModelProvider(modelId: string): string {
  if (modelId === CUSTOM_MODEL_OPTION_ID) return "antigravity";
  return AI_MODELS.find((model) => model.id === modelId)?.provider ?? "antigravity";
}

export function resolveThinkingLevel(modelId: string, thinkingLevel?: string, configLevel?: string): ThinkingLevel {
  return clampThinkingLevel(modelId, thinkingLevel || configLevel || DEFAULT_THINKING_LEVEL);
}

function applyThinkingToBody(body: Record<string, unknown>, model: string, thinkingLevel: ThinkingLevel): void {
  if (!modelSupportsReasoning(model) || thinkingLevel === "off") return;

  // Chat Completions-compatible gateways commonly accept reasoning_effort.
  // Keep both nested reasoning.effort for gateways that mirror Responses-style payloads.
  body.reasoning_effort = thinkingLevel;
  body.reasoning = { effort: thinkingLevel };
}

async function callChatCompletion(
  env: Env,
  provider: string,
  model: string,
  content: unknown,
  apiKey?: string,
  openrouterKey?: string,
  thinkingLevel: ThinkingLevel = DEFAULT_THINKING_LEVEL,
): Promise<ChatResult> {
  const url = provider === "antigravity" ? ANTIGRAVITY_API_URL : "https://openrouter.ai/api/v1/chat/completions";
  const key = provider === "antigravity" ? apiKey || env.ANTIGRAVITY_API_KEY : apiKey || openrouterKey || env.OPENROUTER_API_KEY;
  if (!key) return { error: provider === "antigravity" ? "Vui lòng nhập API Key" : "Please set OpenRouter API key" };

  const isMessageArray = Array.isArray(content)
    && content.every((item) => item && typeof item === "object" && "role" in item && "content" in item);
  const body: Record<string, unknown> = {
    model,
    messages: isMessageArray ? content : [{ role: "user", content }],
  };
  applyThinkingToBody(body, model, thinkingLevel);
  if (provider !== "antigravity") body.provider = { data_collection: "allow" };

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        ...(provider !== "antigravity"
          ? { "HTTP-Referer": "https://mindx.edu.vn", "X-Title": "LMS Auto Comment" }
          : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "AI request failed" };
  }
  const text = await response.text();
  if (!response.ok) return { error: text.slice(0, 200) || String(response.status), status: response.status };

  try {
    const data = JSON.parse(text) as { choices?: Array<{ message?: { content?: string } }> };
    return { content: data.choices?.[0]?.message?.content };
  } catch {
    return { error: text.slice(0, 200) || "Invalid AI response" };
  }
}

export async function generateCommentWithAi(
  env: Env,
  config: AppConfig,
  input: {
    studentName: string;
    pastComments: string;
    notes: string;
    learningLevel?: LearningLevel;
    attendanceStatus?: AttendanceStatus | string;
    isLate?: boolean;
    sessionSummary?: string;
    modelId?: string;
    customModelId?: string;
    thinkingLevel?: string;
    commentLength?: string;
    customPrompt?: string;
    aiApiKey?: string;
    homeworkStatus?: HomeworkStatusInput;
  },
): Promise<GeneratedCommentResult> {
  const model = resolveModelId(input.modelId, input.customModelId ?? String(config.custom_model_id || ""), String(config.ai_model || DEFAULT_AI_MODEL));
  const thinkingLevel = resolveThinkingLevel(model, input.thinkingLevel, String(config.thinking_level || ""));
  const facts = buildCommentFacts(input);
  const messages = buildCommentMessages(facts);
  const validationPolicy = buildValidationPolicy(facts);
  const safeComment = formatCommentHtml(buildSafeComment(facts));
  const provider = getModelProvider(model);
  const result = await callChatCompletion(env, provider, model, messages, input.aiApiKey, String(config.openrouter_key || ""), thinkingLevel);
  if (result.error) {
    const error = `Lỗi AI (${model}): ${result.error}`;
    return {
      comment: formatCommentHtml(error),
      error,
      ...(result.status === 522 || result.status === 524 || /(?:error code:\s*)?(?:522|524)\b/i.test(result.error)
        ? { directFallback: { messages, validationPolicy, safeComment } }
        : {}),
    };
  }

  const initialComment = normalizeAiComment(result.content || "");
  const initialValidation = validateComment(initialComment, validationPolicy);
  if (initialValidation.valid) {
    return {
      comment: formatCommentHtml(initialComment),
      generationMeta: { source: "ai", transport: "server" },
    };
  }

  const repairMessages = buildRepairMessages(messages, initialComment, initialValidation.issues);
  const repairResult = await callChatCompletion(env, provider, model, repairMessages, input.aiApiKey, String(config.openrouter_key || ""), thinkingLevel);
  if (!repairResult.error) {
    const repairedComment = normalizeAiComment(repairResult.content || "");
    const repairedValidation = validateComment(repairedComment, validationPolicy);
    if (repairedValidation.valid) {
      return {
        comment: formatCommentHtml(repairedComment),
        generationMeta: {
          source: "ai_repair",
          transport: "server",
          validationIssues: initialValidation.issues,
        },
      };
    }
    return {
      comment: safeComment,
      generationMeta: {
        source: "safe_template",
        transport: "server",
        validationIssues: [...new Set([...initialValidation.issues, ...repairedValidation.issues])],
      },
    };
  }

  return {
    comment: safeComment,
    generationMeta: {
      source: "safe_template",
      transport: "server",
      validationIssues: [...initialValidation.issues, `Lần sửa AI thất bại: ${repairResult.error}`],
    },
  };
}

export async function generateCheckpointCommentWithAi(
  env: Env,
  config: AppConfig,
  input: { studentName: string; teacherDescription?: string; modelId?: string; customModelId?: string; thinkingLevel?: string; aiApiKey?: string },
): Promise<string> {
  const model = resolveModelId(input.modelId, input.customModelId ?? String(config.custom_model_id || ""), String(config.ai_model || DEFAULT_AI_MODEL));
  const thinkingLevel = resolveThinkingLevel(model, input.thinkingLevel, String(config.thinking_level || ""));
  const shortName = input.studentName ? input.studentName.split(/\s+/).at(-1) || "em" : "em";
  const prompt = `Bạn là giáo viên lập trình tại MindX Technology School. Viết nhận xét checkpoint (kiểm tra giữa khóa) cho học sinh gửi phụ huynh.

HỌC SINH: ${input.studentName} (gọi: ${shortName})
MÔ TẢ TÓM TẮT TỪ GIÁO VIÊN: ${input.teacherDescription || "Học sinh hoàn thành bài kiểm tra tốt"}

HƯỚNG DẪN VIẾT (sử dụng ngôn từ phù hợp để phụ huynh đọc):
Viết nhận xét gồm 3 phần rõ ràng, mỗi phần 1-2 câu:

1. Điểm mạnh của học viên: Khả năng, ưu điểm, tiến bộ rõ rệt mà học viên đã thể hiện (chủ động, nhanh nhẹn, tích cực, áp dụng tốt,..)

2. Điểm cần cải thiện: Các vấn đề, điểm yếu, kỹ năng cần cải thiện, có thể là kỹ năng chuyên môn hoặc các yếu tố như sự sáng tạo, khả năng tư duy logic, khả năng giao tiếp.. (Cần cải thiện thêm về ...; Tăng cường về...; Chú ý hơn khi...)

3. Lời khuyên: Gợi ý giải pháp cụ thể giúp học viên phát triển thêm kỹ năng hoặc cải thiện những vấn đề còn yếu (Khuyến khích làm thêm bài tập bổ sung; Tìm hiểu thêm về...; Rèn luyện thêm..)

CÁCH DIỄN ĐẠT:
- Dùng "em" hoặc "${shortName}" để gọi học sinh
- Dùng "con" khi nói về học sinh với phụ huynh
- Giọng văn chuyên nghiệp, tích cực, mang tính xây dựng
- Dựa vào mô tả tóm tắt của giáo viên để nhận xét cụ thể
- KHÔNG dùng markdown, KHÔNG dùng ký tự **, KHÔNG dùng bullet list
- Viết thành một đoạn văn liền mạch hoặc các câu ngắn nối tiếp nhau
- Có thể dùng các nhãn thuần văn bản: "Điểm mạnh:", "Điểm cần cải thiện:", "Lời khuyên:"

VÍ DỤ:
- "Điểm mạnh: ${shortName} thể hiện rất tốt khả năng tư duy logic trong bài kiểm tra, em hoàn thành nhanh chóng và chính xác các câu hỏi lý thuyết. Điểm cần cải thiện: Em cần chú ý hơn trong phần thực hành, đặc biệt là kỹ năng debug và xử lý lỗi. Lời khuyên: Khuyến khích con rèn luyện thêm bằng cách làm các bài tập thực hành tại nhà, tìm hiểu thêm về các kỹ thuật gỡ lỗi."

CHỈ TRẢ VỀ NỘI DUNG NHẬN XÉT THUẦN VĂN BẢN, KHÔNG GIẢI THÍCH, KHÔNG MARKDOWN.`;

  const provider = getModelProvider(model);
  const result = await callChatCompletion(env, provider, model, prompt, input.aiApiKey, String(config.openrouter_key || ""), thinkingLevel);
  if (result.error) return `<p>Lỗi AI (${model}): ${result.error}</p>`;
  return cleanAiResponse(result.content || "");
}

export async function gradeHomeworkWithAi(
  env: Env,
  config: AppConfig,
  input: {
    lessonName: string;
    studentName: string;
    attachments: string[];
    imageUrls: string[];
    textFiles?: Array<{ name: string; content: string }>;
    otherFiles?: string[];
    modelId?: string;
    customModelId?: string;
    thinkingLevel?: string;
    apiKey?: string;
  },
): Promise<{ success: true; score: number; note: string } | { success: false; error: string; raw?: string }> {
  const model = resolveModelId(input.modelId, input.customModelId, String(config.ai_model || DEFAULT_AI_MODEL));
  const thinkingLevel = resolveThinkingLevel(model, input.thinkingLevel, String(config.thinking_level || ""));
  const provider = getModelProvider(input.modelId || model);
  const fileList = input.attachments.map((item) => item.split("/").at(-1) || item).join(", ");
  const textFiles = input.textFiles ?? [];
  const otherFiles = input.otherFiles ?? [];

  const codeSection = textFiles.length
    ? `\n\nNỘI DUNG CÁC TỆP CODE/VĂN BẢN HỌC SINH NỘP:\n${textFiles
        .map((file) => `===== ${file.name} =====\n${file.content}`)
        .join("\n\n")}`
    : "";
  const otherSection = otherFiles.length
    ? `\n\nCÁC TỆP KHÔNG ĐỌC ĐƯỢC NỘI DUNG (chỉ có tên, ví dụ file nhị phân/thiết kế): ${otherFiles.join(", ")}`
    : "";
  const evidenceHint = input.imageUrls.length
    ? "hình ảnh đính kèm và nội dung tệp code bên dưới (nếu có)"
    : "nội dung các tệp code/văn bản bên dưới";

  const promptText = `Bạn là giáo viên chấm bài tập lập trình cho học sinh tại MindX Technology School.

Bài học: ${input.lessonName}
Học sinh: ${input.studentName}
Tệp nộp: ${fileList}

Hãy đánh giá bài làm của học sinh dựa trên ${evidenceHint}.
Tiêu chí chấm:
- Hoàn thành yêu cầu bài tập (có làm đúng theo đề bài không)
- Chất lượng code/project (gọn gàng, logic)
- Sáng tạo (có thêm tính năng, trang trí riêng không)

Cho điểm từ 0 đến 100 và nhận xét ngắn gọn bằng tiếng Việt (2-3 câu).

Trả về kết quả CHÍNH XÁC theo định dạng JSON:
{"score": <điểm_số>, "note": "<nhận_xét>"}
Chỉ trả về JSON, không thêm gì khác.${codeSection}${otherSection}`;

  const content = input.imageUrls.length
    ? [{ type: "text", text: promptText }, ...input.imageUrls.map((url) => ({ type: "image_url", image_url: { url } }))]
    : promptText;
  const result = await callChatCompletion(env, provider, model, content, input.apiKey, String(config.openrouter_key || ""), thinkingLevel);
  if (result.error) return { success: false, error: `AI lỗi: ${result.error}` };
  const raw = result.content || "";
  const match = raw.match(/\{[^{}]*"score"\s*:\s*\d+[^{}]*\}/);
  if (!match) return { success: false, error: "AI không trả về kết quả hợp lệ", raw };
  try {
    const parsed = JSON.parse(match[0]) as { score?: number; note?: string };
    return { success: true, score: Math.min(100, Math.max(0, Number(parsed.score ?? 100))), note: parsed.note || "" };
  } catch {
    return { success: false, error: "AI không trả về JSON hợp lệ", raw };
  }
}

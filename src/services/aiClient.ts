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
import { LEARNING_LEVELS, normalizeLearningLevel, type LearningLevel } from "../constants/learningLevels";
import type { AppConfig, Env } from "../types";

interface ChatResult {
  content?: string;
  error?: string;
}

export function cleanAiResponse(content: string): string {
  let cleaned = content.trim().replaceAll('"', "").replaceAll("'", "");
  if (cleaned.startsWith("-")) cleaned = cleaned.slice(1).trim();
  return cleaned.startsWith("<p>") ? cleaned : `<p>${cleaned}</p>`;
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

  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content }],
  };
  applyThinkingToBody(body, model, thinkingLevel);
  if (provider !== "antigravity") body.provider = { data_collection: "allow" };

  const response = await fetch(url, {
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
  const text = await response.text();
  if (!response.ok) return { error: text.slice(0, 200) || String(response.status) };

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
    sessionSummary?: string;
    modelId?: string;
    customModelId?: string;
    thinkingLevel?: string;
    commentLength?: string;
    customPrompt?: string;
    aiApiKey?: string;
    homeworkStatus?: {
      shouldMention?: boolean;
      previousSession?: number;
      previous_session?: number;
      submitted?: boolean;
      marked?: boolean;
      score?: string | number | null;
      status?: string;
      lessonName?: string;
      lesson_name?: string;
    };
  },
): Promise<string> {
  const model = resolveModelId(input.modelId, input.customModelId ?? String(config.custom_model_id || ""), String(config.ai_model || DEFAULT_AI_MODEL));
  const thinkingLevel = resolveThinkingLevel(model, input.thinkingLevel, String(config.thinking_level || ""));
  const shortName = input.studentName ? input.studentName.split(/\s+/).at(-1) || "em" : "em";
  const lengthGuide = input.commentLength === "short" ? "2-3 câu ngắn gọn" : input.commentLength === "long" ? "4-5 câu chi tiết" : "3-4 câu";
  const learningLevel = normalizeLearningLevel(input.learningLevel);
  const learningLevelDetail = LEARNING_LEVELS[learningLevel];
  const homeworkStatus = input.homeworkStatus;
  const previousSession = homeworkStatus?.previousSession ?? homeworkStatus?.previous_session;
  const previousSessionLabel = previousSession ? `buổi ${previousSession}` : "buổi trước";
  let homeworkStatusText = "";
  if (homeworkStatus && homeworkStatus.shouldMention !== false) {
    if (homeworkStatus.submitted === true) {
      const markedText = homeworkStatus.marked ? "Bài đã được chấm/ghi nhận trên LMS." : "Bài đã được ghi nhận đã nộp trên LMS.";
      const scoreText = homeworkStatus.score != null && String(homeworkStatus.score).trim() !== "" ? ` Điểm hiện có: ${homeworkStatus.score}.` : "";
      homeworkStatusText = `Học sinh ĐÃ NỘP BTVN ${previousSessionLabel}. ${markedText}${scoreText}`;
    } else if (homeworkStatus.submitted === false) {
      homeworkStatusText = `Chưa thấy học sinh nộp BTVN ${previousSessionLabel} trên LMS.`;
    }
  }

  const prompt = `Bạn là giáo viên lập trình tại MindX Technology School. Viết nhận xét ngắn gọn cho học sinh gửi phụ huynh.

HỌC SINH: ${input.studentName} (gọi: ${shortName})
NỘI DUNG BUỔI HỌC: ${input.sessionSummary || "Thực hành lập trình"}
NHẬN XÉT BUỔI TRƯỚC: ${input.pastComments || "Buổi đầu tiên"}
MỨC ĐỘ NẮM BÀI: ${learningLevelDetail.code} — ${learningLevelDetail.label}. ${learningLevelDetail.prompt}
GHI CHÚ BỔ SUNG TỪ GIÁO VIÊN: ${input.notes || "Chưa có ghi chú bổ sung từ giáo viên"}
${homeworkStatusText ? `TÌNH TRẠNG BTVN BUỔI TRƯỚC: ${homeworkStatusText}\n` : ""}
HƯỚNG DẪN VIẾT:
1. Viết ${lengthGuide}, mỗi câu nối tiếp tự nhiên, văn phong giống giáo viên nhắn phụ huynh trong nhóm Zalo.
2. CẤU TRÚC BẮT BUỘC theo thứ tự:
   - Câu 1: Học sinh đi học đúng giờ/muộn + mức độ tuân thủ nội quy lớp học.
   - Câu 2-3: Bắt buộc diễn đạt MỨC ĐỘ NẮM BÀI bằng hành vi có thể quan sát: tự vận dụng, chủ động hỏi lại, cần gợi ý hay cần hỗ trợ sát. Kết hợp ghi chú giáo viên để nêu bằng chứng hoặc ngoại lệ cụ thể.
   - Câu cuối: Động viên nếu học tốt; hoặc nhắc phụ huynh hỗ trợ/nhắc nhở nếu học sinh còn vấn đề. Chỉ nhắc BTVN/ôn lại bài khi ghi chú cho thấy học sinh cần ôn thêm, chưa hoàn thành bài hoặc cần phụ huynh nhắc thêm. KHÔNG bắt buộc nhắc BTVN ở mọi nhận xét vì tin nhắn Zalo đã có mục BTVN riêng.
   - Không viết nguyên văn mã nội bộ L1/L2/L3/L4 hoặc từ "level" trong nhận xét gửi phụ huynh.
   - Không dùng "học bình thường", "mức bình thường", "học ổn", "thực hành ở mức ổn" hoặc "không có vấn đề đặc biệt" làm đánh giá. Phải nói rõ học sinh hiểu đến đâu, có tự làm được không và cần hỗ trợ như thế nào.

3. KHÔNG LẶP CHI TIẾT NỘI DUNG BUỔI HỌC TRONG NHẬN XÉT CÁ NHÂN:
   - "NỘI DUNG BUỔI HỌC" chỉ dùng để hiểu bối cảnh, KHÔNG đưa nguyên văn vào nhận xét từng học sinh.
   - Tuyệt đối KHÔNG viết kiểu: "Trong buổi học về ...", "Trong buổi học về xây dựng ...", "với 2 thể loại game ...", hoặc nhắc lại tên bài/chủ đề cụ thể.
   - Thay bằng các câu chung như:
     + "Trong buổi học, con luôn tập trung tốt, hiểu và nắm rõ các nội dung được học, con thực hành nhanh chóng và chính xác, không gặp vướng mắc gì."
     + "Trong buổi học, con tập trung theo dõi bài, nắm được nội dung chính và thao tác lập trình theo hướng dẫn."
     + "Trong buổi học, con nắm được kiến thức chính; với phần chưa hiểu, con chủ động hỏi lại thầy và hoàn thành bài sau khi được giải đáp."

4. CÁCH DIỄN ĐẠT:
   - Có thể mở đầu bằng tên ngắn "${shortName}" hoặc "em".
   - Dùng "con" khi nói về học sinh với phụ huynh.
   - Ưu tiên các cụm tự nhiên: "đi học đúng giờ và tuân thủ tốt nội quy lớp học", "nhìn chung tuân thủ nội quy lớp học", "duy trì sự tập trung", "nắm được kiến thức chính", "chủ động hỏi lại khi chưa hiểu", "cần thầy gợi ý ở một số bước", "thực hành nhanh chóng và chính xác", "theo kịp tiến độ bài học", "phụ huynh giúp em nhắc nhở con".
   - Nối câu bằng: "Trong buổi học...", "Tuy nhiên...", "Về nhà...", "Phụ huynh giúp em...", "Cần chú ý...".
   - Tránh giọng quá máy móc, không viết markdown, không bullet list, không tiêu đề.

5. NẾU CÓ VẤN ĐỀ (từ ghi chú):
   - Nói chuyện riêng/mất tập trung → "Tuy nhiên, đôi lúc con còn nói chuyện riêng và mất tập trung nên thầy cần nhắc nhở thêm trong giờ học."
   - Mất trật tự/nói leo/làm việc riêng → "con chưa giữ được sự tập trung ổn định, thường xuyên mất trật tự, nói leo và làm việc riêng nên thầy phải nhắc nhở khá nhiều."
   - Chơi game/làm việc riêng → "thầy phải nhắc nhở con tập trung hơn và hạn chế làm việc riêng trong giờ học."
   - Trầm/ít tương tác → "con hơi trầm, cần chủ động tương tác với thầy và các bạn nhiều hơn."
   - Code chậm/thực hành chậm → "tốc độ thực hành còn chậm, con cần luyện tập thêm để thao tác tự tin hơn."
   - Thiếu BTVN → "con chưa hoàn thành BTVN, nhờ phụ huynh nhắc nhở con hoàn thiện bài đầy đủ hơn."

6. TÌNH TRẠNG BTVN BUỔI TRƯỚC:
   - Chỉ nhận xét BTVN khi prompt có dòng "TÌNH TRẠNG BTVN BUỔI TRƯỚC".
   - Nếu học sinh ĐÃ NỘP BTVN: có thể khen nhẹ hoặc ghi nhận ngắn gọn, không cần nhắc quá dài.
   - Nếu "Chưa thấy học sinh nộp BTVN": cần nhắc rõ phụ huynh hỗ trợ nhắc con bổ sung/hoàn thiện bài đầy đủ hơn.
   - Nếu không có dòng tình trạng BTVN thì KHÔNG tự bịa và KHÔNG đề cập BTVN.

7. BUỔI HỌC LÀM SẢN PHẨM CUỐI KHÓA (SPCK) - Từ buổi 9-10 trở đi:
   Nếu nội dung buổi học có liên quan đến "sản phẩm cuối khóa", "SPCK", "thiết kế app", "tích hợp giao diện":
   - Vẫn KHÔNG nhắc lại chi tiết tên bài/chủ đề từ NỘI DUNG BUỔI HỌC.
   - Có thể nhận xét chung về tiến độ sản phẩm nếu ghi chú có thông tin cụ thể.
   - Các mức tiến độ:
     + Tốt: "con nghiêm túc thực hiện làm SPCK, đạt kết quả đúng tiến độ đề ra"
     + Khá: "con hoàn thiện khá tốt phần sản phẩm được giao"
     + Chậm: "tiến độ sản phẩm còn chậm, con cần chú ý đẩy nhanh tiến độ"
   - Kết thúc: "Cố gắng tiếp tục hoàn thiện thêm ở nhà" hoặc "Chú ý hoàn thiện thêm tại nhà để theo kịp tiến độ lớp".
   - KHÔNG đề cập BTVN trong các buổi làm SPCK, thay bằng việc tiếp tục hoàn thiện sản phẩm ở nhà.
${input.customPrompt ? `8. YÊU CẦU THÊM: ${input.customPrompt}` : ""}

VÍ DỤ NHẬN XÉT THÔNG THƯỜNG:
- "${shortName} đi học đúng giờ và tuân thủ tốt nội quy lớp học. Trong buổi học, con luôn tập trung tốt, hiểu và nắm rõ các nội dung được học, con thực hành nhanh chóng và chính xác, không gặp vướng mắc gì. ${shortName} hoàn thành nội dung bài học theo đúng tiến độ của lớp. Cố gắng phát huy ở các buổi học tiếp theo."
- "${shortName} đi học đúng giờ và nhìn chung tuân thủ nội quy lớp học. Trong buổi học, con tập trung theo dõi bài, nắm được nội dung chính và thao tác lập trình theo hướng dẫn. Tuy nhiên, đôi lúc con còn nói chuyện riêng và mất tập trung nên thầy cần nhắc nhở thêm trong giờ học. Về nhà, ${shortName} nên ôn lại bài và cố gắng tập trung hơn trong các buổi học tới."
- "${shortName} đi học đúng giờ, tuy nhiên con cần cố gắng tuân thủ nội quy lớp học nghiêm túc hơn. Trong buổi học, con chưa giữ được sự tập trung ổn định, thường xuyên mất trật tự, nói leo và làm việc riêng nên thầy phải nhắc nhở khá nhiều. Phụ huynh giúp em nhắc nhở con cần chú ý rút kinh nghiệm ở buổi học sau."
- "${shortName} đi học đúng giờ và tuân thủ tốt nội quy lớp học. Trong buổi học, con nắm được kiến thức chính; với những phần chưa hiểu, con chủ động hỏi lại thầy và có thể hoàn thành bài sau khi được giải đáp. ${shortName} cần tiếp tục duy trì sự chủ động này ở các buổi học sau."

VÍ DỤ NHẬN XÉT BUỔI LÀM SPCK:
- "${shortName} đi học đúng giờ và tuân thủ tốt nội quy lớp học. Trong buổi học, con nghiêm túc thực hiện làm SPCK, đạt kết quả đúng tiến độ đề ra và hoàn thành tốt phần sản phẩm được giao. Cố gắng tiếp tục hoàn thiện thêm ở nhà."
- "${shortName} đi học đúng giờ và nhìn chung tuân thủ nội quy lớp học. Trong buổi học, con hoàn thiện khá tốt phần sản phẩm được giao, tuy nhiên tiến độ vẫn cần được đẩy nhanh hơn để theo kịp kế hoạch của lớp. Chú ý hoàn thiện thêm tại nhà để sản phẩm tốt hơn."

CHỈ TRẢ VỀ NỘI DUNG NHẬN XÉT, KHÔNG GIẢI THÍCH.`;

  const provider = getModelProvider(model);
  const result = await callChatCompletion(env, provider, model, prompt, input.aiApiKey, String(config.openrouter_key || ""), thinkingLevel);
  if (result.error) return `<p>Lỗi AI (${model}): ${result.error}</p>`;
  if (!result.content) return `<p>Lỗi AI (${model}): Không nhận được phản hồi</p>`;
  return cleanAiResponse(result.content);
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

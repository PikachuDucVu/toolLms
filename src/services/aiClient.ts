import { AI_MODELS, ANTIGRAVITY_API_URL, CUSTOM_MODEL_OPTION_ID, DEFAULT_AI_MODEL } from "../constants/aiModels";
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

async function callChatCompletion(
  env: Env,
  provider: string,
  model: string,
  content: unknown,
  apiKey?: string,
  openrouterKey?: string,
): Promise<ChatResult> {
  const url = provider === "antigravity" ? ANTIGRAVITY_API_URL : "https://openrouter.ai/api/v1/chat/completions";
  const key = provider === "antigravity" ? apiKey || env.ANTIGRAVITY_API_KEY : apiKey || openrouterKey || env.OPENROUTER_API_KEY;
  if (!key) return { error: provider === "antigravity" ? "Vui lòng nhập API Key" : "Please set OpenRouter API key" };

  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content }],
  };
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
    sessionSummary?: string;
    modelId?: string;
    customModelId?: string;
    commentLength?: string;
    customPrompt?: string;
    aiApiKey?: string;
  },
): Promise<string> {
  const model = resolveModelId(input.modelId, input.customModelId ?? String(config.custom_model_id || ""), String(config.ai_model || DEFAULT_AI_MODEL));
  const shortName = input.studentName ? input.studentName.split(/\s+/).at(-1) || "em" : "em";
  const lengthGuide = input.commentLength === "short" ? "2-3 câu ngắn gọn" : input.commentLength === "long" ? "4-5 câu chi tiết" : "3-4 câu";

  const prompt = `Bạn là giáo viên lập trình tại MindX Technology School. Viết nhận xét ngắn gọn cho học sinh gửi phụ huynh.

HỌC SINH: ${input.studentName} (gọi: ${shortName})
NỘI DUNG BUỔI HỌC: ${input.sessionSummary || "Thực hành lập trình"}
NHẬN XÉT BUỔI TRƯỚC: ${input.pastComments || "Buổi đầu tiên"}
GHI CHÚ BUỔI NÀY: ${input.notes || "Học bình thường, không có gì đặc biệt"}

HƯỚNG DẪN VIẾT:
1. Viết ${lengthGuide}, mỗi câu nối tiếp tự nhiên
2. CẤU TRÚC BẮT BUỘC theo thứ tự:
   - Câu 1: Đi học đúng giờ/muộn + tuân thủ nội quy (nếu có)
   - Câu 2-3: Tập trung nghe giảng + thao tác lập trình (nhanh/chậm/có vướng mắc)
   - Câu cuối: BTVN (đầy đủ/chưa làm) + động viên hoặc nhắc nhở

3. CÁCH DIỄN ĐẠT:
   - Dùng "em" hoặc "${shortName}" để gọi học sinh
   - Dùng "con" khi nói về học sinh với phụ huynh
   - Nối câu bằng: "Trong lớp...", "Quá trình học...", "Tuy nhiên...", "Cần chú ý..."
   - Kết thúc: "Cố gắng tiếp tục phát huy!" hoặc "Cần cố gắng hơn"

4. NẾU CÓ VẤN ĐỀ (từ ghi chú):
   - Nói chuyện riêng → "đôi lúc em còn nói chuyện riêng trong giờ, cần chú ý khắc phục"
   - Chơi game → "thầy hay phải nhắc nhở em tập trung, hạn chế làm việc riêng"
   - Trầm/ít tương tác → "em hơi trầm, cần chú ý tương tác với lớp nhiều hơn"
   - Code chậm → "tốc độ code còn chậm, cần luyện tập thêm"
   - Thiếu BTVN → "em chưa hoàn thành BTVN, nhờ phụ huynh nhắc nhở con"

5. BUỔI HỌC LÀM SẢN PHẨM CUỐI KHÓA (SPCK) - Từ buổi 9-10 trở đi:
   Nếu nội dung buổi học có liên quan đến "sản phẩm cuối khóa", "SPCK", "thiết kế app", "tích hợp giao diện":
   - Thay phần "thao tác lập trình" bằng nhận xét về TIẾN ĐỘ SẢN PHẨM
   - Các mức tiến độ:
     + Tốt: "nghiêm túc thực hiện làm SPCK, đạt kết quả đúng tiến độ đề ra"
     + Khá: "hoàn thiện khá tốt phần thiết kế giao diện"
     + Chậm: "tiến độ sản phẩm còn chậm, cần đẩy nhanh tiến độ"
   - Mô tả cụ thể tiến độ (nếu có trong ghi chú):
     + "em hoàn thành tốt các khâu thiết kế app"
     + "đang áp dụng các giao diện vào phần code Python"
     + "đã lập trình được đăng ký/đăng nhập, tích hợp giao diện màn hình Home"
     + "chưa tích hợp được vào code"
     + "các tính năng app chưa hoạt động"
   - Kết thúc: "Cố gắng tiếp tục hoàn thiện thêm ở nhà" hoặc "Chú ý hoàn thiện tại nhà, tích hợp giao diện vào Python"
   - KHÔNG đề cập BTVN trong các buổi làm SPCK (thay bằng "tiếp tục hoàn thiện sản phẩm ở nhà")
${input.customPrompt ? `6. YÊU CẦU THÊM: ${input.customPrompt}` : ""}

VÍ DỤ NHẬN XÉT THÔNG THƯỜNG:
- "Buổi hôm nay ${shortName} đến lớp rất đúng giờ, tuân thủ tốt nội quy lớp học. Trong lớp em luôn tập trung nghe giảng, thao tác lập trình nhanh chóng, không gặp vướng mắc gì. Em hoàn thành BTVN đầy đủ. Cố gắng tiếp tục phát huy ở các buổi học tới!"
- "Buổi hôm nay em đi học hơi muộn so với giờ học, cần chú ý. Trong lớp em luôn tập trung nghe giảng, thực hành bài tập khá tốt. Tuy nhiên em chưa hoàn thành BTVN đầy đủ, nhờ phụ huynh nhắc nhở con."
- "Buổi học hôm nay em đến lớp đúng giờ. Quá trình học em luôn tập trung, thao tác lập trình rất tốt và có được điểm từ thầy. Tuy nhiên đôi lúc em còn nói chuyện riêng với bạn, cần chú ý khắc phục. Em hoàn thành BTVN đầy đủ."

VÍ DỤ NHẬN XÉT BUỔI LÀM SPCK:
- "Buổi hôm nay em vào lớp rất đúng giờ, thực hiện tốt nội quy lớp học. Trong lớp em rất nghiêm túc thực hiện làm SPCK, đạt kết quả đúng tiến độ, em hoàn thành tốt các khâu thiết kế app và đang áp dụng các giao diện vào phần code Python. Cố gắng tiếp tục hoàn thiện phần tích hợp ở nhà."
- "Buổi hôm nay ${shortName} đến lớp đúng giờ. Con hoàn thiện khá tốt phần thiết kế giao diện, tuy nhiên chưa tích hợp được vào code, tiến độ còn chậm so với lớp. Cần chú ý đẩy nhanh tiến độ và hoàn thiện tại nhà."
- "Buổi hôm nay em đến lớp đúng giờ, tuân thủ tốt nội quy. Trong lớp em rất nghiêm túc thực hiện làm SPCK, em đã hoàn thiện được sản phẩm và đang xây dựng slide thuyết trình, tiến độ đạt với đề ra của lớp. Cố gắng tiếp tục hoàn thiện Slide tại nhà."

CHỈ TRẢ VỀ NỘI DUNG NHẬN XÉT, KHÔNG GIẢI THÍCH.`;

  const provider = getModelProvider(model);
  const result = await callChatCompletion(env, provider, model, prompt, input.aiApiKey, String(config.openrouter_key || ""));
  if (result.error) return `<p>Lỗi AI (${model}): ${result.error}</p>`;
  if (!result.content) return `<p>Lỗi AI (${model}): Không nhận được phản hồi</p>`;
  return cleanAiResponse(result.content);
}

export async function generateCheckpointCommentWithAi(
  env: Env,
  config: AppConfig,
  input: { studentName: string; teacherDescription?: string; modelId?: string; customModelId?: string; aiApiKey?: string },
): Promise<string> {
  const model = resolveModelId(input.modelId, input.customModelId ?? String(config.custom_model_id || ""), String(config.ai_model || DEFAULT_AI_MODEL));
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
  const result = await callChatCompletion(env, provider, model, prompt, input.aiApiKey, String(config.openrouter_key || ""));
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
    apiKey?: string;
  },
): Promise<{ success: true; score: number; note: string } | { success: false; error: string; raw?: string }> {
  const model = resolveModelId(input.modelId, input.customModelId, String(config.ai_model || DEFAULT_AI_MODEL));
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
  const result = await callChatCompletion(env, provider, model, content, input.apiKey, String(config.openrouter_key || ""));
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

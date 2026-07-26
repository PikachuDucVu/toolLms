import { LEARNING_LEVELS, normalizeLearningLevel, type LearningLevel } from "../constants/learningLevels";

export type AttendanceStatus = "ATTENDED" | "LATE_ARRIVED" | "ABSENT" | "ABSENT_WITH_NOTICE" | "UNKNOWN";
export type CommentMode = "quick" | "detailed" | "absence";
export type CommentLength = "short" | "medium" | "long";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface HomeworkStatusInput {
  shouldMention?: boolean;
  previousSession?: number;
  previous_session?: number;
  submitted?: boolean;
  marked?: boolean;
  score?: string | number | null;
  status?: string;
  lessonName?: string;
  lesson_name?: string;
}

export interface CommentPromptInput {
  studentName: string;
  pastComments?: string;
  notes?: string;
  learningLevel?: LearningLevel;
  attendanceStatus?: AttendanceStatus | string;
  isLate?: boolean;
  sessionSummary?: string;
  commentLength?: string;
  customPrompt?: string;
  homeworkStatus?: HomeworkStatusInput;
}

interface NormalizedHomeworkStatus {
  submitted: boolean;
  marked: boolean;
  score: string;
  previousSessionLabel: string;
}

export interface CommentFacts {
  studentName: string;
  shortName: string;
  previousComment: string;
  teacherNote: string;
  learningLevel: LearningLevel;
  attendanceStatus: AttendanceStatus;
  sessionSummary: string;
  commentLength: CommentLength;
  customPrompt: string;
  homeworkStatus: NormalizedHomeworkStatus | null;
  mode: CommentMode;
  isSpck: boolean;
}

export interface ValidationConceptGroup {
  label: string;
  patterns: string[];
}

export interface CommentValidationPolicy {
  mode: CommentMode;
  learningLevel: LearningLevel | null;
  attendanceStatus: AttendanceStatus;
  requiredConcepts: ValidationConceptGroup[];
  bannedPatterns: string[];
  behaviorPatterns: string[];
  allowedBehaviorPatterns: string[];
  absenceLearningPatterns: string[];
  allowHomework: boolean;
  allowBehaviorClaims: boolean;
  minSentences: number;
  maxSentences: number;
}

export interface CommentValidationResult {
  valid: boolean;
  issues: string[];
}

interface LevelPromptPolicy {
  meaning: string;
  requiredConcepts: ValidationConceptGroup[];
  safeLearningSentence: string;
  safeClosingSentence: string;
}

const LEVEL_PROMPT_POLICIES: Record<LearningLevel, LevelPromptPolicy> = {
  independent: {
    meaning: "Học sinh nắm vững kiến thức, có thể tự vận dụng và hoàn thành phần thực hành độc lập.",
    requiredConcepts: [
      { label: "mức độ nắm vững kiến thức", patterns: ["nam (vung|chac) (kien thuc|noi dung)", "hieu ro (kien thuc|noi dung)"] },
      { label: "khả năng tự vận dụng hoặc làm độc lập", patterns: ["tu (van dung|thuc hanh|hoan thanh|lam)", "hoan thanh .* doc lap", "lam .* doc lap"] },
    ],
    safeLearningSentence: "Trong buổi học, con nắm vững kiến thức, có thể tự vận dụng và hoàn thành phần thực hành độc lập.",
    safeClosingSentence: "Con cần tiếp tục phát huy khả năng tự học này trong các buổi tiếp theo.",
  },
  understands_and_asks: {
    meaning: "Học sinh nắm được kiến thức chính; khi chưa hiểu, học sinh chủ động hỏi lại giáo viên và có thể hoàn thành sau khi được giải đáp.",
    requiredConcepts: [
      { label: "mức độ nắm được kiến thức chính", patterns: ["nam duoc (kien thuc|noi dung)( chinh| co ban)?", "hieu duoc (kien thuc|noi dung)( chinh| co ban)?"] },
      { label: "sự chủ động hỏi lại", patterns: ["chu dong (hoi|trao doi)", "hoi lai (thay|giao vien)", "hoi khi (chua hieu|gap vuong mac)"] },
      { label: "khả năng làm tiếp sau khi được giải đáp", patterns: ["hoan thanh .* sau khi .* (giai dap|huong dan)", "sau khi .* (giai dap|huong dan).* hoan thanh", "lam tiep .* sau khi .* (giai dap|huong dan)"] },
    ],
    safeLearningSentence: "Trong buổi học, con nắm được kiến thức chính; với những phần chưa hiểu, con chủ động hỏi lại thầy và có thể hoàn thành bài sau khi được giải đáp.",
    safeClosingSentence: "Con cần tiếp tục duy trì sự chủ động này trong các buổi học sau.",
  },
  needs_prompting: {
    meaning: "Học sinh nắm được một phần kiến thức nhưng cần giáo viên gợi ý hoặc hướng dẫn ở một số bước khi thực hành.",
    requiredConcepts: [
      { label: "mức độ nắm được một phần kiến thức", patterns: ["nam duoc mot phan (kien thuc|noi dung)", "hieu duoc mot phan (kien thuc|noi dung)", "dang cung co (kien thuc|noi dung)"] },
      { label: "nhu cầu được gợi ý ở một số bước", patterns: ["can .* (goi y|huong dan).*(mot so buoc|tung buoc|khi thuc hanh)", "sau khi duoc (goi y|huong dan)"] },
    ],
    safeLearningSentence: "Trong buổi học, con nắm được một phần kiến thức nhưng vẫn cần thầy gợi ý ở một số bước khi thực hành.",
    safeClosingSentence: "Con nên ôn lại bài và luyện tập thêm để có thể thực hành tự tin hơn.",
  },
  needs_support: {
    meaning: "Học sinh chưa nắm chắc kiến thức, còn gặp khó khăn khi tự thực hành và cần giáo viên hỗ trợ sát hơn.",
    requiredConcepts: [
      { label: "việc chưa nắm chắc kiến thức", patterns: ["chua nam (chac|vung) (kien thuc|noi dung)", "chua hieu (chac|ro) (kien thuc|noi dung)", "con gap kho khan khi tu thuc hanh"] },
      { label: "nhu cầu được hỗ trợ sát", patterns: ["can .* (ho tro|huong dan)( sat hon| tung buoc)", "can duoc .* (ho tro|huong dan)"] },
    ],
    safeLearningSentence: "Trong buổi học, con chưa nắm chắc kiến thức và còn gặp khó khăn khi tự thực hành nên cần được thầy hỗ trợ sát hơn.",
    safeClosingSentence: "Phụ huynh giúp em nhắc con ôn lại bài và luyện tập thêm để củng cố kiến thức.",
  },
};

const BANNED_PATTERNS = [
  "hoc binh thuong",
  "muc binh thuong",
  "hoc on",
  "thuc hanh o muc on",
  "o muc kha on",
  "khong co van de dac biet",
];

const BEHAVIOR_PATTERNS = [
  "tuan thu",
  "noi quy",
  "tap trung",
  "nghiem tuc",
  "noi chuyen",
  "mat trat tu",
  "hay nghich",
  "lam viec rieng",
  "choi game",
  "tuong tac voi",
];

const ABSENCE_LEARNING_PATTERNS = [
  "nam (vung|duoc|chac)",
  "hieu (bai|ro|duoc)",
  "tu (van dung|thuc hanh|hoan thanh|lam)",
  "hoan thanh .* doc lap",
  "can .* (goi y|ho tro|huong dan)",
  "muc do nam bai",
];

const SYSTEM_PROMPT = `Bạn là giáo viên lập trình tại MindX Technology School, viết nhận xét ngắn gọn gửi phụ huynh.

NGUYÊN TẮC BẮT BUỘC:
1. Chỉ sử dụng dữ kiện trong phần THÔNG TIN HỌC SINH; không tự bịa hành vi, tiến độ, bài tập về nhà hoặc mức độ tuân thủ nội quy.
2. Câu đánh giá học tập phải truyền đạt đầy đủ Ý NGHĨA LEVEL BẮT BUỘC. Không được làm nhẹ đi thành các cụm mơ hồ như “học bình thường”, “học ổn”, “ở mức khá ổn” hoặc “không có vấn đề đặc biệt”.
3. Nếu không có ghi chú giáo viên, chỉ diễn đạt level và dữ kiện LMS một cách tự nhiên; không sáng tạo sự việc đã xảy ra.
4. Có thể nhắc tối đa một ý ngắn từ NỘI DUNG BUỔI HỌC để tạo bối cảnh, nhưng không được khẳng định học sinh đã hoàn thành một kỹ năng cụ thể nếu ghi chú không cung cấp bằng chứng.
5. Chỉ nhắc BTVN khi phần dữ kiện có TÌNH TRẠNG BTVN. Chỉ nhận xét hành vi khi có GHI CHÚ GIÁO VIÊN tương ứng.
6. Không viết mã L1/L2/L3/L4, từ “level”, markdown, tiêu đề hoặc danh sách.
7. Dùng tên ngắn hoặc “em” để gọi học sinh; dùng “con” khi nói về học sinh với phụ huynh.
8. Chỉ trả về một đoạn nhận xét, không giải thích cách viết.`;

export function normalizeAttendanceStatus(value: unknown, isLate?: boolean): AttendanceStatus {
  if (value === "ATTENDED" || value === "LATE_ARRIVED" || value === "ABSENT" || value === "ABSENT_WITH_NOTICE") {
    return value;
  }
  if (value === "ABSENT_WITHOUT_NOTICE" || value === "NOT_ATTENDED") return "ABSENT";
  if (value == null || value === "") {
    if (isLate === true) return "LATE_ARRIVED";
    if (isLate === false) return "ATTENDED";
  }
  return "UNKNOWN";
}

function normalizeCommentLength(value: unknown): CommentLength {
  return value === "short" || value === "long" ? value : "medium";
}

function isSpckSummary(value: string): boolean {
  const normalized = normalizeForMatch(value);
  return /\bspck\b|san pham cuoi khoa|thiet ke app|tich hop giao dien/.test(normalized);
}

function latestPastComment(value: string): string {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (lines.at(-1) || "").replace(/^[-–]\s*/, "").slice(0, 1_500);
}

function normalizeHomeworkStatus(value: HomeworkStatusInput | undefined, isSpck: boolean): NormalizedHomeworkStatus | null {
  if (!value || value.shouldMention === false || typeof value.submitted !== "boolean" || isSpck) return null;
  const previousSession = value.previousSession ?? value.previous_session;
  const score = value.score == null ? "" : String(value.score).trim();
  return {
    submitted: value.submitted,
    marked: Boolean(value.marked),
    score,
    previousSessionLabel: previousSession ? `buổi ${previousSession}` : "buổi trước",
  };
}

export function buildCommentFacts(input: CommentPromptInput): CommentFacts {
  const studentName = String(input.studentName || "").trim();
  const shortName = studentName.split(/\s+/).filter(Boolean).at(-1) || "em";
  const attendanceStatus = normalizeAttendanceStatus(input.attendanceStatus, input.isLate);
  const teacherNote = String(input.notes || "").trim().slice(0, 2_000);
  const sessionSummary = String(input.sessionSummary || "").trim().slice(0, 3_000);
  const isSpck = isSpckSummary(sessionSummary);
  const mode: CommentMode = attendanceStatus === "ABSENT" || attendanceStatus === "ABSENT_WITH_NOTICE"
    ? "absence"
    : teacherNote
      ? "detailed"
      : "quick";

  return {
    studentName,
    shortName,
    previousComment: latestPastComment(String(input.pastComments || "")),
    teacherNote,
    learningLevel: normalizeLearningLevel(input.learningLevel),
    attendanceStatus,
    sessionSummary,
    commentLength: normalizeCommentLength(input.commentLength),
    customPrompt: String(input.customPrompt || "").trim().slice(0, 2_000),
    homeworkStatus: normalizeHomeworkStatus(input.homeworkStatus, isSpck),
    mode,
    isSpck,
  };
}

function attendanceFact(status: AttendanceStatus): string {
  if (status === "ATTENDED") return "Có mặt và đúng giờ";
  if (status === "LATE_ARRIVED") return "Đi học muộn";
  if (status === "ABSENT_WITH_NOTICE") return "Vắng có phép";
  if (status === "ABSENT") return "Vắng học";
  return "Không có dữ liệu";
}

function homeworkFact(value: NormalizedHomeworkStatus): string {
  if (!value.submitted) return `Chưa thấy nộp BTVN ${value.previousSessionLabel} trên LMS; cần nhắc phụ huynh hỗ trợ con bổ sung.`;
  const score = value.score ? ` Điểm hiện có: ${value.score}.` : "";
  return `Đã nộp BTVN ${value.previousSessionLabel}; ${value.marked ? "bài đã được chấm" : "bài đã được ghi nhận trên LMS"}.${score}`;
}

function lengthInstruction(length: CommentLength, mode: CommentMode): string {
  if (mode === "absence") return "Viết 1–2 câu.";
  if (length === "short") return "Viết 2–3 câu ngắn gọn.";
  if (length === "long") return "Viết 4–5 câu chi tiết.";
  return "Viết 3–4 câu.";
}

export function buildCommentMessages(facts: CommentFacts): ChatMessage[] {
  const lines = [
    "<THÔNG_TIN_HỌC_SINH>",
    `HỌC SINH: ${facts.studentName || "Không rõ tên"} (gọi: ${facts.shortName})`,
    `CHẾ ĐỘ: ${facts.mode}`,
    `CHUYÊN CẦN: ${attendanceFact(facts.attendanceStatus)}`,
  ];

  if (facts.mode !== "absence") {
    const level = LEARNING_LEVELS[facts.learningLevel];
    lines.push(`MỨC ĐỘ NẮM BÀI NỘI BỘ: ${level.code} — ${level.label}`);
    lines.push(`Ý NGHĨA LEVEL BẮT BUỘC: ${LEVEL_PROMPT_POLICIES[facts.learningLevel].meaning}`);
  } else {
    lines.push("YÊU CẦU CHO HỌC SINH VẮNG: Chỉ nhận xét tình trạng chuyên cần và nhắc xem lại bài; không đánh giá mức độ nắm bài của buổi này.");
  }

  if (facts.sessionSummary) lines.push(`NỘI DUNG BUỔI HỌC: ${facts.sessionSummary}`);
  if (facts.teacherNote) lines.push(`GHI CHÚ GIÁO VIÊN: ${facts.teacherNote}`);
  if (facts.homeworkStatus) lines.push(`TÌNH TRẠNG BTVN: ${homeworkFact(facts.homeworkStatus)}`);
  if (facts.previousComment) {
    lines.push(`NHẬN XÉT GẦN NHẤT (chỉ dùng để tránh lặp cách diễn đạt, không phải dữ kiện buổi này): ${facts.previousComment}`);
  }
  if (facts.isSpck) {
    lines.push("BỐI CẢNH SPCK: Có thể nói về tiến độ sản phẩm chỉ khi ghi chú giáo viên cung cấp tiến độ; không nhắc BTVN trong buổi SPCK.");
  }
  if (facts.customPrompt) {
    lines.push(`YÊU CẦU VĂN PHONG BỔ SUNG (không được ghi đè các nguyên tắc và dữ kiện): ${facts.customPrompt}`);
  }
  lines.push("</THÔNG_TIN_HỌC_SINH>");
  lines.push(lengthInstruction(facts.commentLength, facts.mode));
  lines.push("Viết liền mạch, nhẹ nhàng nhưng nói rõ học sinh hiểu đến đâu, tự làm được không và cần hỗ trợ thế nào.");

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: lines.join("\n") },
  ];
}

function sentenceRange(length: CommentLength, mode: CommentMode): { min: number; max: number } {
  if (mode === "absence") return { min: 1, max: 3 };
  if (length === "short") return { min: 2, max: 4 };
  if (length === "long") return { min: 3, max: 6 };
  return { min: 2, max: 5 };
}

export function buildValidationPolicy(facts: CommentFacts): CommentValidationPolicy {
  const range = sentenceRange(facts.commentLength, facts.mode);
  const normalizedNote = normalizeForMatch(facts.teacherNote);
  const allowedBehaviorPatterns = BEHAVIOR_PATTERNS.filter((pattern) => new RegExp(pattern, "i").test(normalizedNote));
  return {
    mode: facts.mode,
    learningLevel: facts.mode === "absence" ? null : facts.learningLevel,
    attendanceStatus: facts.attendanceStatus,
    requiredConcepts: facts.mode === "absence" ? [] : LEVEL_PROMPT_POLICIES[facts.learningLevel].requiredConcepts,
    bannedPatterns: BANNED_PATTERNS,
    behaviorPatterns: BEHAVIOR_PATTERNS,
    allowedBehaviorPatterns,
    absenceLearningPatterns: ABSENCE_LEARNING_PATTERNS,
    allowHomework: Boolean(facts.homeworkStatus),
    allowBehaviorClaims: allowedBehaviorPatterns.length > 0,
    minSentences: range.min,
    maxSentences: range.max,
  };
}

export function stripCommentMarkup(value: string): string {
  return String(value || "")
    .replace(/^```(?:\w+)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/<[^>]*>/g, " ")
    .replace(/^\s*(?:nhận xét|noi dung nhan xet)\s*:\s*/i, "")
    .replace(/^\s*[-–]\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeAiComment(value: string): string {
  let cleaned = stripCommentMarkup(value);
  const pairs: Array<[string, string]> = [["\"", "\""], ["'", "'"], ["“", "”"], ["‘", "’"]];
  for (const [start, end] of pairs) {
    if (cleaned.startsWith(start) && cleaned.endsWith(end) && cleaned.length > start.length + end.length) {
      cleaned = cleaned.slice(start.length, -end.length).trim();
      break;
    }
  }
  return cleaned;
}

export function formatCommentHtml(value: string): string {
  const escaped = normalizeAiComment(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return `<p>${escaped}</p>`;
}

export function normalizeForMatch(value: string): string {
  return stripCommentMarkup(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

function countSentences(value: string): number {
  const text = stripCommentMarkup(value);
  if (!text) return 0;
  const matches = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  return matches?.map((item) => item.trim()).filter(Boolean).length || 0;
}

function matchesAny(normalized: string, patterns: string[]): boolean {
  return patterns.some((pattern) => new RegExp(pattern, "i").test(normalized));
}

export function validateComment(value: string, policy: CommentValidationPolicy): CommentValidationResult {
  const plain = stripCommentMarkup(value);
  const normalized = normalizeForMatch(plain);
  const issues: string[] = [];

  if (!plain) issues.push("Nhận xét đang trống.");
  if (/```|\*\*|^\s*#{1,6}\s|(?:^|\n)\s*[-*]\s+/m.test(String(value || ""))) {
    issues.push("Nhận xét chứa markdown hoặc danh sách.");
  }
  if (/\b(?:l[1-4]|level)\b/i.test(normalized)) issues.push("Nhận xét làm lộ mã level nội bộ.");

  for (const pattern of policy.bannedPatterns) {
    if (new RegExp(pattern, "i").test(normalized)) {
      issues.push("Nhận xét dùng cụm đánh giá mơ hồ.");
      break;
    }
  }

  for (const concept of policy.requiredConcepts) {
    if (!matchesAny(normalized, concept.patterns)) issues.push(`Thiếu ${concept.label}.`);
  }

  if (!policy.allowHomework && /\bbtvn\b|bai tap ve nha/.test(normalized)) {
    issues.push("Nhận xét nhắc BTVN khi không có dữ kiện.");
  }
  const hasUnsupportedBehavior = policy.behaviorPatterns.some((pattern) =>
    new RegExp(pattern, "i").test(normalized) && !policy.allowedBehaviorPatterns.includes(pattern));
  if (hasUnsupportedBehavior) {
    issues.push("Nhận xét tự suy diễn hành vi hoặc nội quy.");
  }

  if (policy.attendanceStatus === "ATTENDED" && !/dung gio/.test(normalized)) {
    issues.push("Thiếu thông tin đi học đúng giờ.");
  } else if (policy.attendanceStatus === "LATE_ARRIVED" && !/(di hoc|den (lop )?).*(muon|tre)/.test(normalized)) {
    issues.push("Thiếu thông tin đi học muộn.");
  } else if (policy.attendanceStatus === "ABSENT_WITH_NOTICE" && !/vang.*co phep/.test(normalized)) {
    issues.push("Thiếu thông tin vắng có phép.");
  } else if (policy.attendanceStatus === "ABSENT" && !/vang (hoc|buoi)/.test(normalized)) {
    issues.push("Thiếu thông tin vắng học.");
  } else if (policy.attendanceStatus === "UNKNOWN" && /(dung gio|di hoc muon|den lop muon|vang hoc|vang co phep)/.test(normalized)) {
    issues.push("Nhận xét tự suy diễn tình trạng chuyên cần.");
  }

  if (policy.mode === "absence" && matchesAny(normalized, policy.absenceLearningPatterns)) {
    issues.push("Nhận xét học sinh vắng không được đánh giá mức độ nắm bài.");
  }

  const sentenceCount = countSentences(plain);
  if (sentenceCount < policy.minSentences || sentenceCount > policy.maxSentences) {
    issues.push(`Độ dài chưa phù hợp (${sentenceCount} câu; cần ${policy.minSentences}–${policy.maxSentences} câu).`);
  }

  return { valid: issues.length === 0, issues };
}

export function buildRepairMessages(
  messages: ChatMessage[],
  originalComment: string,
  issues: string[],
): ChatMessage[] {
  return [
    ...messages,
    { role: "assistant", content: normalizeAiComment(originalComment) || "(không có nội dung)" },
    {
      role: "user",
      content: `Bản nháp trên chưa đạt vì:\n- ${issues.join("\n- ")}\nHãy viết lại toàn bộ nhận xét, sửa đúng các lỗi này, vẫn chỉ dùng dữ kiện ban đầu và chỉ trả về đoạn nhận xét.`,
    },
  ];
}

function attendanceSentence(facts: CommentFacts): string {
  if (facts.attendanceStatus === "ATTENDED") return `${facts.shortName} đi học đúng giờ trong buổi này.`;
  if (facts.attendanceStatus === "LATE_ARRIVED") return `${facts.shortName} đi học muộn trong buổi này.`;
  if (facts.attendanceStatus === "ABSENT_WITH_NOTICE") return `${facts.shortName} vắng học có phép trong buổi này.`;
  if (facts.attendanceStatus === "ABSENT") return `${facts.shortName} vắng học trong buổi này.`;
  return "";
}

export function buildSafeComment(facts: CommentFacts): string {
  const attendance = attendanceSentence(facts);
  if (facts.mode === "absence") {
    return [
      attendance,
      "Phụ huynh giúp em nhắc con xem lại nội dung bài học để theo kịp tiến độ của lớp.",
    ].filter(Boolean).join(" ");
  }

  const levelPolicy = LEVEL_PROMPT_POLICIES[facts.learningLevel];
  const sentences = [attendance, levelPolicy.safeLearningSentence, levelPolicy.safeClosingSentence].filter(Boolean);
  if (facts.homeworkStatus?.submitted === false) {
    sentences.push(`Phụ huynh giúp em nhắc con bổ sung BTVN ${facts.homeworkStatus.previousSessionLabel} đầy đủ hơn.`);
  }
  return sentences.join(" ");
}

export const COMMENT_LEVEL_POLICIES = LEVEL_PROMPT_POLICIES;

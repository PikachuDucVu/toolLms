import { LEARNING_LEVELS, PRODUCT_PROGRESS_LEVELS, normalizeLearningLevel, type LearningLevel } from "../constants/learningLevels";

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
  evaluationNote?: string;
  evaluation_note?: string;
  evaluationSummary?: string;
  evaluation_summary?: string;
  note?: string;
  score?: string | number | null;
  status?: string;
  lessonName?: string;
  lesson_name?: string;
}

export interface CommentPromptInput {
  studentName: string;
  studentCallName?: string;
  pastComments?: string;
  notes?: string;
  learningLevel?: LearningLevel;
  attendanceStatus?: AttendanceStatus | string;
  isLate?: boolean;
  sessionSummary?: string;
  sessionNumber?: number | string;
  commentLength?: string;
  customPrompt?: string;
  homeworkStatus?: HomeworkStatusInput;
}

interface NormalizedHomeworkStatus {
  submitted: boolean;
  marked: boolean;
  evaluationSummary: string;
  previousSessionLabel: string;
}

export interface CommentFacts {
  studentName: string;
  studentCallName: string;
  previousComment: string;
  teacherNote: string;
  learningLevel: LearningLevel;
  attendanceStatus: AttendanceStatus;
  sessionSummary: string;
  sessionNumber?: number;
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
  requireHomeworkEvaluation: boolean;
  homeworkEvaluationKeywords: string[];
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
      {
        label: "mức độ nắm vững kiến thức",
        patterns: [
          "nam (?:rat )?(?:vung|chac)(?: (?:kien thuc|noi dung|bai hoc))?",
          "hieu (?:rat )?ro (?:kien thuc|noi dung|bai hoc)",
          "hieu (?:bai|kien thuc|noi dung) (?:rat )?(?:tot|chac|sau)",
          "(?:tiep thu|nam bat) (?:rat )?tot (?:kien thuc|noi dung|bai hoc)",
          "lam chu (?:kien thuc|noi dung|bai hoc)",
        ],
      },
      {
        label: "khả năng tự vận dụng hoặc làm độc lập",
        patterns: [
          "tu (?:minh )?(?:van dung|ap dung|thuc hanh|thuc hien|hoan thanh|lam)",
          "tu tin (?:van dung|ap dung|thuc hanh|thuc hien|hoan thanh)",
          "(?:van dung|ap dung|thuc hanh|thuc hien|hoan thanh|lam).{0,60}(?:doc lap|khong can (?:su )?(?:goi y|huong dan|ho tro))",
          "doc lap.{0,40}(?:van dung|ap dung|thuc hanh|thuc hien|hoan thanh|lam)",
          "chu dong (?:van dung|ap dung|thuc hanh|thuc hien|hoan thanh|lam)",
        ],
      },
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

const SPCK_LEVEL_POLICIES: Record<LearningLevel, LevelPromptPolicy> = {
  independent: {
    meaning: "Học sinh hoàn thành tốt tiến độ dự án, tự giác phát triển thêm tính năng sáng tạo và tự xử lý lỗi tốt mà ít cần hỗ trợ.",
    requiredConcepts: [
      {
        label: "nội dung sản phẩm hoặc dự án cuối khóa",
        patterns: [
          "spck", "san pham", "cuoi khoa", "do an", "du an", "thiet ke", "giao dien", "tien do", "lap trinh", "slide", "hoan thien", "ung dung", "game",
        ],
      },
      {
        label: "tiến độ tốt hoặc sự tự chủ/sáng tạo",
        patterns: [
          "tien do (?:rat )?(?:tot|nhanh|som|hoan thien)",
          "vuot tien do",
          "hoan thanh (?:rat )?(?:tot|xong|nhanh|som)",
          "bam sat tien do",
          "dung tien do",
          "tu (?:minh |tin |giac )?(?:hoan thien|thuc hien|lam|lap trinh|thiet ke|phat trien|xay dung|sang tao|xu ly|sua)",
          "chu dong",
          "sang tao",
          "it can (?:thay|giao vien) ho tro",
        ],
      },
    ],
    safeLearningSentence: "Trong buổi học, con hoàn thành rất tốt tiến độ sản phẩm và chủ động phát triển thêm các tính năng sáng tạo.",
    safeClosingSentence: "Con tiếp tục trau chuốt sản phẩm để chuẩn bị cho buổi thuyết trình sắp tới nhé.",
  },
  understands_and_asks: {
    meaning: "Học sinh bám sát tiến độ dự án, hoàn thành tốt các chức năng chính; khi gặp lỗi chủ động hỏi giáo viên và xử lý nhanh sau khi được hướng dẫn.",
    requiredConcepts: [
      {
        label: "nội dung sản phẩm hoặc dự án cuối khóa",
        patterns: [
          "spck", "san pham", "cuoi khoa", "do an", "du an", "thiet ke", "giao dien", "tien do", "lap trinh", "slide", "hoan thien", "ung dung", "game",
        ],
      },
      {
        label: "bám sát tiến độ hoặc chủ động trao đổi xử lý lỗi",
        patterns: [
          "bam sat tien do",
          "dung tien do",
          "tien do (?:du an|san pham).{0,30}(?:on dinh|dung|tot|kha)",
          "(?:hoan thanh|dat|theo kip) (?:tot )?(?:tien do|chuc nang|tinh nang|ke hoach)",
          "chu dong (?:hoi|trao doi|hoi lai)",
          "(?:xu ly|sua|hoan thanh).{0,40}(?:sau khi duoc (?:huong dan|giai dap|ho tro)|nhanh chong)",
        ],
      },
    ],
    safeLearningSentence: "Trong buổi học, con bám sát tiến độ dự án và hoàn thành tốt các chức năng chính theo yêu cầu.",
    safeClosingSentence: "Con tiếp tục duy trì tiến độ này trong các buổi học tiếp theo nhé.",
  },
  needs_prompting: {
    meaning: "Học sinh đã xây dựng được khung sản phẩm nhưng tiến độ triển khai còn chậm, còn lúng túng ở một số bước logic và cần giáo viên gợi ý thêm.",
    requiredConcepts: [
      {
        label: "nội dung sản phẩm hoặc dự án cuối khóa",
        patterns: [
          "spck", "san pham", "cuoi khoa", "do an", "du an", "thiet ke", "giao dien", "tien do", "lap trinh", "slide", "hoan thien", "ung dung", "game",
        ],
      },
      {
        label: "tiến độ còn chậm hoặc cần gợi ý/làm thêm ở nhà",
        patterns: [
          "(?:dung|xay dung|co|hoan thanh) duoc khung",
          "tien do.{0,30}(?:con |hoi )?(?:cham|chua xong|chua hoan tat)",
          "con (?:cham|lung tung)",
          "hoi cham",
          "can (?:them )?(?:goi y|huong dan|ho tro)",
          "(?:lam|hoan thien|danh thoi gian).{0,30}(?:o nha|them)",
          "nhac con",
        ],
      },
    ],
    safeLearningSentence: "Trong buổi học, con đã xây dựng được khung cơ bản của sản phẩm nhưng tiến độ triển khai còn hơi chậm so với kế hoạch.",
    safeClosingSentence: "Phụ huynh nhắc con dành thêm thời gian ở nhà để hoàn thiện kịp tiến độ nhé.",
  },
  needs_support: {
    meaning: "Học sinh gặp khó khăn khi triển khai dự án nên tiến độ còn chậm so với yêu cầu, chưa hoàn thành chức năng cốt lõi và cần giáo viên hỗ trợ sát.",
    requiredConcepts: [
      {
        label: "nội dung sản phẩm hoặc dự án cuối khóa",
        patterns: [
          "spck", "san pham", "cuoi khoa", "do an", "du an", "thiet ke", "giao dien", "tien do", "lap trinh", "slide", "hoan thien", "ung dung", "game",
        ],
      },
      {
        label: "tiến độ chậm hoặc cần hỗ trợ sát/làm thêm ở nhà",
        patterns: [
          "gap (?:nhieu )?kho khan",
          "tien do.{0,30}(?:cham|chua dat|chua theo kip)",
          "chua (?:hoan thanh|xong) (?:chuc nang|tinh nang|khung)",
          "can (?:duoc )?(?:ho tro|huong dan|kem) sat",
          "(?:lam|hoan thien|danh thoi gian|on).{0,30}(?:o nha|them)",
          "bat buoc",
        ],
      },
    ],
    safeLearningSentence: "Trong buổi học, con gặp khá nhiều khó khăn khi triển khai dự án nên tiến độ sản phẩm còn chậm so với yêu cầu.",
    safeClosingSentence: "Con cần cố gắng và dành thêm thời gian làm ở nhà để kịp hoàn thiện sản phẩm trước ngày Demo nhé.",
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
1. KHÔNG lồng ghép hay nhắc lại tên bài học / tên ứng dụng / nội dung buổi học vào nhận xét từng học sinh (vì tin nhắn gửi phụ huynh đã có mục nội dung chung ở đầu). Mở đầu ngắn gọn, tự nhiên, linh hoạt: "Buổi học hôm nay [Tên] tham gia lớp đầy đủ và đúng giờ...", "Trong buổi học hôm nay, [Tên]...", "Trong buổi học, [Tên]...".
2. BTVN phải nhận xét cực kỳ NGẮN GỌN và TỰ NHIÊN, dứt khoát như lời thầy cô dặn dò:
   - Nếu đã nộp: "Con hoàn thành BTVN buổi [X] đầy đủ, cố gắng phát huy ở các buổi học tới." (hoặc tương đương).
   - Nếu chưa nộp: "Tuy nhiên con chưa hoàn thành BTVN đầy đủ, cần lưu ý." hoặc "Con chưa hoàn thành BTVN buổi [X], cần lưu ý.".
   - Tuyệt đối KHÔNG viết rườm rà khách sáo kiểu "hệ thống LMS chưa ghi nhận", "kính nhờ phụ huynh hỗ trợ nhắc nhở con", "đã được nộp và ghi nhận trên hệ thống".
   - KHÔNG đề cập BTVN trong các buổi làm Sản Phẩm Cuối Khóa (SPCK).
3. Đánh giá học tập:
   - Buổi thường: Câu đánh giá học tập phải truyền đạt đầy đủ Ý NGHĨA LEVEL BẮT BUỘC và ghi chú giáo viên (nếu có). Nêu rõ mức độ tiếp thu, tính chủ động khi hỏi bài/thực hành, và mức độ hỗ trợ cần thiết. Không được làm nhẹ đi thành các cụm mơ hồ như “học bình thường”, “học ổn”, “ở mức khá ổn” hoặc “không có vấn đề đặc biệt”.
   - Buổi làm Sản Phẩm Cuối Khóa (SPCK): Tập trung nhận xét về TIẾN ĐỘ SẢN PHẨM CUỐI KHÓA (đạt đúng tiến độ đề ra / hoàn thiện giao diện / tích hợp lập trình / chuẩn bị slide) và dặn dò hoàn thiện sản phẩm ở nhà.
4. Chỉ sử dụng dữ kiện trong phần THÔNG TIN HỌC SINH; không tự bịa hành vi, tiến độ, bài tập về nhà hoặc mức độ tuân thủ nội quy.
5. Nếu có ĐÁNH GIÁ BTVN, chỉ tóm tắt tối đa một ý ngắn và tuyệt đối không nêu điểm số BTVN. Chỉ nhận xét hành vi khi có GHI CHÚ GIÁO VIÊN tương ứng.
6. Không viết mã L1/L2/L3/L4, từ “level”, markdown, tiêu đề hoặc danh sách.
7. Dùng đúng tên trong mục GỌI TRONG NHẬN XÉT hoặc “em” để gọi học sinh; dùng “con” khi nói về học sinh với phụ huynh.
8. Chỉ trả về một đoạn nhận xét duy nhất (2–3 câu), không giải thích cách viết.`;

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

export function isSpckSession(sessionSummary: string, sessionNumber?: number): boolean {
  if (typeof sessionNumber === "number" && Number.isFinite(sessionNumber) && sessionNumber >= 10 && sessionNumber <= 13) {
    return true;
  }
  const normalized = normalizeForMatch(sessionSummary);
  return /\bspck\b|san pham cuoi khoa|thiet ke app|tich hop giao dien|\bbuoi 1[0-3]\b|\bbuoi (?:10|11|12|13)\b/.test(normalized);
}

function isSpckSummary(value: string, sessionNumber?: number): boolean {
  return isSpckSession(value, sessionNumber);
}

function latestPastComment(value: string): string {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (lines.at(-1) || "").replace(/^[-–]\s*/, "").slice(0, 1_500);
}

function deriveStudentCallName(studentName: string): string {
  const parts = studentName.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "em";
  return parts.length === 1 ? parts[0] : parts.slice(-2).join(" ");
}

function normalizeHomeworkEvaluation(value: unknown): string {
  const normalized = String(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/^(?:btvn|bài tập về nhà)(?:\s+buổi\s+\d+)?[\s:;,.\/=_\-–—]+\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?(?:\s*điểm)?\s*/iu, "")
    .replace(/((?:btvn|bài tập về nhà)).{0,50}?(?:đạt|được(?: chấm)?|chấm)\s+(?:mức\s+)?(?:điểm\s*)?\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?(?:\s*điểm)?\s*[.,;:]?/giu, "$1: ")
    .replace(/(?:^|[\s(])điểm(?:\s+(?:btvn|bài tập về nhà|hiện có|số|bài))?\s*[:\-]?\s*\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?/giu, " ")
    .replace(/điểm\s+(?:btvn|bài tập về nhà).{0,30}?\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?/giu, " ")
    .replace(/(?:được|đạt|chấm)\s+(?:mức\s+)?(?:điểm\s*)?\d+(?:[.,]\d+)?\s*(?:điểm|\/\s*\d+(?:[.,]\d+)?)/giu, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:điểm|\/\s*\d+(?:[.,]\d+)?)\b/giu, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim()
    .replace(/^(?:btvn|bài tập về nhà)\s*[:;,.\/=_\-–—]\s*/iu, "")
    .replace(/^\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?(?:\s*điểm)?\s*[.;:,\-]\s*/iu, "")
    .replace(/^[,.;:!?\-]+\s*/, "")
    .slice(0, 1_500);

  return /^\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)?(?:\s*điểm)?$/iu.test(normalized)
    ? ""
    : normalized;
}

const HOMEWORK_EVALUATION_STOPWORDS = new Set([
  "bai", "lam", "con", "em", "hoc", "sinh", "btvn", "tap", "ve", "nha", "da", "duoc", "co", "va",
  "nhung", "can", "them", "hon", "mot", "cac", "cua", "trong", "khi", "phan", "nen", "dat", "ket", "qua",
]);

function homeworkEvaluationKeywords(value: string): string[] {
  const words = normalizeForMatch(value).match(/[a-z0-9]+/g) || [];
  return [...new Set(words)]
    .filter((word) => word.length >= 3 && !HOMEWORK_EVALUATION_STOPWORDS.has(word) && !/^\d+$/.test(word))
    .slice(0, 16);
}

function normalizeHomeworkStatus(value: HomeworkStatusInput | undefined, isSpck: boolean): NormalizedHomeworkStatus | null {
  if (!value || value.shouldMention === false || typeof value.submitted !== "boolean" || isSpck) return null;
  const previousSession = value.previousSession ?? value.previous_session;
  const evaluationSource = value.evaluationNote
    ?? value.evaluation_note
    ?? value.evaluationSummary
    ?? value.evaluation_summary
    ?? value.note;
  return {
    submitted: value.submitted,
    marked: Boolean(value.marked),
    evaluationSummary: normalizeHomeworkEvaluation(evaluationSource),
    previousSessionLabel: previousSession ? `buổi ${previousSession}` : "buổi trước",
  };
}

export function buildCommentFacts(input: CommentPromptInput): CommentFacts {
  const studentName = String(input.studentName || "").trim();
  const providedCallName = String(input.studentCallName || "").trim();
  const studentCallName = providedCallName || deriveStudentCallName(studentName);
  const attendanceStatus = normalizeAttendanceStatus(input.attendanceStatus, input.isLate);
  const teacherNote = String(input.notes || "").trim().slice(0, 2_000);
  const sessionSummary = String(input.sessionSummary || "").trim().slice(0, 3_000);
  const parsedSessionNumber = input.sessionNumber != null && Number.isFinite(Number(input.sessionNumber))
    ? Number(input.sessionNumber)
    : undefined;
  const isSpck = isSpckSummary(sessionSummary, parsedSessionNumber);
  const mode: CommentMode = attendanceStatus === "ABSENT" || attendanceStatus === "ABSENT_WITH_NOTICE"
    ? "absence"
    : teacherNote
      ? "detailed"
      : "quick";

  return {
    studentName,
    studentCallName,
    previousComment: latestPastComment(String(input.pastComments || "")),
    teacherNote,
    learningLevel: normalizeLearningLevel(input.learningLevel),
    attendanceStatus,
    sessionSummary,
    sessionNumber: parsedSessionNumber,
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
  if (!value.submitted) return `Chưa hoàn thành BTVN ${value.previousSessionLabel}; cần nhận xét ngắn gọn dứt khoát ('Con chưa hoàn thành BTVN ${value.previousSessionLabel}, cần lưu ý.' hoặc 'Tuy nhiên con chưa hoàn thành BTVN đầy đủ, cần lưu ý.').`;
  return `Đã hoàn thành BTVN ${value.previousSessionLabel} đầy đủ; ${value.marked ? "bài đã được chấm" : "bài đã nộp"}.`;
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
    `HỌC SINH: ${facts.studentName || "Không rõ tên"}`,
    `GỌI TRONG NHẬN XÉT: ${facts.studentCallName}`,
    `CHẾ ĐỘ: ${facts.mode}`,
    `CHUYÊN CẦN: ${attendanceFact(facts.attendanceStatus)}`,
  ];

  if (facts.mode !== "absence") {
    if (facts.isSpck) {
      const level = PRODUCT_PROGRESS_LEVELS[facts.learningLevel];
      lines.push(`MỨC ĐỘ TIẾN ĐỘ SẢN PHẨM: ${level.code} — ${level.label}`);
      lines.push(`Ý NGHĨA TIẾN ĐỘ BẮT BUỘC: ${SPCK_LEVEL_POLICIES[facts.learningLevel].meaning}`);
    } else {
      const level = LEARNING_LEVELS[facts.learningLevel];
      lines.push(`MỨC ĐỘ NẮM BÀI NỘI BỘ: ${level.code} — ${level.label}`);
      lines.push(`Ý NGHĨA LEVEL BẮT BUỘC: ${LEVEL_PROMPT_POLICIES[facts.learningLevel].meaning}`);
    }
  } else {
    lines.push("YÊU CẦU CHO HỌC SINH VẮNG: Chỉ nhận xét tình trạng chuyên cần và nhắc xem lại bài; không đánh giá mức độ nắm bài của buổi này.");
  }

  if (facts.sessionSummary) lines.push(`NỘI DUNG BUỔI HỌC: ${facts.sessionSummary}`);
  if (facts.teacherNote) lines.push(`GHI CHÚ GIÁO VIÊN: ${facts.teacherNote}`);
  if (facts.homeworkStatus) {
    lines.push(`TÌNH TRẠNG BTVN: ${homeworkFact(facts.homeworkStatus)}`);
    if (facts.homeworkStatus.submitted && facts.homeworkStatus.evaluationSummary) {
      lines.push(`ĐÁNH GIÁ BTVN ĐỂ TÓM TẮT: ${facts.homeworkStatus.evaluationSummary}`);
      lines.push("YÊU CẦU BTVN: Tóm tắt tối đa một ý ngắn từ đánh giá trên; không chép dài và không nêu điểm số.");
    } else if (facts.homeworkStatus.submitted) {
      lines.push(`YÊU CẦU BTVN: Nhận xét ngắn gọn dứt khoát việc hoàn thành BTVN (ví dụ: 'Con hoàn thành BTVN ${facts.homeworkStatus.previousSessionLabel} đầy đủ, cố gắng phát huy ở các buổi học tới.'); không nêu điểm số.`);
    } else {
      lines.push(`YÊU CẦU BTVN: Nhắc ngắn gọn dứt khoát 1 vế (ví dụ: 'Con chưa hoàn thành BTVN ${facts.homeworkStatus.previousSessionLabel}, cần lưu ý.' hoặc 'Tuy nhiên con chưa hoàn thành BTVN đầy đủ, cần lưu ý.'); tuyệt đối không viết rườm rà khách sáo.`);
    }
  }
  if (facts.previousComment) {
    lines.push(`NHẬN XÉT GẦN NHẤT (chỉ dùng để tránh lặp cách diễn đạt, không phải dữ kiện buổi này): ${facts.previousComment}`);
  }
  if (facts.isSpck) {
    lines.push("BỐI CẢNH BUỔI LÀM SẢN PHẨM CUỐI KHÓA (SPCK):");
    lines.push("- Nhận xét tập trung vào TIẾN ĐỘ SẢN PHẨM CUỐI KHÓA (xong chức năng chính / tự phát triển tính năng sáng tạo / tự sửa lỗi / cần làm thêm ở nhà).");
    lines.push("- Tuyệt đối KHÔNG nhắc đến BTVN hay Denise (vì buổi SPCK không có BTVN thông thường).");
    lines.push("- Dặn dò cuối câu: Tùy theo tiến độ, dặn học sinh tiếp tục hoàn thiện sản phẩm hoặc chuẩn bị slide/nội dung thuyết trình ở nhà.");
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
  const normalizedEvidence = normalizeForMatch(`${facts.teacherNote} ${facts.homeworkStatus?.evaluationSummary || ""}`);
  const allowedBehaviorPatterns = BEHAVIOR_PATTERNS.filter((pattern) => new RegExp(pattern, "i").test(normalizedEvidence));
  if (facts.isSpck) {
    if (!allowedBehaviorPatterns.includes("nghiem tuc")) allowedBehaviorPatterns.push("nghiem tuc");
    if (!allowedBehaviorPatterns.includes("tuan thu")) allowedBehaviorPatterns.push("tuan thu");
    if (!allowedBehaviorPatterns.includes("noi quy")) allowedBehaviorPatterns.push("noi quy");
  }
  const requireHomeworkEvaluation = Boolean(facts.homeworkStatus?.submitted && facts.homeworkStatus.evaluationSummary);
  const policies = facts.isSpck ? SPCK_LEVEL_POLICIES : LEVEL_PROMPT_POLICIES;
  return {
    mode: facts.mode,
    learningLevel: facts.mode === "absence" ? null : facts.learningLevel,
    attendanceStatus: facts.attendanceStatus,
    requiredConcepts: facts.mode === "absence" ? [] : policies[facts.learningLevel].requiredConcepts,
    bannedPatterns: BANNED_PATTERNS,
    behaviorPatterns: BEHAVIOR_PATTERNS,
    allowedBehaviorPatterns,
    absenceLearningPatterns: ABSENCE_LEARNING_PATTERNS,
    allowHomework: Boolean(facts.homeworkStatus),
    requireHomeworkEvaluation,
    homeworkEvaluationKeywords: requireHomeworkEvaluation
      ? homeworkEvaluationKeywords(facts.homeworkStatus?.evaluationSummary || "")
      : [],
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
    .replace(/[̀-ͯ]/g, "")
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

function mentionsHomework(normalized: string): boolean {
  return /\bbtvn\b|bai tap ve nha|bai tap (?:buoi|o nha)/.test(normalized);
}

function mentionsHomeworkScore(normalized: string): boolean {
  return [
    "(?:btvn|bai tap ve nha)(?:\\s+buoi\\s+\\d+)?[\\s:;,.\\/=_\\-]+\\d+(?:[.,]\\d+)?(?:\\s*/\\s*\\d+(?:[.,]\\d+)?)?(?:\\s*diem)?",
    "(?:btvn|bai tap ve nha).{0,60}(?:dat|duoc(?: cham)?|cham|nhan)\\s+(?:muc\\s+)?(?:diem\\s*)?\\d+(?:[.,]\\d+)?(?:\\s*/\\s*\\d+(?:[.,]\\d+)?)?(?:\\s*diem)?",
    "(?:btvn|bai tap ve nha).{0,60}(?:muc\\s+)?diem\\s*(?:la|:)?\\s*\\d+(?:[.,]\\d+)?",
    "diem\\s+(?:cua\\s+)?(?:btvn|bai tap ve nha).{0,30}(?:la\\s*)?\\d+(?:[.,]\\d+)?",
    "(?:duoc|dat|cham)\\s+(?:muc\\s+)?diem\\s*(?:la|:)?\\s*\\d+(?:[.,]\\d+)?",
    "(?:duoc|dat|cham)\\s+\\d+(?:[.,]\\d+)?\\s*diem",
    "\\b\\d+(?:[.,]\\d+)?\\s*/\\s*(?:10|100)\\b",
  ].some((pattern) => new RegExp(pattern, "i").test(normalized));
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

  if (!policy.allowHomework && mentionsHomework(normalized)) {
    issues.push("Nhận xét nhắc BTVN khi không có dữ kiện.");
  }
  if (policy.requireHomeworkEvaluation) {
    const normalizedWords = new Set(normalized.match(/[a-z0-9]+/g) || []);
    const keywordMatchCount = policy.homeworkEvaluationKeywords.filter((keyword) => normalizedWords.has(keyword)).length;
    const requiredKeywordMatches = Math.min(2, policy.homeworkEvaluationKeywords.length);
    const includesEvaluation = requiredKeywordMatches === 0 || keywordMatchCount >= requiredKeywordMatches;
    if (!mentionsHomework(normalized) || !includesEvaluation) {
      issues.push("Thiếu tóm tắt đánh giá BTVN.");
    }
  }
  if (mentionsHomeworkScore(normalized)) {
    issues.push("Nhận xét không được nêu điểm số BTVN.");
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
  if (facts.attendanceStatus === "ATTENDED") return `${facts.studentCallName} đi học đúng giờ trong buổi này.`;
  if (facts.attendanceStatus === "LATE_ARRIVED") return `${facts.studentCallName} đi học muộn trong buổi này.`;
  if (facts.attendanceStatus === "ABSENT_WITH_NOTICE") return `${facts.studentCallName} vắng học có phép trong buổi này.`;
  if (facts.attendanceStatus === "ABSENT") return `${facts.studentCallName} vắng học trong buổi này.`;
  return "";
}

function safeHomeworkEvaluationSentence(facts: CommentFacts): string {
  const homework = facts.homeworkStatus;
  if (!homework?.submitted || !homework.evaluationSummary) return "";
  const firstSentence = homework.evaluationSummary.match(/[^.!?]+[.!?]?/)?.[0]?.trim() || "";
  const summary = firstSentence.replace(/[.!?]+$/, "").trim().slice(0, 240);
  if (!summary) return "";
  const sentence = `Về BTVN ${homework.previousSessionLabel}: ${summary}.`;
  return mentionsHomeworkScore(normalizeForMatch(sentence)) ? "" : sentence;
}

export function buildSafeComment(facts: CommentFacts): string {
  const attendance = attendanceSentence(facts);
  if (facts.mode === "absence") {
    return [
      attendance,
      facts.isSpck
        ? "Phụ huynh giúp em nhắc con tiếp tục hoàn thiện sản phẩm cuối khóa tại nhà để theo kịp tiến độ của lớp."
        : "Phụ huynh giúp em nhắc con xem lại nội dung bài học để theo kịp tiến độ của lớp.",
    ].filter(Boolean).join(" ");
  }

  const levelPolicy = facts.isSpck ? SPCK_LEVEL_POLICIES[facts.learningLevel] : LEVEL_PROMPT_POLICIES[facts.learningLevel];
  const sentences = [attendance, levelPolicy.safeLearningSentence, levelPolicy.safeClosingSentence].filter(Boolean);
  if (facts.homeworkStatus?.submitted === false) {
    sentences.push(`Con chưa hoàn thành BTVN ${facts.homeworkStatus.previousSessionLabel}, cần lưu ý.`);
  } else {
    const homeworkEvaluation = safeHomeworkEvaluationSentence(facts);
    if (homeworkEvaluation) {
      sentences.push(homeworkEvaluation);
    } else if (facts.homeworkStatus?.submitted === true) {
      sentences.push(`Con hoàn thành BTVN ${facts.homeworkStatus.previousSessionLabel} đầy đủ, cố gắng phát huy.`);
    }
  }
  return sentences.join(" ");
}

export const COMMENT_LEVEL_POLICIES = LEVEL_PROMPT_POLICIES;
export const SPCK_COMMENT_LEVEL_POLICIES = SPCK_LEVEL_POLICIES;

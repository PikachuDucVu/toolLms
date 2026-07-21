export const LEARNING_LEVELS = {
  independent: {
    code: "L4",
    label: "Nắm vững, tự vận dụng",
    prompt:
      "Học sinh nắm vững kiến thức, có thể tự vận dụng và hoàn thành phần thực hành độc lập, nhanh chóng và chính xác.",
  },
  understands_and_asks: {
    code: "L3",
    label: "Nắm được, chủ động hỏi",
    prompt:
      "Học sinh nắm được kiến thức chính; với những phần chưa hiểu, học sinh chủ động hỏi lại giáo viên và có thể hoàn thành sau khi được giải đáp.",
  },
  needs_prompting: {
    code: "L2",
    label: "Đang củng cố, cần gợi ý",
    prompt:
      "Học sinh nắm được một phần kiến thức nhưng vẫn cần giáo viên gợi ý hoặc hướng dẫn ở một số bước trong quá trình thực hành.",
  },
  needs_support: {
    code: "L1",
    label: "Chưa nắm chắc, cần hỗ trợ",
    prompt:
      "Học sinh chưa nắm chắc kiến thức, còn gặp khó khăn khi tự thực hành và cần giáo viên hỗ trợ sát hơn.",
  },
} as const;

export type LearningLevel = keyof typeof LEARNING_LEVELS;

export const DEFAULT_LEARNING_LEVEL: LearningLevel = "understands_and_asks";

export function isLearningLevel(value: unknown): value is LearningLevel {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(LEARNING_LEVELS, value);
}

export function normalizeLearningLevel(value: unknown): LearningLevel {
  return isLearningLevel(value) ? value : DEFAULT_LEARNING_LEVEL;
}

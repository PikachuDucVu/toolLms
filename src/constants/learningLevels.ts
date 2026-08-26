export const LEARNING_LEVELS = {
  independent: {
    code: "L4",
    label: "Nắm vững, tự vận dụng",
    shortLabel: "Nắm vững",
    help: "Tự vận dụng và hoàn thành độc lập",
    prompt:
      "Học sinh nắm vững kiến thức, có thể tự vận dụng và hoàn thành phần thực hành độc lập, nhanh chóng và chính xác.",
  },
  understands_and_asks: {
    code: "L3",
    label: "Nắm được, chủ động hỏi",
    shortLabel: "Nắm được",
    help: "Chủ động hỏi lại khi chưa hiểu",
    prompt:
      "Học sinh nắm được kiến thức chính; với những phần chưa hiểu, học sinh chủ động hỏi lại giáo viên và có thể hoàn thành sau khi được giải đáp.",
  },
  needs_prompting: {
    code: "L2",
    label: "Đang củng cố, cần gợi ý",
    shortLabel: "Đang củng cố",
    help: "Cần thầy gợi ý ở một số bước",
    prompt:
      "Học sinh nắm được một phần kiến thức nhưng vẫn cần giáo viên gợi ý hoặc hướng dẫn ở một số bước trong quá trình thực hành.",
  },
  needs_support: {
    code: "L1",
    label: "Chưa nắm chắc, cần hỗ trợ",
    shortLabel: "Cần hỗ trợ",
    help: "Cần được hướng dẫn sát hơn",
    prompt:
      "Học sinh chưa nắm chắc kiến thức, còn gặp khó khăn khi tự thực hành và cần giáo viên hỗ trợ sát hơn.",
  },
} as const;

export const PRODUCT_PROGRESS_LEVELS = {
  independent: {
    code: "L4",
    label: "Vượt tiến độ, tự chủ cao",
    shortLabel: "Vượt tiến độ",
    help: "Hoàn thành sớm tính năng chính, tự giác sáng tạo và debug tốt",
    prompt:
      "Học sinh hoàn thành tốt tiến độ dự án, tự giác phát triển thêm tính năng sáng tạo và tự xử lý lỗi tốt mà ít cần hỗ trợ.",
  },
  understands_and_asks: {
    code: "L3",
    label: "Đúng tiến độ, thao tác tốt",
    shortLabel: "Đúng tiến độ",
    help: "Bám sát kế hoạch, chủ động hỏi và xử lý khi gặp lỗi",
    prompt:
      "Học sinh bám sát tiến độ dự án, hoàn thành tốt các chức năng chính; khi gặp lỗi chủ động hỏi giáo viên và xử lý nhanh sau khi được hướng dẫn.",
  },
  needs_prompting: {
    code: "L2",
    label: "Hơi chậm tiến độ, cần gợi ý",
    shortLabel: "Hơi chậm",
    help: "Đã có khung, còn lúng túng khi code logic, cần làm thêm ở nhà",
    prompt:
      "Học sinh đã xây dựng được khung sản phẩm nhưng tiến độ triển khai còn chậm, còn lúng túng ở một số bước logic và cần giáo viên gợi ý thêm.",
  },
  needs_support: {
    code: "L1",
    label: "Chậm tiến độ, cần kèm sát",
    shortLabel: "Cần kèm sát",
    help: "Chưa xong chức năng cốt lõi, gặp nhiều lỗi, cần làm bù ở nhà",
    prompt:
      "Học sinh gặp khó khăn khi triển khai dự án nên tiến độ còn chậm so với yêu cầu, chưa hoàn thành chức năng cốt lõi và cần giáo viên hỗ trợ sát.",
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


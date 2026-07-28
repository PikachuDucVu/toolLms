import { describe, expect, it } from "vitest";
import type { LearningLevel } from "../src/constants/learningLevels";
import {
  buildCommentFacts,
  buildCommentMessages,
  buildSafeComment,
  buildValidationPolicy,
  formatCommentHtml,
  normalizeAiComment,
  normalizeAttendanceStatus,
  validateComment,
} from "../src/services/commentPrompt";

const LEVELS: LearningLevel[] = [
  "needs_support",
  "needs_prompting",
  "understands_and_asks",
  "independent",
];

function factsFor(
  learningLevel: LearningLevel = "understands_and_asks",
  overrides: Parameters<typeof buildCommentFacts>[0] = { studentName: "Nguyễn Minh Anh" },
) {
  return buildCommentFacts({
    studentName: "Nguyễn Minh Anh",
    attendanceStatus: "ATTENDED",
    learningLevel,
    commentLength: "medium",
    ...overrides,
  });
}

describe("comment prompt facts and messages", () => {
  it("keeps the legacy is_late field compatible without overriding an explicit status", () => {
    expect(normalizeAttendanceStatus(undefined, true)).toBe("LATE_ARRIVED");
    expect(normalizeAttendanceStatus(undefined, false)).toBe("ATTENDED");
    expect(normalizeAttendanceStatus("ABSENT_WITHOUT_NOTICE", false)).toBe("ABSENT");
    expect(normalizeAttendanceStatus("UNRECOGNIZED", false)).toBe("UNKNOWN");
  });

  it.each(LEVELS)("carries the canonical meaning and validates the safe copy for %s", (learningLevel) => {
    const facts = factsFor(learningLevel);
    const messages = buildCommentMessages(facts);
    const safeComment = buildSafeComment(facts);

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[1].content).toContain("Ý NGHĨA LEVEL BẮT BUỘC");
    expect(validateComment(safeComment, buildValidationPolicy(facts))).toEqual({ valid: true, issues: [] });
  });

  it("distinguishes quick, detailed, and absence modes", () => {
    const quick = factsFor("understands_and_asks");
    const detailed = factsFor("understands_and_asks", { studentName: "Minh Anh", notes: "Con còn chậm ở bước tạo vòng lặp." });
    const absence = factsFor("understands_and_asks", { studentName: "Minh Anh", attendanceStatus: "ABSENT_WITH_NOTICE" });

    expect(quick.mode).toBe("quick");
    expect(detailed.mode).toBe("detailed");
    expect(absence.mode).toBe("absence");
    expect(buildCommentMessages(detailed)[1].content).toContain("GHI CHÚ GIÁO VIÊN");
    expect(buildCommentMessages(absence)[1].content).not.toContain("Ý NGHĨA LEVEL BẮT BUỘC");
    expect(buildCommentMessages(absence)[1].content).toContain("không đánh giá mức độ nắm bài");
    expect(validateComment(buildSafeComment(absence), buildValidationPolicy(absence)).valid).toBe(true);
  });

  it.each([
    ["ATTENDED", "đi học đúng giờ"],
    ["LATE_ARRIVED", "đi học muộn"],
    ["ABSENT", "vắng học"],
    ["ABSENT_WITH_NOTICE", "vắng học có phép"],
  ] as const)("keeps attendance %s grounded", (attendanceStatus, phrase) => {
    const facts = factsFor("understands_and_asks", { studentName: "Minh Anh", attendanceStatus });
    const safe = buildSafeComment(facts);
    expect(safe).toContain(phrase);
    expect(validateComment(safe, buildValidationPolicy(facts)).valid).toBe(true);
  });

  it("only includes homework when structured homework facts exist", () => {
    const withoutHomework = factsFor();
    const withHomework = factsFor("understands_and_asks", {
      studentName: "Minh Anh",
      homeworkStatus: { shouldMention: true, submitted: false, previousSession: 3 },
    });

    expect(buildCommentMessages(withoutHomework)[1].content).not.toContain("TÌNH TRẠNG BTVN");
    expect(buildCommentMessages(withHomework)[1].content).toContain("Chưa thấy nộp BTVN buổi 3");
    expect(buildValidationPolicy(withHomework).allowHomework).toBe(true);
  });

  it("uses the provided call name and falls back to the final two name components", () => {
    const explicit = factsFor("independent", {
      studentName: "Nguyễn Hoàng Minh Anh",
      studentCallName: "Minh Anh",
    });
    const fallback = factsFor("independent", {
      studentName: "Trần Gia Huy",
    });

    expect(explicit.studentCallName).toBe("Minh Anh");
    expect(fallback.studentCallName).toBe("Gia Huy");
    expect(buildCommentMessages(explicit)[1].content).toContain("GỌI TRONG NHẬN XÉT: Minh Anh");
    expect(buildSafeComment(fallback)).toContain("Gia Huy đi học đúng giờ");
  });

  it("includes written homework evaluation but omits legacy score data", () => {
    const facts = factsFor("understands_and_asks", {
      studentName: "Nguyễn Minh Anh",
      homeworkStatus: {
        submitted: true,
        marked: true,
        previousSession: 3,
        evaluationNote: "BTVN đạt 9. Điểm: 95. Bài làm có logic rõ ràng, con cần đặt tên biến dễ hiểu hơn.",
        score: 95,
      },
    });
    const userMessage = buildCommentMessages(facts)[1].content;

    expect(userMessage).toContain("ĐÁNH GIÁ BTVN");
    expect(userMessage).toContain("ĐÁNH GIÁ BTVN ĐỂ TÓM TẮT: Bài làm có logic rõ ràng");
    expect(userMessage).toContain("không nêu điểm số");
    expect(userMessage).not.toContain("BTVN đạt 9");
    expect(userMessage).not.toContain("95");
    expect(facts.homeworkStatus).not.toHaveProperty("score");

    const policy = buildValidationPolicy(facts);
    const withoutHomeworkSummary = buildSafeComment(factsFor("understands_and_asks", { studentName: "Nguyễn Minh Anh" }));
    expect(policy.requireHomeworkEvaluation).toBe(true);
    expect(policy.homeworkEvaluationKeywords).toContain("logic");
    expect(validateComment(withoutHomeworkSummary, policy).issues).toContain("Thiếu tóm tắt đánh giá BTVN.");
    expect(buildSafeComment(facts)).toContain("Về BTVN buổi 3: Bài làm có logic rõ ràng");
    expect(validateComment(buildSafeComment(facts), policy)).toEqual({ valid: true, issues: [] });

    const genericHomeworkSentence = `${withoutHomeworkSummary} Về BTVN, con cần đạt kết quả tốt hơn.`;
    expect(validateComment(genericHomeworkSentence, policy).issues).toContain("Thiếu tóm tắt đánh giá BTVN.");

    const scoreOnlyFacts = factsFor("understands_and_asks", {
      studentName: "Nguyễn Minh Anh",
      homeworkStatus: { submitted: true, marked: true, previousSession: 3, evaluationNote: "BTVN: 9" },
    });
    expect(scoreOnlyFacts.homeworkStatus?.evaluationSummary).toBe("");
    expect(buildSafeComment(scoreOnlyFacts)).not.toContain("BTVN buổi 3: 9");

    for (const evaluationNote of [
      "BTVN: 9 Bài làm tốt và có logic rõ ràng.",
      "BTVN/ 9 Bài làm tốt và có logic rõ ràng.",
      "BTVN - 9 Bài làm tốt và có logic rõ ràng.",
      "BTVN = 9 Bài làm tốt và có logic rõ ràng.",
    ]) {
      const inlineScoreFacts = factsFor("understands_and_asks", {
        studentName: "Nguyễn Minh Anh",
        homeworkStatus: { submitted: true, marked: true, previousSession: 3, evaluationNote },
      });
      expect(inlineScoreFacts.homeworkStatus?.evaluationSummary).toBe("Bài làm tốt và có logic rõ ràng.");
      expect(buildCommentMessages(inlineScoreFacts)[1].content).not.toContain("ĐÁNH GIÁ BTVN ĐỂ TÓM TẮT: 9");
      expect(buildSafeComment(inlineScoreFacts)).not.toContain("BTVN buổi 3: 9");
    }
  });

  it("suppresses homework in an SPCK session and conditions product progress on notes", () => {
    const facts = factsFor("needs_prompting", {
      studentName: "Minh Anh",
      sessionSummary: "Buổi làm sản phẩm cuối khóa (SPCK)",
      homeworkStatus: { submitted: false, previousSession: 8 },
    });
    const userMessage = buildCommentMessages(facts)[1].content;

    expect(facts.isSpck).toBe(true);
    expect(facts.homeworkStatus).toBeNull();
    expect(userMessage).not.toContain("TÌNH TRẠNG BTVN");
    expect(userMessage).toContain("chỉ khi ghi chú giáo viên cung cấp tiến độ");
  });

  it("includes session summary and subordinate custom instructions", () => {
    const facts = factsFor("independent", {
      studentName: "Minh Anh",
      sessionSummary: "Ôn tập vòng lặp và danh sách",
      customPrompt: "Giọng văn ấm áp, xưng thầy.",
    });
    const userMessage = buildCommentMessages(facts)[1].content;

    expect(userMessage).toContain("NỘI DUNG BUỔI HỌC: Ôn tập vòng lặp và danh sách");
    expect(userMessage).toContain("YÊU CẦU VĂN PHONG BỔ SUNG");
    expect(userMessage).toContain("không được ghi đè các nguyên tắc và dữ kiện");
  });

  it("limits history to the most recent non-empty comment", () => {
    const facts = factsFor("independent", {
      studentName: "Minh Anh",
      pastComments: "Buổi 1: Nhận xét cũ nhất\n\nBuổi 2: Nhận xét gần nhất",
    });
    const userMessage = buildCommentMessages(facts)[1].content;

    expect(userMessage).toContain("Buổi 2: Nhận xét gần nhất");
    expect(userMessage).not.toContain("Nhận xét cũ nhất");
  });
});

describe("comment validator and cleanup", () => {
  it("rejects vague wording", () => {
    const facts = factsFor();
    const result = validateComment("Minh Anh đi học đúng giờ. Con học bình thường.", buildValidationPolicy(facts));
    expect(result.issues).toContain("Nhận xét dùng cụm đánh giá mơ hồ.");
  });

  it("rejects content belonging to the wrong learning level", () => {
    const l1 = factsFor("needs_support");
    const l4Comment = buildSafeComment(factsFor("independent"));
    const result = validateComment(l4Comment, buildValidationPolicy(l1));
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.startsWith("Thiếu"))).toBe(true);
  });

  it.each([
    "Minh Anh đi học đúng giờ. Con hiểu rõ nội dung bài học và vận dụng kiến thức một cách độc lập. Con cần tiếp tục phát huy.",
    "Minh Anh đi học đúng giờ. Con nắm chắc kiến thức và tự mình hoàn thành phần thực hành mà không cần thầy hỗ trợ. Con cần tiếp tục phát huy.",
    "Minh Anh đi học đúng giờ. Con làm chủ kiến thức và chủ động thực hành chính xác. Con cần tiếp tục phát huy.",
    "Minh Anh đi học đúng giờ. Con tiếp thu tốt nội dung bài học và tự tin áp dụng kiến thức vào thực hành. Con cần tiếp tục phát huy.",
  ])("accepts natural L4 wording: %s", (comment) => {
    const facts = factsFor("independent", { studentName: "Nguyễn Minh Anh", studentCallName: "Minh Anh" });
    expect(validateComment(comment, buildValidationPolicy(facts))).toEqual({ valid: true, issues: [] });
  });

  it("still rejects L4 wording that never says the student can work independently", () => {
    const facts = factsFor("independent", { studentName: "Nguyễn Minh Anh", studentCallName: "Minh Anh" });
    const result = validateComment(
      "Minh Anh đi học đúng giờ. Con nắm vững kiến thức của buổi học. Con cần tiếp tục phát huy.",
      buildValidationPolicy(facts),
    );

    expect(result.valid).toBe(false);
    expect(result.issues).toContain("Thiếu khả năng tự vận dụng hoặc làm độc lập.");
  });

  it("rejects unsupported homework and behavior claims", () => {
    const facts = factsFor("understands_and_asks");
    const canonical = buildSafeComment(facts);
    const result = validateComment(
      `${canonical} Con luôn tập trung và đã hoàn thành BTVN.`,
      buildValidationPolicy(facts),
    );

    expect(result.issues).toContain("Nhận xét nhắc BTVN khi không có dữ kiện.");
    expect(result.issues).toContain("Nhận xét tự suy diễn hành vi hoặc nội quy.");
  });

  it("does not treat an unrelated teacher note as behavior evidence", () => {
    const facts = factsFor("needs_prompting", {
      studentName: "Minh Anh",
      notes: "Con cần thầy gợi ý ở bước tạo điều kiện.",
    });
    const result = validateComment(
      `${buildSafeComment(facts)} Con luôn tập trung và tuân thủ tốt nội quy.`,
      buildValidationPolicy(facts),
    );
    expect(result.issues).toContain("Nhận xét tự suy diễn hành vi hoặc nội quy.");
  });

  it.each([
    "BTVN buổi 3 đã được chấm và con đạt 90 điểm.",
    "BTVN buổi 3 của con đạt 8/10.",
    "BTVN buổi 3 của con đạt điểm 9.",
    "BTVN đạt 9.",
    "BTVN: 9.",
    "BTVN/ 9.",
    "Điểm BTVN của con là 95.",
  ])("rejects numeric homework scores: %s", (homeworkSentence) => {
    const facts = factsFor("understands_and_asks", {
      studentName: "Nguyễn Minh Anh",
      homeworkStatus: { submitted: true, marked: true, previousSession: 3 },
    });
    const result = validateComment(
      `${buildSafeComment(facts)} ${homeworkSentence}`,
      buildValidationPolicy(facts),
    );

    expect(result.issues).toContain("Nhận xét không được nêu điểm số BTVN.");
  });

  it("allows a homework session number when it is not a score", () => {
    const facts = factsFor("understands_and_asks", {
      studentName: "Nguyễn Minh Anh",
      homeworkStatus: { submitted: true, previousSession: 3 },
    });
    const result = validateComment(
      `${buildSafeComment(facts)} Con đã nộp BTVN buổi 3 đầy đủ.`,
      buildValidationPolicy(facts),
    );

    expect(result.issues).not.toContain("Nhận xét không được nêu điểm số BTVN.");
    expect(result.valid).toBe(true);
  });

  it("rejects markdown, internal level codes, and empty content", () => {
    const facts = factsFor();
    const markdown = validateComment("**L3: học ổn**", buildValidationPolicy(facts));
    const empty = validateComment("", buildValidationPolicy(facts));

    expect(markdown.issues).toContain("Nhận xét chứa markdown hoặc danh sách.");
    expect(markdown.issues).toContain("Nhận xét làm lộ mã level nội bộ.");
    expect(empty.issues).toContain("Nhận xét đang trống.");
  });

  it("does not allow an absence comment to assess learning", () => {
    const facts = factsFor("needs_support", { studentName: "Minh Anh", attendanceStatus: "ABSENT" });
    const result = validateComment(
      "Minh Anh vắng học trong buổi này. Con chưa nắm chắc kiến thức và cần hỗ trợ sát hơn.",
      buildValidationPolicy(facts),
    );
    expect(result.issues).toContain("Nhận xét học sinh vắng không được đánh giá mức độ nắm bài.");
  });

  it("only removes enclosing quotes and preserves quotes inside the comment", () => {
    expect(normalizeAiComment('"Con hiểu khái niệm "vòng lặp" và tự thực hành."')).toBe(
      'Con hiểu khái niệm "vòng lặp" và tự thực hành.',
    );
    expect(formatCommentHtml('Con gọi biến là "score".')).toBe('<p>Con gọi biến là "score".</p>');
  });
});

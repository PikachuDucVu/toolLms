import type {
  ClassDetail,
  DemoFallbackKind,
  DemoQuestionDefinition,
  DemoResolvedSchema,
  DemoSubmitRequest,
  Slot,
  StudentAttendance,
} from "@tool-lms/contracts";
import type { Env, SessionRecord } from "../types";
import { appendCommentLog } from "./commentService";
import {
  CommentContextInvalidError,
  loadRegularSlotContext,
  updateSlotComment,
} from "./commentSubmissionService";
import type { LmsClient } from "./lmsClient";

export type RandomSource = () => number;

type RateArea = {
  grade: number;
  content: string;
  commentAreaId: string;
  courseProcessFinalEvaluationTitle: string;
  courseProcessFinalEvaluationId: string | null;
  demoQuestions: never[];
  type: "RATE";
};

interface FallbackSchema {
  kind: DemoFallbackKind;
  label: string;
  commentAreaId: string;
  courseProcessDemoId: string;
  demoGrade?: number;
  questions: DemoQuestionDefinition[];
}

const DEMO_FALLBACKS: Record<DemoFallbackKind, FallbackSchema> = {
  HACKATHON: {
    kind: "HACKATHON", label: "Điểm bài Hackathon", commentAreaId: "66c44cf76ae1a9fab631679d", courseProcessDemoId: "66c86cff6ae1a9fab639aa24", demoGrade: 0,
    questions: [{ id: "66c44cf76ae1a9fab631679c", title: "Điểm Hackathon", maxScore: 5 }],
  },
  GA: {
    kind: "GA", label: "Demo2024 | GA", commentAreaId: "67074e6255bde440385042df", courseProcessDemoId: "68f0bcff22849dccaa447c33",
    questions: [
      { id: "67074e6255bde440385042da", title: " Tư duy máy tính, tư duy thuật toán", maxScore: 2 },
      { id: "67074e6255bde440385042db", title: "Tư duy sáng tạo", maxScore: 1 },
      { id: "67074e6255bde440385042dc", title: "Kỹ năng giao tiếp, hợp tác", maxScore: 0.5 },
      { id: "67074e6255bde440385042dd", title: " Giải quyết vấn đề", maxScore: 0.5 },
      { id: "67074e6255bde440385042de", title: "Kỹ năng sử dụng máy tính", maxScore: 1 },
    ],
  },
  GB: {
    kind: "GB", label: "Demo2024 | GB", commentAreaId: "66c80bf66ae1a9fab6386af3", courseProcessDemoId: "66c815666ae1a9fab6388763",
    questions: [
      { id: "66c80bf66ae1a9fab6386aee", title: "Tư duy máy tính, tư duy thuật toán", maxScore: 2 },
      { id: "66c80bf66ae1a9fab6386aef", title: "Tư duy sáng tạo", maxScore: 1 },
      { id: "66c80bf66ae1a9fab6386af0", title: "Kỹ năng giao tiếp, hợp tác", maxScore: 0.5 },
      { id: "66c80bf66ae1a9fab6386af1", title: "Giải quyết vấn đề", maxScore: 0.5 },
      { id: "66c80bf66ae1a9fab6386af2", title: "Kỹ năng sử dụng máy tính", maxScore: 1 },
    ],
  },
};

const FINAL_RATE_AREAS = [
  { grade: 5, content: "- Học viên chủ động liên hệ giáo viên tìm thêm nguồn/ sách để ôn tập và học kiến thức mới tại nhà ngoài những tài liệu đã được cung cấp mà không cần yêu cầu từ giáo viên", commentAreaId: "665e7d33181e0e47f6c63768", type: "RATE", courseProcessFinalEvaluationId: "67075d4b55bde440385073af", courseProcessFinalEvaluationTitle: "KIẾN THỨC" },
  { grade: 5, content: "- Ngoài việc nắm vững các kiến thức được giảng dạy, học viên còn có sự chủ động, đặt câu hỏi mở rộng trực tiếp tại lớp từ những kiến thức vừa được cung cấp", commentAreaId: "668d69d8e71f90e7630ce16c", type: "RATE", courseProcessFinalEvaluationId: "67075d4b55bde440385073af", courseProcessFinalEvaluationTitle: "KIẾN THỨC" },
  { grade: 5, content: "- Học viên trình bày ý kiến rõ ràng, chủ động hỏi khi gặp vấn đề, thuyết trình trước lớp mạch lạc, rõ ràng\n- Học viên nhìn nhận được những ưu - nhược điểm của bản thân sau khi nhận đánh giá từ giáo viên, bạn bè", commentAreaId: "668e2e7de71f90e7630d4316", type: "RATE", courseProcessFinalEvaluationId: "67075d4b55bde440385073b0", courseProcessFinalEvaluationTitle: "KỸ NĂNG" },
  { grade: 5, content: "- Học viên phản biện và phân tích các giải pháp một cách sâu rộng, biết thử đi thử lại nhiều lần đến khi ra kết quả từ đó Học viên có thể tổng quát cho nhiều vấn đề tương tự sau này\n- Học viên đưa sản phẩm cá nhân go live và có tiếp nhận người dùng thật", commentAreaId: "668e0f48e71f90e7630d2db6", type: "RATE", courseProcessFinalEvaluationId: "67075d4b55bde440385073b0", courseProcessFinalEvaluationTitle: "KỸ NĂNG" },
  { grade: 5, content: "- Tốc độ sử dụng chuột/bàn phím rất thành thạo, có thể sử dụng gõ phím bằng 2 tay không cần nhìn phím.\n- Học viên tận dụng tối ưu các phần mềm máy tính, sử dụng các công cụ hỗ trợ xây dựng sơ đồ tư duy, công cụ quản lý tiến độ dự án, công cụ xây dựng sơ đồ thuật toán", commentAreaId: "668e2ce1e71f90e7630d406f", type: "RATE", courseProcessFinalEvaluationId: "67075d4b55bde440385073b0", courseProcessFinalEvaluationTitle: "KỸ NĂNG" },
  { grade: 5, content: "- Học viên chủ động trong việc phát hiện ra những ý tưởng sáng tạo cho các tính năng của sản phẩm dựa trên những kiến thức vừa được học và đặt câu hỏi với Giáo viên.\n- Học viên tự mình thiết kế trò chơi, câu chuyện hoặc dự án hoàn toàn mới, có khả năng thu hút sự chú ý và hứng thú của người khác, hoặc tạo ra một trào lưu trong cộng đồng", commentAreaId: "668d6a69e71f90e7630ce198", type: "RATE", courseProcessFinalEvaluationId: "67075d4b55bde440385073b0", courseProcessFinalEvaluationTitle: "KỸ NĂNG" },
  { grade: 5, content: "- Học viên thành thạo trong việc sử dụng ngôn ngữ lập trình\n- Học viên có thể tự xây dựng mô hình/sơ đồ tư duy tuần tự các bước lập trình cho dự án cá nhân của mình mà không cần sự hỗ trợ từ Giáo viên", commentAreaId: "668d6a25e71f90e7630ce187", type: "RATE", courseProcessFinalEvaluationId: "67075d4b55bde440385073b0", courseProcessFinalEvaluationTitle: "KỸ NĂNG" },
  { grade: 5, content: "- Học viên tập trung lắng nghe bài giảng, tự giác học tập, mentor hầu như không phải nhắc nhở con, hiệu quả buổi học cao\n- Học viên tuân thủ tuyệt đối các quy tắc trong lớp học, luôn có mặt đúng giờ, lễ phép khi giao tiếp với giáo viên", commentAreaId: "668e2eaee71f90e7630d434f", type: "RATE", courseProcessFinalEvaluationId: "67075d4b55bde440385073b1", courseProcessFinalEvaluationTitle: "THÁI ĐỘ" },
  { grade: 5, content: "- Học viên chủ động tìm kiếm thêm các bài tập, dự án để luyện tập và đặt các câu hỏi luyện tập với giáo viên", commentAreaId: "668e2f5be71f90e7630d44c1", type: "RATE", courseProcessFinalEvaluationId: "67075d4b55bde440385073b1", courseProcessFinalEvaluationTitle: "THÁI ĐỘ" },
] as const;

const FINAL_RATE_AREA_ORDER: string[] = FINAL_RATE_AREAS.map((area) => area.commentAreaId);
const FINAL_RATE_TITLE_ORDER = ["KIẾN THỨC", "KỸ NĂNG", "THÁI ĐỘ"];
const FINAL_RATE_CONTENT_BY_AREA_ID = new Map<string, string>(FINAL_RATE_AREAS.map((area) => [area.commentAreaId, area.content]));

export function resolveDemoFallback(classDetail: ClassDetail): FallbackSchema {
  const haystack = [classDetail.course?.shortName, classDetail.course?.name, classDetail.name].filter(Boolean).join(" ").toUpperCase();
  if (haystack.includes("C4K-GA") || /(^|[^A-Z])GA([^A-Z]|$)/.test(haystack)) return DEMO_FALLBACKS.GA;
  if (haystack.includes("C4K-GB") || /(^|[^A-Z])GB([^A-Z]|$)/.test(haystack)) return DEMO_FALLBACKS.GB;
  if (/(^|[^A-Z])PT[ABI]([^A-Z]|$)/.test(haystack) || haystack.includes("HACKATHON")) return DEMO_FALLBACKS.HACKATHON;
  return DEMO_FALLBACKS.HACKATHON;
}

function resolveDemoInternal(classDetail: ClassDetail) {
  const fallback = resolveDemoFallback(classDetail);
  const demoScore = classDetail.courseProcess?.finalSession?.demoScore || null;
  const areas = demoScore?.commentAreas || [];
  const area = areas.find((item) => item.demo.length > 0) || areas[0] || null;
  const dynamicQuestions = (area?.demo || []).filter((item) => item.id && item.maxScore > 0).map((item) => ({ ...item }));
  const questions = dynamicQuestions.length ? dynamicQuestions : fallback.questions;
  const maxScore = Math.round(questions.reduce((sum, item) => sum + item.maxScore, 0) * 100) / 100;
  const schema: DemoResolvedSchema = {
    source: dynamicQuestions.length ? "dynamic" : "fallback",
    fallbackKind: dynamicQuestions.length ? null : fallback.kind,
    label: area?.name || fallback.label,
    questions,
    maxScore,
  };
  const hasHackathon = schema.label.toUpperCase().includes("HACKATHON") || questions.some((item) => item.title.toUpperCase().includes("HACKATHON"));
  return {
    schema,
    commentAreaId: area?.id || fallback.commentAreaId,
    courseProcessDemoId: demoScore?.id || fallback.courseProcessDemoId,
    demoGrade: hasHackathon ? 0 : (fallback.demoGrade ?? null),
  };
}

export function resolveDemoSchema(classDetail: ClassDetail): DemoResolvedSchema {
  return resolveDemoInternal(classDetail).schema;
}

export function randomScoreAtLeast75(maxScore: number, rng: RandomSource = Math.random, step = 0.25): number {
  const minScore = Math.ceil(maxScore * 0.75 / step) * step;
  const steps = Math.round((maxScore - minScore) / step) + 1;
  return Math.round((minScore + Math.floor(rng() * steps) * step) * 100) / 100;
}

export function randomScoreInRange(maxScore: number, minPercent: number, maxPercent: number, rng: RandomSource = Math.random, step = 0.25): number {
  const lo = Math.max(0, Math.min(100, minPercent));
  const hi = Math.max(lo, Math.min(100, maxPercent));
  const minScore = Math.ceil((maxScore * lo / 100) / step) * step;
  const maxAllowed = Math.floor((maxScore * hi / 100) / step) * step;
  if (maxAllowed < minScore) return Math.min(maxScore, Math.round(minScore * 100) / 100);
  const steps = Math.round((maxAllowed - minScore) / step) + 1;
  return Math.round((minScore + Math.floor(rng() * steps) * step) * 100) / 100;
}

export function randomScoreOnScale(questionMax: number, schemaMax: number, minScore: number, maxScore: number, rng: RandomSource = Math.random, step = 0.25): number {
  const scale = schemaMax > 0 ? questionMax / schemaMax : 1;
  const lo = Math.max(0, Math.min(questionMax, Math.ceil((minScore * scale) / step) * step));
  const hi = Math.max(lo, Math.min(questionMax, Math.floor((maxScore * scale) / step) * step));
  const steps = Math.round((hi - lo) / step) + 1;
  return Math.round((lo + Math.floor(rng() * steps) * step) * 100) / 100;
}

export function randomScoreAbove75(maxScore: number, rng: RandomSource = Math.random, step = 0.25): number {
  const minScore = Math.ceil(maxScore * 0.75 / step) * step;
  const possible: number[] = [];
  for (let score = Math.min(minScore + step, maxScore); score <= maxScore + 0.001; score += step) {
    possible.push(Math.round(score * 100) / 100);
  }
  if (!possible.length) possible.push(maxScore);
  return possible[Math.floor(rng() * possible.length)];
}

export function buildDemoRandomPreview(
  classDetail: ClassDetail,
  rng: RandomSource = Math.random,
  range?: { minScore?: number; maxScore?: number; minPercent?: number; maxPercent?: number },
) {
  const schema = resolveDemoSchema(classDetail);
  const hasScoreRange = range?.minScore !== undefined || range?.maxScore !== undefined;
  const minScore = range?.minScore ?? (range?.minPercent !== undefined ? schema.maxScore * range.minPercent / 100 : 3.75);
  const maxScore = range?.maxScore ?? (range?.maxPercent !== undefined ? schema.maxScore * range.maxPercent / 100 : schema.maxScore);
  const questions = schema.questions.map((question) => ({
    ...question,
    score: hasScoreRange || range?.minPercent === undefined
      ? randomScoreOnScale(question.maxScore, schema.maxScore, minScore, maxScore, rng)
      : randomScoreInRange(question.maxScore, range?.minPercent ?? 75, range?.maxPercent ?? 100, rng),
  }));
  return {
    schema,
    questions,
    demoScore: Math.round(questions.reduce((sum, question) => sum + question.score, 0) * 100) / 100,
  };
}

export function demoRank(score: number): "A" | "B" | "C" | "D" {
  return score >= 4.5 ? "A" : score >= 4 ? "B" : score >= 2.5 ? "C" : "D";
}

export function abilityScore(rateAreas: Array<{ grade: number }>): number {
  if (!rateAreas.length) return 0;
  return Math.round((rateAreas.reduce((sum, area) => sum + (Number(area.grade) || 0), 0) / rateAreas.length) * 100) / 100;
}

export function finalDemoScore(demoScore: number, rateAreas: Array<{ grade: number }>): number {
  if (!rateAreas.length) return Math.round(demoScore * 10) / 10;
  return Math.round((demoScore * 0.6 + abilityScore(rateAreas) * 0.4) * 10) / 10;
}

function getRateSample(rates: Array<{ value: string | number | null; commentSamples: string[] }>): string {
  const best = rates.find((rate) => Number(rate.value) === 5) || rates.at(-1);
  return best?.commentSamples[0] || "";
}

export function buildFinalRateAreas(classDetail: ClassDetail): RateArea[] {
  const dynamic: Array<RateArea & { order: number }> = [];
  let order = 0;
  for (const evaluation of classDetail.courseProcess?.finalSession?.finalEvaluations || []) {
    for (const area of evaluation.commentAreas) {
      if (!area.id || (area.type && area.type !== "RATE")) continue;
      const content = FINAL_RATE_CONTENT_BY_AREA_ID.get(area.id) || getRateSample(area.rates);
      if (!content) continue;
      dynamic.push({ grade: 5, content, commentAreaId: area.id, courseProcessFinalEvaluationTitle: evaluation.title || "", courseProcessFinalEvaluationId: evaluation.id || null, demoQuestions: [], type: "RATE", order: order++ });
    }
  }
  const source = dynamic.length ? dynamic : FINAL_RATE_AREAS.map((area, index) => ({ ...area, demoQuestions: [] as never[], type: "RATE" as const, order: index }));
  return source.sort((a, b) => {
    const ai = FINAL_RATE_AREA_ORDER.indexOf(a.commentAreaId);
    const bi = FINAL_RATE_AREA_ORDER.indexOf(b.commentAreaId);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    return a.order - b.order;
  }).map(({ order: _order, ...area }) => area);
}

function escapeHtml(value: unknown): string {
  if (!value) return "";
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatScore(value: number): string { return String(Math.round(value * 100) / 100); }
function normalizeRateLine(line: string): string { return String(line || "").replace(/^\s*-\s*/, "").trim(); }

export function buildFinalEvaluationHtml(rateAreas: RateArea[]): string {
  if (!rateAreas.length) return "";
  const groups: Array<{ title: string; areas: RateArea[] }> = [];
  for (const area of rateAreas) {
    const title = area.courseProcessFinalEvaluationTitle || "ĐÁNH GIÁ";
    let group = groups.find((item) => item.title === title);
    if (!group) { group = { title, areas: [] }; groups.push(group); }
    group.areas.push(area);
  }
  groups.sort((a, b) => {
    const ai = FINAL_RATE_TITLE_ORDER.indexOf(a.title);
    const bi = FINAL_RATE_TITLE_ORDER.indexOf(b.title);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    return 0;
  });
  const sections = groups.map((group) => {
    const blocks = group.areas.map((area) => {
      const items = area.content.split(/\n+/).map(normalizeRateLine).filter(Boolean).map((line) => `<li data-list='bullet' class='ql-indent-2'><span class='ql-ui'></span>${escapeHtml(line)}</li>`).join("");
      return `<ul><span style="color:rgb(0, 0, 0)">${items}</span></ul>`;
    }).join("");
    return `<li data-list="bullet" style="list-style-type:circle"><span class="ql-ui"></span><strong style="color:rgb(226, 80, 65)">​</strong><strong style="color:rgb(0, 0, 0)">${escapeHtml(group.title)}: </strong>${blocks}</li>`;
  }).join("");
  return `<p><strong style="color:rgb(0, 0, 0)">​Điểm năng lực: </strong><strong style="color:rgb(226, 80, 65)">${formatScore(abilityScore(rateAreas))} điểm</strong></p><ul>${sections}</ul>`;
}

export function buildFinalDemoPayload(input: {
  classDetail: ClassDetail;
  slot: Slot;
  attendance: StudentAttendance;
  classSiteId: string;
  courseProcessId: string;
  sessionNumber: number;
  request: DemoSubmitRequest;
}, rng: RandomSource = Math.random) {
  const resolved = resolveDemoInternal(input.classDetail);
  const customScores = input.request.customScores;
  const demoQuestions = resolved.schema.questions.map((question, index) => {
    const custom = customScores && index < customScores.length ? customScores[index] : undefined;
    if (custom && custom.questionId !== question.id) throw new CommentContextInvalidError("Tiêu chí Demo không khớp dữ liệu lớp học.");
    let score = custom ? Math.max(0, Math.min(custom.score, question.maxScore)) : randomScoreAbove75(question.maxScore, rng);
    score = Math.round(score * 100) / 100;
    return { courseProcessDemoDetailId: question.id, score, title: question.title, result: false, maxScore: question.maxScore };
  });
  if (customScores && customScores.length > resolved.schema.questions.length) throw new CommentContextInvalidError("Số tiêu chí Demo không khớp dữ liệu lớp học.");
  const totalDemoScore = Math.round(demoQuestions.reduce((sum, item) => sum + item.score, 0) * 100) / 100;
  const items = demoQuestions.map((item) => `<li>${escapeHtml(item.title)}: ${formatScore(item.score)} điểm</li>`).join("");
  const demoContent = `<div>
                <p>
                  <strong>${escapeHtml(resolved.schema.label)}:</strong>
                  <strong style='color: rgb(226, 80, 65)'> ${formatScore(totalDemoScore)} điểm</strong>
                </p>
                <ul>
                  ${items}
                </ul>
            </div>`;
  const rateAreas = input.request.autoRate ? buildFinalRateAreas(input.classDetail) : [];
  const demoArea = {
    ...(resolved.demoGrade !== null ? { grade: resolved.demoGrade } : {}),
    demoQuestions,
    content: demoContent,
    commentAreaId: resolved.commentAreaId,
    type: "DEMO",
    courseProcessDemoId: resolved.courseProcessDemoId,
  };
  const totalScore = finalDemoScore(totalDemoScore, rateAreas);
  const fullContent = `<div style="list-style-type:circle"><p><strong style="color:rgb(0, 0, 0)">Điểm Demo</strong><span style="color:rgb(0, 0, 0)">: </span><strong style="color:rgb(226, 80, 65)">${formatScore(totalDemoScore)} điểm</strong></p><ul><li data-list="bullet"><span class="ql-ui"></span><span style="color:rgb(0, 0, 0)">${demoContent}</span></li></ul>${buildFinalEvaluationHtml(rateAreas)}</div>`;
  return {
    payload: {
      slotId: input.slot.id, classSiteId: input.classSiteId, sessionNumber: input.sessionNumber,
      classId: input.classDetail.id, courseProcessId: input.courseProcessId,
      slotType: "Final", totalScore, rank: demoRank(totalScore),
      ...(input.request.summary === undefined ? {} : { summary: `<p>${input.request.summary}</p>` }),
      studentComment: { studentAttendanceId: input.attendance.id, studentId: input.attendance.studentId, content: fullContent, byAreas: [...rateAreas, demoArea] },
    },
    schema: resolved.schema,
    questions: demoQuestions.map((item) => ({ id: item.courseProcessDemoDetailId, title: item.title, maxScore: item.maxScore, score: item.score })),
    totalDemoScore,
    abilityScore: abilityScore(rateAreas),
    totalScore,
    rank: demoRank(totalScore),
  };
}

export async function submitDemo(
  env: Env,
  client: Pick<LmsClient, "callApi">,
  session: SessionRecord,
  slotId: string,
  request: DemoSubmitRequest,
  rng: RandomSource = Math.random,
) {
  const loaded = await loadRegularSlotContext(client, session, { classId: request.classId, slotId, studentId: request.studentId, attendanceId: request.attendanceId });
  if (loaded.context.sessionNumber !== 14) throw new CommentContextInvalidError("Buổi học này không phải buổi Demo cuối khóa.");
  const built = buildFinalDemoPayload({ ...loaded.context, attendance: loaded.context.attendance!, request }, rng);
  const updatedSession = await updateSlotComment(client, loaded.session, built.payload);
  let logged = true;
  try {
    await appendCommentLog(env, { class_id: loaded.context.classDetail.id, class_name: loaded.context.classDetail.name, session_number: loaded.context.sessionNumber, student_id: loaded.context.attendance!.studentId, student_name: loaded.context.attendance!.displayName, comment: "", slot_type: "Final", scores: { total: built.totalDemoScore }, success: true });
  } catch { logged = false; }
  return { session: updatedSession, context: loaded.context, built, logged };
}

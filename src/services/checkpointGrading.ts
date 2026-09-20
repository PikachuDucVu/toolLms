import type {
  CheckpointEssayGradeItem,
  CheckpointExamKey,
  CheckpointGradeResult,
  CheckpointMcGradeItem,
  CheckpointMcKeyItem,
} from "@tool-lms/contracts";

const SCRATCH_EXTENSIONS = new Set([".sb3", ".sb2", ".sprite3"]);

export function roundCheckpointScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(5, Math.max(0, Math.round(value * 2) / 2));
}

export function theoryScoreFromMc(correct: number, total: number): number | null {
  if (total <= 0) return null;
  return roundCheckpointScore((Math.max(0, correct) / total) * 5);
}

export function normalizeMcChoice(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isScratchFileName(fileName: string): boolean {
  const lower = fileName.trim().toLowerCase();
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return false;
  return SCRATCH_EXTENSIONS.has(lower.slice(dot));
}

export function gradeMcAnswers(
  answers: Record<string, string>,
  keyItems: CheckpointMcKeyItem[],
  questionCount: number,
): { total: number; correct: number; items: CheckpointMcGradeItem[] } {
  const total = Math.max(0, questionCount);
  const byNumber = new Map<number, CheckpointMcKeyItem>();
  for (const item of keyItems) byNumber.set(item.number, item);

  const items: CheckpointMcGradeItem[] = [];
  let correct = 0;
  for (let number = 1; number <= total; number += 1) {
    const key = byNumber.get(number);
    const studentAnswer = answers[String(number)] || "";
    const correctAnswer = key?.correct || "";
    const isCorrect = Boolean(
      correctAnswer
      && studentAnswer
      && normalizeMcChoice(studentAnswer) === normalizeMcChoice(correctAnswer),
    );
    if (isCorrect) correct += 1;
    items.push({
      number,
      studentAnswer: String(studentAnswer || ""),
      correctAnswer: String(correctAnswer || ""),
      correct: isCorrect,
    });
  }
  return { total, correct, items };
}

export function buildTeacherNotes(input: {
  theoryScore: number | null;
  practiceScore: number | null;
  mc: { total: number; correct: number; items: CheckpointMcGradeItem[] };
  essayNotes: string;
  skippedScratch: boolean;
}): string {
  const parts: string[] = [];
  if (input.mc.total > 0) {
    const wrong = input.mc.items.filter((item) => !item.correct).map((item) => item.number);
    const theory = input.theoryScore == null ? "?" : String(input.theoryScore);
    const wrongText = wrong.length ? `; sai câu ${wrong.join(", ")}` : "";
    parts.push(`LT: ${input.mc.correct}/${input.mc.total} câu đúng (${theory}/5)${wrongText}.`);
  }
  if (input.practiceScore != null || input.essayNotes.trim()) {
    const practice = input.practiceScore == null ? "?" : String(input.practiceScore);
    const notes = input.essayNotes.trim();
    parts.push(notes ? `TH: ${practice}/5. ${notes}` : `TH: ${practice}/5.`);
  }
  if (input.skippedScratch) parts.push("Đã bỏ qua phần Scratch.");
  return parts.join(" ").trim();
}

export function emptyMcResult(): CheckpointGradeResult["mc"] {
  return { total: 0, correct: 0, items: [] };
}

export function averageEssayScore(items: CheckpointEssayGradeItem[]): number | null {
  if (!items.length) return null;
  const sum = items.reduce((total, item) => total + item.score, 0);
  return roundCheckpointScore(sum / items.length);
}

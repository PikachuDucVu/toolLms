import type { CheckpointSubmitResult, StudentAttendance } from '@tool-lms/contracts';
import type { CheckpointStudentDraft } from './checkpointStore';

export type CheckpointRank = 'A' | 'B' | 'C' | 'D';
export type CheckpointScoreReadout = { averageText: string; rank: CheckpointRank | string; hasBoth: boolean };

export function getCheckpointRank(theory: number, practice: number): CheckpointRank {
  const total = (theory + practice) / 2;
  if (total >= 4.5) return 'A';
  if (total >= 3.5) return 'B';
  if (total >= 2.5) return 'C';
  return 'D';
}

export function formatScore(value: number): string { return String(Math.round(value * 10) / 10); }

/** Average + rank shown next to a student: typed input wins, then the LMS score, then the last submit result. */
export function checkpointScoreReadout(student: StudentAttendance, draft: Pick<CheckpointStudentDraft, 'theoryInput' | 'practiceInput'>, result?: CheckpointSubmitResult): CheckpointScoreReadout {
  const area = student.commentByAreas?.find((item) => item.type === 'CHECKPOINT');
  const serverTheory = area?.checkpoint?.checkpointScore;
  const serverPractice = area?.checkpoint?.practiceScore;
  const theory = draft.theoryInput.trim() !== '' ? Number(draft.theoryInput) : serverTheory != null ? Number(serverTheory) : result?.theoryScore ?? null;
  const practice = draft.practiceInput.trim() !== '' ? Number(draft.practiceInput) : serverPractice != null ? Number(serverPractice) : result?.practiceScore ?? null;
  const hasBoth = theory !== null && practice !== null && !Number.isNaN(theory) && !Number.isNaN(practice);
  const averageText = result ? formatScore(result.totalScore) : hasBoth ? ((theory + practice) / 2).toFixed(1) : '?';
  const rank = result?.rank || (hasBoth ? getCheckpointRank(theory, practice) : '');
  return { averageText, rank, hasBoth };
}

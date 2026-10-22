import type { ClassDetail, CommentPreviousAssessment, LearningLevel, SessionCommentMode, Slot } from '@tool-lms/contracts';
import { currentSessionNumber, isPresent, sessionMode } from '../classes/public/domain';
import { sessionCommentModeFor } from '../comments/public/sessionMode';
import type { AssessmentHistory } from './assessmentStore';
import { isProductProgressSession, LEARNING_LEVELS } from './selectors';

/** How many earlier sessions are searched for a student's last attended, assessed one. */
export const PROGRESS_HISTORY_LOOKBACK = 3;

export type ProgressTrend = 'improved' | 'declined' | 'same';
export type PreviousSessionLevel = CommentPreviousAssessment & { slotId: string };

type SessionModes = Record<string, SessionCommentMode>;

/**
 * Earlier regular sessions whose level can serve as the "previous session", most recent first.
 * Session 1 never counts, and checkpoint/demo sessions have no level.
 */
export function progressHistorySlots(detail: ClassDetail, slot: Slot): Array<{ slot: Slot; sessionNumber: number }> {
  const currentIndex = Number(slot.index);
  if (!Number.isFinite(currentIndex)) return [];
  return detail.slots
    .map((item, position) => ({ slot: item, position, sessionNumber: currentSessionNumber(item, String(position)) }))
    .filter(({ slot: item, position, sessionNumber }) => item.id !== slot.id
      && Number(item.index) < currentIndex
      && sessionNumber > 1
      && sessionMode(item, String(position)) === 'regular')
    .sort((left, right) => Number(right.slot.index) - Number(left.slot.index))
    .slice(0, PROGRESS_HISTORY_LOOKBACK)
    .map(({ slot: item, sessionNumber }) => ({ slot: item, sessionNumber }));
}

/**
 * The level of the student's most recent earlier session they attended and were assessed in,
 * on the same scale (learning vs. product progress) as the current session.
 */
export function previousSessionLevel(
  history: AssessmentHistory,
  detail: ClassDetail,
  slot: Slot,
  sessionNumber: number,
  studentId: string,
  modes?: SessionModes,
): PreviousSessionLevel | null {
  const levels = history[studentId];
  if (!levels) return null;
  const productProgress = isProductProgressSession(sessionNumber, sessionCommentModeFor(detail.id, slot.id, modes));
  for (const candidate of progressHistorySlots(detail, slot)) {
    const candidateMode = sessionCommentModeFor(detail.id, candidate.slot.id, modes);
    if (isProductProgressSession(candidate.sessionNumber, candidateMode) !== productProgress) continue;
    const attendance = candidate.slot.studentAttendance.find((item) => item.studentId === studentId);
    const learningLevel = levels[candidate.slot.id];
    if (attendance && isPresent(attendance) && learningLevel) {
      return { slotId: candidate.slot.id, sessionNumber: candidate.sessionNumber, learningLevel };
    }
  }
  return null;
}

export function progressTrend(previous: LearningLevel, current: LearningLevel): ProgressTrend {
  const difference = levelRank(current) - levelRank(previous);
  return difference > 0 ? 'improved' : difference < 0 ? 'declined' : 'same';
}

export function levelRank(level: LearningLevel): number {
  return Number(LEARNING_LEVELS[level].code.slice(1));
}

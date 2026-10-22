import type { ClassDetail, LearningLevel, Slot } from '@tool-lms/contracts';
import { ArrowRight, History, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { useMemo } from 'react';
import { useSessionCommentMode, useSessionCommentModeStore } from '../comments/public/sessionMode';
import { useAssessmentStore } from './assessmentStore';
import { levelRank, previousSessionLevel, progressTrend, type PreviousSessionLevel } from './progress';
import { assessmentDraft, levelCatalog } from './selectors';

type ProgressTone = 'improved' | 'declined' | 'steady' | 'stalled';

const PROGRESS_PRESENTATION: Record<ProgressTone, { label: string; hint: string; Icon: typeof TrendingUp }> = {
  improved: { label: 'Tiến bộ', hint: 'Nhận xét AI sẽ có 1 câu khen con tiến bộ hơn buổi trước.', Icon: TrendingUp },
  declined: { label: 'Giảm', hint: 'Nhận xét AI sẽ có 1 câu nhắc con cần chú ý hơn so với buổi trước.', Icon: TrendingDown },
  steady: { label: 'Giữ vững', hint: 'Nhận xét AI sẽ ghi nhận con duy trì tốt như buổi trước.', Icon: Minus },
  stalled: { label: 'Chưa tiến bộ', hint: 'Nhận xét AI sẽ nhắc con vẫn cần cố gắng thêm so với buổi trước.', Icon: Minus },
};

export function progressTone(previous: LearningLevel, current: LearningLevel): ProgressTone {
  const trend = progressTrend(previous, current);
  if (trend !== 'same') return trend;
  return levelRank(current) >= 3 ? 'steady' : 'stalled';
}

export function usePreviousSessionLevel(detail: ClassDetail, slot: Slot, sessionNumber: number, studentId: string): PreviousSessionLevel | null {
  const history = useAssessmentStore((state) => state.history);
  const modes = useSessionCommentModeStore((state) => state.modes);
  return useMemo(
    () => previousSessionLevel(history, detail, slot, sessionNumber, studentId, modes),
    [detail, history, modes, sessionNumber, slot, studentId],
  );
}

/** Previous-session level next to this session's choice, shown in the student detail. */
export function PreviousLevelCompare({ detail, slot, sessionNumber, studentId }: {
  detail: ClassDetail; slot: Slot; sessionNumber: number; studentId: string;
}) {
  const previous = usePreviousSessionLevel(detail, slot, sessionNumber, studentId);
  const current = useAssessmentStore((state) => assessmentDraft(state, studentId).learningLevel);
  const levels = levelCatalog(sessionNumber, useSessionCommentMode());

  if (!previous) {
    return (
      <div className="progress-compare is-empty" role="note">
        <History size={15} aria-hidden="true" />
        <span>Chưa có level buổi trước để so sánh tiến bộ (không tính buổi 1).</span>
      </div>
    );
  }

  const tone = progressTone(previous.learningLevel, current);
  const { label, hint, Icon } = PROGRESS_PRESENTATION[tone];
  const before = levels[previous.learningLevel];
  const now = levels[current];
  return (
    <div className={`progress-compare tone-${tone}`} role="group" aria-label={`So với buổi ${previous.sessionNumber}: ${before.code} → ${now.code}, ${label}`}>
      <div className="progress-compare-row">
        <span className="progress-compare-caption">
          <History size={15} aria-hidden="true" />
          So với buổi {previous.sessionNumber}
        </span>
        <span className="progress-compare-levels">
          <LevelChip code={before.code} label={before.shortLabel} />
          <ArrowRight size={14} className="progress-compare-arrow" aria-hidden="true" />
          <LevelChip code={now.code} label={now.shortLabel} />
        </span>
        <span className="progress-trend-pill">
          <Icon size={14} aria-hidden="true" />
          {label}
        </span>
      </div>
      <p className="progress-compare-hint">{hint}</p>
    </div>
  );
}

/** Compact previous-session hint for the student table. */
export function PreviousLevelHint({ detail, slot, sessionNumber, studentId, current }: {
  detail: ClassDetail; slot: Slot; sessionNumber: number; studentId: string; current: LearningLevel;
}) {
  const previous = usePreviousSessionLevel(detail, slot, sessionNumber, studentId);
  const levels = levelCatalog(sessionNumber, useSessionCommentMode());
  if (!previous) return null;
  const tone = progressTone(previous.learningLevel, current);
  const { label, Icon } = PROGRESS_PRESENTATION[tone];
  const before = levels[previous.learningLevel];
  return (
    <span className={`progress-hint tone-${tone}`} title={`Buổi ${previous.sessionNumber}: ${before.code} · ${before.label} — ${label}`}>
      <Icon size={12} aria-hidden="true" />
      Buổi {previous.sessionNumber}: {before.code}
    </span>
  );
}

function LevelChip({ code, label }: { code: string; label: string }) {
  return (
    <span className={`badge-level level-${code.toLowerCase()}`}>
      <span className="level-code-tag">{code}</span>
      <span className="level-label">{label}</span>
    </span>
  );
}

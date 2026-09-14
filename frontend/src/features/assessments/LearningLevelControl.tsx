import type { LearningLevel } from '@tool-lms/contracts';
import { queueLearningLevelAutosave } from './autosaveController';
import { useAssessmentStore } from './assessmentStore';
import { assessmentDraft, isProductProgressSession, LEARNING_LEVEL_ORDER, LEARNING_LEVELS, PRODUCT_PROGRESS_LEVELS } from './selectors';

export function LearningLevelControl({
  studentId,
  studentName,
  disabled = false,
  sessionNumber,
}: {
  studentId: string;
  studentName: string;
  disabled?: boolean;
  sessionNumber?: number;
}) {
  const state = useAssessmentStore();
  const draft = assessmentDraft(state, studentId);
  const isSpck = isProductProgressSession(sessionNumber);
  const levelMap = isSpck ? PRODUCT_PROGRESS_LEVELS : LEARNING_LEVELS;

  const choose = (learningLevel: LearningLevel) => {
    useAssessmentStore.getState().setLearningLevelDraft(studentId, learningLevel);
    void queueLearningLevelAutosave(studentId);
  };

  return (
    <fieldset className="learning-level-fieldset" disabled={disabled}>
      <legend className="learning-level-legend">
        <span>{isSpck ? 'Chọn mức độ tiến độ sản phẩm' : 'Chọn mức độ nắm bài'}</span>
        <small>L3 là mặc định · chọn một mức để tự lưu</small>
      </legend>
      <div
        className="learning-level-grid"
        role="group"
        aria-label={`Chọn mức độ ${isSpck ? 'tiến độ sản phẩm' : 'nắm bài'} cho ${studentName}`}
      >
        {LEARNING_LEVEL_ORDER.map((value) => {
          const info = levelMap[value];
          const selected = draft.learningLevel === value;
          return (
            <button
              key={value}
              type="button"
              className={`learning-level-option ${selected ? 'is-selected' : ''}`}
              aria-pressed={selected}
              aria-label={`Chọn ${info.code}: ${info.label} cho ${studentName}`}
              onClick={() => choose(value)}
            >
              <span className="learning-level-code">{info.code}</span>
              <span className="learning-level-copy">
                <strong>{info.label}</strong>
                <small>{info.help}</small>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

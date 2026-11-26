import { CheckCircle, ClipboardCheck, Eye, MoreVertical, Send, Sparkles } from 'lucide-react';
import { useReviewStore } from '../review/public/store';
import { CheckpointBatchProgress } from './CheckpointBatchProgress';
import { CheckpointBatchResult } from './CheckpointBatchResult';
import type { CheckpointGenerationOptions, CheckpointScope } from './checkpointController';
import { useCheckpointStore } from './checkpointStore';
import { setIncludeAbsent, useIncludeAbsent } from './includeAbsentPreference';
import { useCheckpointBatchRunners } from './useCheckpointBatchRunners';

export function CheckpointBatchActions({ scope, generationOptions, presentCount, studentNames, disabled = false }: {
  scope: CheckpointScope; generationOptions: CheckpointGenerationOptions; presentCount: number; studentNames: Record<string, string>; disabled?: boolean;
}) {
  const batch = useCheckpointStore((state) => state.batch);
  const includeAbsent = useIncludeAbsent();
  const { runGrade, runGenerate, runScoreOnly, runFull, result, dismissResult } = useCheckpointBatchRunners(scope, generationOptions, includeAbsent);
  const totalCount = Object.keys(studentNames).length;
  const absentCount = Math.max(0, totalCount - presentCount);
  const blocked = disabled || Boolean(batch) || (includeAbsent ? totalCount === 0 : presentCount === 0);

  return (
    <section className="checkpoint-batch-wrapper" aria-label="Thao tác Checkpoint cả lớp">
      {batch && <CheckpointBatchProgress batch={batch} studentNames={studentNames} />}
      {result && <CheckpointBatchResult result={result} studentNames={studentNames} onDismiss={dismissResult} />}
      <div className="action-bar checkpoint-action-bar" id="checkpointActionBar">
        <label className="checkpoint-include-absent" title="Bật để các thao tác cả lớp (AI chấm, submit điểm, AI nhận xét) áp dụng cho cả học sinh vắng">
          <input
            type="checkbox"
            role="switch"
            checked={includeAbsent}
            disabled={disabled || Boolean(batch)}
            onChange={(event) => setIncludeAbsent(event.target.checked)}
            id="checkpointIncludeAbsentToggle"
          />
          <span>Gồm HS vắng{absentCount ? ` (${absentCount})` : ''}</span>
        </label>
        <div className="checkpoint-action-buttons">
          <button
            type="button"
            className="btn btn-outline"
            disabled={blocked}
            onClick={() => void runGrade()}
            id="gradeCheckpointAllBtn"
            aria-label="AI chấm tất cả đã nộp"
            title="AI chấm tất cả học sinh đã nộp bài trên kiemtra"
          >
            <ClipboardCheck size={15} />
            AI chấm tất cả
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={blocked}
            onClick={() => void runGenerate()}
            id="autoCheckpointCommentBtn"
          >
            <Sparkles size={15} />
            {includeAbsent ? 'AI nhận xét toàn bộ' : 'AI nhận xét tất cả'}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            disabled={disabled}
            onClick={() => useReviewStore.getState().openReview()}
            id="reviewCheckpointBtn"
          >
            <Eye size={15} />
            Review nhận xét
          </button>
          <button
            type="button"
            className="btn btn-checkpoint"
            disabled={blocked}
            onClick={() => void runFull()}
            id="submitCheckpointAllBtn"
            aria-label="Submit đầy đủ (AI + điểm)"
            title="Gửi điểm và nhận xét AI của cả lớp lên LMS"
          >
            <Send size={15} />
            Submit đầy đủ
          </button>
          <details className="batch-overflow">
            <summary className="btn btn-outline" aria-label="Mở thêm thao tác Checkpoint" title="Thêm thao tác">
              <MoreVertical size={15} />
            </summary>
            <div className="detail-menu-popover">
              <button
                type="button"
                className="menu-action"
                disabled={blocked}
                onClick={(event) => {
                  (event.currentTarget as HTMLElement).closest('details')?.removeAttribute('open');
                  void runScoreOnly();
                }}
                id="submitCheckpointScoresAllBtn"
                aria-label="Submit điểm tất cả"
              >
                <CheckCircle size={14} />
                <span>Submit điểm tất cả (không kèm nhận xét)</span>
              </button>
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}


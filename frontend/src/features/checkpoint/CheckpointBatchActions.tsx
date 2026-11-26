import { CheckCircle, ClipboardCheck, Eye, Sparkles } from 'lucide-react';
import { useReviewStore } from '../review/public/store';
import { CheckpointBatchProgress } from './CheckpointBatchProgress';
import { CheckpointBatchResult } from './CheckpointBatchResult';
import type { CheckpointGenerationOptions, CheckpointScope } from './checkpointController';
import { useCheckpointStore } from './checkpointStore';
import { useCheckpointBatchRunners } from './useCheckpointBatchRunners';

export function CheckpointBatchActions({ scope, generationOptions, presentCount, studentNames, disabled = false }: {
  scope: CheckpointScope; generationOptions: CheckpointGenerationOptions; presentCount: number; studentNames: Record<string, string>; disabled?: boolean;
}) {
  const batch = useCheckpointStore((state) => state.batch);
  const { runGrade, runGenerate, runScoreOnly, runFull, result, dismissResult } = useCheckpointBatchRunners(scope, generationOptions);
  const blocked = disabled || Boolean(batch) || presentCount === 0;

  return (
    <section className="checkpoint-batch-wrapper" aria-label="Thao tác Checkpoint cả lớp">
      {batch && <CheckpointBatchProgress batch={batch} studentNames={studentNames} />}
      {result && <CheckpointBatchResult result={result} studentNames={studentNames} onDismiss={dismissResult} />}
      <div className="action-bar checkpoint-action-bar" id="checkpointActionBar">
        <button
          type="button"
          className="btn btn-outline"
          disabled={disabled}
          onClick={() => useReviewStore.getState().openReview()}
          id="reviewCheckpointBtn"
        >
          <Eye size={16} />
          Review nhận xét
        </button>
        <button
          type="button"
          className="btn btn-outline"
          disabled={blocked}
          onClick={() => void runGrade()}
          id="gradeCheckpointAllBtn"
        >
          <ClipboardCheck size={16} />
          AI chấm tất cả đã nộp
        </button>
        <button
          type="button"
          className="btn btn-outline"
          disabled={blocked}
          onClick={() => void runScoreOnly()}
          id="submitCheckpointScoresAllBtn"
        >
          <CheckCircle size={16} />
          Submit điểm tất cả
        </button>
        <button
          type="button"
          className="btn btn-checkpoint"
          disabled={blocked}
          onClick={() => void runFull()}
          id="submitCheckpointAllBtn"
        >
          <CheckCircle size={16} />
          Submit đầy đủ (AI + điểm)
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={blocked}
          onClick={() => void runGenerate()}
          id="autoCheckpointCommentBtn"
        >
          <Sparkles size={16} />
          AI nhận xét tất cả
        </button>
      </div>
    </section>
  );
}

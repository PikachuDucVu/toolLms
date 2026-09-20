import { CheckCircle, ClipboardCheck, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import {
  captureCheckpointFullBatch,
  captureCheckpointGenerationBatch,
  captureCheckpointGradeBatch,
  captureCheckpointScoreOnlyBatch,
  generateCheckpointBatch,
  gradeCheckpointBatch,
  submitCheckpointFullBatch,
  submitCheckpointScoreOnlyBatch,
  type CheckpointGenerationOptions,
  type CheckpointScope,
} from './checkpointController';
import { CheckpointBatchProgress } from './CheckpointBatchProgress';
import { CheckpointBatchResult, type CheckpointBatchResultView } from './CheckpointBatchResult';
import { useCheckpointStore } from './checkpointStore';

export function CheckpointBatchActions({ scope, generationOptions, presentCount, studentNames, disabled = false }: {
  scope: CheckpointScope; generationOptions: CheckpointGenerationOptions; presentCount: number; studentNames: Record<string, string>; disabled?: boolean;
}) {
  const confirm = useConfirm(); const toast = useToast();
  const batch = useCheckpointStore((state) => state.batch);
  const [result, setResult] = useState<CheckpointBatchResultView | null>(null);
  const blocked = disabled || Boolean(batch) || presentCount === 0;

  const runGrade = async () => {
    try {
      assertGenerationOptions(generationOptions);
      const frozen = captureCheckpointGradeBatch(scope, generationOptions);
      const accepted = await confirm({ title: 'AI chấm bài Checkpoint cả lớp', description: `AI sẽ đọc đề + bài nộp (trắc nghiệm và tự luận, bỏ qua Scratch) của ${frozen.students.length} học sinh có mặt đã nộp bài, rồi điền điểm lý thuyết/thực hành. Tiếp tục?`, confirmLabel: 'AI chấm' });
      if (!accepted) return;
      const outcome = await gradeCheckpointBatch(scope, frozen);
      const next: CheckpointBatchResultView = { kind: 'grade', attempted: outcome.attempted, successful: outcome.successful, generationAttempted: 0, generationSuccessful: 0, failures: outcome.failures };
      setResult(next);
      toast.show(outcome.failures.length ? `Đã chấm AI ${outcome.successful}/${outcome.attempted}; ${outcome.failures.length} lỗi.` : `Đã chấm AI ${outcome.successful}/${outcome.attempted} học sinh.`, outcome.failures.length ? 'error' : 'success');
    } catch (cause) { if (!isAbort(cause)) toast.show(errorText(cause), 'error'); }
  };
  const runGenerate = async () => {
    try {
      assertGenerationOptions(generationOptions);
      const frozen = captureCheckpointGenerationBatch(scope, generationOptions);
      const accepted = await confirm({ title: 'AI nhận xét Checkpoint cả lớp', description: `AI sẽ tạo nhận xét từ mô tả đã chụp cho ${frozen.students.length} học sinh có mặt chưa có nhận xét AI. Tiếp tục?`, confirmLabel: 'Tạo AI' });
      if (!accepted) return;
      const outcome = await generateCheckpointBatch(scope, frozen);
      const next: CheckpointBatchResultView = { kind: 'generate', attempted: outcome.attempted, successful: outcome.successful, generationAttempted: outcome.attempted, generationSuccessful: outcome.successful, failures: outcome.failures };
      setResult(next);
      toast.show(outcome.failures.length ? `Đã tạo AI ${outcome.successful}/${outcome.attempted}; ${outcome.failures.length} lỗi.` : `Đã tạo AI ${outcome.successful}/${outcome.attempted} học sinh.`, outcome.failures.length ? 'error' : 'success');
    } catch (cause) { if (!isAbort(cause)) toast.show(errorText(cause), 'error'); }
  };
  const runScoreOnly = async () => {
    try {
      const frozen = captureCheckpointScoreOnlyBatch(scope);
      const accepted = await confirm({ title: 'Submit điểm Checkpoint cả lớp', description: `Điểm của ${frozen.students.length} học sinh có mặt đã được kiểm tra. Submit tuần tự theo phạm vi này?`, confirmLabel: `Submit ${frozen.students.length} học sinh` });
      if (!accepted) return;
      const outcome = await submitCheckpointScoreOnlyBatch(scope, frozen);
      const next: CheckpointBatchResultView = { kind: 'score_only', attempted: outcome.attempted, successful: outcome.successful, generationAttempted: 0, generationSuccessful: 0, failures: outcome.failures };
      setResult(next);
      toast.show(outcome.failures.length ? `Đã submit điểm ${outcome.successful}/${outcome.attempted}; ${outcome.failures.length} lỗi.` : `Đã submit điểm ${outcome.successful}/${outcome.attempted} học sinh.`, outcome.failures.length ? 'error' : 'success');
    } catch (cause) { if (!isAbort(cause)) toast.show(errorText(cause), 'error'); }
  };
  const runFull = async () => {
    try {
      const frozen = captureCheckpointFullBatch(scope, generationOptions);
      if (frozen.students.some((student) => !student.draft.generatedComment.trim())) assertGenerationOptions(generationOptions);
      const accepted = await confirm({ title: 'Submit Checkpoint đầy đủ cả lớp', description: `Sau xác nhận, hệ thống sẽ tạo AI còn thiếu (tối đa 3 đồng thời) rồi submit tuần tự cho ${frozen.students.length} học sinh có mặt.`, confirmLabel: `Submit ${frozen.students.length} học sinh` });
      if (!accepted) return;
      const outcome = await submitCheckpointFullBatch(scope, frozen);
      const next: CheckpointBatchResultView = { kind: 'full', attempted: outcome.attempted, successful: outcome.successful, generationAttempted: outcome.generationAttempted, generationSuccessful: outcome.generationSuccessful, failures: outcome.failures };
      setResult(next);
      toast.show(outcome.failures.length ? `Đã submit Checkpoint ${outcome.successful}/${outcome.attempted}; ${outcome.failures.length} lỗi theo giai đoạn.` : `Đã submit Checkpoint ${outcome.successful}/${outcome.attempted} học sinh.`, outcome.failures.length ? 'error' : 'success');
    } catch (cause) { if (!isAbort(cause)) toast.show(errorText(cause), 'error'); }
  };

  return (
    <section className="checkpoint-batch-wrapper" aria-label="Thao tác Checkpoint cả lớp">
      <div className="action-bar checkpoint-action-bar" id="checkpointActionBar">
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
      {batch && <CheckpointBatchProgress batch={batch} studentNames={studentNames} />}
      {result && <CheckpointBatchResult result={result} studentNames={studentNames} onDismiss={() => setResult(null)} />}
    </section>
  );
}

function assertGenerationOptions(options: CheckpointGenerationOptions): void { if (options.modelId === '__custom__' && !options.customModelId?.trim()) throw new Error('Model custom cần có tên model.'); }
function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error || 'Lỗi không xác định'); }
function isAbort(error: unknown): boolean { return error instanceof DOMException && error.name === 'AbortError'; }

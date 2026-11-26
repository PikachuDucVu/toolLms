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
import type { CheckpointBatchResultView } from './CheckpointBatchResult';

export function useCheckpointBatchRunners(scope: CheckpointScope, generationOptions: CheckpointGenerationOptions, includeAbsent = false) {
  const who = includeAbsent ? 'học sinh (kể cả vắng)' : 'học sinh có mặt';
  const confirm = useConfirm(); const toast = useToast();
  const [result, setResult] = useState<CheckpointBatchResultView | null>(null);

  const runGrade = async () => {
    try {
      assertGenerationOptions(generationOptions);
      const frozen = captureCheckpointGradeBatch(scope, generationOptions, { includeAbsent });
      const accepted = await confirm({ title: 'AI chấm bài Checkpoint cả lớp', description: `AI sẽ đọc đề + bài nộp (trắc nghiệm, tự luận và bài Scratch) của ${frozen.students.length} ${who} đã nộp bài, rồi điền điểm lý thuyết/thực hành. Tiếp tục?`, confirmLabel: 'AI chấm' });
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
      const frozen = captureCheckpointGenerationBatch(scope, generationOptions, { includeAbsent });
      const accepted = await confirm({ title: 'AI nhận xét Checkpoint cả lớp', description: `AI sẽ tạo nhận xét từ ghi chú cho ${frozen.students.length} ${who} chưa có nhận xét AI. Tiếp tục?`, confirmLabel: 'Tạo AI' });
      if (!accepted) return;
      const outcome = await generateCheckpointBatch(scope, frozen);
      const next: CheckpointBatchResultView = { kind: 'generate', attempted: outcome.attempted, successful: outcome.successful, generationAttempted: outcome.attempted, generationSuccessful: outcome.successful, failures: outcome.failures };
      setResult(next);
      toast.show(outcome.failures.length ? `Đã tạo AI ${outcome.successful}/${outcome.attempted}; ${outcome.failures.length} lỗi.` : `Đã tạo AI ${outcome.successful}/${outcome.attempted} học sinh.`, outcome.failures.length ? 'error' : 'success');
    } catch (cause) { if (!isAbort(cause)) toast.show(errorText(cause), 'error'); }
  };
  const runScoreOnly = async () => {
    try {
      const frozen = captureCheckpointScoreOnlyBatch(scope, undefined, { includeAbsent });
      const accepted = await confirm({ title: 'Submit điểm Checkpoint cả lớp', description: `Điểm của ${frozen.students.length} ${who} đã được kiểm tra. Submit tuần tự theo phạm vi này?`, confirmLabel: `Submit ${frozen.students.length} học sinh` });
      if (!accepted) return;
      const outcome = await submitCheckpointScoreOnlyBatch(scope, frozen);
      const next: CheckpointBatchResultView = { kind: 'score_only', attempted: outcome.attempted, successful: outcome.successful, generationAttempted: 0, generationSuccessful: 0, failures: outcome.failures };
      setResult(next);
      toast.show(outcome.failures.length ? `Đã submit điểm ${outcome.successful}/${outcome.attempted}; ${outcome.failures.length} lỗi.` : `Đã submit điểm ${outcome.successful}/${outcome.attempted} học sinh.`, outcome.failures.length ? 'error' : 'success');
    } catch (cause) { if (!isAbort(cause)) toast.show(errorText(cause), 'error'); }
  };
  const runFull = async () => {
    try {
      const frozen = captureCheckpointFullBatch(scope, generationOptions, undefined, { includeAbsent });
      if (frozen.students.some((student) => !student.draft.generatedComment.trim())) assertGenerationOptions(generationOptions);
      const accepted = await confirm({ title: 'Submit Checkpoint đầy đủ cả lớp', description: `Sau xác nhận, hệ thống sẽ tạo AI còn thiếu (tối đa 3 đồng thời) rồi submit tuần tự cho ${frozen.students.length} ${who}.`, confirmLabel: `Submit ${frozen.students.length} học sinh` });
      if (!accepted) return;
      const outcome = await submitCheckpointFullBatch(scope, frozen);
      const next: CheckpointBatchResultView = { kind: 'full', attempted: outcome.attempted, successful: outcome.successful, generationAttempted: outcome.generationAttempted, generationSuccessful: outcome.generationSuccessful, failures: outcome.failures };
      setResult(next);
      toast.show(outcome.failures.length ? `Đã submit Checkpoint ${outcome.successful}/${outcome.attempted}; ${outcome.failures.length} lỗi theo giai đoạn.` : `Đã submit Checkpoint ${outcome.successful}/${outcome.attempted} học sinh.`, outcome.failures.length ? 'error' : 'success');
    } catch (cause) { if (!isAbort(cause)) toast.show(errorText(cause), 'error'); }
  };

  return { runGrade, runGenerate, runScoreOnly, runFull, result, dismissResult: () => setResult(null) };
}

function assertGenerationOptions(options: CheckpointGenerationOptions): void { if (options.modelId === '__custom__' && !options.customModelId?.trim()) throw new Error('Model custom cần có tên model.'); }
function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error || 'Lỗi không xác định'); }
function isAbort(error: unknown): boolean { return error instanceof DOMException && error.name === 'AbortError'; }

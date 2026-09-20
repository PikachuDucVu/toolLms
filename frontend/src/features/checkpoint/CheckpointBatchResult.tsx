import type { CheckpointFailure } from './checkpointController';

export type CheckpointBatchResultView = {
  kind: 'generate' | 'grade' | 'score_only' | 'full';
  attempted: number;
  successful: number;
  generationAttempted: number;
  generationSuccessful: number;
  failures: CheckpointFailure[];
};

export function CheckpointBatchResult({ result, studentNames, onDismiss }: { result: CheckpointBatchResultView; studentNames: Record<string, string>; onDismiss: () => void }) {
  const hasFailures = result.failures.length > 0;
  return <section className={`checkpoint-batch-result ${hasFailures ? 'has-errors' : 'is-success'}`} aria-live="polite" aria-label="Kết quả thao tác Checkpoint cả lớp">
    <div><strong>{title(result.kind)}</strong><button type="button" className="btn btn-sm btn-outline" onClick={onDismiss}>Đóng kết quả</button></div>
    <p>{summary(result)}</p>
    {result.kind === 'full' && <p>Giai đoạn AI: {result.generationSuccessful}/{result.generationAttempted} thành công.</p>}
    {hasFailures && <details open><summary>{result.failures.length} lỗi theo học sinh/giai đoạn</summary><ul>{result.failures.map((failure, index) => <li key={`${failure.studentId}:${failure.phase}:${index}`}><strong>{studentNames[failure.studentId] || failure.studentId}</strong> — {phaseName(failure.phase)}: {failure.message}</li>)}</ul></details>}
  </section>;
}
function title(kind: CheckpointBatchResultView['kind']) {
  if (kind === 'generate') return 'Kết quả AI nhận xét Checkpoint cả lớp';
  if (kind === 'grade') return 'Kết quả AI chấm bài Checkpoint cả lớp';
  if (kind === 'score_only') return 'Kết quả submit điểm cả lớp';
  return 'Kết quả submit Checkpoint đầy đủ';
}
function summary(result: CheckpointBatchResultView) {
  if (result.kind === 'generate') return `Đã tạo AI ${result.successful}/${result.attempted} học sinh được thử.`;
  if (result.kind === 'grade') return `Đã chấm AI ${result.successful}/${result.attempted} học sinh đã nộp bài.`;
  return `Đã submit thành công ${result.successful}/${result.attempted} học sinh được thử.`;
}
function phaseName(phase: CheckpointFailure['phase']) {
  if (phase === 'generation') return 'Tạo AI';
  if (phase === 'grading') return 'AI chấm';
  return 'Submit';
}

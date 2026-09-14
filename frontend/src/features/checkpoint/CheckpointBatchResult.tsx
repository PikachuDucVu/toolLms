import type { CheckpointFailure } from './checkpointController';

export type CheckpointBatchResultView = {
  kind: 'generate' | 'score_only' | 'full';
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
    <p>{result.kind === 'generate' ? `Đã tạo AI ${result.successful}/${result.attempted} học sinh được thử.` : `Đã submit thành công ${result.successful}/${result.attempted} học sinh được thử.`}</p>
    {result.kind === 'full' && <p>Giai đoạn AI: {result.generationSuccessful}/{result.generationAttempted} thành công.</p>}
    {hasFailures && <details open><summary>{result.failures.length} lỗi theo học sinh/giai đoạn</summary><ul>{result.failures.map((failure, index) => <li key={`${failure.studentId}:${failure.phase}:${index}`}><strong>{studentNames[failure.studentId] || failure.studentId}</strong> — {failure.phase === 'generation' ? 'Tạo AI' : 'Submit'}: {failure.message}</li>)}</ul></details>}
  </section>;
}
function title(kind: CheckpointBatchResultView['kind']) { return kind === 'generate' ? 'Kết quả AI Checkpoint cả lớp' : kind === 'score_only' ? 'Kết quả submit điểm cả lớp' : 'Kết quả submit Checkpoint đầy đủ'; }

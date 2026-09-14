import { BatchProgressBar } from '../../components/ui/ProgressBar';
import type { CheckpointBatchState } from './checkpointStore';

export function CheckpointBatchProgress({
  batch,
  studentNames = {},
}: {
  batch: CheckpointBatchState;
  studentNames?: Record<string, string>;
}) {
  const percent = batch.total ? Math.round((batch.completed / batch.total) * 100) : 0;
  const currentName = batch.currentStudentId ? studentNames[batch.currentStudentId] || batch.currentStudentId : null;

  return (
    <BatchProgressBar
      className="checkpoint-batch-progress"
      role="status"
      aria-live="polite"
      aria-label={phaseLabel(batch.phase)}
      phaseLabel={phaseLabel(batch.phase)}
      completed={batch.completed}
      total={batch.total}
      percent={percent}
      successful={batch.successful}
      failureCount={Object.keys(batch.rowErrors).length}
      currentStudentName={currentName}
      variant="checkpoint"
      statusText={`${batch.completed}/${batch.total} bước • ${percent}%`}
      extraMeta={
        <div className="checkpoint-progress-meta">
          {batch.generationTotal > 0 && (
            <span>AI: {batch.generationSuccessful}/{batch.generationAttempted} thành công</span>
          )}
          {batch.submissionAttempted > 0 && (
            <span>Submit: {batch.submissionSuccessful}/{batch.submissionAttempted} thành công</span>
          )}
          {Object.keys(batch.rowErrors).length > 0 && (
            <span>{Object.keys(batch.rowErrors).length} học sinh có lỗi; quy trình vẫn tiếp tục.</span>
          )}
        </div>
      }
    />
  );
}

function phaseLabel(phase: CheckpointBatchState['phase']): string {
  return phase === 'generating'
    ? 'Đang tạo nhận xét AI (tối đa 3 đồng thời)'
    : phase === 'submitting'
      ? 'Đang submit Checkpoint tuần tự'
      : 'Đang tải lại dữ liệu lớp';
}

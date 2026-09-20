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
  const currentName =
    batch.phase === 'generating'
      ? null
      : batch.currentStudentId
        ? studentNames[batch.currentStudentId] || batch.currentStudentId
        : null;

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
            <span>AI nhận xét: {batch.generationSuccessful}/{batch.generationAttempted} thành công</span>
          )}
          {batch.gradingTotal > 0 && (
            <span>AI chấm: {batch.gradingSuccessful}/{batch.gradingAttempted} thành công</span>
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
  if (phase === 'generating') return 'Đang tạo nhận xét AI (tối đa 3 đồng thời)';
  if (phase === 'grading') return 'Đang AI chấm bài kiểm tra (tối đa 2 đồng thời)';
  if (phase === 'submitting') return 'Đang submit Checkpoint tuần tự';
  return 'Đang tải lại dữ liệu lớp';
}

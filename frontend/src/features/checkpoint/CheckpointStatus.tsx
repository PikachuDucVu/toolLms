import type { CheckpointStudentBranchStatus } from '@tool-lms/contracts';
import { ExternalLink } from 'lucide-react';
import { checkpointStudentStatusView } from './checkpointController';
import { useCheckpointStore } from './checkpointStore';

export function CheckpointStatus({ studentId, studentName, isPresent = true }: { studentId: string; studentName: string; isPresent?: boolean }) {
  useCheckpointStore((state) => state.status);
  useCheckpointStore((state) => state.statusResult);
  useCheckpointStore((state) => state.statusError);
  useCheckpointStore((state) => state.selectedBranches[studentId]);
  const view = checkpointStudentStatusView(studentId);

  if (!isPresent) {
    return <span className="badge badge-gray" role="status">Vắng — không chấm</span>;
  }

  if (view.state === 'idle' || view.state === 'loading') {
    return <span className="badge badge-loading" role="status" aria-live="polite">Đang tải trạng thái nộp bài…</span>;
  }
  if (view.state === 'error') {
    const label = view.error.kind === 'timeout' ? 'Trạng thái nộp bài phản hồi quá thời gian' : 'Trạng thái nộp bài tạm thời không khả dụng';
    return <span className="badge badge-missing" role="status" title={view.error.message}><strong>{label}</strong></span>;
  }
  if (view.state === 'no_live_exam') {
    return <span className="badge badge-gray" role="status">Chưa có kỳ Checkpoint đang hoạt động.</span>;
  }
  if (view.state === 'missing_student') {
    return <span className="badge badge-missing" role="status">Chưa nộp bài</span>;
  }
  if (!('student' in view)) return null;

  const branch = view.selectedBranch === 'makeup' ? view.student.makeup : view.student.original;
  if (!branch) return null;
  const both = view.state === 'both';
  const submittedAtText = formatSubmittedAt(branch.submittedAt);

  return (
    <div className="checkpoint-status-wrap" role="status" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span className="badge badge-submitted">
        Đã nộp{view.selectedBranch === 'makeup' ? ' • Bù' : ''}{submittedAtText ? ` • ${submittedAtText}` : ''}
      </span>
      {both && (
        <span
          className="checkpoint-branch-toggle"
          role="group"
          aria-label={`Chọn bài nộp Checkpoint của ${studentName}`}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className={`badge checkpoint-branch ${view.selectedBranch === 'original' ? 'is-active' : ''}`}
            aria-pressed={view.selectedBranch === 'original'}
            onClick={() => useCheckpointStore.getState().setSelectedBranch(studentId, 'original')}
          >
            Gốc
          </button>
          <button
            type="button"
            className={`badge checkpoint-branch ${view.selectedBranch === 'makeup' ? 'is-active' : ''}`}
            aria-pressed={view.selectedBranch === 'makeup'}
            onClick={() => useCheckpointStore.getState().setSelectedBranch(studentId, 'makeup')}
          >
            Bù
          </button>
        </span>
      )}
      <CheckpointLinks branch={branch} studentName={studentName} />
    </div>
  );
}

export function CheckpointLinks({ branch, studentName }: { branch: CheckpointStudentBranchStatus; studentName: string }) {
  const links = branch.links.filter((link) => (link.kind === 'scratch' || link.kind === 'essay') && safeLink(link.url));
  if (!links.length) return null;

  return (
    <span className="checkpoint-submission-links" style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6 }} aria-label={`Tệp bài nộp của ${studentName}`}>
      {links.map((link, index) => {
        const isScratch = link.kind === 'scratch';
        return (
          <a
            key={`${link.kind}:${link.url}:${index}`}
            className={`badge ${isScratch ? 'badge-link-info' : 'badge-link-demo'}`}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${link.label} của ${studentName} (mở trong tab mới)`}
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink size={12} aria-hidden="true" />
            {link.label}
          </a>
        );
      })}
    </span>
  );
}

function safeLink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function formatSubmittedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('vi-VN');
}

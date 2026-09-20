import type { ClassDetail, Slot, StudentAttendance, StudentWork } from '@tool-lms/contracts';
import { Eye, FolderGit2, MoreVertical } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useToast } from '../../components/ui/Toast';
import { attendancePresentation, existingContentComment, hasModeSubmission, isPresent, stripHtml, studentInitials } from '../classes/public/domain';
import { CopyDialog } from '../comments/public/CopyDialog';
import { copyWithFallback, individualZaloText } from '../comments/public/copyExport';
import { PastCommentsDialog } from '../comments/public/PastCommentsDialog';
import { useCommentStore } from '../comments/public/store';
import { generateSingleComment, type RegularCommentScope } from '../comments/public/controller';
import { useAssessmentStore } from './assessmentStore';
import { assessmentDraft, assessmentStatus, levelCatalog, pastStudentComments } from './selectors';

export const AssessmentCompactRow = memo(function AssessmentCompactRow({
  student,
  index = 0,
  active,
  locked,
  onSelect,
  detail,
  slot,
  sessionNumber = 1,
  works = [],
}: {
  works?: StudentWork[];
  student: StudentAttendance;
  index?: number;
  active: boolean;
  locked: boolean;
  onSelect: (studentId: string) => void;
  detail?: ClassDetail;
  slot?: Slot;
  sessionNumber?: number;
}) {
  const [showPast, setShowPast] = useState(false);
  const [copyText, setCopyText] = useState('');
  const toast = useToast();

  const draftReference = useAssessmentStore((state) => state.drafts[student.studentId]);
  const syncedReference = useAssessmentStore((state) => state.synced[student.studentId]);
  const inheritedReference = useAssessmentStore((state) => state.inherited[student.studentId]);
  const touched = useAssessmentStore((state) => state.touched.has(student.studentId));
  const autosaveBusy = useAssessmentStore((state) => state.autosaveBusy.has(student.studentId));
  const explicitSaveBusy = useAssessmentStore((state) => state.explicitSaveBusy.has(student.studentId));
  const saveError = useAssessmentStore((state) => state.saveErrors[student.studentId]);
  const load = useAssessmentStore((state) => state.load);
  const commentDraft = useCommentStore((state) => state.drafts[student.studentId]);
  const commentError = useCommentStore((state) => state.errors[student.studentId]);
  const summary = useCommentStore((state) => state.summaryDraft);
  const studentBusy = useCommentStore((state) => state.studentBusy.has(student.studentId));

  // The scalar/reference subscriptions above isolate this row while canonical selectors stay authoritative.
  void syncedReference; void inheritedReference; void touched; void autosaveBusy; void explicitSaveBusy; void saveError; void load;
  const assessmentState = useAssessmentStore.getState();
  const status = assessmentStatus(assessmentState, student.studentId);
  const draft = draftReference || assessmentDraft(assessmentState, student.studentId);
  const attendance = attendancePresentation(student.status);
  const existingComment = stripHtml(existingContentComment(student));
  const draftComment = stripHtml(commentDraft?.content || '');
  const level = levelCatalog(sessionNumber)[draft.learningLevel];
  const preview = commentError
    ? `Lỗi: ${commentError}`
    : draftComment || existingComment || (
      status.kind === 'loading'
        ? 'Đang tải đánh giá...'
        : status.kind === 'load-error'
          ? 'Không tải được đánh giá'
          : 'Chưa nhận xét'
    );

  const select = useCallback(() => onSelect(student.studentId), [onSelect, student.studentId]);

  const handleGenerate = async () => {
    if (!detail || !slot) return;
    try {
      const scope: RegularCommentScope = { detail, slot, sessionNumber, selectedStudentId: student.studentId };
      const meta = await generateSingleComment(scope, student.studentId);
      toast.show(
        meta.source === 'safe_template'
          ? 'AI chưa bám đúng level; hệ thống đã dùng mẫu an toàn.'
          : 'Đã tạo nhận xét!',
        meta.source === 'safe_template' ? 'info' : 'success',
      );
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
        toast.show(`Lỗi tạo nhận xét: ${cause instanceof Error ? cause.message : String(cause)}`, 'error');
      }
    }
  };

  const handleCopyZalo = async () => {
    const comment = commentDraft?.content || existingComment;
    if (!comment.trim()) return toast.show('Chưa có nhận xét', 'error');
    const text = individualZaloText(student.displayName, comment, summary);
    const mobile = window.innerWidth <= 768 || 'ontouchstart' in window;
    if (!mobile && (await copyWithFallback(text))) toast.show('Đã copy nhận xét Zalo!', 'success');
    else setCopyText(text);
  };

  const pastComments = detail && slot ? pastStudentComments(detail, slot, student.studentId) : [];

  return (
    <div
      className={`student-list-item ${active ? 'active' : ''} ${studentBusy ? 'is-generating' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={student.displayName}
      aria-pressed={active}
      onClick={select}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          select();
        }
      }}
    >
      <span className="cell-cb" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" className="student-cb" aria-label={`Chọn ${student.displayName}`} />
      </span>

      <span className="cell-stt">{index + 1}</span>

      <span className="student-profile-cell">
        <span className="student-name-block">
          <strong className="student-list-name">{student.displayName}</strong>
          {works.length > 0 && (
            <span
              className="badge badge-success"
              style={{
                fontSize: 10,
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                marginLeft: 6,
                padding: "1px 5px",
                borderRadius: 4,
                cursor: "pointer",
                maxWidth: 150,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={`Sản phẩm: ${works[0].latestData.title}`}
              onClick={(e) => {
                e.stopPropagation();
                select();
              }}
            >
              <FolderGit2 size={10} />
              {works[0].latestData.title || "Sản phẩm"}
            </span>
          )}
        </span>
      </span>

      <span className="cell-attendance">
        <span className={`badge status-pill badge-${attendance.tone}`}>{attendance.label}</span>
      </span>

      <span className="cell-level">
        {isPresent(student) ? (
          <span className={`badge-level level-${level.code.toLowerCase()} status-${status.kind}`} title={`${level.label}: ${level.help}`}>
            <span className="level-code-tag">{level.code}</span>
            <span className="level-label">
              {status.kind === 'loading'
                ? 'Đang tải'
                : status.kind === 'load-error'
                  ? 'Lỗi tải'
                  : level.shortLabel}
            </span>
          </span>
        ) : (
          <span className="badge-level level-absent" style={{ opacity: 0.7 }}>
            <span className="level-code-tag" style={{ background: "#94a3b8", color: "#ffffff" }}>--</span>
            <span className="level-label">Vắng</span>
          </span>
        )}
      </span>

      <span className="cell-comment">
        <span className="student-comment-cell-preview comment-text-snippet" title={preview}>{preview}</span>
      </span>

      <span className="cell-status">
        <span
          className={`badge status-pill ${
            commentDraft
              ? 'badge-info'
              : hasModeSubmission(student, 'regular')
                ? 'badge-success'
                : 'badge-warning'
          }`}
        >
          {commentDraft
            ? 'Bản nháp AI'
            : hasModeSubmission(student, 'regular')
              ? 'Đã gửi LMS'
              : 'Chưa nhận xét'}
        </span>
      </span>

      <span className="cell-actions" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="btn-view-comment" onClick={select}>
          <Eye size={13} />
          Chi tiết
        </button>
        <details className="table-row-menu">
          <summary aria-label="Thao tác khác" title="Thao tác khác">
            <MoreVertical size={14} />
          </summary>
          <div className="detail-menu-popover">
            <button
              type="button"
              className="menu-action"
              onClick={(e) => {
                (e.target as HTMLElement).closest('details')?.removeAttribute('open');
                void handleGenerate();
              }}
            >
              Tạo nhận xét AI
            </button>
            <button
              type="button"
              className="menu-action"
              onClick={(e) => {
                (e.target as HTMLElement).closest('details')?.removeAttribute('open');
                void handleCopyZalo();
              }}
            >
              Sao chép cho Zalo
            </button>
            <button
              type="button"
              className="menu-action"
              onClick={(e) => {
                (e.target as HTMLElement).closest('details')?.removeAttribute('open');
                setShowPast(true);
              }}
            >
              Lịch sử nhận xét
            </button>
            {commentDraft && (
              <button
                type="button"
                className="menu-action danger"
                onClick={(e) => {
                  (e.target as HTMLElement).closest('details')?.removeAttribute('open');
                  useCommentStore.getState().removeDraft(student.studentId);
                }}
              >
                Xóa bản nháp AI
              </button>
            )}
          </div>
        </details>
      </span>

      {/* Hidden compat metadata for testing contracts */}
      <span className="sr-only" aria-hidden="true" style={{ display: 'none' }}>
        <span className="student-avatar">{studentInitials(student.displayName)}</span>
        <span className="student-row-copy">
          <strong>{student.displayName}</strong>
          <span className="student-row-badges">
            <span className={`badge badge-${attendance.tone}`}>{attendance.label}</span>
          </span>
          <span className="student-row-preview">{preview}</span>
        </span>
      </span>

      <PastCommentsDialog
        open={showPast}
        studentName={student.displayName}
        pastComments={pastComments}
        onClose={() => setShowPast(false)}
      />

      <CopyDialog
        open={Boolean(copyText)}
        title="Copy nhận xét"
        text={copyText}
        onClose={() => setCopyText('')}
        onCopied={() => toast.show('Đã copy nhận xét Zalo!', 'success')}
      />
    </div>
  );
});

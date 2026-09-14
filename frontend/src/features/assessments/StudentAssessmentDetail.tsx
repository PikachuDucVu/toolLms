import type { ClassDetail, Slot, StudentAttendance } from '@tool-lms/contracts';
import { AlertCircle, Check, MessageSquareText, X } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '../../components/ui/Toast';
import { attendancePresentation, existingContentComment, hasModeSubmission, isPresent, stripHtml, studentInitials } from '../classes/public/domain';
import { CommentEditor } from '../comments/public/CommentEditor';
import { PastCommentsDialog } from '../comments/public/PastCommentsDialog';
import { StudentWorkSection } from '../studentWorks/public/StudentWorkSection';
import { useCommentStore } from '../comments/public/store';
import { saveFullAssessment } from './autosaveController';
import { InheritedAssessmentBadge } from './InheritedAssessmentBadge';
import { LearningLevelControl } from './LearningLevelControl';
import { SaveStatus } from './SaveStatus';
import { TeacherNoteEditor } from './TeacherNoteEditor';
import { useAssessmentStore } from './assessmentStore';
import { assessmentStatus, isProductProgressSession, pastStudentComments } from './selectors';

export function StudentAssessmentDetail({
  detail,
  slot,
  sessionNumber = Number(slot.index) + 1,
  student,
  selectedStudentId = student.studentId,
  locked = false, isOpen = true,
  onClose,
}: {
  detail: ClassDetail;
  slot: Slot;
  sessionNumber?: number;
  student: StudentAttendance;
  selectedStudentId?: string | null;
  locked?: boolean; isOpen?: boolean;
  onClose?: () => void;
}) {
  const toast = useToast();
  const [showPast, setShowPast] = useState(false);
  const attendance = attendancePresentation(student.status);
  const existing = stripHtml(existingContentComment(student));
  const status = assessmentStatus(useAssessmentStore(), student.studentId);
  const loadBlocked = status.kind === 'loading' || status.kind === 'load-error';
  const bulkBusy = useAssessmentStore((state) => state.bulkBusy);
  const explicitBusy = useAssessmentStore((state) => state.explicitSaveBusy.has(student.studentId));
  const commentDraft = useCommentStore((state) => state.drafts[student.studentId]);
  const past = pastStudentComments(detail, slot, student.studentId);
  const domId = student.studentId.replace(/[^a-zA-Z0-9_-]/g, '-');

  const save = async () => {
    try {
      const changed = await saveFullAssessment(student.studentId);
      toast.show(changed ? 'Đã lưu đánh giá!' : 'Không có thay đổi', changed ? 'success' : 'info');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toast.show(`Lỗi lưu đánh giá: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
    }
  };

  return (
    <section className={`student-detail-panel assessment-detail ${isOpen ? "open" : ""}`} aria-label={`Chi tiết ${student.displayName}`}>
      <div className="detail-panel-close-bar">
        <span>Chi tiết nhận xét học sinh</span>
        {onClose && (
          <button
            type="button"
            className="btn-close-detail"
            onClick={onClose}
            aria-label="Đóng chi tiết"
            title="Đóng chi tiết"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <header className="student-detail-header">
        <span className="student-avatar large" aria-hidden="true">
          {studentInitials(student.displayName)}
        </span>
        <div>
          <h3 id={`regular-student-title-${domId}`}>{student.displayName}</h3>
          <div className="student-row-badges">
            <span className={`badge badge-${attendance.tone}`}>{attendance.label}</span>
            <span
              className={`badge ${
                commentDraft
                  ? 'badge-warning'
                  : hasModeSubmission(student, 'regular')
                    ? 'badge-success'
                    : 'badge-neutral'
              }`}
            >
              {commentDraft
                ? commentDraft.kind === 'generated'
                  ? 'Bản nháp AI'
                  : 'Bản nháp thủ công'
                : hasModeSubmission(student, 'regular')
                  ? 'Đã gửi LMS'
                  : 'Chưa xử lý'}
            </span>
            <InheritedAssessmentBadge studentId={student.studentId} />
          </div>
        </div>
      </header>

      {!isPresent(student) && (
        <div className="regular-absent-note" role="note">
          <AlertCircle size={15} />
          Học sinh vắng nên không nằm trong thao tác level cả lớp. Ghi chú đánh giá vẫn có thể được lưu riêng khi cần.
        </div>
      )}

      {existing && (
        <div className="student-detail-section">
          <details className="regular-existing-comment" open={!commentDraft}>
            <summary>Nhận xét hiện tại trên LMS</summary>
            <div className="regular-existing-comment-body existing-comment">{existing}</div>
          </details>
        </div>
      )}

      <section className="student-detail-section assessment-editor">
        <div className="student-detail-section-title">
          <span>{isProductProgressSession(sessionNumber) ? "Đánh giá tiến độ sản phẩm" : "Đánh giá buổi học"}</span>
          {past.length > 0 && (
            <button
              type="button"
              className="btn-link"
              onClick={() => setShowPast(true)}
            >
              Xem buổi trước
            </button>
          )}
        </div>

        {isPresent(student) ? (
          <LearningLevelControl
            studentId={student.studentId}
            studentName={student.displayName}
            disabled={locked || loadBlocked || bulkBusy || explicitBusy}
            sessionNumber={sessionNumber}
          />
        ) : (
          <div className="regular-absence-action-copy">
            Không đánh giá level cho học sinh vắng. Nhận xét sẽ chỉ nêu tình trạng chuyên cần và nhắc con xem lại bài.
          </div>
        )}

        <TeacherNoteEditor
          studentId={student.studentId}
          studentName={student.displayName}
          disabled={locked || loadBlocked || bulkBusy || explicitBusy}
        />

        <div className="assessment-save-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
          <SaveStatus studentId={student.studentId} disabled={locked} onRetry={() => void save()} />
          <button
            type="button"
            className="btn btn-sm btn-outline"
            disabled={locked || loadBlocked || bulkBusy || explicitBusy}
            aria-busy={explicitBusy}
            onClick={() => void save()}
          >
            <Check size={14} />
            {explicitBusy ? 'Đang lưu...' : 'Lưu đánh giá'}
          </button>
        </div>
      </section>

      <StudentWorkSection
        classId={detail.id}
        slotId={slot.id}
        studentId={student.studentId}
        studentName={student.displayName}
        sessionNumber={sessionNumber}
        locked={locked || loadBlocked || bulkBusy || explicitBusy}
      />

      <CommentEditor
        detail={detail}
        slot={slot}
        sessionNumber={sessionNumber}
        student={student}
        selectedStudentId={selectedStudentId}
        locked={locked || loadBlocked || bulkBusy || explicitBusy}
      />

      <PastCommentsDialog
        open={showPast}
        studentName={student.displayName}
        pastComments={past}
        onClose={() => setShowPast(false)}
      />
    </section>
  );
}

import type { ClassDetail, Slot, StudentAttendance } from '@tool-lms/contracts';
import { AlertCircle, Check, History } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '../../components/ui/Toast';
import { existingContentComment, isPresent, stripHtml } from '../classes/public/domain';
import { CommentEditor } from '../comments/public/CommentEditor';
import { PastCommentsDialog } from '../comments/public/PastCommentsDialog';
import { StudentWorkSection } from '../studentWorks/public/StudentWorkSection';
import { useCommentStore } from '../comments/public/store';
import { useSessionCommentMode } from '../comments/public/sessionMode';
import { saveFullAssessment } from './autosaveController';
import { LearningLevelControl } from './LearningLevelControl';
import { PreviousLevelCompare } from './PreviousLevelCompare';
import { SaveStatus } from './SaveStatus';
import { TeacherNoteEditor } from './TeacherNoteEditor';
import { useAssessmentStore } from './assessmentStore';
import { assessmentStatus, isProductProgressSession, pastStudentComments } from './selectors';

/** The editable body for one student; the drawer or review panel around it owns the header and close button. */
export function StudentAssessmentDetail({
  detail,
  slot,
  sessionNumber = Number(slot.index) + 1,
  student,
  selectedStudentId = student.studentId,
  locked = false,
}: {
  detail: ClassDetail;
  slot: Slot;
  sessionNumber?: number;
  student: StudentAttendance;
  selectedStudentId?: string | null;
  locked?: boolean;
}) {
  const toast = useToast();
  const commentMode = useSessionCommentMode();
  const [showPast, setShowPast] = useState(false);
  const existing = stripHtml(existingContentComment(student));
  const status = assessmentStatus(useAssessmentStore(), student.studentId);
  const loadBlocked = status.kind === 'loading' || status.kind === 'load-error';
  const bulkBusy = useAssessmentStore((state) => state.bulkBusy);
  const explicitBusy = useAssessmentStore((state) => state.explicitSaveBusy.has(student.studentId));
  const commentDraft = useCommentStore((state) => state.drafts[student.studentId]);
  const past = pastStudentComments(detail, slot, student.studentId);
  const disabled = locked || loadBlocked || bulkBusy || explicitBusy;

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
    <div className="student-detail">
      {!isPresent(student) && (
        <div className="regular-absent-note" role="note">
          <AlertCircle size={15} />
          Học sinh vắng nên không nằm trong thao tác level cả lớp. Ghi chú đánh giá vẫn có thể được lưu riêng khi cần.
        </div>
      )}

      {existing && (
        <details className="student-detail-section regular-existing-comment" open={!commentDraft}>
          <summary>Nhận xét hiện tại trên LMS</summary>
          <div className="regular-existing-comment-body existing-comment">{existing}</div>
        </details>
      )}

      <section className="student-detail-section assessment-editor" aria-label={`Đánh giá của ${student.displayName}`}>
        <div className="student-detail-section-title">
          <span>{isProductProgressSession(sessionNumber, commentMode) ? 'Đánh giá tiến độ sản phẩm' : 'Đánh giá buổi học'}</span>
          {past.length > 0 && (
            <button type="button" className="btn-link" onClick={() => setShowPast(true)}>
              <History size={13} aria-hidden="true" />
              Lịch sử nhận xét
            </button>
          )}
        </div>

        {isPresent(student) ? (
          <>
            <PreviousLevelCompare detail={detail} slot={slot} sessionNumber={sessionNumber} studentId={student.studentId} />
            <LearningLevelControl
              studentId={student.studentId}
              studentName={student.displayName}
              disabled={disabled}
              sessionNumber={sessionNumber}
            />
          </>
        ) : (
          <div className="regular-absence-action-copy">
            Không đánh giá level cho học sinh vắng. Nhận xét sẽ chỉ nêu tình trạng chuyên cần và nhắc con xem lại bài.
          </div>
        )}

        <TeacherNoteEditor studentId={student.studentId} studentName={student.displayName} disabled={disabled} />

        <div className="assessment-save-row">
          <SaveStatus studentId={student.studentId} disabled={locked} onRetry={() => void save()} />
          <button
            type="button"
            className="btn btn-sm btn-outline"
            disabled={disabled}
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
        locked={disabled}
      />

      <CommentEditor
        detail={detail}
        slot={slot}
        sessionNumber={sessionNumber}
        student={student}
        selectedStudentId={selectedStudentId}
        locked={disabled}
      />

      <PastCommentsDialog
        open={showPast}
        studentName={student.displayName}
        pastComments={past}
        onClose={() => setShowPast(false)}
      />
    </div>
  );
}

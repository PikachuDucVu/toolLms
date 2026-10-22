import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ClassDetail, Slot, StudentAttendance } from '@tool-lms/contracts';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { attendancePresentation, hasModeSubmission } from '../classes/public/domain';
import { useCommentStore } from '../comments/public/store';
import { InheritedAssessmentBadge } from './InheritedAssessmentBadge';
import { StudentAssessmentDetail } from './StudentAssessmentDetail';

/**
 * Side sheet for one student's assessment and comment. The header (name, status, navigation and
 * close) stays pinned while only the body scrolls.
 */
export function StudentDetailDrawer({
  open,
  detail,
  slot,
  sessionNumber,
  student,
  students,
  locked,
  onSelect,
  onClose,
}: {
  open: boolean;
  detail: ClassDetail;
  slot: Slot;
  sessionNumber: number;
  student: StudentAttendance;
  students: StudentAttendance[];
  locked: boolean;
  onSelect: (studentId: string) => void;
  onClose: () => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const position = students.findIndex((item) => item.studentId === student.studentId);
  const previous = position > 0 ? students[position - 1] : null;
  const next = position >= 0 && position < students.length - 1 ? students[position + 1] : null;

  // Each student opens at the top of the sheet.
  useLayoutEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [student.studentId]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="student-drawer-overlay" />
        <DialogPrimitive.Content
          className="student-drawer"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            closeRef.current?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(event) => {
            // Land on the row of the student shown last, which may differ from the one that opened the sheet.
            const row = Array.from(document.querySelectorAll<HTMLElement>('[data-student-row]'))
              .find((element) => element.dataset.studentRow === student.studentId);
            if (!row) return;
            event.preventDefault();
            row.focus();
          }}
        >
          <header className="student-drawer-header">
            <div className="student-drawer-heading">
              <span className="student-drawer-eyebrow">
                Chi tiết nhận xét · Buổi {sessionNumber}
                {position >= 0 && students.length > 1 ? ` · ${position + 1}/${students.length}` : ''}
              </span>
              <DialogPrimitive.Title className="student-drawer-title">{student.displayName}</DialogPrimitive.Title>
              <StudentStatusBadges student={student} />
            </div>
            <div className="student-drawer-actions">
              <button
                type="button"
                className="student-drawer-icon-button"
                disabled={locked || !previous}
                aria-label="Học sinh trước"
                title={previous ? `Học sinh trước: ${previous.displayName}` : 'Học sinh trước'}
                onClick={() => previous && onSelect(previous.studentId)}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                className="student-drawer-icon-button"
                disabled={locked || !next}
                aria-label="Học sinh tiếp theo"
                title={next ? `Học sinh tiếp theo: ${next.displayName}` : 'Học sinh tiếp theo'}
                onClick={() => next && onSelect(next.studentId)}
              >
                <ChevronRight size={18} />
              </button>
              <DialogPrimitive.Close ref={closeRef} className="student-drawer-icon-button student-drawer-close" aria-label="Đóng chi tiết" title="Đóng (Esc)">
                <X size={18} />
              </DialogPrimitive.Close>
            </div>
          </header>

          <div ref={bodyRef} className="student-drawer-body">
            <StudentAssessmentDetail
              detail={detail}
              slot={slot}
              sessionNumber={sessionNumber}
              student={student}
              selectedStudentId={student.studentId}
              locked={locked}
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function StudentStatusBadges({ student }: { student: StudentAttendance }) {
  const commentDraft = useCommentStore((state) => state.drafts[student.studentId]);
  const attendance = attendancePresentation(student.status);
  const submitted = hasModeSubmission(student, 'regular');
  return (
    <div className="student-drawer-badges">
      <span className={`badge badge-${attendance.tone}`}>{attendance.label}</span>
      <span className={`badge ${commentDraft ? 'badge-warning' : submitted ? 'badge-success' : 'badge-neutral'}`}>
        {commentDraft
          ? commentDraft.kind === 'generated' ? 'Bản nháp AI' : 'Bản nháp thủ công'
          : submitted ? 'Đã gửi LMS' : 'Chưa xử lý'}
      </span>
      <InheritedAssessmentBadge studentId={student.studentId} />
    </div>
  );
}

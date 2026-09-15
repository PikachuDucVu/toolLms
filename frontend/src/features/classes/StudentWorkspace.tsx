import type { ClassDetail, Slot, StudentAttendance } from '@tool-lms/contracts';
import { useEffect } from 'react';
import { AssessmentWorkspace } from '../assessments/public/AssessmentWorkspace';
import { useCommentStore } from '../comments/public/store';
import { activateCommentContext, deactivateCommentContext } from '../comments/public/controller';
import { DemoWorkspace } from '../demo/public/DemoWorkspace';
import { CheckpointWorkspace } from '../checkpoint/public/CheckpointWorkspace';
import { ReviewDialog } from '../review/public/ReviewDialog';
import type { AttendanceFilter, ProgressFilter } from './store';
import { stripHtml, type SessionMode } from './selectors';

export function StudentWorkspace({
  detail,
  slot,
  sessionNumber,
  mode,
  students,
  selectedId,
  search,
  attendance,
  progress,
  noteDraft,
  persistedNote,
  assessmentLocked,
  onStudent,
  onSearch,
  onAttendance,
  onProgress,
  onSaveNote,
  onNoteDraft,
  onResetFilters,
}: {
  detail: ClassDetail;
  slot: Slot;
  sessionNumber: number;
  mode: SessionMode;
  students: StudentAttendance[];
  selectedId: string | null;
  search: string;
  attendance: AttendanceFilter;
  progress: ProgressFilter;
  noteDraft: string;
  persistedNote: string;
  assessmentLocked?: boolean;
  onStudent: (id: string) => void;
  onSearch: (value: string) => void;
  onAttendance: (value: AttendanceFilter) => void;
  onProgress: (value: ProgressFilter) => void;
  onSaveNote: () => void;
  onNoteDraft: (value: string) => void;
  onResetFilters: () => void;
}) {
  const commentOperationActive = useCommentStore(
    (state) => state.studentBusy.size > 0 || Boolean(state.batch) || state.summaryBusy,
  );

  useEffect(() => {
    if (mode !== 'regular') return;
    const context = activateCommentContext(detail.id, slot.id, stripHtml(slot.summary));
    return () => deactivateCommentContext(context);
  }, [detail.id, mode, slot.id]);

  return (
    <div className="comments-student-area" style={{ marginTop: 16, padding: '0 24px 20px' }} data-review-focus-fallback tabIndex={-1}>
      {mode === 'regular' && (
        <AssessmentWorkspace
          detail={detail}
          slot={slot}
          sessionNumber={sessionNumber}
          students={students}
          selectedId={selectedId}
          search={search}
          attendance={attendance}
          progress={progress}
          locked={assessmentLocked || commentOperationActive}
          onStudent={onStudent}
          onSearch={onSearch}
          onAttendance={onAttendance}
          onProgress={onProgress}
          onResetFilters={onResetFilters}
        />
      )}

      {mode === 'demo' && (
        <DemoWorkspace
          detail={detail}
          slot={slot}
          sessionNumber={sessionNumber}
          students={students}
          selectedId={selectedId}
          search={search}
          attendance={attendance}
          progress={progress}
          locked={assessmentLocked}
          onStudent={onStudent}
          onSearch={onSearch}
          onAttendance={onAttendance}
          onProgress={onProgress}
          onResetFilters={onResetFilters}
        />
      )}

      {mode === 'checkpoint' && (
        <CheckpointWorkspace
          key={`${detail.id}:${slot.id}:${sessionNumber}`}
          detail={detail}
          slot={slot}
          sessionNumber={sessionNumber}
          students={students}
          search={search}
          attendance={attendance}
          progress={progress}
          locked={assessmentLocked}
          onSearch={onSearch}
          onAttendance={onAttendance}
          onProgress={onProgress}
          onResetFilters={onResetFilters}
        />
      )}

      {mode === 'regular' && <ReviewDialog detail={detail} slot={slot} sessionNumber={sessionNumber} />}
    </div>
  );
}

import type { ClassDetail, Slot, StudentAttendance } from '@tool-lms/contracts';
import { Check, Clock, UserCheck, Users } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { AssessmentWorkspace } from '../assessments/public/AssessmentWorkspace';
import { useCommentStore } from '../comments/public/store';
import { activateCommentContext, deactivateCommentContext } from '../comments/public/controller';
import { DemoWorkspace } from '../demo/public/DemoWorkspace';
import { isDemoDraftDirty, useDemoStore } from '../demo/public/store';
import { CheckpointWorkspace } from '../checkpoint/public/CheckpointWorkspace';
import { isCheckpointDraftDirty, useCheckpointStore } from '../checkpoint/public/store';
import { ReviewDialog } from '../review/public/ReviewDialog';
import type { AttendanceFilter, ProgressFilter } from './store';
import { isPresent, stripHtml, studentStats, type SessionMode } from './selectors';

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
  const commentDrafts = useCommentStore((state) => state.drafts);
  const demoDrafts = useDemoStore((state) => state.drafts);
  const demoSynced = useDemoStore((state) => state.synced);
  const checkpointDrafts = useCheckpointStore((state) => state.drafts);
  const checkpointSynced = useCheckpointStore((state) => state.synced);

  useEffect(() => {
    if (mode !== 'regular') return;
    const context = activateCommentContext(detail.id, slot.id, stripHtml(slot.summary));
    return () => deactivateCommentContext(context);
  }, [detail.id, mode, slot.id]);

  const draftIds = useMemo(
    () =>
      mode === 'demo'
        ? new Set(
            Object.keys(demoDrafts).filter((studentId) =>
              isDemoDraftDirty({ drafts: demoDrafts, synced: demoSynced }, studentId),
            ),
          )
        : mode === 'checkpoint'
          ? new Set(
              Object.keys(checkpointDrafts).filter((studentId) =>
                isCheckpointDraftDirty({ drafts: checkpointDrafts, synced: checkpointSynced }, studentId),
              ),
            )
          : new Set(Object.keys(commentDrafts)),
    [checkpointDrafts, checkpointSynced, commentDrafts, demoDrafts, demoSynced, mode],
  );

  const stats = studentStats(slot.studentAttendance, mode, draftIds);

  return (
    <div className="comments-student-area" style={{ padding: '0 24px 20px' }}>
      <div className="kpi-grid" id="statsBar" aria-label="Tổng quan tiến độ" data-review-focus-fallback tabIndex={-1}>
        <div className="kpi-card kpi-total">
          <div className="kpi-icon-box blue">
            <Users size={20} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value" id="statTotal">{stats.total}</div>
            <div className="kpi-label">Tổng số học sinh</div>
          </div>
        </div>

        <div className="kpi-card kpi-done">
          <div className="kpi-icon-box green">
            <Check size={20} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value" id="statSubmitted">{stats.submitted}</div>
            <div className="kpi-label" id="statSubmittedLabel">
              {mode === 'regular' ? 'Đã nhận xét' : mode === 'demo' ? 'Đã chấm Demo' : 'Đã chấm'}
            </div>
          </div>
          <div className="kpi-badge green" id="statSubmittedBadge">
            {stats.total > 0 ? Math.round((stats.submitted / stats.total) * 100) : 0}%
          </div>
        </div>

        <div className="kpi-card kpi-pending">
          <div className="kpi-icon-box yellow">
            <Clock size={20} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value" id="statMissing">{stats.total - stats.submitted}</div>
            <div className="kpi-label">Chưa nhận xét</div>
          </div>
          <div className="kpi-badge yellow" id="statMissingBadge">
            {stats.total > 0 ? Math.round(((stats.total - stats.submitted) / stats.total) * 100) : 0}%
          </div>
        </div>

        <div className="kpi-card kpi-present">
          <div className="kpi-icon-box cyan">
            <UserCheck size={20} />
          </div>
          <div className="kpi-content">
            <div className="kpi-value" id="statPresent">{stats.present}</div>
            <div className="kpi-label">Có mặt hôm nay</div>
          </div>
          <div className="kpi-badge cyan" id="statPresentBadge">
            {stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0}%
          </div>
        </div>
      </div>

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

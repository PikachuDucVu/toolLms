import type { ClassDetail, LearningLevel, Slot, StudentAttendance } from '@tool-lms/contracts';
import { useEffect, useMemo, useState } from 'react';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { ErrorState } from '../../components/ui/ErrorState';
import { useToast } from '../../components/ui/Toast';
import { safeErrorMessage } from '../../app/providers';
import { StudentFilters } from '../classes/public/components';
import { BatchActions } from '../comments/public/BatchActions';
import type { AttendanceFilter, ProgressFilter } from '../classes/public/domain';
import { activateAssessmentContext, deactivateAssessmentContext, saveBulkLearningLevel } from './autosaveController';
import { useAssessmentStore, type AssessmentContext } from './assessmentStore';
import { useAssessmentsQuery } from './queries';
import { assessmentDraft, LEARNING_LEVEL_ORDER, levelCatalog, presentStudentIds, previousRegularSlotIds } from './selectors';
import { StudentAssessmentList } from './StudentAssessmentList';

export function AssessmentWorkspace({
  detail,
  slot,
  sessionNumber = Number(slot.index) + 1,
  students,
  selectedId,
  search,
  attendance,
  progress,
  locked = false,
  onStudent,
  onSearch,
  onAttendance,
  onProgress,
  onResetFilters,
}: {
  detail: ClassDetail;
  slot: Slot;
  sessionNumber?: number;
  students: StudentAttendance[];
  selectedId: string | null;
  search: string;
  attendance: AttendanceFilter;
  progress: ProgressFilter;
  locked?: boolean;
  onStudent: (id: string) => void;
  onSearch: (value: string) => void;
  onAttendance: (value: AttendanceFilter) => void;
  onProgress: (value: ProgressFilter) => void;
  onResetFilters: () => void;
}) {
  const [context, setContext] = useState<AssessmentContext | null>(null);
  const [bulkLevel, setBulkLevel] = useState('');
  const confirm = useConfirm();
  const toast = useToast();
  const previousSlotIds = useMemo(() => previousRegularSlotIds(detail.slots, slot.id), [detail.slots, slot.id]);
  const query = useAssessmentsQuery(context, previousSlotIds);
  const bulkBusy = useAssessmentStore((state) => state.bulkBusy);
  const load = useAssessmentStore((state) => state.load);

  useEffect(() => {
    const next = activateAssessmentContext(detail.id, slot.id);
    setContext(next);
    return () => deactivateAssessmentContext(next);
  }, [detail.id, slot.id]);

  useEffect(() => {
    if (!context || !query.data) return;
    useAssessmentStore.getState().hydrate(context, query.data.data.assessments);
  }, [context, query.data, query.dataUpdatedAt]);

  useEffect(() => {
    if (!context || !query.error) return;
    useAssessmentStore.getState().setLoadError(context, safeErrorMessage(query.error));
  }, [context, query.error]);

  const retry = () => {
    if (!context) return;
    useAssessmentStore.getState().setLoadPending(context);
    void query.refetch();
  };

  const setBulk = async (value: string) => {
    setBulkLevel('');
    if (!context || !value) return;
    const learningLevel = value as LearningLevel;
    const presentIds = presentStudentIds(slot.studentAttendance);
    const targets = presentIds.filter(
      (studentId) => assessmentDraft(useAssessmentStore.getState(), studentId).learningLevel !== learningLevel,
    );
    if (!targets.length) return toast.show(`Tất cả học sinh có mặt đã ở ${levelCatalog(sessionNumber)[learningLevel].code}`, 'info');
    const accepted = await confirm({
      title: `Đặt ${levelCatalog(sessionNumber)[learningLevel].code} cho cả lớp?`,
      description: `Mức độ của ${targets.length} học sinh có mặt sẽ đổi thành ${levelCatalog(sessionNumber)[learningLevel].code} · ${levelCatalog(sessionNumber)[learningLevel].label}. Ghi chú và bản nháp hiện có được giữ nguyên.`,
      confirmLabel: `Đặt ${levelCatalog(sessionNumber)[learningLevel].code}`,
    });
    if (!accepted || useAssessmentStore.getState().context?.epoch !== context.epoch) return;
    try {
      const result = await saveBulkLearningLevel(targets, learningLevel, 3);
      if (result.failures.length) {
        toast.show(
          `Đã đặt level cho ${result.successfulIds.length}/${targets.length} học sinh; các học sinh lỗi đã được khôi phục.`,
          'info',
        );
      } else {
        toast.show(`Đã đặt ${levelCatalog(sessionNumber)[learningLevel].code} cho ${targets.length} học sinh có mặt.`, 'success');
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toast.show(`Lỗi đổi level cả lớp: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
    }
  };

  return (
    <section className="student-workspace-section" aria-busy={!context || load.loading}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <StudentFilters
          search={search}
          attendance={attendance}
          progress={progress}
          mode="regular"
          disabled={locked}
          onSearch={onSearch}
          onAttendance={onAttendance}
          onProgress={onProgress}
          onReset={onResetFilters}
        />
        <label className="bulk-level-control" style={{ margin: 0 }}>
          <span className="sr-only">Level cả lớp</span>
          <select
            className="form-select"
            aria-label="Level cả lớp"
            value={bulkLevel}
            disabled={
              locked ||
              !context ||
              load.loading ||
              Boolean(load.error) ||
              bulkBusy ||
              presentStudentIds(slot.studentAttendance).length === 0
            }
            onChange={(event) => {
              setBulkLevel(event.target.value);
              void setBulk(event.target.value);
            }}
          >
            <option value="">
              {bulkBusy ? 'Đang lưu level...' : `Level cả lớp (${presentStudentIds(slot.studentAttendance).length})`}
            </option>
            {LEARNING_LEVEL_ORDER.map((level) => (
              <option key={level} value={level}>
                {levelCatalog(sessionNumber)[level].code} · {levelCatalog(sessionNumber)[level].shortLabel}
              </option>
            ))}
          </select>
        </label>
      </div>

      {!context || load.loading ? (
        <AssessmentLoading />
      ) : load.error ? (
        <>
          <ErrorState error={load.error} onRetry={locked ? undefined : retry} />
          <StudentAssessmentList
            detail={detail}
            slot={slot}
            sessionNumber={sessionNumber}
            students={students}
            total={slot.studentAttendance.length}
            selectedId={selectedId}
            locked={locked}
            onSelect={onStudent}
            onResetFilters={onResetFilters}
          />
        </>
      ) : (
        <StudentAssessmentList
          detail={detail}
          slot={slot}
          sessionNumber={sessionNumber}
          students={students}
          total={slot.studentAttendance.length}
          selectedId={selectedId}
          locked={locked}
          onSelect={onStudent}
          onResetFilters={onResetFilters}
        />
      )}

      <BatchActions
        detail={detail}
        slot={slot}
        sessionNumber={sessionNumber}
        selectedStudentId={selectedId}
        visibleStudents={students}
        locked={locked || !context || load.loading || Boolean(load.error) || bulkBusy}
      />
    </section>
  );
}

function AssessmentLoading() {
  return (
    <div className="assessment-loading" aria-label="Đang tải đánh giá học sinh" style={{ padding: 24 }}>
      <span className="skeleton" style={{ height: 40, marginBottom: 12 }} />
      <span className="skeleton" style={{ height: 40, marginBottom: 12 }} />
      <span className="skeleton" style={{ height: 40 }} />
    </div>
  );
}

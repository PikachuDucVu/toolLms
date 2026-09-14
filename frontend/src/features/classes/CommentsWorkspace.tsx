import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Clock, RefreshCw, UserCheck, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';
import bottomBannerUrl from '../../assets/design/bottom_banner.png';
import emptyStudentsUrl from '../../assets/empty-students.jpg';
import { useAuth } from '../../app/providers';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { ErrorState } from '../../components/ui/ErrorState';
import { useToast } from '../../components/ui/Toast';
import { hasUnsavedAssessmentWork, isAssessmentOperationActive } from '../assessments/public/controller';
import { useAssessmentStore } from '../assessments/public/store';
import { useCommentStore } from '../comments/public/store';
import { hasUnsavedCommentWork, isCommentOperationActive } from '../comments/public/controller';
import { createOperationController, releaseOperationController } from '../../lib/operationContext';
import { hasUnsavedDemoWork, isDemoOperationActive, useDemoStore } from '../demo/public/store';
import { hasUnsavedCheckpointWork, isCheckpointDraftDirty, isCheckpointOperationActive, useCheckpointStore } from '../checkpoint/public/store';
import { writeStudentNote } from '../../lib/persistence';
import { ClassList } from './ClassList';
import { getClassDetail } from './api';
import { classDetailQuery, commentsClassesQuery } from './queries';
import {
  autoSelectedSlotIndex,
  classesWithDetailProgress,
  currentSessionNumber,
  detailForSelectedClass,
  getSlotDisplayNumber,
  orderClassSummaries,
  selectedSlot,
  sessionMode,
  stripHtml,
  visibleStudents,
} from './selectors';
import { SessionSelector } from './SessionSelector';
import { StudentFilters } from './StudentFilters';
import { StudentWorkspace } from './StudentWorkspace';
import { useClassWorkspaceStore } from './store';
import { useStudentNotes } from './useStudentNotes';

export function CommentsWorkspace() {
  const auth = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const classId = useClassWorkspaceStore((state) => state.classId);
  const slotIndex = useClassWorkspaceStore((state) => state.slotIndex);
  const activeSlotIndex = useClassWorkspaceStore((state) => state.activeSlotIndex);
  const studentId = useClassWorkspaceStore((state) => state.studentId);
  const search = useClassWorkspaceStore((state) => state.search);
  const attendance = useClassWorkspaceStore((state) => state.attendance);
  const progress = useClassWorkspaceStore((state) => state.progress);
  const assessmentOperationActive = useAssessmentStore(
    (state) =>
      state.classRefreshBusy ||
      state.bulkBusy ||
      state.autosaveBusy.size > 0 ||
      state.explicitSaveBusy.size > 0,
  );
  const commentOperationActive = useCommentStore(
    (state) => state.studentBusy.size > 0 || Boolean(state.batch) || state.summaryBusy,
  );
  const commentDrafts = useCommentStore((state) => state.drafts);
  const demoDrafts = useDemoStore((state) => state.drafts);
  const demoSynced = useDemoStore((state) => state.synced);
  const demoOperationActive = useDemoStore(
    (state) => state.randomBusy.size > 0 || state.submitBusy.size > 0 || Boolean(state.batch),
  );
  const checkpointDrafts = useCheckpointStore((state) => state.drafts);
  const checkpointSynced = useCheckpointStore((state) => state.synced);
  const checkpointOperationActive = useCheckpointStore(
    (state) =>
      state.generationBusy.size > 0 || state.submitBusy.size > 0 || Boolean(state.batch),
  );
  const classRefreshBusy = useAssessmentStore((state) => state.classRefreshBusy);

  const classesQuery = useQuery({ ...commentsClassesQuery(), enabled: Boolean(auth.session) });
  const detailQuery = useQuery({ ...classDetailQuery(classId), enabled: Boolean(auth.session && classId) });
  const detail = detailForSelectedClass(detailQuery.data?.data.class, classId);
  const classes = useMemo(
    () => classesWithDetailProgress(orderClassSummaries(classesQuery.data?.data.classes || []), detail),
    [classesQuery.data, detail],
  );
  const slot = selectedSlot(detail, activeSlotIndex);
  const mode = sessionMode(slot, activeSlotIndex);

  const isClassesLoading = Boolean(auth.session && classesQuery.isLoading);
  const isDetailLoading = Boolean(classId && detailQuery.isLoading);

  const draftIds = useMemo(
    () =>
      mode === 'demo'
        ? new Set(
            Object.keys(demoDrafts).filter((studentKey) => {
              const draft = demoDrafts[studentKey];
              const synced = demoSynced[studentKey];
              return Boolean(
                draft &&
                  synced &&
                  (draft.autoRate !== synced.autoRate ||
                    JSON.stringify(draft.scores) !== JSON.stringify(synced.scores)),
              );
            }),
          )
        : mode === 'checkpoint'
          ? new Set(
              Object.keys(checkpointDrafts).filter((studentKey) =>
                isCheckpointDraftDirty({ drafts: checkpointDrafts, synced: checkpointSynced }, studentKey),
              ),
            )
          : new Set(Object.keys(commentDrafts)),
    [checkpointDrafts, checkpointSynced, commentDrafts, demoDrafts, demoSynced, mode],
  );
  const students = useMemo(
    () =>
      visibleStudents(
        slot?.studentAttendance || [],
        { search, attendance, progress },
        mode,
        draftIds,
      ),
    [attendance, draftIds, mode, progress, search, slot],
  );
  const activeStudentId = students.some((student) => student.studentId === studentId)
    ? studentId
    : students[0]?.studentId || null;
  const { notes, setNotes, noteDraft, setNoteDraft } = useStudentNotes(activeStudentId);

  useEffect(() => {
    if (!detail || detail.id !== classId || slotIndex !== '') return;
    const automatic = autoSelectedSlotIndex(detail.slots);
    if (!automatic) return;
    useClassWorkspaceStore.getState().setSlotIndex(automatic);
  }, [classId, detail, slotIndex]);

  useEffect(() => {
    if (activeStudentId !== studentId) useClassWorkspaceStore.getState().setStudentId(activeStudentId);
  }, [activeStudentId, studentId]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (
        !hasUnsavedAssessmentWork() &&
        !hasUnsavedCommentWork() &&
        !hasUnsavedDemoWork() &&
        !hasUnsavedCheckpointWork() &&
        !isAssessmentOperationActive() &&
        !isCommentOperationActive() &&
        !isDemoOperationActive() &&
        !isCheckpointOperationActive()
      )
        return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  const allowAssessmentContextChange = async (preserveCheckpointDrafts = false) => {
    if (
      isAssessmentOperationActive() ||
      isCommentOperationActive() ||
      isDemoOperationActive() ||
      isCheckpointOperationActive()
    ) {
      toast.show(
        isCheckpointOperationActive()
          ? 'Vui lòng đợi thao tác Checkpoint đang chạy hoàn tất'
          : 'Vui lòng đợi thao tác đang chạy hoàn tất',
        'info',
      );
      return false;
    }
    if (
      !hasUnsavedAssessmentWork() &&
      !hasUnsavedCommentWork() &&
      !hasUnsavedDemoWork() &&
      !hasUnsavedCheckpointWork()
    )
      return true;
    const accepted = await confirm({
      title:
        preserveCheckpointDrafts && hasUnsavedCheckpointWork()
          ? 'Refresh dữ liệu lớp?'
          : 'Bỏ thay đổi chưa lưu?',
      description: hasUnsavedCheckpointWork()
        ? preserveCheckpointDrafts
          ? 'Dữ liệu LMS sạch sẽ được cập nhật; điểm, mô tả, nhận xét và tổng kết Checkpoint đang sửa sẽ được giữ lại.'
          : 'Bạn đang có tổng kết, điểm, mô tả hoặc nhận xét Checkpoint chưa gửi. Chuyển đi sẽ bỏ các thay đổi này.'
        : hasUnsavedDemoWork()
          ? 'Bạn đang có tổng kết hoặc điểm Demo chưa gửi. Chuyển đi sẽ bỏ các thay đổi này.'
          : 'Bạn đang có đánh giá, tổng kết hoặc bản nháp nhận xét chưa lưu. Chuyển đi sẽ bỏ các thay đổi này.',
      confirmLabel:
        preserveCheckpointDrafts && hasUnsavedCheckpointWork()
          ? 'Refresh và giữ bản nháp'
          : 'Bỏ thay đổi',
    });
    if (accepted && hasUnsavedDemoWork()) useDemoStore.getState().discardUnsaved();
    return accepted;
  };

  const allowInSlotViewChange = useCallback(() => {
    if (mode !== 'demo' && mode !== 'checkpoint') return true;
    if (
      isAssessmentOperationActive() ||
      isCommentOperationActive() ||
      isDemoOperationActive() ||
      isCheckpointOperationActive()
    ) {
      toast.show(
        isCheckpointOperationActive()
          ? 'Vui lòng đợi thao tác Checkpoint đang chạy hoàn tất'
          : 'Vui lòng đợi thao tác đang chạy hoàn tất',
        'info',
      );
      return false;
    }
    return true;
  }, [mode, toast]);

  const selectStudent = useCallback(
    (id: string) => {
      if (id !== useClassWorkspaceStore.getState().studentId && allowInSlotViewChange())
        useClassWorkspaceStore.getState().setStudentId(id);
    },
    [allowInSlotViewChange],
  );

  const chooseSlot = async (value: string) => {
    if (value === slotIndex || !(await allowAssessmentContextChange())) return;
    useClassWorkspaceStore.getState().setSlotIndex(value);
  };

  const chooseClass = async (id: string) => {
    if (id === classId || !(await allowAssessmentContextChange())) return;
    useClassWorkspaceStore.getState().setClassId(id);
  };

  const refresh = async () => {
    if (!detail || !(await allowAssessmentContextChange(true))) return;
    const capturedClassId = classId;
    const oldSlotId = slot?.id || null;
    const discardDirty = hasUnsavedAssessmentWork() || hasUnsavedCommentWork();
    const assessmentBefore = useAssessmentStore.getState();
    const commentBefore = useCommentStore.getState();
    const capturedComment = {
      context: commentBefore.context,
      drafts: commentBefore.drafts,
      summaryDraft: commentBefore.summaryDraft,
      summarySynced: commentBefore.summarySynced,
    };
    const capturedAssessment = {
      context: assessmentBefore.context,
      drafts: assessmentBefore.drafts,
      touched: assessmentBefore.touched,
      synced: assessmentBefore.synced,
      inherited: assessmentBefore.inherited,
    };
    const controller = createOperationController();
    useAssessmentStore.getState().setClassRefreshBusy(true);
    try {
      const result = await getClassDetail(capturedClassId, controller.signal);
      const liveWorkspace = useClassWorkspaceStore.getState();
      const liveAssessment = useAssessmentStore.getState();
      const contextUnchanged =
        liveAssessment.context?.epoch === capturedAssessment.context?.epoch &&
        liveAssessment.context?.classId === capturedAssessment.context?.classId &&
        liveAssessment.context?.slotId === capturedAssessment.context?.slotId;
      const liveComment = useCommentStore.getState();
      const commentUnchanged =
        liveComment.context === capturedComment.context &&
        liveComment.drafts === capturedComment.drafts &&
        liveComment.summaryDraft === capturedComment.summaryDraft &&
        liveComment.summarySynced === capturedComment.summarySynced &&
        !isCommentOperationActive();
      const assessmentUnchanged =
        contextUnchanged &&
        commentUnchanged &&
        liveAssessment.drafts === capturedAssessment.drafts &&
        liveAssessment.touched === capturedAssessment.touched &&
        liveAssessment.synced === capturedAssessment.synced &&
        liveAssessment.inherited === capturedAssessment.inherited &&
        liveAssessment.autosaveBusy.size === 0 &&
        liveAssessment.explicitSaveBusy.size === 0 &&
        !liveAssessment.bulkBusy;
      const fresh = result.data.class;
      if (liveWorkspace.classId !== capturedClassId || !assessmentUnchanged || fresh.id !== capturedClassId) {
        toast.show('Không áp dụng dữ liệu refresh vì ngữ cảnh đánh giá đã thay đổi.', 'info');
        return;
      }
      const nextIndex = oldSlotId ? fresh.slots.findIndex((item) => item.id === oldSlotId) : Number(slotIndex);
      const nextValue = nextIndex >= 0 && Number.isInteger(nextIndex) ? String(nextIndex) : '';
      queryClient.setQueryData(classDetailQuery(capturedClassId).queryKey, result);
      if (discardDirty) {
        useAssessmentStore.getState().discardUnsaved();
        useCommentStore.getState().discardUnsaved();
      }
      const refreshedSummary = nextValue ? stripHtml(fresh.slots[Number(nextValue)].summary) : '';
      useCommentStore.getState().hydrateSummary(refreshedSummary);
      useClassWorkspaceStore.getState().applyRefreshedSlot(nextValue);
      toast.show('Đã refresh dữ liệu!');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        toast.show(`Không thể refresh dữ liệu: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      releaseOperationController(controller);
      useAssessmentStore.getState().setClassRefreshBusy(false);
    }
  };

  const saveNote = () => {
    if (!activeStudentId) return;
    const next = writeStudentNote(activeStudentId, noteDraft);
    setNotes(next);
    toast.show('Đã lưu ghi chú cục bộ');
  };

  return (
    <main className="comments-page" aria-label="Không gian nhận xét học sinh">
      <div className="main-grid">
        {/* Left Sidebar (340px) */}
        <aside className="sidebar">
          <div className="card">
            <div className="card-header">
              <h2>
                <Users size={18} />
                Danh sách lớp
              </h2>
              <button
                type="button"
                className="btn btn-sm btn-outline btn-icon"
                onClick={() => void classesQuery.refetch()}
                aria-label="Tải lại danh sách lớp"
                title="Tải lại danh sách lớp"
              >
                <RefreshCw size={14} className={classesQuery.isFetching ? 'spin-icon' : ''} />
              </button>
            </div>
            <div className="card-body">
              <ClassList
                classes={classes}
                selectedId={classId}
                loading={isClassesLoading}
                disabled={
                  assessmentOperationActive ||
                  commentOperationActive ||
                  demoOperationActive ||
                  checkpointOperationActive
                }
                onSelect={(id) => void chooseClass(id)}
              />
            </div>
          </div>
        </aside>

        <div className="workspace-main">
          <SessionSelector
            detail={detail}
            value={slotIndex}
            disabled={
              detailQuery.isPending ||
              assessmentOperationActive ||
              commentOperationActive ||
              demoOperationActive ||
              checkpointOperationActive
            }
            refreshing={classRefreshBusy}
            onChange={(value) => void chooseSlot(value)}
            onRefresh={() => void refresh()}
          />

          <div className="card student-main-card">
            <div className="card-header student-card-header">
            <div className="student-card-heading">
              <h2>
                <Users size={18} />
                Danh sách học sinh
                <span className="student-count-badge" id="studentCount">
                  {slot
                    ? students.length === slot.studentAttendance.length
                      ? `${slot.studentAttendance.length} học sinh`
                      : `${students.length}/${slot.studentAttendance.length} học sinh`
                    : '0 học sinh'}
                </span>
              </h2>
            </div>
            <div className="student-header-meta" id="studentHeaderMeta">
              <span id="selectedClassSlotMeta" className="selected-meta-text">
                {detail && slot ? (
                  <>
                    Lớp: <strong>{detail.name}</strong> &nbsp;|&nbsp; Buổi{' '}
                    {getSlotDisplayNumber(slot, activeSlotIndex)}:{' '}
                    {slot.date ? new Date(slot.date).toLocaleDateString('vi-VN') : ''}
                  </>
                ) : detail ? (
                  `Lớp: ${detail.name}`
                ) : (
                  'Chưa chọn lớp học'
                )}
              </span>
            </div>
          </div>

          {isDetailLoading && <ClassDetailLoading />}
          {classId && detailQuery.error && (
            <ErrorState error={detailQuery.error} onRetry={() => void detailQuery.refetch()} />
          )}

          {(!detail || !slot) && !isDetailLoading && (
            <>
              <div className="student-toolbar" aria-label="Công cụ danh sách học sinh">
                <StudentFilters
                  search={search}
                  attendance={attendance}
                  progress={progress}
                  mode="regular"
                  disabled={true}
                  onSearch={() => undefined}
                  onAttendance={() => undefined}
                  onProgress={() => undefined}
                  onReset={() => undefined}
                />
              </div>

              <div className="kpi-grid" id="statsBar" aria-label="Tổng quan tiến độ">
                <div className="kpi-card kpi-total">
                  <div className="kpi-icon-box blue">
                    <Users size={18} />
                  </div>
                  <div className="kpi-content">
                    <div className="kpi-value" id="statTotal">0</div>
                    <div className="kpi-label">Tổng số học sinh</div>
                  </div>
                </div>

                <div className="kpi-card kpi-done">
                  <div className="kpi-icon-box green">
                    <Check size={18} />
                  </div>
                  <div className="kpi-content">
                    <div className="kpi-value" id="statSubmitted">0</div>
                    <div className="kpi-label" id="statSubmittedLabel">Đã nhận xét</div>
                  </div>
                  <div className="kpi-badge green" id="statSubmittedBadge">0%</div>
                </div>

                <div className="kpi-card kpi-pending">
                  <div className="kpi-icon-box yellow">
                    <Clock size={18} />
                  </div>
                  <div className="kpi-content">
                    <div className="kpi-value" id="statMissing">0</div>
                    <div className="kpi-label">Chưa nhận xét</div>
                  </div>
                  <div className="kpi-badge yellow" id="statMissingBadge">0%</div>
                </div>

                <div className="kpi-card kpi-present">
                  <div className="kpi-icon-box cyan">
                    <UserCheck size={18} />
                  </div>
                  <div className="kpi-content">
                    <div className="kpi-value" id="statPresent">0</div>
                    <div className="kpi-label">Có mặt hôm nay</div>
                  </div>
                  <div className="kpi-badge cyan" id="statPresentBadge">0%</div>
                </div>
              </div>

              <div className="card-body student-card-body">
                <div className="empty-state">
                  <img
                    className="empty-state-visual"
                    src={emptyStudentsUrl}
                    alt="Minh họa danh sách và tiến độ học sinh"
                    width={640}
                    height={480}
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="empty-state-text">
                    {!classId
                      ? 'Chọn lớp và buổi học để xem học sinh'
                      : 'Chọn buổi học để xem học sinh'}
                  </div>
                </div>
              </div>
            </>
          )}

          {detail && slot && (
            <div className="card-body student-card-body" style={{ padding: 0 }}>
              <StudentWorkspace
                detail={detail}
                slot={slot}
                sessionNumber={currentSessionNumber(slot, activeSlotIndex)}
                mode={mode}
                students={students}
                selectedId={activeStudentId}
                search={search}
                attendance={attendance}
                progress={progress}
                noteDraft={noteDraft}
                persistedNote={activeStudentId ? notes[activeStudentId] || '' : ''}
                assessmentLocked={classRefreshBusy}
                onStudent={selectStudent}
                onSearch={(value) => {
                  if (allowInSlotViewChange()) useClassWorkspaceStore.getState().setSearch(value);
                }}
                onAttendance={(value) => {
                  if (allowInSlotViewChange()) useClassWorkspaceStore.getState().setAttendance(value);
                }}
                onProgress={(value) => {
                  if (allowInSlotViewChange()) useClassWorkspaceStore.getState().setProgress(value);
                }}
                onNoteDraft={setNoteDraft}
                onSaveNote={saveNote}
                onResetFilters={() => {
                  if (allowInSlotViewChange()) useClassWorkspaceStore.getState().resetFilters();
                }}
              />
            </div>
          )}

          <div className="bottom-quote-banner">
            <img
              src={bottomBannerUrl}
              alt="Những lời nhận xét tích cực hôm nay sẽ tạo nên động lực lớn cho ngày mai! Vì một thế hệ học sinh tự tin tỏa sáng"
              loading="lazy"
              decoding="async"
            />
          </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function ClassDetailLoading() {
  return (
    <section className="card class-detail-loading" aria-label="Đang tải dữ liệu lớp" aria-busy="true">
      <span className="skeleton" />
      <span className="skeleton" />
      <span className="skeleton" />
      <span className="skeleton" />
    </section>
  );
}

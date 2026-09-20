import type {
  CheckpointBranch,
  CheckpointGradeResult,
  CheckpointNumber,
  CheckpointScoreInput,
  CheckpointStatusResult,
  CheckpointStudentStatus,
  CheckpointSubmitResult,
  ClassDetail,
  Slot,
  StudentAttendance,
} from '@tool-lms/contracts';
import { appQueryClient } from '../../app/providers';
import { ApiError } from '../../lib/apiError';
import { currentAuthEpoch, createOperationController, isCurrentAuthEpoch, registerWorkflowReset, releaseOperationController } from '../../lib/operationContext';
import { classDetailQuery, isPresent, applyOptimisticClassSubmissions, reconcileClassSubmissionsAfterRefetch } from '../classes/public/domain';
import { generateCheckpointComment, getCheckpointStatus, gradeCheckpointExam, submitCheckpoint } from './api';
import {
  checkpointCommentPlainText,
  cloneCheckpointDraft,
  effectiveCheckpointComment,
  isCheckpointOperationActive,
  useCheckpointStore,
  type CheckpointBatchState,
  type CheckpointContext,
  type CheckpointRowError,
  type CheckpointStatusError,
  type CheckpointStudentDraft,
} from './checkpointStore';

export type CheckpointScope = { detail: ClassDetail; slot: Slot; checkpoint: CheckpointNumber };
export type CheckpointGenerationOptions = { modelId?: string; customModelId?: string; thinkingLevel?: string; apiKey?: string };
export type CheckpointFailure = { studentId: string; phase: 'generation' | 'submission' | 'grading'; message: string };
export type CheckpointGradeOutcome = {
  total: number;
  attempted: number;
  successful: number;
  successfulIds: string[];
  failures: CheckpointFailure[];
  progress: { completed: number; total: number };
};
export type CheckpointGenerationOutcome = {
  total: number;
  attempted: number;
  successful: number;
  successfulIds: string[];
  failures: CheckpointFailure[];
  progress: { completed: number; total: number };
};
export type CheckpointBatchOutcome = {
  total: number;
  attempted: number;
  successful: number;
  successfulIds: string[];
  generationAttempted: number;
  generationSuccessful: number;
  failures: CheckpointFailure[];
  rowErrors: Record<string, CheckpointRowError>;
  progress: { completed: number; total: number };
  reloadRequested: boolean;
  refreshed: boolean;
};
export type CheckpointSingleOutcome = { result: CheckpointSubmitResult; reloadRequested: true; refreshed: boolean };

type ContextSnapshot = CheckpointContext & { authEpoch: number };
type FrozenStudentBase = { studentId: string; attendanceId: string; studentName: string; draft: CheckpointStudentDraft };
type FrozenGradeStudent = FrozenStudentBase & { branch?: CheckpointBranch; expectedTheoryVersion: number; expectedPracticeVersion: number; expectedDescriptionVersion: number };
export type FrozenCheckpointGradeBatch = {
  context: ContextSnapshot;
  options: CheckpointGenerationOptions;
  students: FrozenGradeStudent[];
};
type FrozenGenerationStudent = FrozenStudentBase & { teacherDescription: string; expectedDescriptionVersion: number; expectedCommentVersion: number };
export type FrozenCheckpointGenerationBatch = {
  context: ContextSnapshot;
  options: CheckpointGenerationOptions;
  students: FrozenGenerationStudent[];
};
type FrozenSubmitStudent = FrozenStudentBase & { scores: CheckpointScoreInput; comment: string };
export type FrozenCheckpointScoreBatch = {
  context: ContextSnapshot;
  summary?: string;
  students: FrozenSubmitStudent[];
};
export type FrozenCheckpointFullBatch = {
  context: ContextSnapshot;
  summary: string;
  options: CheckpointGenerationOptions;
  students: Array<FrozenStudentBase & { scores: CheckpointScoreInput; teacherDescription: string; expectedDescriptionVersion: number; expectedCommentVersion: number }>;
};

export type CheckpointExamAvailability = 'none' | 'original' | 'makeup' | 'both';
export type CheckpointStudentStatusView =
  | { state: 'idle' | 'loading' }
  | { state: 'error'; error: CheckpointStatusError }
  | { state: 'no_live_exam' }
  | { state: 'missing_student'; availability: Exclude<CheckpointExamAvailability, 'none'> }
  | { state: 'original_only'; student: CheckpointStudentStatus; selectedBranch: 'original' }
  | { state: 'makeup_only'; student: CheckpointStudentStatus; selectedBranch: 'makeup' }
  | { state: 'both'; student: CheckpointStudentStatus; selectedBranch: CheckpointBranch };

const SCORE_ONLY_FALLBACK = '<p>Học sinh hoàn thành bài kiểm tra checkpoint.</p>';
const FULL_FALLBACK = '<p>Học sinh hoàn thành tốt bài kiểm tra.</p>';
let epoch = 0;
let statusRequestGeneration = 0;
let activeContext: CheckpointContext | null = null;
const operationControllers = new Set<AbortController>();
const passiveStatusControllers = new Set<AbortController>();

export function activateCheckpointContext(classId: string, slotId: string, checkpoint: CheckpointNumber, summary = ''): CheckpointContext {
  if (activeContext?.classId === classId && activeContext.slotId === slotId && activeContext.checkpoint === checkpoint) return activeContext;
  epoch += 1;
  abortAllControllers();
  activeContext = { classId, slotId, checkpoint, epoch };
  useCheckpointStore.getState().activate(activeContext, summary);
  return activeContext;
}

export function hydrateCheckpointContext(context: CheckpointContext, slot: Slot, descriptions: Record<string, string> = {}, summary = slot.summary): void {
  if (isCurrentCheckpointContext(context)) useCheckpointStore.getState().reconcile(context, slot, descriptions, summary);
}

export function deactivateCheckpointContext(context?: CheckpointContext): void {
  if (context && !sameContext(activeContext, context)) return;
  epoch += 1;
  activeContext = null;
  abortAllControllers();
  useCheckpointStore.getState().reset();
}

export function captureCheckpointContext(): ContextSnapshot | null {
  return activeContext ? { ...activeContext, authEpoch: currentAuthEpoch() } : null;
}

export function isCurrentCheckpointContext(context: CheckpointContext & { authEpoch?: number }): boolean {
  return (context.authEpoch === undefined || isCurrentAuthEpoch(context.authEpoch))
    && sameContext(activeContext, context)
    && sameContext(useCheckpointStore.getState().context, context);
}

export async function loadCheckpointSubmissionStatus(scope: CheckpointScope): Promise<CheckpointStatusResult | null> {
  const context = requireScope(scope);
  const { controller, generation } = beginPassiveStatusRequest();
  useCheckpointStore.getState().setStatusLoading(context);
  try {
    const response = await getCheckpointStatus(context.classId, context.checkpoint, controller.signal);
    if (!isCurrentStatusRequest(context, scope, generation)) return null;
    useCheckpointStore.getState().applyStatus(context, response.data);
    return response.data;
  } catch (error) {
    if (!isCurrentStatusRequest(context, scope, generation) || isAbort(error)) return null;
    useCheckpointStore.getState().setStatusError(context, normalizeCheckpointStatusError(error));
    return null;
  } finally {
    releasePassiveStatusController(controller);
  }
}

export function checkpointExamAvailability(result = useCheckpointStore.getState().statusResult): CheckpointExamAvailability {
  if (!result?.original && !result?.makeup) return 'none';
  if (result.original && result.makeup) return 'both';
  return result.original ? 'original' : 'makeup';
}

export function checkpointStudentStatusView(studentId: string): CheckpointStudentStatusView {
  const state = useCheckpointStore.getState();
  if (state.status === 'idle') return { state: 'idle' };
  if (state.status === 'loading') return { state: 'loading' };
  if (state.status === 'error') return { state: 'error', error: state.statusError || { kind: 'upstream', message: 'Không thể tải trạng thái checkpoint.' } };
  const availability = checkpointExamAvailability(state.statusResult);
  if (availability === 'none') return { state: 'no_live_exam' };
  const student = state.statusResult?.students.find((item) => item.studentId === studentId);
  if (!student) return { state: 'missing_student', availability };
  if (student.original && student.makeup) return { state: 'both', student, selectedBranch: state.selectedBranches[studentId] || student.defaultBranch || 'original' };
  if (student.original) return { state: 'original_only', student, selectedBranch: 'original' };
  if (student.makeup) return { state: 'makeup_only', student, selectedBranch: 'makeup' };
  return { state: 'missing_student', availability };
}

export function studentHasGradableSubmission(studentId: string): boolean {
  const view = checkpointStudentStatusView(studentId);
  return view.state === 'original_only' || view.state === 'makeup_only' || view.state === 'both';
}

export async function gradeCheckpointStudent(scope: CheckpointScope, studentId: string, options: CheckpointGenerationOptions = {}): Promise<CheckpointGradeResult> {
  const context = requireScope(scope);
  assertNoActiveOperation();
  const student = requirePresentStudent(scope, studentId);
  if (!studentHasGradableSubmission(studentId)) throw new Error('Học sinh chưa nộp bài kiểm tra trên kiemtra.');
  const draft = requireDraft(studentId);
  const view = checkpointStudentStatusView(studentId);
  const branch = 'selectedBranch' in view ? view.selectedBranch : undefined;
  useCheckpointStore.getState().setRowError(studentId, 'grading', null);
  useCheckpointStore.getState().setGradeBusy(studentId, true);
  const controller = createCheckpointController();
  try {
    const response = await gradeCheckpointExam({
      classId: context.classId,
      slotId: context.slotId,
      studentId,
      checkpoint: context.checkpoint,
      ...(branch ? { branch } : {}),
      ...freezeGenerationOptions(options),
    }, controller.signal);
    assertScope(context, scope);
    useCheckpointStore.getState().applyGradeResult(studentId, response.data, {
      theoryVersion: draft.theoryVersion,
      practiceVersion: draft.practiceVersion,
      descriptionVersion: draft.descriptionVersion,
    });
    return response.data;
  } catch (error) {
    if (isCurrentScope(context, scope) && !isAbort(error)) useCheckpointStore.getState().setRowError(studentId, 'grading', errorText(error));
    throw error;
  } finally {
    releaseCheckpointController(controller);
    if (isCurrentCheckpointContext(context)) useCheckpointStore.getState().setGradeBusy(studentId, false);
  }
}

export function captureCheckpointGradeBatch(scope: CheckpointScope, options: CheckpointGenerationOptions = {}): FrozenCheckpointGradeBatch {
  const context = requireScope(scope);
  assertNoActiveOperation();
  if (useCheckpointStore.getState().status !== 'success') throw new Error('Đang tải trạng thái nộp bài Checkpoint.');
  const students = presentStudents(scope).filter((student) => studentHasGradableSubmission(student.studentId));
  if (!students.length) throw new Error('Không có học sinh có mặt đã nộp bài Checkpoint');
  return {
    context: { ...context },
    options: freezeGenerationOptions(options),
    students: students.map((student) => {
      const draft = requireDraft(student.studentId);
      const view = checkpointStudentStatusView(student.studentId);
      return {
        studentId: student.studentId,
        attendanceId: student.id,
        studentName: student.displayName,
        draft: cloneCheckpointDraft(draft),
        ...('selectedBranch' in view ? { branch: view.selectedBranch } : {}),
        expectedTheoryVersion: draft.theoryVersion,
        expectedPracticeVersion: draft.practiceVersion,
        expectedDescriptionVersion: draft.descriptionVersion,
      };
    }),
  };
}

export async function gradeCheckpointBatch(scope: CheckpointScope, frozen: FrozenCheckpointGradeBatch): Promise<CheckpointGradeOutcome> {
  const context = requireFrozenScope(scope, frozen.context);
  assertNoActiveOperation();
  const scopeIds = frozen.students.map((student) => student.studentId);
  startBatch('grade', 'grading', scopeIds, frozen.students.length, 0, frozen.students.length);
  const controller = createCheckpointController();
  const successfulIds: string[] = [];
  const failures: CheckpointFailure[] = [];
  let attempted = 0;
  try {
    await runWithConcurrency(frozen.students, 2, async (student) => {
      assertScope(context, scope);
      useCheckpointStore.getState().updateBatch({ currentStudentId: student.studentId });
      try {
        const response = await gradeCheckpointExam({
          classId: context.classId,
          slotId: context.slotId,
          studentId: student.studentId,
          checkpoint: context.checkpoint,
          ...(student.branch ? { branch: student.branch } : {}),
          ...frozen.options,
        }, controller.signal);
        assertScope(context, scope);
        useCheckpointStore.getState().applyGradeResult(student.studentId, response.data, {
          theoryVersion: student.expectedTheoryVersion,
          practiceVersion: student.expectedPracticeVersion,
          descriptionVersion: student.expectedDescriptionVersion,
        });
        successfulIds.push(student.studentId);
      } catch (error) {
        if (isAbort(error)) throw error;
        if (isCurrentScope(context, scope)) recordFailure(student.studentId, 'grading', errorText(error), failures);
      } finally {
        if (isCurrentScope(context, scope)) {
          attempted += 1;
          updateBatchProgress({ completed: attempted, gradingAttempted: attempted, gradingSuccessful: successfulIds.length, successful: successfulIds.length });
        }
      }
    });
    assertScope(context, scope);
    return { total: frozen.students.length, attempted, successful: successfulIds.length, successfulIds, failures, progress: { completed: attempted, total: frozen.students.length } };
  } finally {
    releaseCheckpointController(controller);
    if (isCurrentCheckpointContext(context)) useCheckpointStore.getState().finishBatch();
  }
}

export async function generateCheckpointStudent(scope: CheckpointScope, studentId: string, options: CheckpointGenerationOptions = {}): Promise<boolean> {
  const context = requireScope(scope);
  assertNoActiveOperation();
  const student = requirePresentStudent(scope, studentId);
  const draft = requireDraft(studentId);
  const frozen = freezeGenerationStudent(student, draft);
  const frozenOptions = freezeGenerationOptions(options);
  useCheckpointStore.getState().setRowError(studentId, 'generation', null);
  useCheckpointStore.getState().setGenerationBusy(studentId, true);
  const controller = createCheckpointController();
  try {
    const response = await requestGeneratedComment(context, frozen, frozenOptions, controller.signal);
    assertScope(context, scope);
    return useCheckpointStore.getState().applyGeneratedComment(studentId, response, frozen.expectedDescriptionVersion, frozen.expectedCommentVersion);
  } catch (error) {
    if (isCurrentScope(context, scope) && !isAbort(error)) useCheckpointStore.getState().setRowError(studentId, 'generation', errorText(error));
    throw error;
  } finally {
    releaseCheckpointController(controller);
    if (isCurrentCheckpointContext(context)) useCheckpointStore.getState().setGenerationBusy(studentId, false);
  }
}

export function captureCheckpointGenerationBatch(scope: CheckpointScope, options: CheckpointGenerationOptions = {}): FrozenCheckpointGenerationBatch {
  const context = requireScope(scope);
  assertNoActiveOperation();
  const students = presentStudents(scope).filter((student) => !requireDraft(student.studentId).generatedComment.trim());
  if (!students.length) throw new Error('Tất cả học sinh có mặt đã có nhận xét AI checkpoint');
  return {
    context: { ...context },
    options: freezeGenerationOptions(options),
    students: students.map((student) => freezeGenerationStudent(student, requireDraft(student.studentId))),
  };
}

export async function generateCheckpointBatch(scope: CheckpointScope, frozen: FrozenCheckpointGenerationBatch): Promise<CheckpointGenerationOutcome> {
  const context = requireFrozenScope(scope, frozen.context);
  assertNoActiveOperation();
  const scopeIds = frozen.students.map((student) => student.studentId);
  startBatch('generate', 'generating', scopeIds, frozen.students.length, frozen.students.length);
  const controller = createCheckpointController();
  const successfulIds: string[] = [];
  const failures: CheckpointFailure[] = [];
  let attempted = 0;
  try {
    await runWithConcurrency(frozen.students, 3, async (student) => {
      assertScope(context, scope);
      try {
        const comment = await requestGeneratedComment(context, student, frozen.options, controller.signal);
        assertScope(context, scope);
        useCheckpointStore.getState().applyGeneratedComment(student.studentId, comment, student.expectedDescriptionVersion, student.expectedCommentVersion);
        successfulIds.push(student.studentId);
      } catch (error) {
        if (isAbort(error)) throw error;
        if (isCurrentScope(context, scope)) recordFailure(student.studentId, 'generation', errorText(error), failures);
      } finally {
        if (isCurrentScope(context, scope)) {
          attempted += 1;
          updateBatchProgress({ completed: attempted, generationAttempted: attempted, generationSuccessful: successfulIds.length, successful: successfulIds.length });
        }
      }
    });
    assertScope(context, scope);
    return { total: frozen.students.length, attempted, successful: successfulIds.length, successfulIds, failures, progress: { completed: attempted, total: frozen.students.length } };
  } finally {
    releaseCheckpointController(controller);
    if (isCurrentCheckpointContext(context)) useCheckpointStore.getState().finishBatch();
  }
}

export function parseCheckpointScoreInputs(theoryInput: string, practiceInput: string): CheckpointScoreInput {
  const theoryRaw = theoryInput.trim();
  const practiceRaw = practiceInput.trim();
  if (!theoryRaw && !practiceRaw) return { strategy: 'auto' };
  return {
    strategy: 'explicit',
    theoryScore: parseScore(theoryRaw, 'Điểm lý thuyết'),
    practiceScore: parseScore(practiceRaw, 'Điểm thực hành'),
  };
}

export async function submitCheckpointScoreOnlySingle(scope: CheckpointScope, studentId: string, summary = useCheckpointStore.getState().summaryDraft): Promise<CheckpointSingleOutcome> {
  const context = requireScope(scope);
  assertNoActiveOperation();
  const student = requirePresentStudent(scope, studentId);
  const draft = cloneCheckpointDraft(requireDraft(studentId));
  const scores = parseCheckpointScoreInputs(draft.theoryInput, draft.practiceInput);
  const comment = scoreOnlyComment(draft);
  useCheckpointStore.getState().setRowError(studentId, 'submission', null);
  useCheckpointStore.getState().setSubmitBusy(studentId, true);
  const controller = createCheckpointController();
  try {
    const response = await submitCheckpoint(context.slotId, {
      mode: 'score_only',
      classId: context.classId,
      studentId,
      attendanceId: student.id,
      summaryMode: 'optional',
      ...(summary.trim() ? { summary } : {}),
      scores,
      comment,
    }, controller.signal);
    assertScope(context, scope);
    useCheckpointStore.getState().applySubmitSuccess(studentId, response.data, draft, false);
    applyOptimisticClassSubmissions({ classId: context.classId, slotId: context.slotId, studentIds: [studentId], mode: 'checkpoint' });
    const refreshed = await refetchCurrentClass(context, [studentId]);
    return { result: response.data, reloadRequested: true, refreshed };
  } catch (error) {
    if (isCurrentScope(context, scope) && !isAbort(error)) useCheckpointStore.getState().setRowError(studentId, 'submission', errorText(error));
    throw error;
  } finally {
    releaseCheckpointController(controller);
    if (isCurrentCheckpointContext(context)) useCheckpointStore.getState().setSubmitBusy(studentId, false);
  }
}

export async function submitCheckpointFullSingle(scope: CheckpointScope, studentId: string, summary = useCheckpointStore.getState().summaryDraft): Promise<CheckpointSingleOutcome> {
  const context = requireScope(scope);
  assertNoActiveOperation();
  const student = requirePresentStudent(scope, studentId);
  if (!summary.trim()) throw new Error('Vui lòng nhập tổng kết buổi học');
  const draft = cloneCheckpointDraft(requireDraft(studentId));
  const comment = effectiveCheckpointComment(draft);
  if (!comment.trim()) throw new Error('Vui lòng nhập nhận xét hoặc tạo nhận xét AI trước khi submit');
  const scores = parseCheckpointScoreInputs(draft.theoryInput, draft.practiceInput);
  useCheckpointStore.getState().setRowError(studentId, 'submission', null);
  useCheckpointStore.getState().setSubmitBusy(studentId, true);
  const controller = createCheckpointController();
  try {
    const response = await submitCheckpoint(context.slotId, {
      mode: 'full',
      classId: context.classId,
      studentId,
      attendanceId: student.id,
      summaryMode: 'required',
      summary,
      scores,
      comment,
    }, controller.signal);
    assertScope(context, scope);
    useCheckpointStore.getState().applySubmitSuccess(studentId, response.data, draft, true);
    applyOptimisticClassSubmissions({ classId: context.classId, slotId: context.slotId, studentIds: [studentId], mode: 'checkpoint' });
    const refreshed = await refetchCurrentClass(context, [studentId]);
    return { result: response.data, reloadRequested: true, refreshed };
  } catch (error) {
    if (isCurrentScope(context, scope) && !isAbort(error)) useCheckpointStore.getState().setRowError(studentId, 'submission', errorText(error));
    throw error;
  } finally {
    releaseCheckpointController(controller);
    if (isCurrentCheckpointContext(context)) useCheckpointStore.getState().setSubmitBusy(studentId, false);
  }
}

export function captureCheckpointScoreOnlyBatch(scope: CheckpointScope, summary = useCheckpointStore.getState().summaryDraft): FrozenCheckpointScoreBatch {
  const context = requireScope(scope);
  assertNoActiveOperation();
  const students = presentStudents(scope);
  if (!students.length) throw new Error('Không có học sinh có mặt!');
  return {
    context: { ...context },
    ...(summary.trim() ? { summary } : {}),
    students: students.map((student) => {
      const draft = cloneCheckpointDraft(requireDraft(student.studentId));
      return {
        studentId: student.studentId,
        attendanceId: student.id,
        studentName: student.displayName,
        draft,
        scores: parseCheckpointScoreInputs(draft.theoryInput, draft.practiceInput),
        comment: scoreOnlyComment(draft),
      };
    }),
  };
}

export async function submitCheckpointScoreOnlyBatch(scope: CheckpointScope, frozen: FrozenCheckpointScoreBatch): Promise<CheckpointBatchOutcome> {
  const context = requireFrozenScope(scope, frozen.context);
  assertNoActiveOperation();
  return submitFrozenBatch(scope, context, 'score_only', frozen.students, frozen.summary);
}

export function captureCheckpointFullBatch(scope: CheckpointScope, options: CheckpointGenerationOptions = {}, summary = useCheckpointStore.getState().summaryDraft): FrozenCheckpointFullBatch {
  const context = requireScope(scope);
  assertNoActiveOperation();
  if (!summary.trim()) throw new Error('Vui lòng nhập tổng kết buổi học');
  const students = presentStudents(scope);
  if (!students.length) throw new Error('Không có học sinh có mặt!');
  return {
    context: { ...context },
    summary,
    options: freezeGenerationOptions(options),
    students: students.map((student) => {
      const draft = cloneCheckpointDraft(requireDraft(student.studentId));
      return {
        studentId: student.studentId,
        attendanceId: student.id,
        studentName: student.displayName,
        draft,
        scores: parseCheckpointScoreInputs(draft.theoryInput, draft.practiceInput),
        teacherDescription: draft.teacherDescription,
        expectedDescriptionVersion: draft.descriptionVersion,
        expectedCommentVersion: draft.commentVersion,
      };
    }),
  };
}

export async function submitCheckpointFullBatch(scope: CheckpointScope, frozen: FrozenCheckpointFullBatch): Promise<CheckpointBatchOutcome> {
  const context = requireFrozenScope(scope, frozen.context);
  assertNoActiveOperation();
  const generationTargets = frozen.students.filter((student) => !student.draft.generatedComment.trim());
  const totalProgress = generationTargets.length + frozen.students.length;
  const scopeIds = frozen.students.map((student) => student.studentId);
  startBatch('full', generationTargets.length ? 'generating' : 'submitting', scopeIds, totalProgress, generationTargets.length);
  const controller = createCheckpointController();
  const generated = new Map<string, string>();
  const failures: CheckpointFailure[] = [];
  const successfulIds: string[] = [];
  let generationAttempted = 0;
  let generationSuccessful = 0;
  let attempted = 0;
  try {
    await runWithConcurrency(generationTargets, 3, async (student) => {
      assertScope(context, scope);
      try {
        const comment = await requestGeneratedComment(context, student, frozen.options, controller.signal);
        assertScope(context, scope);
        generated.set(student.studentId, comment);
        generationSuccessful += 1;
        useCheckpointStore.getState().applyGeneratedComment(student.studentId, comment, student.expectedDescriptionVersion, student.expectedCommentVersion);
      } catch (error) {
        if (isAbort(error)) throw error;
        if (isCurrentScope(context, scope)) recordFailure(student.studentId, 'generation', errorText(error), failures);
      } finally {
        if (isCurrentScope(context, scope)) {
          generationAttempted += 1;
          updateBatchProgress({ completed: generationAttempted, generationAttempted, generationSuccessful });
        }
      }
    });
    assertScope(context, scope);
    updateBatchProgress({ phase: 'submitting' });
    for (let index = 0; index < frozen.students.length; index += 1) {
      assertScope(context, scope);
      const student = frozen.students[index];
      attempted += 1;
      if (isCurrentScope(context, scope)) updateBatchProgress({ currentStudentId: student.studentId });
      const generatedComment = generated.get(student.studentId);
      const comment = generatedComment || fullBatchComment(student.draft);
      let submittedDraft = student.draft;
      const live = useCheckpointStore.getState().drafts[student.studentId];
      if (generatedComment && live?.generatedComment === generatedComment) {
        submittedDraft = {
          ...student.draft,
          generatedComment,
          currentComment: checkpointCommentPlainText(generatedComment),
          provenance: 'generated',
          commentVersion: live.commentVersion,
        };
      }
      try {
        const response = await submitCheckpoint(context.slotId, {
          mode: 'full',
          classId: context.classId,
          studentId: student.studentId,
          attendanceId: student.attendanceId,
          summaryMode: 'optional',
          ...(index === 0 ? { summary: frozen.summary } : {}),
          scores: student.scores,
          comment,
        }, controller.signal);
        assertScope(context, scope);
        successfulIds.push(student.studentId);
        useCheckpointStore.getState().applySubmitSuccess(student.studentId, response.data, submittedDraft, true);
      } catch (error) {
        if (isAbort(error)) throw error;
        if (isCurrentScope(context, scope)) recordFailure(student.studentId, 'submission', errorText(error), failures);
      } finally {
        if (isCurrentScope(context, scope)) updateBatchProgress({
          completed: generationAttempted + attempted,
          submissionAttempted: attempted,
          submissionSuccessful: successfulIds.length,
          successful: successfulIds.length,
        });
      }
    }
    assertScope(context, scope);
    updateBatchProgress({ phase: 'reloading' });
    if (successfulIds.length) applyOptimisticClassSubmissions({ classId: context.classId, slotId: context.slotId, studentIds: successfulIds, mode: 'checkpoint' });
    const refreshed = await refetchCurrentClass(context, successfulIds);
    const rowErrors = rowErrorsFromFailures(failures);
    return {
      total: frozen.students.length,
      attempted,
      successful: successfulIds.length,
      successfulIds,
      generationAttempted,
      generationSuccessful,
      failures,
      rowErrors,
      progress: { completed: generationAttempted + attempted, total: totalProgress },
      reloadRequested: attempted > 0,
      refreshed,
    };
  } finally {
    releaseCheckpointController(controller);
    if (isCurrentCheckpointContext(context)) useCheckpointStore.getState().finishBatch();
  }
}

async function submitFrozenBatch(
  scope: CheckpointScope,
  context: ContextSnapshot,
  mode: 'score_only',
  students: FrozenSubmitStudent[],
  summary?: string,
): Promise<CheckpointBatchOutcome> {
  const scopeIds = students.map((student) => student.studentId);
  startBatch('score_only', 'submitting', scopeIds, students.length, 0);
  const controller = createCheckpointController();
  const failures: CheckpointFailure[] = [];
  const successfulIds: string[] = [];
  let attempted = 0;
  try {
    for (let index = 0; index < students.length; index += 1) {
      assertScope(context, scope);
      const student = students[index];
      attempted += 1;
      if (isCurrentScope(context, scope)) updateBatchProgress({ currentStudentId: student.studentId });
      try {
        const response = await submitCheckpoint(context.slotId, {
          mode,
          classId: context.classId,
          studentId: student.studentId,
          attendanceId: student.attendanceId,
          summaryMode: 'optional',
          ...(index === 0 && summary ? { summary } : {}),
          scores: student.scores,
          comment: student.comment,
        }, controller.signal);
        assertScope(context, scope);
        successfulIds.push(student.studentId);
        useCheckpointStore.getState().applySubmitSuccess(student.studentId, response.data, student.draft, false);
      } catch (error) {
        if (isAbort(error)) throw error;
        if (isCurrentScope(context, scope)) recordFailure(student.studentId, 'submission', errorText(error), failures);
      } finally {
        if (isCurrentScope(context, scope)) updateBatchProgress({ completed: attempted, submissionAttempted: attempted, submissionSuccessful: successfulIds.length, successful: successfulIds.length });
      }
    }
    assertScope(context, scope);
    updateBatchProgress({ phase: 'reloading' });
    if (successfulIds.length) applyOptimisticClassSubmissions({ classId: context.classId, slotId: context.slotId, studentIds: successfulIds, mode: 'checkpoint' });
    const refreshed = await refetchCurrentClass(context, successfulIds);
    return {
      total: students.length,
      attempted,
      successful: successfulIds.length,
      successfulIds,
      generationAttempted: 0,
      generationSuccessful: 0,
      failures,
      rowErrors: rowErrorsFromFailures(failures),
      progress: { completed: attempted, total: students.length },
      reloadRequested: attempted > 0,
      refreshed,
    };
  } finally {
    releaseCheckpointController(controller);
    if (isCurrentCheckpointContext(context)) useCheckpointStore.getState().finishBatch();
  }
}

function freezeGenerationStudent(student: StudentAttendance, draft: CheckpointStudentDraft): FrozenGenerationStudent {
  return {
    studentId: student.studentId,
    attendanceId: student.id,
    studentName: student.displayName,
    draft: cloneCheckpointDraft(draft),
    teacherDescription: draft.teacherDescription,
    expectedDescriptionVersion: draft.descriptionVersion,
    expectedCommentVersion: draft.commentVersion,
  };
}

async function requestGeneratedComment(context: ContextSnapshot, student: FrozenGenerationStudent, options: CheckpointGenerationOptions, signal: AbortSignal): Promise<string> {
  const response = await generateCheckpointComment({
    classId: context.classId,
    slotId: context.slotId,
    studentId: student.studentId,
    teacherDescription: student.teacherDescription,
    ...options,
  }, signal);
  return response.data.comment;
}

function freezeGenerationOptions(options: CheckpointGenerationOptions): CheckpointGenerationOptions {
  return {
    ...(options.modelId?.trim() ? { modelId: options.modelId.trim() } : {}),
    ...(options.customModelId?.trim() ? { customModelId: options.customModelId.trim() } : {}),
    ...(options.thinkingLevel?.trim() ? { thinkingLevel: options.thinkingLevel } : {}),
    ...(options.apiKey?.trim() ? { apiKey: options.apiKey } : {}),
  };
}

function scoreOnlyComment(draft: CheckpointStudentDraft): string {
  return effectiveCheckpointComment(draft).trim() ? effectiveCheckpointComment(draft) : SCORE_ONLY_FALLBACK;
}
function fullBatchComment(draft: CheckpointStudentDraft): string {
  return effectiveCheckpointComment(draft).trim() ? effectiveCheckpointComment(draft) : FULL_FALLBACK;
}
function parseScore(raw: string, label: string): number | null {
  if (!raw) return null;
  const score = Number(raw);
  if (!Number.isFinite(score) || score < 0 || score > 5) throw new Error(`${label} phải nằm trong khoảng 0-5`);
  if (Math.abs(score * 2 - Math.round(score * 2)) > 0.0001) throw new Error(`${label} phải nhập theo bước 0.5`);
  return score;
}
function presentStudents(scope: CheckpointScope): StudentAttendance[] { return scope.slot.studentAttendance.filter(isPresent); }
function requirePresentStudent(scope: CheckpointScope, studentId: string): StudentAttendance {
  const student = scope.slot.studentAttendance.find((item) => item.studentId === studentId);
  if (!student) throw new Error('Không tìm thấy học sinh trong buổi Checkpoint hiện tại');
  if (!isPresent(student)) throw new Error('Học sinh vắng — không chấm Checkpoint');
  return student;
}
function requireDraft(studentId: string): CheckpointStudentDraft {
  const draft = useCheckpointStore.getState().drafts[studentId];
  if (!draft) throw new Error('Dữ liệu Checkpoint của học sinh chưa sẵn sàng');
  return draft;
}
function requireScope(scope: CheckpointScope): ContextSnapshot {
  const context = captureCheckpointContext();
  if (!context) throw new Error('Chưa chọn lớp hoặc buổi Checkpoint');
  assertScope(context, scope);
  return context;
}
function requireFrozenScope(scope: CheckpointScope, frozen: ContextSnapshot): ContextSnapshot {
  const context = requireScope(scope);
  if (!sameContext(context, frozen) || context.authEpoch !== frozen.authEpoch) throw new DOMException('Checkpoint context changed', 'AbortError');
  return context;
}
function assertScope(context: ContextSnapshot, scope: CheckpointScope): void {
  if (!isCurrentScope(context, scope)) throw new DOMException('Checkpoint context changed', 'AbortError');
}
function isCurrentScope(context: ContextSnapshot, scope: CheckpointScope): boolean {
  return isCurrentCheckpointContext(context) && scope.detail.id === context.classId && scope.slot.id === context.slotId && scope.checkpoint === context.checkpoint;
}
function assertNoActiveOperation(): void { if (isCheckpointOperationActive()) throw new Error('Vui lòng đợi thao tác Checkpoint đang chạy hoàn tất'); }
function sameContext(left: CheckpointContext | null, right: CheckpointContext): boolean {
  return left?.classId === right.classId && left.slotId === right.slotId && left.checkpoint === right.checkpoint && left.epoch === right.epoch;
}
function startBatch(kind: CheckpointBatchState['kind'], phase: CheckpointBatchState['phase'], scopeIds: string[], total: number, generationTotal: number, gradingTotal = 0): void {
  useCheckpointStore.getState().startBatch({ kind, phase, scopeIds: [...scopeIds], total, completed: 0, successful: 0, generationTotal, generationAttempted: 0, generationSuccessful: 0, gradingTotal, gradingAttempted: 0, gradingSuccessful: 0, submissionAttempted: 0, submissionSuccessful: 0, rowErrors: {}, currentStudentId: null });
  for (const studentId of scopeIds) {
    useCheckpointStore.getState().setRowError(studentId, 'generation', null);
    useCheckpointStore.getState().setRowError(studentId, 'submission', null);
    useCheckpointStore.getState().setRowError(studentId, 'grading', null);
  }
}
function updateBatchProgress(update: Parameters<ReturnType<typeof useCheckpointStore.getState>['updateBatch']>[0]): void { useCheckpointStore.getState().updateBatch(update); }
function recordFailure(studentId: string, phase: CheckpointFailure['phase'], message: string, failures: CheckpointFailure[]): void {
  failures.push({ studentId, phase, message });
  useCheckpointStore.getState().setRowError(studentId, phase, message);
  useCheckpointStore.getState().updateBatch({ error: { studentId, phase, message } });
}
function rowErrorsFromFailures(failures: CheckpointFailure[]): Record<string, CheckpointRowError> {
  const rows: Record<string, CheckpointRowError> = {};
  for (const failure of failures) rows[failure.studentId] = { ...(rows[failure.studentId] || {}), [failure.phase]: failure.message };
  return rows;
}
async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
}
function createCheckpointController(): AbortController {
  const controller = createOperationController();
  operationControllers.add(controller);
  controller.signal.addEventListener('abort', () => operationControllers.delete(controller), { once: true });
  return controller;
}
function releaseCheckpointController(controller: AbortController): void { operationControllers.delete(controller); releaseOperationController(controller); }
function beginPassiveStatusRequest(): { controller: AbortController; generation: number } {
  statusRequestGeneration += 1;
  for (const active of passiveStatusControllers) active.abort();
  passiveStatusControllers.clear();
  const controller = new AbortController();
  passiveStatusControllers.add(controller);
  controller.signal.addEventListener('abort', () => passiveStatusControllers.delete(controller), { once: true });
  return { controller, generation: statusRequestGeneration };
}
function isCurrentStatusRequest(context: ContextSnapshot, scope: CheckpointScope, generation: number): boolean {
  return generation === statusRequestGeneration && isCurrentScope(context, scope);
}
function releasePassiveStatusController(controller: AbortController): void { passiveStatusControllers.delete(controller); }
function abortAllControllers(): void {
  statusRequestGeneration += 1;
  for (const controller of operationControllers) controller.abort();
  for (const controller of passiveStatusControllers) controller.abort();
  operationControllers.clear();
  passiveStatusControllers.clear();
}
function normalizeCheckpointStatusError(error: unknown): CheckpointStatusError {
  const message = errorText(error);
  if (error instanceof ApiError && error.status === 504) return { kind: 'timeout', message };
  if (error instanceof ApiError && error.status < 400) return { kind: 'malformed', message };
  if (/quá thời gian|timeout/i.test(message)) return { kind: 'timeout', message };
  if (/không đúng định dạng|không hợp lệ|malformed/i.test(message)) return { kind: 'malformed', message };
  return { kind: 'upstream', message };
}
function isAbort(error: unknown): boolean { return error instanceof DOMException && error.name === 'AbortError'; }
function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error || 'Lỗi không xác định'); }
async function refetchCurrentClass(context: ContextSnapshot, successfulIds: string[] = []): Promise<boolean> {
  if (!isCurrentCheckpointContext(context)) return false;
  try {
    await appQueryClient().refetchQueries({ queryKey: classDetailQuery(context.classId).queryKey, exact: true });
    if (isCurrentCheckpointContext(context)) {
      reconcileClassSubmissionsAfterRefetch({ classId: context.classId, slotId: context.slotId, studentIds: successfulIds, mode: 'checkpoint' });
    }
    return isCurrentCheckpointContext(context);
  } catch {
    if (isCurrentCheckpointContext(context) && successfulIds.length) {
      applyOptimisticClassSubmissions({ classId: context.classId, slotId: context.slotId, studentIds: successfulIds, mode: 'checkpoint' });
    }
    return false;
  }
}

export function resetCheckpointController(): void {
  epoch += 1;
  activeContext = null;
  abortAllControllers();
}
registerWorkflowReset(resetCheckpointController);

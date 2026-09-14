import type {
  ClassDetail,
  CommentGenerationMeta,
  CommentHomeworkStatus,
  GenerateCommentRequest,
  LearningLevel,
  Slot,
  StudentAttendance,
} from '@tool-lms/contracts';
import { appQueryClient } from '../../app/providers';
import { currentAuthEpoch, createOperationController, isCurrentAuthEpoch, registerWorkflowReset, releaseOperationController } from '../../lib/operationContext';
import { readAiApiKey } from '../../lib/persistence';
import { normalizedAssessmentDraft } from '../assessments/public/selectors';
import { captureAssessmentContext, isCurrentAssessmentContext, saveFullAssessment, waitForAssessmentSaves } from '../assessments/public/controller';
import { useAssessmentStore } from '../assessments/public/store';
import { classDetailQuery } from '../classes/public/domain';
import { useClassWorkspaceStore } from '../classes/public/domain';
import { configQuery } from '../configuration/public/api';
import { generateComment, getCommentHomework, saveSummary, submitComment } from './api';
import { useCommentStore, type CommentBatchState, type CommentContext, type CommentDraft, type CommentGenerationConfig } from './commentStore';
import { cleanComment, commentAttendanceStatus, getStudentCallName, hasUnsavedComments, homeworkStatuses, isCommentBusy, pastCommentSlots } from './selectors';

export type RegularCommentScope = {
  detail: ClassDetail;
  slot: Slot;
  sessionNumber: number;
  selectedStudentId: string | null;
};
export type BatchOutcome = { total: number; successfulIds: string[]; failures: Array<{ studentId: string; message: string }>; safeTemplateCount: number };
export type SubmitOutcome = BatchOutcome & { refreshed: boolean };

type ContextSnapshot = CommentContext & { authEpoch: number };
type StudentSnapshot = {
  attendanceId: string;
  studentId: string;
  studentName: string;
  studentCallName: string;
  attendanceStatus: ReturnType<typeof commentAttendanceStatus>;
  isLate: boolean;
  learningLevel: LearningLevel;
  teacherNote: string;
  pastSlots: ReturnType<typeof pastCommentSlots>;
  homeworkStatus: CommentHomeworkStatus | null;
  sessionNumber: number;
};

let epoch = 0;
let activeContext: CommentContext | null = null;
const contextControllers = new Set<AbortController>();

export function activateCommentContext(classId: string, slotId: string, summary: string): CommentContext {
  if (activeContext?.classId === classId && activeContext.slotId === slotId) return activeContext;
  epoch += 1;
  abortCommentOperations();
  activeContext = { classId, slotId, epoch };
  useCommentStore.getState().activate(activeContext, summary);
  return activeContext;
}

export function deactivateCommentContext(context?: CommentContext): void {
  if (context && !sameContext(activeContext, context)) return;
  epoch += 1;
  activeContext = null;
  abortCommentOperations();
  useCommentStore.getState().reset();
}

export function captureCommentContext(): ContextSnapshot | null {
  return activeContext ? { ...activeContext, authEpoch: currentAuthEpoch() } : null;
}

export function isCurrentCommentContext(context: ContextSnapshot | CommentContext): boolean {
  const authMatches = 'authEpoch' in context ? isCurrentAuthEpoch(context.authEpoch) : true;
  return authMatches && sameContext(activeContext, context) && sameContext(useCommentStore.getState().context, context);
}

export function hasUnsavedCommentWork(): boolean { return hasUnsavedComments(useCommentStore.getState()); }
export function isCommentOperationActive(): boolean { return isCommentBusy(useCommentStore.getState()); }

export async function generateSingleComment(scope: RegularCommentScope, studentId: string): Promise<CommentGenerationMeta> {
  const context = requireScope(scope);
  if (isCommentOperationActive()) throw new Error('Vui lòng đợi thao tác đang chạy hoàn tất');
  const student = requireStudent(scope, studentId);
  useCommentStore.getState().setStudentBusy(studentId, true);
  useCommentStore.getState().setError(studentId, null);
  const controller = createCommentController();
  try {
    const config = await currentGenerationConfig();
    assertCurrentSingle(context, scope, studentId);
    const summary = useCommentStore.getState().summaryDraft.trim();
    await waitUntilAssessmentsReady(context);
    await waitForAssessmentSaves(studentId);
    assertCurrentSingle(context, scope, studentId);
    await saveFullAssessment(studentId);
    assertCurrentSingle(context, scope, studentId);
    const homework = await loadHomeworkFacts(scope, controller.signal);
    assertCurrentSingle(context, scope, studentId);
    const snapshot = snapshotStudent(scope, student, homework[studentId] || null);
    const response = await generateComment(buildGenerationRequest(context, snapshot, config, summary), controller.signal);
    if (!isCurrentSingle(context, scope, studentId)) return response.data.meta;
    useCommentStore.getState().setDraft(studentId, { content: cleanComment(response.data.comment), kind: 'generated', generationMeta: response.data.meta });
    return response.data.meta;
  } catch (error) {
    if (isCurrentSingle(context, scope, studentId) && !isAbort(error)) useCommentStore.getState().setError(studentId, errorText(error));
    throw error;
  } finally {
    releaseCommentController(controller);
    if (isCurrentCommentContext(context)) useCommentStore.getState().setStudentBusy(studentId, false);
  }
}

export async function generateBatchComments(scope: RegularCommentScope, requestedIds: string[]): Promise<BatchOutcome> {
  const context = requireScope(scope);
  if (isCommentOperationActive()) throw new Error('Đang có thao tác nhận xét khác chạy');
  const scopeIds = unique(requestedIds).filter((id) => scope.slot.studentAttendance.some((student) => student.studentId === id && isPresent(student)));
  if (!scopeIds.length) throw new Error('Không có học sinh phù hợp để tạo nhận xét');
  const initial: CommentBatchState = { kind: 'generate', phase: 'persisting', scopeIds, total: scopeIds.length, completed: 0, successful: 0, safeTemplateCount: 0, failures: {}, currentStudentId: null };
  useCommentStore.getState().startBatch(initial);
  scopeIds.forEach((id) => useCommentStore.getState().setError(id, null));
  const controller = createCommentController();
  const successfulIds: string[] = [];
  const failures: Array<{ studentId: string; message: string }> = [];
  let safeTemplateCount = 0;
  try {
    const config = await currentGenerationConfig();
    assertScope(context, scope);
    const summary = useCommentStore.getState().summaryDraft.trim();
    await waitUntilAssessmentsReady(context);
    const persisted = new Set<string>();
    await runWithConcurrency(scopeIds, 3, async (studentId) => {
      try {
        if (isCurrentCommentContext(context)) useCommentStore.getState().updateBatch({ currentStudentId: studentId });
        await waitForAssessmentSaves(studentId);
        assertScope(context, scope);
        await saveFullAssessment(studentId);
        persisted.add(studentId);
      } catch (error) {
        if (isAbort(error)) throw error;
        recordFailure(studentId, errorText(error), failures);
      } finally {
        if (isCurrentCommentContext(context)) incrementBatch();
      }
    });
    assertScope(context, scope);
    const homework = await loadHomeworkFacts(scope, controller.signal);
    assertScope(context, scope);
    const snapshots = scopeIds.filter((studentId) => persisted.has(studentId)).map((studentId) => snapshotStudent(scope, requireStudent(scope, studentId), homework[studentId] || null));
    useCommentStore.getState().updateBatch({ phase: 'generating', total: scopeIds.length, completed: failures.length });
    for (let index = 0; index < snapshots.length; index += 3) {
      assertScope(context, scope);
      const group = snapshots.slice(index, index + 3);
      await Promise.all(group.map(async (snapshot) => {
        try {
          if (isCurrentCommentContext(context)) useCommentStore.getState().updateBatch({ currentStudentId: snapshot.studentId });
          const response = await generateComment(buildGenerationRequest(context, snapshot, config, summary), controller.signal);
          if (!isCurrentCommentContext(context)) return;
          useCommentStore.getState().setDraft(snapshot.studentId, { content: cleanComment(response.data.comment), kind: 'generated', generationMeta: response.data.meta });
          successfulIds.push(snapshot.studentId);
          if (response.data.meta.source === 'safe_template') safeTemplateCount += 1;
          useCommentStore.getState().updateBatch({ successful: successfulIds.length, safeTemplateCount });
        } catch (error) {
          if (isAbort(error)) throw error;
          if (isCurrentCommentContext(context)) recordFailure(snapshot.studentId, errorText(error), failures);
        } finally {
          if (isCurrentCommentContext(context)) incrementBatch();
        }
      }));
    }
    assertScope(context, scope);
    return { total: scopeIds.length, successfulIds, failures, safeTemplateCount };
  } finally {
    releaseCommentController(controller);
    if (isCurrentCommentContext(context)) useCommentStore.getState().finishBatch();
  }
}

export async function saveSessionSummary(scope: RegularCommentScope): Promise<void> {
  const capturedContext = captureCommentContext();
  const classId = capturedContext ? capturedContext.classId : scope?.detail?.id;
  const slotId = capturedContext ? capturedContext.slotId : scope?.slot?.id;
  if (!classId || !slotId) throw new Error('Chưa chọn lớp hoặc buổi học');
  if (capturedContext) assertScope(capturedContext, scope);
  if (isCommentOperationActive()) throw new Error('Vui lòng đợi thao tác đang chạy hoàn tất');
  const summary = useCommentStore.getState().summaryDraft.trim();
  if (!summary) throw new Error('Vui lòng nhập tổng kết buổi học');
  useCommentStore.getState().setSummaryBusy(true);
  useCommentStore.getState().setSummaryError(null);
  const controller = createCommentController();
  try {
    await saveSummary(slotId, { classId, summary }, controller.signal);
    if (capturedContext && isCurrentCommentContext(capturedContext)) {
      useCommentStore.getState().markSummarySynced(summary);
    } else {
      useCommentStore.getState().markSummarySynced(summary);
    }
  } catch (error) {
    if (capturedContext && isCurrentCommentContext(capturedContext) && !isAbort(error)) {
      useCommentStore.getState().setSummaryError(errorText(error));
    }
    throw error;
  } finally {
    releaseCommentController(controller);
    if (capturedContext && isCurrentCommentContext(capturedContext)) {
      useCommentStore.getState().setSummaryBusy(false);
    }
  }
}

export async function submitSingleComment(scope: RegularCommentScope, studentId: string): Promise<SubmitOutcome> {
  const context = requireScope(scope);
  if (isCommentOperationActive()) throw new Error('Vui lòng đợi thao tác đang chạy hoàn tất');
  const student = requireStudent(scope, studentId);
  const draft = useCommentStore.getState().drafts[studentId];
  const summary = useCommentStore.getState().summaryDraft.trim();
  if (!draft?.content.trim()) throw new Error('Chưa có nhận xét để gửi');
  if (!summary) throw new Error('Vui lòng nhập tổng kết buổi học');
  useCommentStore.getState().setStudentBusy(studentId, true);
  useCommentStore.getState().setError(studentId, null);
  const controller = createCommentController();
  try {
    await waitUntilAssessmentsReady(context);
    await waitForAssessmentSaves(studentId);
    assertCurrentSingle(context, scope, studentId);
    await saveFullAssessment(studentId);
    assertCurrentSingle(context, scope, studentId);
    const assessment = normalizedAssessmentDraft(useAssessmentStore.getState(), studentId);
    await submitComment(context.slotId, {
      classId: context.classId,
      studentId,
      attendanceId: student.id,
      comment: draft.content,
      summary,
      learningLevel: assessment.learningLevel,
      ...(draft.generationMeta ? { generationMeta: draft.generationMeta } : {}),
    }, controller.signal);
    if (!isCurrentSingle(context, scope, studentId)) return { total: 1, successfulIds: [], failures: [], safeTemplateCount: 0, refreshed: false };
    useCommentStore.getState().removeDraft(studentId);
    useCommentStore.getState().markSummarySynced(summary);
    const refreshed = await refetchCurrentClass(context);
    return { total: 1, successfulIds: [studentId], failures: [], safeTemplateCount: 0, refreshed };
  } catch (error) {
    if (isCurrentSingle(context, scope, studentId) && !isAbort(error)) useCommentStore.getState().setError(studentId, errorText(error));
    throw error;
  } finally {
    releaseCommentController(controller);
    if (isCurrentCommentContext(context)) useCommentStore.getState().setStudentBusy(studentId, false);
  }
}

export type FrozenSubmitInput = { drafts: Record<string, CommentDraft>; summary: string };

export async function submitBatchComments(scope: RegularCommentScope, requestedIds: string[], frozenInput?: FrozenSubmitInput): Promise<SubmitOutcome> {
  const context = requireScope(scope);
  if (isCommentOperationActive()) throw new Error('Đang có thao tác nhận xét khác chạy');
  const summary = (frozenInput?.summary ?? useCommentStore.getState().summaryDraft).trim();
  if (!summary) throw new Error('Vui lòng nhập tổng kết buổi học');
  const draftsAtStart = frozenInput?.drafts ?? useCommentStore.getState().drafts;
  const scopeIds = unique(requestedIds).filter((id) => {
    const student = scope.slot.studentAttendance.find((item) => item.studentId === id);
    return student && isPresent(student) && draftsAtStart[id]?.content.trim();
  });
  if (!scopeIds.length) throw new Error('Không có bản nháp phù hợp để gửi');
  const frozenDrafts = Object.fromEntries(scopeIds.map((id) => [id, { ...draftsAtStart[id], generationMeta: draftsAtStart[id].generationMeta ? { ...draftsAtStart[id].generationMeta!, validationIssues: [...draftsAtStart[id].generationMeta!.validationIssues] } : null }]));
  useCommentStore.getState().startBatch({ kind: 'submit', phase: 'persisting', scopeIds, total: scopeIds.length, completed: 0, successful: 0, safeTemplateCount: 0, failures: {}, currentStudentId: null });
  scopeIds.forEach((id) => useCommentStore.getState().setError(id, null));
  const controller = createCommentController();
  const failures: Array<{ studentId: string; message: string }> = [];
  const successfulIds: string[] = [];
  try {
    await waitUntilAssessmentsReady(context);
    const persisted = new Set<string>();
    await runWithConcurrency(scopeIds, 3, async (studentId) => {
      try {
        await waitForAssessmentSaves(studentId);
        assertScope(context, scope);
        await saveFullAssessment(studentId);
        persisted.add(studentId);
      } catch (error) {
        if (isAbort(error)) throw error;
        recordFailure(studentId, errorText(error), failures);
      } finally {
        if (isCurrentCommentContext(context)) incrementBatch();
      }
    });
    assertScope(context, scope);
    useCommentStore.getState().updateBatch({ phase: 'submitting', total: scopeIds.length, completed: failures.length });
    let summarySubmitted = false;
    for (const studentId of scopeIds.filter((id) => persisted.has(id))) {
      assertScope(context, scope);
      if (isCurrentCommentContext(context)) useCommentStore.getState().updateBatch({ currentStudentId: studentId });
      const student = requireStudent(scope, studentId);
      const draft = frozenDrafts[studentId];
      const assessment = normalizedAssessmentDraft(useAssessmentStore.getState(), studentId);
      try {
        const includeSummary = !summarySubmitted;
        await submitComment(context.slotId, {
          classId: context.classId,
          studentId,
          attendanceId: student.id,
          comment: draft.content,
          ...(includeSummary ? { summary } : {}),
          learningLevel: assessment.learningLevel,
          ...(draft.generationMeta ? { generationMeta: draft.generationMeta } : {}),
        }, controller.signal);
        if (!isCurrentCommentContext(context)) break;
        successfulIds.push(studentId);
        if (includeSummary) {
          summarySubmitted = true;
          useCommentStore.getState().markSummarySynced(summary);
        }
        const currentDraft = useCommentStore.getState().drafts[studentId];
        if (sameCommentDraft(currentDraft, draft)) useCommentStore.getState().removeDraft(studentId);
        useCommentStore.getState().updateBatch({ successful: successfulIds.length });
      } catch (error) {
        if (isAbort(error)) throw error;
        if (isCurrentCommentContext(context)) recordFailure(studentId, errorText(error), failures);
      } finally {
        if (isCurrentCommentContext(context)) incrementBatch();
      }
    }
    assertScope(context, scope);
    const refreshed = successfulIds.length ? await refetchCurrentClass(context) : false;
    return { total: scopeIds.length, successfulIds, failures, safeTemplateCount: 0, refreshed };
  } finally {
    releaseCommentController(controller);
    if (isCurrentCommentContext(context)) useCommentStore.getState().finishBatch();
  }
}

async function currentGenerationConfig(): Promise<CommentGenerationConfig> {
  const server = await appQueryClient().fetchQuery(configQuery());
  const current = useCommentStore.getState().generationConfig;
  const apiKey = current.apiKey.trim() || readAiApiKey().trim();
  const formReady = Boolean(current.modelId);
  const modelId = current.modelId || server.data.aiModel;
  if (!modelId) throw new Error('Cấu hình AI chưa sẵn sàng');
  return {
    ...current,
    modelId,
    customModelId: formReady ? current.customModelId : server.data.customModelId,
    thinkingLevel: formReady ? current.thinkingLevel : server.data.thinkingLevel,
    commentLength: formReady ? current.commentLength : server.data.commentLength,
    customPrompt: formReady ? current.customPrompt : server.data.customPrompt,
    apiKey,
  };
}

async function loadHomeworkFacts(scope: RegularCommentScope, signal: AbortSignal): Promise<Record<string, CommentHomeworkStatus | null>> {
  if (![2, 3, 4, 7, 8].includes(scope.sessionNumber)) return Object.fromEntries(scope.slot.studentAttendance.map((student) => [student.studentId, null]));
  try {
    const response = await getCommentHomework(scope.detail.id, signal);
    return homeworkStatuses(response, scope.sessionNumber, scope.slot.studentAttendance);
  } catch (error) {
    if (isAbort(error)) throw error;
    return Object.fromEntries(scope.slot.studentAttendance.map((student) => [student.studentId, null]));
  }
}

function snapshotStudent(scope: RegularCommentScope, student: StudentAttendance, homeworkStatus: CommentHomeworkStatus | null): StudentSnapshot {
  const assessment = normalizedAssessmentDraft(useAssessmentStore.getState(), student.studentId);
  return {
    attendanceId: student.id,
    studentId: student.studentId,
    studentName: student.displayName,
    studentCallName: getStudentCallName(student.displayName, scope.slot.studentAttendance),
    attendanceStatus: commentAttendanceStatus(student.status),
    isLate: student.status === 'LATE_ARRIVED',
    learningLevel: assessment.learningLevel,
    teacherNote: assessment.note,
    pastSlots: pastCommentSlots(scope.detail, scope.slot, student.studentId),
    homeworkStatus,
    sessionNumber: scope.sessionNumber,
  };
}

function buildGenerationRequest(context: ContextSnapshot, snapshot: StudentSnapshot, config: CommentGenerationConfig, summary: string): GenerateCommentRequest {
  return {
    classId: context.classId,
    slotId: context.slotId,
    studentId: snapshot.studentId,
    studentName: snapshot.studentName,
    studentCallName: snapshot.studentCallName,
    pastSlots: snapshot.pastSlots,
    sessionSummary: summary,
    teacherNote: snapshot.teacherNote,
    learningLevel: snapshot.learningLevel,
    attendanceStatus: snapshot.attendanceStatus,
    isLate: snapshot.isLate,
    homeworkStatus: snapshot.homeworkStatus,
    modelId: config.modelId,
    customModelId: config.customModelId,
    thinkingLevel: config.thinkingLevel,
    commentLength: config.commentLength,
    customPrompt: config.customPrompt,
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    sessionNumber: snapshot.sessionNumber,
  };
}

async function waitUntilAssessmentsReady(context: ContextSnapshot): Promise<void> {
  const assessmentContext = captureAssessmentContext();
  if (!assessmentContext || assessmentContext.classId !== context.classId || assessmentContext.slotId !== context.slotId) throw new Error('Dữ liệu đánh giá không thuộc buổi học hiện tại');
  if (!isCurrentAssessmentContext(assessmentContext)) throw new DOMException('Assessment context changed', 'AbortError');
  const initial = useAssessmentStore.getState().load;
  if (!initial.loading) {
    if (initial.error) throw new Error(initial.error);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const unsubscribe = useAssessmentStore.subscribe((state) => {
      if (!isCurrentCommentContext(context) || !isCurrentAssessmentContext(assessmentContext)) {
        unsubscribe();
        reject(new DOMException('Context changed', 'AbortError'));
      } else if (!state.load.loading) {
        unsubscribe();
        if (state.load.error) reject(new Error(state.load.error)); else resolve();
      }
    });
  });
}

function requireScope(scope: RegularCommentScope): ContextSnapshot {
  const context = captureCommentContext();
  if (!context) throw new Error('Chưa chọn lớp hoặc buổi học');
  assertScope(context, scope);
  return context;
}
function assertScope(context: ContextSnapshot, scope: RegularCommentScope): void {
  if (!isCurrentCommentContext(context) || scope.detail.id !== context.classId || scope.slot.id !== context.slotId) throw new DOMException('Comment context changed', 'AbortError');
}
function assertCurrentSingle(context: ContextSnapshot, scope: RegularCommentScope, studentId: string): void {
  assertScope(context, scope);
  if (!isCurrentSingle(context, scope, studentId)) throw new DOMException('Student context changed', 'AbortError');
}
function isCurrentSingle(context: ContextSnapshot, scope: RegularCommentScope, studentId: string): boolean {
  return isCurrentCommentContext(context) && scope.selectedStudentId === studentId && useClassWorkspaceStore.getState().studentId === studentId;
}
function requireStudent(scope: RegularCommentScope, studentId: string): StudentAttendance {
  const student = scope.slot.studentAttendance.find((item) => item.studentId === studentId);
  if (!student) throw new Error('Không tìm thấy học sinh trong buổi học hiện tại');
  return student;
}
function isPresent(student: StudentAttendance): boolean { return student.status === 'ATTENDED' || student.status === 'LATE_ARRIVED'; }
function sameContext(left: CommentContext | null, right: CommentContext): boolean { return left?.classId === right.classId && left.slotId === right.slotId && left.epoch === right.epoch; }
function sameCommentDraft(left: CommentDraft | undefined, right: CommentDraft | undefined): boolean {
  return left?.content === right?.content
    && left?.kind === right?.kind
    && left?.generationMeta?.source === right?.generationMeta?.source
    && left?.generationMeta?.transport === right?.generationMeta?.transport
    && JSON.stringify(left?.generationMeta?.validationIssues || []) === JSON.stringify(right?.generationMeta?.validationIssues || []);
}
function unique(values: string[]): string[] { return Array.from(new Set(values.map(String))); }
function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error || 'Lỗi không xác định'); }
function isAbort(error: unknown): boolean { return error instanceof DOMException && error.name === 'AbortError'; }
function recordFailure(studentId: string, message: string, failures: Array<{ studentId: string; message: string }>) {
  if (!failures.some((item) => item.studentId === studentId)) failures.push({ studentId, message });
  useCommentStore.getState().setError(studentId, message);
  useCommentStore.getState().updateBatch({ failure: { studentId, message } });
}
function incrementBatch() {
  const batch = useCommentStore.getState().batch;
  if (batch) useCommentStore.getState().updateBatch({ completed: Math.min(batch.completed + 1, batch.total) });
}
async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (cursor < items.length) await worker(items[cursor++]);
  });
  await Promise.all(runners);
}
function createCommentController(): AbortController {
  const controller = createOperationController();
  contextControllers.add(controller);
  controller.signal.addEventListener('abort', () => contextControllers.delete(controller), { once: true });
  return controller;
}
function releaseCommentController(controller: AbortController) { contextControllers.delete(controller); releaseOperationController(controller); }
function abortCommentOperations() { for (const controller of contextControllers) controller.abort(); contextControllers.clear(); }
async function refetchCurrentClass(context: ContextSnapshot): Promise<boolean> {
  if (!isCurrentCommentContext(context)) return false;
  try {
    await appQueryClient().refetchQueries({ queryKey: classDetailQuery(context.classId).queryKey, exact: true });
    return isCurrentCommentContext(context);
  } catch { return false; }
}

export function resetCommentController(): void {
  epoch += 1;
  activeContext = null;
  abortCommentOperations();
}
registerWorkflowReset(resetCommentController);

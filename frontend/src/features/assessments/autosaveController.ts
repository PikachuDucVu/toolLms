import type { LearningLevel } from '@tool-lms/contracts';
import { currentAuthEpoch, createOperationController, isCurrentAuthEpoch, registerWorkflowReset, releaseOperationController } from '../../lib/operationContext';
import { saveAssessment, saveLearningLevel } from './api';
import { captureStudentState, isContext, useAssessmentStore, type AssessmentContext, type AssessmentDraft, type StudentStateSnapshot } from './assessmentStore';
import { hasDirtyAssessments, normalizedAssessmentDraft } from './selectors';

export interface AssessmentContextSnapshot extends AssessmentContext { authEpoch: number }
export type BulkLevelResult = { successfulIds: string[]; failures: Array<{ studentId: string; message: string }> };

let assessmentEpoch = 0;
let activeContext: AssessmentContext | null = null;
const studentTails = new Map<string, Promise<void>>();
const autosaveTokens = new Map<string, number>();
const contextControllers = new Set<AbortController>();

export function activateAssessmentContext(classId: string, slotId: string): AssessmentContext {
  assessmentEpoch += 1;
  abortAssessmentOperations();
  activeContext = { classId, slotId, epoch: assessmentEpoch };
  useAssessmentStore.getState().activate(activeContext);
  return activeContext;
}

export function deactivateAssessmentContext(context?: AssessmentContext): void {
  if (context && !isContext(activeContext, context)) return;
  assessmentEpoch += 1;
  activeContext = null;
  abortAssessmentOperations();
  useAssessmentStore.getState().reset();
}

export function captureAssessmentContext(): AssessmentContextSnapshot | null {
  return activeContext ? { ...activeContext, authEpoch: currentAuthEpoch() } : null;
}

export function isCurrentAssessmentContext(context: AssessmentContextSnapshot | AssessmentContext): boolean {
  const authMatches = 'authEpoch' in context ? isCurrentAuthEpoch(context.authEpoch) : true;
  return authMatches && isContext(activeContext, context) && isContext(useAssessmentStore.getState().context, context);
}

export function queueLearningLevelAutosave(studentId: string): Promise<void> {
  const context = captureAssessmentContext();
  if (!context) return Promise.resolve();
  const learningLevel = normalizedAssessmentDraft(useAssessmentStore.getState(), studentId).learningLevel;
  const token = (autosaveTokens.get(studentId) || 0) + 1;
  autosaveTokens.set(studentId, token);
  const store = useAssessmentStore.getState();
  store.setAutosaveBusy(studentId, true);
  store.setSaveError(studentId, null);

  const run = appendStudentTask(studentId, async () => {
    assertReady(context);
    const controller = createAssessmentOperationController();
    try {
      const response = await saveLearningLevel(context.slotId, studentId, { classId: context.classId, learningLevel }, controller.signal);
      if (!isCurrentAssessmentContext(context)) return;
      const assessment = response.data.assessment;
      useAssessmentStore.getState().applySynced(studentId, { learningLevel: assessment.learningLevel, note: assessment.note.trim() });
    } finally {
      releaseAssessmentOperationController(controller);
    }
  });

  return run.catch((error) => {
    if (!isCurrentAssessmentContext(context) || autosaveTokens.get(studentId) !== token || isAbort(error)) return;
    useAssessmentStore.getState().setSaveError(studentId, errorText(error));
  }).finally(() => {
    if (!isCurrentAssessmentContext(context) || autosaveTokens.get(studentId) !== token) return;
    useAssessmentStore.getState().setAutosaveBusy(studentId, false);
  });
}

export async function saveFullAssessment(studentId: string): Promise<boolean> {
  const context = captureAssessmentContext();
  if (!context) throw new Error('Chưa chọn lớp hoặc buổi học');
  const store = useAssessmentStore.getState();
  store.setExplicitSaveBusy(studentId, true);
  store.setSaveError(studentId, null);
  try {
    return await appendStudentTask(studentId, async () => persistCurrentDraft(context, studentId));
  } catch (error) {
    if (isCurrentAssessmentContext(context) && !isAbort(error)) useAssessmentStore.getState().setSaveError(studentId, errorText(error));
    throw error;
  } finally {
    if (isCurrentAssessmentContext(context)) useAssessmentStore.getState().setExplicitSaveBusy(studentId, false);
  }
}

export function waitForAssessmentSaves(studentId: string): Promise<void> {
  return studentTails.get(studentId) || Promise.resolve();
}

export async function saveBulkLearningLevel(studentIds: string[], learningLevel: LearningLevel, concurrency = 3): Promise<BulkLevelResult> {
  const context = captureAssessmentContext();
  if (!context) throw new Error('Chưa chọn lớp hoặc buổi học');
  assertReady(context);
  const uniqueIds = Array.from(new Set(studentIds));
  const before: Record<string, StudentStateSnapshot> = {};
  for (const studentId of uniqueIds) before[studentId] = captureStudentState(useAssessmentStore.getState(), studentId);
  for (const studentId of uniqueIds) useAssessmentStore.getState().setLearningLevelDraft(studentId, learningLevel);
  useAssessmentStore.getState().setBulkBusy(true);
  useAssessmentStore.getState().setOperationError(null);
  const successfulIds: string[] = [];
  const failures: Array<{ studentId: string; message: string }> = [];
  try {
    await runWithConcurrency(uniqueIds, concurrency, async (studentId) => {
      try {
        await appendStudentTask(studentId, async () => persistCurrentDraft(context, studentId));
        successfulIds.push(studentId);
      } catch (error) {
        failures.push({ studentId, message: errorText(error) });
      }
    });
    if (!isCurrentAssessmentContext(context)) return { successfulIds, failures };
    if (failures.length) {
      const rollback: Record<string, StudentStateSnapshot> = {};
      failures.forEach(({ studentId }) => { rollback[studentId] = before[studentId]; });
      useAssessmentStore.getState().restoreStudents(rollback);
      useAssessmentStore.getState().setOperationError(`Không lưu được ${failures.length}/${uniqueIds.length} học sinh.`);
    }
    return { successfulIds, failures };
  } finally {
    if (isCurrentAssessmentContext(context)) useAssessmentStore.getState().setBulkBusy(false);
  }
}

export function hasUnsavedAssessmentWork(): boolean {
  return hasDirtyAssessments(useAssessmentStore.getState());
}

export function isAssessmentOperationActive(): boolean {
  const state = useAssessmentStore.getState();
  return state.classRefreshBusy || state.bulkBusy || state.autosaveBusy.size > 0 || state.explicitSaveBusy.size > 0;
}

export function resetAssessmentController(): void {
  assessmentEpoch += 1;
  activeContext = null;
  abortAssessmentOperations();
  autosaveTokens.clear();
  studentTails.clear();
}

async function persistCurrentDraft(context: AssessmentContextSnapshot, studentId: string): Promise<boolean> {
  assertReady(context);
  const submitted = normalizedAssessmentDraft(useAssessmentStore.getState(), studentId);
  const synced = useAssessmentStore.getState().synced[studentId];
  if (synced?.learningLevel === submitted.learningLevel && synced.note === submitted.note) {
    useAssessmentStore.getState().applySynced(studentId, synced, submitted);
    return false;
  }
  const controller = createAssessmentOperationController();
  try {
    const response = await saveAssessment(context.slotId, studentId, {
      classId: context.classId,
      learningLevel: submitted.learningLevel,
      note: submitted.note,
    }, controller.signal);
    if (!isCurrentAssessmentContext(context)) return false;
    const assessment = response.data.assessment;
    useAssessmentStore.getState().applySynced(studentId, { learningLevel: assessment.learningLevel, note: assessment.note.trim() }, submitted);
    return true;
  } finally {
    releaseAssessmentOperationController(controller);
  }
}

function appendStudentTask<T>(studentId: string, task: () => Promise<T>): Promise<T> {
  const previous = studentTails.get(studentId) || Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  const tail = run.then(() => undefined, () => undefined);
  studentTails.set(studentId, tail);
  void tail.finally(() => { if (studentTails.get(studentId) === tail) studentTails.delete(studentId); });
  return run;
}

function assertReady(context: AssessmentContextSnapshot): void {
  if (!isCurrentAssessmentContext(context)) throw new DOMException('Assessment context changed', 'AbortError');
  const load = useAssessmentStore.getState().load;
  if (load.loading) throw new Error('Đánh giá đang được tải');
  if (load.error) throw new Error(load.error);
}

function createAssessmentOperationController(): AbortController {
  const controller = createOperationController();
  contextControllers.add(controller);
  controller.signal.addEventListener('abort', () => contextControllers.delete(controller), { once: true });
  return controller;
}

function releaseAssessmentOperationController(controller: AbortController): void {
  contextControllers.delete(controller);
  releaseOperationController(controller);
}

function abortAssessmentOperations(): void {
  for (const controller of contextControllers) controller.abort();
  contextControllers.clear();
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (cursor < items.length) await worker(items[cursor++]);
  });
  await Promise.all(runners);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'Không thể lưu đánh giá');
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

registerWorkflowReset(resetAssessmentController);

import type { ClassDetail, DemoCustomScore, DemoResolvedSchema, Slot, StudentAttendance } from '@tool-lms/contracts';
import { appQueryClient } from '../../app/providers';
import { currentAuthEpoch, createOperationController, isCurrentAuthEpoch, registerWorkflowReset, releaseOperationController } from '../../lib/operationContext';
import { classDetailQuery, isPresent, applyOptimisticClassSubmissions, reconcileClassSubmissionsAfterRefetch } from '../classes/public/domain';
import { previewDemoScores, submitDemoScores } from './api';
import { isDemoOperationActive, useDemoStore, type DemoContext, type DemoDraft, type DemoScores } from './demoStore';

export type DemoScope = { detail: ClassDetail; slot: Slot };
export type FrozenDemoStudent = {
  studentId: string;
  attendanceId: string;
  studentName: string;
  scores: DemoCustomScore[];
  autoRate: boolean;
  draft: DemoDraft;
};
export type DemoBatchConfirmationStudent = {
  studentId: string;
  attendanceId: string;
  studentName: string;
  draft: DemoDraft;
};
export type DemoBatchConfirmation = {
  context: DemoContext;
  authEpoch: number;
  summary: string;
  summaryVersion: number;
  students: DemoBatchConfirmationStudent[];
};
export type FrozenDemoBatch = Omit<DemoBatchConfirmation, 'students'> & { students: FrozenDemoStudent[] };
export type DemoBatchOutcome = { total: number; attempted: number; successfulIds: string[]; failures: Array<{ studentId: string; message: string }>; refreshed: boolean };

let epoch = 0;
let activeContext: DemoContext | null = null;
const contextControllers = new Set<AbortController>();

export function activateDemoContext(classId: string, slotId: string, summary: string): DemoContext {
  if (activeContext?.classId === classId && activeContext.slotId === slotId) return activeContext;
  epoch += 1;
  abortDemoOperations();
  activeContext = { classId, slotId, epoch };
  useDemoStore.getState().activate(activeContext, summary);
  return activeContext;
}

export function hydrateDemoContext(context: DemoContext, schema: DemoResolvedSchema, slot: Slot, summary: string): void {
  if (isCurrentDemoContext(context)) useDemoStore.getState().hydrateSchema(context, schema, slot, summary);
}

export function setDemoSchemaError(context: DemoContext, error: string | null): void {
  if (isCurrentDemoContext(context)) useDemoStore.getState().setSchemaError(context, error);
}

export function deactivateDemoContext(context?: DemoContext): void {
  if (context && !sameContext(activeContext, context)) return;
  epoch += 1;
  activeContext = null;
  abortDemoOperations();
  useDemoStore.getState().reset();
}

export function isCurrentDemoContext(context: DemoContext & { authEpoch?: number }): boolean {
  return (context.authEpoch === undefined || isCurrentAuthEpoch(context.authEpoch))
    && sameContext(activeContext, context)
    && sameContext(useDemoStore.getState().context, context);
}

export type DemoRandomRange = { minScore: number; maxScore: number };

export function currentDemoRandomRange(): DemoRandomRange {
  const state = useDemoStore.getState();
  return normalizeRandomRange(state.randomMinScore, state.randomMaxScore);
}

export async function randomizeDemoStudent(scope: DemoScope, studentId: string, range = currentDemoRandomRange()): Promise<void> {
  const context = requireScope(scope);
  if (isDemoOperationActive()) throw new Error('Vui lòng đợi thao tác đang chạy hoàn tất');
  requirePresentStudent(scope, studentId);
  const draft = requireDraft(studentId);
  const expectedVersion = draft.version;
  useDemoStore.getState().setRandomBusy(studentId, true);
  const controller = createDemoController();
  try {
    const response = await previewDemoScores(context.slotId, { classId: context.classId, minScore: range.minScore, maxScore: range.maxScore }, controller.signal);
    assertScope(context, scope);
    const scores = previewScores(requireSchema(), response.data.questions);
    useDemoStore.getState().applyPreview(studentId, scores, response.data.demoScore, expectedVersion);
  } catch (error) {
    if (isCurrentDemoContext(context) && !isAbort(error)) useDemoStore.getState().setError(studentId, errorText(error));
    throw error;
  } finally {
    releaseDemoController(controller);
    if (isCurrentDemoContext(context)) useDemoStore.getState().setRandomBusy(studentId, false);
  }
}

export async function submitSingleDemo(scope: DemoScope, studentId: string): Promise<boolean> {
  const context = requireScope(scope);
  if (isDemoOperationActive()) throw new Error('Vui lòng đợi thao tác đang chạy hoàn tất');
  const student = requirePresentStudent(scope, studentId);
  const state = useDemoStore.getState();
  const summary = state.summaryDraft;
  if (!summary.trim()) throw new Error('Vui lòng nhập tổng kết buổi học');
  const schema = requireSchema();
  const draft = cloneDraft(requireDraft(studentId));
  const scores = freezeScores(schema, draft, true);
  const summaryVersion = state.summaryVersion;
  useDemoStore.getState().setSubmitBusy(studentId, true);
  const controller = createDemoController();
  try {
    const response = await submitDemoScores(context.slotId, {
      classId: context.classId,
      studentId,
      attendanceId: student.id,
      summaryMode: 'required',
      summary,
      customScores: scores,
      autoRate: draft.autoRate,
    }, controller.signal);
    assertScope(context, scope);
    useDemoStore.getState().applySubmitSuccess(studentId, response.data, draft, summary, summaryVersion);
    applyOptimisticClassSubmissions({ classId: context.classId, slotId: context.slotId, studentIds: [studentId], mode: 'demo' });
    await refetchCurrentClass(context, [studentId]);
    return true;
  } catch (error) {
    if (isCurrentDemoContext(context) && !isAbort(error)) useDemoStore.getState().setError(studentId, errorText(error));
    throw error;
  } finally {
    releaseDemoController(controller);
    if (isCurrentDemoContext(context)) useDemoStore.getState().setSubmitBusy(studentId, false);
  }
}

export async function randomizePresentDemoStudents(scope: DemoScope, range = currentDemoRandomRange()): Promise<number> {
  const context = requireScope(scope);
  if (isDemoOperationActive()) throw new Error('Vui lòng đợi thao tác đang chạy hoàn tất');
  const schema = requireSchema();
  const students = scope.slot.studentAttendance.filter((student) => isPresent(student) && !hasPositiveScore(schema, requireDraft(student.studentId)));
  if (!students.length) throw new Error('Tất cả học sinh có mặt đã có điểm. Random all không ghi đè điểm đã nhập.');
  const scopeIds = students.map((student) => student.studentId);
  useDemoStore.getState().startBatch({ phase: 'previewing', scopeIds, total: scopeIds.length, attempted: 0, successful: 0, currentStudentId: null, failures: {} });
  const controller = createDemoController();
  let applied = 0;
  try {
    for (const student of students) {
      assertScope(context, scope);
      const draft = requireDraft(student.studentId);
      const expectedVersion = draft.version;
      useDemoStore.getState().updateBatch({ currentStudentId: student.studentId, attempted: applied + 1 });
      const response = await previewDemoScores(context.slotId, { classId: context.classId, minScore: range.minScore, maxScore: range.maxScore }, controller.signal);
      assertScope(context, scope);
      const scores = previewScores(schema, response.data.questions);
      if (useDemoStore.getState().applyPreview(student.studentId, scores, response.data.demoScore, expectedVersion)) applied += 1;
      useDemoStore.getState().updateBatch({ successful: applied });
    }
    return applied;
  } catch (error) {
    const currentStudentId = useDemoStore.getState().batch?.currentStudentId;
    if (currentStudentId && isCurrentDemoContext(context) && !isAbort(error)) {
      const message = errorText(error);
      useDemoStore.getState().setError(currentStudentId, message);
      useDemoStore.getState().updateBatch({ failure: { studentId: currentStudentId, message } });
    }
    throw error;
  } finally {
    releaseDemoController(controller);
    if (isCurrentDemoContext(context)) useDemoStore.getState().finishBatch();
  }
}

export function captureDemoBatch(scope: DemoScope): DemoBatchConfirmation {
  const context = requireScope(scope);
  if (isDemoOperationActive()) throw new Error('Vui lòng đợi thao tác đang chạy hoàn tất');
  const state = useDemoStore.getState();
  const summary = state.summaryDraft;
  if (!summary.trim()) throw new Error('Vui lòng nhập tổng kết buổi học');
  const students = scope.slot.studentAttendance.filter(isPresent);
  if (!students.length) throw new Error('Không có học sinh có mặt!');
  requireSchema();
  return {
    context: { ...context },
    authEpoch: currentAuthEpoch(),
    summary,
    summaryVersion: state.summaryVersion,
    students: students.map((student) => ({ studentId: student.studentId, attendanceId: student.id, studentName: student.displayName, draft: cloneDraft(requireDraft(student.studentId)) })),
  };
}

export async function prepareDemoBatch(scope: DemoScope, captured: DemoBatchConfirmation): Promise<FrozenDemoBatch> {
  const context = requireScope(scope);
  if (isDemoOperationActive()) throw new Error('Vui lòng đợi thao tác đang chạy hoàn tất');
  if (!sameContext(context, captured.context) || captured.authEpoch !== currentAuthEpoch()) throw new DOMException('Demo context changed', 'AbortError');
  const schema = requireSchema();
  const scopeIds = captured.students.map((student) => student.studentId);
  useDemoStore.getState().startBatch({ phase: 'previewing', scopeIds, total: scopeIds.length, attempted: 0, successful: 0, currentStudentId: null, failures: {} });
  const controller = createDemoController();
  const frozen: FrozenDemoStudent[] = [];
  try {
    for (const student of captured.students) {
      assertScope(context, scope);
      useDemoStore.getState().updateBatch({ currentStudentId: student.studentId });
      let draft = cloneDraft(student.draft);
      if (!hasPositiveScore(schema, draft)) {
        const range = currentDemoRandomRange();
        const response = await previewDemoScores(context.slotId, { classId: context.classId, minScore: range.minScore, maxScore: range.maxScore }, controller.signal);
        assertScope(context, scope);
        const scores = previewScores(schema, response.data.questions);
        useDemoStore.getState().applyPreview(student.studentId, scores, response.data.demoScore, student.draft.version);
        draft = { ...cloneDraft(student.draft), scores };
      }
      frozen.push({ studentId: student.studentId, attendanceId: student.attendanceId, studentName: student.studentName, scores: freezeScores(schema, draft, true), autoRate: draft.autoRate, draft: cloneDraft(draft) });
    }
    assertScope(context, scope);
    return { context: { ...captured.context }, authEpoch: captured.authEpoch, summary: captured.summary, summaryVersion: captured.summaryVersion, students: frozen };
  } catch (error) {
    const currentStudentId = useDemoStore.getState().batch?.currentStudentId;
    if (currentStudentId && isCurrentDemoContext(context) && !isAbort(error)) {
      const message = errorText(error);
      useDemoStore.getState().setError(currentStudentId, message);
      useDemoStore.getState().updateBatch({ failure: { studentId: currentStudentId, message } });
    }
    throw error;
  } finally {
    releaseDemoController(controller);
    if (isCurrentDemoContext(context)) useDemoStore.getState().finishBatch();
  }
}

export async function submitDemoBatch(scope: DemoScope, frozen: FrozenDemoBatch): Promise<DemoBatchOutcome> {
  const context = requireScope(scope);
  if (isDemoOperationActive()) throw new Error('Vui lòng đợi thao tác đang chạy hoàn tất');
  if (!sameContext(context, frozen.context) || frozen.authEpoch !== currentAuthEpoch()) throw new DOMException('Demo context changed', 'AbortError');
  const scopeIds = frozen.students.map((student) => student.studentId);
  useDemoStore.getState().startBatch({ phase: 'submitting', scopeIds, total: scopeIds.length, attempted: 0, successful: 0, currentStudentId: null, failures: {} });
  const controller = createDemoController();
  const successfulIds: string[] = [];
  const failures: Array<{ studentId: string; message: string }> = [];
  let attempted = 0;
  let refreshed = false;
  try {
    for (let index = 0; index < frozen.students.length; index += 1) {
      assertScope(context, scope);
      const student = frozen.students[index];
      attempted += 1;
      useDemoStore.getState().updateBatch({ attempted, currentStudentId: student.studentId });
      try {
        const response = await submitDemoScores(context.slotId, {
          classId: context.classId,
          studentId: student.studentId,
          attendanceId: student.attendanceId,
          summaryMode: 'optional',
          ...(index === 0 ? { summary: frozen.summary } : {}),
          customScores: student.scores,
          autoRate: student.autoRate,
        }, controller.signal);
        if (!isCurrentDemoContext(context)) break;
        successfulIds.push(student.studentId);
        useDemoStore.getState().applySubmitSuccess(student.studentId, response.data, student.draft, frozen.summary, frozen.summaryVersion);
        useDemoStore.getState().updateBatch({ successful: successfulIds.length });
      } catch (error) {
        if (isAbort(error)) throw error;
        if (isCurrentDemoContext(context)) {
          const message = errorText(error);
          failures.push({ studentId: student.studentId, message });
          useDemoStore.getState().setError(student.studentId, message);
          useDemoStore.getState().updateBatch({ failure: { studentId: student.studentId, message } });
        }
      }
    }
    assertScope(context, scope);
    useDemoStore.getState().updateBatch({ phase: 'reloading', currentStudentId: null });
    if (successfulIds.length) applyOptimisticClassSubmissions({ classId: context.classId, slotId: context.slotId, studentIds: successfulIds, mode: 'demo' });
    refreshed = await refetchCurrentClass(context, successfulIds);
    return { total: frozen.students.length, attempted, successfulIds, failures, refreshed };
  } finally {
    releaseDemoController(controller);
    if (isCurrentDemoContext(context)) useDemoStore.getState().finishBatch();
  }
}

export function validateDemoDraft(schema: DemoResolvedSchema, draft: DemoDraft, requirePositive = true): DemoCustomScore[] {
  return freezeScores(schema, draft, requirePositive);
}

function freezeScores(schema: DemoResolvedSchema, draft: DemoDraft, requirePositive: boolean): DemoCustomScore[] {
  const scores = schema.questions.map((question) => {
    const rawScore = draft.scores[question.id];
    const score = rawScore === null || rawScore === undefined ? 0 : rawScore;
    if (!Number.isFinite(score)) throw new Error(`Điểm “${question.title}” không hợp lệ`);
    if (score < 0 || score > question.maxScore) throw new Error(`Điểm “${question.title}” phải từ 0 đến ${formatScore(question.maxScore)}`);
    if (Math.abs(score * 4 - Math.round(score * 4)) > 1e-7) throw new Error(`Điểm “${question.title}” phải theo bước 0.25`);
    return { questionId: question.id, score };
  });
  if (requirePositive && !scores.some((item) => item.score > 0)) throw new Error('Vui lòng nhấn "Random" hoặc nhập điểm trước khi submit');
  return scores;
}
function hasPositiveScore(schema: DemoResolvedSchema, draft: DemoDraft): boolean { return schema.questions.some((question) => (draft.scores[question.id] || 0) > 0); }
function previewScores(schema: DemoResolvedSchema, questions: Array<{ id: string; maxScore: number; score: number }>): DemoScores {
  if (schema.questions.length !== questions.length || schema.questions.some((question, index) => question.id !== questions[index]?.id || question.maxScore !== questions[index]?.maxScore)) throw new Error('Schema điểm Demo đã thay đổi. Vui lòng tải lại dữ liệu.');
  return Object.fromEntries(questions.map((question) => [question.id, question.score]));
}
function requireScope(scope: DemoScope): DemoContext & { authEpoch: number } {
  if (!activeContext) throw new Error('Chưa chọn lớp hoặc buổi Demo');
  const context = { ...activeContext, authEpoch: currentAuthEpoch() };
  assertScope(context, scope);
  return context;
}
function assertScope(context: DemoContext & { authEpoch?: number }, scope: DemoScope): void {
  if (!isCurrentDemoContext(context) || scope.detail.id !== context.classId || scope.slot.id !== context.slotId) throw new DOMException('Demo context changed', 'AbortError');
}
function requirePresentStudent(scope: DemoScope, studentId: string): StudentAttendance {
  const student = scope.slot.studentAttendance.find((item) => item.studentId === studentId);
  if (!student) throw new Error('Không tìm thấy học sinh trong buổi Demo hiện tại');
  if (!isPresent(student)) throw new Error('Học sinh vắng — không chấm Demo');
  return student;
}
function requireDraft(studentId: string): DemoDraft { const draft = useDemoStore.getState().drafts[studentId]; if (!draft) throw new Error('Điểm Demo chưa sẵn sàng'); return draft; }
function requireSchema(): DemoResolvedSchema { const schema = useDemoStore.getState().schema; if (!schema) throw new Error('Schema điểm Demo chưa sẵn sàng'); return schema; }
function cloneDraft(draft: DemoDraft): DemoDraft { return { scores: { ...draft.scores }, autoRate: draft.autoRate, version: draft.version }; }
function normalizeRandomRange(minScore: number, maxScore: number): DemoRandomRange {
  const min = Math.max(0, Math.min(5, Number.isFinite(minScore) ? Math.round(minScore * 4) / 4 : 3.75));
  const max = Math.max(min, Math.min(5, Number.isFinite(maxScore) ? Math.round(maxScore * 4) / 4 : 5));
  return { minScore: min, maxScore: max };
}
function sameContext(left: DemoContext | null, right: DemoContext): boolean { return left?.classId === right.classId && left.slotId === right.slotId && left.epoch === right.epoch; }
function createDemoController(): AbortController { const controller = createOperationController(); contextControllers.add(controller); controller.signal.addEventListener('abort', () => contextControllers.delete(controller), { once: true }); return controller; }
function releaseDemoController(controller: AbortController) { contextControllers.delete(controller); releaseOperationController(controller); }
function abortDemoOperations() { for (const controller of contextControllers) controller.abort(); contextControllers.clear(); }
function isAbort(error: unknown): boolean { return error instanceof DOMException && error.name === 'AbortError'; }
function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error || 'Lỗi không xác định'); }
function formatScore(value: number): string { return String(Math.round(value * 100) / 100); }
async function refetchCurrentClass(context: DemoContext, successfulIds: string[] = []): Promise<boolean> {
  if (!isCurrentDemoContext(context)) return false;
  try {
    await appQueryClient().refetchQueries({ queryKey: classDetailQuery(context.classId).queryKey, exact: true });
    if (isCurrentDemoContext(context)) {
      reconcileClassSubmissionsAfterRefetch({ classId: context.classId, slotId: context.slotId, studentIds: successfulIds, mode: 'demo' });
    }
    return isCurrentDemoContext(context);
  } catch {
    if (isCurrentDemoContext(context) && successfulIds.length) {
      applyOptimisticClassSubmissions({ classId: context.classId, slotId: context.slotId, studentIds: successfulIds, mode: 'demo' });
    }
    return false;
  }
}

export function resetDemoController(): void { epoch += 1; activeContext = null; abortDemoOperations(); }
registerWorkflowReset(resetDemoController);

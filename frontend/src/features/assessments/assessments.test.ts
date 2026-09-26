import type { Assessment, LearningLevel, Slot } from '@tool-lms/contracts';
import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { transitionAuthContext } from '../../lib/operationContext';
import { activateAssessmentContext, queueLearningLevelAutosave, resetAssessmentController, saveBulkLearningLevel, saveFullAssessment } from './autosaveController';
import { useAssessmentStore } from './assessmentStore';
import { assessmentDraft, assessmentStatus, hasDirtyAssessments, isProductProgressSession, levelCatalog, presentStudentIds, previousRegularSlotIds, showsStorageProductColumn } from './selectors';

const timestamps = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };

beforeEach(() => {
  vi.restoreAllMocks();
  resetAssessmentController();
  useAssessmentStore.getState().reset();
});

describe('assessment selectors and store', () => {
  it('uses product-progress labels for sessions 10-13 and regular labels otherwise', () => {
    expect(isProductProgressSession(9)).toBe(false);
    expect(isProductProgressSession(10)).toBe(true);
    expect(isProductProgressSession(13)).toBe(true);
    expect(isProductProgressSession(14)).toBe(false);
    expect(showsStorageProductColumn(9)).toBe(false);
    expect(showsStorageProductColumn(10)).toBe(true);
    expect(showsStorageProductColumn(14)).toBe(true);
    expect(levelCatalog(12).independent.shortLabel).toBe('Vượt tiến độ');
    expect(levelCatalog(4).independent.shortLabel).toBe('Nắm vững');
  });

  it('orders strictly previous slot indexes nearest first and caps them at 100', () => {
    const slots = [slot('future', 8), slot('oldest', 0), slot('current', 5), slot('nearest', 4), slot('middle', 2)];
    expect(previousRegularSlotIds(slots, 'current')).toEqual(['nearest', 'middle', 'oldest']);
    const many = [slot('current-large', 200), ...Array.from({ length: 150 }, (_, index) => slot(`slot-${index}`, index))];
    const previous = previousRegularSlotIds(many, 'current-large');
    expect(previous).toHaveLength(100);
    expect(previous[0]).toBe('slot-149');
    expect(previous.at(-1)).toBe('slot-50');
  });

  it('hydrates current records over inherited values, blanks inherited notes, and defaults to L3', () => {
    const context = activateAssessmentContext('class-1', 'slot-current');
    useAssessmentStore.getState().hydrate(context, [
      assessment('student-current', 'independent', false, 'Ghi chú hiện tại'),
      assessment('student-history', 'needs_support', true, ''),
    ]);
    const state = useAssessmentStore.getState();
    expect(state.synced['student-current']).toEqual({ learningLevel: 'independent', note: 'Ghi chú hiện tại' });
    expect(state.inherited['student-history']).toEqual({ learningLevel: 'needs_support', sourceSlotId: 'slot-old' });
    expect(assessmentDraft(state, 'student-history')).toEqual({ learningLevel: 'needs_support', note: '' });
    expect(assessmentDraft(state, 'student-new')).toEqual({ learningLevel: 'understands_and_asks', note: '' });
    expect(assessmentStatus(state, 'student-history').kind).toBe('inherited');
    expect(assessmentStatus(state, 'student-new').text).toContain('Mặc định L3');
  });

  it('updates teacher note draft/touched without saving and uses immutable Sets', () => {
    const context = activateAssessmentContext('class-1', 'slot-current');
    useAssessmentStore.getState().hydrate(context, []);
    const oldTouched = useAssessmentStore.getState().touched;
    useAssessmentStore.getState().setNoteDraft('student-1', '  Chi tiết  ');
    expect(useAssessmentStore.getState().drafts['student-1'].note).toBe('  Chi tiết  ');
    expect(useAssessmentStore.getState().touched).not.toBe(oldTouched);
    expect(hasDirtyAssessments(useAssessmentStore.getState())).toBe(true);
  });

  it('ignores out-of-order load hydration after switching away and back', () => {
    const oldContext = activateAssessmentContext('class-1', 'slot-current');
    activateAssessmentContext('class-1', 'slot-other');
    const currentContext = activateAssessmentContext('class-1', 'slot-current');
    useAssessmentStore.getState().hydrate(oldContext, [assessment('student-1', 'needs_support', false)]);
    expect(useAssessmentStore.getState().synced['student-1']).toBeUndefined();
    useAssessmentStore.getState().hydrate(currentContext, [assessment('student-1', 'independent', false)]);
    expect(useAssessmentStore.getState().synced['student-1']?.learningLevel).toBe('independent');
  });

  it('selects present students only for bulk scope', () => {
    expect(presentStudentIds([
      attendance('a', 'ATTENDED'), attendance('b', 'LATE_ARRIVED'), attendance('c', 'ABSENT_WITH_NOTICE'), attendance('d', 'ABSENT'),
    ])).toEqual(['a', 'b']);
  });
});

describe('assessment autosave controller', () => {
  it('serializes rapid L2 to L4 changes and persists latest last', async () => {
    const requests: Array<{ learningLevel: LearningLevel }> = [];
    const responses: Array<ReturnType<typeof deferred<Response>>> = [];
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, options?: RequestInit) => {
      requests.push(JSON.parse(String(options?.body)));
      const response = deferred<Response>(); responses.push(response); return response.promise;
    }));
    loadedContext();
    useAssessmentStore.getState().setLearningLevelDraft('student-1', 'needs_prompting');
    const first = queueLearningLevelAutosave('student-1');
    await until(() => requests.length === 1);
    useAssessmentStore.getState().setLearningLevelDraft('student-1', 'independent');
    const second = queueLearningLevelAutosave('student-1');
    await flush();
    expect(requests).toHaveLength(1);
    expect(requests[0].learningLevel).toBe('needs_prompting');
    responses[0].resolve(okResponse(assessment('student-1', 'needs_prompting', false)));
    await first;
    await until(() => requests.length === 2);
    expect(requests[1].learningLevel).toBe('independent');
    responses[1].resolve(okResponse(assessment('student-1', 'independent', false)));
    await second;
    expect(useAssessmentStore.getState().synced['student-1']?.learningLevel).toBe('independent');
    expect(useAssessmentStore.getState().autosaveBusy.has('student-1')).toBe(false);
  });

  it('continues serialized saves after failure and only latest token owns visible error', async () => {
    const responses: Array<ReturnType<typeof deferred<Response>>> = [];
    vi.stubGlobal('fetch', vi.fn(async () => { const response = deferred<Response>(); responses.push(response); return response.promise; }));
    loadedContext();
    useAssessmentStore.getState().setLearningLevelDraft('student-1', 'needs_prompting');
    const first = queueLearningLevelAutosave('student-1');
    await until(() => responses.length === 1);
    useAssessmentStore.getState().setLearningLevelDraft('student-1', 'independent');
    const second = queueLearningLevelAutosave('student-1');
    responses[0].resolve(errorResponse('L2 thất bại'));
    await first;
    expect(useAssessmentStore.getState().saveErrors['student-1']).toBeUndefined();
    await until(() => responses.length === 2);
    responses[1].resolve(errorResponse('L4 thất bại'));
    await second;
    expect(useAssessmentStore.getState().saveErrors['student-1']).toBe('L4 thất bại');
    expect(assessmentDraft(useAssessmentStore.getState(), 'student-1').learningLevel).toBe('independent');
  });

  it('ignores old save responses after slot switch away and back', async () => {
    const requests: Array<ReturnType<typeof deferred<Response>>> = [];
    vi.stubGlobal('fetch', vi.fn(async () => { const response = deferred<Response>(); requests.push(response); return response.promise; }));
    loadedContext();
    useAssessmentStore.getState().setLearningLevelDraft('student-1', 'needs_support');
    const oldSave = queueLearningLevelAutosave('student-1');
    await until(() => requests.length === 1);
    activateAssessmentContext('class-1', 'slot-other');
    const current = activateAssessmentContext('class-1', 'slot-current');
    useAssessmentStore.getState().hydrate(current, []);
    useAssessmentStore.getState().setLearningLevelDraft('student-1', 'independent');
    const newSave = queueLearningLevelAutosave('student-1');
    requests[0].resolve(okResponse(assessment('student-1', 'needs_support', false)));
    await oldSave;
    await until(() => requests.length === 2);
    expect(useAssessmentStore.getState().synced['student-1']).toBeUndefined();
    requests[1].resolve(okResponse(assessment('student-1', 'independent', false)));
    await newSave;
    expect(useAssessmentStore.getState().synced['student-1']?.learningLevel).toBe('independent');
  });

  it('ignores old save after auth transition and clears assessment workflow state', async () => {
    const response = deferred<Response>();
    vi.stubGlobal('fetch', vi.fn(async () => response.promise));
    loadedContext();
    useAssessmentStore.getState().setLearningLevelDraft('student-1', 'independent');
    const saving = queueLearningLevelAutosave('student-1');
    await flush();
    await transitionAuthContext(new QueryClient());
    response.resolve(okResponse(assessment('student-1', 'independent', false)));
    await saving;
    expect(useAssessmentStore.getState().context).toBeNull();
    expect(useAssessmentStore.getState().synced).toEqual({});
  });

  it('explicit save trims note, persists current level, and turns inherited state current', async () => {
    let requestBody: { learningLevel: LearningLevel; note: string } | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, options?: RequestInit) => {
      requestBody = JSON.parse(String(options?.body));
      return okResponse(assessment('student-1', 'independent', false, 'Chi tiết'));
    }));
    const context = activateAssessmentContext('class-1', 'slot-current');
    useAssessmentStore.getState().hydrate(context, [assessment('student-1', 'needs_support', true)]);
    useAssessmentStore.getState().setLearningLevelDraft('student-1', 'independent');
    useAssessmentStore.getState().setNoteDraft('student-1', '  Chi tiết  ');
    const changed = await saveFullAssessment('student-1');
    expect(changed).toBe(true);
    expect(requestBody).toMatchObject({ classId: 'class-1', learningLevel: 'independent', note: 'Chi tiết' });
    expect(useAssessmentStore.getState().inherited['student-1']).toBeUndefined();
    expect(useAssessmentStore.getState().synced['student-1']).toEqual({ learningLevel: 'independent', note: 'Chi tiết' });
    expect(hasDirtyAssessments(useAssessmentStore.getState())).toBe(false);
  });

  it('bulk save runs at concurrency three and rolls back only failed students', async () => {
    let active = 0; let maxActive = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const studentId = new URL(typeof input === 'string' ? `http://local${input}` : input.toString()).pathname.split('/').at(-1)!;
      active += 1; maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return studentId === 'student-2' ? errorResponse('Không lưu được Bình') : okResponse(assessment(studentId, 'independent', false, studentId === 'student-1' ? 'Giữ ghi chú' : ''));
    }));
    const context = activateAssessmentContext('class-1', 'slot-current');
    useAssessmentStore.getState().hydrate(context, [
      assessment('student-1', 'needs_prompting', false, 'Giữ ghi chú'),
      assessment('student-2', 'needs_support', false, 'Ghi chú Bình'),
      assessment('student-3', 'understands_and_asks', false, ''),
      assessment('student-4', 'needs_prompting', false, ''),
    ]);
    const result = await saveBulkLearningLevel(['student-1', 'student-2', 'student-3', 'student-4'], 'independent', 3);
    expect(maxActive).toBe(3);
    expect(result.successfulIds).toHaveLength(3);
    expect(result.failures.map((item) => item.studentId)).toEqual(['student-2']);
    expect(assessmentDraft(useAssessmentStore.getState(), 'student-1')).toEqual({ learningLevel: 'independent', note: 'Giữ ghi chú' });
    expect(assessmentDraft(useAssessmentStore.getState(), 'student-2')).toEqual({ learningLevel: 'needs_support', note: 'Ghi chú Bình' });
    expect(useAssessmentStore.getState().bulkBusy).toBe(false);
  });
});

function loadedContext() {
  const context = activateAssessmentContext('class-1', 'slot-current');
  useAssessmentStore.getState().hydrate(context, []);
  return context;
}

function assessment(studentId: string, learningLevel: LearningLevel, inherited: boolean, note = ''): Assessment {
  const base = { id: `assessment-${studentId}`, classId: 'class-1', studentId, learningLevel, ...timestamps };
  return inherited
    ? { ...base, slotId: 'slot-old', sourceSlotId: 'slot-old', inherited: true, note: '' }
    : { ...base, slotId: 'slot-current', sourceSlotId: 'slot-current', inherited: false, note };
}

function slot(id: string, index: number): Slot { return { id, index, date: null, summary: '', studentAttendance: [] }; }
function attendance(studentId: string, status: string) { return { id: `attendance-${studentId}`, studentId, displayName: studentId, status, commentByAreas: [] }; }
function envelope(assessmentValue: Assessment) { return { success: true, data: { assessment: assessmentValue }, requestId: 'assessment-test' }; }
function okResponse(value: Assessment) { return new Response(JSON.stringify(envelope(value)), { status: 200, headers: { 'content-type': 'application/json' } }); }
function errorResponse(message: string) { return new Response(JSON.stringify({ success: false, error: { code: 'UPSTREAM_ERROR', message, requestId: 'assessment-error' } }), { status: 500, headers: { 'content-type': 'application/json' } }); }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; }
async function flush() { await Promise.resolve(); await Promise.resolve(); }
async function until(predicate: () => boolean) { for (let attempt = 0; attempt < 50; attempt += 1) { if (predicate()) return; await flush(); } throw new Error('condition not reached'); }

import type { ClassDetail } from '@tool-lms/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { appQueryClient } from '../../app/providers';
import { transitionAuthContext } from '../../lib/operationContext';
import { activateAssessmentContext, resetAssessmentController } from '../assessments/autosaveController';
import { useAssessmentStore } from '../assessments/assessmentStore';
import { useClassWorkspaceStore } from '../classes/store';
import { useCommentStore } from './commentStore';
import { activateCommentContext, generateBatchComments, generateSingleComment, resetCommentController, saveSessionSummary, submitBatchComments, submitSingleComment } from './generationController';

const detail = makeDetail(7);
const slot = detail.slots[0];
const envelope = (data: unknown) => ({ success: true, data, requestId: 'comment-controller-test' });

beforeEach(() => {
  localStorage.clear();
  appQueryClient().clear();
  resetAssessmentController();
  resetCommentController();
  useAssessmentStore.getState().reset();
  useCommentStore.getState().reset();
  useClassWorkspaceStore.getState().reset();
  useClassWorkspaceStore.getState().setClassId('class-1');
  useClassWorkspaceStore.getState().setSlotIndex('0');
  useClassWorkspaceStore.getState().setStudentId('student-1');
  const assessmentContext = activateAssessmentContext('class-1', 'slot-1');
  useAssessmentStore.getState().hydrate(assessmentContext, []);
  activateCommentContext('class-1', 'slot-1', 'Vòng lặp');
});
afterEach(() => { vi.unstubAllGlobals(); appQueryClient().clear(); });

describe('regular comment generation controller', () => {
  it('persists the newest full assessment before one explicit AI request and never auto-submits', async () => {
    const calls: Array<{ path: string; method: string; body?: Record<string, unknown> }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = pathOf(input); const method = init?.method || 'GET'; const body = bodyOf(init);
      calls.push({ path, method, body });
      if (path === '/api/v2/config') return json(envelope(config()));
      if (path.includes('/assessments/student-1')) return json(envelope({ assessment: assessment('student-1', body.learningLevel as string, body.note as string) }));
      if (path === '/api/v2/comments/generate') return json(envelope({ comment: '<p>An chủ động hoàn thành bài.</p>', meta: { source: 'ai', transport: 'server', validationIssues: [] } }));
      throw new Error(`Unhandled ${method} ${path}`);
    }));
    useAssessmentStore.getState().setLearningLevelDraft('student-1', 'independent');
    useAssessmentStore.getState().setNoteDraft('student-1', '  Hoàn thành nhanh  ');
    const meta = await generateSingleComment(scope('student-1'), 'student-1');
    expect(meta.source).toBe('ai');
    expect(calls.map((call) => call.path)).toEqual(['/api/v2/config', '/api/v2/slots/slot-1/assessments/student-1', '/api/v2/comments/generate']);
    expect(calls[1].body).toEqual({ classId: 'class-1', learningLevel: 'independent', note: 'Hoàn thành nhanh' });
    expect(calls[2].body).toMatchObject({ classId: 'class-1', slotId: 'slot-1', studentId: 'student-1', studentName: 'Học sinh 1', learningLevel: 'independent', teacherNote: 'Hoàn thành nhanh', sessionSummary: 'Vòng lặp', sessionNumber: 1 });
    expect(calls.some((call) => call.path.includes('/comments/submit'))).toBe(false);
    expect(useCommentStore.getState().drafts['student-1']).toMatchObject({ content: 'An chủ động hoàn thành bài.', kind: 'generated' });
  });

  it('allows a no-key Antigravity request when the server has no OpenRouter key', async () => {
    let generationBody: Record<string, unknown> = {};
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = pathOf(input); const body = bodyOf(init);
      if (path === '/api/v2/config') return json(envelope(config(false)));
      if (path.includes('/assessments/student-1')) return json(envelope({ assessment: assessment('student-1', body.learningLevel as string, body.note as string) }));
      if (path === '/api/v2/comments/generate') {
        generationBody = body;
        return json(envelope({ comment: 'No-key Antigravity result', meta: { source: 'ai', transport: 'server', validationIssues: [] } }));
      }
      throw new Error(`Unhandled ${path}`);
    }));

    await generateSingleComment(scope('student-1'), 'student-1');
    expect(generationBody).toMatchObject({ modelId: 'gpt-5.4', studentId: 'student-1' });
    expect(generationBody).not.toHaveProperty('apiKey');
    expect(useCommentStore.getState().drafts['student-1']?.content).toBe('No-key Antigravity result');
  });

  it.each(['class', 'slot', 'auth'] as const)('ignores a stale single generation result after a %s change', async (change) => {
    const generated = deferred<Response>();
    let generationCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = pathOf(input); const body = bodyOf(init);
      if (path === '/api/v2/config') return json(envelope(config(false)));
      if (path.includes('/assessments/student-1')) return json(envelope({ assessment: assessment('student-1', body.learningLevel as string, body.note as string) }));
      if (path === '/api/v2/comments/generate') { generationCalls += 1; return generated.promise; }
      throw new Error(`Unhandled ${path}`);
    }));

    const operation = generateSingleComment(scope('student-1'), 'student-1');
    await until(() => generationCalls === 1);
    await invalidateContext(change);
    generated.resolve(json(envelope({ comment: 'stale single', meta: { source: 'ai', transport: 'server', validationIssues: [] } })));
    await expect(operation).resolves.toMatchObject({ source: 'ai' });
    expect(useCommentStore.getState().drafts['student-1']).toBeUndefined();
  });

  it.each(['class', 'slot', 'auth'] as const)('ignores stale batch generation results after a %s change', async (change) => {
    const generated = deferred<Response>();
    let generationCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = pathOf(input); const body = bodyOf(init);
      if (path === '/api/v2/config') return json(envelope(config(false)));
      if (path.includes('/assessments/student-1')) return json(envelope({ assessment: assessment('student-1', body.learningLevel as string, body.note as string) }));
      if (path === '/api/v2/comments/generate') { generationCalls += 1; return generated.promise; }
      throw new Error(`Unhandled ${path}`);
    }));

    const operation = generateBatchComments(scope(null), ['student-1']);
    await until(() => generationCalls === 1);
    await invalidateContext(change);
    generated.resolve(json(envelope({ comment: 'stale batch', meta: { source: 'ai', transport: 'server', validationIssues: [] } })));
    await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    expect(useCommentStore.getState().drafts['student-1']).toBeUndefined();
  });

  it('keeps the confirmed batch scope frozen when workspace filters mutate', async () => {
    const generatedIds: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = pathOf(input); const body = bodyOf(init);
      if (path === '/api/v2/config') return json(envelope(config(false)));
      if (path.includes('/assessments/')) {
        useClassWorkspaceStore.getState().setSearch('Học sinh 7');
        useClassWorkspaceStore.getState().setAttendance('absent');
        const id = path.split('/').at(-1)!;
        return json(envelope({ assessment: assessment(id, body.learningLevel as string, body.note as string) }));
      }
      if (path === '/api/v2/comments/generate') {
        generatedIds.push(String(body.studentId));
        return json(envelope({ comment: `${body.studentId} generated`, meta: { source: 'ai', transport: 'server', validationIssues: [] } }));
      }
      throw new Error(`Unhandled ${path}`);
    }));

    const result = await generateBatchComments(scope(null), ['student-1', 'student-2']);
    expect(generatedIds).toEqual(['student-1', 'student-2']);
    expect(result.successfulIds).toEqual(['student-1', 'student-2']);
  });

  it('does not generate when the required assessment save fails', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = pathOf(input); calls.push(path);
      if (path === '/api/v2/config') return json(envelope(config(false)));
      if (path.includes('/assessments/student-1')) return json({ success: false, error: { code: 'UPSTREAM_ERROR', message: 'Không lưu được đánh giá', requestId: 'assessment-failed' } }, 502);
      throw new Error(`Generation must not run after assessment failure: ${path}`);
    }));
    useAssessmentStore.getState().setNoteDraft('student-1', 'Buộc lưu');

    await expect(generateSingleComment(scope('student-1'), 'student-1')).rejects.toThrow('Không lưu được đánh giá');
    expect(calls).toEqual(['/api/v2/config', '/api/v2/slots/slot-1/assessments/student-1']);
    expect(useCommentStore.getState().drafts['student-1']).toBeUndefined();
  });

  it('persists with concurrency three, then runs sequential AI groups of three and retains per-student failures', async () => {
    let assessmentActive = 0; let maxAssessmentActive = 0; let aiActive = 0; let maxAiActive = 0; const aiStarts: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = pathOf(input); const body = bodyOf(init);
      if (path === '/api/v2/config') return json(envelope(config()));
      if (path.includes('/assessments/')) {
        assessmentActive += 1; maxAssessmentActive = Math.max(maxAssessmentActive, assessmentActive);
        await delay(8); assessmentActive -= 1;
        const id = path.split('/').at(-1)!;
        return json(envelope({ assessment: assessment(id, body.learningLevel as string, body.note as string) }));
      }
      if (path === '/api/v2/comments/generate') {
        const id = String(body.studentId); aiStarts.push(id); aiActive += 1; maxAiActive = Math.max(maxAiActive, aiActive);
        await delay(10); aiActive -= 1;
        if (id === 'student-2') return json({ success: false, error: { code: 'UPSTREAM_ERROR', message: 'AI tạm lỗi', requestId: 'failed-ai' } }, 502);
        return json(envelope({ comment: `${id} generated`, meta: { source: id === 'student-3' ? 'safe_template' : 'ai', transport: 'server', validationIssues: [] } }));
      }
      throw new Error(`Unhandled ${path}`);
    }));
    const result = await generateBatchComments(scope(null), slot.studentAttendance.map((student) => student.studentId));
    expect(maxAssessmentActive).toBe(3);
    expect(maxAiActive).toBe(3);
    expect(aiStarts.slice(0, 3)).toEqual(['student-1', 'student-2', 'student-3']);
    expect(result).toMatchObject({ total: 7, safeTemplateCount: 1 });
    expect(result.successfulIds).toHaveLength(6);
    expect(result.failures).toEqual([{ studentId: 'student-2', message: 'AI tạm lỗi' }]);
    expect(useCommentStore.getState().drafts['student-2']).toBeUndefined();
    expect(useCommentStore.getState().errors['student-2']).toBe('AI tạm lỗi');
  });
});

describe('regular comment submission controller', () => {
  it('uses the explicit v2 summary action and only marks the controlled draft synced after success', async () => {
    let requestBody: Record<string, unknown> = {};
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = pathOf(input); requestBody = bodyOf(init);
      if (path === '/api/v2/slots/slot-1/summary') return json(envelope({ slotId: 'slot-1', summary: requestBody.summary, saved: true }));
      throw new Error(`Unhandled ${path}`);
    }));
    useCommentStore.getState().setSummaryDraft('  Nội dung buổi học  ');
    await saveSessionSummary(scope('student-1'));
    expect(requestBody).toEqual({ classId: 'class-1', summary: 'Nội dung buổi học' });
    expect(useCommentStore.getState().summarySynced).toBe('Nội dung buổi học');
  });

  it('single submit omits cleared AI provenance and preserves sibling drafts', async () => {
    let submitted: Record<string, unknown> = {};
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = pathOf(input); const body = bodyOf(init);
      if (path.includes('/assessments/student-1')) return json(envelope({ assessment: assessment('student-1', body.learningLevel as string, body.note as string) }));
      if (path === '/api/v2/slots/slot-1/comments/submit') {
        submitted = body;
        return json(envelope({ slotId: 'slot-1', studentId: 'student-1', attendanceId: 'attendance-1', submitted: true, summaryIncluded: true, logged: true }));
      }
      throw new Error(`Unhandled ${path}`);
    }));
    useCommentStore.getState().setDraft('student-1', { content: 'AI draft', kind: 'generated', generationMeta: { source: 'ai', transport: 'server', validationIssues: [] } });
    useCommentStore.getState().editDraft('student-1', 'Giáo viên sửa AI draft');
    useCommentStore.getState().setDraft('student-2', { content: 'Sibling draft', kind: 'manual', generationMeta: null });

    const result = await submitSingleComment(scope('student-1'), 'student-1');
    expect(submitted).toEqual({
      classId: 'class-1', studentId: 'student-1', attendanceId: 'attendance-1', comment: 'Giáo viên sửa AI draft',
      summary: 'Vòng lặp', learningLevel: 'understands_and_asks',
    });
    expect(result.successfulIds).toEqual(['student-1']);
    expect(useCommentStore.getState().drafts).toEqual({ 'student-2': { content: 'Sibling draft', kind: 'manual', generationMeta: null } });
  });

  it('batch submit omits AI provenance from edited manual requests but retains it for unedited generated drafts', async () => {
    const submitBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = pathOf(input); const body = bodyOf(init);
      if (path.includes('/assessments/')) {
        const id = path.split('/').at(-1)!;
        return json(envelope({ assessment: assessment(id, body.learningLevel as string, body.note as string) }));
      }
      if (path === '/api/v2/slots/slot-1/comments/submit') {
        submitBodies.push(body);
        return json(envelope({ slotId: 'slot-1', studentId: body.studentId, attendanceId: body.attendanceId, submitted: true, summaryIncluded: body.summary !== undefined, logged: true }));
      }
      throw new Error(`Unhandled ${path}`);
    }));
    const aiMeta = { source: 'ai' as const, transport: 'server' as const, validationIssues: [] };
    useCommentStore.getState().setDraft('student-1', { content: 'Generated one', kind: 'generated', generationMeta: aiMeta });
    useCommentStore.getState().editDraft('student-1', 'Edited one');
    useCommentStore.getState().setDraft('student-2', { content: 'Generated two', kind: 'generated', generationMeta: aiMeta });

    await submitBatchComments(scope(null), ['student-1', 'student-2']);
    expect(submitBodies[0]).not.toHaveProperty('generationMeta');
    expect(submitBodies[0]).toMatchObject({ studentId: 'student-1', comment: 'Edited one', summary: 'Vòng lặp' });
    expect(submitBodies[1]).toMatchObject({ studentId: 'student-2', comment: 'Generated two', generationMeta: aiMeta });
  });

  it('uses an explicit frozen Review snapshot even if canonical content and summary change before execution', async () => {
    const submitBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = pathOf(input); const body = bodyOf(init);
      if (path.includes('/assessments/')) return json(envelope({ assessment: assessment('student-1', body.learningLevel as string, body.note as string) }));
      if (path === '/api/v2/slots/slot-1/comments/submit') { submitBodies.push(body); return json(envelope({ slotId: 'slot-1', studentId: body.studentId, attendanceId: body.attendanceId, submitted: true, summaryIncluded: true, logged: true })); }
      throw new Error(`Unhandled ${path}`);
    }));
    const frozenDraft = { content: 'Nội dung tại lúc xác nhận', kind: 'manual' as const, generationMeta: null };
    useCommentStore.getState().setDraft('student-1', frozenDraft);
    useCommentStore.getState().editDraft('student-1', 'Nội dung thay đổi sau xác nhận');
    useCommentStore.getState().setSummaryDraft('Tổng kết thay đổi');

    await submitBatchComments(scope(null), ['student-1'], { drafts: { 'student-1': frozenDraft }, summary: 'Tổng kết đã chụp' });
    expect(submitBodies).toHaveLength(1);
    expect(submitBodies[0]).toMatchObject({ studentId: 'student-1', comment: 'Nội dung tại lúc xác nhận', summary: 'Tổng kết đã chụp' });
    expect(useCommentStore.getState().drafts['student-1']?.content).toBe('Nội dung thay đổi sau xác nhận');
  });

  it('does not submit when the required assessment save fails', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const path = pathOf(input); calls.push(path);
      if (path.includes('/assessments/student-1')) return json({ success: false, error: { code: 'UPSTREAM_ERROR', message: 'Không lưu được đánh giá', requestId: 'assessment-failed' } }, 502);
      throw new Error(`Submit must not run after assessment failure: ${path}`);
    }));
    useAssessmentStore.getState().setNoteDraft('student-1', 'Buộc lưu');
    useCommentStore.getState().setDraft('student-1', { content: 'Draft', kind: 'manual', generationMeta: null });

    await expect(submitSingleComment(scope('student-1'), 'student-1')).rejects.toThrow('Không lưu được đánh giá');
    expect(calls).toEqual(['/api/v2/slots/slot-1/assessments/student-1']);
    expect(useCommentStore.getState().drafts['student-1']?.content).toBe('Draft');
  });

  it('submits sequentially, keeps summary attached until the first success, and removes only successful drafts', async () => {
    const submitBodies: Array<Record<string, unknown>> = [];
    let submitIndex = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = pathOf(input); const body = bodyOf(init);
      if (path.includes('/assessments/')) {
        const id = path.split('/').at(-1)!;
        return json(envelope({ assessment: assessment(id, body.learningLevel as string, body.note as string) }));
      }
      if (path === '/api/v2/slots/slot-1/comments/submit') {
        submitBodies.push(body); submitIndex += 1;
        if (submitIndex === 1) return json({ success: false, error: { code: 'UPSTREAM_ERROR', message: 'LMS tạm lỗi', requestId: 'submit-failed' } }, 502);
        return json(envelope({ slotId: 'slot-1', studentId: body.studentId, attendanceId: body.attendanceId, submitted: true, summaryIncluded: body.summary !== undefined, logged: true }));
      }
      throw new Error(`Unhandled ${path}`);
    }));
    for (const id of ['student-1', 'student-2', 'student-3']) useCommentStore.getState().setDraft(id, { content: `${id} draft`, kind: id === 'student-1' ? 'manual' : 'generated', generationMeta: null });
    const result = await submitBatchComments(scope(null), ['student-1', 'student-2', 'student-3']);
    expect(submitBodies.map((body) => body.studentId)).toEqual(['student-1', 'student-2', 'student-3']);
    expect(submitBodies.map((body) => body.summary)).toEqual(['Vòng lặp', 'Vòng lặp', undefined]);
    expect(result.successfulIds).toEqual(['student-2', 'student-3']);
    expect(result.failures).toEqual([{ studentId: 'student-1', message: 'LMS tạm lỗi' }]);
    expect(useCommentStore.getState().drafts['student-1']?.content).toBe('student-1 draft');
    expect(useCommentStore.getState().drafts['student-2']).toBeUndefined();
    expect(useCommentStore.getState().drafts['student-3']).toBeUndefined();
    expect(useCommentStore.getState().summarySynced).toBe('Vòng lặp');
  });
});

function scope(selectedStudentId: string | null) { return { detail, slot, sessionNumber: 1, selectedStudentId }; }
function config(hasOpenRouterKey = true) { return { aiModel: 'gpt-5.4', customModelId: '', thinkingLevel: 'high', thinkingLevels: ['off', 'high'], hasOpenRouterKey }; }
async function invalidateContext(change: 'class' | 'slot' | 'auth') {
  if (change === 'auth') {
    await transitionAuthContext(appQueryClient());
    return;
  }
  const classId = change === 'class' ? 'class-2' : 'class-1';
  const slotId = change === 'slot' ? 'slot-2' : 'slot-1';
  useClassWorkspaceStore.getState().setClassId(classId);
  useClassWorkspaceStore.getState().setSlotIndex('0');
  activateCommentContext(classId, slotId, 'Ngữ cảnh mới');
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
async function until(predicate: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await delay(1);
  }
  throw new Error('Condition not reached');
}
function assessment(studentId: string, learningLevel: string, note: string) { return { id: `assessment-${studentId}`, classId: 'class-1', slotId: 'slot-1', studentId, learningLevel, note, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', inherited: false, sourceSlotId: 'slot-1' }; }
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } }); }
function pathOf(input: RequestInfo | URL) { return new URL(typeof input === 'string' ? `http://local${input}` : input instanceof URL ? input : input.url).pathname; }
function bodyOf(init?: RequestInit): Record<string, unknown> { return init?.body ? JSON.parse(String(init.body)) : {}; }
function delay(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function makeDetail(count: number): ClassDetail {
  const common = { id: 'class-1', name: 'Lớp A', status: 'RUNNING', startDate: null, endDate: null, recentlyEnded: false, course: null, sites: [], slotCount: 1, commentProgress: { state: 'pending' as const, badgeText: 'Chưa nhận xét' as const, slotNumber: 1, present: count, completed: 0, missing: count }, courseProcessId: null, courseProcess: null };
  return { ...common, slots: [{ id: 'slot-1', index: 0, date: '2026-01-01', summary: '<p>Vòng lặp</p>', studentAttendance: Array.from({ length: count }, (_, index) => ({ id: `attendance-${index + 1}`, studentId: `student-${index + 1}`, displayName: `Học sinh ${index + 1}`, status: 'ATTENDED', commentByAreas: [] })) }] };
}

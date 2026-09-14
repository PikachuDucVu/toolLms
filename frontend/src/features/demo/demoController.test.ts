import type { ClassDetail, DemoResolvedSchema, Slot } from '@tool-lms/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { activateDemoContext, captureDemoBatch, hydrateDemoContext, prepareDemoBatch, randomizeDemoStudent, randomizePresentDemoStudents, resetDemoController, submitDemoBatch, submitSingleDemo, validateDemoDraft } from './demoController';
import { isDemoOperationActive, useDemoStore } from './demoStore';

const schema: DemoResolvedSchema = { source: 'fallback', fallbackKind: 'GA', label: 'Demo2024 | GA', maxScore: 3, questions: [{ id: 'q-1', title: 'Sản phẩm', maxScore: 2 }, { id: 'q-2', title: 'Trình bày', maxScore: 1 }] };
const slot: Slot = { id: 'slot-14', index: 13, date: null, summary: '<p>Tổng kết Demo</p>', studentAttendance: [
  { id: 'attendance-1', studentId: 'student-1', displayName: 'An', status: 'ATTENDED', commentByAreas: [] },
  { id: 'attendance-2', studentId: 'student-2', displayName: 'Bình', status: 'LATE_ARRIVED', commentByAreas: [] },
  { id: 'attendance-3', studentId: 'student-3', displayName: 'Chi', status: 'ABSENT_WITH_NOTICE', commentByAreas: [] },
] };
const detail: ClassDetail = {
  id: 'class-1', name: 'Lớp Demo', status: 'RUNNING', startDate: null, endDate: null, recentlyEnded: false, course: null, sites: [], slotCount: 1,
  commentProgress: { state: 'unknown', badgeText: 'Chưa có dữ liệu', slotNumber: null, present: null, completed: null, missing: null }, courseProcessId: 'process-1', courseProcess: null, slots: [slot],
};
const scope = { detail, slot };

beforeEach(() => {
  resetDemoController(); useDemoStore.getState().reset();
  const context = activateDemoContext(detail.id, slot.id, 'Tổng kết Demo');
  hydrateDemoContext(context, schema, slot, 'Tổng kết Demo');
});
afterEach(() => vi.unstubAllGlobals());

describe('Demo controllers', () => {
  it('validates quarter-step bounded custom scores and a positive explicit score', () => {
    expect(() => validateDemoDraft(schema, { scores: { 'q-1': 2.25, 'q-2': 0 }, autoRate: true, version: 0 })).toThrow('0 đến 2');
    expect(() => validateDemoDraft(schema, { scores: { 'q-1': -0.25, 'q-2': 0 }, autoRate: true, version: 0 })).toThrow('0 đến 2');
    expect(() => validateDemoDraft(schema, { scores: { 'q-1': 1.1, 'q-2': 0 }, autoRate: true, version: 0 })).toThrow('bước 0.25');
    expect(() => validateDemoDraft(schema, { scores: { 'q-1': 0, 'q-2': 0 }, autoRate: true, version: 0 })).toThrow('Random');
    expect(validateDemoDraft(schema, { scores: { 'q-1': 1.75, 'q-2': 0.75 }, autoRate: false, version: 0 })).toEqual([{ questionId: 'q-1', score: 1.75 }, { questionId: 'q-2', score: 0.75 }]);
  });

  it('uses the backend random preview endpoint and stale-ignores a newer score edit', async () => {
    const requests: Array<{ path: string; method: string; body: unknown }> = [];
    let resolve!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
      requests.push({ path: String(input), method: options?.method || 'GET', body: options?.body ? JSON.parse(String(options.body)) : undefined });
      return new Promise<Response>((next) => { resolve = next; });
    }));
    const promise = randomizeDemoStudent(scope, 'student-1');
    expect(isDemoOperationActive()).toBe(true);
    useDemoStore.getState().setScore('student-1', 'q-1', 1.25);
    resolve(json(ok({ schema, questions: [{ ...schema.questions[0], score: 1.75 }, { ...schema.questions[1], score: 0.75 }], demoScore: 2.5 })));
    await promise;
    expect(requests).toEqual([{ path: '/api/v2/slots/slot-14/demo/random-scores', method: 'POST', body: { classId: 'class-1', minScore: 3.75, maxScore: 5 } }]);
    expect(useDemoStore.getState().drafts['student-1'].scores['q-1']).toBe(1.25);
    expect(useDemoStore.getState().previews['student-1']).toBeUndefined();
    expect(isDemoOperationActive()).toBe(false);
  });

  it('single submit freezes exact scores, autoRate, summary and student context without confirmation semantics', async () => {
    useDemoStore.getState().setScore('student-1', 'q-1', 1.75);
    useDemoStore.getState().setScore('student-1', 'q-2', 0.75);
    useDemoStore.getState().setAutoRate('student-1', false);
    useDemoStore.getState().setSummaryDraft('  Tổng kết giữ nguyên  ');
    let captured: Record<string, unknown> | null = null;
    let resolve!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, options?: RequestInit) => {
      captured = JSON.parse(String(options?.body));
      return new Promise<Response>((next) => { resolve = next; });
    }));
    const promise = submitSingleDemo(scope, 'student-1');
    useDemoStore.getState().setScore('student-1', 'q-1', 2);
    resolve(json(ok(submitResult('student-1', 'attendance-1', true, [{ ...schema.questions[0], score: 1.75 }, { ...schema.questions[1], score: 0.75 }]))));
    await promise;
    expect(captured).toEqual({ classId: 'class-1', studentId: 'student-1', attendanceId: 'attendance-1', summaryMode: 'required', summary: '  Tổng kết giữ nguyên  ', customScores: [{ questionId: 'q-1', score: 1.75 }, { questionId: 'q-2', score: 0.75 }], autoRate: false });
    expect(useDemoStore.getState().drafts['student-1'].scores['q-1']).toBe(2);
    expect(useDemoStore.getState().results['student-1']).toMatchObject({ demoScore: 2.5, abilityScore: 5, totalScore: 3.5, rank: 'C' });
    expect(isDemoOperationActive()).toBe(false);
  });

  it('randomizes only present students without existing scores and sends the selected percent range', async () => {
    useDemoStore.getState().setScore('student-1', 'q-1', 1.5);
    useDemoStore.getState().setRandomRange(4, 4.75);
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      bodies.push(options?.body ? JSON.parse(String(options.body)) as Record<string, unknown> : {});
      return json(ok({ schema, questions: [{ ...schema.questions[0], score: 1.75 }, { ...schema.questions[1], score: 0.75 }], demoScore: 2.5 }));
    }));
    const applied = await randomizePresentDemoStudents(scope);
    expect(applied).toBe(1);
    expect(bodies).toEqual([{ classId: 'class-1', minScore: 4, maxScore: 4.75 }]);
    expect(useDemoStore.getState().drafts['student-1'].scores['q-1']).toBe(1.5);
    expect(useDemoStore.getState().drafts['student-2'].scores['q-2']).toBe(0.75);
    expect(useDemoStore.getState().drafts['student-3'].scores['q-1']).toBeNull();
    expect(isDemoOperationActive()).toBe(false);
  });

  it('batch obtains missing previews before freezing, attempts sequentially, and never shifts summary after first failure', async () => {
    useDemoStore.getState().setScore('student-1', 'q-1', 1.5);
    useDemoStore.getState().setScore('student-1', 'q-2', 0.75);
    useDemoStore.getState().setAutoRate('student-1', false);
    useDemoStore.getState().setRandomRange(3.5, 4);
    useDemoStore.getState().setSummaryDraft('Tổng kết batch');
    const bodies: Array<Record<string, unknown>> = [];
    const previewBodies: Array<Record<string, unknown>> = [];
    const paths: string[] = [];
    let active = 0; let maxActive = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const path = String(input); paths.push(path); const body = options?.body ? JSON.parse(String(options.body)) as Record<string, unknown> : {};
      if (path.endsWith('/random-scores')) { previewBodies.push(body); return json(ok({ schema, questions: [{ ...schema.questions[0], score: 1.75 }, { ...schema.questions[1], score: 0.75 }], demoScore: 2.5 })); }
      bodies.push(body); active += 1; maxActive = Math.max(maxActive, active); await Promise.resolve(); active -= 1;
      if (body.studentId === 'student-1') return json({ success: false, error: { code: 'UPSTREAM_ERROR', message: 'LMS first failure', requestId: 'failure-1' } }, 502);
      return json(ok(submitResult('student-2', 'attendance-2', false, [{ ...schema.questions[0], score: 1.75 }, { ...schema.questions[1], score: 0.75 }])));
    }));
    const captured = captureDemoBatch(scope);
    expect(paths).toEqual([]);
    expect(captured.students.map((item) => item.studentId)).toEqual(['student-1', 'student-2']);
    const frozen = await prepareDemoBatch(scope, captured);
    expect(paths).toEqual(['/api/v2/slots/slot-14/demo/random-scores']);
    expect(previewBodies).toEqual([{ classId: 'class-1', minScore: 3.5, maxScore: 4 }]);
    expect(frozen.students.map((item) => item.studentId)).toEqual(['student-1', 'student-2']);
    expect(frozen.students[1].scores).toEqual([{ questionId: 'q-1', score: 1.75 }, { questionId: 'q-2', score: 0.75 }]);
    const outcome = await submitDemoBatch(scope, frozen);
    expect(maxActive).toBe(1);
    expect(outcome).toMatchObject({ total: 2, attempted: 2, successfulIds: ['student-2'], failures: [{ studentId: 'student-1', message: 'LMS first failure' }] });
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toMatchObject({ studentId: 'student-1', summaryMode: 'optional', summary: 'Tổng kết batch', autoRate: false });
    expect(bodies[1]).toMatchObject({ studentId: 'student-2', summaryMode: 'optional', autoRate: true });
    expect(bodies[1]).not.toHaveProperty('summary');
    expect(useDemoStore.getState().errors['student-1']).toBe('LMS first failure');
    expect(useDemoStore.getState().summarySynced).toBe('Tổng kết Demo');
    expect(isDemoOperationActive()).toBe(false);
  });
});

function submitResult(studentId: string, attendanceId: string, summaryIncluded: boolean, questions: Array<{ id: string; title: string; maxScore: number; score: number }>) {
  return { slotId: slot.id, studentId, attendanceId, submitted: true, summaryIncluded, logged: true, schema, questions, demoScore: 2.5, abilityScore: 5, totalScore: 3.5, rank: 'C' as const };
}
function ok(data: unknown) { return { success: true, requestId: 'demo-test', data }; }
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }); }

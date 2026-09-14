import type { CheckpointStatusResult, ClassDetail, Slot } from '@tool-lms/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activateCheckpointContext,
  captureCheckpointFullBatch,
  captureCheckpointGenerationBatch,
  captureCheckpointScoreOnlyBatch,
  checkpointExamAvailability,
  checkpointStudentStatusView,
  generateCheckpointBatch,
  generateCheckpointStudent,
  hydrateCheckpointContext,
  loadCheckpointSubmissionStatus,
  parseCheckpointScoreInputs,
  resetCheckpointController,
  submitCheckpointFullBatch,
  submitCheckpointFullSingle,
  submitCheckpointScoreOnlyBatch,
  submitCheckpointScoreOnlySingle,
} from './checkpointController';
import { isCheckpointOperationActive, useCheckpointStore } from './checkpointStore';

const students = Array.from({ length: 6 }, (_, index) => ({
  id: `attendance-${index + 1}`,
  studentId: `student-${index + 1}`,
  displayName: `Học sinh ${index + 1}`,
  status: index === 5 ? 'LATE_ARRIVED' : 'ATTENDED',
  commentByAreas: index === 0 ? [contentArea('<p>Nhận xét LMS có sẵn</p>')] : [],
}));
const slot: Slot = { id: 'slot-5', index: 4, date: null, summary: 'Tổng kết checkpoint', studentAttendance: students };
const detail: ClassDetail = {
  id: 'class-1', name: 'Lớp checkpoint', status: 'RUNNING', startDate: null, endDate: null, recentlyEnded: false, course: null, sites: [], slotCount: 5,
  commentProgress: { state: 'unknown', badgeText: 'Chưa có dữ liệu', slotNumber: null, present: null, completed: null, missing: null }, courseProcessId: 'process-1', courseProcess: null, slots: [slot],
};
const scope = { detail, slot, checkpoint: 1 as const };

beforeEach(() => {
  resetCheckpointController();
  useCheckpointStore.getState().reset();
  const context = activateCheckpointContext(detail.id, slot.id, 1, slot.summary);
  hydrateCheckpointContext(context, slot, Object.fromEntries(students.map((student) => [student.studentId, `Mô tả ${student.studentId}`])));
});
afterEach(() => vi.unstubAllGlobals());

describe('checkpoint status controller', () => {
  it('uses only the same-origin v2 proxy, server defaultBranch, and all availability/student branches', async () => {
    const paths: string[] = [];
    const responses = [statusResult('none'), statusResult('original'), statusResult('makeup'), statusResult('both')];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      paths.push(String(input));
      return json(ok(responses.shift()));
    }));

    await loadCheckpointSubmissionStatus(scope);
    expect(checkpointExamAvailability()).toBe('none');
    expect(checkpointStudentStatusView('student-1')).toEqual({ state: 'no_live_exam' });
    await loadCheckpointSubmissionStatus(scope);
    expect(checkpointExamAvailability()).toBe('original');
    expect(checkpointStudentStatusView('missing-id')).toEqual({ state: 'missing_student', availability: 'original' });
    expect(checkpointStudentStatusView('student-1')).toMatchObject({ state: 'original_only', selectedBranch: 'original' });
    await loadCheckpointSubmissionStatus(scope);
    expect(checkpointStudentStatusView('student-1')).toMatchObject({ state: 'makeup_only', selectedBranch: 'makeup' });
    await loadCheckpointSubmissionStatus(scope);
    expect(checkpointStudentStatusView('student-1')).toMatchObject({ state: 'both', selectedBranch: 'makeup' });
    expect(useCheckpointStore.getState().selectedBranches['student-1']).toBe('makeup');
    expect(paths).toEqual(Array(4).fill('/api/v2/classes/class-1/checkpoints/1/status'));
    expect(paths.every((path) => path.startsWith('/api/v2/'))).toBe(true);
    expect(isCheckpointOperationActive()).toBe(false);
  });

  it('is last-request-wins for out-of-order same-context status success and errors', async () => {
    const pending: Array<(value: Response) => void> = [];
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { pending.push(resolve); })));

    const olderError = loadCheckpointSubmissionStatus(scope);
    const newerSuccess = loadCheckpointSubmissionStatus(scope);
    pending[1](json(ok(statusResult('both'))));
    await newerSuccess;
    pending[0](json({ success: false, error: { code: 'UPSTREAM_ERROR', message: 'Old timeout', requestId: 'old-error' } }, 504));
    await olderError;
    expect(useCheckpointStore.getState().status).toBe('success');
    expect(checkpointExamAvailability()).toBe('both');
    expect(useCheckpointStore.getState().statusError).toBeNull();

    const olderSuccess = loadCheckpointSubmissionStatus(scope);
    const newerError = loadCheckpointSubmissionStatus(scope);
    pending[3](json({ success: false, error: { code: 'UPSTREAM_ERROR', message: 'Latest timeout', requestId: 'latest-error' } }, 504));
    await newerError;
    pending[2](json(ok(statusResult('original'))));
    await olderSuccess;
    expect(useCheckpointStore.getState().status).toBe('error');
    expect(useCheckpointStore.getState().statusError).toEqual({ kind: 'timeout', message: 'Latest timeout' });
    expect(useCheckpointStore.getState().statusResult).toBeNull();
  });

  it('normalizes timeout/malformed errors and stale-ignores a late response after context change', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ success: false, error: { code: 'UPSTREAM_ERROR', message: 'Dịch vụ phản hồi quá thời gian.', requestId: 'timeout' } }, 504)));
    await loadCheckpointSubmissionStatus(scope);
    expect(checkpointStudentStatusView('student-1')).toEqual({ state: 'error', error: { kind: 'timeout', message: 'Dịch vụ phản hồi quá thời gian.' } });

    vi.stubGlobal('fetch', vi.fn(async () => json({ unexpected: true })));
    await loadCheckpointSubmissionStatus(scope);
    expect(useCheckpointStore.getState().statusError?.kind).toBe('malformed');

    let resolve!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((next) => { resolve = next; })));
    const pending = loadCheckpointSubmissionStatus(scope);
    activateCheckpointContext('class-2', 'slot-9', 2);
    resolve(json(ok(statusResult('both'))));
    await pending;
    expect(useCheckpointStore.getState().context).toMatchObject({ classId: 'class-2', slotId: 'slot-9', checkpoint: 2 });
    expect(useCheckpointStore.getState().status).toBe('idle');
  });
});

describe('checkpoint generation controllers', () => {
  it('single generation sends no universal API key and preserves a newer description/comment edit', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    let resolve!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, options?: RequestInit) => {
      bodies.push(JSON.parse(String(options?.body)));
      return new Promise<Response>((next) => { resolve = next; });
    }));
    const pending = generateCheckpointStudent(scope, 'student-1', { modelId: ' model-a ', thinkingLevel: 'high', apiKey: '   ' });
    expect(isCheckpointOperationActive()).toBe(true);
    useCheckpointStore.getState().setTeacherDescription('student-1', 'Mô tả mới hơn');
    useCheckpointStore.getState().setManualComment('student-1', 'Nhận xét mới hơn');
    resolve(json(ok({ comment: '<p>AI từ mô tả cũ</p>' })));
    expect(await pending).toBe(false);
    expect(bodies).toEqual([{ classId: 'class-1', slotId: 'slot-5', studentId: 'student-1', teacherDescription: 'Mô tả student-1', modelId: 'model-a', thinkingLevel: 'high' }]);
    expect(useCheckpointStore.getState().drafts['student-1']).toMatchObject({ teacherDescription: 'Mô tả mới hơn', manualComment: 'Nhận xét mới hơn', generatedComment: '' });
    expect(isCheckpointOperationActive()).toBe(false);
  });

  it('batch freezes present IDs/descriptions, generates manual-only rows, limits concurrency to 3 and continues partial failures', async () => {
    useCheckpointStore.getState().setManualComment('student-1', 'Nhận xét thủ công không được suppress AI');
    const context = useCheckpointStore.getState().context!;
    const draft6 = useCheckpointStore.getState().drafts['student-6'];
    useCheckpointStore.getState().applyGeneratedComment('student-6', '<p>Đã có AI</p>', draft6.descriptionVersion, draft6.commentVersion);
    const frozen = captureCheckpointGenerationBatch(scope, { customModelId: 'custom/model' });
    expect(frozen.students.map((item) => item.studentId)).toEqual(['student-1', 'student-2', 'student-3', 'student-4', 'student-5']);
    useCheckpointStore.getState().setTeacherDescription('student-2', 'Mô tả sau xác nhận');
    const bodies: Array<Record<string, unknown>> = [];
    let active = 0; let maxActive = 0;
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body)) as Record<string, unknown>;
      bodies.push(body);
      active += 1; maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      if (body.studentId === 'student-3') return json({ success: false, error: { code: 'UPSTREAM_ERROR', message: 'AI lỗi riêng', requestId: 'ai-3' } }, 502);
      return json(ok({ comment: `<p>AI ${body.studentId}</p>` }));
    }));
    const outcome = await generateCheckpointBatch(scope, frozen);
    expect(context).toBe(useCheckpointStore.getState().context);
    expect(maxActive).toBe(3);
    expect(outcome).toMatchObject({ total: 5, attempted: 5, successful: 4, progress: { completed: 5, total: 5 } });
    expect(outcome.failures).toEqual([{ studentId: 'student-3', phase: 'generation', message: 'AI lỗi riêng' }]);
    expect(bodies.find((body) => body.studentId === 'student-2')?.teacherDescription).toBe('Mô tả student-2');
    expect(bodies.some((body) => 'apiKey' in body)).toBe(false);
    expect(useCheckpointStore.getState().drafts['student-1'].generatedComment).toBe('<p>AI student-1</p>');
    expect(useCheckpointStore.getState().drafts['student-1'].manualComment).toBe('Nhận xét thủ công không được suppress AI');
    expect(useCheckpointStore.getState().drafts['student-2'].generatedComment).toBe('');
    expect(useCheckpointStore.getState().rowErrors['student-3']).toEqual({ generation: 'AI lỗi riêng' });
  });
});

describe('checkpoint score parsing and submission controllers', () => {
  it('parses blank, one-sided and bounded half-step scores without client randomization', () => {
    expect(parseCheckpointScoreInputs('', '   ')).toEqual({ strategy: 'auto' });
    expect(parseCheckpointScoreInputs('4.5', '')).toEqual({ strategy: 'explicit', theoryScore: 4.5, practiceScore: null });
    expect(parseCheckpointScoreInputs('', '0')).toEqual({ strategy: 'explicit', theoryScore: null, practiceScore: 0 });
    expect(parseCheckpointScoreInputs('0', '5')).toEqual({ strategy: 'explicit', theoryScore: 0, practiceScore: 5 });
    expect(() => parseCheckpointScoreInputs('-0.5', '')).toThrow('0-5');
    expect(() => parseCheckpointScoreInputs('5.5', '')).toThrow('0-5');
    expect(() => parseCheckpointScoreInputs('4.25', '')).toThrow('bước 0.5');
    expect(() => parseCheckpointScoreInputs('abc', '')).toThrow('0-5');
  });

  it('single score-only uses generated/manual/current fallback, optional summary, and never clears comment drafts', async () => {
    useCheckpointStore.getState().setManualComment('student-1', 'Nhận xét tay');
    const draft = useCheckpointStore.getState().drafts['student-1'];
    useCheckpointStore.getState().applyGeneratedComment('student-1', '<p>AI ưu tiên</p>', draft.descriptionVersion, draft.commentVersion);
    useCheckpointStore.getState().setTheoryInput('student-1', '4.5');
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal('fetch', submitFetch(bodies));
    await submitCheckpointScoreOnlySingle(scope, 'student-1', '');
    expect(bodies[0]).toEqual({ mode: 'score_only', classId: 'class-1', studentId: 'student-1', attendanceId: 'attendance-1', summaryMode: 'optional', scores: { strategy: 'explicit', theoryScore: 4.5, practiceScore: null }, comment: '<p>AI ưu tiên</p>' });
    expect(useCheckpointStore.getState().drafts['student-1']).toMatchObject({ generatedComment: '<p>AI ưu tiên</p>', manualComment: 'Nhận xét tay' });

    useCheckpointStore.getState().clearCommentDraft('student-2');
    await submitCheckpointScoreOnlySingle(scope, 'student-2', 'Tổng kết tùy chọn');
    expect(bodies[1]).toMatchObject({ studentId: 'student-2', summaryMode: 'optional', summary: 'Tổng kết tùy chọn', scores: { strategy: 'auto' }, comment: '<p>Học sinh hoàn thành bài kiểm tra checkpoint.</p>' });
  });

  it('single full requires summary/comment, uses required mode, and preserves a newer draft while clearing an unchanged success', async () => {
    await expect(submitCheckpointFullSingle(scope, 'student-1', '')).rejects.toThrow('tổng kết');
    await expect(submitCheckpointFullSingle(scope, 'student-1', 'Tổng kết')).rejects.toThrow('nhận xét');
    useCheckpointStore.getState().setManualComment('student-1', 'Nhận xét đầy đủ');
    let resolve!: (value: Response) => void;
    const bodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body)) as Record<string, unknown>; bodies.push(body);
      return new Promise<Response>((next) => { resolve = next; });
    }));
    const pending = submitCheckpointFullSingle(scope, 'student-1', 'Tổng kết bắt buộc');
    useCheckpointStore.getState().setCurrentComment('student-1', 'Nhận xét mới trong lúc gửi');
    resolve(json(ok(submitResult('student-1', 'attendance-1', 'full', true))));
    await pending;
    expect(bodies[0]).toMatchObject({ mode: 'full', summaryMode: 'required', summary: 'Tổng kết bắt buộc', comment: 'Nhận xét đầy đủ', scores: { strategy: 'auto' } });
    expect(useCheckpointStore.getState().drafts['student-1'].currentComment).toBe('Nhận xét mới trong lúc gửi');

    vi.stubGlobal('fetch', submitFetch(bodies));
    await submitCheckpointFullSingle(scope, 'student-1', 'Tổng kết bắt buộc');
    expect(useCheckpointStore.getState().drafts['student-1']).toMatchObject({ generatedComment: '', manualComment: '', currentComment: '' });
  });

  it('stale-ignores a late submit after the class/slot context changes', async () => {
    let resolve!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((next) => { resolve = next; })));
    const pending = submitCheckpointScoreOnlySingle(scope, 'student-1');
    activateCheckpointContext('class-2', 'slot-9', 2);
    resolve(json(ok(submitResult('student-1', 'attendance-1', 'score_only', false))));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(useCheckpointStore.getState().context).toMatchObject({ classId: 'class-2', slotId: 'slot-9', checkpoint: 2 });
    expect(useCheckpointStore.getState().results).toEqual({});
    expect(isCheckpointOperationActive()).toBe(false);
  });

  it('score-only batch prevalidates before confirmation capture, freezes scope, submits sequentially, and never shifts summary after first failure', async () => {
    useCheckpointStore.getState().setTheoryInput('student-3', '4.25');
    expect(() => captureCheckpointScoreOnlyBatch(scope, 'Tổng kết batch')).toThrow('bước 0.5');
    useCheckpointStore.getState().setTheoryInput('student-3', '4.5');
    useCheckpointStore.getState().setManualComment('student-2', 'Tay student 2');
    const d1 = useCheckpointStore.getState().drafts['student-1'];
    useCheckpointStore.getState().applyGeneratedComment('student-1', '<p>AI student 1</p>', d1.descriptionVersion, d1.commentVersion);
    const frozen = captureCheckpointScoreOnlyBatch(scope, 'Tổng kết batch');
    useCheckpointStore.getState().setTheoryInput('student-3', '5');
    useCheckpointStore.getState().setManualComment('student-2', 'Bản mới sau confirm');
    const bodies: Array<Record<string, unknown>> = [];
    let active = 0; let maxActive = 0;
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, options?: RequestInit) => {
      const body = JSON.parse(String(options?.body)) as Record<string, unknown>; bodies.push(body);
      active += 1; maxActive = Math.max(maxActive, active); await Promise.resolve(); active -= 1;
      if (body.studentId === 'student-1') return json({ success: false, error: { code: 'UPSTREAM_ERROR', message: 'LMS first failed', requestId: 'submit-1' } }, 502);
      return json(ok(submitResult(String(body.studentId), `attendance-${String(body.studentId).split('-')[1]}`, 'score_only', false)));
    }));
    const outcome = await submitCheckpointScoreOnlyBatch(scope, frozen);
    expect(maxActive).toBe(1);
    expect(outcome).toMatchObject({ total: 6, attempted: 6, successful: 5, generationAttempted: 0, progress: { completed: 6, total: 6 }, reloadRequested: true });
    expect(bodies).toHaveLength(6);
    expect(bodies[0]).toMatchObject({ studentId: 'student-1', summaryMode: 'optional', summary: 'Tổng kết batch', comment: '<p>AI student 1</p>' });
    expect(bodies[1]).toMatchObject({ studentId: 'student-2', summaryMode: 'optional', comment: 'Tay student 2' });
    expect(bodies[1]).not.toHaveProperty('summary');
    expect(bodies[2]).toMatchObject({ studentId: 'student-3', scores: { strategy: 'explicit', theoryScore: 4.5, practiceScore: null } });
    expect(bodies.slice(1).every((body) => !('summary' in body))).toBe(true);
    expect(outcome.failures).toEqual([{ studentId: 'student-1', phase: 'submission', message: 'LMS first failed' }]);
    expect(useCheckpointStore.getState().drafts['student-2'].manualComment).toBe('Bản mới sau confirm');
  });

  it('full batch confirms via frozen capture, generates missing AI at concurrency 3, falls back exactly, continues failures, and clears only unchanged successes', async () => {
    const d1 = useCheckpointStore.getState().drafts['student-1'];
    useCheckpointStore.getState().applyGeneratedComment('student-1', '<p>AI có sẵn</p>', d1.descriptionVersion, d1.commentVersion);
    useCheckpointStore.getState().setManualComment('student-2', 'Manual student 2');
    useCheckpointStore.getState().setTheoryInput('student-4', '4.5');
    const frozen = captureCheckpointFullBatch(scope, { modelId: 'checkpoint-model', apiKey: '' }, 'Tổng kết full batch');
    useCheckpointStore.getState().setTheoryInput('student-4', '5');
    const generationBodies: Array<Record<string, unknown>> = [];
    const submissionBodies: Array<Record<string, unknown>> = [];
    let generationActive = 0; let generationMax = 0; let submitActive = 0; let submitMax = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, options?: RequestInit) => {
      const path = String(input);
      const body = JSON.parse(String(options?.body)) as Record<string, unknown>;
      if (path === '/api/v2/checkpoints/comments/generate') {
        generationBodies.push(body); generationActive += 1; generationMax = Math.max(generationMax, generationActive);
        await new Promise((resolve) => setTimeout(resolve, 2)); generationActive -= 1;
        if (body.studentId === 'student-3') return json({ success: false, error: { code: 'UPSTREAM_ERROR', message: 'AI student 3 failed', requestId: 'gen-3' } }, 502);
        return json(ok({ comment: `<p>AI ${body.studentId}</p>` }));
      }
      submissionBodies.push(body); submitActive += 1; submitMax = Math.max(submitMax, submitActive); await Promise.resolve(); submitActive -= 1;
      if (body.studentId === 'student-1') return json({ success: false, error: { code: 'UPSTREAM_ERROR', message: 'Submit first failed', requestId: 'sub-1' } }, 502);
      if (body.studentId === 'student-4') useCheckpointStore.getState().setCurrentComment('student-4', 'Bản mới hơn khi đang submit');
      return json(ok(submitResult(String(body.studentId), `attendance-${String(body.studentId).split('-')[1]}`, 'full', body.studentId === 'student-1')));
    }));
    const outcome = await submitCheckpointFullBatch(scope, frozen);
    expect(generationMax).toBe(3);
    expect(submitMax).toBe(1);
    expect(generationBodies.map((body) => body.studentId)).toEqual(expect.arrayContaining(['student-2', 'student-3', 'student-4', 'student-5', 'student-6']));
    expect(generationBodies.some((body) => 'apiKey' in body)).toBe(false);
    expect(submissionBodies).toHaveLength(6);
    expect(submissionBodies[0]).toMatchObject({ studentId: 'student-1', summaryMode: 'optional', summary: 'Tổng kết full batch', comment: '<p>AI có sẵn</p>' });
    expect(submissionBodies[1]).toMatchObject({ studentId: 'student-2', summaryMode: 'optional', comment: '<p>AI student-2</p>' });
    expect(submissionBodies[1]).not.toHaveProperty('summary');
    expect(submissionBodies[2]).toMatchObject({ studentId: 'student-3', comment: '<p>Học sinh hoàn thành tốt bài kiểm tra.</p>' });
    expect(submissionBodies[3]).toMatchObject({ studentId: 'student-4', scores: { strategy: 'explicit', theoryScore: 4.5, practiceScore: null } });
    expect(outcome).toMatchObject({ total: 6, attempted: 6, successful: 5, generationAttempted: 5, generationSuccessful: 4, progress: { completed: 11, total: 11 }, reloadRequested: true });
    expect(outcome.failures).toEqual(expect.arrayContaining([
      { studentId: 'student-3', phase: 'generation', message: 'AI student 3 failed' },
      { studentId: 'student-1', phase: 'submission', message: 'Submit first failed' },
    ]));
    expect(useCheckpointStore.getState().drafts['student-1'].generatedComment).toBe('<p>AI có sẵn</p>');
    expect(useCheckpointStore.getState().drafts['student-2']).toMatchObject({ generatedComment: '', manualComment: '', currentComment: '' });
    expect(useCheckpointStore.getState().drafts['student-4']).toMatchObject({ theoryInput: '5', currentComment: 'Bản mới hơn khi đang submit' });
    expect(useCheckpointStore.getState().rowErrors['student-3']).toEqual({ generation: 'AI student 3 failed' });
  });
});

function contentArea(content: string) {
  return { grade: null, content, commentAreaId: 'content-area', type: 'CONTENT', checkpoint: null, courseProcessDemoId: null, courseProcessFinalEvaluationTitle: null, courseProcessFinalEvaluationId: null, demoQuestions: [] };
}
function statusResult(kind: 'none' | 'original' | 'makeup' | 'both'): CheckpointStatusResult {
  const original = kind === 'original' || kind === 'both' ? { id: 'exam-original', branch: 'original' as const, title: 'Gốc', status: 'ACTIVE', practiceType: 'SCRATCH' } : null;
  const makeup = kind === 'makeup' || kind === 'both' ? { id: 'exam-makeup', branch: 'makeup' as const, title: 'Bù', status: 'ACTIVE', practiceType: 'ESSAY' } : null;
  const branch = (value: 'original' | 'makeup') => ({ branch: value, submittedAt: value === 'original' ? '2026-01-01T00:00:00Z' : '2026-01-02T00:00:00Z', practiceType: value === 'original' ? 'SCRATCH' : 'ESSAY', links: [] });
  return { classId: 'class-1', checkpoint: 1, original, makeup, students: kind === 'none' ? [] : [{ studentId: 'student-1', original: original ? branch('original') : null, makeup: makeup ? branch('makeup') : null, defaultBranch: makeup ? 'makeup' : 'original' }] };
}
function submitResult(studentId: string, attendanceId: string, mode: 'score_only' | 'full', summaryIncluded: boolean) {
  return { slotId: slot.id, studentId, attendanceId, submitted: true as const, mode, summaryIncluded, logged: true, theoryScore: 4.5, practiceScore: 4, totalScore: 4.3, rank: 'B' as const, questions: Array.from({ length: 10 }, (_, index) => ({ number: index + 1, correct: index < 9, score: index < 9 ? 0.5 as const : 0 as const })) };
}
function submitFetch(bodies: Array<Record<string, unknown>>) {
  return vi.fn(async (_input: RequestInfo | URL, options?: RequestInit) => {
    const body = JSON.parse(String(options?.body)) as Record<string, unknown>; bodies.push(body);
    return json(ok(submitResult(String(body.studentId), String(body.attendanceId), body.mode as 'score_only' | 'full', 'summary' in body)));
  });
}
function ok(data: unknown) { return { success: true, requestId: 'checkpoint-test', data }; }
function json(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } }); }

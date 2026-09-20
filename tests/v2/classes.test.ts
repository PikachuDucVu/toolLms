import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClassDetailResponseSchema } from '@tool-lms/contracts';
import { app } from '../../src/router';
import { normalizeClassDetail } from '../../src/services/classService';
import type { Env, SessionRecord } from '../../src/types';

const session: SessionRecord = {
  id: 'session-classes', email: 'teacher@example.com', lmsToken: 'token', tokenExpiry: 2_000_000_000,
  createdAt: 'now', updatedAt: 'now',
};

const rawDetail = {
  id: 'class-1', name: 'Lớp React', status: 'RUNNING', startDate: '2026-06-01', endDate: '2099-08-01', courseProcessId: 'process-1',
  course: { id: 'course-1', name: 'Game Creator', shortName: 'GC' }, classSites: [{ _id: 'site-1', name: 'MindX Online' }],
  courseProcess: { id: 'process-1', name: 'Process', finalSession: {
    finalEvaluations: [{ id: 'final-1', title: 'KỸ NĂNG', commentAreas: [{ id: 'final-area-1', name: 'Tư duy', type: 'RATE', rates: [{ value: 5, commentSamples: ['Tốt'] }] }] }],
    demoScore: { id: 'demo-1', commentAreas: [{ id: 'demo-area-1', name: 'Sản phẩm', type: 'DEMO', demo: { id: 'demo-detail-1', title: 'Hoàn thiện', maxScore: 5 } }] },
  } },
  slots: [{ _id: 'slot-1', index: 0, date: '2026-07-01', summary: '<p>Ôn tập</p>', studentAttendance: [{
    _id: 'attendance-1', student: { id: 'student-1', fullName: 'Nguyễn Văn An' }, status: 'ATTENDED', commentByAreas: [
      { grade: 5, content: '<p>Tiến bộ</p>', commentAreaId: 'content-1', type: 'CONTENT' },
      { grade: 4, content: 'Checkpoint', commentAreaId: 'checkpoint-area', type: 'CHECKPOINT', checkpoint: { practiceScore: 4, checkpointScore: 8, checkpointQuestions: [{ id: 'q-1', title: 'Câu 1', result: true, score: 1 }] } },
      { grade: 5, content: 'Demo', commentAreaId: 'demo-area-1', type: 'DEMO', courseProcessDemoId: 'demo-1', courseProcessFinalEvaluationTitle: 'KỸ NĂNG', courseProcessFinalEvaluationId: 'final-1', demoQuestions: [{ courseProcessDemoDetailId: 'demo-detail-1', title: 'Hoàn thiện', result: false, score: 4.5, maxScore: 5 }] },
    ],
  }] }],
  upstreamSecret: 'must-not-leak',
};

function env(noSession = false): Env {
  return {
    ASSETS: { fetch: async () => new Response('asset') },
    SESSION_CACHE: { get: async () => noSession ? null : session, put: async () => undefined, delete: async () => undefined },
    TOKEN_CACHE: { get: async () => null, put: async () => undefined },
  } as unknown as Env;
}

function request(path: string, currentEnv = env()) {
  return app.request(`http://local.test${path}`, { headers: { cookie: 'lms_session=session-classes' } }, currentEnv);
}

function mockLms(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('lms-api.mindx.edu.vn')) throw new Error(`Unexpected external fetch ${url}`);
    return Response.json(body, { status });
  });
}

afterEach(() => vi.restoreAllMocks());

describe('Phase 5 class detail DTO', () => {
  it('normalizes a golden full DTO without omitting Phase 9 checkpoint/demo/final fields', () => {
    const detail = normalizeClassDetail(rawDetail, Date.parse('2026-07-28'));
    expect(detail).toMatchObject({
      id: 'class-1', status: 'RUNNING', startDate: '2026-06-01', courseProcessId: 'process-1', sites: [{ id: 'site-1' }],
      courseProcess: { finalSession: { finalEvaluations: [{ commentAreas: [{ rates: [{ value: 5, commentSamples: ['Tốt'] }] }] }], demoScore: { commentAreas: [{ demo: [{ id: 'demo-detail-1', maxScore: 5 }] }] } } },
      slots: [{ id: 'slot-1', studentAttendance: [{ id: 'attendance-1', studentId: 'student-1', commentByAreas: [
        expect.objectContaining({ type: 'CONTENT', content: '<p>Tiến bộ</p>' }),
        expect.objectContaining({ type: 'CHECKPOINT', checkpoint: { practiceScore: 4, checkpointScore: 8, checkpointQuestions: [{ id: 'q-1', title: 'Câu 1', result: true, score: 1 }] } }),
        expect.objectContaining({ type: 'DEMO', courseProcessDemoId: 'demo-1', courseProcessFinalEvaluationId: 'final-1', demoQuestions: [expect.objectContaining({ courseProcessDemoDetailId: 'demo-detail-1', result: false, score: 4.5 })] }),
      ] }] }],
    });
    expect(detail).not.toHaveProperty('upstreamSecret');
  });

  it('maps LMS legacy comment text into CONTENT so both old and new comment formats count as submitted', () => {
    const detail = normalizeClassDetail({
      ...rawDetail,
      slots: [{ _id: 'slot-1', index: 0, date: '2026-08-16', summary: '<p>Homework 1</p>', studentAttendance: [{
        _id: 'attendance-legacy', student: { id: 'student-legacy', fullName: 'Mai Việt Dũng' }, status: 'ATTENDED',
        comment: 'Dũng có thái độ học tập tích cực và bước đầu làm quen với dữ liệu khá tốt',
        commentStatus: { status: 'AUTO_APPROVED' },
        commentByAreas: [],
      }, {
        _id: 'attendance-new', student: { id: 'student-new', fullName: 'Thạch Đình Quân' }, status: 'ATTENDED',
        comment: '- Đánh giá chung: Quân đi học đúng giờ',
        commentByAreas: [{ grade: 0, content: 'Quân đi học đúng giờ', commentAreaId: 'content-1', type: 'CONTENT' }],
      }] }],
    }, Date.parse('2026-09-20'));
    expect(detail?.commentProgress).toMatchObject({ state: 'done', badgeText: 'Đã nhận xét', present: 2, completed: 2, missing: 0 });
    expect(detail?.slots[0].studentAttendance[0]).toMatchObject({
      comment: 'Dũng có thái độ học tập tích cực và bước đầu làm quen với dữ liệu khá tốt',
      commentByAreas: [expect.objectContaining({ type: 'CONTENT', content: 'Dũng có thái độ học tập tích cực và bước đầu làm quen với dữ liệu khá tốt' })],
    });
    expect(detail?.slots[0].studentAttendance[1].commentByAreas.filter((area) => area.type === 'CONTENT')).toHaveLength(1);
    expect(detail?.slots[0].studentAttendance[1].commentByAreas[0].content).toBe('Quân đi học đúng giờ');
  });

  it('serves the validated v2 DTO while preserving the legacy raw class route', async () => {
    mockLms({ data: { classesById: rawDetail } });
    const v2 = await request('/api/v2/classes/class-1');
    expect(v2.status).toBe(200);
    const parsed = ClassDetailResponseSchema.parse(await v2.json());
    expect(parsed.data.class.courseProcess?.finalSession?.demoScore?.commentAreas[0].demo[0]?.id).toBe('demo-detail-1');

    const legacy = await request('/api/class/class-1');
    const legacyBody = await legacy.json() as any;
    expect(legacyBody.class).toMatchObject({ upstreamSecret: 'must-not-leak', classSites: [{ _id: 'site-1' }] });
  });

  it('returns typed auth, validation, not-found, malformed and upstream errors', async () => {
    expect((await app.request('http://local.test/api/v2/classes/class-1', {}, env(true))).status).toBe(401);
    expect((await app.request(`http://local.test/api/v2/classes/${'x'.repeat(201)}`, {}, env(true))).status).toBe(401);
    expect((await request(`/api/v2/classes/${'x'.repeat(201)}`)).status).toBe(422);

    mockLms({ data: { classesById: null } });
    const missing = await request('/api/v2/classes/missing');
    expect(missing.status).toBe(404);
    vi.restoreAllMocks();

    mockLms({ data: { classesById: { id: '', name: '' } } });
    const malformed = await request('/api/v2/classes/bad');
    expect(malformed.status).toBe(502);
    vi.restoreAllMocks();

    mockLms({ errors: [{ message: 'LMS unavailable' }] });
    const upstream = await request('/api/v2/classes/class-1');
    expect(upstream.status).toBe(502);
    const upstreamBody = await upstream.json();
    expect(upstreamBody).toMatchObject({ error: { code: 'UPSTREAM_ERROR', message: 'Dịch vụ bên ngoài tạm thời không khả dụng. Vui lòng thử lại.' } });
    expect(JSON.stringify(upstreamBody)).not.toContain('LMS unavailable');
  });

  it('turns stale upstream authentication into the v2 auth envelope', async () => {
    mockLms({ error: 'INVALID_TOKEN' }, 403);
    const response = await request('/api/v2/classes/class-1');
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ success: false, error: { code: 'AUTH_REQUIRED', requestId: expect.any(String) } });
  });
});

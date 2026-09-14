import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ClassesResponseSchema,
  GradingJobCancelResponseSchema,
  GradingJobCreateResponseSchema,
  GradingJobRetryResponseSchema,
  HomeworkBatchMarkResponseSchema,
  HomeworkLoadResponseSchema,
} from '@tool-lms/contracts';
import { app } from '../../src/router';
import type { Env, SessionRecord } from '../../src/types';

const session: SessionRecord = {
  id: 'session-1', email: 'teacher-a@example.com', lmsToken: 'valid-token', tokenExpiry: 2_000_000_000,
  createdAt: '2026-07-28T00:00:00.000Z', updatedAt: '2026-07-28T00:00:00.000Z',
};
const rawSubmission = {
  id: 'submission-1', type: 'UPLOAD_FILE', note: '', score: null, status: 'SUBMITTED', category: null,
  classId: 'class-1', lessonId: 'lesson-1', learningCourseId: null, studentUid: 'student-1',
  markedAt: null, markedBy: null, submittedAt: '2026-07-28T00:00:00.000Z', submittedCount: 1,
  content: { attachments: ['classes/class-1/file.js'], scratchState: 'private-upstream-field' },
};
const homeworkPayload = {
  students: [{ id: 'student-row', displayName: 'An', studentUid: 'student-1' }],
  lessons: [{ id: 'lesson-1', name: 'Bài 1', type: 'HOMEWORK', isActive: true, displayOrder: 1 }],
  submissions: [rawSubmission],
};

function request(path: string, init: RequestInit = {}, currentEnv = env()) {
  const headers = new Headers(init.headers);
  headers.set('cookie', 'lms_session=session-1');
  if (init.method && !['GET', 'HEAD', 'OPTIONS'].includes(init.method) && !headers.has('origin')) headers.set('origin', 'http://local.test');
  if (init.body) headers.set('content-type', 'application/json');
  return app.request(`http://local.test${path}`, { ...init, headers }, currentEnv);
}

function env(options: {
  ownerRow?: Record<string, unknown> | null;
  ownerItems?: Record<string, unknown>[];
  noSession?: boolean;
  antigravityKey?: string;
  onSql?: (sql: string, values: unknown[]) => void;
  onQueue?: (message: unknown) => void;
  queueRejectAt?: number;
} = {}): Env {
  let queueSendCount = 0;
  return {
    ASSETS: { fetch: async () => new Response('asset') },
    SESSION_CACHE: {
      get: async () => options.noSession ? null : session,
      put: async () => undefined,
      delete: async () => undefined,
    },
    TOKEN_CACHE: { get: async () => null, put: async () => undefined },
    DB: {
      prepare(sql: string) {
        let values: unknown[] = [];
        return {
          bind(...next: unknown[]) { values = next; options.onSql?.(sql, values); return this; },
          all: async () => {
            if (sql.includes('grading_job_items')) return { results: options.ownerItems ?? [] };
            return { results: [] };
          },
          first: async () => {
            if (sql.includes('owner_email = ?')) {
              return options.ownerRow && values[1] === options.ownerRow.owner_email ? options.ownerRow : null;
            }
            return null;
          },
          run: async () => ({ success: true, meta: { changes: 1 } }),
        };
      },
    },
    ATTACHMENTS: { put: async () => undefined },
    GRADING_QUEUE: { send: async (message: unknown) => {
      queueSendCount++;
      if (queueSendCount === options.queueRejectAt) throw new Error('queue unavailable');
      options.onQueue?.(message);
    } },
    ...(options.antigravityKey ? { ANTIGRAVITY_API_KEY: options.antigravityKey } : {}),
  } as unknown as Env;
}

function mockLms(handler?: (operation: string) => unknown) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('lms-api.mindx.edu.vn')) throw new Error(`Unexpected external fetch: ${url}`);
    const body = JSON.parse(String(init?.body || '{}')) as { operationName?: string };
    const value = handler?.(body.operationName || '');
    if (value) return Response.json(value);
    if (body.operationName === 'GetClasses') return Response.json({ data: { classes: { data: [] } } });
    if (body.operationName === 'FindStudentSubmissionByClass') return Response.json({ data: { findStudentSubmissionByClass: homeworkPayload } });
    if (body.operationName === 'MarkStudentSubmission') return Response.json({ data: { studentHomework: { markStudentSubmission: { id: 'submission-1', score: 88, status: 'MARKED', markedAt: 'now', markedBy: 'Teacher' } } } });
    return Response.json({ data: {} });
  });
}

afterEach(() => vi.restoreAllMocks());

describe('Phase 4 v2 classes/homework routes', () => {
  it('requires an authenticated session for class and homework data', async () => {
    const noSession = env({ noSession: true });
    const classResponse = await app.request('http://local.test/api/v2/classes', {}, noSession);
    const homeworkResponse = await app.request('http://local.test/api/v2/classes/class-1/homework', {}, noSession);
    expect(classResponse.status).toBe(401);
    expect(homeworkResponse.status).toBe(401);
    expect(await classResponse.json()).toMatchObject({ error: { code: 'AUTH_REQUIRED' } });
  });

  it('keeps legacy /api/classes raw shape while v2 returns ordered normalized DTOs', async () => {
    const fetchMock = mockLms((operation) => operation === 'GetClasses' ? { data: { classes: { data: [{
      id: 'class-1', name: 'Lớp 1', status: 'RUNNING', startDate: null, endDate: '2099-01-01T00:00:00.000Z',
      course: { id: 'course-1', name: 'C4E', shortName: 'C4E' }, classSites: [{ _id: 'site-1', name: 'Online' }],
      slots: [
        { _id: 'slot-1', index: 0, date: '2020-01-01', summary: '', studentAttendance: [{ status: 'ATTENDED', commentByAreas: [{ type: 'CONTENT' }] }] },
        { _id: 'slot-2', index: 1, date: '2020-01-02', summary: '', studentAttendance: [{ status: 'ATTENDED', commentByAreas: [{ type: 'CONTENT' }] }, { status: 'LATE_ARRIVED', commentByAreas: [] }] },
      ],
      upstreamOnly: true,
    }] } } } : undefined);
    const legacy = await request('/api/classes');
    const v2 = await request('/api/v2/classes');
    const sentQuery = JSON.parse(String(fetchMock.mock.calls[0][1]?.body || '{}')).query as string;
    expect(sentQuery).toContain('studentAttendance');
    expect(sentQuery).toMatch(/commentByAreas\s*\{\s*type\s*\}/);
    const legacyBody = await legacy.json() as any;
    expect(legacyBody.classes[0]).toMatchObject({ upstreamOnly: true, classSites: [{ _id: 'site-1' }] });
    expect(legacyBody.classes[0].slots[0]).toMatchObject({ _id: 'slot-1', studentAttendance: [{ status: 'ATTENDED', commentByAreas: [{ type: 'CONTENT' }] }] });
    expect(legacyBody.classes[0]).not.toHaveProperty('recentlyEnded');
    const parsed = ClassesResponseSchema.parse(await v2.json());
    expect(parsed.data.classes[0]).toMatchObject({
      id: 'class-1', sites: [{ id: 'site-1' }], slotCount: 2,
      commentProgress: { state: 'pending', badgeText: 'Chưa nhận xét', slotNumber: 2, present: 2, completed: 1, missing: 1 },
    });
    expect(parsed.data.classes[0]).not.toHaveProperty('upstreamOnly');
  });

  it('loads precise normalized homework by class without leaking upstream fields', async () => {
    mockLms();
    const response = await request('/api/v2/classes/class-1/homework');
    expect(response.status).toBe(200);
    const parsed = HomeworkLoadResponseSchema.parse(await response.json());
    expect(parsed.data.submissions[0].content).toEqual({ attachments: ['classes/class-1/file.js'] });
    expect(parsed.data.submissions[0]).not.toHaveProperty('scratchState');
  });

  it('returns partial batch mark results and never marks unknown submission IDs', async () => {
    const fetchMock = mockLms();
    const response = await request('/api/v2/homework/batch-mark', {
      method: 'POST',
      body: JSON.stringify({
        classId: 'class-1',
        submissions: [{ id: 'submission-1', score: 88, note: 'Tốt' }, { id: 'foreign-submission', score: 70, note: '' }],
      }),
    });
    expect(response.status).toBe(200);
    const parsed = HomeworkBatchMarkResponseSchema.parse(await response.json());
    expect(parsed.data).toMatchObject({ total: 2, successCount: 1, failureCount: 1 });
    expect(parsed.data.results).toEqual([
      expect.objectContaining({ id: 'submission-1', success: true }),
      { id: 'foreign-submission', success: false, error: 'Không tìm thấy bài nộp.' },
    ]);
    const operations = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body || '{}')).operationName);
    expect(operations).toEqual(['FindStudentSubmissionByClass', 'MarkStudentSubmission']);
  });

  it('does not issue a presigned-url fetch unless attachment membership is proven', async () => {
    const fetchMock = mockLms();
    const params = new URLSearchParams({ classId: 'class-1', submissionId: 'submission-1', key: 'classes/other/secret.js' });
    const response = await request(`/api/v2/homework/download-url?${params.toString()}`);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('Phase 4 v2 grading-job security', () => {
  const ownerRow = {
    id: 'job-1', class_id: 'class-1', owner_email: 'teacher-a@example.com', status: 'completed',
    total_items: 1, completed_items: 0, failed_items: 1,
    created_at: '2026-07-28T00:00:00.000Z', updated_at: '2026-07-28T00:00:00.000Z', cancelled_at: null,
  };
  const scope = {
    submissions: [{
      id: 'submission-1', type: 'UPLOAD_FILE', note: '', score: null, status: 'SUBMITTED', category: null,
      classId: 'class-1', lessonId: 'lesson-1', learningCourseId: null, studentUid: 'student-1',
      markedAt: null, markedBy: null, submittedAt: null, submittedCount: 1,
      content: { attachments: ['classes/class-1/file.js'] },
    }],
    students: [{ id: 'student-row', studentUid: 'student-1', displayName: 'An' }],
    lessons: [{ id: 'lesson-1', name: 'Bài 1', type: 'HOMEWORK', isActive: true, displayOrder: 1 }],
    modelId: 'gpt-5.4', customModelId: '', thinkingLevel: 'high',
  };

  it('hides other owners and ownerless legacy jobs as not-found', async () => {
    const otherOwner = env({ ownerRow: { ...ownerRow, owner_email: 'teacher-b@example.com' } });
    const ownerless = env({ ownerRow: { ...ownerRow, owner_email: null } });
    for (const currentEnv of [otherOwner, ownerless]) {
      const response = await request('/api/v2/homework/jobs/job-1', {}, currentEnv);
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    }
  });

  it('creates owner-scoped jobs and emits one queue message per canonical submission', async () => {
    const sqlCalls: Array<{ sql: string; values: unknown[] }> = [];
    const queued: unknown[] = [];
    mockLms();
    const currentEnv = env({
      antigravityKey: 'server-key',
      onSql: (sql, values) => sqlCalls.push({ sql, values }),
      onQueue: (message) => queued.push(message),
    });
    const response = await request('/api/v2/homework/jobs', {
      method: 'POST', body: JSON.stringify({ classId: 'class-1', ...scope }),
    }, currentEnv);
    expect(response.status).toBe(201);
    const parsed = GradingJobCreateResponseSchema.parse(await response.json());
    expect(parsed.data.job).toMatchObject({ classId: 'class-1', totalItems: 1, status: 'queued' });
    const insert = sqlCalls.find((call) => call.sql.includes('INSERT INTO grading_jobs'));
    expect(insert?.sql).toContain('owner_email');
    expect(insert?.values).toContain('teacher-a@example.com');
    expect(queued).toHaveLength(1);
    expect(JSON.stringify(sqlCalls)).not.toContain('server-key');
    expect(JSON.stringify(queued)).not.toContain('server-key');
  });

  it('returns a truthful recoverable error when create cannot enqueue', async () => {
    mockLms();
    const response = await request('/api/v2/homework/jobs', {
      method: 'POST', body: JSON.stringify({ classId: 'class-1', ...scope }),
    }, env({ antigravityKey: 'server-key', queueRejectAt: 1 }));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'UPSTREAM_ERROR',
        details: {
          reason: 'GRADING_QUEUE_UNAVAILABLE',
          jobId: expect.any(String),
          enqueuedItems: 0,
          failedItems: 1,
          totalItems: 1,
        },
      },
    });
  });

  it('allows the owner to cancel a job and keeps the owner predicate on the mutation', async () => {
    const mutations: string[] = [];
    const currentEnv = env({
      ownerRow,
      onSql: (sql) => { if (sql.trim().startsWith('UPDATE')) mutations.push(sql); },
    });
    const response = await request('/api/v2/homework/jobs/job-1/cancel', { method: 'POST' }, currentEnv);
    expect(response.status).toBe(200);
    const parsed = GradingJobCancelResponseSchema.parse(await response.json());
    expect(parsed.data.job.status).toBe('cancelled');
    expect(mutations).toHaveLength(1);
    expect(mutations[0]).toContain('owner_email = ?');
  });

  it('retries only failed owned items with a key and returns normalized progress', async () => {
    const queued: unknown[] = [];
    const mutations: string[] = [];
    mockLms();
    const currentEnv = env({
      ownerRow,
      ownerItems: [{
        id: 'item-1', submission_id: 'submission-1', student_uid: 'student-1', lesson_id: 'lesson-1', status: 'failed',
        score: null, note: null, error: 'failed', result_json: null,
        created_at: '2026-07-28T00:00:00.000Z', updated_at: '2026-07-28T00:00:00.000Z',
      }],
      antigravityKey: 'server-key',
      onSql: (sql) => { if (sql.trim().startsWith('UPDATE')) mutations.push(sql); },
      onQueue: (message) => queued.push(message),
    });
    const response = await request('/api/v2/homework/jobs/job-1/retry-failed', {
      method: 'POST', body: JSON.stringify(scope),
    }, currentEnv);
    expect(response.status).toBe(200);
    const parsed = GradingJobRetryResponseSchema.parse(await response.json());
    expect(parsed.data).toMatchObject({ queued: 1, job: { status: 'running' } });
    expect(queued).toHaveLength(1);
    expect(mutations).toHaveLength(2);
    expect(mutations[1]).toContain('owner_email = ?');
  });

  it('returns a truthful recoverable error when retry cannot enqueue', async () => {
    mockLms();
    const currentEnv = env({
      ownerRow,
      ownerItems: [{
        id: 'item-1', submission_id: 'submission-1', student_uid: 'student-1', lesson_id: 'lesson-1', status: 'failed',
        score: null, note: null, error: 'failed', result_json: null,
        created_at: '2026-07-28T00:00:00.000Z', updated_at: '2026-07-28T00:00:00.000Z',
      }],
      antigravityKey: 'server-key',
      queueRejectAt: 1,
    });
    const response = await request('/api/v2/homework/jobs/job-1/retry-failed', {
      method: 'POST', body: JSON.stringify(scope),
    }, currentEnv);
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: {
        code: 'UPSTREAM_ERROR',
        details: {
          reason: 'GRADING_QUEUE_UNAVAILABLE',
          jobId: 'job-1',
          enqueuedItems: 0,
          failedItems: 1,
          totalItems: 1,
        },
      },
    });
  });

  it('returns API_KEY_REQUIRED before create D1 mutations, queue sends, or LMS calls', async () => {
    const mutations: string[] = [];
    const queued: unknown[] = [];
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    const currentEnv = env({
      onSql: (sql) => { if (/^(INSERT|UPDATE|DELETE)/.test(sql.trim())) mutations.push(sql); },
      onQueue: (message) => queued.push(message),
    });
    const response = await request('/api/v2/homework/jobs', {
      method: 'POST', body: JSON.stringify({ classId: 'class-1', ...scope }),
    }, currentEnv);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: 'API_KEY_REQUIRED', details: { provider: 'antigravity' } } });
    expect(mutations).toEqual([]);
    expect(queued).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns API_KEY_REQUIRED on retry without changing job/item state or enqueueing', async () => {
    const mutations: string[] = [];
    const queued: unknown[] = [];
    const currentEnv = env({
      ownerRow,
      ownerItems: [{
        id: 'item-1', submission_id: 'submission-1', student_uid: 'student-1', lesson_id: 'lesson-1', status: 'failed',
        score: null, note: null, error: 'failed', result_json: null,
        created_at: '2026-07-28T00:00:00.000Z', updated_at: '2026-07-28T00:00:00.000Z',
      }],
      onSql: (sql) => { if (/^(INSERT|UPDATE|DELETE)/.test(sql.trim())) mutations.push(sql); },
      onQueue: (message) => queued.push(message),
    });
    const response = await request('/api/v2/homework/jobs/job-1/retry-failed', {
      method: 'POST', body: JSON.stringify(scope),
    }, currentEnv);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: 'API_KEY_REQUIRED' } });
    expect(mutations).toEqual([]);
    expect(queued).toEqual([]);
  });
});

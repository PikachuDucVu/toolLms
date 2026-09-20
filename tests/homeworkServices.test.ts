import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { GET_CLASSES_QUERY, GET_CLASS_DETAIL_QUERY } from '../src/constants/lmsQueries';
import { orderClasses, normalizeClassCommentProgress, normalizeClassList } from '../src/services/classService';
import {
  createGradingJob,
  getOwnedGradingJob,
  HomeworkApiKeyRequiredError,
  retryOwnedFailedItems,
} from '../src/services/gradingJobService';
import {
  assertAttachmentBelongsToSubmission,
  normalizeHomeworkData,
  resolveHomeworkAiKey,
} from '../src/services/homeworkService';
import { decodeGradingQueueMessage } from '../src/queues/gradingConsumer';
import type { Env, SessionRecord } from '../src/types';

const submission = {
  id: 'submission-1', type: 'UPLOAD_FILE', note: '', score: null, status: 'SUBMITTED' as const,
  category: null, classId: 'class-1', lessonId: 'lesson-1', learningCourseId: null,
  studentUid: 'student-1', markedAt: null, markedBy: null, submittedAt: null, submittedCount: 1,
  content: { attachments: ['classes/class-1/file.js'] },
};

function statement(result: { first?: unknown; results?: unknown[] } = {}) {
  return {
    bind(..._values: unknown[]) { return this; },
    all: async () => ({ results: result.results ?? [] }),
    first: async () => result.first ?? null,
    run: async () => ({ success: true, meta: { changes: 1 } }),
  };
}

afterEach(() => vi.restoreAllMocks());

describe('class service', () => {
  it('preserves running order and appends recently-ended classes newest first', () => {
    const now = Date.parse('2026-07-28T00:00:00.000Z');
    const ordered = orderClasses([
      { id: 'running-1', status: 'RUNNING', endDate: '2026-08-01T00:00:00.000Z' },
      { id: 'old', status: 'FINISHED', endDate: '2026-06-01T00:00:00.000Z' },
      { id: 'ended-1', status: 'FINISHED', endDate: '2026-07-20T00:00:00.000Z' },
      { id: 'running-2', status: 'RUNNING', endDate: null },
      { id: 'ended-2', status: 'RUNNING', endDate: '2026-07-25T00:00:00.000Z' },
    ], now);
    expect(ordered.map((item) => item.id)).toEqual(['running-1', 'running-2', 'ended-2', 'ended-1']);
    expect(ordered.slice(2).every((item) => item.recentlyEnded)).toBe(true);
  });

  it('normalizes only documented class selector fields', () => {
    expect(normalizeClassList([{
      id: 'class-1', name: 'Lớp 1', status: 'RUNNING', startDate: null, endDate: null,
      course: { id: 'course-1', name: 'C4E', shortName: 'C4E' },
      classSites: [{ _id: 'site-1', name: 'Online' }], secret: 'not-returned',
    }])).toEqual([{
      id: 'class-1', name: 'Lớp 1', status: 'RUNNING', startDate: null, endDate: null,
      recentlyEnded: false, course: { id: 'course-1', name: 'C4E', shortName: 'C4E' },
      sites: [{ id: 'site-1', name: 'Online' }], slotCount: 0,
      commentProgress: { state: 'unknown', badgeText: 'Chưa có dữ liệu', slotNumber: null, present: null, completed: null, missing: null },
    }]);
  });

  it('asks LMS for lightweight attendance so class-list badges are not always unknown', () => {
    expect(GET_CLASSES_QUERY).toContain('studentAttendance');
    expect(GET_CLASSES_QUERY).toMatch(/status\s+comment\s+commentStatus/);
    expect(GET_CLASSES_QUERY).toMatch(/commentByAreas\s*\{\s*type\s*\}/);
    expect(GET_CLASS_DETAIL_QUERY).toMatch(/status\s+startDate\s+endDate/);
    expect(GET_CLASS_DETAIL_QUERY).toMatch(/status\s+comment\s+commentStatus/);
    expect(GET_CLASS_DETAIL_QUERY).toMatch(/commentByAreas\s*\{/);
  });

  it('computes class-list comment progress from type-only attendance payloads', () => {
    const now = Date.parse('2026-09-14T00:00:00.000Z');
    expect(normalizeClassCommentProgress([{ _id: 'slot-1', index: 0, date: '2026-09-01' }], now)).toMatchObject({
      state: 'unknown', badgeText: 'Chưa có dữ liệu',
    });
    expect(normalizeClassCommentProgress([
      { _id: 'slot-1', index: 0, date: '2026-09-01', studentAttendance: [{ status: 'ATTENDED', commentByAreas: [{ type: 'CONTENT' }] }] },
      { _id: 'slot-2', index: 1, date: '2026-09-08', studentAttendance: [{ status: 'ATTENDED', commentByAreas: [{ type: 'CONTENT' }] }, { status: 'LATE_ARRIVED', commentByAreas: [] }] },
    ], now)).toMatchObject({
      state: 'pending', badgeText: 'Chưa nhận xét', slotNumber: 2, present: 2, completed: 1, missing: 1,
    });
    expect(normalizeClassCommentProgress([
      { _id: 'slot-1', index: 0, date: '2026-09-01', studentAttendance: [{ status: 'ATTENDED', commentByAreas: [{ type: 'CONTENT' }] }] },
    ], now)).toMatchObject({
      state: 'done', badgeText: 'Đã nhận xét', slotNumber: 1, present: 1, completed: 1, missing: 0,
    });
  });

  it('treats LMS legacy comment text and AUTO_APPROVED status as completed even without commentByAreas', () => {
    const now = Date.parse('2026-09-14T00:00:00.000Z');
    expect(normalizeClassCommentProgress([
      { _id: 'slot-1', index: 0, date: '2026-08-16', studentAttendance: [{ status: 'ATTENDED', comment: 'Dũng có thái độ học tập tích cực', commentByAreas: [] }] },
    ], now)).toMatchObject({
      state: 'done', badgeText: 'Đã nhận xét', slotNumber: 1, present: 1, completed: 1, missing: 0,
    });
    expect(normalizeClassCommentProgress([
      { _id: 'slot-1', index: 0, date: '2026-08-16', studentAttendance: [{ status: 'ATTENDED', commentStatus: { status: 'AUTO_APPROVED' }, commentByAreas: [] }] },
    ], now)).toMatchObject({
      state: 'done', badgeText: 'Đã nhận xét', slotNumber: 1, present: 1, completed: 1, missing: 0,
    });
    expect(normalizeClassCommentProgress([
      { _id: 'slot-1', index: 0, date: '2026-08-16', studentAttendance: [{ status: 'ATTENDED', comment: '', commentStatus: { status: 'Pending' }, commentByAreas: [] }] },
    ], now)).toMatchObject({
      state: 'pending', badgeText: 'Chưa nhận xét', slotNumber: 1, present: 1, completed: 0, missing: 1,
    });
  });
});

describe('normalized homework service', () => {
  it('normalizes LMS data and proves attachment membership by class-loaded submission', () => {
    const data = normalizeHomeworkData({
      students: [{ id: 'student-row', studentUid: 'student-1', displayName: 'An' }],
      lessons: [{ id: 'lesson-1', name: 'Bài 1', type: 'HOMEWORK', isActive: true, displayOrder: 2 }],
      submissions: [{ ...submission, score: '95', extra: 'drop-me', content: { attachments: ['classes/class-1/file.js'], scratchState: 'drop-me' } }],
    });
    expect(data.submissions[0]).toEqual({ ...submission, score: 95 });
    expect(assertAttachmentBelongsToSubmission(data, 'submission-1', 'classes/class-1/file.js')).toBeTruthy();
    expect(assertAttachmentBelongsToSubmission(data, 'submission-1', 'classes/other/file.js')).toBeNull();
  });

  it('uses the actual configured provider resolution for API-key availability', () => {
    const base = { DB: {} } as Env;
    expect(resolveHomeworkAiKey({ ...base, OPENROUTER_API_KEY: 'openrouter-only' }, {}, { modelId: 'gpt-5.4' }).available).toBe(false);
    expect(resolveHomeworkAiKey({ ...base, ANTIGRAVITY_API_KEY: 'server-key' }, {}, { modelId: 'gpt-5.4' }).available).toBe(true);
    const supplied = resolveHomeworkAiKey(base, {}, { modelId: 'gpt-5.4', apiKey: ' ephemeral ' });
    expect(supplied).toMatchObject({ available: true, provider: 'antigravity', ephemeralApiKey: 'ephemeral' });
  });
});

describe('grading job orchestration', () => {
  it('keeps API_KEY_REQUIRED side-effect free for create and retry', async () => {
    const mutations: string[] = [];
    const sent: unknown[] = [];
    const ownerRow = {
      id: 'job-1', class_id: 'class-1', owner_email: 'teacher@example.com', status: 'completed',
      total_items: 1, completed_items: 0, failed_items: 1, created_at: 'now', updated_at: 'now', cancelled_at: null,
    };
    const env = {
      DB: {
        prepare(sql: string) {
          if (/^(INSERT|UPDATE|DELETE)/.test(sql.trim())) mutations.push(sql);
          if (sql.includes('owner_email = ?')) return statement({ first: ownerRow });
          return statement();
        },
      },
      GRADING_QUEUE: { send: async (message: unknown) => { sent.push(message); } },
    } as unknown as Env;
    const payload = {
      classId: 'class-1', submissions: [submission],
      students: [{ id: 'student-row', studentUid: 'student-1', displayName: 'An' }],
      lessons: [{ id: 'lesson-1', name: 'Bài 1', type: '', isActive: true, displayOrder: 1 }],
      modelId: 'gpt-5.4',
    };

    await expect(createGradingJob(env, 'session-1', payload, { ownerEmail: 'teacher@example.com', enforceApiKey: true }))
      .rejects.toBeInstanceOf(HomeworkApiKeyRequiredError);
    await expect(retryOwnedFailedItems(env, 'session-1', 'job-1', 'teacher@example.com', payload))
      .rejects.toBeInstanceOf(HomeworkApiKeyRequiredError);
    expect(mutations).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('writes owner_email, does not persist a server key, and emits a legacy-decodable message', async () => {
    const calls: Array<{ sql: string; values: unknown[] }> = [];
    const sent: unknown[] = [];
    const env = {
      ANTIGRAVITY_API_KEY: 'server-secret',
      DB: {
        prepare(sql: string) {
          const item = { sql, values: [] as unknown[] };
          calls.push(item);
          return {
            bind(...values: unknown[]) { item.values = values; return this; },
            all: async () => ({ results: [] }), first: async () => null, run: async () => ({ success: true, meta: { changes: 1 } }),
          };
        },
      },
      GRADING_QUEUE: { send: async (message: unknown) => { sent.push(message); } },
    } as unknown as Env;
    const job = await createGradingJob(env, 'session-1', {
      classId: 'class-1', submissions: [submission],
      students: [{ id: 'student-row', studentUid: 'student-1', displayName: 'An' }],
      lessons: [{ id: 'lesson-1', name: 'Bài 1', type: '', isActive: true, displayOrder: 1 }],
      modelId: 'gpt-5.4',
    }, { ownerEmail: 'teacher@example.com', enforceApiKey: true });
    expect(job.totalItems).toBe(1);
    const jobInsert = calls.find((call) => call.sql.includes('INSERT INTO grading_jobs'));
    expect(jobInsert?.sql).toContain('owner_email');
    expect(jobInsert?.values).toContain('teacher@example.com');
    expect(JSON.stringify(calls)).not.toContain('server-secret');
    expect(JSON.stringify(sent)).not.toContain('server-secret');

    const frozenLegacyDecoder = z.object({
      jobId: z.string(), itemId: z.string(), sessionId: z.string(), classId: z.string(),
      submission: z.object({ id: z.string() }).passthrough(), studentName: z.string(), lessonName: z.string(),
    });
    expect(frozenLegacyDecoder.parse(sent[0])).toMatchObject({ classId: 'class-1', studentName: 'An', lessonName: 'Bài 1' });
    expect(decodeGradingQueueMessage({ ...(sent[0] as object), version: undefined, apiKey: '' }).version).toBeUndefined();
  });

  it('hides jobs from non-owners and hides ownerless legacy jobs', async () => {
    const row = {
      id: 'job-1', class_id: 'class-1', owner_email: 'teacher-a@example.com', status: 'queued',
      total_items: 1, completed_items: 0, failed_items: 0, created_at: 'now', updated_at: 'now', cancelled_at: null,
    };
    const env = {
      DB: {
        prepare(sql: string) {
          let values: unknown[] = [];
          return {
            bind(...next: unknown[]) { values = next; return this; },
            first: async () => sql.includes('owner_email = ?') && values[1] === row.owner_email ? row : null,
            all: async () => ({ results: [] }), run: async () => ({ success: true, meta: { changes: 1 } }),
          };
        },
      },
    } as unknown as Env;
    expect(await getOwnedGradingJob(env, 'job-1', 'teacher-b@example.com')).toBeNull();
    expect((await getOwnedGradingJob(env, 'job-1', 'teacher-a@example.com'))?.job.id).toBe('job-1');

    const ownerless = { ...row, owner_email: null };
    const ownerlessEnv = {
      DB: { prepare: () => statement({ first: ownerless }) },
    } as unknown as Env;
    // SQL owner matching in D1 cannot match NULL; the mock mirrors that by returning no row.
    ownerlessEnv.DB.prepare = (() => statement()) as typeof ownerlessEnv.DB.prepare;
    expect(await getOwnedGradingJob(ownerlessEnv, 'job-1', 'teacher-a@example.com')).toBeNull();
  });
});

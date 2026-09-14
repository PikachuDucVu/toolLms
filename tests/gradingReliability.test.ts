import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createGradingJob,
  GradingQueueEnqueueError,
  retryOwnedFailedItems,
  type GradingJobPayload,
} from '../src/services/gradingJobService';
import { decodeGradingQueueMessage, processGradingBatch, processGradingMessage } from '../src/queues/gradingConsumer';
import type { Env, GradingQueueMessage, HomeworkSubmission } from '../src/types';

interface StoredItem {
  id: string;
  jobId: string;
  submissionId: string;
  status: string;
  error: string | null;
}

interface StoredJob {
  id: string;
  classId: string;
  ownerEmail?: string;
  status: string;
  totalItems: number;
  completedItems: number;
  failedItems: number;
}

function submission(id: string): HomeworkSubmission {
  return {
    id,
    classId: 'class-1',
    lessonId: `lesson-${id}`,
    studentUid: `student-${id}`,
    content: { attachments: [`classes/class-1/${id}.js`] },
  };
}

function payload(count: number): GradingJobPayload {
  return {
    classId: 'class-1',
    submissions: Array.from({ length: count }, (_, index) => submission(`submission-${index + 1}`)),
  };
}

function statefulEnv(options: { rejectSend?: number; ownerJob?: StoredJob; failedItems?: StoredItem[] } = {}) {
  const jobs = new Map<string, StoredJob>();
  const items = new Map<string, StoredItem>();
  const accepted: GradingQueueMessage[] = [];
  let sendCount = 0;
  let batchCalls = 0;
  if (options.ownerJob) jobs.set(options.ownerJob.id, { ...options.ownerJob });
  for (const item of options.failedItems ?? []) items.set(item.id, { ...item });

  function reconcile(jobId: string) {
    const job = jobs.get(jobId);
    if (!job) return;
    const jobItems = [...items.values()].filter((item) => item.jobId === jobId);
    job.completedItems = jobItems.filter((item) => item.status === 'completed').length;
    job.failedItems = jobItems.filter((item) => item.status === 'failed').length;
    const terminal = jobItems.filter((item) => ['completed', 'failed', 'cancelled'].includes(item.status)).length;
    job.status = job.totalItems <= terminal ? 'completed' : 'running';
  }

  function prepare(sql: string) {
    let values: unknown[] = [];
    const statement = {
      bind(...next: unknown[]) { values = next; return statement; },
      all: async () => {
        if (sql.includes("FROM grading_job_items") && sql.includes("status = 'failed'")) {
          const jobId = String(values[0]);
          return {
            results: [...items.values()]
              .filter((item) => item.jobId === jobId && item.status === 'failed')
              .map((item) => ({ id: item.id, submission_id: item.submissionId })),
          };
        }
        return { results: [] };
      },
      first: async () => {
        if (sql === 'SELECT status FROM grading_jobs WHERE id = ?') {
          const job = jobs.get(String(values[0]));
          return job ? { status: job.status } : null;
        }
        if (sql.includes('FROM grading_jobs') && sql.includes('owner_email = ?')) {
          const job = jobs.get(String(values[0]));
          if (!job || job.ownerEmail !== values[1]) return null;
          return {
            id: job.id,
            class_id: job.classId,
            owner_email: job.ownerEmail,
            status: job.status,
            total_items: job.totalItems,
            completed_items: job.completedItems,
            failed_items: job.failedItems,
            created_at: 'now',
            updated_at: 'now',
            cancelled_at: null,
          };
        }
        return null;
      },
      run: async () => {
        let changes = 0;
        if (sql.startsWith('INSERT INTO grading_jobs')) {
          const hasOwner = sql.includes('owner_email');
          jobs.set(String(values[0]), {
            id: String(values[0]),
            classId: String(values[1]),
            status: String(values[2]),
            totalItems: Number(values[3]),
            completedItems: 0,
            failedItems: Number(values[4]),
            ...(hasOwner ? { ownerEmail: String(values[7]) } : {}),
          });
          changes = 1;
        } else if (sql.startsWith('INSERT INTO grading_job_items')) {
          items.set(String(values[0]), {
            id: String(values[0]),
            jobId: String(values[1]),
            submissionId: String(values[2]),
            status: 'failed',
            error: String(values[5]),
          });
          changes = 1;
        } else if (sql.includes("SET status = 'queued'")) {
          const item = items.get(String(values[1]));
          if (item?.status === 'failed') { item.status = 'queued'; item.error = null; changes = 1; }
        } else if (sql.includes('SET error = ?') && sql.includes('error = ?') && sql.includes('id IN')) {
          for (const id of values.slice(3).map(String)) {
            const item = items.get(id);
            if (item?.status === 'failed' && item.error === values[2]) { item.error = String(values[0]); changes += 1; }
          }
        } else if (sql.includes("SET status = 'failed'")) {
          const item = items.get(String(values[2]));
          if (item?.status === 'queued') { item.status = 'failed'; item.error = String(values[0]); changes = 1; }
        } else if (sql.includes('UPDATE grading_jobs') && sql.includes('completed_items =')) {
          const expectedStatus = String(values.at(-1));
          const jobId = String(values.at(-2 - (sql.includes('owner_email = ?') ? 1 : 0)));
          const job = jobs.get(jobId);
          if (job?.status === expectedStatus) { reconcile(jobId); changes = 1; }
        } else if (sql.includes('UPDATE grading_jobs') && sql.includes('failed_items =')) {
          const jobId = String(values.at(-1));
          const job = jobs.get(jobId);
          if (job) { job.failedItems = [...items.values()].filter((item) => item.jobId === jobId && item.status === 'failed').length; changes = 1; }
        }
        return { success: true, meta: { changes } };
      },
    };
    return statement;
  }

  const env = {
    ANTIGRAVITY_API_KEY: 'server-key',
    DB: {
      prepare,
      batch: async (statements: Array<{ run: () => Promise<unknown> }>) => {
        batchCalls++;
        return Promise.all(statements.map((statement) => statement.run()));
      },
    },
    GRADING_QUEUE: {
      send: async (message: GradingQueueMessage) => {
        sendCount++;
        if (sendCount === options.rejectSend) throw new Error('queue unavailable');
        accepted.push(message);
      },
    },
  } as unknown as Env;
  return { env, jobs, items, accepted, batchCalls: () => batchCalls };
}

function queueMessage(body: unknown) {
  return {
    body,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

function consumerEnv(jobStatus: string, itemStatus: string) {
  const state = { jobStatus, itemStatus, cancelledAt: jobStatus === 'cancelled' ? 'now' : null as string | null };
  const session = {
    id: 'session-queue', email: 'teacher@example.com', lmsToken: 'token', tokenExpiry: 2_100_000_000,
    createdAt: 'now', updatedAt: 'now',
  };
  const env = {
    ANTIGRAVITY_API_KEY: 'server-key',
    DB: {
      prepare(sql: string) {
        let values: unknown[] = [];
        return {
          bind(...next: unknown[]) { values = next; return this; },
          all: async () => ({ results: [] }),
          first: async () => {
            if (sql.startsWith('SELECT status, cancelled_at')) return { status: state.jobStatus, cancelled_at: state.cancelledAt };
            if (sql === 'SELECT status FROM grading_jobs WHERE id = ?') return { status: state.jobStatus };
            return null;
          },
          run: async () => {
            let changes = 0;
            if (sql.startsWith('UPDATE grading_job_items SET status = ?')) {
              const expected = String(values[7]);
              if (state.itemStatus === expected) { state.itemStatus = String(values[0]); changes = 1; }
            } else if (sql.startsWith('UPDATE grading_jobs SET status = ?')) {
              const expected = String(values[3]);
              if (state.jobStatus === expected) { state.jobStatus = String(values[0]); changes = 1; }
            } else if (sql.includes('UPDATE grading_jobs') && sql.includes('completed_items =')) {
              const expected = String(values[5]);
              if (state.jobStatus === expected) {
                const terminal = ['completed', 'failed', 'cancelled'].includes(state.itemStatus);
                state.jobStatus = state.cancelledAt ? 'cancelled' : terminal ? 'completed' : 'running';
                changes = 1;
              }
            }
            return { success: true, meta: { changes } };
          },
        };
      },
    },
    SESSION_CACHE: {
      get: async () => session,
      put: async () => undefined,
      delete: async () => undefined,
    },
    TOKEN_CACHE: { get: async () => null, put: async () => undefined },
  } as unknown as Env;
  return { env, state };
}

function transitionSequence(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls.flatMap(([entry]) => {
    const parsed = JSON.parse(String(entry)) as { category?: string; fromStatus?: string; toStatus?: string; itemId?: string };
    if (parsed.category !== 'grading_job_transition' && parsed.category !== 'grading_item_transition') return [];
    return [`${parsed.itemId ? 'item' : 'job'}:${parsed.fromStatus}->${parsed.toStatus}`];
  });
}

afterEach(() => vi.restoreAllMocks());

describe('grading queue enqueue recovery', () => {
  it('logs only the exact successful enqueue status transitions', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const state = statefulEnv();
    await createGradingJob(state.env, 'session-1', payload(2), { ownerEmail: 'teacher@example.com' });
    expect(transitionSequence(log)).toEqual([
      'job:none->queued',
      'item:none->failed',
      'item:none->failed',
      'item:failed->queued',
      'item:failed->queued',
    ]);
  });

  it('logs the current queued item failure but no false transition for future already-failed items', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const state = statefulEnv({ rejectSend: 2 });
    await expect(createGradingJob(state.env, 'session-1', payload(3), { ownerEmail: 'teacher@example.com' }))
      .rejects.toBeInstanceOf(GradingQueueEnqueueError);
    expect(transitionSequence(log)).toEqual([
      'job:none->queued',
      'item:none->failed',
      'item:none->failed',
      'item:none->failed',
      'item:failed->queued',
      'item:failed->queued',
      'item:queued->failed',
      'job:queued->running',
    ]);
  });

  it.each([
    { name: 'first send', rejectSend: 1, accepted: 0, states: ['failed', 'failed', 'failed'], jobStatus: 'completed' },
    { name: 'mid-batch send', rejectSend: 2, accepted: 1, states: ['queued', 'failed', 'failed'], jobStatus: 'running' },
  ])('reconciles create after $name rejection without silently queued unsent items', async ({ rejectSend, accepted, states, jobStatus }) => {
    const state = statefulEnv({ rejectSend });
    let thrown: GradingQueueEnqueueError | undefined;
    try {
      await createGradingJob(state.env, 'session-1', payload(3), { ownerEmail: 'teacher@example.com' });
    } catch (error) {
      thrown = error as GradingQueueEnqueueError;
    }

    expect(thrown).toBeInstanceOf(GradingQueueEnqueueError);
    expect(thrown).toMatchObject({ enqueuedItems: accepted, totalItems: 3 });
    expect(state.batchCalls()).toBe(1);
    expect(state.accepted).toHaveLength(accepted);
    expect([...state.items.values()].map((item) => item.status)).toEqual(states);
    const acceptedIds = new Set(state.accepted.map((message) => message.itemId));
    expect([...state.items.values()].filter((item) => item.status === 'queued').every((item) => acceptedIds.has(item.id))).toBe(true);
    const job = state.jobs.get(thrown!.jobId);
    expect(job).toMatchObject({ status: jobStatus, failedItems: 3 - accepted });
  });

  it('restores a rejected retry item to failed/retryable state and keeps counters coherent', async () => {
    const job: StoredJob = {
      id: 'job-1', classId: 'class-1', ownerEmail: 'teacher@example.com', status: 'completed',
      totalItems: 2, completedItems: 0, failedItems: 2,
    };
    const failedItems: StoredItem[] = [
      { id: 'item-1', jobId: 'job-1', submissionId: 'submission-1', status: 'failed', error: 'old error' },
      { id: 'item-2', jobId: 'job-1', submissionId: 'submission-2', status: 'failed', error: 'old error' },
    ];
    const state = statefulEnv({ rejectSend: 1, ownerJob: job, failedItems });

    await expect(retryOwnedFailedItems(state.env, 'session-1', 'job-1', 'teacher@example.com', {
      submissions: [submission('submission-1'), submission('submission-2')],
    })).rejects.toMatchObject({ enqueuedItems: 0, totalItems: 2 });

    expect(state.accepted).toEqual([]);
    expect([...state.items.values()]).toEqual([
      expect.objectContaining({ id: 'item-1', status: 'failed', error: expect.stringContaining('Vui lòng thử lại') }),
      expect.objectContaining({ id: 'item-2', status: 'failed', error: 'old error' }),
    ]);
    expect(state.jobs.get('job-1')).toMatchObject({ status: 'completed', failedItems: 2 });
  });
});

describe('grading consumer transition observability', () => {
  const message: GradingQueueMessage = {
    version: 1,
    jobId: 'job-queue',
    itemId: 'item-queue',
    sessionId: 'session-queue',
    classId: 'class-1',
    submission: { id: 'submission-queue', content: { attachments: ['classes/class-1/work.js'] } },
    studentName: 'Student',
    lessonName: 'Lesson',
  };

  it('does not emit transitions for a duplicate delivery whose item is already completed', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const state = consumerEnv('completed', 'completed');
    await processGradingMessage(state.env, message);
    expect(transitionSequence(log)).toEqual([]);
    expect(state.state).toMatchObject({ jobStatus: 'completed', itemStatus: 'completed' });
  });

  it('logs only the queued item cancellation when the job is already cancelled', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const state = consumerEnv('cancelled', 'queued');
    await processGradingMessage(state.env, message);
    expect(transitionSequence(log)).toEqual(['item:queued->cancelled']);
    expect(state.state).toMatchObject({ jobStatus: 'cancelled', itemStatus: 'cancelled' });
  });

  it('logs the exact claim, run, item completion, and terminal job completion sequence', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const state = consumerEnv('queued', 'queued');
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('resources.mindx.edu.vn/api/v1/get-presigned-url')) return Response.json({ success: true, url: 'https://download.test/work.js' });
      if (url === 'https://download.test/work.js') return new Response('console.log("ok")');
      if (url.includes('ai.ducvu.io.vn')) return Response.json({ choices: [{ message: { content: '{"score": 90, "note": "Tốt"}' } }] });
      if (url.includes('lms-api.mindx.edu.vn')) {
        const body = JSON.parse(String(init?.body || '{}')) as { operationName?: string };
        expect(body.operationName).toBe('MarkStudentSubmission');
        return Response.json({ data: { studentHomework: { markStudentSubmission: { id: 'submission-queue', score: 90, status: 'MARKED' } } } });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });
    await processGradingMessage(state.env, message);
    expect(transitionSequence(log)).toEqual([
      'item:queued->processing',
      'job:queued->running',
      'item:processing->completed',
      'job:running->completed',
    ]);
    expect(state.state).toMatchObject({ jobStatus: 'completed', itemStatus: 'completed' });
  });
});

describe('legacy queue decoding and batch isolation', () => {
  it('accepts and safely normalizes legacy messages beyond current HTTP bounds', () => {
    const long = 'x'.repeat(12_000);
    const decoded = decodeGradingQueueMessage({
      jobId: long,
      itemId: long,
      sessionId: long,
      classId: long,
      submission: {
        id: long,
        note: long,
        content: { attachments: [...Array.from({ length: 75 }, () => long), 123, null] },
      },
      studentName: long,
      lessonName: long,
      modelId: long,
      customModelId: long,
      thinkingLevel: 'legacy-unbounded-value',
      apiKey: '   ',
    });
    expect(decoded.jobId).toHaveLength(12_000);
    expect(decoded.submission.content?.attachments).toHaveLength(75);
    expect(decoded.apiKey).toBeUndefined();
    expect(decoded.version).toBeUndefined();
  });

  it('acks a poison message independently and does not retry an earlier valid legacy message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const long = 'x'.repeat(12_000);
    const valid = queueMessage({
      jobId: long,
      itemId: 'item-valid',
      sessionId: long,
      classId: long,
      submission: { id: long },
      studentName: long,
      lessonName: long,
    });
    const poison = queueMessage({ jobId: 'missing-required-fields' });
    const env = {
      DB: {
        prepare: () => ({
          bind() { return this; },
          first: async () => null,
          run: async () => ({ success: true }),
        }),
      },
    } as unknown as Env;

    await processGradingBatch({ messages: [valid, poison] } as unknown as MessageBatch<GradingQueueMessage>, env);

    expect(valid.ack).toHaveBeenCalledOnce();
    expect(valid.retry).not.toHaveBeenCalled();
    expect(poison.ack).toHaveBeenCalledOnce();
    expect(poison.retry).not.toHaveBeenCalled();
  });
});

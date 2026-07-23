import test from 'node:test';
import assert from 'node:assert/strict';
import { getSlotAssessments } from '../src/services/assessmentService.ts';
import { app } from '../public/js/index/registry.js';
import { state } from '../public/js/index/state.js';
import '../public/js/index/constants.js';
import '../public/js/index/assessments.js';

function assessmentRow(overrides = {}) {
  return {
    id: 'assessment-id',
    class_id: 'class-1',
    slot_id: 'slot-1',
    student_id: 'student-1',
    learning_level: 'understands_and_asks',
    note: 'Ghi chú hiện tại',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function mockAssessmentEnv(currentRows, previousRows) {
  let queryCount = 0;
  return {
    DB: {
      prepare() {
        const rows = queryCount++ === 0 ? currentRows : previousRows;
        return {
          bind() {
            return this;
          },
          async all() {
            return { results: rows };
          },
        };
      },
    },
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function resetFrontendAssessmentState() {
  state.classData = {
    id: 'class-1',
    name: 'Lớp thử nghiệm',
    classSites: [{ _id: 'site-1' }],
    courseProcessId: 'course-1',
    slots: [],
  };
  state.selectedSlot = { _id: 'slot-current', index: 3 };
  state.students = [];
  state.regularNoteDrafts = {};
  state.regularLearningLevelDrafts = {};
  state.regularServerSyncedAssessments = {};
  state.regularInheritedAssessments = {};
  state.regularAssessmentTouched.clear();
  state.regularAssessmentAutoSaveBusy.clear();
  state.regularAssessmentAutoSaveErrors = {};
  state.regularAssessmentAutoSaveTokens = {};
  state.regularAssessmentAutoSavePromises = {};
  state.regularAssessmentContextEpoch = 1;
  state.regularAssessmentLoad = {
    slotId: 'slot-current',
    token: 1,
    loading: false,
    error: null,
    promise: Promise.resolve(),
  };
  app.getCurrentSessionNumber = () => 4;
  globalThis.document = {
    createElement: () => ({ innerHTML: '', textContent: '', innerText: '' }),
    getElementById: (id) => id === 'sessionSummary' ? { value: 'Nội dung buổi học' } : null,
    querySelectorAll: () => [],
  };
}

function frontendAssessment(overrides = {}) {
  return {
    id: 'assessment-id',
    classId: 'class-1',
    slotId: 'slot-current',
    studentId: 'student-1',
    learningLevel: 'understands_and_asks',
    note: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function jsonResponse(assessment) {
  return {
    ok: true,
    status: 200,
    async json() {
      return { success: true, assessment };
    },
  };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

async function waitUntil(predicate, message) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (predicate()) return;
    await flushMicrotasks();
  }
  assert.fail(message);
}

test('current assessment wins and inherited assessment uses the nearest previous slot without its note', async () => {
  const currentRows = [assessmentRow({ student_id: 'student-current', slot_id: 'slot-current' })];
  const previousRows = [
    assessmentRow({ student_id: 'student-history', slot_id: 'slot-old', learning_level: 'needs_support', note: 'Cũ hơn' }),
    assessmentRow({ student_id: 'student-history', slot_id: 'slot-near', learning_level: 'independent', note: 'Không được kế thừa' }),
    assessmentRow({ student_id: 'student-current', slot_id: 'slot-near', learning_level: 'needs_prompting' }),
  ];

  const assessments = await getSlotAssessments(
    mockAssessmentEnv(currentRows, previousRows),
    'teacher@mindx.edu.vn',
    'slot-current',
    'class-1',
    ['slot-near', 'slot-old'],
  );

  assert.equal(assessments['student-current'].inherited, false);
  assert.equal(assessments['student-current'].slotId, 'slot-current');
  assert.equal(assessments['student-history'].inherited, true);
  assert.equal(assessments['student-history'].sourceSlotId, 'slot-near');
  assert.equal(assessments['student-history'].learningLevel, 'independent');
  assert.equal(assessments['student-history'].note, '');
});

test('previous slot ids are ordered by slot index, exclude future slots, and are capped at 100', () => {
  resetFrontendAssessmentState();
  state.classData.slots = [
    { _id: 'future', index: 8 },
    { _id: 'oldest', index: 0 },
    { _id: 'current', index: 5 },
    { _id: 'nearest', index: 4 },
    { _id: 'middle', index: 2 },
  ];

  assert.deepEqual(app.getPreviousRegularSlotIds('current'), ['nearest', 'middle', 'oldest']);

  state.classData.slots = [
    { _id: 'current-large', index: 200 },
    ...Array.from({ length: 150 }, (_, index) => ({ _id: `slot-${index}`, index })),
  ];
  const previous = app.getPreviousRegularSlotIds('current-large');
  assert.equal(previous.length, 100);
  assert.equal(previous[0], 'slot-149');
  assert.equal(previous.at(-1), 'slot-50');
});

test('rapid learning-level changes are serialized and the latest selection is persisted last', async () => {
  resetFrontendAssessmentState();
  const requests = [];
  const responses = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    const response = deferred();
    responses.push(response);
    return response.promise;
  };

  state.regularLearningLevelDrafts['student-1'] = 'needs_prompting';
  const firstSave = app.queueRegularLearningLevelAutosave('student-1');
  await waitUntil(() => requests.length === 1, 'first autosave request did not start');
  state.regularLearningLevelDrafts['student-1'] = 'independent';
  const secondSave = app.queueRegularLearningLevelAutosave('student-1');
  await flushMicrotasks();

  assert.equal(requests.length, 1);
  assert.equal(requests[0].learning_level, 'needs_prompting');

  responses[0].resolve(jsonResponse(frontendAssessment({
    learningLevel: 'needs_prompting',
  })));
  await firstSave;
  await waitUntil(() => requests.length === 2, 'second autosave request did not start');

  assert.equal(requests.length, 2);
  assert.equal(requests[1].learning_level, 'independent');
  responses[1].resolve(jsonResponse(frontendAssessment({
    learningLevel: 'independent',
  })));
  await secondSave;

  assert.equal(state.regularServerSyncedAssessments['student-1'].learningLevel, 'independent');
  assert.equal(state.regularAssessmentAutoSaveBusy.has('student-1'), false);
});

test('an autosave from an old context cannot race a new save after returning to the same slot', async () => {
  resetFrontendAssessmentState();
  const requests = [];
  const responses = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    const response = deferred();
    responses.push(response);
    return response.promise;
  };

  state.regularLearningLevelDrafts['student-1'] = 'needs_support';
  const oldSave = app.queueRegularLearningLevelAutosave('student-1');
  await waitUntil(() => requests.length === 1, 'old-context autosave request did not start');

  state.regularAssessmentContextEpoch = 2;
  state.selectedSlot = { _id: 'slot-other', index: 4 };
  state.regularAssessmentContextEpoch = 3;
  state.selectedSlot = { _id: 'slot-current', index: 3 };
  state.regularLearningLevelDrafts['student-1'] = 'independent';
  const newSave = app.queueRegularLearningLevelAutosave('student-1');
  await flushMicrotasks();

  assert.equal(requests.length, 1);
  responses[0].resolve(jsonResponse(frontendAssessment({
    learningLevel: 'needs_support',
  })));
  await oldSave;
  await waitUntil(() => requests.length === 2, 'new-context autosave request did not start');

  assert.equal(requests.length, 2);
  assert.equal(state.regularServerSyncedAssessments['student-1'], undefined);

  responses[1].resolve(jsonResponse(frontendAssessment({
    learningLevel: 'independent',
  })));
  await newSave;

  assert.equal(state.regularServerSyncedAssessments['student-1'].learningLevel, 'independent');
});

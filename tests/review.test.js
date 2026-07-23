import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../public/js/index/registry.js';
import { state } from '../public/js/index/state.js';
import '../public/js/index/constants.js';
import '../public/js/index/core.js';
import '../public/js/index/ui.js';
import '../public/js/index/assessments.js';
import {
  getReviewSignature,
  buildReviewDuplicateCounts,
  filterRegularReviewRows,
} from '../public/js/index/review.js';

function studentAttendance(id, fullName, status = 'ATTENDED') {
  return {
    _id: `attendance-${id}`,
    status,
    student: { id, fullName },
    commentByAreas: [],
  };
}

function resetReviewState() {
  state.students = [
    studentAttendance('student-1', 'Nguyễn Minh Anh'),
    studentAttendance('student-2', 'Trần Gia Huy'),
    studentAttendance('student-3', 'Lê Khánh Linh', 'LATE_ARRIVED'),
    studentAttendance('student-4', 'Phạm Bảo Ngọc', 'ABSENT_WITH_NOTICE'),
  ];
  state.generatedComments = {
    'student-1': '<p>Minh Anh đi học đúng giờ và tuân thủ tốt nội quy lớp học. Con tự vận dụng kiến thức tốt.</p>',
    'student-2': '<p>Gia Huy đi học đúng giờ và tuân thủ tốt nội quy lớp học. Con chủ động hỏi lại khi chưa hiểu.</p>',
    'student-3': '<p>Khánh Linh đi học muộn nhưng nhanh chóng ổn định và tham gia bài học. Con cần thêm gợi ý.</p>',
    'student-4': '<p>Bảo Ngọc có bản nháp riêng nhưng hôm nay vắng có phép. Gia đình vui lòng theo dõi thêm.</p>',
  };
  state.manualComments = {};
  state.regularLearningLevelDrafts = {
    'student-1': 'independent',
    'student-2': 'understands_and_asks',
    'student-3': 'needs_prompting',
    'student-4': 'understands_and_asks',
  };
  state.regularNoteDrafts = {};
  state.regularServerSyncedAssessments = {};
  state.regularInheritedAssessments = {};
  state.regularAssessmentTouched.clear();
  state.regularAssessmentAutoSaveBusy.clear();
  state.regularAssessmentAutoSaveErrors = {};
  state.regularAssessmentLoad = {
    slotId: 'slot-1',
    token: 1,
    loading: false,
    error: null,
    promise: Promise.resolve(),
  };
  state.selectedSlot = { _id: 'slot-1', index: 3 };
  state.classData = { id: 'class-1', slots: [] };
  state.regularOperationErrors = {};
  state.regularStudentBusy.clear();
  state.regularReviewSearch = '';
  state.regularReviewAlertFilter = 'all';
  state.regularReviewLevelFilter = 'all';
  state.regularReviewSort = 'name';
  state.regularReviewShouldResetScroll = false;
  app.isFinalSession = () => false;
  app.isCheckpointSession = () => false;
}

test('duplicate signatures ignore the student name and flag matching long opening sentences', () => {
  const first = getReviewSignature(
    'Minh Anh đi học đúng giờ và tuân thủ tốt nội quy lớp học. Con làm bài tốt.',
    'Nguyễn Minh Anh',
  );
  const second = getReviewSignature(
    'Gia Huy đi học đúng giờ và tuân thủ tốt nội quy lớp học. Con chủ động hỏi.',
    'Trần Gia Huy',
  );

  assert.equal(first, second);
  const counts = buildReviewDuplicateCounts([
    { studentId: 'student-1', studentName: 'Nguyễn Minh Anh', commentText: 'Minh Anh đi học đúng giờ và tuân thủ tốt nội quy lớp học.', isDraft: true },
    { studentId: 'student-2', studentName: 'Trần Gia Huy', commentText: 'Gia Huy đi học đúng giờ và tuân thủ tốt nội quy lớp học.', isDraft: true },
    { studentId: 'student-3', studentName: 'Lê Khánh Linh', commentText: 'Một câu ngắn.', isDraft: true },
  ]);
  assert.deepEqual(counts, { 'student-1': 2, 'student-2': 2 });
});

test('review filtering supports search, level, duplicate warnings, and deterministic sorting', () => {
  resetReviewState();

  state.regularReviewSearch = 'gia huy';
  let rows = filterRegularReviewRows();
  assert.deepEqual(rows.map(row => row.studentId), ['student-2']);

  state.regularReviewSearch = '';
  state.regularReviewLevelFilter = 'needs_prompting';
  rows = filterRegularReviewRows();
  assert.deepEqual(rows.map(row => row.studentId), ['student-3']);

  state.regularReviewLevelFilter = 'all';
  state.regularReviewAlertFilter = 'duplicate';
  rows = filterRegularReviewRows();
  assert.deepEqual(new Set(rows.map(row => row.studentId)), new Set(['student-1', 'student-2']));

  state.regularReviewAlertFilter = 'all';
  state.regularReviewSort = 'level';
  rows = filterRegularReviewRows();
  assert.deepEqual(rows.map(row => row.studentId), ['student-3', 'student-4', 'student-2', 'student-1']);
});

test('all and filtered submit scopes include only present students with drafts', () => {
  resetReviewState();
  assert.deepEqual(
    new Set(app.getRegularReviewAllDraftIds()),
    new Set(['student-1', 'student-2', 'student-3']),
  );

  state.regularReviewSearch = 'khánh linh';
  assert.deepEqual(app.getRegularReviewFilteredDraftIds(), ['student-3']);
  assert.deepEqual(app.getRegularReviewFilteredPresentIds(), ['student-3']);

  delete state.generatedComments['student-3'];
  assert.deepEqual(app.getRegularReviewFilteredDraftIds(), []);
  assert.deepEqual(app.getRegularReviewFilteredPresentIds(), ['student-3']);
});

test('confirmation freezes the explicit filtered submit scope', () => {
  resetReviewState();
  state.regularBatchBusy = false;
  const elements = {
    confirmModalTitle: { textContent: '' },
    confirmModalDescription: { textContent: '' },
    confirmSubmitButton: { textContent: '' },
    confirmPreview: { innerHTML: '' },
    confirmModal: { classList: { remove() {}, add() {} } },
  };
  globalThis.document = {
    createElement() {
      return { textContent: '', innerHTML: '' };
    },
    getElementById(id) {
      return elements[id] || null;
    },
  };
  app.showToast = () => {};

  app.showConfirmModal(['student-3']);
  assert.deepEqual(state.regularReviewSubmitScopeIds, ['student-3']);
  assert.equal(elements.confirmModalTitle.textContent, 'Gửi 1 nhận xét đang lọc?');

  state.regularReviewSearch = 'một bộ lọc khác';
  assert.deepEqual(state.regularReviewSubmitScopeIds, ['student-3']);

  app.hideConfirmModal();
  assert.equal(state.regularReviewSubmitScopeIds, null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { app } from '../public/js/index/registry.js';
import { state } from '../public/js/index/state.js';
import '../public/js/index/core.js';
import '../public/js/index/checkpoint.js';

test('checkpoint bulk actions only target present and late students', () => {
  app.isPresentAttendance = att => att.status === 'ATTENDED' || att.status === 'LATE_ARRIVED';
  state.students = [
    { student: { id: 'present' }, status: 'ATTENDED' },
    { student: { id: 'late' }, status: 'LATE_ARRIVED' },
    { student: { id: 'absent' }, status: 'ABSENT' },
    { student: { id: 'absent-notice' }, status: 'ABSENT_WITH_NOTICE' },
  ];

  assert.deepEqual(
    app.getCheckpointBulkStudents().map(att => att.student.id),
    ['present', 'late'],
  );
});

test('checkpoint AI errors are rejected instead of becoming parent comments', () => {
  assert.equal(app.getCheckpointAiError('<p>Lỗi AI (model): unauthorized</p>'), 'Lỗi AI (model): unauthorized');
  assert.equal(app.getCheckpointAiError('<p>Học sinh vắng có phép trong buổi checkpoint.</p>'), '');
  assert.equal(app.getCheckpointAiError('<p>   </p>'), '');
});

test('checkpoint comment-only payload sends CONTENT without scores or CHECKPOINT area', () => {
  const payload = app.buildCheckpointCommentOnlyPayload({
    slot_id: 'slot-1',
    class_site_id: 'site-1',
    session_number: 5,
    class_id: 'class-1',
    course_process_id: 'course-1',
    student_attendance_id: 'attendance-1',
    student_id: 'student-1',
    comment: '<p>Học sinh vắng có phép trong buổi checkpoint.</p>',
    summary: '<p>Tổng kết</p>',
  });

  assert.equal(payload.slotType, 'CheckPoint');
  assert.equal(payload.totalScore, null);
  assert.equal(payload.studentComment.byAreas.length, 1);
  assert.equal(payload.studentComment.byAreas[0].type, 'CONTENT');
  assert.equal(payload.studentComment.byAreas.some(area => area.type === 'CHECKPOINT'), false);
  assert.equal(payload.studentComment.byAreas.some(area => area.type === 'RATE'), false);
});

test('checkpoint comment-only inline handler is exported to window', async () => {
  const mainSource = await readFile(new URL('../public/js/index/main.js', import.meta.url), 'utf8');
  assert.match(mainSource, /submitCheckpointCommentOnly:\s*app\.submitCheckpointCommentOnly/);
});

test('submitting one absent comment preserves sibling checkpoint drafts after reload', async () => {
  const originalDocument = globalThis.document;
  const originalMethods = {
    getSessionNumberForTargets: app.getSessionNumberForTargets,
    getCurrentSessionNumber: app.getCurrentSessionNumber,
    submitToLMS: app.submitToLMS,
    logComment: app.logComment,
    showToast: app.showToast,
    reloadAndRestoreCurrentSlot: app.reloadAndRestoreCurrentSlot,
    renderStudents: app.renderStudents,
    updateStats: app.updateStats,
    escapeHtml: app.escapeHtml,
  };

  try {
    state.students = [{
      _id: 'attendance-absent',
      status: 'ABSENT_WITH_NOTICE',
      student: { id: 'absent', fullName: 'Học sinh vắng' },
    }];
    state.selectedSlot = { _id: 'slot-1' };
    state.classData = {
      id: 'class-1',
      name: 'Lớp thử nghiệm',
      courseProcessId: 'course-1',
      classSites: [{ _id: 'site-1' }],
    };
    state.generatedComments = { absent: '<p>Nhận xét vắng</p>', sibling: '<p>Nhận xét đang soạn</p>' };
    state.manualComments = { siblingManual: 'Nhận xét thủ công' };
    state.checkpointDescriptionDrafts = { absent: 'Vắng có phép', sibling: 'Ghi chú đang soạn' };
    state.checkpointScoresCache = { sibling_score: { theory: '4.5', practice: '5' } };

    globalThis.document = {
      getElementById(id) {
        if (id === 'sessionSummary') return { value: 'Tổng kết checkpoint' };
        if (id === 'comment-absent') return { value: 'Nhận xét vắng đã chỉnh sửa' };
        return null;
      },
    };
    app.getSessionNumberForTargets = () => 5;
    app.getCurrentSessionNumber = () => 5;
    app.escapeHtml = value => String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
    app.submitToLMS = async () => ({});
    app.logComment = () => {};
    app.showToast = () => {};
    app.reloadAndRestoreCurrentSlot = async () => {
      state.generatedComments = {};
      state.manualComments = {};
      state.checkpointDescriptionDrafts = {};
      state.checkpointScoresCache = {};
    };
    app.renderStudents = () => {};
    app.updateStats = () => {};

    await app.submitCheckpointCommentOnly('absent', 'attendance-absent', 'absent');

    assert.equal(state.generatedComments.absent, undefined);
    assert.equal(state.generatedComments.sibling, '<p>Nhận xét đang soạn</p>');
    assert.equal(state.manualComments.siblingManual, 'Nhận xét thủ công');
    assert.equal(state.checkpointDescriptionDrafts.sibling, 'Ghi chú đang soạn');
    assert.deepEqual(state.checkpointScoresCache.sibling_score, { theory: '4.5', practice: '5' });
  } finally {
    globalThis.document = originalDocument;
    Object.assign(app, originalMethods);
  }
});

test('direct checkpoint fallback uses the same review format even when attendance is absent', () => {
  const prompt = app.buildDirectCheckpointPrompt({
    student_name: 'Nguyễn Minh Anh',
    attendance_status: 'ABSENT_WITH_NOTICE',
    teacher_description: 'Tư duy logic tốt; cần luyện thêm phần thực hành',
  });

  assert.match(prompt, /Điểm mạnh, Điểm cần cải thiện, Lời khuyên/);
  assert.match(prompt, /Tư duy logic tốt; cần luyện thêm phần thực hành/);
  assert.doesNotMatch(prompt, /vắng có phép|không tham gia bài checkpoint|kiểm tra bù/i);
});

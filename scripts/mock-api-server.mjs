// Local mock of the /api/v2 backend for UI work without LMS credentials.
// Usage: npm run dev:mock  (starts this server on :8787 + Vite on :5173)
// Data is kept in memory, so submits/saves persist until the server restarts.
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT || 8787);
const LATENCY_MS = Number(process.env.MOCK_LATENCY_MS || 350);

const now = new Date();
const daysAgo = (days) => new Date(now.getTime() - days * 86_400_000).toISOString();
const iso = () => new Date().toISOString();
let requestCounter = 0;
const rid = () => `mock-${++requestCounter}`;

const STUDENTS = [
  ['std-01', 'Nguyễn Văn Hoàng An'],
  ['std-02', 'Trần Mai Phương Linh'],
  ['std-03', 'Lê Quang Minh'],
  ['std-04', 'Phạm Hải Đăng'],
  ['std-05', 'Võ Ngọc Bảo Châu'],
  ['std-06', 'Đặng Gia Huy'],
  ['std-07', 'Bùi Thị Khánh Vy'],
  ['std-08', 'Hoàng Đức Thịnh'],
  ['std-09', 'Ngô Minh Khôi Nguyên Phúc Trường'],
  ['std-10', 'Đỗ Thảo Nhi'],
  ['std-11', 'Huỳnh Tấn Phát'],
  ['std-12', 'Phan Anh Thư'],
];

const DEMO_QUESTIONS = [
  { id: 'cp-d-1', title: 'Kỹ năng thuyết trình & trả lời phản biện', maxScore: 2 },
  { id: 'cp-d-2', title: 'Giao diện UI/UX & Tính hoàn thiện sản phẩm', maxScore: 1.5 },
  { id: 'cp-d-3', title: 'Tính năng kỹ thuật & Logic xử lý', maxScore: 1.5 },
];

const COMMENT_SAMPLES = [
  'Hôm nay con tập trung tốt, hoàn thành bài tập đúng hạn và chủ động hỏi khi chưa hiểu phần vòng lặp.',
  'Con nắm được kiến thức cơ bản về biến và điều kiện, tuy nhiên cần luyện thêm phần debug chương trình.',
  'Con tham gia sôi nổi, hỗ trợ bạn bên cạnh và trình bày ý tưởng sản phẩm rất rõ ràng.',
];

function area(type, extra = {}) {
  return {
    grade: null,
    content: '',
    commentAreaId: null,
    type,
    checkpoint: null,
    courseProcessDemoId: null,
    courseProcessFinalEvaluationTitle: null,
    courseProcessFinalEvaluationId: null,
    demoQuestions: [],
    ...extra,
  };
}

// Attendance pattern per (slot, student) so each session looks a bit different.
function attendanceStatus(slotNumber, studentIndex) {
  if (studentIndex === 3 && [5, 9].includes(slotNumber)) return 'ABSENT_WITH_NOTICE';
  if (studentIndex === 10 && slotNumber % 4 === 0) return 'ABSENT';
  if (studentIndex === 11 && [9, 14].includes(slotNumber)) return 'ABSENT';
  if (studentIndex === 2 && slotNumber % 3 === 0) return 'LATE_ARRIVED';
  return 'ATTENDED';
}

function buildSlot(slotNumber, classId, { totalSlots, submittedUpTo }) {
  const isCheckpoint = slotNumber === 5 || slotNumber === 9;
  const isDemo = slotNumber === totalSlots;
  return {
    id: `${classId}-slot-${slotNumber}`,
    index: slotNumber - 1,
    date: daysAgo((totalSlots - slotNumber) * 7 + 1),
    summary: slotNumber <= submittedUpTo
      ? `Buổi ${slotNumber}: Ôn tập kiến thức cũ, học khái niệm mới và thực hành dự án nhỏ theo nhóm.`
      : '',
    studentAttendance: STUDENTS.map(([studentId, displayName], studentIndex) => {
      const status = attendanceStatus(slotNumber, studentIndex);
      const present = status === 'ATTENDED' || status === 'LATE_ARRIVED';
      const commentByAreas = [];
      if (present && slotNumber <= submittedUpTo && !isCheckpoint && !isDemo) {
        commentByAreas.push(area('CONTENT', { content: COMMENT_SAMPLES[(slotNumber + studentIndex) % COMMENT_SAMPLES.length] }));
      }
      // Checkpoint 1: two students have a comment on LMS but no checkpoint score yet.
      if (slotNumber === 5 && present && (studentIndex === 4 || studentIndex === 5)) {
        commentByAreas.push(area('CONTENT', { content: 'Con làm bài nghiêm túc, cần ôn lại phần vòng lặp lồng nhau.' }));
      }
      // Checkpoint 1: a few students already graded and submitted.
      if (isCheckpoint && slotNumber === 5 && present && studentIndex < 4) {
        commentByAreas.push(area('CHECKPOINT', {
          checkpoint: {
            practiceScore: 3.5 + (studentIndex % 2) * 0.5,
            checkpointScore: 4 - (studentIndex % 3) * 0.5,
            checkpointQuestions: [],
          },
        }));
        commentByAreas.push(area('CONTENT', { content: 'Con làm tốt phần lý thuyết, phần thực hành còn thiếu xử lý trường hợp đặc biệt.' }));
      }
      // Final demo: two students already scored.
      if (isDemo && present && studentIndex < 2) {
        commentByAreas.push(area('DEMO', {
          demoQuestions: DEMO_QUESTIONS.map((question, qi) => ({
            courseProcessDemoDetailId: question.id,
            title: question.title,
            result: null,
            score: question.maxScore - (qi + studentIndex) * 0.25,
            maxScore: question.maxScore,
          })),
        }));
      }
      return {
        id: `${classId}-att-${slotNumber}-${studentId}`,
        studentId,
        displayName,
        status,
        commentByAreas,
      };
    }),
  };
}

function buildClass({ id, name, shortName, courseName, totalSlots, submittedUpTo, status = 'RUNNING', recentlyEnded = false }) {
  const slots = Array.from({ length: totalSlots }, (_, i) => buildSlot(i + 1, id, { totalSlots, submittedUpTo }));
  return {
    id,
    name,
    status,
    startDate: daysAgo(totalSlots * 7 + 7),
    endDate: daysAgo(-7),
    recentlyEnded,
    course: { id: `course-${id}`, name: courseName, shortName },
    sites: [{ id: 'site-1', name: 'MindX Hà Đông' }],
    slotCount: slots.length,
    commentProgress: { state: 'unknown', badgeText: 'Chưa có dữ liệu', slotNumber: null, present: null, completed: null, missing: null },
    courseProcessId: `process-${id}`,
    courseProcess: {
      id: `process-${id}`,
      name: `${courseName} - Lộ trình chuẩn`,
      finalSession: {
        finalEvaluations: [
          {
            id: 'fe-1',
            title: 'KỸ NĂNG',
            commentAreas: [
              { id: 'ca-think', name: 'Năng lực tư duy', type: 'RATE', rates: [{ value: 5, commentSamples: ['Tư duy logic tốt'] }] },
              { id: 'ca-team', name: 'Làm việc nhóm', type: 'RATE', rates: [{ value: 4, commentSamples: ['Hợp tác tốt'] }] },
            ],
          },
        ],
        demoScore: {
          id: 'demo-score-1',
          commentAreas: [{ id: 'ca-demo', name: 'Tiêu chí Demo cuối khóa', type: 'DEMO', demo: DEMO_QUESTIONS }],
        },
      },
    },
    slots,
  };
}

const classes = [
  buildClass({ id: 'class-1', name: 'HN-PTA-2406 · Python Web nâng cao', shortName: 'PTA', courseName: 'Python Advanced Web', totalSlots: 14, submittedUpTo: 8 }),
  buildClass({ id: 'class-2', name: 'HN-SB-2408 · Scratch cơ bản', shortName: 'SB', courseName: 'Scratch Basic', totalSlots: 14, submittedUpTo: 13 }),
  buildClass({ id: 'class-3', name: 'HN-GB-2402 · Game Builder', shortName: 'GB', courseName: 'Game Builder', totalSlots: 14, submittedUpTo: 14, status: 'FINISHED', recentlyEnded: true }),
];
const classById = new Map(classes.map((item) => [item.id, item]));
const assessments = new Map(); // key slotId:studentId
let config = {
  aiModel: 'google/gemini-2.5-flash',
  customModelId: '',
  thinkingLevel: 'medium',
  thinkingLevels: ['off', 'low', 'medium', 'high'],
  commentLength: 'medium',
  customPrompt: '',
  hasOpenRouterKey: true,
};

function findSlot(slotId) {
  for (const item of classes) {
    const slot = item.slots.find((s) => s.id === slotId);
    if (slot) return { klass: item, slot };
  }
  return null;
}

// Mirrors computeClassCommentProgress in the frontend so the class list badges look real.
function hasSubmission(attendance, mode) {
  const has = (type, content) => attendance.commentByAreas.some((a) => a.type === type && (!content || a.content.trim()));
  if (mode === 'demo') return has('DEMO') || has('CONTENT', true);
  if (mode === 'checkpoint') return has('CHECKPOINT') || has('CONTENT', true);
  return has('CONTENT', true);
}
function slotProgress(slot, index) {
  const number = index + 1;
  const mode = number === 14 ? 'demo' : [5, 9].includes(number) ? 'checkpoint' : 'regular';
  const present = slot.studentAttendance.filter((s) => s.status === 'ATTENDED' || s.status === 'LATE_ARRIVED');
  const completed = present.filter((s) => hasSubmission(s, mode)).length;
  return { number, present: present.length, completed, missing: present.length - completed };
}
function commentProgress(slots) {
  const latest = slots.length - 1;
  if (latest < 0) return { state: 'unknown', badgeText: 'Chưa có dữ liệu', slotNumber: null, present: null, completed: null, missing: null };
  let pending = null;
  for (let i = latest; i >= 0; i--) {
    const p = slotProgress(slots[i], i);
    if (p.present > 0 && p.missing > 0) pending = p;
  }
  const p = pending || slotProgress(slots[latest], latest);
  return {
    state: pending ? 'pending' : 'done',
    badgeText: pending ? 'Chưa nhận xét' : 'Đã nhận xét',
    slotNumber: p.number,
    present: p.present,
    completed: p.completed,
    missing: p.missing,
  };
}

function summaryOf(item) {
  const { courseProcessId, courseProcess, slots, ...summary } = item;
  return { ...summary, commentProgress: commentProgress(slots) };
}

const LEVELS = ['independent', 'understands_and_asks', 'needs_prompting', 'needs_support'];
function seedAssessment(slotId, studentId, classId) {
  const key = `${slotId}:${studentId}`;
  if (assessments.has(key)) return assessments.get(key);
  const slotNumber = Number(slotId.split('-slot-')[1]);
  const studentNumber = Number(studentId.slice(-2));
  if (slotNumber > 8) return null;
  const value = {
    id: `asm-${key}`,
    studentId,
    slotId,
    classId,
    learningLevel: LEVELS[(slotNumber + studentNumber) % 4],
    note: slotNumber % 2 ? 'Cần nhắc nhở tập trung cuối giờ.' : '',
    createdAt: daysAgo(10),
    updatedAt: daysAgo(10),
    inherited: false,
    sourceSlotId: slotId,
  };
  assessments.set(key, value);
  return value;
}

function checkpointStatus(classId, checkpoint) {
  const item = classById.get(classId);
  const examId = `${classId}-cp${checkpoint}`;
  return {
    classId,
    checkpoint,
    original: { id: examId, branch: 'original', title: `Checkpoint ${checkpoint} - ${item.course.shortName}`, status: 'published', practiceType: item.course.shortName === 'SB' ? 'SCRATCH' : 'PYTHON' },
    makeup: { id: `${examId}-mu`, branch: 'makeup', title: `Checkpoint ${checkpoint} (thi bù)`, status: 'published', practiceType: 'PYTHON' },
    students: STUDENTS.map(([studentId], index) => {
      const submittedOriginal = index !== 3 && index !== 7 && index !== 11;
      const submittedMakeup = index === 3 || index === 5;
      const branch = (b, file) => ({
        branch: b,
        submittedAt: daysAgo(b === 'original' ? 30 : 27),
        practiceType: 'PYTHON',
        links: [
          { kind: 'essay', label: file, url: `https://example.com/files/${studentId}/${file}` },
          ...(index % 3 === 0 ? [{ kind: 'scratch', label: 'Dự án Scratch', url: `https://scratch.mit.edu/projects/10000${index}` }] : []),
        ],
      });
      const original = submittedOriginal ? branch('original', 'bai_lam.py') : null;
      const makeup = submittedMakeup ? branch('makeup', 'bai_lam_bu.py') : null;
      return { studentId, original, makeup, defaultBranch: makeup ? 'makeup' : original ? 'original' : null };
    }),
  };
}

const round = (value) => Math.round(value * 2) / 2;

function gradeResult(body) {
  const seed = Number(body.studentId.slice(-2));
  const correct = 6 + (seed % 5);
  const items = Array.from({ length: 10 }, (_, i) => ({
    number: i + 1,
    studentAnswer: 'ABCD'[(i + seed) % 4],
    correctAnswer: 'ABCD'[i % 4],
    correct: i < correct,
  }));
  const essayScore = round(1 + (seed % 3) * 0.5);
  return {
    studentId: body.studentId,
    examId: `${body.classId}-cp${body.checkpoint}`,
    branch: body.branch || 'original',
    skippedScratch: false,
    scratch: null,
    theoryScore: round(correct * 0.5),
    practiceScore: round(Math.min(5, 2 + essayScore)),
    mc: { total: 10, correct, items },
    essay: {
      notes: 'Code chạy đúng phần lớn test, thiếu kiểm tra đầu vào rỗng.',
      items: [{ number: 1, score: essayScore, note: 'Đúng logic chính' }, { number: 2, score: 2, note: 'Hoàn thành' }],
    },
    teacherNotes: '',
  };
}

const rankOf = (total, max) => {
  const percent = (total / max) * 100;
  return percent >= 85 ? 'A' : percent >= 70 ? 'B' : percent >= 50 ? 'C' : 'D';
};

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

route('GET', /^\/api\/v2\/auth\/session$/, () => ({ authenticated: true, email: 'giaovien@mindx.edu.vn', tokenExpiry: Date.now() + 86_400_000, displayName: 'Giáo viên Demo' }));
route('POST', /^\/api\/v2\/auth\/login$/, () => ({ authenticated: true, email: 'giaovien@mindx.edu.vn', tokenExpiry: Date.now() + 86_400_000, displayName: 'Giáo viên Demo' }));
route('POST', /^\/api\/v2\/auth\/logout$/, () => ({ loggedOut: true }));
route('GET', /^\/api\/v2\/config$/, () => config);
route('PUT', /^\/api\/v2\/config$/, (_m, body) => { config = { ...config, ...body }; return config; });
route('GET', /^\/api\/v2\/ai\/models/, () => ({
  source: 'cache',
  cachedAt: iso(),
  models: [
    { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', reasoning: true, thinkingLevels: ['off', 'low', 'medium', 'high'] },
    { id: 'openai/gpt-5-mini', name: 'GPT-5 mini', reasoning: true, thinkingLevels: ['low', 'medium', 'high'] },
  ],
  thinkingLevels: ['off', 'low', 'medium', 'high'],
}));
route('GET', /^\/api\/v2\/classes$/, () => ({ classes: classes.map(summaryOf) }));
route('GET', /^\/api\/v2\/classes\/([^/]+)$/, ([classId]) => {
  const item = classById.get(classId);
  if (!item) throw notFound();
  return { class: { ...item, commentProgress: commentProgress(item.slots) } };
});
route('GET', /^\/api\/v2\/classes\/([^/]+)\/homework$/, ([classId]) => ({
  classId,
  students: STUDENTS.map(([id, displayName]) => ({ id, studentUid: `uid-${id}`, displayName })),
  lessons: Array.from({ length: 8 }, (_, i) => ({ id: `lesson-${i + 1}`, name: `Bài ${i + 1}: Bài tập về nhà`, type: 'HOMEWORK', isActive: true, displayOrder: i + 1 })),
  submissions: STUDENTS.flatMap(([id], si) => Array.from({ length: 7 }, (_, li) => ({
    id: `sub-${id}-${li}`,
    type: 'HOMEWORK',
    note: li % 2 ? 'Bài làm tốt' : '',
    score: (si + li) % 3 === 0 ? null : 7 + ((si + li) % 4),
    status: (si + li) % 3 === 0 ? 'SUBMITTED' : 'MARKED',
    category: null,
    classId,
    lessonId: `lesson-${li + 1}`,
    learningCourseId: null,
    studentUid: `uid-${id}`,
    markedAt: daysAgo(20 - li),
    markedBy: 'Giáo viên Demo',
    submittedAt: daysAgo(21 - li),
    submittedCount: 1,
    content: { attachments: [] },
  })).filter((_, li) => (si + li) % 5 !== 4)),
}));
route('GET', /^\/api\/v2\/classes\/([^/]+)\/storage-products$/, () => ({ files: [] }));
route('GET', /^\/api\/v2\/classes\/([^/]+)\/checkpoints\/([12])\/status$/, ([classId, n]) => {
  if (!classById.has(classId)) throw notFound();
  return checkpointStatus(classId, Number(n));
});
route('POST', /^\/api\/v2\/checkpoints\/grade$/, (_m, body) => gradeResult(body));
function mockProcessParagraph(process) {
  if (!process) return '';
  const parts = [`Đánh giá quá trình học của con: Từ buổi ${process.fromSession} đến buổi ${process.toSession},`];
  parts.push(process.lateSessions.length >= 3 ? 'thời gian này con đi học chưa thật sự đúng giờ.' : 'con đi học đúng giờ và tuân thủ tốt nội quy.');
  if (process.homework?.missingSessions.length) parts.push(`Con chưa nộp BTVN ${process.homework.missingSessions.map((s) => `buổi ${s}`).join(', ')}, phụ huynh nhắc con bổ sung nhé.`);
  else if (process.homework) parts.push('Con hoàn thành đầy đủ bài tập về nhà.');
  parts.push(`(mock: ${process.sessionComments.length} nhận xét buổi trước${process.previousCheckpointScore != null ? `, CP1 ${process.previousCheckpointScore}/5` : ''})`);
  return parts.join(' ') + ' ';
}
route('POST', /^\/api\/v2\/checkpoints\/comments\/generate$/, (_m, body) => ({
  comment: `${mockProcessParagraph(body.learningProcess)}Điểm mạnh: Trong bài kiểm tra checkpoint, ${STUDENTS.find(([id]) => id === body.studentId)?.[1] ?? 'con'} nắm vững phần lý thuyết về hàm và vòng lặp. Phần thực hành con hoàn thành phần lớn yêu cầu, cần chú ý kiểm tra dữ liệu đầu vào. ${body.teacherDescription ? `Ghi chú: ${body.teacherDescription}` : ''}`.trim(),
}));
route('POST', /^\/api\/v2\/slots\/([^/]+)\/checkpoints\/submit$/, ([slotId], body) => {
  const theory = body.scores.strategy === 'explicit' && body.scores.theoryScore != null ? body.scores.theoryScore : 4;
  const practice = body.scores.strategy === 'explicit' && body.scores.practiceScore != null ? body.scores.practiceScore : 3.5;
  const found = findSlot(slotId);
  const attendance = found?.slot.studentAttendance.find((s) => s.studentId === body.studentId);
  if (attendance) {
    attendance.commentByAreas = attendance.commentByAreas.filter((a) => a.type !== 'CHECKPOINT');
    attendance.commentByAreas.push(area('CHECKPOINT', { checkpoint: { practiceScore: practice, checkpointScore: theory, checkpointQuestions: [] } }));
    if (body.comment) {
      attendance.commentByAreas = attendance.commentByAreas.filter((a) => a.type !== 'CONTENT');
      attendance.commentByAreas.push(area('CONTENT', { content: body.comment }));
    }
  }
  const total = (theory + practice) / 2;
  return {
    slotId, studentId: body.studentId, attendanceId: body.attendanceId, submitted: true, mode: body.mode,
    summaryIncluded: Boolean(body.summary), logged: true, theoryScore: theory, practiceScore: practice,
    totalScore: total, rank: rankOf(total, 5),
    questions: Array.from({ length: 10 }, (_, i) => ({ number: i + 1, correct: i < theory * 2, score: i < theory * 2 ? 0.5 : 0 })),
  };
});
const demoSchema = { source: 'dynamic', fallbackKind: null, label: 'Tiêu chí Demo cuối khóa', questions: DEMO_QUESTIONS, maxScore: 5 };
route('GET', /^\/api\/v2\/slots\/([^/]+)\/demo$/, () => ({ schema: demoSchema }));
route('POST', /^\/api\/v2\/slots\/([^/]+)\/demo\/random-scores$/, (_m, body) => {
  const minP = body.minPercent ?? (body.minScore != null ? body.minScore * 20 : 70);
  const maxP = body.maxPercent ?? (body.maxScore != null ? body.maxScore * 20 : 95);
  const questions = DEMO_QUESTIONS.map((q) => {
    const percent = minP + Math.random() * (maxP - minP);
    return { ...q, score: Math.round((q.maxScore * percent) / 100 * 4) / 4 };
  });
  return { schema: demoSchema, questions, demoScore: questions.reduce((s, q) => s + q.score, 0) };
});
route('POST', /^\/api\/v2\/slots\/([^/]+)\/demo\/submit$/, ([slotId], body) => {
  const questions = DEMO_QUESTIONS.map((q) => ({ ...q, score: body.customScores?.find((c) => c.questionId === q.id)?.score ?? q.maxScore * 0.8 }));
  const demoScore = questions.reduce((s, q) => s + q.score, 0);
  const found = findSlot(slotId);
  const attendance = found?.slot.studentAttendance.find((s) => s.studentId === body.studentId);
  if (attendance) {
    attendance.commentByAreas = attendance.commentByAreas.filter((a) => a.type !== 'DEMO');
    attendance.commentByAreas.push(area('DEMO', { demoQuestions: questions.map((q) => ({ courseProcessDemoDetailId: q.id, title: q.title, result: null, score: q.score, maxScore: q.maxScore })) }));
  }
  const abilityScore = 4;
  const totalScore = (demoScore + abilityScore) / 2;
  return { slotId, studentId: body.studentId, attendanceId: body.attendanceId, submitted: true, summaryIncluded: Boolean(body.summary), logged: true, schema: demoSchema, questions, demoScore, abilityScore, totalScore, rank: rankOf(totalScore, 5) };
});
route('GET', /^\/api\/v2\/slots\/([^/]+)\/assessments$/, ([slotId], _b, query) => {
  const found = findSlot(slotId);
  if (!found) throw notFound();
  const classId = query.get('classId') || found.klass.id;
  const current = found.slot.studentAttendance.map((s) => seedAssessment(slotId, s.studentId, classId)).filter(Boolean);
  const history = query.getAll('historySlotId').flatMap((historySlotId) => STUDENTS.map(([studentId]) => seedAssessment(historySlotId, studentId, classId)).filter(Boolean))
    .map((a) => ({ studentId: a.studentId, slotId: a.slotId, learningLevel: a.learningLevel }));
  return { assessments: current, history };
});
const saveAssessment = ([slotId, studentId], body) => {
  const key = `${slotId}:${studentId}`;
  const prev = assessments.get(key);
  const value = {
    id: prev?.id || `asm-${key}`, studentId, slotId, classId: body.classId, learningLevel: body.learningLevel,
    note: body.note ?? prev?.note ?? '', createdAt: prev?.createdAt || iso(), updatedAt: iso(), inherited: false, sourceSlotId: slotId,
  };
  assessments.set(key, value);
  return { assessment: value };
};
route('PUT', /^\/api\/v2\/slots\/([^/]+)\/assessments\/([^/]+)$/, saveAssessment);
route('PATCH', /^\/api\/v2\/slots\/([^/]+)\/assessments\/([^/]+)\/learning-level$/, saveAssessment);
route('POST', /^\/api\/v2\/comments\/generate$/, (_m, body) => ({
  comment: `${body.studentCallName || body.studentName} ${COMMENT_SAMPLES[body.studentName.length % COMMENT_SAMPLES.length].replace(/^Hôm nay con |^Con /, '')}${body.teacherNote ? ` ${body.teacherNote}` : ''}`,
  meta: { source: 'ai', transport: 'server', validationIssues: [] },
}));
route('PUT', /^\/api\/v2\/slots\/([^/]+)\/summary$/, ([slotId], body) => {
  const found = findSlot(slotId);
  if (found) found.slot.summary = body.summary;
  return { slotId, summary: body.summary, saved: true };
});
route('POST', /^\/api\/v2\/slots\/([^/]+)\/comments\/submit$/, ([slotId], body) => {
  const found = findSlot(slotId);
  const attendance = found?.slot.studentAttendance.find((s) => s.studentId === body.studentId);
  if (attendance) {
    attendance.commentByAreas = attendance.commentByAreas.filter((a) => a.type !== 'CONTENT');
    attendance.commentByAreas.push(area('CONTENT', { content: body.comment }));
  }
  if (body.summary && found) found.slot.summary = body.summary;
  return { slotId, studentId: body.studentId, attendanceId: body.attendanceId, submitted: true, summaryIncluded: Boolean(body.summary), logged: true };
});
route('GET', /^\/api\/v2\/slots\/([^/]+)\/student-works$/, () => ({ studentWorks: [] }));
route('GET', /^\/api\/v2\/homework\/jobs/, () => ({ jobs: [] }));
route('GET', /^\/api\/v2\/homework\/score-log/, () => ({ entries: [] }));

function notFound() {
  const error = new Error('Không tìm thấy dữ liệu mock.');
  error.status = 404;
  error.code = 'NOT_FOUND';
  return error;
}

function send(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    const match = routes.find((r) => r.method === req.method && r.pattern.test(url.pathname));
    const requestId = rid();
    setTimeout(() => {
      if (!match) {
        console.warn(`[mock] 404 ${req.method} ${url.pathname}`);
        return send(res, 404, { success: false, error: { code: 'NOT_FOUND', message: `Mock chưa hỗ trợ ${req.method} ${url.pathname}`, requestId } });
      }
      try {
        const params = url.pathname.match(match.pattern).slice(1).map(decodeURIComponent);
        const body = raw ? JSON.parse(raw) : {};
        const data = match.handler(params, body, url.searchParams);
        console.log(`[mock] ${req.method} ${url.pathname}`);
        send(res, 200, { success: true, data, requestId });
      } catch (error) {
        console.error(`[mock] error ${req.method} ${url.pathname}`, error);
        send(res, error.status || 500, { success: false, error: { code: error.code || 'INTERNAL_ERROR', message: error.message || 'Mock error', requestId } });
      }
    }, LATENCY_MS);
  });
});

server.listen(PORT, '127.0.0.1', () => console.log(`[mock] API listening on http://127.0.0.1:${PORT}`));

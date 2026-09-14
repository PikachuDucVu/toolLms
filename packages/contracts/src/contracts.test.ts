import { describe, expect, it } from 'vitest';
import {
  AiModelsResponseSchema,
  ConfigResponseSchema,
  UpdateConfigRequestSchema,
  ApiErrorEnvelopeSchema,
  AssessmentLearningLevelRequestSchema,
  AssessmentLoadQuerySchema,
  AssessmentLoadResponseSchema,
  AssessmentSaveRequestSchema,
  ClassesResponseSchema,
  ClassDetailResponseSchema,
  GradingJobResponseSchema,
  GradingQueueMessageSchema,
  HomeworkBatchMarkRequestSchema,
  HomeworkLoadResponseSchema,
  LoginRequestSchema,
  SessionResponseSchema,
  GenerateCommentRequestSchema,
  GenerateCommentResponseSchema,
  SaveSummaryRequestSchema,
  SubmitCommentRequestSchema,
  SubmitCommentResponseSchema,
  CheckpointSubmitRequestSchema,
  DemoRandomPreviewResponseSchema,
  DemoSubmitRequestSchema,
  StudentWorkSchema,
  SaveStudentWorkInputSchema,
  StudentWorksResponseSchema,
} from './index';

const legacyQueueMessage = {
  jobId: 'job-1',
  itemId: 'item-1',
  sessionId: 'session-1',
  classId: 'class-1',
  submission: { id: 'submission-1' },
  studentName: 'Học sinh',
  lessonName: 'Bài 1',
};

describe('shared network contracts', () => {
  it('rejects malformed login and accepts a bounded request', () => {
    expect(LoginRequestSchema.safeParse({ email: 'not-email', password: '' }).success).toBe(false);
    expect(LoginRequestSchema.parse({ email: 'teacher@example.com', password: 'secret' }).email).toBe('teacher@example.com');
  });

  it('keeps success and error envelopes request-id correlated', () => {
    expect(ApiErrorEnvelopeSchema.parse({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Missing', requestId: 'request-1' },
    }).error.code).toBe('NOT_FOUND');
    expect(SessionResponseSchema.parse({
      success: true,
      data: { authenticated: true, email: 'teacher@example.com', tokenExpiry: 123 },
      requestId: 'request-2',
    }).requestId).toBe('request-2');
  });

  it('enforces body and batch bounds', () => {
    expect(HomeworkBatchMarkRequestSchema.safeParse({ submissions: [] }).success).toBe(false);
    expect(LoginRequestSchema.safeParse({ email: 'teacher@example.com', password: 'x'.repeat(1_001) }).success).toBe(false);
  });

  it('accepts legacy queue messages and additive versioned messages without applying HTTP bounds', () => {
    expect(GradingQueueMessageSchema.parse({ ...legacyQueueMessage, apiKey: '' }).version).toBeUndefined();
    expect(GradingQueueMessageSchema.parse({ ...legacyQueueMessage, version: 1 }).version).toBe(1);
    expect(GradingQueueMessageSchema.safeParse({ ...legacyQueueMessage, version: 2 }).success).toBe(false);
    const legacyLongValue = 'x'.repeat(12_000);
    expect(GradingQueueMessageSchema.parse({
      ...legacyQueueMessage,
      jobId: legacyLongValue,
      studentName: legacyLongValue,
      submission: { id: legacyLongValue, content: { attachments: Array.from({ length: 75 }, () => legacyLongValue) } },
    }).jobId).toHaveLength(12_000);
  });

  it('accepts the precise Phase 4 class and homework response DTOs', () => {
    expect(ClassesResponseSchema.parse({
      success: true,
      requestId: 'request-classes',
      data: { classes: [{
        id: 'class-1', name: 'Lớp 1', status: 'RUNNING', startDate: null, endDate: null,
        recentlyEnded: false, course: null, sites: [], slotCount: 0,
        commentProgress: { state: 'unknown', badgeText: 'Chưa có dữ liệu', slotNumber: null, present: null, completed: null, missing: null },
      }] },
    }).data.classes[0].id).toBe('class-1');

    const homework = HomeworkLoadResponseSchema.parse({
      success: true,
      requestId: 'request-homework',
      data: {
        classId: 'class-1', students: [], lessons: [],
        submissions: [{
          id: 'submission-1', type: 'UPLOAD_FILE', note: '', score: null, status: 'SUBMITTED', category: null,
          classId: 'class-1', lessonId: 'lesson-1', learningCourseId: null, studentUid: 'student-1',
          markedAt: null, markedBy: null, submittedAt: null, submittedCount: 1, content: { attachments: [] },
        }],
      },
    });
    expect(homework.data.submissions[0].content).toEqual({ attachments: [] });
  });

  it('accepts the complete Phase 5 class-detail contract needed by Phase 9', () => {
    const response = ClassDetailResponseSchema.parse({
      success: true,
      requestId: 'request-detail',
      data: { class: {
        id: 'class-1', name: 'Lớp 1', status: 'RUNNING', startDate: null, endDate: null, recentlyEnded: false,
        course: { id: 'course-1', name: 'Course', shortName: 'C' }, sites: [{ id: 'site-1', name: 'Online' }], slotCount: 1,
        commentProgress: { state: 'done', badgeText: 'Đã nhận xét', slotNumber: 1, present: 1, completed: 1, missing: 0 },
        courseProcessId: 'process-1', courseProcess: { id: 'process-1', name: 'Process', finalSession: {
          finalEvaluations: [{ id: 'final-1', title: 'Kỹ năng', commentAreas: [{ id: 'area-1', name: 'Tư duy', type: 'RATE', rates: [{ value: 5, commentSamples: ['Tốt'] }] }] }],
          demoScore: { id: 'demo-1', commentAreas: [{ id: 'demo-area', name: 'Sản phẩm', type: 'DEMO', demo: [{ id: 'criterion-1', title: 'Hoàn thiện', maxScore: 5 }] }] },
        } },
        slots: [{ id: 'slot-1', index: 0, date: null, summary: '', studentAttendance: [{
          id: 'attendance-1', studentId: 'student-1', displayName: 'An', status: 'ATTENDED', commentByAreas: [{
            grade: 5, content: 'Done', commentAreaId: 'comment-area', type: 'DEMO',
            checkpoint: { practiceScore: 4, checkpointScore: 8, checkpointQuestions: [{ id: 'q1', title: 'Question', result: true, score: 1 }] },
            courseProcessDemoId: 'demo-1', courseProcessFinalEvaluationTitle: 'Kỹ năng', courseProcessFinalEvaluationId: 'final-1',
            demoQuestions: [{ courseProcessDemoDetailId: 'criterion-1', title: 'Hoàn thiện', result: false, score: 4.5, maxScore: 5 }],
          }],
        }] }],
      } },
    });
    expect(response.data.class.slots[0].studentAttendance[0].commentByAreas[0].demoQuestions[0].maxScore).toBe(5);
  });

  it('defines precise current, inherited, full-save, and learning-level-only assessment contracts', () => {
    const base = {
      id: 'assessment-1', studentId: 'student-1', slotId: 'slot-current', classId: 'class-1',
      learningLevel: 'independent', createdAt: '2026-07-28T10:00:00.000Z', updatedAt: '2026-07-28T10:05:00.000Z',
    };
    const response = AssessmentLoadResponseSchema.parse({
      success: true,
      requestId: 'request-assessment',
      data: { assessments: [
        { ...base, note: 'Current note', inherited: false, sourceSlotId: 'slot-current' },
        { ...base, id: 'assessment-old', studentId: 'student-2', slotId: 'slot-near', note: '', inherited: true, sourceSlotId: 'slot-near' },
      ] },
    });
    expect(response.data.assessments[0].inherited).toBe(false);
    expect(response.data.assessments[1].inherited).toBe(true);
    expect(AssessmentLoadResponseSchema.safeParse({
      success: true,
      requestId: 'request-assessment',
      data: { assessments: [{ ...base, note: 'must be blank', inherited: true, sourceSlotId: 'slot-near' }] },
    }).success).toBe(false);
    expect(AssessmentLoadQuerySchema.parse({ classId: 'class-1', previousSlotIds: ['slot-near', 'slot-old'] }).previousSlotIds).toEqual(['slot-near', 'slot-old']);
    expect(AssessmentLoadQuerySchema.safeParse({ classId: 'class-1', previousSlotIds: Array.from({ length: 101 }, (_, index) => `slot-${index}`) }).success).toBe(false);
    expect(AssessmentSaveRequestSchema.safeParse({ classId: 'class-1', learningLevel: 'independent', note: 'x'.repeat(4_001) }).success).toBe(false);
    expect(AssessmentLearningLevelRequestSchema.parse({ classId: 'class-1', learningLevel: 'needs_support' }).learningLevel).toBe('needs_support');
    expect(AssessmentLearningLevelRequestSchema.safeParse({ classId: 'class-1', learningLevel: 'L1' }).success).toBe(false);
  });

  it('defines bounded regular comment generation, summary, submission, and normalized metadata contracts', () => {
    const generation = GenerateCommentRequestSchema.parse({
      classId: 'class-1', slotId: 'slot-1', studentId: 'student-1', studentName: 'Nguyễn Văn An',
      pastSlots: [{ index: 1, commentByAreas: [{ type: 'CONTENT', content: '<p>Buổi trước</p>' }] }],
      sessionSummary: 'Vòng lặp', teacherNote: '', learningLevel: 'independent', attendanceStatus: 'ATTENDED',
    });
    expect(generation.commentLength).toBe('medium');
    expect(generation.customPrompt).toBe('');
    expect(GenerateCommentResponseSchema.parse({
      success: true, requestId: 'comment-generate',
      data: { comment: '<p>Nhận xét</p>', meta: { source: 'ai_repair', transport: 'direct', validationIssues: ['Thiếu dữ kiện.'] } },
    }).data.meta.transport).toBe('direct');
    expect(GenerateCommentRequestSchema.safeParse({ ...generation, attendanceStatus: 'PRESENT' }).success).toBe(false);
    expect(SaveSummaryRequestSchema.safeParse({ classId: 'class-1', summary: '' }).success).toBe(false);
    expect(SubmitCommentRequestSchema.parse({
      classId: 'class-1', studentId: 'student-1', attendanceId: 'attendance-1', comment: '<p>Tốt</p>', summary: 'Buổi học',
      generationMeta: { source: 'safe_template', transport: 'server' },
    }).generationMeta?.validationIssues).toEqual([]);
    expect(SubmitCommentResponseSchema.parse({
      success: true, requestId: 'comment-submit', data: {
        slotId: 'slot-1', studentId: 'student-1', attendanceId: 'attendance-1', submitted: true,
        summaryIncluded: true, logged: false,
      },
    }).data.logged).toBe(false);
  });

  it('enforces Phase 9 summary modes, checkpoint modes/scores, and Demo preview results', () => {
    expect(DemoSubmitRequestSchema.safeParse({
      classId: 'class-1', studentId: 'student-1', attendanceId: 'attendance-1', summaryMode: 'required', autoRate: true,
    }).success).toBe(false);
    expect(DemoSubmitRequestSchema.parse({
      classId: 'class-1', studentId: 'student-1', attendanceId: 'attendance-1', summaryMode: 'optional', autoRate: false,
      customScores: [{ questionId: 'q-1', score: 4.25 }],
    }).autoRate).toBe(false);
    expect(CheckpointSubmitRequestSchema.safeParse({
      mode: 'full', classId: 'class-1', studentId: 'student-1', attendanceId: 'attendance-1', summaryMode: 'optional',
      scores: { strategy: 'explicit', theoryScore: 4.25, practiceScore: 4.5 }, comment: '<p>Tốt</p>',
    }).success).toBe(false);
    expect(CheckpointSubmitRequestSchema.safeParse({
      mode: 'full', classId: 'class-1', studentId: 'student-1', attendanceId: 'attendance-1', summaryMode: 'optional',
      scores: { strategy: 'auto' },
    }).success).toBe(false);
    expect(DemoRandomPreviewResponseSchema.parse({
      success: true, requestId: 'demo-preview', data: {
        schema: { source: 'fallback', fallbackKind: 'HACKATHON', label: 'Điểm bài Hackathon', maxScore: 5, questions: [{ id: 'q-1', title: 'Hackathon', maxScore: 5 }] },
        questions: [{ id: 'q-1', title: 'Hackathon', maxScore: 5, score: 3.75 }], demoScore: 3.75,
      },
    }).data.questions[0].score).toBe(3.75);
  });

  it('requires owner-safe normalized job/item fields without exposing owner email', () => {
    const response = GradingJobResponseSchema.parse({
      success: true,
      requestId: 'request-job',
      data: {
        job: {
          id: 'job-1', classId: 'class-1', status: 'completed', totalItems: 2, completedItems: 1,
          failedItems: 1, createdAt: 'now', updatedAt: 'now', cancelledAt: null,
        },
        items: [{
          id: 'item-1', submissionId: 'submission-1', studentUid: 'student-1', lessonId: 'lesson-1',
          status: 'failed', score: null, note: null, error: 'AI failed', result: null, createdAt: 'now', updatedAt: 'now',
        }],
      },
    });
    expect(response.data.job).not.toHaveProperty('ownerEmail');
  });

  it('keeps auto-comment style fields on shared config and defaults missing values', () => {
    const parsed = ConfigResponseSchema.parse({
      success: true,
      requestId: 'request-config',
      data: { aiModel: 'grok-4.6', customModelId: '', thinkingLevel: 'high', thinkingLevels: ['off', 'high'], hasOpenRouterKey: false },
    });
    expect(parsed.data).toMatchObject({ aiModel: 'grok-4.6', commentLength: 'medium', customPrompt: '' });
    expect(UpdateConfigRequestSchema.parse({
      aiModel: 'grok-4.6', customModelId: '', thinkingLevel: 'low', commentLength: 'long', customPrompt: '  Giọng ấm.  ',
    })).toMatchObject({ commentLength: 'long', customPrompt: 'Giọng ấm.' });
  });

  it('normalizes the public model catalog without secret fields', () => {
    const parsed = AiModelsResponseSchema.parse({
      success: true,
      requestId: 'request-3',
      data: {
        source: 'fallback',
        cachedAt: null,
        thinkingLevels: ['off', 'high'],
        models: [{ id: 'gpt-5.4', name: 'GPT-5.4', reasoning: true, thinkingLevels: ['off', 'high'] }],
      },
    });
    expect(parsed.data.models[0]).not.toHaveProperty('apiKey');
  });
  it('validates student work and save student work input schemas', () => {
    const validWork = {
      id: 'work-1',
      status: 'pending',
      studentId: 'student-1',
      classSessionId: 'slot-1',
      classId: 'class-1',
      version: 1,
      displayOrder: 0,
      latestData: {
        title: 'Game Flappy',
        thumbnail: 'https://resources.mindx.edu.vn/uploads/images/test.png',
        videoUrls: [],
        imageUrl: [],
        attachmentUrls: [],
        comment: 'Tot',
        rejectReason: null,
        relatedUrls: [{ name: 'Link', url: 'https://test.com' }],
      },
    };
    expect(StudentWorkSchema.parse(validWork).latestData.title).toBe('Game Flappy');
    expect(StudentWorksResponseSchema.parse({
      success: true,
      requestId: 'req-works',
      data: { studentWorks: [validWork] },
    }).data.studentWorks).toHaveLength(1);

    expect(SaveStudentWorkInputSchema.safeParse({
      classId: 'class-1',
      classSessionId: 'slot-1',
      studentId: 'student-1',
      title: '',
    }).success).toBe(false);

    expect(SaveStudentWorkInputSchema.parse({
      classId: 'class-1',
      classSessionId: 'slot-1',
      studentId: 'student-1',
      title: 'Project 1',
    }).title).toBe('Project 1');
  });
});

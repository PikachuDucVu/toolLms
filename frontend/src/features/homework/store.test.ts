import type { HomeworkSubmission } from '@tool-lms/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { filterHomeworkSubmissions, homeworkStats, pendingSubmissions, uploadSubmissions } from './selectors';
import { useHomeworkStore } from './store';

const submission = (id: string, status: 'SUBMITTED' | 'MARKED', lessonId = 'lesson-1', type = 'UPLOAD_FILE'): HomeworkSubmission => ({
  id, type, note: id === 'one' ? 'server note' : '', score: status === 'MARKED' ? 80 : null, status, category: null,
  classId: 'class-1', lessonId, learningCourseId: null, studentUid: `student-${id}`, markedAt: null, markedBy: null,
  submittedAt: null, submittedCount: 1, content: { attachments: [] },
});

beforeEach(() => useHomeworkStore.getState().reset());

describe('homework workflow store and selectors', () => {
  it('starts with the exact legacy filters and batch score', () => {
    expect(useHomeworkStore.getState()).toMatchObject({ classId: '', lessonId: '', status: 'SUBMITTED', batchScore: '100', activeJobId: null });
  });

  it('refreshes untouched server defaults while preserving teacher and individual-AI drafts', () => {
    const store = useHomeworkStore.getState();
    store.hydrateDrafts([submission('one', 'SUBMITTED'), submission('two', 'SUBMITTED'), submission('three', 'SUBMITTED')]);
    store.setScoreDraft('two', '73');
    store.setNoteDraft('two', 'Bản nháp của giáo viên');
    store.setScoreDraft('three', '77');
    store.setNoteDraft('three', 'AI đề xuất sửa vòng lặp');
    store.toggleSelected('two');

    store.hydrateDrafts([
      { ...submission('one', 'MARKED'), score: 86, note: 'AI đã chấm trên máy chủ' },
      { ...submission('two', 'MARKED'), score: 91, note: 'Giá trị mới trên máy chủ' },
      { ...submission('three', 'MARKED'), score: 92, note: 'Giá trị AI đã lưu trên máy chủ' },
    ]);

    expect(useHomeworkStore.getState().drafts).toMatchObject({
      one: { score: '86', note: 'AI đã chấm trên máy chủ' },
      two: { score: '73', note: 'Bản nháp của giáo viên' },
      three: { score: '77', note: 'AI đề xuất sửa vòng lặp' },
    });
    expect(useHomeworkStore.getState().dirtyDraftIds).toEqual(new Set(['two', 'three']));
    expect(useHomeworkStore.getState().selectedIds).toEqual(new Set(['two']));
  });

  it('reconciles only persisted rows and removes only their selection', () => {
    const store = useHomeworkStore.getState();
    store.hydrateDrafts([submission('one', 'SUBMITTED'), submission('two', 'SUBMITTED')]);
    store.setNoteDraft('one', 'Ghi chú đã gửi');
    store.setNoteDraft('two', 'Bản nháp chưa gửi');
    store.toggleSelected('one');
    store.toggleSelected('two');
    store.reconcilePersistedDrafts([{ id: 'one', score: 91, note: 'Ghi chú đã gửi' }]);
    expect(useHomeworkStore.getState().drafts.one).toEqual({ score: '91', note: 'Ghi chú đã gửi' });
    expect(useHomeworkStore.getState().drafts.two.note).toBe('Bản nháp chưa gửi');
    expect(useHomeworkStore.getState().dirtyDraftIds).toEqual(new Set(['two']));
    expect(useHomeworkStore.getState().selectedIds).toEqual(new Set(['two']));
  });

  it('retains keyed drafts while filter changes clear selection', () => {
    const store = useHomeworkStore.getState();
    store.hydrateDrafts([submission('one', 'SUBMITTED')]);
    store.setScoreDraft('one', '73');
    store.toggleSelected('one');
    store.setLessonId('lesson-2');
    expect(useHomeworkStore.getState().drafts.one.score).toBe('73');
    expect(useHomeworkStore.getState().selectedIds.size).toBe(0);
  });

  it('resets class-scoped drafts without auto-selecting a class', () => {
    useHomeworkStore.getState().hydrateDrafts([submission('one', 'SUBMITTED')]);
    useHomeworkStore.getState().setClassId('class-1');
    expect(useHomeworkStore.getState()).toMatchObject({ classId: 'class-1', lessonId: '' });
    expect(useHomeworkStore.getState().drafts).toEqual({});
    expect(useHomeworkStore.getState().dirtyDraftIds).toEqual(new Set());
  });

  it('uses only upload-file submissions for rows/stats and all pending scope', () => {
    const values = [submission('one', 'SUBMITTED'), submission('two', 'MARKED', 'lesson-2'), submission('quiz', 'SUBMITTED', 'lesson-1', 'QUIZ')];
    expect(uploadSubmissions(values).map((item) => item.id)).toEqual(['one', 'two']);
    expect(homeworkStats(values)).toEqual({ total: 2, pending: 1, marked: 1 });
    expect(filterHomeworkSubmissions(values, 'lesson-2', '')).toHaveLength(1);
    expect(pendingSubmissions(values).map((item) => item.id)).toEqual(['one']);
  });

  it('keeps a frozen non-secret retry scope separate from the job DTO', () => {
    const scope = { classId: 'class-1', submissions: [submission('one', 'SUBMITTED')], students: [], lessons: [], modelId: 'gpt-5.4', customModelId: '', thinkingLevel: 'high' as const };
    useHomeworkStore.getState().startJob('job-1', scope);
    expect(useHomeworkStore.getState().activeJobId).toBe('job-1');
    expect(useHomeworkStore.getState().frozenRetryScope).toEqual(scope);
    expect(useHomeworkStore.getState().frozenRetryScope).not.toHaveProperty('apiKey');
  });
});

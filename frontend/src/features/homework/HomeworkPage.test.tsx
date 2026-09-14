import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders, appQueryClient } from '../../app/providers';
import { useHomeworkStore } from './store';
import { HomeworkPage } from './HomeworkPage';

const envelope = (data: unknown, requestId = 'fixture') => ({ success: true, data, requestId });
const classes = [
  { id: 'class-1', name: 'Lớp đang học', status: 'RUNNING', startDate: null, endDate: null, recentlyEnded: false, course: null, sites: [], slotCount: 0, commentProgress: { state: 'unknown', badgeText: 'Chưa có dữ liệu', slotNumber: null, present: null, completed: null, missing: null } },
  { id: 'class-2', name: 'Lớp khác', status: 'RUNNING', startDate: null, endDate: null, recentlyEnded: false, course: null, sites: [], slotCount: 0, commentProgress: { state: 'unknown', badgeText: 'Chưa có dữ liệu', slotNumber: null, present: null, completed: null, missing: null } },
  { id: 'class-ended', name: 'Lớp vừa kết thúc', status: 'FINISHED', startDate: null, endDate: '2026-07-20T00:00:00.000Z', recentlyEnded: true, course: null, sites: [], slotCount: 0, commentProgress: { state: 'unknown', badgeText: 'Chưa có dữ liệu', slotNumber: null, present: null, completed: null, missing: null } },
];
const students = [
  { id: 'row-1', studentUid: 'student-1', displayName: 'An' },
  { id: 'row-2', studentUid: 'student-2', displayName: 'Bình' },
  { id: 'row-3', studentUid: 'student-3', displayName: 'Chi' },
];
const lessons = [
  { id: 'lesson-1', name: 'Bài 1', type: 'HOMEWORK', isActive: true, displayOrder: 1 },
  { id: 'lesson-2', name: 'Bài 2', type: 'HOMEWORK', isActive: true, displayOrder: 2 },
];
const makeSubmission = (id: string, studentUid: string, lessonId: string, status: 'SUBMITTED' | 'MARKED', type = 'UPLOAD_FILE') => ({
  id, type, note: status === 'MARKED' ? 'Đã chấm' : '', score: status === 'MARKED' ? 90 : null, status, category: null,
  classId: 'class-1', lessonId, learningCourseId: null, studentUid, markedAt: null, markedBy: null, submittedAt: null,
  submittedCount: 1, content: { attachments: [`classes/class-1/${id}.zip`] },
});
let submissions = [
  makeSubmission('submission-1', 'student-1', 'lesson-1', 'SUBMITTED'),
  makeSubmission('submission-2', 'student-2', 'lesson-2', 'SUBMITTED'),
  makeSubmission('submission-3', 'student-3', 'lesson-1', 'MARKED'),
  makeSubmission('quiz-1', 'student-3', 'lesson-1', 'SUBMITTED', 'QUIZ'),
];
let captured: Array<{ path: string; body: any }> = [];
let gradingJobPolls = 0;
let delayedResponses = new Map<string, { promise: Promise<Response>; resolve: (response: Response) => void; signal?: AbortSignal }>();

function delayResponse(path: string) {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  const deferred = { promise, resolve, signal: undefined as AbortSignal | undefined };
  delayedResponses.set(path, deferred);
  return deferred;
}

function installFetch() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = typeof input === 'string' ? input : input instanceof URL ? input.pathname + input.search : new URL(input.url).pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (init?.method && init.method !== 'GET') captured.push({ path, body });
    const delayed = delayedResponses.get(path);
    if (delayed) {
      delayed.signal = init?.signal || undefined;
      return delayed.promise;
    }
    if (path === '/api/v2/auth/session') return json(envelope({ authenticated: true, email: 'teacher@example.com', tokenExpiry: 9999999999 }));
    if (path === '/api/v2/config') return json(envelope({ aiModel: 'gpt-5.4', customModelId: '', thinkingLevel: 'high', thinkingLevels: ['off', 'low', 'medium', 'high'], hasOpenRouterKey: false }));
    if (path.startsWith('/api/v2/ai/models')) return json(envelope({ source: 'fallback', cachedAt: null, thinkingLevels: ['off', 'low', 'medium', 'high'], models: [{ id: 'gpt-5.4', name: 'GPT-5.4', reasoning: true, thinkingLevels: ['off', 'low', 'medium', 'high'] }] }));
    if (path === '/api/v2/classes') return json(envelope({ classes }));
    if (path === '/api/v2/classes/class-1/homework') return json(envelope({ classId: 'class-1', students, lessons, submissions }));
    if (path === '/api/v2/classes/class-2/homework') return json(envelope({ classId: 'class-2', students: [], lessons: [], submissions: [] }));
    if (path === '/api/v2/homework/mark') {
      submissions = submissions.map((item) => item.id === body.id ? { ...item, status: 'MARKED' as const, score: body.score, note: body.note } : item);
      return json(envelope({ submission: { id: body.id, score: body.score, status: 'MARKED', markedAt: 'now', markedBy: 'Teacher' } }));
    }
    if (path === '/api/v2/homework/batch-mark') {
      const results = body.submissions.map((item: { id: string; score: number }, index: number) => index === 0
        ? { id: item.id, success: true, submission: { id: item.id, score: item.score, status: 'MARKED', markedAt: 'now', markedBy: 'Teacher' } }
        : { id: item.id, success: false, error: 'LMS tạm lỗi' });
      submissions = submissions.map((item) => results[0]?.id === item.id ? { ...item, status: 'MARKED' as const, score: results[0].submission.score, note: body.submissions[0].note } : item);
      return json(envelope({ total: results.length, successCount: 1, failureCount: Math.max(0, results.length - 1), results }));
    }
    if (path === '/api/v2/homework/ai-grade') return json(envelope({ score: 77, note: 'AI đề xuất sửa vòng lặp.' }));
    if (path === '/api/v2/homework/jobs' && init?.method === 'POST') return json(envelope({ job: gradingJob('queued', 0, 0) }), 201);
    if (path === '/api/v2/homework/jobs/job-1') {
      gradingJobPolls += 1;
      submissions = submissions.map((item) => item.id === 'submission-1'
        ? { ...item, status: 'MARKED' as const, score: 86, note: 'AI đã chấm trên máy chủ' }
        : item);
      return json(envelope({ job: gradingJob('completed', 1, 1), items: [] }));
    }
    if (path.startsWith('/api/v2/homework/download-url')) return json(envelope({ url: 'https://download.test/file.zip' }));
    throw new Error(`Unhandled request: ${path}`);
  }));
}
function json(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } }); }
function gradingJob(status: 'queued' | 'completed', completedItems: number, failedItems: number) {
  return { id: 'job-1', classId: 'class-1', status, totalItems: 2, completedItems, failedItems, createdAt: 'now', updatedAt: 'now', cancelledAt: null };
}
function renderPage() { return render(<MemoryRouter initialEntries={['/new/homework']}><AppProviders><HomeworkPage /></AppProviders></MemoryRouter>); }
async function chooseClass(user: ReturnType<typeof userEvent.setup>) { await screen.findByRole('option', { name: 'Lớp đang học' }); await user.selectOptions(screen.getByLabelText('Lớp'), 'class-1'); await screen.findByRole('cell', { name: 'An' }); }

beforeEach(() => {
  localStorage.clear();
  appQueryClient().clear();
  useHomeworkStore.getState().reset();
  captured = [];
  gradingJobPolls = 0;
  delayedResponses = new Map();
  submissions = [makeSubmission('submission-1', 'student-1', 'lesson-1', 'SUBMITTED'), makeSubmission('submission-2', 'student-2', 'lesson-2', 'SUBMITTED'), makeSubmission('submission-3', 'student-3', 'lesson-1', 'MARKED'), makeSubmission('quiz-1', 'student-3', 'lesson-1', 'SUBMITTED', 'QUIZ')];
  installFetch();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); appQueryClient().clear(); });

describe('React homework page parity', () => {
  it('groups recently ended classes, never auto-selects, and counts only upload submissions', async () => {
    const user = userEvent.setup(); renderPage();
    const select = await screen.findByLabelText('Lớp');
    expect(select).toHaveValue('');
    await screen.findByRole('option', { name: 'Lớp đang học' });
    expect(select.querySelector('optgroup')?.label).toBe('── Đã kết thúc gần đây ──');
    expect(screen.getByText('Chọn lớp để xem danh sách bài nộp')).toBeInTheDocument();
    await chooseClass(user);
    const stats = screen.getByLabelText('Thống kê bài nộp');
    expect(within(stats).getByText('Tổng bài nộp').nextSibling).toHaveTextContent('3');
    expect(within(stats).getByText('Chờ chấm').nextSibling).toHaveTextContent('2');
    expect(screen.getByRole('heading', { name: 'Danh sách bài nộp (2)' })).toBeInTheDocument();
    expect(screen.queryByText('Chi')).not.toBeInTheDocument();
    expect(screen.queryByText('quiz-1.zip')).not.toBeInTheDocument();
  });

  it('retains score/note drafts across filters while clearing selection', async () => {
    const user = userEvent.setup(); renderPage(); await chooseClass(user);
    const row = screen.getByRole('row', { name: /An/ });
    const score = within(row).getByLabelText('Điểm của An');
    const note = within(row).getByLabelText('Nhận xét cho An');
    await user.clear(score); await user.type(score, '73'); await user.type(note, 'Bản nháp giữ lại');
    await user.click(within(row).getByLabelText('Chọn bài của An'));
    expect(screen.getByRole('button', { name: /^Chấm đã chọn \(1\)$/ })).toBeEnabled();
    await user.selectOptions(screen.getByLabelText('Bài học'), 'lesson-2');
    expect(screen.getByRole('button', { name: /^Chấm đã chọn \(0\)$/ })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Bài học'), 'lesson-1');
    expect(screen.getByLabelText('Điểm của An')).toHaveValue(73);
    expect(screen.getByLabelText('Nhận xét cho An')).toHaveValue('Bản nháp giữ lại');
  });

  it('manual mark changes the pending filter to all and sends the edited draft', async () => {
    const user = userEvent.setup(); renderPage(); await chooseClass(user);
    const row = screen.getByRole('row', { name: /An/ });
    await user.clear(within(row).getByLabelText('Điểm của An')); await user.type(within(row).getByLabelText('Điểm của An'), '88');
    await user.type(within(row).getByLabelText('Nhận xét cho An'), 'Làm tốt');
    await user.click(within(row).getByRole('button', { name: /Gửi/ }));
    await waitFor(() => expect(screen.getByLabelText('Trạng thái')).toHaveValue(''));
    expect(captured.find((item) => item.path === '/api/v2/homework/mark')?.body).toMatchObject({ classId: 'class-1', id: 'submission-1', score: 88, note: 'Làm tốt' });
    expect(await screen.findByText('Đã chấm 88 điểm!')).toBeInTheDocument();
  });

  it('reconciles only a successful single row and preserves the other edited draft and selection', async () => {
    const user = userEvent.setup(); renderPage(); await chooseClass(user);
    const an = screen.getByRole('row', { name: /An/ });
    const binh = screen.getByRole('row', { name: /Bình/ });
    await user.clear(within(an).getByLabelText('Điểm của An')); await user.type(within(an).getByLabelText('Điểm của An'), '88');
    await user.type(within(an).getByLabelText('Nhận xét cho An'), 'Đã gửi cho An');
    await user.clear(within(binh).getByLabelText('Điểm của Bình')); await user.type(within(binh).getByLabelText('Điểm của Bình'), '72');
    await user.type(within(binh).getByLabelText('Nhận xét cho Bình'), 'Bản nháp của Bình');
    await user.click(within(an).getByLabelText('Chọn bài của An'));
    await user.click(within(binh).getByLabelText('Chọn bài của Bình'));
    await user.click(within(an).getByRole('button', { name: /Gửi/ }));
    await screen.findByText('Đã chấm 88 điểm!');
    expect(screen.getByLabelText('Nhận xét cho An')).toHaveValue('Đã gửi cho An');
    expect(screen.getByLabelText('Điểm của Bình')).toHaveValue(72);
    expect(screen.getByLabelText('Nhận xét cho Bình')).toHaveValue('Bản nháp của Bình');
    expect(screen.getByLabelText('Chọn bài của An')).not.toBeChecked();
    expect(screen.getByLabelText('Chọn bài của Bình')).toBeChecked();
  });

  it('preserves failed and unrelated drafts after a partial selected batch and reconciles the successful note', async () => {
    const user = userEvent.setup(); renderPage(); await chooseClass(user);
    await user.selectOptions(screen.getByLabelText('Trạng thái'), '');
    const an = screen.getByRole('row', { name: /An/ });
    const binh = screen.getByRole('row', { name: /Bình/ });
    const chi = screen.getByRole('row', { name: /Chi/ });
    await user.type(within(an).getByLabelText('Nhận xét cho An'), 'Ghi chú thành công');
    await user.clear(within(binh).getByLabelText('Điểm của Bình')); await user.type(within(binh).getByLabelText('Điểm của Bình'), '64');
    await user.type(within(binh).getByLabelText('Nhận xét cho Bình'), 'Giữ khi LMS lỗi');
    await user.type(within(chi).getByLabelText('Nhận xét cho Chi'), 'Không thuộc batch');
    await user.click(within(an).getByLabelText('Chọn bài của An'));
    await user.click(within(binh).getByLabelText('Chọn bài của Bình'));
    await user.click(screen.getByRole('button', { name: /^Chấm đã chọn \(2\)$/ }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Chấm 2 bài' }));
    await screen.findByText('Đã chấm 1/2 bài!');
    expect(screen.getByLabelText('Nhận xét cho An')).toHaveValue('Ghi chú thành công');
    expect(screen.getByLabelText('Nhận xét cho Bình')).toHaveValue('Giữ khi LMS lỗi');
    expect(screen.getByLabelText('Điểm của Bình')).toHaveValue(64);
    expect(screen.getByLabelText('Nhận xét cho Chi')).toHaveValue('Đã chấmKhông thuộc batch');
    expect(screen.getByLabelText('Chọn bài của An')).not.toBeChecked();
    expect(screen.getByLabelText('Chọn bài của Bình')).toBeChecked();
    expect(useHomeworkStore.getState().dirtyDraftIds).toEqual(new Set(['submission-2', 'submission-3']));
  });

  it('refreshes untouched AI-marked rows after a partially successful terminal job while preserving unrelated dirty drafts', async () => {
    const user = userEvent.setup(); renderPage(); await chooseClass(user);
    await user.selectOptions(screen.getByLabelText('Trạng thái'), '');
    const binh = screen.getByRole('row', { name: /Bình/ });
    await user.clear(within(binh).getByLabelText('Điểm của Bình'));
    await user.type(within(binh).getByLabelText('Điểm của Bình'), '64');
    await user.type(within(binh).getByLabelText('Nhận xét cho Bình'), 'Bản nháp không thuộc kết quả thành công');

    await user.click(screen.getByRole('button', { name: 'AI Chấm tất cả' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'AI chấm tất cả' }));

    await waitFor(() => expect(gradingJobPolls).toBe(1), { timeout: 4_000 });
    expect(await screen.findByText('AI đã hoàn tất chấm bài.', {}, { timeout: 4_000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Điểm của An')).toHaveValue(86));
    expect(screen.getByLabelText('Nhận xét cho An')).toHaveValue('AI đã chấm trên máy chủ');
    expect(screen.getByLabelText('Điểm của Bình')).toHaveValue(64);
    expect(screen.getByLabelText('Nhận xét cho Bình')).toHaveValue('Bản nháp không thuộc kết quả thành công');
    expect(useHomeworkStore.getState().dirtyDraftIds).toEqual(new Set(['submission-2']));
  }, 8_000);

  it('mark-all uses every pending upload regardless of lesson filter, reports partial success, and retains pending status', async () => {
    const user = userEvent.setup(); renderPage(); await chooseClass(user);
    await user.selectOptions(screen.getByLabelText('Bài học'), 'lesson-2');
    await user.click(screen.getByRole('button', { name: 'Chấm tất cả 100' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Bạn có chắc muốn chấm 2 bài với 100 điểm?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Chấm 2 bài' }));
    await screen.findByText('Đã chấm 1/2 bài!');
    const request = captured.find((item) => item.path === '/api/v2/homework/batch-mark');
    expect(request?.body.submissions.map((item: { id: string }) => item.id)).toEqual(['submission-1', 'submission-2']);
    expect(screen.getByLabelText('Trạng thái')).toHaveValue('SUBMITTED');
    expect(screen.getByRole('cell', { name: 'Bình' })).toBeInTheDocument();
  });

  it('individual AI only fills drafts and download includes class, submission, and key', async () => {
    const open = vi.fn(); vi.stubGlobal('open', open);
    const user = userEvent.setup(); renderPage(); await chooseClass(user);
    const row = screen.getByRole('row', { name: /An/ });
    await user.click(within(row).getByRole('button', { name: 'AI chấm bài của An' }));
    expect(await within(row).findByLabelText('Điểm của An')).toHaveValue(77);
    expect(within(row).getByLabelText('Nhận xét cho An')).toHaveValue('AI đề xuất sửa vòng lặp.');
    expect(screen.getByLabelText('Trạng thái')).toHaveValue('SUBMITTED');
    expect(captured.some((item) => item.path === '/api/v2/homework/mark')).toBe(false);
    await user.click(within(row).getByRole('button', { name: /submission-1.zip/ }));
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://download.test/file.zip', '_blank', 'noopener,noreferrer'));
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('classId=class-1') && String(input).includes('submissionId=submission-1') && String(input).includes('key=classes%2Fclass-1%2Fsubmission-1.zip'))).toBe(true);
  });

  it('aborts and ignores a delayed manual mark after switching classes', async () => {
    const delayed = delayResponse('/api/v2/homework/mark');
    const user = userEvent.setup(); renderPage(); await chooseClass(user);
    await user.click(within(screen.getByRole('row', { name: /An/ })).getByRole('button', { name: /Gửi/ }));
    await waitFor(() => expect(captured.some((item) => item.path === '/api/v2/homework/mark')).toBe(true));
    await user.selectOptions(screen.getByLabelText('Lớp'), 'class-2');
    expect(delayed.signal?.aborted).toBe(true);
    delayed.resolve(json(envelope({ submission: { id: 'submission-1', score: 100, status: 'MARKED', markedAt: 'now', markedBy: 'Teacher' } })));
    await screen.findByText('Không tìm thấy bài nộp');
    expect(screen.queryByText('Đã chấm 100 điểm!')).not.toBeInTheDocument();
    expect(useHomeworkStore.getState().classId).toBe('class-2');
    expect(useHomeworkStore.getState().drafts['submission-1']).toBeUndefined();
  });

  it('aborts and ignores a delayed individual AI result after switching classes', async () => {
    const delayed = delayResponse('/api/v2/homework/ai-grade');
    const user = userEvent.setup(); renderPage(); await chooseClass(user);
    await user.click(within(screen.getByRole('row', { name: /An/ })).getByRole('button', { name: 'AI chấm bài của An' }));
    await waitFor(() => expect(captured.some((item) => item.path === '/api/v2/homework/ai-grade')).toBe(true));
    await user.selectOptions(screen.getByLabelText('Lớp'), 'class-2');
    expect(delayed.signal?.aborted).toBe(true);
    delayed.resolve(json(envelope({ score: 12, note: 'Kết quả cũ' })));
    await screen.findByText('Không tìm thấy bài nộp');
    expect(useHomeworkStore.getState().drafts['submission-1']).toBeUndefined();
    expect(screen.queryByText(/AI đề xuất 12 điểm/)).not.toBeInTheDocument();
  });

  it('aborts and ignores delayed job creation after switching classes', async () => {
    const delayed = delayResponse('/api/v2/homework/jobs');
    const user = userEvent.setup(); renderPage(); await chooseClass(user);
    await user.click(screen.getByRole('button', { name: 'AI Chấm tất cả' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'AI chấm tất cả' }));
    await waitFor(() => expect(captured.some((item) => item.path === '/api/v2/homework/jobs')).toBe(true));
    await user.selectOptions(screen.getByLabelText('Lớp'), 'class-2');
    expect(delayed.signal?.aborted).toBe(true);
    delayed.resolve(json(envelope({ job: { id: 'job-old', classId: 'class-1', status: 'queued', totalItems: 2, completedItems: 0, failedItems: 0, createdAt: 'now', updatedAt: 'now', cancelledAt: null } }), 201));
    await screen.findByText('Không tìm thấy bài nộp');
    expect(useHomeworkStore.getState().activeJobId).toBeNull();
    expect(screen.queryByText('AI đang chấm bài')).not.toBeInTheDocument();
  });
});

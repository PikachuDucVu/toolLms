import type { ClassDetail } from '@tool-lms/contracts';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../components/ui/ConfirmDialog';
import { ToastProvider } from '../../components/ui/Toast';
import { appQueryClient } from '../../app/providers';
import { activateAssessmentContext } from '../assessments/autosaveController';
import { useAssessmentStore } from '../assessments/assessmentStore';
import { useClassWorkspaceStore } from '../classes/store';
import { CommentEditor } from './CommentEditor';
import { activateCommentContext, resetCommentController } from './generationController';
import { useCommentStore } from './commentStore';

const student = { id: 'attendance-1', studentId: 'student-1', displayName: 'Nguyễn Văn An', status: 'ATTENDED', commentByAreas: [] };
const detail = { id: 'class-1', name: 'Lớp A', status: 'RUNNING', startDate: null, endDate: null, recentlyEnded: false, course: null, sites: [], slotCount: 1, commentProgress: { state: 'pending' as const, badgeText: 'Chưa nhận xét' as const, slotNumber: 1, present: 1, completed: 0, missing: 1 }, courseProcessId: null, courseProcess: null, slots: [{ id: 'slot-1', index: 0, date: '2026-01-01', summary: '', studentAttendance: [student] }] } as unknown as ClassDetail;
const scopeSlot = detail.slots[0];

beforeEach(() => {
  localStorage.clear(); appQueryClient().clear(); resetCommentController(); useCommentStore.getState().reset(); useAssessmentStore.getState().reset(); useClassWorkspaceStore.getState().reset();
  useClassWorkspaceStore.getState().setClassId('class-1'); useClassWorkspaceStore.getState().setSlotIndex('0'); useClassWorkspaceStore.getState().setStudentId('student-1');
  const assessmentContext = activateAssessmentContext('class-1', 'slot-1'); useAssessmentStore.getState().hydrate(assessmentContext, []); activateCommentContext('class-1', 'slot-1', 'Tóm tắt');
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(typeof input === 'string' ? `http://local${input}` : input.toString()).pathname;
    if (path === '/api/v2/config') return json({ success: true, requestId: 'fixture', data: { aiModel: 'gpt-5.4', customModelId: '', thinkingLevel: 'high', thinkingLevels: ['off', 'high'], hasOpenRouterKey: true } });
    if (path.includes('/assessments/student-1')) return json({ success: true, requestId: 'fixture', data: { assessment: { id: 'assessment-1', classId: 'class-1', slotId: 'slot-1', studentId: 'student-1', learningLevel: 'understands_and_asks', note: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', inherited: false, sourceSlotId: 'slot-1' } } });
    if (path === '/api/v2/comments/generate') return json({ success: true, requestId: 'fixture', data: { comment: '<p>Con chủ động.</p>', meta: { source: 'ai', transport: 'server', validationIssues: [] } } });
    if (path === '/api/v2/slots/slot-1/comments/submit') return json({ success: true, requestId: 'fixture', data: { slotId: 'slot-1', studentId: 'student-1', attendanceId: 'attendance-1', submitted: true, summaryIncluded: true, logged: true } });
    throw new Error(`Unhandled ${path} ${init?.method || 'GET'}`);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); appQueryClient().clear(); });

describe('regular comment editor', () => {
  it('keeps controlled manual drafts and labels generated/manual without DOM state', async () => {
    const user = userEvent.setup(); render(<EditorHarness />);
    const input = await screen.findByLabelText('Chỉnh sửa nhận xét của Nguyễn Văn An');
    await user.type(input, 'Nhận xét thủ công');
    expect(useCommentStore.getState().drafts['student-1']).toMatchObject({ content: 'Nhận xét thủ công', kind: 'manual' });
    expect(screen.getByText('Bản nháp thủ công')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Xóa' }));
    expect(await screen.findByRole('alertdialog')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Xóa' }));
    await waitFor(() => expect(useCommentStore.getState().drafts['student-1']).toBeUndefined());
  });

  it('generates on explicit click, exposes generated metadata, and leaves submit untouched', async () => {
    const user = userEvent.setup(); render(<EditorHarness />);
    await user.click(await screen.findByRole('button', { name: 'Tạo nhận xét AI' }));
    await waitFor(() => expect(screen.getByDisplayValue('Con chủ động.')).toBeVisible());
    expect(screen.getByText('Bản nháp AI')).toBeVisible();
    expect(useCommentStore.getState().drafts['student-1']?.generationMeta?.source).toBe('ai');
    expect(screen.getByRole('button', { name: 'Gửi lên LMS' })).toBeEnabled();
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes('/comments/submit'))).toBe(false);
  });
});

function EditorHarness() { return <ToastProvider><ConfirmProvider><CommentEditor detail={detail} slot={scopeSlot} sessionNumber={1} student={student} selectedStudentId="student-1" /></ConfirmProvider></ToastProvider>; }
function json(value: unknown) { return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }); }

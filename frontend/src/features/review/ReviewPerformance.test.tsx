import type { ClassDetail, StudentAttendance } from '@tool-lms/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { memo } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../components/ui/ConfirmDialog';
import { ToastProvider } from '../../components/ui/Toast';
import { activateAssessmentContext, resetAssessmentController } from '../assessments/autosaveController';
import { useAssessmentStore } from '../assessments/assessmentStore';
import { useClassWorkspaceStore } from '../classes/store';
import { activateCommentContext, resetCommentController } from '../comments/generationController';
import { useCommentStore } from '../comments/commentStore';
import { ReviewDialog } from './ReviewDialog';
import { useReviewStore } from './reviewStore';

const renderCounts = vi.hoisted(() => new Map<string, number>());

vi.mock('./ReviewRow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./ReviewRow')>();
  const store = await import('../comments/commentStore');
  const Tracked = memo((props: React.ComponentProps<typeof actual.ReviewRow>) => {
    const id = props.row.studentId;
    store.useCommentStore((state) => state.drafts[id]);
    renderCounts.set(id, (renderCounts.get(id) || 0) + 1);
    return <actual.ReviewRow {...props} />;
  }, actual.sameReviewRowProps);
  return { ...actual, ReviewRow: Tracked };
});

const students: StudentAttendance[] = [
  student('student-1', 'Nguyễn An'), student('student-2', 'Trần Bình'), student('student-3', 'Lê Chi'),
];
const detail = classDetail(students);

beforeEach(() => {
  document.body.innerHTML = '';
  renderCounts.clear(); useAssessmentStore.getState().reset(); useCommentStore.getState().reset(); useReviewStore.getState().reset(); useClassWorkspaceStore.getState().reset();
  resetAssessmentController(); resetCommentController();
  const context = activateAssessmentContext('class-review-performance', 'slot-review-performance');
  useAssessmentStore.getState().hydrate(context, []);
  activateCommentContext('class-review-performance', 'slot-review-performance', 'Tổng kết');
  useCommentStore.setState({ drafts: {
    'student-1': { content: 'Nguyễn An chủ động hoàn thành phần thực hành riêng biệt và biết hỏi lại đúng lúc.', kind: 'manual', generationMeta: null },
    'student-2': { content: 'Trần Bình tập trung luyện tập từng bước và sửa lỗi cẩn thận trong giờ học.', kind: 'manual', generationMeta: null },
    'student-3': { content: 'Lê Chi vận dụng kiến thức vào thử thách mới với cách giải độc lập.', kind: 'manual', generationMeta: null },
  } });
});
afterEach(() => { cleanup(); document.body.innerHTML = ''; });

describe('review row render isolation', () => {
  it('does not rerender unrelated rows for a single canonical draft edit', async () => {
    const root = document.createElement('div'); root.id = 'root'; document.body.appendChild(root);
    render(<ToastProvider><ConfirmProvider><button type="button" onClick={() => useReviewStore.getState().openReview()}>Mở review</button><ReviewDialog detail={detail} slot={detail.slots[0]} sessionNumber={1} /></ConfirmProvider></ToastProvider>, { container: root });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mở review' }));
    const textarea = await screen.findByLabelText('Nhận xét của Nguyễn An');
    renderCounts.clear();

    await userEvent.setup().type(textarea, 'x');

    expect(renderCounts.get('student-1')).toBeGreaterThan(0);
    expect(renderCounts.get('student-2') || 0).toBe(0);
    expect(renderCounts.get('student-3') || 0).toBe(0);
  });
});

function student(id: string, displayName: string): StudentAttendance {
  return { id: `attendance-${id}`, studentId: id, displayName, status: 'ATTENDED', commentByAreas: [] };
}
function classDetail(studentAttendance: StudentAttendance[]): ClassDetail {
  return {
    id: 'class-review-performance', name: 'Lớp Review Performance', status: 'RUNNING', startDate: null, endDate: null, recentlyEnded: false,
    course: null, sites: [], slotCount: 1, courseProcessId: null, courseProcess: null,
    commentProgress: { state: 'pending', badgeText: 'Chưa nhận xét', slotNumber: 1, present: 3, completed: 0, missing: 3 },
    slots: [{ id: 'slot-review-performance', index: 0, date: '2026-01-01', summary: 'Tổng kết', studentAttendance }],
  };
}

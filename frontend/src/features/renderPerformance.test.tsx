import type { ClassDetail, StudentAttendance } from '@tool-lms/contracts';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { memo } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../components/ui/ConfirmDialog';
import { ToastProvider } from '../components/ui/Toast';
import { activateAssessmentContext, resetAssessmentController } from './assessments/autosaveController';
import { useAssessmentStore } from './assessments/assessmentStore';
import { StudentAssessmentList } from './assessments/StudentAssessmentList';
import { useCommentStore } from './comments/commentStore';

const renderCounts = vi.hoisted(() => new Map<string, number>());

vi.mock('./assessments/AssessmentCompactRow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./assessments/AssessmentCompactRow')>();
  const store = await import('./assessments/assessmentStore');
  const Tracked = memo((props: React.ComponentProps<typeof actual.AssessmentCompactRow>) => {
    const id = props.student.studentId;
    store.useAssessmentStore((state) => state.drafts[id]);
    renderCounts.set(id, (renderCounts.get(id) || 0) + 1);
    return <actual.AssessmentCompactRow {...props} />;
  });
  return { ...actual, AssessmentCompactRow: Tracked };
});

const students: StudentAttendance[] = [
  student('student-1', 'Nguyễn An', 'ATTENDED'),
  student('student-2', 'Trần Bình', 'LATE_ARRIVED'),
  student('student-3', 'Lê Chi', 'ATTENDED'),
];
const detail = classDetail(students);

beforeEach(() => {
  renderCounts.clear(); useAssessmentStore.getState().reset(); useCommentStore.getState().reset(); resetAssessmentController();
  const context = activateAssessmentContext('class-performance', 'slot-performance');
  useAssessmentStore.getState().hydrate(context, []);
});
afterEach(cleanup);

describe('compact student row render isolation', () => {
  it('does not rerender unrelated rows while typing the selected note', async () => {
    render(<ToastProvider><ConfirmProvider><StudentAssessmentList detail={detail} slot={detail.slots[0]} students={students} total={3} selectedId="student-1" onSelect={() => undefined} onResetFilters={() => undefined} /></ConfirmProvider></ToastProvider>);
    const desktop = document.querySelector('.desktop-student-detail') as HTMLElement;
    await screen.findAllByRole('heading', { name: 'Nguyễn An' });
    renderCounts.clear();

    await userEvent.setup().type(within(desktop).getByLabelText('Ghi chú bổ sung cho Nguyễn An'), 'abc');

    expect(renderCounts.get('student-1')).toBeGreaterThan(0);
    expect(renderCounts.get('student-2') || 0).toBe(0);
    expect(renderCounts.get('student-3') || 0).toBe(0);
  });
});

function student(id: string, displayName: string, status: StudentAttendance['status']): StudentAttendance {
  return { id: `attendance-${id}`, studentId: id, displayName, status, commentByAreas: [] };
}
function classDetail(studentAttendance: StudentAttendance[]): ClassDetail {
  return {
    id: 'class-performance', name: 'Lớp Performance', status: 'RUNNING', startDate: null, endDate: null, recentlyEnded: false,
    course: null, sites: [], slotCount: 1, courseProcessId: null, courseProcess: null,
    commentProgress: { state: 'pending', badgeText: 'Chưa nhận xét', slotNumber: 1, present: 3, completed: 0, missing: 3 },
    slots: [{ id: 'slot-performance', index: 0, date: '2026-01-01', summary: 'Tổng kết', studentAttendance }],
  };
}

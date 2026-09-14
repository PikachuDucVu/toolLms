import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassSummary, StudentAttendance } from '@tool-lms/contracts';
import { Header } from '../../components/layout/Header';
import { readStudentNotes, writeStudentNote } from '../../lib/persistence';
import { ClassList } from './ClassList';
import { StudentList } from './StudentList';

const classItem = (id: string, name: string, recentlyEnded = false, progress: ClassSummary['commentProgress'] = { state: 'unknown', badgeText: 'Chưa có dữ liệu', slotNumber: null, present: null, completed: null, missing: null }): ClassSummary => ({ id, name, status: recentlyEnded ? 'FINISHED' : 'RUNNING', startDate: null, endDate: recentlyEnded ? '2026-07-20' : null, recentlyEnded, course: null, sites: [], slotCount: recentlyEnded ? 0 : 2, commentProgress: progress });
const student: StudentAttendance = { id: 'attendance-1', studentId: 'student-1', displayName: 'Nguyễn Văn An', status: 'ATTENDED', commentByAreas: [{ grade: null, content: '<p>Con học tốt</p>', commentAreaId: 'area-1', type: 'CONTENT', checkpoint: null, courseProcessDemoId: null, courseProcessFinalEvaluationTitle: null, courseProcessFinalEvaluationId: null, demoQuestions: [] }] };

describe('class workspace components', () => {
  beforeEach(() => { cleanup(); localStorage.clear(); });

  it('renders active/recent class grouping and selects by accessible option', async () => {
    const onSelect = vi.fn();
    render(<ClassList classes={[classItem('a', 'Lớp A'), classItem('b', 'Lớp B', true)]} selectedId="a" loading={false} onSelect={onSelect} />);
    expect(screen.getByText('Đã kết thúc gần đây')).toBeVisible();
    expect(screen.getByRole('option', { name: /Lớp A/ })).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('option', { name: /Lớp B/ }));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('renders golden comment status, metadata and slot count from the normalized list DTO', () => {
    render(<ClassList classes={[classItem('a', 'Lớp A', false, { state: 'pending', badgeText: 'Chưa nhận xét', slotNumber: 2, present: 3, completed: 1, missing: 2 })]} selectedId="" loading={false} onSelect={vi.fn()} />);
    const option = screen.getByRole('option', { name: /Lớp A/ });
    expect(option).toHaveTextContent('Chưa nhận xét');
    expect(option).toHaveTextContent('2 buổi');
    expect(option).toHaveTextContent('Buổi 2: còn 2/3 học sinh chưa nhận xét');
    expect(option).toHaveClass('comment-pending');
  });

  it('keeps local note persistence in the exact unversioned studentNotes object', () => {
    localStorage.setItem('studentNotes', '{bad');
    expect(readStudentNotes()).toEqual({});
    writeStudentNote('student-1', 'Cần ôn tập');
    expect(localStorage.getItem('studentNotes')).toBe('{"student-1":"Cần ôn tập"}');
  });

  it('exposes compact selection and note-save behavior without assessment/comment mutations', async () => {
    const onSave = vi.fn();
    const onDraft = vi.fn();
    render(<StudentList students={[student]} total={1} selectedId="student-1" mode="regular" noteDraft="Ghi chú" persistedNote="" onSelect={vi.fn()} onNoteDraft={onDraft} onSaveNote={onSave} onResetFilters={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Nguyễn Văn An/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByText('Con học tốt').length).toBeGreaterThan(0);
    await userEvent.click(screen.getAllByRole('button', { name: 'Lưu ghi chú' })[0]);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /Tạo nhận xét|Gửi lên LMS|Chấm/ })).not.toBeInTheDocument();
  });

  it('navigates to the route-aware Homework destination', async () => {
    render(<MemoryRouter initialEntries={['/']}><Header /><Routes><Route path="/homework" element={<div>Homework destination</div>} /></Routes></MemoryRouter>);
    await userEvent.click(screen.getByRole('link', { name: /Chấm BTVN/ }));
    expect(screen.getByText('Homework destination')).toBeVisible();
  });
});

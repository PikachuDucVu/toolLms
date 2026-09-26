import type { ClassDetail, StudentAttendance, StudentWork } from '@tool-lms/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmProvider } from '../../components/ui/ConfirmDialog';
import { ToastProvider } from '../../components/ui/Toast';
import { StudentAssessmentList } from '../assessments/StudentAssessmentList';

const token = '0123456789abcdef0123456789abcdef';
const imageUrl = `https://spck.ducvu.io.vn/api/public/download/${token}`;
const pdfUrl = 'https://spck.ducvu.io.vn/api/public/download/abcdefabcdefabcdefabcdefabcdefab';
const savedWork: StudentWork = {
  id: 'work-1',
  status: 'pending',
  studentId: 'student-1',
  classSessionId: 'slot-10',
  classId: 'class-1',
  version: 1,
  displayOrder: 0,
  latestData: {
    title: 'Sản phẩm cuối khóa',
    thumbnail: '',
    videoUrls: [],
    imageUrl: [imageUrl],
    attachmentUrls: [pdfUrl],
    comment: '',
    rejectReason: null,
    relatedUrls: [
      { name: 'game.png', url: imageUrl },
      { name: 'bai.pdf', url: pdfUrl },
    ],
  },
};

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  queryClient.clear();
});

describe('storage product column', () => {
  it('hides the product column before session 10', () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ success: true, requestId: 'req', data: { studentWorks: [], files: [] } })));
    renderList(9);
    expect(screen.queryByRole('columnheader', { name: 'Sản phẩm' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sản phẩm của Nguyễn An' })).not.toBeInTheDocument();
  });

  it('lists only that student files and submits the selection to LMS', async () => {
    const requests: Array<{ url: string; body: any }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if ((init?.method || 'GET') === 'POST') {
        requests.push({ url, body: JSON.parse(String(init?.body)) });
        return json({ success: true, requestId: 'req-save', data: { studentWork: savedWork } });
      }
      if (url.includes('storage-products')) {
        return json({
          success: true,
          requestId: 'req-files',
          data: {
            files: [
              file('1', 'student-1', 'Nguyễn An', 'game.png', 'image/png', imageUrl),
              file('2', 'student-2', 'Trần Bình', 'other.pdf', 'application/pdf', pdfUrl),
              file('3', null, 'Nguyễn An', 'bai.pdf', 'application/pdf', pdfUrl),
            ],
          },
        });
      }
      return json({ success: true, requestId: 'req-works', data: { studentWorks: [] } });
    }));

    renderList(10);
    expect(await screen.findByText('Sản phẩm')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sản phẩm của Nguyễn An' })).toHaveTextContent('2 file'));
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sản phẩm của Nguyễn An' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('game.png')).toBeInTheDocument();
    expect(within(dialog).getByText('bai.pdf')).toBeInTheDocument();
    expect(within(dialog).queryByText('other.pdf')).not.toBeInTheDocument();

    await userEvent.setup().click(within(dialog).getByRole('checkbox', { name: 'Chọn tất cả' }));
    await userEvent.setup().click(within(dialog).getByRole('button', { name: 'Nộp lên LMS' }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].url).toContain('/api/v2/slots/slot-10/student-works');
    expect(requests[0].body).toMatchObject({
      classId: 'class-1',
      classSessionId: 'slot-10',
      studentId: 'student-1',
      classSessionNumber: 10,
      title: 'Sản phẩm cuối khóa',
      comment: '',
      thumbnail: '',
      imageUrl: [],
      videoUrls: [],
      attachmentUrls: [imageUrl, pdfUrl],
      relatedUrls: [
        { name: 'game.png', url: imageUrl },
        { name: 'bai.pdf', url: pdfUrl },
      ],
    });
    expect(await screen.findByText('Đã nộp sản phẩm lên LMS')).toBeInTheDocument();
  });
});

function renderList(sessionNumber: number) {
  const students = [student('student-1', 'Nguyễn An'), student('student-2', 'Trần Bình')];
  const detail = classDetail(students);
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>
          <StudentAssessmentList
            detail={detail}
            slot={detail.slots[0]}
            sessionNumber={sessionNumber}
            students={students}
            total={students.length}
            selectedId="student-1"
            onSelect={() => undefined}
            onResetFilters={() => undefined}
          />
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function file(id: string, lmsStudentId: string | null, studentName: string, originalName: string, mimeType: string, downloadUrl: string) {
  return { id, lmsStudentId, studentName, originalName, fileSize: 1200, mimeType, downloadUrl, createdAt: '2026-04-01T08:00:00.000Z' };
}

function student(id: string, displayName: string): StudentAttendance {
  return { id: `attendance-${id}`, studentId: id, displayName, status: 'ATTENDED', commentByAreas: [] };
}

function classDetail(studentAttendance: StudentAttendance[]): ClassDetail {
  return {
    id: 'class-1',
    name: 'Lớp 1',
    status: 'RUNNING',
    startDate: null,
    endDate: null,
    recentlyEnded: false,
    course: null,
    sites: [],
    slotCount: 1,
    courseProcessId: null,
    courseProcess: null,
    commentProgress: { state: 'pending', badgeText: 'Chưa nhận xét', slotNumber: 10, present: 2, completed: 0, missing: 2 },
    slots: [{ id: 'slot-10', index: 9, date: '2026-04-01', summary: 'Sản phẩm', studentAttendance }],
  };
}

function json(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }));
}

import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeStudentNote } from '../../lib/persistence';
import { useStudentNotes } from './useStudentNotes';

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe('studentNotes legacy interoperability resync', () => {
  it('reads exact legacy JSON and resyncs external storage and window-focus changes', async () => {
    localStorage.setItem('studentNotes', '{"student-1":"Ghi chú legacy","student-2":"Giữ nguyên"}');
    render(<Harness />);
    expect(screen.getByLabelText('Bản nháp ghi chú')).toHaveValue('Ghi chú legacy');

    localStorage.setItem('studentNotes', '{"student-1":"Cập nhật tab khác","student-2":"Giữ nguyên"}');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'studentNotes' })));
    expect(screen.getByLabelText('Bản nháp ghi chú')).toHaveValue('Cập nhật tab khác');

    localStorage.setItem('studentNotes', '{"student-1":"Cập nhật khi focus","student-2":"Giữ nguyên"}');
    act(() => window.dispatchEvent(new Event('focus')));
    expect(screen.getByLabelText('Bản nháp ghi chú')).toHaveValue('Cập nhật khi focus');
  });

  it('characterizes current dirty-note behavior: an external resync replaces the unsaved draft', async () => {
    localStorage.setItem('studentNotes', '{"student-1":"Đã lưu"}');
    render(<Harness />);
    const draft = screen.getByLabelText('Bản nháp ghi chú');
    await userEvent.setup().clear(draft); await userEvent.setup().type(draft, 'Đang sửa chưa lưu');
    expect(draft).toHaveValue('Đang sửa chưa lưu');

    localStorage.setItem('studentNotes', '{"student-1":"Giá trị ngoài"}');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'studentNotes' })));
    expect(draft).toHaveValue('Giá trị ngoài');
  });

  it('writes React edits in the exact raw object serialization decoded by legacy code', async () => {
    localStorage.setItem('studentNotes', '{"student-2":"Legacy first"}');
    render(<Harness />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Lưu như React' }));
    expect(localStorage.getItem('studentNotes')).toBe('{"student-2":"Legacy first","student-1":"React note"}');
    expect(JSON.parse(localStorage.getItem('studentNotes') || '{}')['student-1']).toBe('React note');
  });
});

function Harness() {
  const { noteDraft, setNoteDraft, setNotes } = useStudentNotes('student-1');
  return <><textarea aria-label="Bản nháp ghi chú" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} /><button type="button" onClick={() => setNotes(writeStudentNote('student-1', 'React note'))}>Lưu như React</button></>;
}

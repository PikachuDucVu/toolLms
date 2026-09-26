import { describe, expect, it } from 'vitest';
import { filesForStudent, normalizeStorageName, StorageProductsResponseSchema } from './storageProducts';

const file = {
  id: '1',
  lmsStudentId: 'student-1',
  studentName: 'Nguyễn An',
  originalName: 'game.png',
  fileSize: 10,
  mimeType: 'image/png',
  downloadUrl: 'https://spck.ducvu.io.vn/api/public/download/0123456789abcdef0123456789abcdef',
  createdAt: '2026-04-01T00:00:00.000Z',
};

describe('storage product matching', () => {
  it('matches accent-insensitive names and ignores files owned by another LMS student', () => {
    expect(normalizeStorageName(' Nguyễn  Đỗ ')).toBe('nguyen do');
    const files = [
      file,
      { ...file, id: '2', lmsStudentId: 'student-2', studentName: 'Nguyễn An', originalName: 'other.pdf' },
      { ...file, id: '3', lmsStudentId: null, studentName: 'Nguyễn  An', originalName: 'note.txt' },
    ];
    expect(filesForStudent(files, 'student-1', 'Nguyen An').map((item) => item.id)).toEqual(['1', '3']);
  });

  it('accepts the class file list response', () => {
    expect(StorageProductsResponseSchema.parse({
      success: true,
      requestId: 'req-storage',
      data: { files: [file] },
    }).data.files).toHaveLength(1);
  });
});

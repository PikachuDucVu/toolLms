import { z } from 'zod';
import { successEnvelope } from './common';

export const StorageProductFileSchema = z.object({
  id: z.string().trim().min(1).max(40),
  lmsStudentId: z.string().trim().min(1).max(200).nullable(),
  studentName: z.string().max(500),
  originalName: z.string().trim().min(1).max(500),
  fileSize: z.number().int().nonnegative(),
  mimeType: z.string().max(255),
  downloadUrl: z.string().url().max(2000),
  createdAt: z.string().max(100),
  kind: z.enum(['file', 'link']).default('file'),
  linkUrl: z.string().max(2000).nullable().default(null),
});
export type StorageProductFile = z.infer<typeof StorageProductFileSchema>;

export const StorageProductsResponseSchema = successEnvelope(z.object({
  files: z.array(StorageProductFileSchema).max(500),
}));
export type StorageProductsResponse = z.infer<typeof StorageProductsResponseSchema>;

export function normalizeStorageName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function filesForStudent<T extends { lmsStudentId: string | null; studentName: string }>(
  files: T[],
  studentId: string,
  displayName: string,
): T[] {
  const name = normalizeStorageName(displayName);
  return files.filter((file) => {
    if (file.lmsStudentId) return file.lmsStudentId === studentId;
    return Boolean(name) && normalizeStorageName(file.studentName) === name;
  });
}

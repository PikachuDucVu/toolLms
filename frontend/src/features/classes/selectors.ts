import type { ClassCommentProgress, ClassDetail, ClassSummary, Slot, StudentAttendance } from '@tool-lms/contracts';
import type { AttendanceFilter, ProgressFilter } from './store';

export type SessionMode = 'regular' | 'checkpoint' | 'demo';
export type StudentProgress = 'pending' | 'draft' | 'submitted';

export function detailForSelectedClass<T extends { id: string }>(detail: T | undefined, classId: string): T | undefined {
  return detail?.id === classId ? detail : undefined;
}

export function orderClassSummaries(classes: ClassSummary[]): ClassSummary[] {
  const running = classes.filter((item) => !item.recentlyEnded);
  const ended = classes.filter((item) => item.recentlyEnded)
    .sort((left, right) => String(right.endDate || '').localeCompare(String(left.endDate || '')));
  return [...running, ...ended];
}

export function normalizeVietnameseText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

export function isPresent(attendance: StudentAttendance): boolean {
  return attendance.status === 'ATTENDED' || attendance.status === 'LATE_ARRIVED';
}

export function attendancePresentation(status: string) {
  if (status === 'ATTENDED') return { label: 'Có mặt', tone: 'success' as const };
  if (status === 'LATE_ARRIVED') return { label: 'Đi muộn', tone: 'warning' as const };
  if (status === 'ABSENT_WITH_NOTICE') return { label: 'Vắng có phép', tone: 'neutral' as const };
  return { label: 'Vắng', tone: 'neutral' as const };
}

export function getSlotDisplayNumber(slot: Slot, arrayIndex: number | string | null = null): number {
  const slotIndex = Number(slot.index);
  const hasArrayIndex = arrayIndex !== '' && arrayIndex != null && Number.isFinite(Number(arrayIndex));
  const positionNumber = hasArrayIndex ? Number(arrayIndex) + 1 : null;
  if (!Number.isFinite(slotIndex)) return positionNumber || 1;
  if (positionNumber && slotIndex === positionNumber) return slotIndex;
  if (positionNumber && slotIndex + 1 === positionNumber) return positionNumber;
  return slotIndex + 1;
}

export function selectedSlot(detail: ClassDetail | undefined, slotIndex: string): Slot | null {
  if (!detail || slotIndex === '') return null;
  const index = Number(slotIndex);
  return Number.isInteger(index) && index >= 0 ? detail.slots[index] || null : null;
}

export function currentSessionNumber(slot: Slot | null, slotIndex: string): number {
  if (!slot) return 0;
  const position = Number(slotIndex) + 1;
  return [5, 9, 14].includes(position) ? position : getSlotDisplayNumber(slot, slotIndex);
}

export function sessionMode(slot: Slot | null, slotIndex: string): SessionMode {
  const number = currentSessionNumber(slot, slotIndex);
  return number === 14 ? 'demo' : number === 5 || number === 9 ? 'checkpoint' : 'regular';
}

export function hasAreaType(attendance: StudentAttendance, type: string, requireContent = false): boolean {
  return attendance.commentByAreas.some((area) => area.type === type && (!requireContent || area.content.trim().length > 0));
}

export function hasModeSubmission(attendance: StudentAttendance, mode: SessionMode): boolean {
  if (mode === 'demo') return hasAreaType(attendance, 'DEMO') || hasAreaType(attendance, 'CONTENT', true);
  if (mode === 'checkpoint') return hasAreaType(attendance, 'CHECKPOINT') || hasAreaType(attendance, 'CONTENT', true);
  return hasAreaType(attendance, 'CONTENT', true);
}

export function studentProgress(attendance: StudentAttendance, mode: SessionMode, draftIds: ReadonlySet<string> = new Set()): StudentProgress {
  if (draftIds.has(attendance.studentId)) return 'draft';
  return hasModeSubmission(attendance, mode) ? 'submitted' : 'pending';
}

export function visibleStudents(
  students: StudentAttendance[],
  filters: { search: string; attendance: AttendanceFilter; progress: ProgressFilter },
  mode: SessionMode,
  draftIds: ReadonlySet<string> = new Set(),
): StudentAttendance[] {
  const search = normalizeVietnameseText(filters.search);
  return students.filter((student) => {
    const present = isPresent(student);
    const attendanceMatches = filters.attendance === 'all'
      || (filters.attendance === 'present' && present)
      || (filters.attendance === 'absent' && !present);
    const progressMatches = filters.progress === 'all' || studentProgress(student, mode, draftIds) === filters.progress;
    return normalizeVietnameseText(student.displayName).includes(search) && attendanceMatches && progressMatches;
  });
}

export function studentStats(students: StudentAttendance[], mode: SessionMode, draftIds: ReadonlySet<string> = new Set()) {
  return {
    total: students.length,
    present: students.filter(isPresent).length,
    draft: students.filter((item) => studentProgress(item, mode, draftIds) === 'draft').length,
    submitted: students.filter((item) => hasModeSubmission(item, mode)).length,
  };
}

export function slotCommentProgress(slot: Slot, slotIndex: number) {
  const present = slot.studentAttendance.filter(isPresent);
  const number = getSlotDisplayNumber(slot, slotIndex);
  const mode: SessionMode = number === 14 ? 'demo' : [5, 9].includes(number) ? 'checkpoint' : 'regular';
  const completed = present.filter((student) => hasModeSubmission(student, mode)).length;
  return { present: present.length, completed, missing: Math.max(present.length - completed, 0), done: present.length > 0 && completed === present.length };
}

export function findLatestCommentableSlotIndex(slots: Slot[], now = Date.now()): number {
  for (let index = slots.length - 1; index >= 0; index--) {
    if (!slots[index].studentAttendance.length) continue;
    const date = slots[index].date ? Date.parse(slots[index].date!) : Number.NaN;
    if (!Number.isFinite(date) || date <= now) return index;
  }
  return -1;
}

export function autoSelectedSlotIndex(slots: Slot[], now = Date.now()): string {
  const latest = findLatestCommentableSlotIndex(slots, now);
  if (latest < 0) return '';
  let pending = -1;
  for (let index = latest; index >= 0; index--) {
    const progress = slotCommentProgress(slots[index], index);
    if (progress.present > 0 && progress.missing > 0) pending = index;
  }
  return String(pending >= 0 ? pending : latest);
}

export function existingContentComment(attendance: StudentAttendance): string {
  return attendance.commentByAreas.find((area) => area.type === 'CONTENT')?.content || '';
}

export function classCommentMeta(progress: ClassCommentProgress): string {
  if (progress.state === 'unknown') return 'Chưa có buổi đã điểm danh';
  if (progress.state === 'pending') return `Buổi ${progress.slotNumber}: còn ${progress.missing}/${progress.present} học sinh chưa nhận xét`;
  return `Buổi ${progress.slotNumber}: ${progress.completed}/${progress.present} học sinh đã nhận xét`;
}

export function classCommentProgress(item: ClassSummary): ClassCommentProgress {
  return item.commentProgress || { state: 'unknown', badgeText: 'Chưa có dữ liệu', slotNumber: null, present: null, completed: null, missing: null };
}

export function classesWithDetailProgress(classes: ClassSummary[], detail?: ClassDetail): ClassSummary[] {
  if (!detail) return classes;
  return classes.map((item) => (
    item.id === detail.id
      ? { ...item, commentProgress: detail.commentProgress, slotCount: detail.slots.length || item.slotCount }
      : item
  ));
}

export function studentInitials(name: string): string {
  return name.split(' ').filter(Boolean).slice(-2).map((part) => part[0]).join('').toUpperCase();
}

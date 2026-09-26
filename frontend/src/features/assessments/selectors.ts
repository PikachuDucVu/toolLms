import type { Assessment, ClassDetail, LearningLevel, Slot, StudentAttendance } from '@tool-lms/contracts';
import type { AssessmentState, AssessmentDraft, SyncedAssessment } from './assessmentStore';

export const DEFAULT_LEARNING_LEVEL: LearningLevel = 'understands_and_asks';

export const LEARNING_LEVELS: Record<LearningLevel, { code: `L${1 | 2 | 3 | 4}`; label: string; shortLabel: string; help: string }> = {
  needs_support: { code: 'L1', label: 'Cần hỗ trợ sát sao', shortLabel: 'Cần hỗ trợ', help: 'Cần thầy hướng dẫn từng bước' },
  needs_prompting: { code: 'L2', label: 'Đang củng cố, cần gợi ý', shortLabel: 'Đang củng cố', help: 'Cần thầy gợi ý ở một số bước' },
  understands_and_asks: { code: 'L3', label: 'Nắm được, chủ động hỏi', shortLabel: 'Nắm được', help: 'Chủ động hỏi lại khi chưa hiểu' },
  independent: { code: 'L4', label: 'Nắm vững, tự vận dụng', shortLabel: 'Nắm vững', help: 'Tự vận dụng và hoàn thành độc lập' },
};

export const PRODUCT_PROGRESS_LEVELS: Record<LearningLevel, { code: `L${1 | 2 | 3 | 4}`; label: string; shortLabel: string; help: string }> = {
  independent: { code: 'L4', label: 'Vượt tiến độ, tự chủ cao', shortLabel: 'Vượt tiến độ', help: 'Xong sớm tính năng chính, tự giác sáng tạo và debug tốt' },
  understands_and_asks: { code: 'L3', label: 'Đúng tiến độ, thao tác tốt', shortLabel: 'Đúng tiến độ', help: 'Bám sát kế hoạch, chủ động hỏi và xử lý khi gặp lỗi' },
  needs_prompting: { code: 'L2', label: 'Hơi chậm tiến độ, cần gợi ý', shortLabel: 'Hơi chậm', help: 'Đã có khung, còn lúng túng khi code logic, cần làm thêm ở nhà' },
  needs_support: { code: 'L1', label: 'Chậm tiến độ, cần kèm sát', shortLabel: 'Cần kèm sát', help: 'Chưa xong chức năng cốt lõi, gặp nhiều lỗi, cần làm bù ở nhà' },
};

export function isProductProgressSession(sessionNumber?: number): boolean {
  return typeof sessionNumber === 'number' && sessionNumber >= 10 && sessionNumber <= 13;
}

export function showsStorageProductColumn(sessionNumber?: number): boolean {
  return typeof sessionNumber === 'number' && sessionNumber >= 10;
}

export function levelCatalog(sessionNumber?: number) {
  return isProductProgressSession(sessionNumber) ? PRODUCT_PROGRESS_LEVELS : LEARNING_LEVELS;
}

export const LEARNING_LEVEL_ORDER = (Object.keys(LEARNING_LEVELS) as LearningLevel[])
  .sort((left, right) => LEARNING_LEVELS[left].code.localeCompare(LEARNING_LEVELS[right].code));

export const NOTE_TEMPLATES = {
  good: 'Tự hoàn thành phần thực hành nhanh và chính xác',
  asks: 'Những phần chưa hiểu con chủ động hỏi lại thầy',
  needwork: 'Cần thầy gợi ý ở một số bước khi thực hành',
  naughty: 'Hay nói chuyện riêng, đôi khi mất tập trung',
} as const;

export function previousRegularSlotIds(slots: Slot[], slotId: string): string[] {
  const current = slots.find((slot) => slot.id === slotId);
  if (!current || !Number.isFinite(Number(current.index))) return [];
  const currentIndex = Number(current.index);
  return slots
    .filter((slot) => slot.id && Number.isFinite(Number(slot.index)) && Number(slot.index) < currentIndex)
    .sort((left, right) => Number(right.index) - Number(left.index))
    .slice(0, 100)
    .map((slot) => slot.id);
}

export function assessmentMap(assessments: Assessment[]): Record<string, Assessment> {
  return Object.fromEntries(assessments.map((assessment) => [assessment.studentId, assessment]));
}

export function assessmentDraft(state: AssessmentState, studentId: string): AssessmentDraft {
  return state.drafts[studentId] || { learningLevel: DEFAULT_LEARNING_LEVEL, note: '' };
}

export function normalizedAssessmentDraft(state: AssessmentState, studentId: string): AssessmentDraft {
  const draft = assessmentDraft(state, studentId);
  return { learningLevel: draft.learningLevel, note: draft.note.trim() };
}

export function isAssessmentDirty(state: AssessmentState, studentId: string): boolean {
  if (!state.touched.has(studentId)) return false;
  const draft = normalizedAssessmentDraft(state, studentId);
  const synced = state.synced[studentId];
  return !synced || !sameAssessment(draft, synced);
}

export function hasDirtyAssessments(state: AssessmentState): boolean {
  return Array.from(state.touched).some((studentId) => isAssessmentDirty(state, studentId));
}

export function sameAssessment(left: AssessmentDraft | SyncedAssessment | undefined, right: AssessmentDraft | SyncedAssessment | undefined): boolean {
  return left?.learningLevel === right?.learningLevel && left?.note === right?.note;
}

export type AssessmentStatus = {
  kind: 'loading' | 'load-error' | 'saving' | 'save-error' | 'dirty' | 'inherited' | 'default' | 'saved';
  text: string;
  error?: string;
};

export function assessmentStatus(state: AssessmentState, studentId: string): AssessmentStatus {
  if (state.load.loading) return { kind: 'loading', text: 'Đang tải đánh giá' };
  if (state.load.error) return { kind: 'load-error', text: 'Không tải được đánh giá', error: state.load.error };
  if (state.autosaveBusy.has(studentId) || state.explicitSaveBusy.has(studentId)) return { kind: 'saving', text: state.explicitSaveBusy.has(studentId) ? 'Đang lưu đánh giá...' : 'Đang lưu mức...' };
  if (state.saveErrors[studentId]) return { kind: 'save-error', text: 'Lưu thất bại', error: state.saveErrors[studentId] };
  const draft = normalizedAssessmentDraft(state, studentId);
  const synced = state.synced[studentId];
  if (synced) {
    if (sameAssessment(draft, synced)) return { kind: 'saved', text: 'Đã lưu' };
    return { kind: 'dirty', text: synced.learningLevel === draft.learningLevel ? 'Chưa lưu ghi chú' : 'Chưa lưu' };
  }
  if (state.touched.has(studentId)) return { kind: 'dirty', text: 'Chưa lưu' };
  const inherited = state.inherited[studentId];
  if (inherited) return { kind: 'inherited', text: `Kế thừa ${LEARNING_LEVELS[inherited.learningLevel].code} từ buổi trước` };
  return { kind: 'default', text: 'Mặc định L3 · chưa lưu buổi này' };
}

export function pastStudentComments(detail: ClassDetail, currentSlot: Slot, studentId: string): Array<{ slotNumber: number; content: string }> {
  return detail.slots
    .filter((slot) => Number(slot.index) < Number(currentSlot.index))
    .sort((left, right) => Number(right.index) - Number(left.index))
    .flatMap((slot) => {
      const attendance = slot.studentAttendance.find((student) => student.studentId === studentId);
      const content = attendance?.commentByAreas.find((area) => area.type === 'CONTENT')?.content.replace(/<[^>]*>/g, '').trim() || '';
      return attendance ? [{ slotNumber: Number(slot.index) + 1, content }] : [];
    });
}

export function presentStudentIds(students: StudentAttendance[]): string[] {
  return students.filter((student) => student.status === 'ATTENDED' || student.status === 'LATE_ARRIVED').map((student) => student.studentId);
}

import type { ClassDetail, Slot, StudentAttendance } from '@tool-lms/contracts';
import type { AssessmentState } from '../assessments/public/store';
import { isProductProgressSession, levelCatalog, normalizedAssessmentDraft } from '../assessments/public/selectors';
import { existingContentComment, isPresent, stripHtml } from '../classes/public/domain';
import type { CommentDraft } from './commentStore';

export function individualZaloText(studentName: string, comment: string, summary: string): string {
  return `📚 NHẬN XÉT BUỔI HỌC\n\n👤 Học sinh: ${studentName}\n📖 Nội dung: ${summary || 'Thực hành lập trình'}\n\n📝 Nhận xét:\n${stripHtml(comment)}\n\n---\nMindX Technology School`;
}

export function classZaloText(input: { slot: Slot; sessionNumber: number; summary: string; drafts: Record<string, CommentDraft> }): { text: string; count: number } {
  const comments = input.slot.studentAttendance.filter(isPresent).flatMap((student) => {
    const comment = input.drafts[student.studentId]?.content || existingContentComment(student);
    return comment.trim() ? [{ studentName: student.displayName, comment: stripHtml(comment) }] : [];
  });
  if (!comments.length) return { text: '', count: 0 };
  const slotDate = input.slot.date ? new Date(input.slot.date) : new Date();
  const date = slotDate.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  let text = `Em xin chào quý phụ huynh, em xin phép gửi phần nhận xét sau buổi học số ${input.sessionNumber} ngày ${date} để các bậc phụ huynh tiện theo dõi và nhắc nhở các bạn học viên ạ:\n\n`;
  text += `1. Nội dung kiến thức buổi học:\n${input.summary || 'Thực hành lập trình'}\n\n2. Nhận xét tình hình lớp học:\n`;
  for (const item of comments) text += `- ${item.studentName}: ${item.comment}\n\n`;
  if (input.sessionNumber >= 10) text += '3. Công việc cần hoàn thiện:\n- Tiếp tục hoàn thiện sản phẩm cuối khóa theo hướng dẫn của thầy.\n\n';
  else text += `3. BTVN:\n- Làm bài tập buổi ${input.sessionNumber} trên Denise.\n\n`;
  text += 'Trên đây là một vài lời nhận xét của em về buổi học vừa rồi. Em xin chúc quý phụ huynh có buổi tối vui vẻ ạ. @All';
  return { text, count: comments.length };
}

export function regularCommentsCsv(students: StudentAttendance[], drafts: Record<string, CommentDraft>, assessments: AssessmentState, sessionNumber?: number): string {
  const headers = ['Họ tên', 'Trạng thái', isProductProgressSession(sessionNumber) ? 'Mức độ tiến độ' : 'Mức độ nắm bài', 'Ghi chú bổ sung', 'Nhận xét hiện tại', 'Nhận xét AI'];
  const rows = students.map((student) => {
    const assessment = normalizedAssessmentDraft(assessments, student.studentId);
    const level = levelCatalog(sessionNumber)[assessment.learningLevel];
    return [
      student.displayName,
      student.status === 'ATTENDED' ? 'Có mặt' : student.status === 'LATE_ARRIVED' ? 'Đi muộn' : 'Vắng',
      `${level.code} - ${level.label}`,
      assessment.note,
      stripHtml(existingContentComment(student)),
      stripHtml(drafts[student.studentId]?.content || ''),
    ];
  });
  return '\ufeff' + [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

function csvCell(value: string): string { return `"${String(value || '').replace(/"/g, '""')}"`; }

export function downloadCsv(detail: Pick<ClassDetail, 'name'>, slot: Slot, csv: string, sessionNumber?: number): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `nhanxet_${detail.name || 'class'}_buoi${sessionNumber || Number(slot.index) + 1}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function copyWithFallback(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* use legacy fallback */ }
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  try { return document.execCommand('copy'); } catch { return false; } finally { textarea.remove(); }
}

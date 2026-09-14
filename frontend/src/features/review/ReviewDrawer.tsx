import type { ClassDetail, Slot } from '@tool-lms/contracts';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { StudentAssessmentDetail } from '../assessments/public/StudentAssessmentDetail';
import { useReviewStore } from './reviewStore';
import type { ReviewRow } from './selectors';

export function ReviewDrawer({ detail, slot, sessionNumber, rows, selectedStudentId, locked, onSelect, onClose }: {
  detail: ClassDetail; slot: Slot; sessionNumber: number; rows: ReviewRow[]; selectedStudentId: string; locked: boolean;
  onSelect: (studentId: string) => void; onClose: () => void;
}) {
  const drawerRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const savedScroll = useReviewStore((state) => state.drawerScrollTop);
  const position = rows.findIndex((row) => row.studentId === selectedStudentId);
  const student = rows[position]?.student || slot.studentAttendance.find((item) => item.studentId === selectedStudentId) || null;
  useLayoutEffect(() => { if (drawerRef.current) drawerRef.current.scrollTop = savedScroll; }, [savedScroll]);
  useLayoutEffect(() => { closeRef.current?.focus({ preventScroll: true }); }, [selectedStudentId]);
  if (!student) return null;
  const previous = position > 0 ? rows[position - 1] : null;
  const next = position >= 0 && position < rows.length - 1 ? rows[position + 1] : null;
  return <aside ref={drawerRef} className="regular-review-drawer" aria-label={`Chi tiết học sinh ${student.displayName}`} onScroll={(event) => useReviewStore.getState().setDrawerScrollTop(event.currentTarget.scrollTop)}>
    <div className="regular-review-drawer-header"><div><strong>{student.displayName}</strong><span>{position >= 0 ? `${position + 1}/${rows.length}` : ''}</span></div><div className="regular-review-drawer-navigation"><button type="button" className="icon-button" disabled={locked || !previous} aria-label="Học sinh trước" onClick={() => previous && onSelect(previous.studentId)}><ArrowLeft size={16} /></button><button type="button" className="icon-button" disabled={locked || !next} aria-label="Học sinh tiếp theo" onClick={() => next && onSelect(next.studentId)}><ArrowRight size={16} /></button><button ref={closeRef} type="button" className="icon-button" aria-label="Đóng chi tiết" onClick={onClose}><X size={16} /></button></div></div>
    <div className="regular-review-drawer-body"><StudentAssessmentDetail detail={detail} slot={slot} sessionNumber={sessionNumber} student={student} selectedStudentId={selectedStudentId} locked={locked} /></div>
  </aside>;
}

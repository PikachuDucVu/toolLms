import type { StudentAttendance } from '@tool-lms/contracts';
import { ClipboardCheck, MessageSquareText, UserRound } from 'lucide-react';
import { attendancePresentation, existingContentComment, hasModeSubmission, isPresent, stripHtml, studentInitials, type SessionMode } from './selectors';

interface Props {
  students: StudentAttendance[];
  total: number;
  selectedId: string | null;
  mode: SessionMode;
  noteDraft: string;
  persistedNote: string;
  onSelect: (id: string) => void;
  onNoteDraft: (value: string) => void;
  onSaveNote: () => void;
  onResetFilters: () => void;
}

export function StudentList(props: Props) {
  if (!props.students.length) return <div className="student-empty"><UserRound size={36} /><strong>{props.total ? 'Không tìm thấy học sinh phù hợp' : 'Chưa có học sinh trong buổi này'}</strong>{props.total > 0 && <button className="btn btn-sm btn-outline" onClick={props.onResetFilters}>Xóa bộ lọc</button>}</div>;
  const selected = props.students.find((item) => item.studentId === props.selectedId) || props.students[0];
  return <div className="student-workspace">
    <div className="student-compact-list" role="list" aria-label="Học sinh phù hợp bộ lọc">
      {props.students.map((student) => {
        const active = student.studentId === selected.studentId;
        const attendance = attendancePresentation(student.status);
        const comment = stripHtml(existingContentComment(student));
        const submitted = hasModeSubmission(student, props.mode);
        return <div className="student-list-entry" role="listitem" key={student.id}>
          <button type="button" className={`student-row ${active ? 'active' : ''}`} aria-pressed={active} onClick={() => props.onSelect(student.studentId)}>
            <span className="student-avatar" aria-hidden="true">{studentInitials(student.displayName)}</span>
            <span className="student-row-copy"><strong>{student.displayName}</strong><span className="student-row-badges"><span className={`badge badge-${attendance.tone}`}>{attendance.label}</span><span className={`badge ${submitted ? 'badge-success' : 'badge-warning'}`}>{submitted ? progressLabel(props.mode) : pendingLabel(props.mode)}</span></span><span className="student-row-preview">{props.persistedNote && active ? props.persistedNote : comment || (isPresent(student) ? 'Chưa có ghi chú hoặc nhận xét' : 'Chưa có nhận xét chuyên cần')}</span></span>
          </button>
          {active && <div className="mobile-student-detail"><StudentDetail {...props} student={student} /></div>}
        </div>;
      })}
    </div>
    <div className="desktop-student-detail"><StudentDetail {...props} student={selected} /></div>
  </div>;
}

function StudentDetail(props: Props & { student: StudentAttendance }) {
  const attendance = attendancePresentation(props.student.status);
  const existing = stripHtml(existingContentComment(props.student));
  const relevantAreas = props.student.commentByAreas.filter((area) => area.type !== 'CONTENT');
  return <section className="student-detail-panel" aria-label={`Chi tiết ${props.student.displayName}`}>
    <header className="student-detail-header"><span className="student-avatar large" aria-hidden="true">{studentInitials(props.student.displayName)}</span><div><h3>{props.student.displayName}</h3><div className="student-row-badges"><span className={`badge badge-${attendance.tone}`}>{attendance.label}</span><span className={`badge ${hasModeSubmission(props.student, props.mode) ? 'badge-success' : 'badge-warning'}`}>{hasModeSubmission(props.student, props.mode) ? progressLabel(props.mode) : pendingLabel(props.mode)}</span></div></div></header>
    {!isPresent(props.student) && <div className="student-notice">Học sinh vắng. Phiên đọc chỉ hiển thị dữ liệu đã có và ghi chú cục bộ.</div>}
    <section className="student-detail-section"><div className="student-detail-title"><MessageSquareText size={17} /><strong>Nhận xét hiện tại trên LMS</strong></div>{existing ? <p className="existing-comment">{existing}</p> : <p className="muted-panel">Chưa có nhận xét được gửi cho buổi này.</p>}</section>
    {props.mode !== 'regular' && <section className="student-detail-section"><div className="student-detail-title"><ClipboardCheck size={17} /><strong>Dữ liệu {props.mode === 'demo' ? 'Demo' : 'Checkpoint'}</strong></div>{relevantAreas.length ? <div className="area-summary-list">{relevantAreas.map((area, index) => <div key={`${area.type}-${area.commentAreaId || index}`}><span>{area.type}</span><strong>{area.grade ?? area.checkpoint?.checkpointScore ?? area.demoQuestions.reduce((sum, item) => sum + (item.score || 0), 0)}</strong></div>)}</div> : <p className="muted-panel">Chưa có điểm hoặc tiêu chí đã gửi.</p>}</section>}
    <section className="student-detail-section"><div className="student-detail-title"><strong>Ghi chú học sinh</strong><span className="read-only-label">Lưu cục bộ</span></div><textarea className="form-input student-note" rows={3} value={props.noteDraft} onChange={(event) => props.onNoteDraft(event.target.value)} placeholder="Ghi chú: học tập trung, cần xem lại bài..." /><div className="student-note-actions"><span>{props.noteDraft === props.persistedNote ? 'Đã đồng bộ với studentNotes' : 'Có thay đổi chưa lưu'}</span><button type="button" className="btn btn-sm btn-outline" disabled={props.noteDraft === props.persistedNote} onClick={props.onSaveNote}>Lưu ghi chú</button></div></section>
    <div className="phase-readonly-note">Các thao tác đánh giá, tạo AI và gửi LMS sẽ được mở ở Phase 6–9.</div>
  </section>;
}

function progressLabel(mode: SessionMode) { return mode === 'regular' ? 'Đã gửi LMS' : mode === 'demo' ? 'Đã chấm Demo' : 'Đã chấm'; }
function pendingLabel(mode: SessionMode) { return mode === 'regular' ? 'Chưa xử lý' : 'Chưa chấm'; }

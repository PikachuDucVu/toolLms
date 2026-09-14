import { NOTE_TEMPLATES, assessmentDraft } from './selectors';
import { useAssessmentStore } from './assessmentStore';

export function TeacherNoteEditor({
  studentId,
  studentName,
  disabled = false,
}: {
  studentId: string;
  studentName: string;
  disabled?: boolean;
}) {
  const draft = assessmentDraft(useAssessmentStore(), studentId);
  const setNote = (note: string) => useAssessmentStore.getState().setNoteDraft(studentId, note);
  const textareaId = `student-note-${studentId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

  return (
    <div className="regular-note-editor">
      <div className="regular-note-label-row" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <label className="regular-note-label" htmlFor={textareaId}>
          <span>Ghi chú bổ sung</span>
        </label>
        <small style={{ color: 'var(--text-muted)', fontSize: 11 }}>AI sẽ ưu tiên dữ kiện này</small>
      </div>
      <textarea
        id={textareaId}
        aria-label={`Ghi chú bổ sung cho ${studentName}`}
        className="form-input"
        rows={2}
        maxLength={4000}
        disabled={disabled}
        value={draft.note}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Ví dụ: chưa hiểu một phần nhưng chủ động hỏi; thực hành chậm ở một số bước..."
      />
      <div className="regular-note-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <div className="regular-note-toolbar-left">
          <details className="quick-template-menu">
            <summary className="btn btn-sm btn-outline">Mẫu ghi chú nhanh</summary>
            <div className="quick-template-popover">
              <button
                type="button"
                className="menu-action"
                onClick={(e) => {
                  setNote(NOTE_TEMPLATES.good);
                  (e.target as HTMLElement).closest('details')?.removeAttribute('open');
                }}
              >
                Tự làm tốt
              </button>
              <button
                type="button"
                className="menu-action"
                onClick={(e) => {
                  setNote(NOTE_TEMPLATES.asks);
                  (e.target as HTMLElement).closest('details')?.removeAttribute('open');
                }}
              >
                Chủ động hỏi
              </button>
              <button
                type="button"
                className="menu-action"
                onClick={(e) => {
                  setNote(NOTE_TEMPLATES.needwork);
                  (e.target as HTMLElement).closest('details')?.removeAttribute('open');
                }}
              >
                Cần gợi ý
              </button>
              <button
                type="button"
                className="menu-action"
                onClick={(e) => {
                  setNote(NOTE_TEMPLATES.naughty);
                  (e.target as HTMLElement).closest('details')?.removeAttribute('open');
                }}
              >
                Hay mất tập trung
              </button>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}

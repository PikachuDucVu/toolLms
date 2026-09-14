import type { ClassDetail, Slot } from '@tool-lms/contracts';
import { FileText, Save } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { useCommentStore } from './commentStore';
import { saveSessionSummary, type RegularCommentScope } from './generationController';

export function SummaryEditor({ detail, slot, sessionNumber, selectedStudentId, locked = false }: { detail: ClassDetail; slot: Slot; sessionNumber: number; selectedStudentId: string | null; locked?: boolean }) {
  const toast = useToast();
  const summary = useCommentStore((state) => state.summaryDraft);
  const synced = useCommentStore((state) => state.summarySynced);
  const busy = useCommentStore((state) => state.summaryBusy);
  const error = useCommentStore((state) => state.summaryError);
  const operationBusy = useCommentStore((state) => state.studentBusy.size > 0 || Boolean(state.batch));
  const dirty = summary.trim() !== synced.trim();
  const scope: RegularCommentScope = { detail, slot, sessionNumber, selectedStudentId };
  const save = async () => {
    try { await saveSessionSummary(scope); toast.show('Đã lưu tổng kết buổi học!', 'success'); }
    catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) toast.show(`Lỗi lưu tổng kết: ${cause instanceof Error ? cause.message : String(cause)}`, 'error'); }
  };
  return <section className="card session-summary-card"><div className="session-summary-heading"><div><FileText size={18} /><strong>Tóm tắt buổi {sessionNumber}</strong></div><span className={`read-only-label ${dirty ? 'is-dirty' : 'is-saved'}`}>{busy ? 'Đang lưu' : dirty ? 'Chưa lưu' : 'Đã đồng bộ'}</span></div>
    <textarea className="form-input" rows={2} value={summary} disabled={locked || operationBusy || busy} onChange={(event) => useCommentStore.getState().setSummaryDraft(event.target.value)} placeholder="Nhập nội dung tóm tắt buổi học..." aria-label="Tóm tắt buổi học" />
    <div className="summary-actions"><p>{error ? `Lỗi: ${error}` : 'Tổng kết sẽ được gửi kèm lần submit học sinh thành công đầu tiên.'}</p><button type="button" className="btn btn-sm btn-outline" disabled={locked || operationBusy || busy || !summary.trim() || !dirty} onClick={() => void save()}><Save size={14} />{busy ? 'Đang lưu...' : 'Lưu tổng kết'}</button></div>
  </section>;
}

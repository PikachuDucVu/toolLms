import type { HomeworkLesson, HomeworkSubmission, HomeworkStudent } from '@tool-lms/contracts';
import { ClipboardList } from 'lucide-react';
import { useEffect, useRef } from 'react';
import emptyHomeworkUrl from '../../assets/empty-homework.jpg';
import { ErrorState } from '../../components/ui/ErrorState';
import { draftFor, lessonById, studentById } from './selectors';
import { SubmissionRow } from './SubmissionRow';
import { useHomeworkStore } from './store';

export function SubmissionTable({ classSelected, submissions, students, lessons, loading, error, busyId, onRetry, onMark, onAiGrade, onDownload, actions }: {
  classSelected: boolean;
  submissions: HomeworkSubmission[];
  students: HomeworkStudent[];
  lessons: HomeworkLesson[];
  loading: boolean;
  error: unknown;
  busyId: string | null;
  onRetry: () => void;
  onMark: (submission: HomeworkSubmission) => void;
  onAiGrade: (submission: HomeworkSubmission) => void;
  onDownload: (submission: HomeworkSubmission, key: string) => void;
  actions: React.ReactNode;
}) {
  const drafts = useHomeworkStore((state) => state.drafts);
  const selectedIds = useHomeworkStore((state) => state.selectedIds);
  const setScore = useHomeworkStore((state) => state.setScoreDraft);
  const setNote = useHomeworkStore((state) => state.setNoteDraft);
  const toggle = useHomeworkStore((state) => state.toggleSelected);
  const selectOnly = useHomeworkStore((state) => state.selectOnly);
  const allSelected = submissions.length > 0 && submissions.every((item) => selectedIds.has(item.id));
  const someSelected = submissions.some((item) => selectedIds.has(item.id));
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected && !allSelected; }, [allSelected, someSelected]);

  return <section className="card homework-table-card"><header className="card-header homework-table-header"><h2><ClipboardList size={20} />Danh sách bài nộp ({submissions.length})</h2>{actions}</header>
    {error && classSelected ? <div className="card-body"><ErrorState error={error} onRetry={onRetry} /></div> : <div className="table-container"><table className="homework-table"><thead><tr><th className="checkbox-cell"><label className="checkbox-touch-target"><input ref={selectAllRef} aria-label="Chọn tất cả bài đang hiển thị" type="checkbox" className="select-checkbox" checked={allSelected} disabled={!submissions.length} onChange={(event) => selectOnly(event.target.checked ? submissions.map((item) => item.id) : [])} /></label></th><th>Học sinh</th><th>Bài học</th><th>Tệp</th><th>Trạng thái</th><th>Điểm</th><th>Nhận xét</th><th>Thao tác</th></tr></thead><tbody>
      {loading ? <LoadingRows /> : !classSelected ? <EmptyRow text="Chọn lớp để xem danh sách bài nộp" /> : submissions.length === 0 ? <EmptyRow text="Không tìm thấy bài nộp" /> : submissions.map((submission) => <SubmissionRow key={submission.id} submission={submission} student={studentById(students, submission.studentUid)} lesson={lessonById(lessons, submission.lessonId)} draft={draftFor(submission, drafts)} selected={selectedIds.has(submission.id)} busy={busyId === submission.id} onSelected={() => toggle(submission.id)} onScore={(value) => setScore(submission.id, value)} onNote={(value) => setNote(submission.id, value)} onMark={() => onMark(submission)} onAiGrade={() => onAiGrade(submission)} onDownload={(key) => onDownload(submission, key)} />)}
    </tbody></table></div>}
  </section>;
}

function LoadingRows() { return <>{Array.from({ length: 5 }, (_, index) => <tr key={index} aria-hidden="true"><td colSpan={8}><span className="skeleton homework-row-skeleton" /></td></tr>)}</>; }
function EmptyRow({ text }: { text: string }) { return <tr><td colSpan={8}><div className="homework-empty"><img src={emptyHomeworkUrl} alt="Minh họa chấm bài tập lập trình" width="320" height="240" /><p>{text}</p></div></td></tr>; }

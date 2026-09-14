import type { HomeworkLesson, HomeworkSubmission, HomeworkStudent } from '@tool-lms/contracts';
import { Check, Download, Sparkles } from 'lucide-react';
import { Badge } from '../../components/ui/Status';
import type { HomeworkDraft } from './store';

export function SubmissionRow({ submission, student, lesson, draft, selected, busy, onSelected, onScore, onNote, onMark, onAiGrade, onDownload }: {
  submission: HomeworkSubmission;
  student?: HomeworkStudent;
  lesson?: HomeworkLesson;
  draft: HomeworkDraft;
  selected: boolean;
  busy: boolean;
  onSelected: () => void;
  onScore: (value: string) => void;
  onNote: (value: string) => void;
  onMark: () => void;
  onAiGrade: () => void;
  onDownload: (key: string) => void;
}) {
  const marked = submission.status === 'MARKED';
  return <tr data-submission-id={submission.id}>
    <td className="checkbox-cell"><label className="checkbox-touch-target"><input aria-label={`Chọn bài của ${student?.displayName || 'Unknown'}`} type="checkbox" className="select-checkbox" checked={selected} onChange={onSelected} /></label></td>
    <td className="student-name">{student?.displayName || 'Unknown'}</td>
    <td className="lesson-name">{lesson?.name || 'Unknown'}</td>
    <td>{submission.content.attachments.length ? submission.content.attachments.map((key) => {
      const filename = key.split('/').pop() || key;
      const shortName = filename.length > 25 ? `${filename.slice(0, 22)}...` : filename;
      return <button type="button" key={key} className="file-link" title={filename} onClick={() => onDownload(key)}><Download size={14} />{shortName}</button>;
    }) : <span className="muted-text">Không có tệp</span>}</td>
    <td><Badge tone={marked ? 'success' : 'warning'}>{marked ? 'Đã chấm' : 'Chờ chấm'}</Badge></td>
    <td><input aria-label={`Điểm của ${student?.displayName || 'học sinh'}`} type="number" className="score-input" min="0" max="100" value={draft.score} onChange={(event) => onScore(event.target.value)} /></td>
    <td className="note-cell"><textarea aria-label={`Nhận xét cho ${student?.displayName || 'học sinh'}`} className="note-input" placeholder="Nhận xét (AI sẽ tự điền)..." value={draft.note} onChange={(event) => onNote(event.target.value)} /></td>
    <td><div className="row-actions"><button className="btn btn-success btn-sm" disabled={busy} onClick={onMark}><Check size={15} />Gửi</button><button aria-label={`AI chấm bài của ${student?.displayName || 'học sinh'}`} className="btn btn-primary btn-sm" disabled={busy} onClick={onAiGrade}>{busy ? <span className="button-spinner" /> : <Sparkles size={15} />}AI</button></div></td>
  </tr>;
}

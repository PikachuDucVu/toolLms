import type { CheckpointSubmitResult, StudentAttendance } from '@tool-lms/contracts';
import { ClipboardCheck, MessageSquareText, Send, Sparkles, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { useToast } from '../../components/ui/Toast';
import { attendancePresentation, existingContentComment, hasModeSubmission, isPresent, stripHtml, studentInitials } from '../classes/public/domain';
import {
  generateCheckpointStudent,
  gradeCheckpointStudent,
  studentHasGradableSubmission,
  submitCheckpointFullSingle,
  submitCheckpointScoreOnlySingle,
  type CheckpointGenerationOptions,
  type CheckpointScope,
} from './checkpointController';
import { CheckpointStatus } from './CheckpointStatus';
import { effectiveCheckpointComment, isCheckpointDraftDirty, useCheckpointStore } from './checkpointStore';

export function CheckpointStudentCard({ scope, student, generationOptions, locked = false }: {
  scope: CheckpointScope; student: StudentAttendance; generationOptions: CheckpointGenerationOptions; locked?: boolean;
}) {
  const toast = useToast();
  const draft = useCheckpointStore((state) => state.drafts[student.studentId]);
  const result = useCheckpointStore((state) => state.results[student.studentId]);
  const gradeResult = useCheckpointStore((state) => state.gradeResults[student.studentId]);
  const rowError = useCheckpointStore((state) => state.rowErrors[student.studentId]);
  const generationBusy = useCheckpointStore((state) => state.generationBusy.has(student.studentId));
  const submitBusy = useCheckpointStore((state) => state.submitBusy.has(student.studentId));
  const gradeBusy = useCheckpointStore((state) => state.gradeBusy.has(student.studentId));
  const operationActive = useCheckpointStore((state) => state.generationBusy.size > 0 || state.submitBusy.size > 0 || state.gradeBusy.size > 0 || Boolean(state.batch));
  useCheckpointStore((state) => state.status);
  useCheckpointStore((state) => state.statusResult);
  useCheckpointStore((state) => state.selectedBranches[student.studentId]);
  const canGrade = studentHasGradableSubmission(student.studentId);
  const summaryDraft = useCheckpointStore((state) => state.summaryDraft);
  const storedExpanded = useCheckpointStore((state) => state.expanded[student.studentId]);
  const dirty = useCheckpointStore((state) => isCheckpointDraftDirty(state, student.studentId));

  const checkpointArea = student.commentByAreas?.find((a) => a.type === 'CHECKPOINT');
  const serverTheory = checkpointArea?.checkpoint?.checkpointScore;
  const serverPractice = checkpointArea?.checkpoint?.practiceScore;
  const existingContent = existingContentComment(student);

  const hasCheckpoint = hasModeSubmission(student, 'checkpoint') || Boolean(result);
  const hasCheckpointComment = Boolean(existingContent.trim() || draft?.generatedComment?.trim() || draft?.currentComment?.trim());
  const hasRateScore = student.commentByAreas?.some((a) => a.type === 'RATE');

  const submitted = hasCheckpoint || Boolean(result);
  const expanded = storedExpanded ?? !submitted;
  const attendance = attendancePresentation(student.status);
  const bodyId = `checkpoint-editor-${safeId(student.studentId)}`;

  useEffect(() => {
    if (storedExpanded === undefined) useCheckpointStore.getState().setExpanded(student.studentId, !submitted);
  }, [storedExpanded, student.studentId, submitted]);

  if (!draft) return <article className="student-card cp-accordion" aria-busy="true"><span className="skeleton" /><span className="skeleton" /></article>;

  // Resolve scores for header readout
  const theoryInput = draft.theoryInput;
  const practiceInput = draft.practiceInput;
  const curTheory = theoryInput.trim() !== '' ? Number(theoryInput) : serverTheory != null ? Number(serverTheory) : result?.theoryScore ?? null;
  const curPractice = practiceInput.trim() !== '' ? Number(practiceInput) : serverPractice != null ? Number(serverPractice) : result?.practiceScore ?? null;
  const hasBoth = curTheory !== null && curPractice !== null && !Number.isNaN(curTheory) && !Number.isNaN(curPractice);
  const averageText = result ? formatScore(result.totalScore) : hasBoth ? ((curTheory + curPractice) / 2).toFixed(1) : '?';
  const rank = result?.rank || (hasBoth ? getCheckpointRank(curTheory, curPractice) : '');

  const grade = async () => {
    try {
      const outcome = await gradeCheckpointStudent(scope, student.studentId, generationOptions);
      const parts = [
        outcome.theoryScore != null ? `LT ${formatScore(outcome.theoryScore)}` : null,
        outcome.practiceScore != null ? `TH ${formatScore(outcome.practiceScore)}` : null,
      ].filter(Boolean);
      toast.show(`Đã AI chấm ${student.displayName}${parts.length ? `: ${parts.join(' • ')}` : ''}`);
    } catch (cause) { fail(cause, 'grading'); }
  };
  const fail = (cause: unknown, phase: 'generation' | 'submission' | 'grading') => {
    if (isAbort(cause)) return;
    const message = errorText(cause);
    useCheckpointStore.getState().setRowError(student.studentId, phase, message);
    toast.show(message, 'error');
  };
  const generate = async () => {
    try {
      await generateCheckpointStudent(scope, student.studentId, generationOptions);
      toast.show(`Đã tạo nhận xét Checkpoint cho ${student.displayName}`);
    } catch (cause) { fail(cause, 'generation'); }
  };
  const scoreOnly = async () => {
    try {
      const outcome = await submitCheckpointScoreOnlySingle(scope, student.studentId);
      toast.show(`Đã submit điểm Checkpoint cho ${student.displayName}: LT ${formatScore(outcome.result.theoryScore)} • TH ${formatScore(outcome.result.practiceScore)} • Rank ${outcome.result.rank}`);
    } catch (cause) { fail(cause, 'submission'); }
  };
  const full = async () => {
    try {
      const outcome = await submitCheckpointFullSingle(scope, student.studentId);
      toast.show(`Đã submit Checkpoint cho ${student.displayName}: ${formatScore(outcome.result.totalScore)}/5 • Rank ${outcome.result.rank}`);
    } catch (cause) { fail(cause, 'submission'); }
  };

  const statusDone = isPresent(student) ? hasCheckpoint : hasCheckpointComment;

  return (
    <article className={`student-card cp-accordion ${expanded ? '' : 'collapsed'} ${hasCheckpoint || hasCheckpointComment ? 'has-comment' : 'no-comment'}`}>
      <div
        className="cp-head"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls={bodyId}
        aria-label={`Chi tiết Checkpoint của ${student.displayName}`}
        onClick={() => useCheckpointStore.getState().setExpanded(student.studentId, !expanded)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            useCheckpointStore.getState().setExpanded(student.studentId, !expanded);
          }
        }}
      >
        <div className="cp-head-left">
          <div className="student-avatar" aria-hidden="true">{studentInitials(student.displayName)}</div>
          <div className="cp-head-info">
            <div className="student-name">{student.displayName}</div>
            <div className="student-meta">
              <span className={`badge badge-${attendance.tone}`}>{attendance.label}</span>
              {hasRateScore && <span className="badge badge-nl" title="Đã có điểm năng lực">NL</span>}
              {dirty && <span className="badge badge-warning">Bản nháp</span>}
              <CheckpointStatus studentId={student.studentId} studentName={student.displayName} isPresent={isPresent(student)} />
            </div>
          </div>
        </div>

        <div className="cp-head-right">
          {isPresent(student) ? (
            hasBoth ? (
              <span className="cp-head-score">
                <b>{averageText}</b>/5
                {rank && <span className={`checkpoint-rank ${rank}`}>{rank}</span>}
              </span>
            ) : (
              <span className="cp-head-score cp-head-score-empty">
                <b>?</b>/5
              </span>
            )
          ) : (
            <span className="badge badge-gray">Vắng — không chấm</span>
          )}

          <span className={`badge ${statusDone ? 'badge-checkpoint-done' : 'badge-checkpoint'}`}>
            {statusDone ? (isPresent(student) ? '✓ Đã chấm' : '✓ Đã nhận xét') : (isPresent(student) ? '○ Chưa' : '○ Chưa nhận xét')}
          </span>

          <svg className="cp-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div id={bodyId} className="cp-body">
          {!isPresent(student) ? (
            <>
              <div className="checkpoint-score-card checkpoint-absence-card">
                <div className="checkpoint-score-title">Không chấm điểm checkpoint</div>
                <p>
                  Học sinh vắng nên hệ thống sẽ không tạo hoặc gửi điểm. Nhận xét AI vẫn được tạo theo cùng mẫu với học sinh đi học, dựa trên ghi chú bạn nhập.
                </p>
              </div>

              {existingContent.trim() && (
                <details className="cp-existing-details">
                  <summary>Xem nhận xét hiện tại</summary>
                  <div className="checkpoint-existing-comment">{stripHtml(existingContent)}</div>
                </details>
              )}

              <div className="cp-comment-stack">
                <div className="checkpoint-comment-section cp-note-compact">
                  <label className="checkpoint-label">
                    <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 14, height: 14 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Ghi chú cho AI
                  </label>
                  <textarea
                    rows={2}
                    placeholder="VD: Tư duy logic tốt; chủ động; cần luyện thêm phần thực hành..."
                    value={draft.teacherDescription}
                    disabled={locked || operationActive}
                    onChange={(e) => useCheckpointStore.getState().setTeacherDescription(student.studentId, e.target.value)}
                  />
                </div>

                {draft.generatedComment.trim() ? (
                  <div className="checkpoint-ai-comment">
                    <div className="comment-box-label">
                      <span className="checkpoint-ai-title">
                        <Sparkles size={14} />
                        Nhận xét gửi phụ huynh (AI)
                      </span>
                      <button
                        type="button"
                        className="btn-icon"
                        title="Xóa nhận xét"
                        onClick={() => useCheckpointStore.getState().setCurrentComment(student.studentId, '')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <textarea
                      className="comment-edit"
                      value={stripHtml(draft.currentComment)}
                      disabled={locked || operationActive}
                      onChange={(e) => useCheckpointStore.getState().setCurrentComment(student.studentId, e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="checkpoint-comment-section">
                    <label className="checkpoint-label">
                      <MessageSquareText size={14} />
                      Nhận xét gửi phụ huynh
                    </label>
                    <textarea
                      className="comment-edit"
                      placeholder="Nhập nhận xét thủ công, hoặc bấm AI nhận xét để tạo tự động..."
                      value={draft.currentComment}
                      disabled={locked || operationActive}
                      onChange={(e) => useCheckpointStore.getState().setCurrentComment(student.studentId, e.target.value)}
                    />
                  </div>
                )}
              </div>

              <div className="student-actions checkpoint-actions">
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={locked || operationActive}
                  onClick={() => void generate()}
                >
                  <Sparkles size={14} />
                  {generationBusy ? 'Đang tạo…' : 'AI nhận xét'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-checkpoint"
                  disabled={locked || operationActive || !draft.currentComment.trim()}
                  onClick={() => void full()}
                >
                  <Send size={14} />
                  {submitBusy ? 'Đang gửi…' : 'Gửi nhận xét'}
                </button>
              </div>
            </>
          ) : (
            <>
              <section className="checkpoint-score-editor" aria-label={`Điểm Checkpoint của ${student.displayName}`}>
                <div className={`checkpoint-score-card ${hasCheckpoint ? 'submitted' : ''}`}>
                  <div className="checkpoint-score-row">
                    <div className="checkpoint-score-input-group">
                      <label>
                        Điểm lý thuyết <span className="checkpoint-auto-chip">0–5</span>
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        className="checkpoint-score-input"
                        min={0}
                        max={5}
                        step={0.5}
                        placeholder="Auto"
                        value={draft.theoryInput}
                        disabled={locked || operationActive}
                        aria-label={`Điểm lý thuyết Checkpoint của ${student.displayName}`}
                        onChange={(event) => useCheckpointStore.getState().setTheoryInput(student.studentId, event.target.value)}
                      />
                    </div>
                    <div className="checkpoint-score-input-group">
                      <label>
                        Điểm thực hành <span className="checkpoint-auto-chip">0–5</span>
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        className="checkpoint-score-input"
                        min={0}
                        max={5}
                        step={0.5}
                        placeholder="Auto"
                        value={draft.practiceInput}
                        disabled={locked || operationActive}
                        aria-label={`Điểm thực hành Checkpoint của ${student.displayName}`}
                        onChange={(event) => useCheckpointStore.getState().setPracticeInput(student.studentId, event.target.value)}
                      />
                    </div>
                    <div className="checkpoint-total-row" aria-live="polite">
                      <span className="checkpoint-total-label">Trung bình</span>
                      <span>
                        <span className="checkpoint-total-score">{averageText}</span> / 5
                        {rank && <span className={`checkpoint-rank ${rank}`}>{rank}</span>}
                      </span>
                    </div>
                  </div>
                  <DerivedScore theory={draft.theoryInput} practice={draft.practiceInput} />
                  <p className="checkpoint-inline-hint">Để trống = tự động random 4–5 điểm. AI chấm dựa trên đề + bài nộp (bỏ qua Scratch).</p>
                </div>
              </section>

              {gradeResult && (
                <section className="checkpoint-grade-result" aria-label={`Kết quả AI chấm của ${student.displayName}`}>
                  <strong>Kết quả AI chấm bài</strong>
                  <div className="checkpoint-grade-result-scores">
                    <span>Lý thuyết <b>{gradeResult.theoryScore == null ? '—' : formatScore(gradeResult.theoryScore)}</b>{gradeResult.mc.total > 0 ? ` (${gradeResult.mc.correct}/${gradeResult.mc.total} đúng)` : ''}</span>
                    <span>Thực hành <b>{gradeResult.practiceScore == null ? '—' : formatScore(gradeResult.practiceScore)}</b></span>
                    {gradeResult.skippedScratch && <span className="badge badge-gray">Bỏ qua Scratch</span>}
                  </div>
                  {gradeResult.teacherNotes.trim() && <p>{gradeResult.teacherNotes}</p>}
                </section>
              )}

              {existingContent.trim() && (
                <details className="cp-existing-details">
                  <summary>Xem nhận xét hiện tại</summary>
                  <div className="checkpoint-existing-comment">{stripHtml(existingContent)}</div>
                </details>
              )}

              <div className="cp-comment-stack">
                <div className="checkpoint-comment-section cp-note-compact">
                  <label className="checkpoint-label">
                    <svg className="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true" style={{ width: 14, height: 14 }}>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    Ghi chú cho AI
                  </label>
                  <textarea
                    rows={2}
                    placeholder="VD: Hoàn thành sản phẩm, tư duy logic tốt; cần luyện thuyết trình…"
                    value={draft.teacherDescription}
                    disabled={locked || operationActive}
                    aria-label={`Mô tả của giáo viên cho AI của ${student.displayName}`}
                    onChange={(event) => useCheckpointStore.getState().setTeacherDescription(student.studentId, event.target.value)}
                  />
                </div>

                {draft.generatedComment.trim() ? (
                  <div className="checkpoint-ai-comment">
                    <div className="comment-box-label">
                      <span className="checkpoint-ai-title">
                        <Sparkles size={14} />
                        Nhận xét gửi phụ huynh (AI)
                      </span>
                      <button
                        type="button"
                        className="btn-icon"
                        title="Xóa nhận xét"
                        onClick={() => useCheckpointStore.getState().setCurrentComment(student.studentId, '')}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <textarea
                      className="comment-edit"
                      value={stripHtml(draft.currentComment)}
                      disabled={locked || operationActive}
                      aria-label={`Nhận xét gửi phụ huynh của ${student.displayName}`}
                      onChange={(event) => useCheckpointStore.getState().setCurrentComment(student.studentId, event.target.value)}
                    />
                  </div>
                ) : (
                  <div className="checkpoint-comment-section">
                    <label className="checkpoint-label">
                      <MessageSquareText size={14} />
                      Nhận xét gửi phụ huynh
                    </label>
                    <textarea
                      className="comment-edit"
                      placeholder="Nhập nhận xét thủ công, hoặc bấm AI nhận xét để tạo tự động…"
                      value={draft.currentComment}
                      disabled={locked || operationActive}
                      aria-label={`Nhận xét gửi phụ huynh của ${student.displayName}`}
                      onChange={(event) => useCheckpointStore.getState().setCurrentComment(student.studentId, event.target.value)}
                    />
                  </div>
                )}
              </div>

              {(rowError?.generation || rowError?.submission || rowError?.grading) && (
                <div className="checkpoint-row-errors" aria-live="assertive">
                  {rowError.grading && <p role="alert"><strong>Lỗi AI chấm:</strong> {rowError.grading}</p>}
                  {rowError.generation && <p role="alert"><strong>Lỗi tạo AI:</strong> {rowError.generation}</p>}
                  {rowError.submission && <p role="alert"><strong>Lỗi submit:</strong> {rowError.submission}</p>}
                </div>
              )}

              <div className="student-actions checkpoint-actions">
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  disabled={locked || operationActive || !canGrade}
                  title={canGrade ? 'Chấm trắc nghiệm và tự luận từ bài nộp kiemtra' : 'Học sinh chưa nộp bài trên kiemtra'}
                  onClick={() => void grade()}
                >
                  <ClipboardCheck size={16} />
                  {gradeBusy ? 'Đang chấm…' : 'AI chấm bài'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={locked || operationActive}
                  onClick={() => void generate()}
                >
                  <Sparkles size={16} />
                  {generationBusy ? 'Đang tạo…' : draft.generatedComment.trim() ? 'Tạo lại AI' : 'AI nhận xét'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  disabled={locked || operationActive}
                  onClick={() => void scoreOnly()}
                >
                  <Send size={16} />
                  {submitBusy ? 'Đang submit…' : 'Submit điểm'}
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-checkpoint"
                  disabled={locked || operationActive || !effectiveCheckpointComment(draft).trim() || !summaryDraft.trim()}
                  onClick={() => void full()}
                >
                  <Send size={16} />
                  {submitBusy ? 'Đang submit…' : hasCheckpoint ? 'Re-submit Checkpoint' : 'Submit Checkpoint'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </article>
  );
}

function getCheckpointRank(theory: number, practice: number): 'A' | 'B' | 'C' | 'D' {
  const total = (theory + practice) / 2;
  if (total >= 4.5) return 'A';
  if (total >= 3.5) return 'B';
  if (total >= 2.5) return 'C';
  return 'D';
}

function formatScore(value: number): string { return String(Math.round(value * 10) / 10); }
function safeId(value: string): string { return value.replace(/[^a-zA-Z0-9_-]/g, '_'); }
function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error || 'Lỗi không xác định'); }
function isAbort(error: unknown): boolean { return error instanceof DOMException && error.name === 'AbortError'; }

function DerivedScore({ theory, practice }: { theory: string; practice: string }) {
  const left = scoreState(theory);
  const right = scoreState(practice);
  const invalid = left === "invalid" || right === "invalid";
  const complete = left === "valid" && right === "valid";
  const automatic = left === "blank" && right === "blank";
  return (
    <div className="checkpoint-derived-score" aria-live="polite" style={{ fontSize: 11, color: "var(--gray-500)", marginTop: 4 }}>
      <span>Trạng thái điểm nhập </span>
      <strong>{invalid ? "Chưa hợp lệ" : complete ? "Đã nhập đủ" : automatic ? "Tự động" : "Đã nhập một phía"}</strong>
      <small style={{ marginLeft: 6 }}>Kết quả trung bình và rank do máy chủ tính sau khi submit.</small>
    </div>
  );
}

function scoreState(raw: string): "blank" | "valid" | "invalid" {
  if (!raw.trim()) return "blank";
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 5 && Math.abs(value * 2 - Math.round(value * 2)) < 0.0001
    ? "valid"
    : "invalid";
}

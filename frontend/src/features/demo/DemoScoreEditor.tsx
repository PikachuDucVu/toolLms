import type { DemoResolvedSchema, StudentAttendance } from '@tool-lms/contracts';
import { Dices, FileText, GraduationCap, Info, Send, Sparkles, Trophy } from 'lucide-react';
import student1Url from '../../assets/design/student_1.png';
import student2Url from '../../assets/design/student_2.png';
import student3Url from '../../assets/design/student_3.png';
import { useToast } from '../../components/ui/Toast';
import { attendancePresentation, hasModeSubmission, isPresent } from '../classes/public/domain';
import { randomizeDemoStudent, submitSingleDemo, type DemoScope } from './demoController';
import { isDemoDraftDirty, useDemoStore } from './demoStore';

const portraits = [student1Url, student2Url, student3Url];

export function DemoScoreEditor({
  scope,
  schema,
  student,
  locked = false,
}: {
  scope: DemoScope;
  schema: DemoResolvedSchema;
  student: StudentAttendance;
  locked?: boolean;
}) {
  const toast = useToast();
  const draft = useDemoStore((state) => state.drafts[student.studentId]);
  const error = useDemoStore((state) => state.errors[student.studentId]);
  const result = useDemoStore((state) => state.results[student.studentId]);
  const preview = useDemoStore((state) => state.previews[student.studentId]);
  const randomMinScore = useDemoStore((state) => state.randomMinScore);
  const randomMaxScore = useDemoStore((state) => state.randomMaxScore);
  const randomBusy = useDemoStore((state) => state.randomBusy.has(student.studentId));
  const submitBusy = useDemoStore((state) => state.submitBusy.has(student.studentId));
  const operationActive = useDemoStore((state) => state.randomBusy.size > 0 || state.submitBusy.size > 0 || Boolean(state.batch));
  const submitted = hasModeSubmission(student, 'demo') || Boolean(result);
  const attendance = attendancePresentation(student.status);
  const dirty = useDemoStore((state) => isDemoDraftDirty(state, student.studentId));
  const disabled = locked || operationActive;
  const portrait = portraits[Math.abs(hashCode(student.studentId)) % portraits.length];

  if (!draft) {
    return (
      <section className="demo-grading-page" aria-busy="true" aria-label={`Chấm Demo cho ${student.displayName}`}>
        <span className="skeleton" />
        <span className="skeleton" />
      </section>
    );
  }

  const runRandom = async () => {
    try {
      await randomizeDemoStudent(scope, student.studentId);
    } catch (cause) {
      if (!isAbort(cause)) toast.show(errorText(cause), 'error');
    }
  };
  const runSubmit = async () => {
    try {
      await submitSingleDemo(scope, student.studentId);
      toast.show(`Đã submit Demo cho ${student.displayName}`);
    } catch (cause) {
      if (!isAbort(cause)) toast.show(errorText(cause), 'error');
    }
  };

  const scoredQuestions = schema.questions.map((question) => {
    const score = draft.scores[question.id];
    const numeric = score === null || score === undefined ? 0 : score;
    const pct = question.maxScore > 0 ? Math.min(100, Math.round((numeric / question.maxScore) * 100)) : 0;
    return { question, score, numeric, pct };
  });
  const totalExisting = scoredQuestions.reduce((sum, item) => sum + item.numeric, 0);
  const totalScore =
    preview && preview.draftVersion === draft.version
      ? preview.demoScore
      : result
        ? result.demoScore
        : totalExisting;
  const completion = schema.maxScore > 0 ? Math.round((totalScore / schema.maxScore) * 100) : 0;
  const hasAnyScore = scoredQuestions.some((item) => item.score !== null && item.score !== undefined);

  return (
    <section className="demo-grading-page" aria-label={`Chấm Demo cho ${student.displayName}`}>
      <header className="demo-grading-identity">
        <img className="demo-student-portrait" src={portrait} alt="" width={72} height={72} />
        <div>
          <span className="demo-identity-kicker">Học sinh</span>
          <h3>{student.displayName}</h3>
          <div className="student-row-badges">
            <span className={`demo-status-chip is-${attendance.tone}`}>
              <span className="demo-status-dot" aria-hidden="true" />
              {attendance.label}
            </span>
            <span className={`demo-status-chip ${submitted ? 'is-done' : 'is-pending'}`}>
              {submitted ? 'Đã chấm' : 'Chưa chấm'}
            </span>
            {dirty && <span className="demo-status-chip is-draft">Bản nháp</span>}
          </div>
        </div>
      </header>

      {!isPresent(student) ? (
        <AbsentDemo schema={schema} student={student} />
      ) : (
        <>
          <div className="demo-grading-layout">
            <section className={`demo-score-card ${submitted ? 'submitted' : ''}`}>
              <div className="demo-score-heading">
                <div className="demo-score-heading-copy">
                  <span className="demo-score-icon" aria-hidden="true">
                    <FileText size={18} />
                  </span>
                  <div>
                    <div className="demo-score-title">
                      <strong>{submitted ? 'Điểm Demo (có thể sửa)' : 'Chấm điểm Demo'}</strong>
                      <span>{schema.label}</span>
                    </div>
                    <p className="demo-schema-source">
                      {schema.source === 'dynamic' ? 'Tiêu chí động từ LMS' : `Schema dự phòng ${schema.fallbackKind}`}
                    </p>
                  </div>
                </div>
                <div className="demo-max-chip">
                  <GraduationCap size={18} aria-hidden="true" />
                  <div>
                    <strong>Tối đa {formatScore(schema.maxScore)} điểm</strong>
                    <small>Dựa trên {schema.questions.length} tiêu chí đánh giá</small>
                  </div>
                </div>
              </div>

              <div className="demo-score-table-wrap">
                <table className="demo-score-table">
                  <colgroup>
                    <col className="demo-col-index" />
                    <col className="demo-col-criterion" />
                    <col className="demo-col-score" />
                    <col className="demo-col-max" />
                    <col className="demo-col-progress" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col">#</th>
                      <th scope="col">Tiêu chí</th>
                      <th scope="col">Điểm</th>
                      <th scope="col">Max</th>
                      <th scope="col">Tiến độ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scoredQuestions.map(({ question, score, pct }, index) => (
                      <tr key={question.id}>
                        <td>
                          <span className="demo-row-index">{index + 1}</span>
                        </td>
                        <td className="demo-score-name">{question.title}</td>
                        <td className="demo-score-value-cell">
                          <label>
                            <span className="sr-only">Điểm {question.title} của {student.displayName}</span>
                            <input
                              className="form-input demo-score-input-compact"
                              type="number"
                              min={0}
                              max={question.maxScore}
                              step={0.25}
                              value={score ?? ''}
                              disabled={disabled}
                              onChange={(event) => {
                                const raw = event.target.value;
                                const value = raw === '' ? null : Number(raw);
                                useDemoStore.getState().setScore(
                                  student.studentId,
                                  question.id,
                                  value === null || !Number.isFinite(value) ? null : value,
                                );
                              }}
                            />
                          </label>
                        </td>
                        <td className="demo-score-max">/ {formatScore(question.maxScore)}</td>
                        <td>
                          <div className="demo-progress-cell">
                            <div className="demo-score-bar" aria-hidden="true">
                              <span className="demo-score-bar-fill" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="demo-progress-pct">{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <aside className="demo-result-card" aria-label={`Kết quả chấm điểm của ${student.displayName}`}>
              <div className="demo-result-title">
                <Trophy size={16} aria-hidden="true" />
                <strong>Kết quả chấm điểm</strong>
              </div>
              <DemoDonut value={hasAnyScore ? totalScore : null} max={schema.maxScore} percent={hasAnyScore ? completion : 0} />
              <div className={`demo-result-banner ${completion >= 75 ? 'is-good' : 'is-pending'}`}>
                <Sparkles size={16} aria-hidden="true" />
                <div>
                  <strong>{hasAnyScore ? `Hoàn thành ${completion}%` : 'Chưa có điểm'}</strong>
                  <span>
                    {hasAnyScore
                      ? completion >= 75
                        ? 'Học sinh đã đạt kết quả tốt!'
                        : 'Cần random hoặc nhập thêm điểm.'
                      : 'Nhấn Random >75% hoặc nhập điểm từng tiêu chí.'}
                  </span>
                </div>
              </div>
              <dl className="demo-result-stats">
                <div>
                  <dt>Số tiêu chí</dt>
                  <dd>{schema.questions.length}</dd>
                </div>
                <div>
                  <dt>Tổng điểm tối đa</dt>
                  <dd>{formatScore(schema.maxScore)}</dd>
                </div>
                <div>
                  <dt>Điểm hiện tại</dt>
                  <dd>{hasAnyScore ? formatScore(totalScore) : '—'}</dd>
                </div>
                <div>
                  <dt>Tỷ lệ đạt</dt>
                  <dd className={completion >= 75 ? 'is-good' : undefined}>{hasAnyScore ? `${completion}%` : '—'}</dd>
                </div>
              </dl>
              {result && (
                <section className="demo-server-result" aria-label={`Kết quả Demo của ${student.displayName}`}>
                  <div>
                    <span>Demo</span>
                    <strong>{formatScore(result.demoScore)}</strong>
                  </div>
                  <div>
                    <span>Năng lực</span>
                    <strong>{formatScore(result.abilityScore)}</strong>
                  </div>
                  <div>
                    <span>Tổng</span>
                    <strong>{formatScore(result.totalScore)}</strong>
                  </div>
                  <div>
                    <span>Rank</span>
                    <strong>{result.rank}</strong>
                  </div>
                </section>
              )}
            </aside>
          </div>

          {error && <p className="comment-error" role="alert">{error}</p>}

          <div className="demo-grading-footer">
            <label className="demo-auto-rate-label">
              <input
                type="checkbox"
                checked={draft.autoRate}
                disabled={disabled}
                onChange={(event) => useDemoStore.getState().setAutoRate(student.studentId, event.target.checked)}
              />
              Tự điền điểm năng lực (5 điểm)
              <span className="demo-info-tip" title="Khi submit, hệ thống tự điền 5 điểm năng lực nếu học sinh chưa có điểm NL.">
                <Info size={14} aria-hidden="true" />
                <span className="sr-only">Khi submit, hệ thống tự điền 5 điểm năng lực nếu học sinh chưa có điểm NL.</span>
              </span>
            </label>
            <div className="demo-student-actions">
              <button type="button" className="btn btn-outline" disabled={disabled} onClick={() => void runRandom()}>
                <Dices size={16} />
                {randomBusy ? 'Đang lấy điểm...' : `Random ${randomMinScore}–${randomMaxScore}`}
              </button>
              <button type="button" className="btn btn-demo" disabled={disabled} onClick={() => void runSubmit()}>
                <Send size={16} />
                {submitBusy ? 'Đang submit...' : submitted ? 'Re-submit Demo' : 'Submit Demo'}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function DemoDonut({ value, max, percent }: { value: number | null; max: number; percent: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, percent)) / 100) * circumference;
  return (
    <div className="demo-donut" role="img" aria-label={value === null ? `Chưa có điểm trên ${formatScore(max)}` : `${formatScore(value)} trên ${formatScore(max)}`}>
      <svg viewBox="0 0 140 140" aria-hidden="true">
        <defs>
          <linearGradient id="demo-donut-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7C3AED" />
            <stop offset="100%" stopColor="#2563EB" />
          </linearGradient>
        </defs>
        <circle className="demo-donut-track" cx="70" cy="70" r={radius} />
        <circle
          className="demo-donut-value"
          cx="70"
          cy="70"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="demo-donut-label">
        <strong>{value === null ? '—' : formatScore(value)} / {formatScore(max)}</strong>
        <span>Tổng điểm</span>
      </div>
    </div>
  );
}

function AbsentDemo({ schema, student }: { schema: DemoResolvedSchema; student: StudentAttendance }) {
  const existing = student.commentByAreas.find((area) => area.type === 'DEMO');
  return (
    <section className="demo-absent-panel">
      <strong>Học sinh vắng — không chấm Demo</strong>
      <p>Chỉ hiển thị điểm hiện có trên LMS. Không có thao tác Random hoặc Submit.</p>
      <div className="area-summary-list">
        {schema.questions.map((question) => (
          <div key={question.id}>
            <span>{question.title} / {formatScore(question.maxScore)}</span>
            <strong>{formatScore(existing?.demoQuestions.find((item) => item.courseProcessDemoDetailId === question.id)?.score ?? null)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatScore(value: number | null): string {
  return value === null ? '—' : String(Math.round(value * 100) / 100);
}
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
function hashCode(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) | 0;
  return hash;
}

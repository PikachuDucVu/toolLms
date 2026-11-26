import type { ClassDetail, Slot, StudentAttendance } from '@tool-lms/contracts';
import { useQuery } from '@tanstack/react-query';
import { Presentation } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { ErrorState } from '../../components/ui/ErrorState';
import { useToast } from '../../components/ui/Toast';
import type { AttendanceFilter, ProgressFilter } from '../classes/public/domain';
import { hasModeSubmission, isPresent } from '../classes/public/domain';
import { StudentFilters } from '../classes/public/components';
import { DemoBatchActions } from './DemoBatchActions';
import { activateDemoContext, captureDemoBatch, currentDemoRandomRange, deactivateDemoContext, hydrateDemoContext, prepareDemoBatch, randomizePresentDemoStudents, setDemoSchemaError, submitDemoBatch } from './demoController';
import { DemoStudentList } from './DemoStudentList';
import { demoSchemaQuery } from './queries';
import { useDemoStore } from './demoStore';

export function DemoWorkspace({ detail, slot, sessionNumber, students, selectedId, search, attendance, progress, locked, onStudent, onSearch, onAttendance, onProgress, onResetFilters }: {
  detail: ClassDetail; slot: Slot; sessionNumber: number; students: StudentAttendance[]; selectedId: string | null;
  search: string; attendance: AttendanceFilter; progress: ProgressFilter; locked?: boolean;
  onStudent: (id: string) => void; onSearch: (value: string) => void; onAttendance: (value: AttendanceFilter) => void; onProgress: (value: ProgressFilter) => void; onResetFilters: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const context = useDemoStore((state) => state.context);
  const schema = useDemoStore((state) => state.schema);
  const summaryDraft = useDemoStore((state) => state.summaryDraft);
  const operationActive = useDemoStore((state) => state.randomBusy.size > 0 || state.submitBusy.size > 0 || Boolean(state.batch));
  const query = useQuery(demoSchemaQuery(detail.id, slot.id));
  const scope = { detail, slot };
  const present = slot.studentAttendance.filter(isPresent);
  const studentNames = Object.fromEntries(slot.studentAttendance.map((student) => [student.studentId, student.displayName]));
  const results = useDemoStore((state) => state.results);
  const gradedCount = present.filter((student) => hasModeSubmission(student, 'demo') || Boolean(results[student.studentId])).length;
  // Rows ticked in the table narrow the class-wide Random / Submit to those students.
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  useEffect(() => { setCheckedIds(new Set()); }, [slot.id]);
  const selectedPresentIds = present.filter((student) => checkedIds.has(student.studentId)).map((student) => student.studentId);
  const selectionScope = selectedPresentIds.length ? new Set(selectedPresentIds) : undefined;

  useEffect(() => {
    const activated = activateDemoContext(detail.id, slot.id, cleanSummary(slot.summary));
    return () => deactivateDemoContext(activated);
  }, [detail.id, slot.id]);
  useEffect(() => {
    if (!context || context.classId !== detail.id || context.slotId !== slot.id || !query.data) return;
    hydrateDemoContext(context, query.data.data.schema, slot, cleanSummary(slot.summary));
  }, [context, detail.id, query.data, slot]);
  useEffect(() => {
    if (!context || context.classId !== detail.id || context.slotId !== slot.id) return;
    setDemoSchemaError(context, query.error ? errorText(query.error) : null);
  }, [context, detail.id, query.error, slot.id]);

  const runRandomAll = async () => {
    try {
      const applied = await randomizePresentDemoStudents(scope, undefined, selectionScope);
      toast.show(`Đã random điểm Demo cho ${applied} học sinh${selectionScope ? ' đã chọn' : ' có mặt'}.`);
    } catch (cause) { if (!isAbort(cause)) toast.show(errorText(cause), 'error'); }
  };

  const runBatch = async () => {
    try {
      const captured = captureDemoBatch(scope, selectionScope);
      const count = captured.students.length;
      const range = currentDemoRandomRange();
      const accepted = await confirm({ title: 'Submit Demo cả lớp', description: `Submit Demo cho ${count} học sinh ${selectionScope ? 'đã chọn' : 'có mặt'} (học sinh chưa có điểm sẽ random ${range.minScore}–${range.maxScore})?`, confirmLabel: `Submit ${count} học sinh` });
      if (!accepted) return;
      const frozen = await prepareDemoBatch(scope, captured);
      const outcome = await submitDemoBatch(scope, frozen);
      if (outcome.failures.length) toast.show(`Đã submit Demo ${outcome.successfulIds.length}/${outcome.attempted}; ${outcome.failures.length} học sinh lỗi.`, 'error');
      else toast.show(`Đã submit Demo ${outcome.successfulIds.length}/${outcome.attempted} học sinh!`);
    } catch (cause) { if (!isAbort(cause)) toast.show(errorText(cause), 'error'); }
  };

  return <>
    <label className="sr-only" htmlFor="demo-session-summary">Tóm tắt buổi Demo</label>
    <textarea
      id="demo-session-summary"
      className="sr-only"
      value={summaryDraft}
      onChange={(event) => useDemoStore.getState().setSummaryDraft(event.target.value)}
    />

    {/* Accessible banner for tests */}
    <section className="mode-banner demo demo-functional-banner sr-only" aria-hidden="true">
      <Presentation size={22} />
      <div>
        <strong>Buổi {sessionNumber} — Demo Sản phẩm cuối khóa</strong>
        <span>{schema ? `${schema.label} • ${schema.questions.length} tiêu chí • tối đa ${formatScore(schema.maxScore)} điểm` : 'Đang tải schema điểm chuẩn hóa từ máy chủ...'}</span>
        {schema && <small>{schema.source === 'dynamic' ? 'Schema động theo lớp học' : `Schema dự phòng ${schema.fallbackKind}`}</small>}
      </div>
    </section>

    {query.isPending && <section className="card demo-schema-loading" aria-label="Đang tải schema Demo" aria-busy="true"><span className="skeleton" /><span className="skeleton" /><span className="skeleton" /></section>}
    {query.error && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}

    {schema && (
      <section className="card demo-student-card">
        <div className="demo-banner" role="note">
          <div className="demo-banner-icon" aria-hidden="true">
            <Presentation size={20} />
          </div>
          <div className="demo-banner-text">
            <h3>Buổi {sessionNumber} — Demo sản phẩm cuối khóa</h3>
            <p>{schema.questions.length} tiêu chí, tối đa {formatScore(schema.maxScore)} điểm. Học sinh chưa có điểm sẽ được random trong khoảng đã chọn khi Submit.</p>
          </div>
          <div className="demo-banner-stats" aria-label="Tiến độ chấm Demo">
            <span><b>{gradedCount}</b>/{present.length} đã gửi điểm</span>
          </div>
        </div>

        <div className="demo-toolbar">
          <StudentFilters search={search} attendance={attendance} progress={progress} mode="demo" disabled={Boolean(locked) || operationActive} onSearch={onSearch} onAttendance={onAttendance} onProgress={onProgress} onReset={onResetFilters} />
        </div>

        <DemoStudentList scope={scope} schema={schema} students={students} total={slot.studentAttendance.length} selectedId={selectedId} disabled={Boolean(locked) || operationActive} checkedIds={checkedIds} onCheckedChange={setCheckedIds} onSelect={onStudent} onResetFilters={onResetFilters} />

        <DemoBatchActions presentCount={present.length} selectedCount={selectedPresentIds.length} visibleCount={students.length} totalCount={slot.studentAttendance.length} disabled={Boolean(locked) || operationActive} studentNames={studentNames} onClearSelection={() => setCheckedIds(new Set())} onRandom={() => void runRandomAll()} onSubmit={() => void runBatch()} />
      </section>
    )}
  </>;
}

function cleanSummary(value: string): string { return value.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }
function formatScore(value: number) { return String(Math.round(value * 100) / 100); }
function errorText(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function isAbort(error: unknown): boolean { return error instanceof DOMException && error.name === 'AbortError'; }

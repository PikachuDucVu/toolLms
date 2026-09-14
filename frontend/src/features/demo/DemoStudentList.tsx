import type { DemoResolvedSchema, StudentAttendance } from '@tool-lms/contracts';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Check, Clock, Eye, Minus, X } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import emptyStudentsUrl from '../../assets/empty-students.jpg';
import { attendancePresentation, hasModeSubmission, isPresent, studentInitials } from '../classes/public/domain';
import { DemoScoreEditor } from './DemoScoreEditor';
import { type DemoScope } from './demoController';
import { isDemoDraftDirty, useDemoStore } from './demoStore';

const AVATAR_TONES = [
  { bg: '#dbeafe', fg: '#1d4ed8' },
  { bg: '#fce7f3', fg: '#be185d' },
  { bg: '#ffedd5', fg: '#c2410c' },
  { bg: '#dcfce7', fg: '#15803d' },
  { bg: '#ede9fe', fg: '#6d28d9' },
  { bg: '#e0f2fe', fg: '#0369a1' },
  { bg: '#fef3c7', fg: '#b45309' },
  { bg: '#e0e7ff', fg: '#4338ca' },
];

export function DemoStudentList({
  scope,
  schema,
  students,
  total,
  selectedId,
  disabled,
  onSelect,
  onResetFilters,
}: {
  scope: DemoScope;
  schema: DemoResolvedSchema;
  students: StudentAttendance[];
  total: number;
  selectedId: string | null;
  disabled: boolean;
  onSelect: (studentId: string) => void;
  onResetFilters: () => void;
}) {
  const [gradingOpen, setGradingOpen] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => new Set());
  const selected = students.find((student) => student.studentId === selectedId) || students[0] || null;
  const visibleIds = useMemo(() => students.map((student) => student.studentId), [students]);
  const allChecked = visibleIds.length > 0 && visibleIds.every((id) => checkedIds.has(id));
  const someChecked = visibleIds.some((id) => checkedIds.has(id));

  const openGrading = (studentId: string) => {
    onSelect(studentId);
    setGradingOpen(true);
  };

  const toggleAll = (checked: boolean) => {
    setCheckedIds(checked ? new Set(visibleIds) : new Set());
  };

  const toggleOne = (studentId: string, checked: boolean) => {
    setCheckedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(studentId);
      else next.delete(studentId);
      return next;
    });
  };

  if (!students.length) {
    return (
      <div className="empty-state">
        <img
          className="empty-state-visual"
          src={emptyStudentsUrl}
          alt="Minh họa danh sách học sinh buổi Demo"
          width={640}
          height={480}
          loading="lazy"
          decoding="async"
        />
        <div className="empty-state-text">
          {total ? 'Không tìm thấy học sinh phù hợp' : 'Chưa có học sinh trong buổi này'}
        </div>
        {total > 0 && (
          <button type="button" className="btn btn-sm btn-outline" disabled={disabled} onClick={onResetFilters}>
            Xóa bộ lọc
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="student-grid demo-mode" id="demoStudentList" role="region" aria-label="Danh sách học sinh chấm Demo">
      <div className="student-compact-list demo-class-table" role="list" aria-label="Học sinh phù hợp bộ lọc">
        <div className="student-table-header demo-table-header" role="row">
          <div className="th-col col-cb">
            <label className="demo-check">
              <input
                type="checkbox"
                checked={allChecked}
                ref={(node) => {
                  if (node) node.indeterminate = someChecked && !allChecked;
                }}
                disabled={disabled}
                aria-label="Chọn tất cả học sinh đang hiển thị"
                onChange={(event) => toggleAll(event.target.checked)}
              />
            </label>
          </div>
          <div className="th-col col-stt">STT</div>
          <div className="th-col col-student">Học sinh</div>
          <div className="th-col col-attendance">Điểm danh</div>
          <div className="th-col col-demo-score">Tổng điểm</div>
          <div className="th-col col-status">Trạng thái</div>
          <div className="th-col col-actions">Thao tác</div>
        </div>

        {students.map((student, index) => (
          <div className="student-list-entry" role="listitem" key={student.id}>
            <DemoCompactRow
              student={student}
              index={index}
              schema={schema}
              active={gradingOpen && student.studentId === selected?.studentId}
              locked={disabled}
              checked={checkedIds.has(student.studentId)}
              onChecked={(value) => toggleOne(student.studentId, value)}
              onSelect={openGrading}
            />
          </div>
        ))}
      </div>

      <DialogPrimitive.Root open={gradingOpen && Boolean(selected)} onOpenChange={setGradingOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="dialog-overlay" />
          <DialogPrimitive.Content className="dialog-content demo-grading-dialog" aria-describedby={undefined}>
            <DialogPrimitive.Title className="sr-only">
              Chấm điểm Demo {selected?.displayName || ''}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="dialog-close" aria-label="Đóng">
              <X size={18} />
            </DialogPrimitive.Close>
            {selected && (
              <div className="desktop-student-detail demo-desktop-detail open">
                <DemoScoreEditor scope={scope} schema={schema} student={selected} locked={disabled} />
              </div>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}

const DemoCompactRow = memo(function DemoCompactRow({
  student,
  index,
  schema,
  active,
  locked,
  checked,
  onChecked,
  onSelect,
}: {
  student: StudentAttendance;
  index: number;
  schema: DemoResolvedSchema;
  active: boolean;
  locked: boolean;
  checked: boolean;
  onChecked: (checked: boolean) => void;
  onSelect: (studentId: string) => void;
}) {
  const draft = useDemoStore((state) => state.drafts[student.studentId]);
  const preview = useDemoStore((state) => state.previews[student.studentId]);
  const result = useDemoStore((state) => state.results[student.studentId]);
  const dirty = useDemoStore((state) => isDemoDraftDirty(state, student.studentId));
  const submitted = hasModeSubmission(student, 'demo') || Boolean(result);
  const attendance = attendancePresentation(student.status);
  const present = isPresent(student);
  const totalExisting = schema.questions.reduce((sum, question) => sum + (draft?.scores[question.id] ?? 0), 0);
  const displayScore =
    preview && draft && preview.draftVersion === draft.version
      ? formatScore(preview.demoScore)
      : result
        ? formatScore(result.demoScore)
        : totalExisting > 0
          ? formatScore(totalExisting)
          : '?';
  const tone = AVATAR_TONES[Math.abs(hashCode(student.studentId)) % AVATAR_TONES.length];

  return (
    <div
      className={`student-list-item demo-list-item ${active ? 'active' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={student.displayName}
      aria-pressed={active}
      onClick={() => onSelect(student.studentId)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(student.studentId);
        }
      }}
    >
      <span className="cell-cb" onClick={(event) => event.stopPropagation()}>
        <label className="demo-check">
          <input
            type="checkbox"
            className="student-cb"
            checked={checked}
            disabled={locked}
            aria-label={`Chọn ${student.displayName}`}
            onChange={(event) => onChecked(event.target.checked)}
          />
        </label>
      </span>
      <span className="cell-stt">{index + 1}</span>
      <span className="student-profile-cell">
        <span className="demo-initials" style={{ background: tone.bg, color: tone.fg }} aria-hidden="true">
          {studentInitials(student.displayName)}
        </span>
        <span className="student-name-block">
          <strong className="student-list-name">{student.displayName}</strong>
          {dirty && <span className="badge badge-warning">Bản nháp</span>}
        </span>
      </span>
      <span className="cell-attendance">
        <span className={`demo-attendance-pill is-${attendance.tone}`}>
          {attendance.tone === 'success' ? <Check size={13} /> : attendance.tone === 'warning' ? <Clock size={13} /> : <Minus size={13} />}
          {attendance.label}
        </span>
      </span>
      <span className="cell-demo-score" onClick={(event) => event.stopPropagation()}>
        {present ? (
          <label className={`demo-score-pill is-editable ${displayScore === '?' ? 'is-empty' : ''}`}>
            <span className="sr-only">Tổng điểm Demo của {student.displayName}</span>
            <input
              type="number"
              min={0}
              max={schema.maxScore}
              step={0.25}
              value={displayScore === '?' ? '' : displayScore}
              placeholder="?"
              disabled={locked}
              aria-label={`Tổng điểm Demo của ${student.displayName}`}
              onChange={(event) => {
                const raw = event.target.value;
                const value = raw === '' ? null : Number(raw);
                useDemoStore.getState().setTotalScore(
                  student.studentId,
                  value === null || !Number.isFinite(value) ? null : value,
                );
              }}
            />
            <span>/ {formatScore(schema.maxScore)}</span>
          </label>
        ) : (
          <span className="demo-score-pill is-empty">—</span>
        )}
      </span>
      <span className="cell-demo-status">
        <span className={`demo-status-pill ${submitted ? 'is-done' : 'is-pending'}`}>
          {submitted ? 'Đã chấm' : 'Chưa chấm'}
        </span>
      </span>
      <span className="cell-demo-actions" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="demo-grade-btn"
          disabled={locked}
          onClick={() => onSelect(student.studentId)}
        >
          <Eye size={14} />
          Chấm điểm
        </button>
      </span>
    </div>
  );
});

function formatScore(value: number | null): string {
  return value === null ? '—' : String(Math.round(value * 100) / 100);
}
function hashCode(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) | 0;
  return hash;
}

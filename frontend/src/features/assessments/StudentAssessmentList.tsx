import type { ClassDetail, Slot, StudentAttendance } from '@tool-lms/contracts';
import { useCallback, useContext, useMemo, useState } from 'react';
import { QueryClient, QueryClientContext, useQuery } from '@tanstack/react-query';
import { studentWorksQuery } from '../studentWorks/public/queries';
import type { StudentWork } from '@tool-lms/contracts';
import emptyStudentsUrl from '../../assets/empty-students.jpg';
import { AssessmentCompactRow } from './AssessmentCompactRow';
import { StudentAssessmentDetail } from './StudentAssessmentDetail';

const fallbackQueryClient = new QueryClient({ defaultOptions: { queries: { enabled: false } } });

export function StudentAssessmentList({
  detail,
  slot,
  sessionNumber = Number(slot.index) + 1,
  students,
  total,
  selectedId,
  locked = false,
  onSelect,
  onResetFilters,
}: {
  detail: ClassDetail;
  slot: Slot;
  sessionNumber?: number;
  students: StudentAttendance[];
  total: number;
  selectedId: string | null;
  locked?: boolean;
  onSelect: (studentId: string) => void;
  onResetFilters: () => void;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const contextClient = useContext(QueryClientContext);
  const queryClient = contextClient || fallbackQueryClient;
  const studentWorksQueryRes = useQuery(
    {
      ...studentWorksQuery(detail.id, slot.id),
      enabled: Boolean(contextClient && detail.id && slot.id),
    },
    queryClient,
  );
  const studentWorksList = studentWorksQueryRes.data?.data.studentWorks || [];
  const worksByStudent = useMemo(() => {
    const map = new Map<string, StudentWork[]>();
    for (const w of studentWorksList) {
      const arr = map.get(w.studentId) || [];
      arr.push(w);
      map.set(w.studentId, arr);
    }
    return map;
  }, [studentWorksList]);

  const selectStudent = useCallback(
    (studentId: string) => {
      onSelect(studentId);
      setDrawerOpen(true);
    },
    [onSelect],
  );

  if (!students.length) {
    return (
      <div className="empty-state">
        <img
          className="empty-state-visual"
          src={emptyStudentsUrl}
          alt="Minh họa danh sách và tiến độ học sinh"
          width={640}
          height={480}
          loading="lazy"
          decoding="async"
        />
        <div className="empty-state-text">
          {total === 0 ? 'Chưa có học sinh trong buổi này' : 'Không tìm thấy học sinh phù hợp'}
        </div>
        {total > 0 && (
          <button
            type="button"
            className="btn btn-sm btn-outline"
            style={{ marginTop: 12 }}
            disabled={locked}
            onClick={onResetFilters}
          >
            Xóa bộ lọc
          </button>
        )}
      </div>
    );
  }

  const selected = students.find((student) => student.studentId === selectedId) || students[0];

  return (
    <div className="student-grid regular-mode" id="studentList" role="region" aria-label="Danh sách học sinh">
      <div className="student-workspace assessment-workspace">
      <div className="student-compact-list" role="list" aria-label="Học sinh phù hợp bộ lọc">
        <div className="student-table-header" role="row">
          <div className="th-col col-cb">
            <input type="checkbox" id="selectAllCb" aria-label="Chọn tất cả" />
          </div>
          <div className="th-col col-stt">STT</div>
          <div className="th-col col-student">Học sinh</div>
          <div className="th-col col-attendance">Điểm danh</div>
          <div className="th-col col-level">Mức độ học tập</div>
          <div className="th-col col-comment">Nhận xét hiện tại</div>
          <div className="th-col col-status">Trạng thái</div>
          <div className="th-col col-actions">Thao tác</div>
        </div>

        {students.map((student, index) => (
          <div className="student-list-entry" role="listitem" key={student.id}>
            <AssessmentCompactRow
              student={student}
              index={index}
              active={drawerOpen && student.studentId === selected.studentId}
              locked={locked}
              onSelect={selectStudent}
              detail={detail}
              slot={slot}
              sessionNumber={sessionNumber}
              works={worksByStudent.get(student.studentId) || []}
            />
            {student.studentId === selected.studentId && drawerOpen && (
              <div className="mobile-student-detail">
                <StudentAssessmentDetail
                  detail={detail}
                  slot={slot}
                  sessionNumber={sessionNumber}
                  student={student}
                  selectedStudentId={selected.studentId}
                  locked={locked}
                  onClose={() => setDrawerOpen(false)}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className={`desktop-student-detail ${drawerOpen ? 'open' : ''}`}>
        <StudentAssessmentDetail
          isOpen={drawerOpen}
          detail={detail}
          slot={slot}
          sessionNumber={sessionNumber}
          student={selected}
          selectedStudentId={selected.studentId}
          locked={locked}
          onClose={() => setDrawerOpen(false)}
        />
      </div>
    </div>
    </div>
  );
}

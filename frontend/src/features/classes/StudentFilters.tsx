import { Search, X } from 'lucide-react';
import type { AttendanceFilter, ProgressFilter } from './store';
import type { SessionMode } from './selectors';

export function StudentFilters({
  search,
  attendance,
  progress,
  mode,
  disabled = false,
  onSearch,
  onAttendance,
  onProgress,
  onReset,
}: {
  search: string;
  attendance: AttendanceFilter;
  progress: ProgressFilter;
  mode: SessionMode;
  disabled?: boolean;
  onSearch: (value: string) => void;
  onAttendance: (value: AttendanceFilter) => void;
  onProgress: (value: ProgressFilter) => void;
  onReset: () => void;
}) {
  const active = Boolean(search || attendance !== 'all' || progress !== 'all');

  return (
    <div className="student-toolbar" aria-label="Công cụ danh sách học sinh">
      <div className="student-search-control">
        <Search size={16} aria-hidden="true" />
        <input
          type="search"
          className="form-input"
          id="searchStudent"
          value={search}
          disabled={disabled}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Tìm học sinh theo tên, mã học sinh..."
          autoComplete="off"
        />
      </div>

      <div className="student-filter-field">
        <select
          className="form-select filter-select"
          id="filterAttendance"
          value={attendance}
          disabled={disabled}
          onChange={(event) => onAttendance(event.target.value as AttendanceFilter)}
          aria-label="Lọc điểm danh"
        >
          <option value="all">Điểm danh: Tất cả</option>
          <option value="present">Có mặt</option>
          <option value="absent">Vắng</option>
        </select>
      </div>

      <div className="student-filter-field">
        <select
          className="form-select filter-select"
          id="filterProgress"
          value={progress}
          disabled={disabled}
          onChange={(event) => onProgress(event.target.value as ProgressFilter)}
          aria-label="Lọc tiến độ"
        >
          <option value="all">Tiến độ: Tất cả</option>
          <option value="pending" id="filterProgressPending">
            {mode === 'regular' ? 'Chưa xử lý' : 'Chưa chấm'}
          </option>
          {mode !== 'demo' && (
            <option value="draft" id="filterProgressDraft">
              Bản nháp AI
            </option>
          )}
          <option value="submitted" id="filterProgressSubmitted">
            {mode === 'regular' ? 'Đã gửi LMS' : mode === 'demo' ? 'Đã chấm Demo' : 'Đã chấm'}
          </option>
        </select>
      </div>

      {active && (
        <button
          type="button"
          className="btn btn-sm btn-outline"
          disabled={disabled}
          onClick={onReset}
          style={{ whiteSpace: 'nowrap' }}
        >
          <X size={14} />
          Xóa bộ lọc
        </button>
      )}
    </div>
  );
}

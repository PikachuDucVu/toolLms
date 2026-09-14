import type { LearningLevel } from '@tool-lms/contracts';
import { ArrowUpDown, BarChart2, ChevronDown, Search, TriangleAlert } from 'lucide-react';
import { useEffect } from 'react';
import { LEARNING_LEVEL_ORDER, levelCatalog } from '../assessments/public/selectors';
import { useReviewStore, type ReviewAlertFilter, type ReviewLevelFilter, type ReviewSort } from './reviewStore';

export function ReviewFilters({ sessionNumber }: { sessionNumber: number }) {
  const searchInput = useReviewStore((state) => state.searchInput);
  const search = useReviewStore((state) => state.search);
  const alertFilter = useReviewStore((state) => state.alertFilter);
  const levelFilter = useReviewStore((state) => state.levelFilter);
  const sort = useReviewStore((state) => state.sort);

  useEffect(() => {
    if (searchInput === search) return;
    const timer = window.setTimeout(() => useReviewStore.getState().commitSearch(searchInput), 200);
    return () => window.clearTimeout(timer);
  }, [search, searchInput]);

  return (
    <div className="regular-review-filters-group">
      <label className="regular-review-filter-item regular-review-search">
        <span className="regular-review-filter-label">
          <Search size={13} />
          <span>Tìm kiếm</span>
        </span>
        <div className="regular-review-input-wrap">
          <Search size={14} className="regular-review-input-icon" />
          <input
            type="search"
            className="form-input regular-review-search-input"
            aria-label="Tìm học sinh hoặc nội dung nhận xét"
            placeholder="Tìm học sinh hoặc nội dung..."
            value={searchInput}
            onChange={(event) => useReviewStore.getState().setSearchInput(event.target.value)}
          />
        </div>
      </label>

      <label className="regular-review-filter-item">
        <span className="regular-review-filter-label">
          <TriangleAlert size={13} />
          <span>Cảnh báo</span>
        </span>
        <div className="regular-review-select-wrap">
          <select
            className="form-select regular-review-filter-select"
            aria-label="Lọc cảnh báo review"
            value={alertFilter}
            onChange={(event) => useReviewStore.getState().setAlertFilter(event.target.value as ReviewAlertFilter)}
          >
            <option value="all">Tất cả</option>
            <option value="attention">Cần chú ý</option>
            <option value="duplicate">Nội dung trùng</option>
            <option value="missing">Chưa có bản nháp</option>
          </select>
          <ChevronDown size={13} className="regular-review-select-chevron" />
        </div>
      </label>

      <label className="regular-review-filter-item">
        <span className="regular-review-filter-label">
          <BarChart2 size={13} />
          <span>Mức</span>
        </span>
        <div className="regular-review-select-wrap">
          <select
            className="form-select regular-review-filter-select"
            aria-label="Lọc mức review"
            value={levelFilter}
            onChange={(event) => useReviewStore.getState().setLevelFilter(event.target.value as ReviewLevelFilter)}
          >
            <option value="all">Tất cả</option>
            {LEARNING_LEVEL_ORDER.map((level: LearningLevel) => (
              <option key={level} value={level}>
                {levelCatalog(sessionNumber)[level].code}
              </option>
            ))}
          </select>
          <ChevronDown size={13} className="regular-review-select-chevron" />
        </div>
      </label>

      <label className="regular-review-filter-item">
        <span className="regular-review-filter-label">
          <ArrowUpDown size={13} />
          <span>Sắp xếp</span>
        </span>
        <div className="regular-review-select-wrap">
          <select
            className="form-select regular-review-filter-select"
            aria-label="Sắp xếp review"
            value={sort}
            onChange={(event) => useReviewStore.getState().setSort(event.target.value as ReviewSort)}
          >
            <option value="name">Tên học sinh</option>
            <option value="warning">Cần chú ý trước</option>
            <option value="level">Mức L1 → L4</option>
            <option value="attendance">Có mặt trước</option>
          </select>
          <ChevronDown size={13} className="regular-review-select-chevron" />
        </div>
      </label>
    </div>
  );
}

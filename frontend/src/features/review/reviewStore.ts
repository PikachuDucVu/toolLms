import type { LearningLevel } from '@tool-lms/contracts';
import { create } from 'zustand';
import { registerWorkflowReset } from '../../lib/operationContext';

export type ReviewAlertFilter = 'all' | 'attention' | 'duplicate' | 'missing';
export type ReviewLevelFilter = 'all' | LearningLevel;
export type ReviewSort = 'name' | 'warning' | 'level' | 'attendance';

interface ReviewState {
  open: boolean;
  selectedStudentId: string | null;
  searchInput: string;
  search: string;
  alertFilter: ReviewAlertFilter;
  levelFilter: ReviewLevelFilter;
  sort: ReviewSort;
  listScrollTop: number;
  drawerScrollTop: number;
  openReview: () => void;
  closeReview: () => void;
  selectStudent: (studentId: string | null) => void;
  setSearchInput: (searchInput: string) => void;
  commitSearch: (search: string) => void;
  setAlertFilter: (alertFilter: ReviewAlertFilter) => void;
  setLevelFilter: (levelFilter: ReviewLevelFilter) => void;
  setSort: (sort: ReviewSort) => void;
  setListScrollTop: (listScrollTop: number) => void;
  setDrawerScrollTop: (drawerScrollTop: number) => void;
  resetFilters: () => void;
  reset: () => void;
}

const freshViewState = () => ({
  open: false,
  selectedStudentId: null as string | null,
  searchInput: '',
  search: '',
  alertFilter: 'all' as ReviewAlertFilter,
  levelFilter: 'all' as ReviewLevelFilter,
  sort: 'name' as ReviewSort,
  listScrollTop: 0,
  drawerScrollTop: 0,
});

export const useReviewStore = create<ReviewState>((set) => ({
  ...freshViewState(),
  openReview: () => set({ open: true }),
  closeReview: () => set({ open: false }),
  selectStudent: (selectedStudentId) => set({ selectedStudentId, drawerScrollTop: selectedStudentId ? 0 : 0 }),
  setSearchInput: (searchInput) => set({ searchInput }),
  commitSearch: (search) => set({ search, listScrollTop: 0 }),
  setAlertFilter: (alertFilter) => set({ alertFilter, listScrollTop: 0 }),
  setLevelFilter: (levelFilter) => set({ levelFilter, listScrollTop: 0 }),
  setSort: (sort) => set({ sort, listScrollTop: 0 }),
  setListScrollTop: (listScrollTop) => set({ listScrollTop }),
  setDrawerScrollTop: (drawerScrollTop) => set({ drawerScrollTop }),
  resetFilters: () => set({ searchInput: '', search: '', alertFilter: 'all', levelFilter: 'all', sort: 'name', listScrollTop: 0 }),
  reset: () => set(freshViewState()),
}));

registerWorkflowReset(() => useReviewStore.getState().reset());

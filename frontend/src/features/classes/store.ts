import { create } from 'zustand';
import { registerWorkflowReset } from '../../lib/operationContext';

export type AttendanceFilter = 'all' | 'present' | 'absent';
export type ProgressFilter = 'all' | 'pending' | 'draft' | 'submitted';

interface ClassWorkspaceState {
  classId: string;
  slotIndex: string;
  activeSlotIndex: string;
  studentId: string | null;
  search: string;
  attendance: AttendanceFilter;
  progress: ProgressFilter;
  setClassId: (classId: string) => void;
  setSlotIndex: (slotIndex: string) => void;
  setStudentId: (studentId: string | null) => void;
  setSearch: (search: string) => void;
  setAttendance: (attendance: AttendanceFilter) => void;
  setProgress: (progress: ProgressFilter) => void;
  clearSlotContext: () => void;
  applyRefreshedSlot: (slotIndex: string) => void;
  resetFilters: () => void;
  reset: () => void;
}

const initialState = {
  classId: '',
  slotIndex: '',
  activeSlotIndex: '',
  studentId: null as string | null,
  search: '',
  attendance: 'all' as AttendanceFilter,
  progress: 'all' as ProgressFilter,
};

export const useClassWorkspaceStore = create<ClassWorkspaceState>((set) => ({
  ...initialState,
  setClassId: (classId) => set((state) => classId === state.classId ? state : {
    classId,
    slotIndex: '',
    activeSlotIndex: '',
    studentId: null,
    search: '',
    attendance: 'all',
    progress: 'all',
  }),
  setSlotIndex: (slotIndex) => set((state) => {
    if (slotIndex === state.slotIndex) return state;
    if (slotIndex === '') return { slotIndex };
    if (slotIndex === state.activeSlotIndex) return { slotIndex };
    return {
      slotIndex,
      activeSlotIndex: slotIndex,
      studentId: null,
      search: '',
      attendance: 'all',
      progress: 'all',
    };
  }),
  setStudentId: (studentId) => set({ studentId }),
  setSearch: (search) => set({ search }),
  setAttendance: (attendance) => set({ attendance }),
  setProgress: (progress) => set({ progress }),
  clearSlotContext: () => set({ slotIndex: '', activeSlotIndex: '', studentId: null, search: '', attendance: 'all', progress: 'all' }),
  applyRefreshedSlot: (slotIndex) => set({ slotIndex, activeSlotIndex: slotIndex, studentId: null, search: '', attendance: 'all', progress: 'all' }),
  resetFilters: () => set({ search: '', attendance: 'all', progress: 'all' }),
  reset: () => set(initialState),
}));

registerWorkflowReset(() => useClassWorkspaceStore.getState().reset());

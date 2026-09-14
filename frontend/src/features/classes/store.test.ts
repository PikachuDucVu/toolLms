import { beforeEach, describe, expect, it } from 'vitest';
import { useClassWorkspaceStore } from './store';

describe('class workspace context store', () => {
  beforeEach(() => useClassWorkspaceStore.getState().reset());

  it('resets slot/student/filter state when class changes without owning a summary draft', () => {
    const store = useClassWorkspaceStore.getState();
    store.setClassId('class-1');
    store.setSlotIndex('2');
    store.setStudentId('student-1');
    store.setSearch('An');
    store.setAttendance('present');
    store.setProgress('submitted');
    store.setClassId('class-2');
    expect(useClassWorkspaceStore.getState()).toMatchObject({ classId: 'class-2', slotIndex: '', activeSlotIndex: '', studentId: null, search: '', attendance: 'all', progress: 'all' });
    expect(useClassWorkspaceStore.getState()).not.toHaveProperty('summaryDraft');
  });

  it('resets context-specific student/filter state when slot changes but not for same slot', () => {
    const store = useClassWorkspaceStore.getState();
    store.setClassId('class-1');
    store.setSlotIndex('2');
    store.setStudentId('student-1');
    store.setSearch('An');
    store.setSlotIndex('2');
    expect(useClassWorkspaceStore.getState()).toMatchObject({ studentId: 'student-1', search: 'An' });
    useClassWorkspaceStore.getState().setSlotIndex('3');
    expect(useClassWorkspaceStore.getState()).toMatchObject({ slotIndex: '3', activeSlotIndex: '3', studentId: null, search: '', attendance: 'all', progress: 'all' });
  });

  it('auto-selects and switches back to slot zero while retaining only the empty placeholder', () => {
    const store = useClassWorkspaceStore.getState();
    store.setClassId('class-1');
    store.setSlotIndex('2');
    store.setStudentId('student-1');
    useClassWorkspaceStore.getState().setSlotIndex('0');
    expect(useClassWorkspaceStore.getState()).toMatchObject({ slotIndex: '0', activeSlotIndex: '0', studentId: null, search: '' });
    useClassWorkspaceStore.getState().setSlotIndex('2');
    expect(useClassWorkspaceStore.getState()).toMatchObject({ slotIndex: '2', activeSlotIndex: '2', studentId: null });
    useClassWorkspaceStore.getState().setSlotIndex('0');
    expect(useClassWorkspaceStore.getState()).toMatchObject({ slotIndex: '0', activeSlotIndex: '0' });
    useClassWorkspaceStore.getState().setSlotIndex('');
    expect(useClassWorkspaceStore.getState()).toMatchObject({ slotIndex: '', activeSlotIndex: '0' });
  });

  it('keeps filter reset narrow', () => {
    const store = useClassWorkspaceStore.getState();
    store.setClassId('class-1');
    store.setSlotIndex('2');
    store.setStudentId('student-1');
    store.setSearch('An'); store.setAttendance('absent'); store.setProgress('pending');
    useClassWorkspaceStore.getState().resetFilters();
    expect(useClassWorkspaceStore.getState()).toMatchObject({ classId: 'class-1', slotIndex: '2', studentId: 'student-1', search: '', attendance: 'all', progress: 'all' });
  });
});

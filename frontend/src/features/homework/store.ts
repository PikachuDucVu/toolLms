import type { GradingJobCreateRequest, HomeworkSubmission } from '@tool-lms/contracts';
import { create } from 'zustand';
import { registerWorkflowReset } from '../../lib/operationContext';
import { resetHomeworkContext, transitionHomeworkContext } from './homeworkContext';

export type HomeworkStatusFilter = '' | 'SUBMITTED' | 'MARKED';
export type HomeworkDraft = { score: string; note: string };
export type FrozenGradingScope = Omit<GradingJobCreateRequest, 'apiKey'>;

interface HomeworkState {
  classId: string;
  lessonId: string;
  status: HomeworkStatusFilter;
  drafts: Record<string, HomeworkDraft>;
  dirtyDraftIds: Set<string>;
  selectedIds: Set<string>;
  batchScore: string;
  activeJobId: string | null;
  frozenRetryScope: FrozenGradingScope | null;
  setClassId: (classId: string) => void;
  setLessonId: (lessonId: string) => void;
  setStatus: (status: HomeworkStatusFilter) => void;
  setStatusAfterMark: (status: HomeworkStatusFilter) => void;
  hydrateDrafts: (submissions: HomeworkSubmission[]) => void;
  reconcilePersistedDrafts: (submissions: Array<{ id: string; score: number; note: string }>) => void;
  setScoreDraft: (id: string, score: string) => void;
  setNoteDraft: (id: string, note: string) => void;
  toggleSelected: (id: string) => void;
  selectOnly: (ids: string[]) => void;
  clearSelection: () => void;
  setBatchScore: (score: string) => void;
  startJob: (jobId: string, scope: FrozenGradingScope) => void;
  retainJobScope: (scope: FrozenGradingScope) => void;
  clearJob: () => void;
  reset: () => void;
}

const initialState = {
  classId: '',
  lessonId: '',
  status: 'SUBMITTED' as HomeworkStatusFilter,
  drafts: {} as Record<string, HomeworkDraft>,
  dirtyDraftIds: new Set<string>(),
  selectedIds: new Set<string>(),
  batchScore: '100',
  activeJobId: null as string | null,
  frozenRetryScope: null as FrozenGradingScope | null,
};

export const useHomeworkStore = create<HomeworkState>((set) => ({
  ...initialState,
  setClassId: (classId) => set((state) => {
    if (classId === state.classId) return state;
    transitionHomeworkContext(classId);
    return {
      classId,
      lessonId: '',
      selectedIds: new Set<string>(),
      drafts: {},
      dirtyDraftIds: new Set<string>(),
      activeJobId: null,
      frozenRetryScope: null,
    };
  }),
  setLessonId: (lessonId) => set({ lessonId, selectedIds: new Set<string>() }),
  setStatus: (status) => set({ status, selectedIds: new Set<string>() }),
  setStatusAfterMark: (status) => set({ status }),
  hydrateDrafts: (submissions) => set((state) => {
    const drafts = { ...state.drafts };
    let changed = false;
    for (const submission of submissions) {
      if (state.dirtyDraftIds.has(submission.id)) continue;
      const hydrated = defaultDraft(submission);
      if (sameDraft(drafts[submission.id], hydrated)) continue;
      drafts[submission.id] = hydrated;
      changed = true;
    }
    return changed ? { drafts } : state;
  }),
  reconcilePersistedDrafts: (submissions) => set((state) => {
    if (!submissions.length) return state;
    const drafts = { ...state.drafts };
    const dirtyDraftIds = new Set(state.dirtyDraftIds);
    const selectedIds = new Set(state.selectedIds);
    for (const submission of submissions) {
      drafts[submission.id] = { score: String(submission.score), note: submission.note };
      dirtyDraftIds.delete(submission.id);
      selectedIds.delete(submission.id);
    }
    return { drafts, dirtyDraftIds, selectedIds };
  }),
  setScoreDraft: (id, score) => set((state) => ({
    drafts: { ...state.drafts, [id]: { score, note: state.drafts[id]?.note || '' } },
    dirtyDraftIds: new Set(state.dirtyDraftIds).add(id),
  })),
  setNoteDraft: (id, note) => set((state) => ({
    drafts: { ...state.drafts, [id]: { score: state.drafts[id]?.score || '100', note } },
    dirtyDraftIds: new Set(state.dirtyDraftIds).add(id),
  })),
  toggleSelected: (id) => set((state) => {
    const selectedIds = new Set(state.selectedIds);
    if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
    return { selectedIds };
  }),
  selectOnly: (ids) => set({ selectedIds: new Set(ids) }),
  clearSelection: () => set({ selectedIds: new Set<string>() }),
  setBatchScore: (batchScore) => set({ batchScore }),
  startJob: (activeJobId, frozenRetryScope) => set({ activeJobId, frozenRetryScope, selectedIds: new Set<string>() }),
  retainJobScope: (frozenRetryScope) => set({ frozenRetryScope }),
  clearJob: () => set({ activeJobId: null, frozenRetryScope: null }),
  reset: () => {
    resetHomeworkContext();
    set({ ...initialState, selectedIds: new Set<string>(), drafts: {}, dirtyDraftIds: new Set<string>() });
  },
}));

function defaultDraft(submission: HomeworkSubmission): HomeworkDraft {
  return {
    score: String(submission.status === 'MARKED' && submission.score != null ? submission.score : 100),
    note: submission.note || '',
  };
}

function sameDraft(left: HomeworkDraft | undefined, right: HomeworkDraft): boolean {
  return left?.score === right.score && left.note === right.note;
}

registerWorkflowReset(() => useHomeworkStore.getState().reset());

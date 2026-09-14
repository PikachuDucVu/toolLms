import type { Assessment, LearningLevel } from '@tool-lms/contracts';
import { create } from 'zustand';
import { registerWorkflowReset } from '../../lib/operationContext';
import { DEFAULT_LEARNING_LEVEL, sameAssessment } from './selectors';

export type AssessmentDraft = { learningLevel: LearningLevel; note: string };
export type SyncedAssessment = AssessmentDraft;
export type InheritedAssessment = { learningLevel: LearningLevel; sourceSlotId: string };
export type AssessmentContext = { classId: string; slotId: string; epoch: number };
export type LoadState = { loading: boolean; error: string | null };

export interface AssessmentState {
  context: AssessmentContext | null;
  drafts: Record<string, AssessmentDraft>;
  synced: Record<string, SyncedAssessment>;
  inherited: Record<string, InheritedAssessment>;
  touched: Set<string>;
  autosaveBusy: Set<string>;
  explicitSaveBusy: Set<string>;
  saveErrors: Record<string, string>;
  load: LoadState;
  bulkBusy: boolean;
  classRefreshBusy: boolean;
  operationError: string | null;
  activate: (context: AssessmentContext) => void;
  setLoadPending: (context: AssessmentContext) => void;
  hydrate: (context: AssessmentContext, assessments: Assessment[]) => void;
  setLoadError: (context: AssessmentContext, error: string) => void;
  setLearningLevelDraft: (studentId: string, learningLevel: LearningLevel) => void;
  setNoteDraft: (studentId: string, note: string) => void;
  applySynced: (studentId: string, assessment: AssessmentDraft, submittedDraft?: AssessmentDraft) => void;
  setAutosaveBusy: (studentId: string, busy: boolean) => void;
  setExplicitSaveBusy: (studentId: string, busy: boolean) => void;
  setSaveError: (studentId: string, error: string | null) => void;
  setBulkBusy: (busy: boolean) => void;
  setClassRefreshBusy: (busy: boolean) => void;
  setOperationError: (error: string | null) => void;
  restoreStudents: (snapshots: Record<string, StudentStateSnapshot>) => void;
  discardUnsaved: () => void;
  reset: () => void;
}

export type StudentStateSnapshot = {
  draft?: AssessmentDraft;
  touched: boolean;
  saveError?: string;
};

const freshState = () => ({
  context: null as AssessmentContext | null,
  drafts: {} as Record<string, AssessmentDraft>,
  synced: {} as Record<string, SyncedAssessment>,
  inherited: {} as Record<string, InheritedAssessment>,
  touched: new Set<string>(),
  autosaveBusy: new Set<string>(),
  explicitSaveBusy: new Set<string>(),
  saveErrors: {} as Record<string, string>,
  load: { loading: false, error: null } as LoadState,
  bulkBusy: false,
  classRefreshBusy: false,
  operationError: null as string | null,
});

export const useAssessmentStore = create<AssessmentState>((set) => ({
  ...freshState(),
  activate: (context) => set({ ...freshState(), context, load: { loading: true, error: null } }),
  setLoadPending: (context) => set((state) => isContext(state.context, context) ? { load: { loading: true, error: null } } : state),
  hydrate: (context, assessments) => set((state) => {
    if (!isContext(state.context, context)) return state;
    const drafts = { ...state.drafts };
    const synced = { ...state.synced };
    const inherited = { ...state.inherited };
    for (const assessment of assessments) {
      const normalized: AssessmentDraft = {
        learningLevel: assessment.learningLevel,
        note: assessment.inherited ? '' : assessment.note.trim(),
      };
      if (assessment.inherited) {
        inherited[assessment.studentId] = { learningLevel: normalized.learningLevel, sourceSlotId: assessment.sourceSlotId };
      } else {
        synced[assessment.studentId] = normalized;
        delete inherited[assessment.studentId];
      }
      if (!Object.prototype.hasOwnProperty.call(drafts, assessment.studentId)) drafts[assessment.studentId] = normalized;
    }
    return { drafts, synced, inherited, load: { loading: false, error: null } };
  }),
  setLoadError: (context, error) => set((state) => isContext(state.context, context) ? { load: { loading: false, error } } : state),
  setLearningLevelDraft: (studentId, learningLevel) => set((state) => ({
    drafts: { ...state.drafts, [studentId]: { learningLevel, note: state.drafts[studentId]?.note || '' } },
    touched: new Set(state.touched).add(studentId),
  })),
  setNoteDraft: (studentId, note) => set((state) => ({
    drafts: { ...state.drafts, [studentId]: { learningLevel: state.drafts[studentId]?.learningLevel || DEFAULT_LEARNING_LEVEL, note } },
    touched: new Set(state.touched).add(studentId),
  })),
  applySynced: (studentId, assessment, submittedDraft) => set((state) => {
    const synced = { ...state.synced, [studentId]: assessment };
    const inherited = { ...state.inherited };
    const saveErrors = { ...state.saveErrors };
    const touched = new Set(state.touched);
    const drafts = { ...state.drafts };
    delete inherited[studentId];
    delete saveErrors[studentId];
    if (submittedDraft && sameAssessment(normalizedDraft(state, studentId), submittedDraft)) {
      drafts[studentId] = { ...submittedDraft };
    }
    if (sameAssessment(normalizedDraft({ ...state, drafts } as AssessmentState, studentId), assessment)) touched.delete(studentId);
    else touched.add(studentId);
    return { synced, inherited, saveErrors, touched, drafts };
  }),
  setAutosaveBusy: (studentId, busy) => set((state) => ({ autosaveBusy: updateSet(state.autosaveBusy, studentId, busy) })),
  setExplicitSaveBusy: (studentId, busy) => set((state) => ({ explicitSaveBusy: updateSet(state.explicitSaveBusy, studentId, busy) })),
  setSaveError: (studentId, error) => set((state) => {
    const saveErrors = { ...state.saveErrors };
    if (error) saveErrors[studentId] = error; else delete saveErrors[studentId];
    return { saveErrors };
  }),
  setBulkBusy: (bulkBusy) => set({ bulkBusy }),
  setClassRefreshBusy: (classRefreshBusy) => set({ classRefreshBusy }),
  setOperationError: (operationError) => set({ operationError }),
  restoreStudents: (snapshots) => set((state) => {
    const drafts = { ...state.drafts };
    const touched = new Set(state.touched);
    const saveErrors = { ...state.saveErrors };
    for (const [studentId, snapshot] of Object.entries(snapshots)) {
      if (snapshot.draft) drafts[studentId] = { ...snapshot.draft }; else delete drafts[studentId];
      if (snapshot.touched) touched.add(studentId); else touched.delete(studentId);
      if (snapshot.saveError) saveErrors[studentId] = snapshot.saveError; else delete saveErrors[studentId];
    }
    return { drafts, touched, saveErrors };
  }),
  discardUnsaved: () => set((state) => {
    const drafts: Record<string, AssessmentDraft> = {};
    const studentIds = new Set([...Object.keys(state.drafts), ...Object.keys(state.synced), ...Object.keys(state.inherited)]);
    for (const studentId of studentIds) {
      const synced = state.synced[studentId];
      const inherited = state.inherited[studentId];
      drafts[studentId] = synced ? { ...synced } : inherited ? { learningLevel: inherited.learningLevel, note: '' } : { learningLevel: DEFAULT_LEARNING_LEVEL, note: '' };
    }
    return { drafts, touched: new Set<string>(), saveErrors: {}, operationError: null };
  }),
  reset: () => set(freshState()),
}));

export function captureStudentState(state: AssessmentState, studentId: string): StudentStateSnapshot {
  return {
    draft: state.drafts[studentId] ? { ...state.drafts[studentId] } : undefined,
    touched: state.touched.has(studentId),
    saveError: state.saveErrors[studentId],
  };
}

function normalizedDraft(state: AssessmentState, studentId: string): AssessmentDraft {
  const draft = state.drafts[studentId] || { learningLevel: DEFAULT_LEARNING_LEVEL, note: '' };
  return { learningLevel: draft.learningLevel, note: draft.note.trim() };
}

function updateSet(source: Set<string>, value: string, add: boolean): Set<string> {
  const next = new Set(source);
  if (add) next.add(value); else next.delete(value);
  return next;
}

export function isContext(left: AssessmentContext | null, right: AssessmentContext): boolean {
  return left?.classId === right.classId && left.slotId === right.slotId && left.epoch === right.epoch;
}

registerWorkflowReset(() => useAssessmentStore.getState().reset());

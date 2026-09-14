import type {
  CheckpointBranch,
  CheckpointNumber,
  CheckpointStatusResult,
  CheckpointSubmitResult,
  Slot,
} from '@tool-lms/contracts';
import { create } from 'zustand';
import { registerWorkflowReset } from '../../lib/operationContext';

export type CheckpointContext = { classId: string; slotId: string; checkpoint: CheckpointNumber; epoch: number };
export type CheckpointCommentProvenance = 'none' | 'manual' | 'generated';
export type CheckpointStudentDraft = {
  theoryInput: string;
  practiceInput: string;
  teacherDescription: string;
  generatedComment: string;
  manualComment: string;
  currentComment: string;
  provenance: CheckpointCommentProvenance;
  theoryVersion: number;
  practiceVersion: number;
  descriptionVersion: number;
  commentVersion: number;
};
export type CheckpointStudentBaseline = Omit<CheckpointStudentDraft, 'theoryVersion' | 'practiceVersion' | 'descriptionVersion' | 'commentVersion'>;
export type CheckpointStatusErrorKind = 'timeout' | 'malformed' | 'upstream';
export type CheckpointStatusError = { kind: CheckpointStatusErrorKind; message: string };
export type CheckpointRowError = { generation?: string; submission?: string };
export type CheckpointBatchPhase = 'generating' | 'submitting' | 'reloading';
export type CheckpointBatchState = {
  kind: 'generate' | 'score_only' | 'full';
  phase: CheckpointBatchPhase;
  scopeIds: string[];
  total: number;
  completed: number;
  successful: number;
  generationTotal: number;
  generationAttempted: number;
  generationSuccessful: number;
  submissionAttempted: number;
  submissionSuccessful: number;
  rowErrors: Record<string, CheckpointRowError>;
  currentStudentId?: string | null;
};

interface CheckpointState {
  context: CheckpointContext | null;
  drafts: Record<string, CheckpointStudentDraft>;
  synced: Record<string, CheckpointStudentBaseline>;
  results: Record<string, CheckpointSubmitResult>;
  expanded: Record<string, boolean>;
  selectedBranches: Record<string, CheckpointBranch>;
  status: 'idle' | 'loading' | 'success' | 'error';
  statusResult: CheckpointStatusResult | null;
  statusError: CheckpointStatusError | null;
  generationBusy: Set<string>;
  submitBusy: Set<string>;
  rowErrors: Record<string, CheckpointRowError>;
  batch: CheckpointBatchState | null;
  summaryDraft: string;
  summarySynced: string;
  summaryVersion: number;
  activate: (context: CheckpointContext, summary: string) => void;
  reconcile: (context: CheckpointContext, slot: Slot, descriptions?: Record<string, string>, summary?: string) => void;
  setTheoryInput: (studentId: string, value: string) => void;
  setPracticeInput: (studentId: string, value: string) => void;
  setTeacherDescription: (studentId: string, value: string) => void;
  setManualComment: (studentId: string, value: string) => void;
  setCurrentComment: (studentId: string, value: string) => void;
  clearCommentDraft: (studentId: string) => void;
  applyGeneratedComment: (studentId: string, comment: string, expectedDescriptionVersion: number, expectedCommentVersion: number) => boolean;
  setExpanded: (studentId: string, expanded: boolean) => void;
  setSelectedBranch: (studentId: string, branch: CheckpointBranch) => void;
  setSummaryDraft: (summary: string) => void;
  setStatusLoading: (context: CheckpointContext) => void;
  applyStatus: (context: CheckpointContext, result: CheckpointStatusResult) => void;
  setStatusError: (context: CheckpointContext, error: CheckpointStatusError) => void;
  setGenerationBusy: (studentId: string, busy: boolean) => void;
  setSubmitBusy: (studentId: string, busy: boolean) => void;
  setRowError: (studentId: string, phase: keyof CheckpointRowError, message: string | null) => void;
  applySubmitSuccess: (studentId: string, result: CheckpointSubmitResult, submitted: CheckpointStudentDraft, clearComments: boolean) => void;
  startBatch: (batch: CheckpointBatchState) => void;
  updateBatch: (update: Partial<Omit<CheckpointBatchState, 'kind' | 'scopeIds' | 'rowErrors'>> & { error?: { studentId: string; phase: keyof CheckpointRowError; message: string } }) => void;
  finishBatch: () => void;
  discardUnsaved: () => void;
  reset: () => void;
}

const blankComment = { generatedComment: '', manualComment: '', currentComment: '', provenance: 'none' as const };
const freshState = () => ({
  context: null as CheckpointContext | null,
  drafts: {} as Record<string, CheckpointStudentDraft>,
  synced: {} as Record<string, CheckpointStudentBaseline>,
  results: {} as Record<string, CheckpointSubmitResult>,
  expanded: {} as Record<string, boolean>,
  selectedBranches: {} as Record<string, CheckpointBranch>,
  status: 'idle' as const,
  statusResult: null as CheckpointStatusResult | null,
  statusError: null as CheckpointStatusError | null,
  generationBusy: new Set<string>(),
  submitBusy: new Set<string>(),
  rowErrors: {} as Record<string, CheckpointRowError>,
  batch: null as CheckpointBatchState | null,
  summaryDraft: '',
  summarySynced: '',
  summaryVersion: 0,
});

export const useCheckpointStore = create<CheckpointState>((set) => ({
  ...freshState(),
  activate: (context, summary) => set((state) => sameContext(state.context, context)
    ? state
    : { ...freshState(), context, summaryDraft: summary, summarySynced: summary }),
  reconcile: (context, slot, descriptions = {}, summary = slot.summary) => set((state) => {
    if (!sameContext(state.context, context)) return state;
    const drafts: Record<string, CheckpointStudentDraft> = {};
    const synced: Record<string, CheckpointStudentBaseline> = {};
    for (const student of slot.studentAttendance) {
      const area = student.commentByAreas.find((item) => item.type === 'CHECKPOINT');
      const baseline: CheckpointStudentBaseline = {
        theoryInput: scoreString(area?.checkpoint?.checkpointScore),
        practiceInput: scoreString(area?.checkpoint?.practiceScore),
        teacherDescription: descriptions[student.studentId] ?? '',
        ...blankComment,
      };
      const current = state.drafts[student.studentId];
      const previous = state.synced[student.studentId];
      synced[student.studentId] = baseline;
      if (!current || !previous) {
        drafts[student.studentId] = {
          ...baseline,
          theoryVersion: (current?.theoryVersion || 0) + 1,
          practiceVersion: (current?.practiceVersion || 0) + 1,
          descriptionVersion: (current?.descriptionVersion || 0) + 1,
          commentVersion: (current?.commentVersion || 0) + 1,
        };
        continue;
      }
      const theoryDirty = current.theoryInput !== previous.theoryInput;
      const practiceDirty = current.practiceInput !== previous.practiceInput;
      const descriptionDirty = current.teacherDescription !== previous.teacherDescription;
      const commentDirty = !sameComments(current, previous);
      drafts[student.studentId] = {
        theoryInput: theoryDirty ? current.theoryInput : baseline.theoryInput,
        practiceInput: practiceDirty ? current.practiceInput : baseline.practiceInput,
        teacherDescription: descriptionDirty ? current.teacherDescription : baseline.teacherDescription,
        ...(commentDirty ? commentFields(current) : blankComment),
        theoryVersion: current.theoryVersion + (theoryDirty ? 0 : 1),
        practiceVersion: current.practiceVersion + (practiceDirty ? 0 : 1),
        descriptionVersion: current.descriptionVersion + (descriptionDirty ? 0 : 1),
        commentVersion: current.commentVersion + (commentDirty ? 0 : 1),
      };
    }
    const summaryDirty = state.summaryDraft !== state.summarySynced;
    return {
      drafts,
      synced,
      summarySynced: summary,
      ...(summaryDirty ? {} : { summaryDraft: summary, summaryVersion: state.summaryVersion + 1 }),
    };
  }),
  setTheoryInput: (studentId, theoryInput) => set((state) => updateDraft(state, studentId, (draft) => draft.theoryInput === theoryInput ? draft : { ...draft, theoryInput, theoryVersion: draft.theoryVersion + 1 })),
  setPracticeInput: (studentId, practiceInput) => set((state) => updateDraft(state, studentId, (draft) => draft.practiceInput === practiceInput ? draft : { ...draft, practiceInput, practiceVersion: draft.practiceVersion + 1 })),
  setTeacherDescription: (studentId, teacherDescription) => set((state) => updateDraft(state, studentId, (draft) => draft.teacherDescription === teacherDescription ? draft : { ...draft, teacherDescription, descriptionVersion: draft.descriptionVersion + 1 })),
  setManualComment: (studentId, value) => set((state) => updateDraft(state, studentId, (draft) => ({ ...draft, manualComment: value, currentComment: value, provenance: value.trim() ? 'manual' : 'none', commentVersion: draft.commentVersion + 1 }))),
  setCurrentComment: (studentId, value) => set((state) => updateDraft(state, studentId, (draft) => {
    if (draft.currentComment === value) return draft;
    if (draft.provenance === 'generated') return { ...draft, currentComment: value, commentVersion: draft.commentVersion + 1 };
    return { ...draft, currentComment: value, manualComment: value, provenance: value.trim() ? 'manual' : 'none', commentVersion: draft.commentVersion + 1 };
  })),
  clearCommentDraft: (studentId) => set((state) => updateDraft(state, studentId, (draft) => ({ ...draft, ...blankComment, commentVersion: draft.commentVersion + 1 }))),
  applyGeneratedComment: (studentId, comment, expectedDescriptionVersion, expectedCommentVersion) => {
    let applied = false;
    set((state) => updateDraft(state, studentId, (draft) => {
      if (draft.descriptionVersion !== expectedDescriptionVersion || draft.commentVersion !== expectedCommentVersion) return draft;
      applied = true;
      return { ...draft, generatedComment: comment, currentComment: checkpointCommentPlainText(comment), provenance: 'generated', commentVersion: draft.commentVersion + 1 };
    }));
    return applied;
  },
  setExpanded: (studentId, expanded) => set((state) => ({ expanded: { ...state.expanded, [studentId]: expanded } })),
  setSelectedBranch: (studentId, branch) => set((state) => ({ selectedBranches: { ...state.selectedBranches, [studentId]: branch } })),
  setSummaryDraft: (summaryDraft) => set((state) => state.summaryDraft === summaryDraft ? state : { summaryDraft, summaryVersion: state.summaryVersion + 1 }),
  setStatusLoading: (context) => set((state) => sameContext(state.context, context) ? { status: 'loading', statusError: null } : state),
  applyStatus: (context, statusResult) => set((state) => {
    if (!sameContext(state.context, context)) return state;
    const selectedBranches: Record<string, CheckpointBranch> = {};
    for (const student of statusResult.students) {
      const selected = state.selectedBranches[student.studentId];
      if (selected === 'original' && student.original) selectedBranches[student.studentId] = selected;
      else if (selected === 'makeup' && student.makeup) selectedBranches[student.studentId] = selected;
      else if (student.defaultBranch) selectedBranches[student.studentId] = student.defaultBranch;
    }
    return { status: 'success', statusResult, statusError: null, selectedBranches };
  }),
  setStatusError: (context, statusError) => set((state) => sameContext(state.context, context) ? { status: 'error', statusResult: null, statusError } : state),
  setGenerationBusy: (studentId, busy) => set((state) => ({ generationBusy: updateSet(state.generationBusy, studentId, busy) })),
  setSubmitBusy: (studentId, busy) => set((state) => ({ submitBusy: updateSet(state.submitBusy, studentId, busy) })),
  setRowError: (studentId, phase, message) => set((state) => ({ rowErrors: updateRowError(state.rowErrors, studentId, phase, message) })),
  applySubmitSuccess: (studentId, result, submitted, clearComments) => set((state) => {
    const live = state.drafts[studentId];
    const rowErrors = updateRowError(state.rowErrors, studentId, 'submission', null);
    if (!live) return { results: { ...state.results, [studentId]: result }, rowErrors };
    const next = { ...live };
    const synced = { ...state.synced };
    const baseline = synced[studentId] || baselineFromDraft(next);
    if (live.theoryVersion === submitted.theoryVersion) {
      next.theoryInput = scoreString(result.theoryScore);
      next.theoryVersion += 1;
      synced[studentId] = { ...(synced[studentId] || baseline), theoryInput: next.theoryInput };
    }
    if (live.practiceVersion === submitted.practiceVersion) {
      next.practiceInput = scoreString(result.practiceScore);
      next.practiceVersion += 1;
      synced[studentId] = { ...(synced[studentId] || baseline), practiceInput: next.practiceInput };
    }
    if (clearComments && live.commentVersion === submitted.commentVersion && sameComments(live, submitted)) {
      Object.assign(next, blankComment);
      next.commentVersion += 1;
      const commentBaseline = synced[studentId] || baselineFromDraft(next);
      synced[studentId] = { ...commentBaseline, ...blankComment };
    }
    return { drafts: { ...state.drafts, [studentId]: next }, synced, results: { ...state.results, [studentId]: result }, rowErrors };
  }),
  startBatch: (batch) => set({ batch }),
  updateBatch: (update) => set((state) => {
    if (!state.batch) return state;
    const { error, ...values } = update;
    const rowErrors = error ? updateRowError(state.batch.rowErrors, error.studentId, error.phase, error.message) : state.batch.rowErrors;
    return { batch: { ...state.batch, ...values, rowErrors } };
  }),
  finishBatch: () => set({ batch: null }),
  discardUnsaved: () => set((state) => ({
    drafts: Object.fromEntries(Object.entries(state.synced).map(([studentId, baseline]) => [studentId, {
      ...baseline,
      theoryVersion: (state.drafts[studentId]?.theoryVersion || 0) + 1,
      practiceVersion: (state.drafts[studentId]?.practiceVersion || 0) + 1,
      descriptionVersion: (state.drafts[studentId]?.descriptionVersion || 0) + 1,
      commentVersion: (state.drafts[studentId]?.commentVersion || 0) + 1,
    }])),
    summaryDraft: state.summarySynced,
    summaryVersion: state.summaryVersion + 1,
    rowErrors: {},
  })),
  reset: () => set(freshState()),
}));

export function isCheckpointDraftDirty(state: Pick<CheckpointState, 'drafts' | 'synced'>, studentId: string): boolean {
  const draft = state.drafts[studentId];
  const synced = state.synced[studentId];
  return Boolean(draft && synced && (
    draft.theoryInput !== synced.theoryInput
    || draft.practiceInput !== synced.practiceInput
    || draft.teacherDescription !== synced.teacherDescription
    || !sameComments(draft, synced)
  ));
}
export function dirtyCheckpointStudentIds(state = useCheckpointStore.getState()): string[] { return Object.keys(state.drafts).filter((studentId) => isCheckpointDraftDirty(state, studentId)); }
export function hasUnsavedCheckpointWork(): boolean {
  const state = useCheckpointStore.getState();
  return state.summaryDraft !== state.summarySynced || dirtyCheckpointStudentIds(state).length > 0;
}
export function isCheckpointOperationActive(): boolean {
  const state = useCheckpointStore.getState();
  return state.generationBusy.size > 0 || state.submitBusy.size > 0 || Boolean(state.batch);
}
export function effectiveCheckpointComment(draft: CheckpointStudentDraft): string {
  if (draft.generatedComment.trim()) return draft.currentComment === checkpointCommentPlainText(draft.generatedComment) ? draft.generatedComment : draft.currentComment;
  return draft.manualComment.trim() ? draft.manualComment : draft.currentComment;
}
export function checkpointCommentPlainText(value: string): string { return value.replace(/<[^>]*>/g, ''); }
export function cloneCheckpointDraft(draft: CheckpointStudentDraft): CheckpointStudentDraft { return { ...draft }; }

function sameContext(left: CheckpointContext | null, right: CheckpointContext): boolean {
  return left?.classId === right.classId && left.slotId === right.slotId && left.checkpoint === right.checkpoint && left.epoch === right.epoch;
}
function scoreString(value: number | null | undefined): string { return value == null ? '' : String(value); }
function commentFields(value: Pick<CheckpointStudentBaseline, 'generatedComment' | 'manualComment' | 'currentComment' | 'provenance'>) {
  return { generatedComment: value.generatedComment, manualComment: value.manualComment, currentComment: value.currentComment, provenance: value.provenance };
}
function sameComments(left: Pick<CheckpointStudentBaseline, 'generatedComment' | 'manualComment' | 'currentComment' | 'provenance'>, right: Pick<CheckpointStudentBaseline, 'generatedComment' | 'manualComment' | 'currentComment' | 'provenance'>): boolean {
  return left.generatedComment === right.generatedComment && left.manualComment === right.manualComment && left.currentComment === right.currentComment && left.provenance === right.provenance;
}
function baselineFromDraft(draft: CheckpointStudentDraft): CheckpointStudentBaseline {
  const {
    theoryVersion: _theoryVersion,
    practiceVersion: _practiceVersion,
    descriptionVersion: _descriptionVersion,
    commentVersion: _commentVersion,
    ...baseline
  } = draft;
  return baseline;
}
function updateDraft(state: CheckpointState, studentId: string, update: (draft: CheckpointStudentDraft) => CheckpointStudentDraft): Partial<CheckpointState> | CheckpointState {
  const draft = state.drafts[studentId];
  if (!draft) return state;
  const next = update(draft);
  return next === draft ? state : { drafts: { ...state.drafts, [studentId]: next } };
}
function updateSet(source: Set<string>, value: string, add: boolean): Set<string> { const next = new Set(source); if (add) next.add(value); else next.delete(value); return next; }
function updateRowError(source: Record<string, CheckpointRowError>, studentId: string, phase: keyof CheckpointRowError, message: string | null): Record<string, CheckpointRowError> {
  const row = { ...(source[studentId] || {}) };
  if (message) row[phase] = message; else delete row[phase];
  if (!row.generation && !row.submission) return withoutKey(source, studentId);
  return { ...source, [studentId]: row };
}
function withoutKey<T>(source: Record<string, T>, key: string): Record<string, T> { if (!(key in source)) return source; const next = { ...source }; delete next[key]; return next; }

registerWorkflowReset(() => useCheckpointStore.getState().reset());

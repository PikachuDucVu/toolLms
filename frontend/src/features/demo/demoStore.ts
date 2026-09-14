import type { DemoResolvedSchema, DemoSubmitResult, Slot } from '@tool-lms/contracts';
import { create } from 'zustand';
import { registerWorkflowReset } from '../../lib/operationContext';

export type DemoContext = { classId: string; slotId: string; epoch: number };
export type DemoScores = Record<string, number | null>;
export type DemoDraft = { scores: DemoScores; autoRate: boolean; version: number };
export type DemoBatchPhase = 'previewing' | 'submitting' | 'reloading';
export type DemoBatchState = {
  phase: DemoBatchPhase;
  scopeIds: string[];
  total: number;
  attempted: number;
  successful: number;
  currentStudentId: string | null;
  failures: Record<string, string>;
};

interface DemoState {
  context: DemoContext | null;
  schema: DemoResolvedSchema | null;
  schemaError: string | null;
  drafts: Record<string, DemoDraft>;
  synced: Record<string, Omit<DemoDraft, 'version'>>;
  results: Record<string, DemoSubmitResult>;
  previews: Record<string, { demoScore: number; draftVersion: number }>;
  errors: Record<string, string>;
  randomBusy: Set<string>;
  submitBusy: Set<string>;
  batch: DemoBatchState | null;
  randomMinScore: number;
  randomMaxScore: number;
  summaryDraft: string;
  summarySynced: string;
  summaryVersion: number;
  activate: (context: DemoContext, summary: string) => void;
  hydrateSchema: (context: DemoContext, schema: DemoResolvedSchema, slot: Slot, summary: string) => void;
  setSchemaError: (context: DemoContext, error: string | null) => void;
  setScore: (studentId: string, questionId: string, score: number | null) => void;
  setTotalScore: (studentId: string, total: number | null) => void;
  setRandomRange: (minScore: number, maxScore: number) => void;
  setAutoRate: (studentId: string, autoRate: boolean) => void;
  applyPreview: (studentId: string, scores: DemoScores, demoScore: number, expectedVersion: number) => boolean;
  setSummaryDraft: (summary: string) => void;
  applySubmitSuccess: (studentId: string, result: DemoSubmitResult, submittedDraft: DemoDraft, submittedSummary: string, summaryVersion: number) => void;
  setError: (studentId: string, error: string | null) => void;
  setRandomBusy: (studentId: string, busy: boolean) => void;
  setSubmitBusy: (studentId: string, busy: boolean) => void;
  startBatch: (batch: DemoBatchState) => void;
  updateBatch: (update: Partial<Omit<DemoBatchState, 'scopeIds' | 'failures'>> & { failure?: { studentId: string; message: string } }) => void;
  finishBatch: () => void;
  discardUnsaved: () => void;
  reset: () => void;
}

const freshState = () => ({
  context: null as DemoContext | null,
  schema: null as DemoResolvedSchema | null,
  schemaError: null as string | null,
  drafts: {} as Record<string, DemoDraft>,
  synced: {} as Record<string, Omit<DemoDraft, 'version'>>,
  results: {} as Record<string, DemoSubmitResult>,
  previews: {} as Record<string, { demoScore: number; draftVersion: number }>,
  errors: {} as Record<string, string>,
  randomBusy: new Set<string>(),
  submitBusy: new Set<string>(),
  batch: null as DemoBatchState | null,
  randomMinScore: 3.75,
  randomMaxScore: 5,
  summaryDraft: '',
  summarySynced: '',
  summaryVersion: 0,
});

export const useDemoStore = create<DemoState>((set) => ({
  ...freshState(),
  activate: (context, summary) => set((state) => sameContext(state.context, context)
    ? state
    : { ...freshState(), context, summaryDraft: summary, summarySynced: summary }),
  hydrateSchema: (context, schema, slot, summary) => set((state) => {
    if (!sameContext(state.context, context)) return state;
    const drafts = { ...state.drafts };
    const synced = { ...state.synced };
    for (const student of slot.studentAttendance) {
      const demoArea = student.commentByAreas.find((area) => area.type === 'DEMO');
      const ratePresent = student.commentByAreas.some((area) => area.type === 'RATE');
      const scores = Object.fromEntries(schema.questions.map((question) => {
        const existing = demoArea?.demoQuestions.find((item) => item.courseProcessDemoDetailId === question.id);
        return [question.id, existing?.score ?? null];
      }));
      const baseline = { scores, autoRate: demoArea ? ratePresent : true };
      const current = drafts[student.studentId];
      const previous = synced[student.studentId];
      const wasDirty = Boolean(current && previous && (current.autoRate !== previous.autoRate || !sameScores(current.scores, previous.scores)));
      synced[student.studentId] = cloneBaseline(baseline);
      if (!current || !wasDirty) drafts[student.studentId] = { ...cloneBaseline(baseline), version: (current?.version || 0) + 1 };
    }
    const summaryWasDirty = state.summaryDraft.trim() !== state.summarySynced.trim();
    return {
      schema,
      schemaError: null,
      drafts,
      synced,
      summarySynced: summary,
      ...(summaryWasDirty ? {} : { summaryDraft: summary, summaryVersion: state.summaryVersion + 1 }),
    };
  }),
  setSchemaError: (context, schemaError) => set((state) => sameContext(state.context, context) ? { schemaError } : state),
  setScore: (studentId, questionId, score) => set((state) => {
    const draft = state.drafts[studentId];
    if (!draft) return state;
    return {
      drafts: { ...state.drafts, [studentId]: { ...draft, scores: { ...draft.scores, [questionId]: score }, version: draft.version + 1 } },
      previews: withoutKey(state.previews, studentId),
    };
  }),
  setTotalScore: (studentId, total) => set((state) => {
    const draft = state.drafts[studentId];
    const schema = state.schema;
    if (!draft || !schema) return state;
    const scores = distributeTotalScore(schema, total);
    return {
      drafts: { ...state.drafts, [studentId]: { ...draft, scores, version: draft.version + 1 } },
      previews: withoutKey(state.previews, studentId),
    };
  }),
  setRandomRange: (minScore, maxScore) => set((state) => {
    const min = Math.max(0, Math.min(5, Math.round(minScore * 4) / 4));
    const max = Math.max(min, Math.min(5, Math.round(maxScore * 4) / 4));
    if (state.randomMinScore === min && state.randomMaxScore === max) return state;
    return { randomMinScore: min, randomMaxScore: max };
  }),
  setAutoRate: (studentId, autoRate) => set((state) => {
    const draft = state.drafts[studentId];
    if (!draft || draft.autoRate === autoRate) return state;
    return { drafts: { ...state.drafts, [studentId]: { ...draft, autoRate, version: draft.version + 1 } } };
  }),
  applyPreview: (studentId, scores, demoScore, expectedVersion) => {
    let applied = false;
    set((state) => {
      const draft = state.drafts[studentId];
      if (!draft || draft.version !== expectedVersion) return state;
      const nextVersion = draft.version + 1;
      applied = true;
      return {
        drafts: { ...state.drafts, [studentId]: { ...draft, scores: { ...scores }, version: nextVersion } },
        previews: { ...state.previews, [studentId]: { demoScore, draftVersion: nextVersion } },
      };
    });
    return applied;
  },
  setSummaryDraft: (summaryDraft) => set((state) => summaryDraft === state.summaryDraft ? state : { summaryDraft, summaryVersion: state.summaryVersion + 1 }),
  applySubmitSuccess: (studentId, result, submittedDraft, submittedSummary, submittedSummaryVersion) => set((state) => {
    const live = state.drafts[studentId];
    const scores = Object.fromEntries(result.questions.map((question) => [question.id, question.score]));
    const synced = { ...state.synced, [studentId]: { scores, autoRate: submittedDraft.autoRate } };
    const drafts = { ...state.drafts };
    if (live && sameDraft(live, submittedDraft)) drafts[studentId] = { scores: { ...scores }, autoRate: submittedDraft.autoRate, version: live.version };
    const summaryUnchanged = result.summaryIncluded && state.summaryVersion === submittedSummaryVersion && state.summaryDraft === submittedSummary;
    return {
      drafts,
      synced,
      results: { ...state.results, [studentId]: result },
      previews: withoutKey(state.previews, studentId),
      errors: withoutKey(state.errors, studentId),
      ...(result.summaryIncluded ? { summarySynced: submittedSummary } : {}),
      ...(summaryUnchanged ? { summaryDraft: submittedSummary } : {}),
    };
  }),
  setError: (studentId, error) => set((state) => ({ errors: error ? { ...state.errors, [studentId]: error } : withoutKey(state.errors, studentId) })),
  setRandomBusy: (studentId, busy) => set((state) => ({ randomBusy: updateSet(state.randomBusy, studentId, busy) })),
  setSubmitBusy: (studentId, busy) => set((state) => ({ submitBusy: updateSet(state.submitBusy, studentId, busy) })),
  startBatch: (batch) => set({ batch }),
  updateBatch: (update) => set((state) => {
    if (!state.batch) return state;
    const failures = update.failure ? { ...state.batch.failures, [update.failure.studentId]: update.failure.message } : state.batch.failures;
    const { failure: _failure, ...values } = update;
    return { batch: { ...state.batch, ...values, failures } };
  }),
  finishBatch: () => set({ batch: null }),
  discardUnsaved: () => set((state) => ({
    drafts: Object.fromEntries(Object.entries(state.synced).map(([studentId, baseline]) => [studentId, { ...cloneBaseline(baseline), version: (state.drafts[studentId]?.version || 0) + 1 }])),
    summaryDraft: state.summarySynced,
    summaryVersion: state.summaryVersion + 1,
    errors: {},
  })),
  reset: () => set(freshState()),
}));

export function sameDemoDraft(left: DemoDraft | undefined, right: DemoDraft | undefined): boolean { return sameDraft(left, right); }
export function isDemoDraftDirty(state: Pick<DemoState, 'drafts' | 'synced'>, studentId: string): boolean {
  const draft = state.drafts[studentId];
  const synced = state.synced[studentId];
  if (!draft || !synced) return false;
  return draft.autoRate !== synced.autoRate || !sameScores(draft.scores, synced.scores);
}
export function dirtyDemoStudentIds(state = useDemoStore.getState()): string[] { return Object.keys(state.drafts).filter((id) => isDemoDraftDirty(state, id)); }
export function hasUnsavedDemoWork(): boolean {
  const state = useDemoStore.getState();
  return state.summaryDraft.trim() !== state.summarySynced.trim() || dirtyDemoStudentIds(state).length > 0;
}
export function isDemoOperationActive(): boolean {
  const state = useDemoStore.getState();
  return state.randomBusy.size > 0 || state.submitBusy.size > 0 || Boolean(state.batch);
}

function sameContext(left: DemoContext | null, right: DemoContext): boolean { return left?.classId === right.classId && left.slotId === right.slotId && left.epoch === right.epoch; }
function sameDraft(left: DemoDraft | undefined, right: DemoDraft | undefined): boolean { return Boolean(left && right && left.autoRate === right.autoRate && sameScores(left.scores, right.scores)); }
function sameScores(left: DemoScores, right: DemoScores): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) if ((left[key] ?? null) !== (right[key] ?? null)) return false;
  return true;
}
function cloneBaseline(value: { scores: DemoScores; autoRate: boolean }) { return { scores: { ...value.scores }, autoRate: value.autoRate }; }
export function distributeTotalScore(schema: DemoResolvedSchema, total: number | null): DemoScores {
  if (total === null) return Object.fromEntries(schema.questions.map((question) => [question.id, null]));
  const max = schema.maxScore;
  const clamped = Math.max(0, Math.min(max, Number.isFinite(total) ? total : 0));
  const stepped = Math.round(clamped * 4) / 4;
  let remaining = stepped;
  const scores: DemoScores = {};
  schema.questions.forEach((question, index) => {
    if (index === schema.questions.length - 1) {
      scores[question.id] = Math.max(0, Math.min(question.maxScore, Math.round(remaining * 4) / 4));
      return;
    }
    const share = max > 0 ? Math.round((stepped * (question.maxScore / max)) * 4) / 4 : 0;
    const value = Math.max(0, Math.min(question.maxScore, share, remaining));
    scores[question.id] = value;
    remaining = Math.round((remaining - value) * 4) / 4;
  });
  return scores;
}
function updateSet(source: Set<string>, value: string, add: boolean): Set<string> { const next = new Set(source); if (add) next.add(value); else next.delete(value); return next; }
function withoutKey<T>(source: Record<string, T>, key: string): Record<string, T> { if (!(key in source)) return source; const next = { ...source }; delete next[key]; return next; }

registerWorkflowReset(() => useDemoStore.getState().reset());

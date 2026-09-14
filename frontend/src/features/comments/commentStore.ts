import type { CommentGenerationMeta, ThinkingLevel } from '@tool-lms/contracts';
import { create } from 'zustand';
import { registerWorkflowReset } from '../../lib/operationContext';

export type CommentDraftKind = 'generated' | 'manual';
export type CommentDraft = {
  content: string;
  kind: CommentDraftKind;
  generationMeta: CommentGenerationMeta | null;
};
export type CommentContext = { classId: string; slotId: string; epoch: number };
export type CommentBatchPhase = 'persisting' | 'generating' | 'submitting';
export type CommentBatchState = {
  kind: 'generate' | 'submit';
  phase: CommentBatchPhase;
  scopeIds: string[];
  total: number;
  completed: number;
  successful: number;
  safeTemplateCount: number;
  failures: Record<string, string>;
  currentStudentId?: string | null;
};
export type CommentGenerationConfig = {
  modelId: string;
  customModelId: string;
  thinkingLevel: ThinkingLevel;
  commentLength: 'short' | 'medium' | 'long';
  customPrompt: string;
  apiKey: string;
};

interface CommentState {
  context: CommentContext | null;
  drafts: Record<string, CommentDraft>;
  errors: Record<string, string>;
  studentBusy: Set<string>;
  batch: CommentBatchState | null;
  summaryDraft: string;
  summarySynced: string;
  summaryBusy: boolean;
  summaryError: string | null;
  generationConfig: CommentGenerationConfig;
  activate: (context: CommentContext, summary: string) => void;
  setDraft: (studentId: string, draft: CommentDraft) => void;
  editDraft: (studentId: string, content: string) => void;
  removeDraft: (studentId: string) => void;
  setError: (studentId: string, error: string | null) => void;
  setStudentBusy: (studentId: string, busy: boolean) => void;
  startBatch: (batch: CommentBatchState) => void;
  updateBatch: (update: Partial<Omit<CommentBatchState, 'scopeIds' | 'kind'>> & { failure?: { studentId: string; message: string } }) => void;
  finishBatch: () => void;
  setSummaryDraft: (summary: string) => void;
  hydrateSummary: (summary: string) => void;
  markSummarySynced: (summary: string) => void;
  setSummaryBusy: (busy: boolean) => void;
  setSummaryError: (error: string | null) => void;
  setGenerationConfig: (config: Partial<CommentGenerationConfig>) => void;
  discardUnsaved: () => void;
  reset: () => void;
}

const defaultGenerationConfig: CommentGenerationConfig = {
  modelId: '', customModelId: '', thinkingLevel: 'high', commentLength: 'medium', customPrompt: '', apiKey: '',
};
const freshState = () => ({
  context: null as CommentContext | null,
  drafts: {} as Record<string, CommentDraft>,
  errors: {} as Record<string, string>,
  studentBusy: new Set<string>(),
  batch: null as CommentBatchState | null,
  summaryDraft: '',
  summarySynced: '',
  summaryBusy: false,
  summaryError: null as string | null,
  generationConfig: { ...defaultGenerationConfig },
});

export const useCommentStore = create<CommentState>((set) => ({
  ...freshState(),
  activate: (context, summary) => set((state) => state.context?.classId === context.classId && state.context.slotId === context.slotId
    ? state
    : { ...freshState(), context, summaryDraft: summary, summarySynced: summary, generationConfig: state.generationConfig }),
  setDraft: (studentId, draft) => set((state) => ({ drafts: { ...state.drafts, [studentId]: draft }, errors: withoutKey(state.errors, studentId) })),
  editDraft: (studentId, content) => set((state) => {
    const current = state.drafts[studentId];
    if (!content && !current) return state;
    return {
      drafts: { ...state.drafts, [studentId]: { content, kind: 'manual', generationMeta: null } },
      errors: withoutKey(state.errors, studentId),
    };
  }),
  removeDraft: (studentId) => set((state) => ({ drafts: withoutKey(state.drafts, studentId), errors: withoutKey(state.errors, studentId) })),
  setError: (studentId, error) => set((state) => ({ errors: error ? { ...state.errors, [studentId]: error } : withoutKey(state.errors, studentId) })),
  setStudentBusy: (studentId, busy) => set((state) => ({ studentBusy: updateSet(state.studentBusy, studentId, busy) })),
  startBatch: (batch) => set({ batch }),
  updateBatch: (update) => set((state) => {
    if (!state.batch) return state;
    const failures = update.failure
      ? { ...state.batch.failures, [update.failure.studentId]: update.failure.message }
      : state.batch.failures;
    const { failure: _failure, ...values } = update;
    return { batch: { ...state.batch, ...values, failures } };
  }),
  finishBatch: () => set({ batch: null }),
  setSummaryDraft: (summaryDraft) => set({ summaryDraft, summaryError: null }),
  hydrateSummary: (summary) => set({ summaryDraft: summary, summarySynced: summary, summaryError: null }),
  markSummarySynced: (summary) => set((state) => state.summaryDraft === summary ? { summarySynced: summary, summaryError: null } : { summarySynced: summary }),
  setSummaryBusy: (summaryBusy) => set({ summaryBusy }),
  setSummaryError: (summaryError) => set({ summaryError }),
  setGenerationConfig: (config) => set((state) => ({ generationConfig: { ...state.generationConfig, ...config } })),
  discardUnsaved: () => set((state) => ({ drafts: {}, errors: {}, summaryDraft: state.summarySynced, summaryError: null })),
  reset: () => set((state) => ({ ...freshState(), generationConfig: state.generationConfig })),
}));

function updateSet(source: Set<string>, value: string, add: boolean): Set<string> {
  const next = new Set(source);
  if (add) next.add(value); else next.delete(value);
  return next;
}

function withoutKey<T>(source: Record<string, T>, key: string): Record<string, T> {
  if (!Object.prototype.hasOwnProperty.call(source, key)) return source;
  const next = { ...source };
  delete next[key];
  return next;
}

registerWorkflowReset(() => useCommentStore.getState().reset());

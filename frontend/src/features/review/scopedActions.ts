import type { CommentDraft } from '../comments/public/store';
import type { ReviewRow } from './selectors';

export type FrozenReviewSubmitScope = {
  ids: string[];
  drafts: Record<string, CommentDraft>;
  summary: string;
};

export function freezeReviewGenerationScope(ids: string[]): string[] {
  return Array.from(new Set(ids.map(String)));
}

export function freezeReviewSubmitScope(rows: ReviewRow[], drafts: Record<string, CommentDraft>, summary: string): FrozenReviewSubmitScope {
  const ids = Array.from(new Set(rows.filter((row) => row.isPresent && row.isDraft && drafts[row.studentId]?.content.trim()).map((row) => row.studentId)));
  return {
    ids,
    drafts: Object.fromEntries(ids.map((studentId) => [studentId, { ...drafts[studentId], generationMeta: drafts[studentId].generationMeta ? { ...drafts[studentId].generationMeta, validationIssues: [...drafts[studentId].generationMeta!.validationIssues] } : null }])),
    summary: summary.trim(),
  };
}

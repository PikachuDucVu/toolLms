import { beforeEach, describe, expect, it } from 'vitest';
import { sessionCommentModeFor, useSessionCommentModeStore } from './sessionMode';

beforeEach(() => {
  localStorage.clear();
  useSessionCommentModeStore.setState({ modes: {} });
});

describe('per-session comment mode', () => {
  it('isolates preferences by both class and slot, restores them, and removes auto overrides', async () => {
    useSessionCommentModeStore.getState().setMode('class-a', 'slot-1', 'spck');
    useSessionCommentModeStore.getState().setMode('class-a', 'slot-2', 'regular');
    expect(sessionCommentModeFor('class-a', 'slot-1')).toBe('spck');
    expect(sessionCommentModeFor('class-a', 'slot-2')).toBe('regular');
    expect(sessionCommentModeFor('class-b', 'slot-1')).toBe('auto');
    const saved = localStorage.getItem('lms-session-comment-modes')!;
    useSessionCommentModeStore.setState({ modes: {} });
    localStorage.setItem('lms-session-comment-modes', saved);
    await useSessionCommentModeStore.persist.rehydrate();
    expect(sessionCommentModeFor('class-a', 'slot-1')).toBe('spck');
    useSessionCommentModeStore.getState().setMode('class-a', 'slot-1', 'auto');
    expect(sessionCommentModeFor('class-a', 'slot-1')).toBe('auto');
    expect(Object.keys(useSessionCommentModeStore.getState().modes)).toHaveLength(1);
  });

  it('uses collision-safe keys and ignores unknown stored mode values', () => {
    useSessionCommentModeStore.getState().setMode('a:b', 'c', 'spck');
    expect(sessionCommentModeFor('a', 'b:c')).toBe('auto');
    expect(sessionCommentModeFor('a:b', 'c', { '["a:b","c"]': 'broken' as never })).toBe('auto');
  });
});

import type { SessionCommentMode } from '@tool-lms/contracts';
import { createContext, useContext } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const slotKey = (classId: string, slotId: string) => JSON.stringify([classId, slotId]);

interface SessionCommentModeState {
  modes: Record<string, SessionCommentMode>;
  setMode: (classId: string, slotId: string, mode: SessionCommentMode) => void;
}

// This is a per-session browser preference, not a global AI configuration.
export const useSessionCommentModeStore = create<SessionCommentModeState>()(persist((set) => ({
  modes: {},
  setMode: (classId, slotId, mode) => set((state) => {
    const modes = { ...state.modes };
    const key = slotKey(classId, slotId);
    if (mode === 'auto') delete modes[key]; else modes[key] = mode;
    return { modes };
  }),
}), { name: 'lms-session-comment-modes', partialize: (state) => ({ modes: state.modes }) }));

export function sessionCommentModeFor(classId: string, slotId: string, modes = useSessionCommentModeStore.getState().modes): SessionCommentMode {
  const mode = modes[slotKey(classId, slotId)];
  return mode === 'regular' || mode === 'spck' ? mode : 'auto';
}

export function useSlotCommentMode(classId: string, slotId: string): SessionCommentMode {
  return useSessionCommentModeStore((state) => sessionCommentModeFor(classId, slotId, state.modes));
}

export const SessionCommentModeContext = createContext<SessionCommentMode>('auto');
export const useSessionCommentMode = () => useContext(SessionCommentModeContext);

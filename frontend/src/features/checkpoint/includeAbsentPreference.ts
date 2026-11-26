import { useSyncExternalStore } from 'react';

const KEY = 'checkpoint.includeAbsentInComments';
const listeners = new Set<() => void>();

function read(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setIncludeAbsent(value: boolean): void {
  try { localStorage.setItem(KEY, value ? '1' : '0'); } catch { /* storage unavailable */ }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Whether class-wide Checkpoint actions also cover absent students. Shared by the action bar and the review dialog. */
export function useIncludeAbsent(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}

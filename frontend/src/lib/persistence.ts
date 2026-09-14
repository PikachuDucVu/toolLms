export type Theme = 'light' | 'dark';
export type StudentNotes = Record<string, string>;

export const storageKeys = {
  email: 'lms_email', password: 'lms_password', apiKey: 'ai_api_key', theme: 'lms-theme',
  studentNotes: 'studentNotes', firstVisit: 'lms_config_first_visit_seen',
} as const;

export function readRememberedLogin(storage: Storage = localStorage) {
  return { email: storage.getItem(storageKeys.email) || '', password: storage.getItem(storageKeys.password) || '' };
}
export function writeRememberedLogin(email: string, password: string, remember: boolean, storage: Storage = localStorage): void {
  if (remember) {
    storage.setItem(storageKeys.email, email);
    storage.setItem(storageKeys.password, password);
  } else {
    storage.removeItem(storageKeys.email);
    storage.removeItem(storageKeys.password);
  }
}
export function readAiApiKey(storage: Storage = localStorage): string { return storage.getItem(storageKeys.apiKey) || ''; }
export function writeAiApiKey(value: string, storage: Storage = localStorage): void {
  const trimmed = value.trim();
  if (trimmed) storage.setItem(storageKeys.apiKey, trimmed);
}
export function preferredTheme(storage: Storage = localStorage, media: Pick<MediaQueryList, 'matches'> = matchMedia('(prefers-color-scheme: dark)')): Theme {
  const saved = storage.getItem(storageKeys.theme);
  return saved === 'light' || saved === 'dark' ? saved : media.matches ? 'dark' : 'light';
}
export function writeTheme(theme: Theme, storage: Storage = localStorage): void { storage.setItem(storageKeys.theme, theme); }
export function listenForStorageResync(sync: () => void, target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window): () => void {
  target.addEventListener('storage', sync);
  target.addEventListener('focus', sync);
  return () => { target.removeEventListener('storage', sync); target.removeEventListener('focus', sync); };
}
export function readStudentNotes(storage: Storage = localStorage): StudentNotes {
  try {
    const value: unknown = JSON.parse(storage.getItem(storageKeys.studentNotes) || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } catch { return {}; }
}
export function writeStudentNote(studentId: string, note: string, storage: Storage = localStorage): StudentNotes {
  const notes = readStudentNotes(storage);
  notes[studentId] = note;
  storage.setItem(storageKeys.studentNotes, JSON.stringify(notes));
  return notes;
}
export function markConfigFirstVisitSeen(storage: Storage = localStorage): void { storage.setItem(storageKeys.firstVisit, '1'); }
export function isConfigFirstVisit(storage: Storage = localStorage): boolean { return storage.getItem(storageKeys.firstVisit) !== '1'; }
export function clearObsoleteAuthStorage(storage: Storage = localStorage): void {
  for (const key of ['lms_token', 'lms_token_expiry', 'lms_firebase_token']) storage.removeItem(key);
}

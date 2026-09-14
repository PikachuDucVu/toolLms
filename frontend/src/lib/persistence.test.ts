import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearObsoleteAuthStorage, isConfigFirstVisit, markConfigFirstVisitSeen, preferredTheme, readAiApiKey, readRememberedLogin, readStudentNotes, writeAiApiKey, writeRememberedLogin, writeStudentNote, writeTheme } from './persistence';

describe('legacy-compatible persistence', () => {
  beforeEach(() => localStorage.clear());
  it('preserves exact raw legacy remember-login keys, defaults, writes, and removal semantics', () => {
    expect(readRememberedLogin()).toEqual({ email: '', password: '' });
    localStorage.setItem('lms_email', 'legacy.teacher@mindx.test'); localStorage.setItem('lms_password', ' legacy password ');
    expect(readRememberedLogin()).toEqual({ email: 'legacy.teacher@mindx.test', password: ' legacy password ' });
    writeRememberedLogin('teacher@example.com', 'secret', true);
    expect(localStorage.getItem('lms_email')).toBe('teacher@example.com'); expect(localStorage.getItem('lms_password')).toBe('secret');
    writeRememberedLogin('', '', false);
    expect(localStorage.getItem('lms_email')).toBeNull(); expect(localStorage.getItem('lms_password')).toBeNull();
  });
  it('uses the exact raw legacy API-key key, trims non-empty writes, and preserves the old key on empty input', () => {
    expect(readAiApiKey()).toBe('');
    localStorage.setItem('ai_api_key', 'legacy-key'); expect(readAiApiKey()).toBe('legacy-key');
    writeAiApiKey(' key-1 '); expect(localStorage.getItem('ai_api_key')).toBe('key-1');
    writeAiApiKey(''); expect(readAiApiKey()).toBe('key-1');
  });
  it('uses raw theme and first-visit values with legacy fallback', () => {
    expect(preferredTheme(localStorage, { matches: true })).toBe('dark');
    localStorage.setItem('lms-theme', 'invalid'); expect(preferredTheme(localStorage, { matches: false })).toBe('light');
    writeTheme('dark'); expect(localStorage.getItem('lms-theme')).toBe('dark');
    expect(isConfigFirstVisit()).toBe(true); markConfigFirstVisitSeen(); expect(localStorage.getItem('lms_config_first_visit_seen')).toBe('1');
  });
  it('reads exact unversioned legacy note serialization in both directions', () => {
    localStorage.setItem('studentNotes', '{"legacy-student":"Legacy note","numeric":7}');
    expect(readStudentNotes()).toEqual({ 'legacy-student': 'Legacy note' });
    expect(writeStudentNote('react-student', 'React note')).toEqual({ 'legacy-student': 'Legacy note', 'react-student': 'React note' });
    expect(localStorage.getItem('studentNotes')).toBe('{"legacy-student":"Legacy note","react-student":"React note"}');
  });
  it('contains the legacy malformed-notes exception and rewrites only after an explicit React edit', () => {
    localStorage.setItem('studentNotes', '{bad'); expect(readStudentNotes()).toEqual({}); expect(localStorage.getItem('studentNotes')).toBe('{bad');
    expect(writeStudentNote('student-1', 'note')).toEqual({ 'student-1': 'note' });
    expect(localStorage.getItem('studentNotes')).toBe('{"student-1":"note"}');
  });
  it('clears only obsolete auth token keys', () => {
    for (const key of ['lms_token','lms_token_expiry','lms_firebase_token','lms_email']) localStorage.setItem(key, 'x');
    clearObsoleteAuthStorage(); expect(localStorage.getItem('lms_token')).toBeNull(); expect(localStorage.getItem('lms_email')).toBe('x');
  });
});

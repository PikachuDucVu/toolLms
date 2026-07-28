# Implementation Plan

## Goal
Use the final name only when unique in the current session roster, and use middle name plus final name only for duplicate final names.

## Tasks
1. Update `tests/regularUi.test.ts` with unique-name, duplicate-name, case/whitespace, and one-component expectations.
2. Change `getStudentCallName()` in `public/js/index/assessments.js` to accept the current roster, normalize names, count matching final components, and choose one or two final components without mutating state.
3. Ensure `snapshotRegularStudent()` uses the roster-aware helper so both single and batch generation send the correct `student_call_name`.
4. Keep backend fallback and full-name Zalo labels unchanged.
5. Run Vitest, Node tests, TypeScript typecheck, JavaScript syntax checks, and `git diff --check`.
6. Commit and deploy with `bun run deploy`.

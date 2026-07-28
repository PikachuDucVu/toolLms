# Implementation Plan

## Goal
Decouple learning-level selection from AI generation, keep single-student generation on the requested student, accept valid L4 wording, summarize written homework evaluation without exposing homework scores, and use middle-name-plus-given-name inside comments while keeping full names in Zalo labels.

## Tasks

1. **Update frontend UI contract tests before changing the detail renderer**
   - File: `tests/regularUi.test.ts`
   - Replace the old one-click-generate and auto-advance expectations with assertions that L1–L4 call the save-only level handler, a dedicated per-student AI button exists, loading belongs to that AI button, and no next-student helper is used.
   - Add pure call-name examples for multi-part and one-part names.
   - Acceptance: Tests describe the approved behavior and fail against the current implementation.

2. **Separate level selection and generation in the regular student detail UI**
   - File: `public/js/index/assessments.js`
   - Add a final-two-name-components helper exposed through `app`.
   - Change L1–L4 controls to invoke `onRegularLearningLevelChange()` only; update copy and ARIA labels so they no longer promise generation.
   - Add a dedicated `gen-btn-<domId>` action for present students and retain it for absent students; label it `Tạo nhận xét AI`, `Tạo lại nhận xét`, or the absence-specific equivalent.
   - Keep selected-level indicators independent from generation busy state.
   - Acceptance: Clicking a level only autosaves; clicking the explicit AI button generates.

3. **Remove auto-advance and preserve selection during single generation**
   - File: `public/js/index/comments.js`
   - Remove the pending-next-student selector and `autoAdvance` option.
   - Simplify generation button lookup to the dedicated button.
   - Preserve `selectedRegularStudentId` and, when applicable, `regularReviewSelectedStudentId` before and after async renders.
   - Keep context guards and per-student keyed result storage.
   - Pass `student_call_name` in both single and batch generation requests.
   - Acceptance: A successful, failed, or repaired single generation remains on the requested student and writes only to that student's draft key.

4. **Pass written homework evaluation and omit scores**
   - File: `public/js/index/classes.js`
   - Return the homework submission `note` as evaluation text from `getPreviousHomeworkStatusForStudent()`.
   - Remove `score` from the comment-generation homework object.
   - Acceptance: Regular comment requests can include written homework evaluation but never receive homework score data.

5. **Extend backend facts for call names and homework evaluation**
   - Files: `src/routes/comments.ts`, `src/services/aiClient.ts`, `src/services/commentPrompt.ts`
   - Read `student_call_name`/`studentCallName` and pass it through generation.
   - Add a backward-compatible final-two-components fallback.
   - Replace normalized homework score storage with bounded evaluation text.
   - Prompt the model to summarize at most one homework-evaluation idea and explicitly prohibit numeric homework scores.
   - Ensure safe comments use the call name and never use homework scores.
   - Acceptance: Prompt facts contain the approved call name and optional evaluation note, with no score field in normalized facts.

6. **Broaden L4 semantics and reject homework-score output**
   - File: `src/services/commentPrompt.ts`
   - Expand L4 required-concept patterns for natural equivalents of strong understanding and independent application/completion.
   - Add narrowly scoped score-output validation for homework score phrases and ratios while allowing session numbers such as `BTVN buổi 3`.
   - File: `tests/commentPrompt.test.ts`
   - Add valid L4 variants, incomplete L4 negatives, homework evaluation prompt checks, legacy score omission, score-output rejection, session-number allowance, and call-name assertions.
   - Acceptance: Natural valid L4 comments pass; homework scores fail; existing safety rules still pass.

7. **Use full names before the Zalo colon**
   - File: `public/js/index/comments.js`
   - Change class-wide Zalo entries from the final name component to `studentName` before `:` while leaving the generated comment body untouched.
   - Add a source-level or helper-level regression assertion in `tests/regularUi.test.ts`.
   - Acceptance: Output follows `- Nguyễn Minh Anh: Minh Anh ...`.

8. **Run and repair the full verification suite**
   - Commands:
     - `npm run test:vitest`
     - `npm test`
     - `npm run typecheck`
     - `for f in public/js/index/*.js tests/*.js tests/*.mjs; do node --check "$f" || exit 1; done`
     - `git diff --check`
   - Fix only regressions caused by this change; do not modify the unrelated `hanoi-parks/` directory.
   - Acceptance: All commands pass and the diff is limited to the approved files, tests, and documentation.

## Files to Modify

- `public/js/index/assessments.js`
- `public/js/index/comments.js`
- `public/js/index/classes.js`
- `src/routes/comments.ts`
- `src/services/aiClient.ts`
- `src/services/commentPrompt.ts`
- `tests/regularUi.test.ts`
- `tests/commentPrompt.test.ts`

## Verification Risks

- Existing Vitest assertions intentionally encode the old one-click generation behavior and must be updated first.
- L4 regex expansion must remain semantic rather than accepting vague praise.
- Homework score validation must not mistake `BTVN buổi 3` for a numeric grade.
- Main-list and Review-drawer rendering share the same detail builder; selection preservation must cover both state variables.
- The untracked `hanoi-parks/` directory is unrelated and must remain untouched and uncommitted.

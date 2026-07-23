# Implementation Plan

## Goal
Add a regular-session “Review cả lớp” mode that shows all drafts in one editable table, reuses the current per-student detail/actions in a right-side panel, and supports explicit all-vs-filtered batch actions without duplicating comment or assessment state.

## Tasks
1. **Add review-mode state and reset rules**
   - File: `public/js/index/state.js`
   - Changes: Add `regularReviewMode`, `regularReviewSelectedStudentId`, `regularReviewSearch`, `regularReviewAlertFilter`, `regularReviewLevelFilter`, `regularReviewSort`, `regularReviewScrollTop`, `regularReviewFocusedStudentId`, `regularReviewSubmitScopeIds`, and a per-student `regularOperationErrors` map. Continue using `generatedComments`, `regularLearningLevelDrafts`, and `regularNoteDrafts` as the only content sources.
   - File: `public/js/index/classes.js`
   - Changes: Reset review mode, filters, panel selection, scroll, pending scope, and row errors when the selected class/slot changes.
   - File: `public/js/index/ui.js`
   - Changes: Reset the same state in `discardRegularWorkState()`; keep existing unsaved-work semantics because edited review text remains in `generatedComments`.
   - Acceptance: Switching slots/classes starts in normal detail mode; toggling review mode within one slot preserves all drafts and assessments.

2. **Create an isolated review module with pure selectors and warning helpers**
   - New File: `public/js/index/review.js`
   - Changes: Implement pure helpers for comment normalization, first-sentence/signature extraction, duplicate grouping, row warning derivation, review filtering, sorting, and submit-scope calculation. Use stripped, Vietnamese-normalized text; only flag duplicate signatures above a documented minimum length/word count and appearing for at least two students. Do not call AI or mutate comments during analysis.
   - Changes: Implement `getRegularReviewRows()` from `state.students` plus existing UI-state helpers; include attendance, L1–L4, draft/existing comment, character count, busy/error state, and warning labels.
   - Acceptance: Same input produces deterministic duplicate/filter/sort results; no backend/API change is required.

3. **Add mode entry/exit controls and explicit batch scope UI**
   - File: `public/index.html`
   - Changes: Add a `Review x nhận xét` button to `#defaultActionBar`, hidden/disabled when there are no regular-session drafts. Add menu/button hooks for `Chỉ gửi x mục đang lọc` and optionally `Tạo lại x mục đang lọc`; keep the primary LMS button explicitly labeled as all-draft scope.
   - File: `public/js/index/ui.js`
   - Changes: Extend `updateStats()` to update review-button visibility/count, all-submit label (`Gửi tất cả N nhận xét`), filtered-scope label/count, and disabled states. Ensure ordinary student filters never silently alter the all-submit scope.
   - File: `public/js/index/main.js`
   - Changes: Import `review.js` after `assessments.js`/`comments.js`, expose review handlers required by inline HTML, and extend Escape handling so an open review panel closes before leaving review mode.
   - Acceptance: Review opens without generating comments; primary and filtered actions always display their exact counts.

4. **Render the desktop review table and responsive card fallback**
   - New File: `public/js/index/review.js`
   - Changes: Implement `enterRegularReviewMode()`, `exitRegularReviewMode()`, `renderRegularReview()`, row builders, empty states, sticky toolbar/header, inline textarea, character count, warning text, row retry/action controls, and scroll/focus restoration.
   - File: `public/js/index/assessments.js`
   - Changes: In the regular branch of `renderStudents()`, dispatch to `renderRegularReview()` when `regularReviewMode` is active; otherwise preserve `renderRegularStudents()`. Extend assessment indicator refresh to update review-row level/status elements without forcing a full table rerender.
   - Changes: Give review textareas namespaced IDs such as `review-comment-<domId>` so they do not collide with `buildRegularStudentDetail()` IDs.
   - File: `public/css/index.css`
   - Changes: Add review workspace/table/row/textarea/warning/sticky toolbar styles, selected-row styling, drawer layout, operation/error states, focus-visible states, and responsive breakpoints. At desktop widths use a table/grid plus 360–420px drawer; below 900px switch to stacked cards and a full-width/overlay detail panel; avoid horizontal page scrolling.
   - Acceptance: All drafts can be read and edited in one scrolling surface; headers/actions stay visible; mobile layout remains usable without a forced wide table.

5. **Reuse the existing student detail renderer inside a review drawer**
   - New File: `public/js/index/review.js`
   - Changes: Implement `openRegularReviewDetail(studentId)`, `closeRegularReviewDetail()`, previous/next navigation, focus return, `aria-expanded`, `aria-controls`, and drawer rendering via the existing `buildRegularStudentDetail(att, idx)` output.
   - File: `public/js/index/assessments.js`
   - Changes: Make `buildRegularStudentDetail()` safe in both normal panel and review drawer contexts; retain the existing L1–L4 autosave, note templates, past-comment modal, current LMS comment, regenerate, submit-single, copy, and delete handlers. Avoid calling `syncRegularDetailPlacement()` for the review drawer.
   - File: `public/js/index/ui.js`
   - Changes: Extend `syncRegularOperationLock()` selectors to lock the active review row/drawer appropriately while not unnecessarily blocking unrelated rows.
   - Acceptance: Every existing per-student regular-session feature is reachable within two actions from a review row and acts on the same state as normal detail mode.

6. **Preserve inline edits, focus, and row state across async rerenders**
   - New File: `public/js/index/review.js`
   - Changes: Add `updateRegularReviewComment(studentId, textarea)` that calls the existing `updateComment()`, autosizes the textarea, updates count/warnings locally, and records focus/caret context. Add a render-state capture/restore helper for table scroll, selected row, active textarea, and drawer scroll.
   - File: `public/js/index/ui.js`
   - Changes: Allow `updateComment()` to notify `refreshRegularReviewRow()` when review mode is active, without full rerender on every keystroke.
   - File: `public/js/index/comments.js`
   - Changes: After generate/delete/submit rerenders, let the review renderer restore scroll/panel/focus. Store per-student generate/submit errors in `regularOperationErrors` and clear them on success/retry so only the affected row displays an error.
   - Acceptance: Typing is not interrupted; reopening/closing the drawer and successful/failed requests do not overwrite newer textarea content or jump the table to the top.

7. **Refactor generation to support filtered regeneration without duplicating request logic**
   - File: `public/js/index/comments.js`
   - Changes: Extract the shared per-student AI request from `generateSingle()` and `autoCommentAll()` into an internal helper that accepts a captured context, snapshot, model options, and attendance/homework data. Build a scoped batch runner used by both all-student generation and `regenerateRegularReviewFiltered()`; retain concurrency, assessment persistence, context checks, progress UI, and per-row failure capture.
   - New File: `public/js/index/review.js`
   - Changes: Resolve filtered student IDs from the review selector, show an explicit confirmation count, and invoke the scoped batch function. Exclude absent students unless the user invokes the existing individual action.
   - Acceptance: Regenerating filtered rows changes only those drafts; generation failures remain visible on their rows and other drafts are preserved.

8. **Refactor submit flow for explicit all vs filtered scopes**
   - File: `public/js/index/ui.js`
   - Changes: Change `showConfirmModal()` to accept/store an explicit student-ID scope and render the true count/list. Keep the normal all-submit path independent of visual filters.
   - File: `public/js/index/comments.js`
   - Changes: Update `submitAll(studentIds = null)` to build snapshots only from the explicit scope (or all present drafts when null), preserve out-of-scope drafts, keep summary submission semantics, log each result, and retain failed drafts. Do not derive scope from `state.filteredStudents` inside the submit function.
   - New File: `public/js/index/review.js`
   - Changes: Add handlers for all-draft and filtered-draft confirmation; filtered scope must be computed at click time and copied into `regularReviewSubmitScopeIds` so later filter changes cannot alter a confirmed operation.
   - File: `public/js/index/main.js`
   - Changes: Expose the scoped confirmation/submit handlers.
   - Acceptance: `Gửi tất cả N` always submits all present drafts; `Chỉ gửi M mục đang lọc` submits exactly the confirmed IDs; failures retain drafts and do not remove unrelated comments.

9. **Add keyboard and accessibility behavior**
   - New File: `public/js/index/review.js`
   - Changes: Add review-specific keyboard handling: Escape closes drawer, arrow navigation changes rows only when focus is not inside an editable control, and Ctrl/Cmd+Enter synchronizes the active textarea to state and reports “Đã cập nhật bản nháp” (not “saved to server”). Return focus to the opening row button after drawer close.
   - File: `public/index.html`
   - Changes: Add accessible labels for review entry/batch controls; reuse the existing live toast region.
   - File: `public/css/index.css`
   - Changes: Ensure visible focus, non-color warning icons/text, sufficient contrast, 44px mobile targets, and reduced-motion-safe drawer transitions.
   - Acceptance: Keyboard-only users can enter review, edit rows, open/close the drawer, navigate actions, and understand warning/error states through text and ARIA.

10. **Add automated tests and manual regression coverage**
   - New File: `tests/review.test.js`
   - Changes: Unit-test normalization/signature grouping, duplicate thresholds, content/name search, level/alert filters, sort order, all-vs-filtered scope calculation, exclusion of absent/no-draft students, and state preservation helpers. Mock minimal DOM/state following `tests/assessments.test.js`.
   - File: `tests/assessments.test.js`
   - Changes: Extend reset fixtures with review-state defaults and add a regression that assessment autosave updates review-row indicators without changing generated drafts.
   - Optional File: `tests/comments.test.js`
   - Changes: If the submit/generation refactor exposes pure scope/snapshot builders, test partial failure preservation and explicit scoped IDs separately from DOM rendering.
   - Acceptance: Existing autosave tests and new review selector/scope tests pass; manual testing covers desktop drawer, mobile fallback, focus restoration, async row errors, and both submit scopes.

## Files to Modify
- `public/index.html` - review entry and explicit scoped batch controls.
- `public/css/index.css` - table, drawer, sticky actions, warnings, responsive and accessibility styling.
- `public/js/index/state.js` - review UI/filter/scope/error state.
- `public/js/index/assessments.js` - render dispatch, shared detail reuse, assessment indicator integration.
- `public/js/index/comments.js` - reusable scoped generation/submission and per-row errors.
- `public/js/index/ui.js` - stats/buttons, confirmation scopes, comment-update notification, reset/lock behavior.
- `public/js/index/classes.js` - review state reset on class/slot changes.
- `public/js/index/main.js` - module import, globals, keyboard/close wiring.
- `tests/assessments.test.js` - review-aware assessment regression fixtures/tests.

## New Files
- `public/js/index/review.js` - review selectors, warning analysis, rendering, drawer, filters, keyboard and scoped-action handlers.
- `tests/review.test.js` - deterministic review/filter/duplicate/scope tests.
- `tests/comments.test.js` - optional only if scoped batch helpers are made independently testable.

## Dependencies
- Tasks 2–3 depend on Task 1 state definitions.
- Task 4 depends on Tasks 2–3 and must land before drawer integration.
- Task 5 depends on Task 4 and existing `buildRegularStudentDetail()` behavior.
- Task 6 depends on Tasks 4–5 and should precede async batch refactors to prevent focus regressions.
- Tasks 7 and 8 depend on the selector/scope helpers from Task 2.
- Task 9 depends on the final table/drawer DOM from Tasks 4–5.
- Task 10 follows the pure helpers and batch refactors, but tests should be added incrementally with each helper.

## Verification Commands
1. `npm test`
2. `npm run typecheck`
3. `for f in public/js/index/*.js tests/*.js tests/*.mjs; do node --check "$f" || exit 1; done`
4. `git diff --check`
5. `npm run dev` and manually verify a regular class/slot at desktop widths (1440/1024), tablet (768), and mobile (320–390).

## Risks
- **High:** `submitAll()` currently derives its scope directly from all `generatedComments`; filtered submission must use an immutable explicit ID list or filter changes can submit the wrong students.
- **High:** Normal detail markup uses fixed IDs (`regularStudentDetail`, `comment-<domId>`, `gen-btn-<domId>`). Review rows must use namespaced IDs, and only one shared detail panel may exist, or handlers will target the wrong element.
- **High:** Existing generate/submit functions call `renderStudents()` after async work. Without scroll/focus capture, review editing will jump or overwrite DOM state.
- **Medium:** The existing operation lock is effectively global. The spec requests row-level errors/locking, so refactoring must preserve protection against conflicting LMS operations while avoiding misleading “only this row is busy” UI.
- **Medium:** “Duplicate” needs a conservative documented threshold to avoid noisy warnings on expected phrases such as attendance openings. Start with long normalized first-sentence signatures and test Vietnamese punctuation/HTML stripping.
- **Medium:** Ctrl/Cmd+Enter cannot truthfully mean server persistence because comment drafts are client state until LMS submission; UI copy should say “Đã cập nhật bản nháp”.
- **Medium:** Reusing `buildRegularStudentDetail()` in a drawer may require contextual wrapper classes/selectors rather than duplicating the large template.
- **Low:** No virtualization is needed for normal class sizes (roughly 15–30); adding it would complicate textarea focus and autosizing unnecessarily.

## Review Findings
- **blocker:** `public/js/index/comments.js` / `public/js/index/ui.js` - filtered submit cannot be implemented by reusing current visual filters implicitly; the scope must be explicit and frozen at confirmation time.
- **high:** `public/js/index/assessments.js` - current detail IDs and `syncRegularDetailPlacement()` assume one split-view panel, so review drawer integration must avoid duplicate IDs and placement calls.
- **high:** `public/js/index/comments.js` - async generation/submission rerenders the full student list; review mode needs restoration hooks before those actions are exposed.
- **medium:** `public/js/index/ui.js` - `updateComment()` mutates state but does not update character/warning metadata; review mode needs a local row refresh rather than a full rerender.
- **medium:** Current tests cover assessment inheritance/autosave only; review selectors, duplicate warnings, and scoped batch semantics need dedicated coverage.

```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "The plan names exact files and current functions, identifies blocker/high/medium findings, defines ordered implementation tasks, verification commands, and residual risks."
    }
  ],
  "changedFiles": [
    ".pi-subagents/artifacts/outputs/0913033a/plan.md"
  ],
  "testsAddedOrUpdated": [],
  "commandsRun": [],
  "validationOutput": [
    "Read-only inspection of the approved spec and current frontend state, rendering, filtering, batch generation/submission, action-bar, responsive CSS, and existing tests."
  ],
  "residualRisks": [
    "Duplicate-warning threshold requires conservative implementation and product validation against real Vietnamese comments.",
    "Global operation locking may limit true per-row concurrency even after row-specific status UI is added.",
    "Ctrl/Cmd+Enter must not imply server persistence for local comment drafts."
  ],
  "noStagedFiles": true,
  "diffSummary": "Planning artifact only; no project source files were modified.",
  "reviewFindings": [
    "blocker: public/js/index/comments.js and public/js/index/ui.js - freeze explicit student IDs for filtered submit scope.",
    "high: public/js/index/assessments.js - prevent duplicate DOM IDs and bypass normal split-view placement for the review drawer.",
    "high: public/js/index/comments.js - preserve review scroll/focus across full rerenders after async actions.",
    "medium: tests - add dedicated duplicate/filter/scope coverage."
  ],
  "manualNotes": "Recommended architecture is a new review.js module with pure selectors plus thin integration changes to existing assessment/comment handlers; no backend/API change is needed."
}
```

## Modal conversion amendment

The approved follow-up changes the mounted review workspace into a modal shell without changing its table, drawer, filters, scope logic, or shared draft state.

1. Add a persistent modal host to `public/index.html` with backdrop, dialog semantics, title linkage, and close control.
2. Keep the normal student list rendered behind the modal; `renderStudents()` must no longer replace `#studentList` when review opens.
3. Render `renderRegularReview()` into the modal body, with `96vw × 92vh` desktop sizing and full-screen mobile sizing.
4. Lock background scrolling while open, trap focus inside the modal, and return focus to `#reviewAllBtn` when closed.
5. Preserve existing review filters, selected student, table scroll, drawer scroll, scoped operations, and warnings across close/reopen.
6. Handle `Esc` hierarchically: close drawer first, then close modal.
7. Ensure existing confirmation/past-comment dialogs render above the review modal and do not get clipped by its overflow.
8. Add tests for modal open/close state and focus/scroll preservation; run the existing review and assessment suites unchanged.

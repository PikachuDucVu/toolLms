# Comment Generation Corrections Design

**Date:** 2026-07-28  
**Status:** Approved for planning  
**Scope:** Regular-session comment generation, learning-level controls, homework context, student naming, and regression coverage

## 1. Goals

Correct the following regular-session behaviors without changing Checkpoint or Final/Demo workflows:

1. Selecting a learning level must save the assessment but must not generate an AI comment.
2. Each student must have a separate button for generating or regenerating an AI comment.
3. A single-student generation must keep the same student selected instead of advancing to another student.
4. Valid L4 comments must not be rejected and replaced by the safe default template merely because they use natural equivalent wording.
5. Homework context must summarize the grader's written evaluation when available and must never add the homework score to the parent-facing comment.
6. The comment body must address a student using the last two name components (middle name plus given name), while the class-wide Zalo copy must show the student's full name before the colon.

## 2. Non-goals

- No redesign of Checkpoint grading, Demo scoring, authentication, LMS submission payloads, or homework grading.
- No automatic generation when changing one student's level or the whole class's level.
- No automatic movement to the next pending student after a single generation.
- No broad refactor of the frontend module structure.
- No change to the LMS comment format that would add a full-name prefix to each stored comment.

## 3. User Experience

### 3.1 Learning-level controls

The L1–L4 controls in the regular student detail view become assessment-only controls.

When a teacher selects a level, the application will:

1. Update the local learning-level draft.
2. Refresh the selected level and status indicators.
3. Queue the existing learning-level autosave.
4. Leave any existing AI draft unchanged.
5. Make no AI request.

The fieldset copy will no longer say that choosing a level generates immediately. It will describe the control as selecting the student's level of understanding.

The review table's level selector will retain the same save-only behavior. The detail drawer inside Review mode will use the same revised assessment-only controls as the main student detail view.

### 3.2 Separate AI action

Every regular-session student detail view will include an explicit AI action:

- `Tạo nhận xét AI` when the student has no generated draft.
- `Tạo lại nhận xét` when a generated draft already exists.

Regeneration will retain the current overwrite confirmation. The action will use the latest selected learning level, saved note, attendance status, lesson summary, homework context, and AI configuration.

Absent students will continue to use the absence-specific comment flow, but through the same explicit generation action. They will not receive a learning-level assessment.

### 3.3 Stable student selection

A single-student generation will never intentionally advance to another student.

The application will preserve:

- `selectedRegularStudentId` in the normal regular-session workspace.
- `regularReviewSelectedStudentId` when a Review drawer is open.

The response will always be written to `generatedComments[requestedStudentId]`. If the class, slot, or assessment context changes while the request is running, the stale response will be ignored using the existing context checks.

Batch generation remains a class-wide operation and does not gain any single-student auto-advance behavior.

## 4. AI Comment Data Model

### 4.1 Student call name

The frontend will derive a `studentCallName` from the full LMS name:

- Split the trimmed full name on whitespace.
- If at least two components exist, use the final two components.
- If only one component exists, use that component.

Examples:

| Full LMS name | Comment call name |
| --- | --- |
| Nguyễn Minh Anh | Minh Anh |
| Trần Gia Huy | Gia Huy |
| Lê An | Lê An |
| Bin | Bin |

The generation request will carry both values:

- `student_name`: the full LMS name.
- `student_call_name`: the middle-name-plus-given-name form used in the comment body.

The backend will add the call name to `CommentPromptInput` and `CommentFacts`. For backward compatibility, if `student_call_name` is absent, the backend will derive the same final-two-components form from `student_name`.

The system and user prompts will instruct the model to use `studentCallName` when addressing the student. Safe-template comments will also use this value.

### 4.2 Zalo labeling

The class-wide Zalo formatter will use the full LMS name before the colon:

```text
- Nguyễn Minh Anh: Minh Anh đi học đúng giờ...
```

The stored LMS comment will remain only the comment paragraph and will not receive a full-name prefix. The individual Zalo copy already identifies the student separately and will continue to use the full LMS name in that label.

## 5. Homework Context

### 5.1 Frontend extraction

`getPreviousHomeworkStatusForStudent()` will continue to identify the relevant previous-session lesson and submission. Its returned structured context will include the submission's written `note` as the homework evaluation text.

The numeric `score` will not be included in the comment-generation request. Other internal homework grading screens may continue to use scores; only the regular comment-generation context is affected.

### 5.2 Backend normalization

The normalized homework facts will contain:

- Whether the homework was submitted.
- Whether it was marked.
- The previous-session label.
- A bounded, trimmed evaluation summary source from the submission note.

They will not contain a numeric score.

### 5.3 Prompt behavior

When homework was not submitted, the prompt may ask for a short reminder to complete it.

When homework was submitted and an evaluation note exists, the prompt will:

- Provide the written evaluation as source data.
- Ask the model to summarize at most one short homework-related idea.
- Explicitly prohibit mentioning a numeric homework score.

When homework was submitted without an evaluation note, the model may only state that the homework was submitted or recorded. It must not invent quality, completion details, or a score.

SPCK sessions will continue to suppress homework context through the existing rule.

### 5.4 Validation and safe fallback

The validator will reject explicit homework-score wording such as:

- `BTVN được 90 điểm`
- `đạt 8/10`
- `điểm BTVN là ...`

Session references such as `BTVN buổi 3` remain valid.

Safe-template output will never mention a homework score. It may retain the existing missing-homework reminder when structured data says the work was not submitted.

## 6. L4 Validation Correction

The L4 policy will continue to require both semantic ideas:

1. The student understands the knowledge thoroughly.
2. The student can apply it or complete practice independently.

The validator will accept broader natural equivalents, including wording that communicates:

- `nắm vững`, `nắm chắc`, or `hiểu rõ` the knowledge/content.
- `tự vận dụng`, `vận dụng ... độc lập`, `tự mình hoàn thành`, `hoàn thành ... không cần hỗ trợ`, or equivalent independent-practice meaning.

This broadening is limited to L4 semantics. It will not allow L1–L3 wording, vague phrases such as `học ổn`, or comments missing independent application.

The existing generation sequence remains:

1. Validate the initial AI response.
2. Ask the AI to repair an invalid response.
3. Use the safe template only if the repaired response is still invalid or the repair request fails.

The correction reduces false rejections rather than bypassing validation.

## 7. Component Changes

### Frontend

- `public/js/index/assessments.js`
  - Convert detail-view level controls to save-only actions.
  - Update instructional copy and accessibility labels.
  - Add the explicit generate/regenerate button for present students.
  - Retain the explicit absence-generation button.
- `public/js/index/comments.js`
  - Remove single-student auto-advance behavior.
  - Preserve main-list and Review-drawer selection around generation renders.
  - Send `student_call_name` and homework evaluation context.
  - Use full names before colons in class-wide Zalo output.
- `public/js/index/classes.js`
  - Add homework evaluation note to structured homework status.
  - Stop exposing the homework score to comment generation.
- A small shared frontend helper, placed in the existing index modules, will derive the final-two-components call name.

### Backend

- `src/routes/comments.ts`
  - Read and pass `student_call_name` with a compatible fallback.
- `src/services/commentPrompt.ts`
  - Add call-name facts and prompt instructions.
  - Normalize homework evaluation text without score data.
  - Add the no-homework-score rule.
  - Broaden L4 semantic patterns.
- `src/services/aiClient.ts`
  - Extend the generation input type with the call name and updated homework shape.

No database migration is required.

## 8. Error Handling and Concurrency

- Level autosave errors continue to use the current per-student status and toast behavior.
- Generation waits for the student's pending level autosave before snapshotting and persisting the assessment.
- A generation response is accepted only if its captured class, slot, and assessment epoch are still current.
- A failure leaves the current student selected and leaves an existing draft intact.
- Regeneration only replaces the existing draft after a successful generation response.
- Per-student busy state continues to prevent conflicting regular-session operations.

## 9. Test Plan

### Frontend regression tests

1. Selecting a detail-view level calls the learning-level change/autosave path and does not call generation.
2. Present and absent students expose a dedicated generation action with the correct label.
3. Generating or regenerating one student keeps `selectedRegularStudentId` unchanged.
4. Generating from an open Review drawer keeps `regularReviewSelectedStudentId` unchanged.
5. The response is stored under the requested student ID.
6. The call-name helper returns the final two name components and handles one-component names.
7. Class-wide Zalo text uses the full name before `:`.
8. Review-table level selection remains save-only.

### Backend prompt and validation tests

1. Common valid L4 phrasings pass validation.
2. L4 comments without independent application still fail.
3. Content belonging to another learning level still fails L4 validation.
4. Homework evaluation notes appear in prompt facts.
5. Homework scores are absent from prompt messages even if a legacy input contains `score`.
6. Explicit homework-score wording fails validation.
7. `BTVN buổi N` remains valid.
8. Prompt and safe-template output use `studentCallName` rather than only the final name component.
9. Existing absence, SPCK, behavior, sentence-length, and unsupported-homework tests continue to pass.

### Verification commands

```bash
npm test
npm run test:vitest
npm run typecheck
```

## 10. Acceptance Criteria

The work is complete when:

- Clicking any L1–L4 option never starts AI generation.
- A separate per-student AI button generates using the selected level.
- Single-student generation never selects another student.
- Natural, semantically correct L4 responses are retained instead of unnecessarily falling back to the safe template.
- Homework evaluation notes can be summarized, while homework scores never appear in the prompt-derived parent comment.
- Comment bodies use the final two name components.
- Class-wide Zalo entries use full LMS names before the colon.
- Existing regular, Review, Checkpoint, and Demo tests pass, together with the new regression tests.

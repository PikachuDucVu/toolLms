# Kế hoạch triển khai migration React TypeScript + Tailwind

**Design:** `docs/superpowers/specs/2026-07-28-react-typescript-tailwind-migration-design.md`  
**Trạng thái:** Draft implementation plan — chỉ thực thi sau khi người dùng duyệt  
**Mục tiêu one-shot mặc định:** Hoàn thành code, local migrations, tests, build artifacts và runbook cho bản React chạy song song tại `/new` và `/new/homework`. Preview deploy/migration chỉ chạy khi có credentials và explicit approval; production cutover và legacy cleanup luôn là lệnh riêng.

## 1. Nguyên tắc thực thi one-shot

Một lần triển khai vẫn phải đi tuần tự qua các gate sau:

1. Tạo baseline và characterization tests trước khi sửa behavior.
2. Mỗi phase có commit/checkpoint riêng.
3. Không sang phase sau nếu gate hiện tại có test/build blocker.
4. Legacy `/`, `/homework`, `/api/*`, `public/js/*` và `public/css/*` được xem là frozen reference cho tới cleanup phase.
5. Mọi backend refactor phải giữ legacy adapter hoạt động.
6. Không deploy production, flip `UI_DEFAULT`, chạy remote D1 migration hoặc thực hiện real LMS mutation nếu người dùng chưa yêu cầu rõ.
7. Nếu gặp contract LMS không thể xác định từ code/fixture, dừng và báo blocker thay vì đoán payload.

## 2. Phase tổng quan

| Phase | Nội dung | Complexity | Gate chính |
| --- | --- | --- | --- |
| 0 | Baseline, fixture, Playwright legacy parity | Cao | Legacy browser scenarios ổn định |
| 1 | Workspace React/Vite/Tailwind + dual routing | Trung bình | Route matrix và build pass |
| 2 | Shared contracts + v2 foundation + security baseline | Cao | Contract tests, legacy tests pass |
| 3 | App shell, auth, config, design primitives | Trung bình | Visual/component parity shell |
| 4 | Homework backend + React page | Cao | Full homework parity |
| 5 | Class/session/student shell | Cao | Read-only comment page parity |
| 6 | Assessments/autosave | Rất cao | Race/inheritance tests pass |
| 7 | Comment generation/submission | Rất cao | Golden payload + mutation parity |
| 8 | Review mode | Cao | Existing review contract được port |
| 9 | Demo + Checkpoint | Rất cao | Score/payload/status parity |
| 10 | Cross-cutting hardening, performance, accessibility | Cao | Full local suite pass |
| 11 | Preview parallel release validation — operational, opt-in | Cao | Preview/rollback report pass |
| 12 | Cutover | Operation riêng | Explicit approval |
| 13 | Legacy cleanup | Release riêng | Stabilization + no legacy traffic |

## 3. Phase 0 — Khóa baseline và parity contract

### Mục tiêu

Tạo một oracle có thể chạy lại để biết React có giữ đúng behavior/UI hiện tại hay không.

### Công việc

1. Cài browser-test tooling sớm:
   - Playwright.
   - `@axe-core/playwright` nếu không làm thay đổi runtime bundle.
2. Tạo:
   - `playwright.config.ts`.
   - `tests/e2e/fixtures/`.
   - `tests/e2e/helpers/legacyHarness.ts`.
   - `tests/e2e/legacy-auth.spec.ts`.
   - `tests/e2e/legacy-homework.spec.ts`.
   - `tests/e2e/legacy-comments.spec.ts`.
   - `tests/e2e/legacy-assessments.spec.ts`.
   - `tests/e2e/legacy-review.spec.ts`.
   - `tests/e2e/legacy-demo-checkpoint.spec.ts`.
   - `tests/e2e/legacy-visual.spec.ts`.
3. Intercept network và cung cấp fixture anonymized cho:
   - `/api/auth/me`.
   - `/api/config`.
   - `/api/ai/models`.
   - `/api/classes` và `/api/class/:id` hoặc `/api/lms/graphql` tương ứng.
   - `/api/assessments/*`.
   - `/api/generate_comment`.
   - `/api/generate_checkpoint_comment`.
   - `/api/homework/*`.
   - External AI/checkpoint calls legacy.
4. Capture golden request cho:
   - Login/config.
   - Assessment save và learning-level autosave.
   - Comment generation single/batch.
   - Session summary.
   - Regular comment submit.
   - Demo submit.
   - Checkpoint score/full submit.
   - Homework mark, batch mark, AI grade và batch job.
5. Capture visual baseline ở:
   - 375×812.
   - 768×1024.
   - 1440×900.
   - Light/dark.
6. Freeze behavior hiện tại, bao gồm các behavior không lý tưởng:
   - Homework không có unload guard.
   - Assessment last-write-wins.
   - LocalStorage raw encoding.
   - Retry behavior hiện tại.

### Files thay đổi/thêm

- `package.json`, `package-lock.json`.
- `playwright.config.ts`.
- `tests/e2e/**`.
- `docs/react-migration-parity-matrix.md`.

### Gate

```bash
npm ci
npm run typecheck
npm test
npm run test:vitest
npm run test:e2e -- --grep legacy
```

Không bắt đầu scaffold React nếu baseline legacy chưa chạy deterministic.

### Rollback

Chỉ xóa tooling/test artifacts; runtime chưa thay đổi.

## 4. Phase 1 — Workspace, Vite, React, Tailwind và routing song song

### Mục tiêu

Có React SPA rỗng chạy được tại `/new` và `/new/homework` mà không ảnh hưởng legacy.

### Công việc

1. Chuyển root thành npm workspace:

```json
{
  "workspaces": ["frontend", "packages/contracts"]
}
```

2. Tạo `frontend/package.json` và thêm runtime dependencies:
   - `react`, `react-dom`.
   - `react-router-dom`.
   - `@tanstack/react-query`.
   - `zustand`.
   - `react-hook-form`, `@hookform/resolvers`, `zod`.
   - `lucide-react`.
   - `clsx`, `tailwind-merge`, `class-variance-authority`.
   - Radix primitives cần thiết cho dialog/menu, chỉ thêm theo use case thật.
3. Thêm dev dependencies:
   - `vite`, `@vitejs/plugin-react`.
   - Tailwind CSS v4 Vite integration.
   - TypeScript browser config.
   - Vitest, jsdom, Testing Library, user-event, MSW.
4. Tạo cấu trúc app tối thiểu:
   - `frontend/index.html`.
   - `frontend/vite.config.ts`.
   - `frontend/tsconfig.json`.
   - `frontend/src/main.tsx`.
   - `frontend/src/app/App.tsx`.
   - `frontend/src/app/router.tsx`.
   - `frontend/src/app/providers.tsx`.
   - `frontend/src/lib/runtimeRoutes.ts`.
5. Vite/router config:
   - Vite `base: "/new/"` chỉ dùng cho asset URL.
   - `outDir: ../public/new`.
   - `emptyOutDir` chỉ tác động `public/new`.
   - Dev proxy `/api` tới Wrangler port cố định.
   - React Router không dùng static basename; đăng ký explicit route families `/new`, `/new/homework`, `/`, `/homework` và derive runtime mode từ family đang match.
6. Root scripts phải là aggregator rõ ràng:
   - `dev:worker`, `dev:frontend`, `dev:full`.
   - `typecheck:backend`, `typecheck:contracts`, `typecheck:frontend`, `typecheck`.
   - `test:node`, `test:backend`, `test:frontend`, `test:e2e`.
   - `build:frontend`.
   - `verify` = typecheck + Node tests + backend Vitest + frontend Vitest + frontend build + Playwright.
   - `preview:worker`.
   - `deploy` phải build frontend và assert `public/new/index.html` cùng referenced hashed assets tồn tại trước Wrangler.
   - Giữ `npm test` và `npm run test:vitest` tương thích với command hiện tại.
7. Sửa `src/router.ts`:
   - Explicit document routes cho `/new*` đã duyệt.
   - Không chặn `/new/assets/*`.
   - Unknown `/api/*` vẫn JSON 404.
8. Thêm route tests và script kiểm tra build artifact tồn tại trước deploy.
9. `.gitignore`:
   - `public/new/` nếu CI/deploy luôn build lại.
   - Playwright report, screenshots diff output và test results.

### Files chính

- `package.json`, `package-lock.json`, `.gitignore`.
- `frontend/**`.
- `src/router.ts`.
- `tests/spaRouting.test.ts`.

### Gate

```bash
npm ci
npm run build:frontend
npm run typecheck
npm test
npm run test:vitest
npm run test:frontend
```

Route smoke:

```text
/                     legacy HTML
/homework             legacy HTML
/new                  React HTML
/new/                 React HTML
/new/homework         React HTML
/new/homework/        React HTML
/new/assets/*         correct JS/CSS content type
/api/not-real         JSON 404
```

### Rollback

Revert `/new` routes và workspace/scaffold; legacy không bị chạm.

## 5. Phase 2 — Shared contracts, v2 foundation và migration infrastructure

### Mục tiêu

Tạo typed network boundary dùng chung và service adapter pattern trước khi port feature.

### Công việc contracts

1. Tạo package `@tool-lms/contracts`:

```text
packages/contracts/src/
├── common.ts
├── auth.ts
├── config.ts
├── classes.ts
├── homework.ts
├── assessments.ts
├── comments.ts
├── checkpoint.ts
└── index.ts
```

2. Định nghĩa:
   - Error envelope.
   - Request ID.
   - ID/string length constraints.
   - DTO cho class, slot, student attendance, comment area, assessment, homework, grading job.
   - Request/response schema cho endpoint được dùng trong phase kế tiếp.
3. Không import `Env`, D1, Hono hoặc React trong contracts package.

### Công việc backend foundation

1. Tạo:
   - `src/routes/v2/index.ts`.
   - `src/routes/v2/helpers.ts`.
   - `src/middleware/requestContext.ts`.
   - `src/middleware/v2Security.ts`.
2. Mount `/api/v2` song song `/api`.
3. Chuẩn hóa:
   - Zod input parsing.
   - `AUTH_REQUIRED`, `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `UPSTREAM_ERROR`, `API_KEY_REQUIRED`, `INTERNAL_ERROR`.
   - Request ID trong response/error.
   - Không thêm `OUTCOME_UNKNOWN` UI/contract trong parity phase; uncertain-write reconciliation thuộc post-parity hardening.
4. Security áp dụng ngay khi route được thêm:
   - Session/owner checks.
   - Same-origin mutation checks.
   - Body/batch length limits.
   - Secret/PII redaction.
   - Public-safe config projection.
5. Tạo service extraction pattern:
   - Service trả domain result.
   - Legacy route map domain result về response cũ.
   - V2 route map domain result về contract mới.

### D1 migrations

1. Trước khi sửa snapshot, lưu schema pre-owner hiện tại tại `tests/fixtures/db/pre-owner-schema.sql`.
2. Tạo Wrangler migrations:
   - `migrations/0000_baseline.sql`.
   - `migrations/0001_grading_job_owner.sql`.
3. Thêm nullable `owner_email` cho `grading_jobs`.
4. V2-created jobs bắt buộc owner; ownerless legacy jobs không accessible qua v2.
5. Cập nhật `src/db/schema.sql` thành final snapshot sau khi fixture pre-owner đã được khóa.
6. Đổi scripts:
   - `db:init:local` nếu vẫn cần snapshot initialization.
   - `db:migrate:local` dùng `wrangler d1 migrations apply ... --local`.
   - `db:migrate:remote` dùng `wrangler d1 migrations apply ... --remote` và không chạy tự động trong one-shot local implementation.
7. Migration tests dùng hai temporary D1 persistence directories độc lập:
   - Empty DB → apply `0000` + `0001`.
   - Seed pre-owner fixture → apply ordered migrations.
   - Assert columns/index bằng schema introspection.
8. Trong rollback window, freeze top-level queue message shape hiện tại; chỉ thêm optional additive field như `version`. Test cả new-consumer/legacy-message và new-producer/frozen-legacy-decoder.

### Frontend API client

Tạo:

- `frontend/src/lib/apiClient.ts`.
- `frontend/src/lib/apiError.ts`.
- `frontend/src/lib/operationContext.ts`.

Yêu cầu:

- Same-origin cookies.
- AbortSignal.
- Parse contract ở boundary.
- Không log body nhạy cảm.
- Mutation mặc định retry `false`.
- Trả request ID cho UI error.

### Gate

```bash
npm run db:migrate:local
npm run typecheck
npm test
npm run test:vitest
npm run test:frontend
```

Thêm `tests/v2/foundation.test.ts`, migration/schema assertions và queue compatibility tests.

### Rollback

Unmount `/api/v2`. Schema additive giữ nguyên, không cần down migration.

## 6. Phase 3 — Shared app shell, auth, config và design primitives

### Mục tiêu

Port phần dùng chung trước feature pages và giữ visual parity.

### Backend

1. Extract/reuse service cho:
   - Session check/login/logout.
   - Public-safe config.
   - AI model catalog.
2. Tạo thin v2 adapters:
   - `src/routes/v2/auth.ts`.
   - `src/routes/v2/config.ts`.
3. Legacy route response không đổi.

### Frontend

1. Tạo providers:
   - QueryClientProvider.
   - Theme provider.
   - Confirm/Dialog provider nếu cần.
   - Toast region.
   - Auth boundary coordinator.
2. Auth coordinator khi principal đổi phải chạy đúng thứ tự:
   - Increment `authEpoch` trước.
   - Abort operation-controller registry, grading polling và generation controllers do app sở hữu.
   - `queryClient.cancelQueries()`.
   - Clear Query cache và Mutation cache.
   - Reset registered workflow stores.
   - Mọi mutation callback kiểm tra captured epoch trước khi ghi state; không dựa vào một API “cancel all mutations” không tồn tại.
3. Tạo exact-encoding persistence adapter:
   - `frontend/src/lib/persistence.ts`.
   - Golden tests legacy ↔ React cho read/write/remove/default semantics.
   - Remember-login off xóa cả email/password; API key chỉ ghi khi non-empty và không tự xóa key cũ khi input rỗng; auth reset dọn `lms_token`, `lms_token_expiry`, `lms_firebase_token`.
4. Port tokens và primitives:
   - Button, IconButton.
   - Input, Textarea, Select, Checkbox.
   - Card, Badge, StatusDot.
   - Skeleton, EmptyState, ErrorState.
   - Dialog/AlertDialog.
   - Toast.
   - Header/Nav/ThemeToggle.
5. Port login/config panel bằng RHF + Zod.
6. Tạo ErrorBoundary và request-ID error view.
7. Không thêm behavior mới như URL-persisted config hoặc credential-format migration.

### Files chính

- `src/routes/v2/auth.ts`, `config.ts`.
- `frontend/src/app/**`.
- `frontend/src/components/ui/**`.
- `frontend/src/components/layout/**`.
- `frontend/src/features/auth/**`.
- `frontend/src/features/configuration/**`.
- `frontend/src/styles/**`.

### Gate

- Component tests login success/failure/session expiry.
- Theme persistence and storage event tests.
- Confirm focus return/Escape/backdrop tests.
- Visual comparison header/config/login states at all target viewports/themes.
- Existing legacy tests remain green.

## 7. Phase 4 — Homework backend và React page

### Mục tiêu

Migrate feature nhỏ hơn trước để chứng minh architecture và deploy seam.

### Backend

1. Extract phần class-list dùng chung từ `src/routes/classes.ts` vào `src/services/classService.ts` và thêm `GET /api/v2/classes`; Phase 4 cần endpoint này để homework có class selector độc lập. Class-detail DTO đầy đủ cho comments workspace vẫn ở Phase 5.
2. Extract normalized homework service từ `src/routes/homework.ts` và `src/services/homeworkService.ts`.
3. Tạo `src/routes/v2/homework.ts` cho:
   - Load homework by class.
   - Download URL/cache có auth/ownership phù hợp.
   - Individual mark.
   - Batch mark.
   - AI grade.
   - Create/read/cancel/retry job.
4. Grading job:
   - Ghi `owner_email` cho v2 job.
   - Read/cancel/retry phải match current principal.
   - Job retry vẫn nhận sanitized original payload từ React memory.
   - Trước mọi D1 update hoặc queue send, resolve server-key availability và validate supplied ephemeral key.
   - Nếu thiếu key, trả `API_KEY_REQUIRED` mà job/item state không đổi; React gửi lại cùng frozen non-secret retry scope với key.
   - Không persist API key trong D1.
5. Queue producer giữ nguyên required top-level fields để immediately previous consumer vẫn đọc được; new consumer hỗ trợ legacy message và optional additive `version`.
6. Response status/job fields được normalize qua contracts.

### Frontend

Tạo feature:

```text
frontend/src/features/homework/
├── api.ts
├── queries.ts
├── store.ts
├── selectors.ts
├── HomeworkPage.tsx
├── HomeworkConfig.tsx
├── HomeworkFilters.tsx
├── SubmissionTable.tsx
├── SubmissionRow.tsx
├── BatchActions.tsx
├── AiGradeDialog.tsx
├── GradingJobProgress.tsx
└── useGradingJob.ts
```

Behavior cần giữ:

- Session bar và redirect/return path đúng runtime mode.
- Class/lesson/status filters ở local workflow state, không URL trong parity.
- Score/note controlled drafts không mất khi filter/render.
- Selection clear đúng thời điểm legacy.
- Stats và button enabled state giống legacy.
- Individual/manual/batch mark.
- Individual AI grade.
- Batch job polling 3 giây như hiện tại.
- Partial failure, cancel, retry.
- Không thêm homework unload guard.
- Polling bị abort khi route unmount/auth context đổi.

### Test

- Unit selectors/store/draft retention.
- Component table/filter/selection.
- Job polling fake timers/stale job.
- API ownership/auth contract.
- Playwright paired legacy vs React homework scenarios.
- Visual snapshots desktop/mobile/light/dark.

### Gate

```bash
npm run typecheck
npm run test:node
npm run test:backend
npm run test:frontend
npm run build:frontend
npm run test:e2e -- --grep homework
```

Contract test bắt buộc: `API_KEY_REQUIRED` không update D1, không enqueue message và không đổi job/item status.

### Rollback

Ẩn/disable React homework route; legacy `/homework` không đổi.

## 8. Phase 5 — Comment page shell, classes, slots và students

### Mục tiêu

Port read-only navigation/data layer trước mutation-heavy workflow.

### Backend

1. Mở rộng `classService.ts` đã tạo ở Phase 4 và thêm v2 class-detail adapter cho comments workspace.
2. V2 class DTO chỉ trả fields React dùng nhưng giữ đủ:
   - Class metadata/status/course.
   - Course process/final/demo schema.
   - Slots/summary.
   - Student attendance/comments/areas.
3. Existing `/api/classes`, `/api/class/:id` và `/api/lms/graphql` legacy không đổi.

### Frontend

Tạo:

- `frontend/src/features/classes/api.ts`.
- `queries.ts`, `selectors.ts`.
- `ClassList.tsx`.
- `SessionSelector.tsx`.
- `StudentFilters.tsx`.
- `StudentList.tsx`.
- `StudentWorkspace.tsx`.
- `frontend/src/routes/CommentsRoute.tsx`.

Port:

- Class ordering running/recently-ended.
- Class selection/loading/refresh.
- Slot options/display number/auto-select latest behavior.
- Regular/demo/checkpoint mode detection.
- Student attendance, progress and search/filter.
- Stats bar.
- Session summary draft UI, chưa submit ở phase này nếu endpoint chưa có.
- Master-detail responsive layout.
- Local student notes theo exact `studentNotes` encoding.
- Empty/loading/error states và keyboard behavior hiện có.

State:

- Server entities ở Query.
- Selected class/slot/student ở feature-scoped store/local state, không URL trong parity.
- Derived filters/counts qua selectors.
- Context reset khi class/slot đổi.

### Gate

- Class service golden DTO tests.
- Component tests filters/counts/selection.
- Stale class request tests.
- Paired Playwright comment-shell scenarios.
- Visual parity screenshots.

### Rollback

React comments route hiển thị migration-unavailable; homework React vẫn dùng được.

## 9. Phase 6 — Assessments, inheritance và autosave

### Mục tiêu

Port workflow rủi ro cao nhất mà không đơn giản hóa concurrency semantics.

### Backend

1. Tạo `src/routes/v2/assessments.ts` dùng `assessmentService` hiện tại.
2. DTO phân biệt:
   - Current-slot assessment.
   - Inherited assessment.
   - `sourceSlotId`.
3. Giữ behavior:
   - Current slot wins.
   - Previous slot priority như hiện tại.
   - Chỉ kế thừa learning level; note inherited hiển thị rỗng.
   - Last-write-wins; không thêm revision conflict trong parity.

### Frontend

Tạo:

```text
frontend/src/features/assessments/
├── api.ts
├── queries.ts
├── assessmentStore.ts
├── autosaveController.ts
├── selectors.ts
├── StudentAssessmentList.tsx
├── StudentAssessmentDetail.tsx
├── LearningLevelControl.tsx
├── TeacherNoteEditor.tsx
├── SaveStatus.tsx
└── InheritedAssessmentBadge.tsx
```

Port chính xác:

- Context capture `{authEpoch, classId, slotId, assessmentEpoch}`.
- Load token.
- Per-student save token.
- Per-student serialized save promise.
- Touched, busy, error và synced maps.
- Rapid L2 → L4 chỉ giữ L4 state cuối.
- AI generation phải chờ autosave mới nhất.
- Class/slot change bỏ response context cũ.
- Bulk learning-level operation giữ per-student failure semantics.
- Navigation/beforeunload guard chỉ cho comment/assessment page như legacy.

Không lưu cả server record lẫn draft trùng nhau ngoài các field cần dirty comparison.

### Test bắt buộc

- Port toàn bộ `tests/assessments.test.js` behavior sang tests mới, giữ test cũ.
- Fake timers:
  - Rapid level changes.
  - Rapid note edits.
  - Response out of order.
  - Save fail/retry.
  - Switch class/slot mid-save.
  - Inherited → current promotion.
  - Auth principal transition.
- Playwright save status/navigation guard.

### Gate

Không sang comment generation nếu tất cả race tests chưa pass.

## 10. Phase 7 — Comment generation, summary và LMS submission

### Mục tiêu

Đưa raw GraphQL payload và direct AI fallback ra khỏi browser mới, đồng thời giữ UI/progress semantics.

### Backend services

Tạo:

- `src/services/commentGenerationService.ts`.
- `src/services/commentSubmissionService.ts`.
- `src/routes/v2/comments.ts`.

Refactor:

1. Generation service dùng prompt/validation/fallback hiện tại.
2. Direct AI fallback chạy server-side; React không gọi `ai.ducvu.io.vn`.
3. Submission service xây:
   - Default old-format payload.
   - New-format content-only payload theo cutoff.
   - Summary-only payload.
4. Centralize `UpdateSlotComment` GraphQL trong backend.
5. Preserve fixed area IDs, grades, HTML content, log metadata và session summary behavior.
6. V2 endpoints:
   - Generate comment.
   - Save slot summary.
   - Submit one regular comment.
7. Batch vẫn do React gọi per-student endpoint theo concurrency/sequence legacy để giữ progress.
8. Mutation semantics:
   - Không auto-retry.
   - Concurrent duplicate trong cùng operation context có thể bị chặn nếu không đổi visible behavior.
   - Timeout/error giữ đúng semantics đã characterize từ legacy trong parity phase; không thêm forced reload/reconciliation UI. Hardening uncertain-write được lập kế hoạch riêng sau parity.

### Frontend

Tạo:

```text
frontend/src/features/comments/
├── api.ts
├── commentStore.ts
├── selectors.ts
├── generationController.ts
├── CommentEditor.tsx
├── CommentActions.tsx
├── BatchGenerationDialog.tsx
├── BatchSubmissionDialog.tsx
├── SubmissionProgress.tsx
├── CopyDialog.tsx
└── ExportActions.tsx
```

Port:

- Single generation/regeneration.
- Batch generation với concurrency giống baseline.
- Manual edit và metadata/source indicator.
- Per-student busy/error.
- Summary save.
- Single submit.
- Batch submit sequential/progress/partial failure.
- Frozen student scope trước confirm/start.
- Copy individual/class Zalo.
- CSV export.
- Delete draft/past comments modal.
- Unsaved work semantics.
- Preserve selected student/review selection qua async render equivalents.

### Golden tests

So sánh backend v2 payload builder với legacy cho:

- Old-format regular class.
- New-format class cutoff.
- Absent/present cases.
- Summary included only at đúng thời điểm.
- `byAreas`, `content`, IDs, rank và totalScore.
- Comment log metadata.

### Gate

- Existing AI/prompt/direct fallback tests pass.
- New service/contract tests pass.
- Paired E2E generation/submit scenarios pass với mocked upstream.
- React bundle không chứa raw GraphQL document hoặc external AI URL.

## 11. Phase 8 — Review mode

### Mục tiêu

Port review UI như derived workflow trên canonical drafts, không tạo state source thứ hai.

### Frontend structure

```text
frontend/src/features/review/
├── reviewStore.ts
├── selectors.ts
├── ReviewDialog.tsx
├── ReviewToolbar.tsx
├── ReviewList.tsx
├── ReviewRow.tsx
├── ReviewDrawer.tsx
├── ReviewFilters.tsx
├── DuplicateWarning.tsx
└── ReviewSubmitActions.tsx
```

Port:

- Search/filter/sort.
- Duplicate signature detection.
- Character/warning indicators.
- Edit/regenerate per student.
- Learning-level control trong drawer.
- Frozen filtered submit scope.
- All vs filtered actions và exact counts.
- Modal focus trap/restore.
- Drawer-first Escape hierarchy.
- Table/drawer scroll restoration.
- Keyboard behavior hiện tại.
- Partial per-row operation error.

State rule:

- Comments đọc/ghi `commentStore`.
- Assessments đọc/ghi `assessmentStore`.
- Review store chỉ giữ view state.

### Tests

- Port toàn bộ scenarios trong `tests/review.test.js`.
- Add React interaction tests.
- E2E focus/filter/frozen-scope/partial-failure/scroll.
- Visual parity desktop/modal/mobile full-screen.

### Gate

Review legacy tests và React tests cùng pass; không có duplicate ID/global handler dependency.

## 12. Phase 9 — Demo và Checkpoint

### Mục tiêu

Port hai mode có payload/scoring phức tạp cuối cùng.

### Backend

Tạo:

- `src/services/demoSubmissionService.ts` hoặc phần rõ ràng trong submission service.
- `src/services/checkpointService.ts`.
- `src/routes/v2/checkpoints.ts`.
- Route demo v2 phù hợp.

Chuyển vào backend/golden-test:

- Demo dynamic/fallback schema resolution.
- RATE area construction.
- Ability/final score/rank calculation.
- Demo `byAreas`/HTML payload.
- Checkpoint theory/practice score parsing.
- Question mapping/random score behavior.
- Checkpoint `byAreas`/HTML payload.
- External checkpoint status proxy với timeout và schema validation.

Frontend giữ các interaction cần hiển thị trước submit:

- Score inputs.
- Random demo scores button.
- Auto-rate toggle.
- Checkpoint descriptions.
- AI checkpoint comments.
- Branch selection.
- Expanded/collapsed cards.
- Single score-only submit.
- Single full submit.
- Batch score/full submit và progress.

React không gọi `kiemtra.ducvu.io.vn` trực tiếp.

### Tests

- Pure score/rank tests.
- Golden legacy payloads cho demo/checkpoint.
- External status malformed/timeout/error cases.
- Branch selection.
- Summary submitted đúng một lần trong batch như legacy.
- E2E demo/checkpoint visual và behavior parity.

### Gate

Full feature parity matrix không còn feature chưa port.

## 13. Phase 10 — Cross-cutting hardening và quality gate

### Mục tiêu

Hoàn thiện chất lượng cho parallel release mà không bật post-parity behavior changes.

### Công việc

1. Security audit v2:
   - Auth/owner coverage.
   - CSRF/same-origin.
   - Size/batch limits.
   - Secret/PII redaction.
   - Public-safe config.
2. Auth isolation:
   - Teacher A → logout/expiry → Teacher B.
   - Query/store/polling/generation không leak.
3. LocalStorage compatibility:
   - Legacy writes → React reads.
   - React writes → legacy reads.
   - `storage`/focus re-sync.
4. Performance:
   - Route-level lazy loading.
   - Memoized selectors.
   - Không rerender toàn student list khi edit một row.
   - Không virtualization nếu class size hiện tại chưa cần.
5. Accessibility parity:
   - Labels, focus-visible, dialog semantics.
   - Reduced motion.
   - Touch target.
   - Không thay keyboard contract đã baseline ngoài bugfix không nhìn thấy.
6. Error/observability:
   - Request ID.
   - ErrorBoundary.
   - Safe structured logs.
   - Job/item transitions.
7. Static gates:
   - No `any` ở frontend contracts/domain trừ documented upstream adapter boundary.
   - No direct `fetch` trong component.
   - No `window.*` bridge/inline handler trong React.
   - No raw GraphQL/external AI/checkpoint URL trong `frontend/`.
8. Bundle/build:
   - Hashed assets.
   - No secret in bundle/source maps.
   - Source maps policy rõ ràng cho production.

### Full validation

```bash
npm ci
npm run cf-typegen             # nếu Env thay đổi
npm run db:migrate:local
npm run verify
npm audit --omit=dev
npm audit
```

`npm run verify` phải aggregate backend/contracts/frontend typecheck, existing Node tests, backend Vitest, frontend Vitest, frontend build và Playwright; không được pass nếu một workspace chưa được typecheck.

Kiểm tra thêm:

```bash
rg -n "https://ai\.ducvu\.io\.vn|https://kiemtra\.ducvu\.io\.vn|/api/lms/graphql|LMS_GRAPHQL_URL" frontend packages/contracts
rg -n "onclick=|onchange=|oninput=|window\." frontend/src
```

## 14. Phase 11 — Preview parallel release và rollback drill

**Operational subphase, chỉ chạy khi người dùng cung cấp/cho phép preview credentials, preview deployment và preview D1 migration. Default one-shot coding task dừng sau Phase 10.**

### Mục tiêu

Xác nhận môi trường Cloudflare thật trước cutover.

### Công việc

1. Build và deploy preview Worker, không đổi production default route.
2. Apply migrations trên preview database theo ordered migrations.
3. Route matrix:
   - Legacy routes/assets.
   - React routes/deep refresh/assets.
   - Unknown API JSON 404.
4. Smoke D1/KV/R2/Queue.
5. Chạy full Playwright against preview.
6. Manual demo theo parity matrix.
7. `wrangler tail` kiểm tra request IDs, errors và redaction.
8. Rollback drill:
   - Disable `/new` feature flag hoặc deploy previous compatible Worker.
   - Xác nhận legacy vẫn hoạt động.
   - Xác nhận queue consumer đọc message versions còn tồn tại.
9. Viết:
   - `docs/react-migration-runbook.md`.
   - `docs/react-migration-release-checklist.md`.
   - `docs/react-migration-parity-report.md`.

### Gate

- Zero blocker/high defects.
- Full suite pass trên preview.
- Rollback drill pass.
- Legacy vẫn healthy.
- Người dùng review bản `/new`.

### Kết quả Phase 11 khi được ủy quyền

Khi preview operation được cho phép, phase này bổ sung preview URL, remote-like validation và rollback drill. Nếu không được ủy quyền, one-shot vẫn kết thúc hợp lệ sau Phase 10 với code hoàn chỉnh, local validation pass, build artifact và runbook; legacy vẫn default và không có remote side effect.

## 15. Phase 12 — Cutover route mặc định

**Chỉ chạy khi có lệnh cutover riêng.**

### Công việc

1. Thêm/đặt `UI_DEFAULT=react`.
2. `/` và `/homework` phục vụ React index.
3. `/legacy`, `/legacy/homework` phục vụ legacy.
4. `/new*` tiếp tục hoạt động.
5. Validate dynamic route generator và `return_to` ở root mode.
6. Production smoke:
   - Auth/session.
   - Class read.
   - Homework read.
   - Một safe write được người dùng cho phép.
   - Static assets/API 404.
7. Monitor error/auth/job/upstream rate trong stabilization window.

### Rollback

- Set `UI_DEFAULT=legacy`.
- Redeploy/reconfigure version tương thích với schema/queue hiện tại.
- Không rollback legitimate LMS/D1 writes.

## 16. Phase 13 — Legacy cleanup

**Release riêng sau stabilization và explicit approval.**

### Điều kiện vào phase

- Không còn legitimate legacy traffic trong khoảng quan sát đã thống nhất.
- Không còn blocker/high production issue.
- Cutover rollback window đã kết thúc.

### Công việc

1. Xóa `/legacy*` aliases.
2. Xóa legacy HTML, JS, CSS sau dependency search.
3. Port/remove legacy tests tương ứng.
4. Xóa old API route theo usage evidence; `/api/lms/graphql` xóa cuối.
5. Search gate:

```bash
rg -n "https://ai\.ducvu\.io\.vn|https://kiemtra\.ducvu\.io\.vn|/api/lms/graphql|LMS_GRAPHQL_URL|maybeDirectAiFallback" public src frontend tests
```

6. Xóa migration flags/compatibility adapters chỉ khi rollback không còn cần.
7. Dependency audit và bundle cleanup.
8. Full test/deploy preview trước destructive production cleanup.

## 17. File inventory dự kiến

### Root/config

- `package.json`.
- `package-lock.json`.
- `.gitignore`.
- `tsconfig.json`.
- `vitest.config.ts` hoặc frontend config riêng.
- `playwright.config.ts`.
- `wrangler.toml`.

### Frontend mới

- Toàn bộ `frontend/**`.

### Contracts

- Toàn bộ `packages/contracts/**`.

### Backend mới/chỉnh sửa

- `src/router.ts`.
- `src/types.ts`.
- `src/worker.ts` nếu queue/build metadata cần.
- `src/routes/v2/**`.
- Legacy `src/routes/*.ts` để dùng shared services nhưng giữ response.
- `src/services/classService.ts`.
- `src/services/gradingJobService.ts`.
- `src/services/commentGenerationService.ts`.
- `src/services/commentSubmissionService.ts`.
- `src/services/checkpointService.ts`.
- Existing services liên quan.
- `src/middleware/requestContext.ts`.
- `src/middleware/v2Security.ts`.
- `src/constants/lmsQueries.ts`.
- `src/db/schema.sql`.
- `src/queues/gradingConsumer.ts`.

### Tests/docs

- `tests/v2/**`.
- `tests/e2e/**`.
- Frontend unit/component tests cạnh feature hoặc dưới `frontend/src/test`.
- `migrations/**`.
- `docs/react-migration-*.md`.

### Frozen cho tới cleanup

- `public/index.html`.
- `public/homework.html`.
- `public/js/**`.
- `public/css/**`.

Chỉ được sửa legacy khi characterization test phát hiện bug test-harness hoặc khi cần compatibility adapter đã được giải thích; không refactor legacy song song.

## 18. Definition of Done

### 18.1 Local implementation DoD — default one-shot, kết thúc sau Phase 10

- [ ] React SPA build từ `frontend/` và có route definitions cho cả preview/root families.
- [ ] Legacy route/assets không bị thay đổi hoặc ghi đè.
- [ ] Homework đạt visual/behavior parity.
- [ ] Class/slot/student shell đạt parity.
- [ ] Assessment inheritance/autosave/race đạt parity.
- [ ] Comment generation/edit/review/submit đạt parity.
- [ ] Demo và Checkpoint đạt parity.
- [ ] React không chứa raw LMS GraphQL hoặc direct external AI/checkpoint call.
- [ ] API v2 có contract, validation, auth/ownership và error envelope.
- [ ] Principal transition reset toàn bộ cache/store/controller.
- [ ] LocalStorage tương thích hai chiều với legacy; malformed `studentNotes` chỉ khác theo invalid-state exception đã ghi trong design.
- [ ] Fresh/upgrade D1 migration tests pass trên isolated temporary persistence.
- [ ] `npm run verify` pass: backend/contracts/frontend typecheck, Node tests, backend Vitest, frontend Vitest, frontend build và local Playwright.
- [ ] Local route matrix pass.
- [ ] Không có blocker/high finding chưa xử lý.
- [ ] Không có remote deploy/migration, production cutover hoặc destructive cleanup ngoài scope được duyệt.

### 18.2 Preview-release gate — chỉ áp dụng khi Phase 11 được ủy quyền

- [ ] Preview Worker và preview D1 migrations hoàn tất thành công.
- [ ] Playwright parity/visual tests pass against preview.
- [ ] Preview route matrix và D1/KV/R2/Queue smoke pass.
- [ ] Rollback drill pass với backend/schema/queue-compatible release.
- [ ] Legacy preview routes vẫn healthy.
- [ ] Preview parity report và runbook đã được review.

## 19. Stop rules khi thực thi

Dừng one-shot và báo người dùng nếu xảy ra một trong các trường hợp:

1. Existing baseline test fail trước khi thay đổi.
2. Cần credential thật hoặc real LMS mutation để xác minh logic nhưng chưa được cho phép.
3. Upstream GraphQL payload không thể suy ra chắc chắn từ code/fixture.
4. D1 migration có nguy cơ destructive hoặc không có upgrade path.
5. UI parity yêu cầu quyết định sản phẩm mới.
6. Một phase gate còn blocker/high regression.
7. Có unrelated dirty files có nguy cơ bị overwrite/commit.
8. Cần cutover production, remote migration hoặc xóa legacy mà chưa có lệnh riêng.

## 20. Thứ tự commit đề xuất trong one-shot branch

1. `test: capture legacy frontend parity baseline`
2. `build: scaffold React workspace and parallel routes`
3. `feat: add shared contracts and v2 API foundation`
4. `feat: add React shell auth config and design primitives`
5. `feat: migrate homework workflow to React`
6. `feat: migrate class session and student workspace`
7. `feat: migrate assessment autosave workflow`
8. `feat: migrate comment generation and submission`
9. `feat: migrate class review workflow`
10. `feat: migrate demo and checkpoint workflows`
11. `test: complete React parity and security coverage`
12. `docs: add React migration preview and rollback runbook`

Cutover và cleanup dùng commit/release riêng, không squash vào implementation branch nếu cần giữ rollback rõ ràng.

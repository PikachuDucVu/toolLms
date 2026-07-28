# Thiết kế migration frontend sang React TypeScript + Tailwind

**Ngày:** 2026-07-28  
**Trạng thái:** Đã chốt hướng kiến trúc, chờ duyệt tài liệu trước khi triển khai  
**Phạm vi:** Toàn bộ frontend hiện có tại `public/`, backend Hono liên quan đến frontend, chiến lược chạy song song, cutover và rollback

## 1. Quyết định đã chốt

1. Frontend mới dùng **React + TypeScript + Tailwind CSS** và lưu mã nguồn trong `frontend/`.
2. Giai đoạn migration phải giữ **UI/UX và nghiệp vụ 1:1**. Không redesign trong cùng đợt.
3. React chạy song song tại:
   - `/new`: trang nhận xét/đánh giá.
   - `/new/homework`: trang chấm bài tập.
4. Frontend legacy tiếp tục chạy tại:
   - `/`.
   - `/homework`.
5. Backend được phép refactor, nhưng mọi `/api/*` mà legacy đang dùng phải tiếp tục tương thích trong suốt giai đoạn song song.
6. Target là **một React SPA**, không phải hai app hoặc microfrontend.
7. Việc triển khai có thể được yêu cầu trong một lần, nhưng “one shot” chỉ có nghĩa là **một branch/PR triển khai tuần tự qua các phase và gate**. Không có nghĩa là bỏ kiểm thử, tự động cutover production, hoặc xóa legacy trong cùng lần chạy.
8. Cutover và cleanup là các operation riêng, cần lệnh xác nhận riêng sau khi bản React đã chạy song song ổn định.

## 2. Mục tiêu

- Thay thế imperative DOM, `innerHTML`, inline handler và `window.*` bridge bằng component React có boundary rõ ràng.
- Tách đúng các loại state: server state, workflow draft, form state, derived state và local UI state.
- Loại raw LMS GraphQL và direct external API khỏi React; backend trở thành typed BFF cho frontend mới.
- Giữ nguyên toàn bộ behavior quan trọng:
  - Authentication/session.
  - Cấu hình AI.
  - Danh sách lớp, buổi học và học sinh.
  - Assessment inheritance/autosave.
  - Tạo, sửa, review và submit nhận xét.
  - Demo và Checkpoint.
  - Homework manual/AI/batch grading.
  - Loading, empty, error, confirm, dark mode và keyboard behavior hiện có.
- Có test parity giữa legacy và React trước khi đổi route mặc định.
- Rollback giao diện không cần rollback dữ liệu hợp lệ đã ghi lên LMS hoặc D1.

## 3. Ngoài phạm vi parity

Các thay đổi sau không được bật trong phase parity vì làm thay đổi behavior hiện tại:

- Redesign layout, terminology hoặc information architecture.
- Lưu class/slot/filter/student selection vào URL.
- Thêm navigation guard mới cho trang homework.
- Thêm optimistic multi-tab conflict flow cho assessments.
- Thay đổi semantics retry/submission thành một workflow mới, bao gồm UI `outcome_unknown`, forced reconciliation hoặc idempotency flow mới.
- Xóa `lms_password` hoặc `ai_api_key` khỏi `localStorage` khi chưa có quyết định sản phẩm riêng.
- Thay đổi cách global AI configuration đang hoạt động.
- SSR, Next.js, PWA, offline mode hoặc microfrontend.

Các hardening không làm thay đổi happy-path hợp lệ — authentication, ownership, validation, redaction, request limits — phải được thêm ngay khi tạo endpoint v2. Một ngoại lệ invalid-state được duyệt trong migration: nếu `studentNotes` chứa JSON hỏng, React được phép fallback về `{}` thay vì để `JSON.parse` làm crash như legacy; điều này không thay đổi behavior với dữ liệu hợp lệ và phải có test riêng.

## 4. Hiện trạng cần bảo toàn

Frontend hiện tại có hai trang, khoảng 12.8 nghìn dòng HTML/CSS/JS:

- `public/index.html`: 461 dòng.
- `public/homework.html`: 223 dòng.
- `public/css/*`: khoảng 4.1 nghìn dòng.
- `public/js/index/*`, `public/js/homework/*`, `public/js/shared/*`: khoảng 8 nghìn dòng.

Các ràng buộc quan trọng:

- `public/js/index/state.js` đang chứa nhiều nhóm state khác nhau trong một mutable object.
- Assessment autosave dùng context epoch, request token và promise serialization để chống stale response.
- Homework giữ score/note edit bằng cách đọc ngược từ DOM trước khi filter hoặc submit.
- Review mode dùng chung canonical comment/assessment drafts, có frozen submit scope, focus và scroll restoration.
- React không được import trực tiếp các module legacy phụ thuộc `document`, DOM ID hoặc `window`.
- Các helper thuần, payload builder và selector có thể được port/extract với golden test.

## 5. Kiến trúc repository mục tiêu

Dùng npm workspaces với một root lockfile:

```text
.
├── package.json
├── package-lock.json
├── frontend/
│   ├── package.json
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── app/
│       ├── routes/
│       ├── components/
│       ├── features/
│       ├── lib/
│       ├── styles/
│       └── test/
├── packages/
│   └── contracts/
│       ├── package.json
│       └── src/
├── src/
│   ├── routes/
│   │   └── v2/
│   ├── services/
│   ├── middleware/
│   └── ...
├── migrations/
├── public/
│   ├── index.html
│   ├── homework.html
│   ├── js/
│   ├── css/
│   └── new/              # generated Vite output, không sửa tay
└── tests/
    ├── v2/
    └── e2e/
```

Nguyên tắc:

- `frontend/` có package riêng nhưng dùng workspace và `package-lock.json` ở root.
- `packages/contracts` chỉ chứa contract trung lập, không import Cloudflare bindings hoặc React.
- `public/new/` là build artifact. Vite chỉ được phép xóa thư mục này, không được dùng `emptyOutDir` trên toàn bộ `public/`.
- `bun.lock` không phải lockfile canonical trong migration; không tự động cập nhật song song nếu project không yêu cầu.

## 6. Runtime và routing

### 6.1 Parallel mode

- Vite `base = "/new/"`.
- Build output: `public/new/`.
- Hono phục vụ `/new/index.html` cho đúng bốn document route:
  - `/new`
  - `/new/`
  - `/new/homework`
  - `/new/homework/`
- `/new/assets/*` tiếp tục đi qua `ASSETS.fetch`.
- Không dùng wildcard `/new/*` trả HTML trước asset handling, vì có thể trả `index.html` thay cho JS/CSS.

### 6.2 React route mode

React Router không dùng một static `basename`. Cùng một bundle đăng ký rõ cả hai route family:

- Preview family: `/new`, `/new/homework`.
- Root family: `/`, `/homework`.

Runtime route abstraction xác định mode từ route family đang match, không chỉ từ `UI_DEFAULT` hoặc build-time config:

| Route family | Comments URL | Homework URL | Login return URL |
| --- | --- | --- | --- |
| Preview | `/new` | `/new/homework` | `/new?return_to=/new/homework` |
| Root | `/` | `/homework` | `/?return_to=/homework` |

Điều này cho phép root và `/new*` cùng tồn tại sau cutover mà navigation không nhảy sang family khác. `return_to` chỉ chấp nhận các path nội bộ trong allow-list. Không rải hard-coded `/new` trong feature component.

### 6.3 Cutover

- Thêm binding `UI_DEFAULT=legacy|react`.
- `legacy`: route hiện tại không đổi.
- `react`: `/` và `/homework` trả `public/new/index.html`.
- Trong stabilization window, legacy có alias `/legacy` và `/legacy/homework`.
- `/new` vẫn được giữ tạm thời để hỗ trợ rollback và bookmark cũ.

## 7. Frontend architecture

```text
frontend/src/
├── app/
│   ├── App.tsx
│   ├── router.tsx
│   ├── providers.tsx
│   ├── queryClient.ts
│   ├── authBoundary.ts
│   └── ErrorBoundary.tsx
├── routes/
│   ├── CommentsRoute.tsx
│   └── HomeworkRoute.tsx
├── components/
│   ├── ui/
│   └── layout/
├── features/
│   ├── auth/
│   ├── configuration/
│   ├── classes/
│   ├── homework/
│   ├── assessments/
│   ├── comments/
│   ├── review/
│   ├── demo/
│   └── checkpoint/
├── lib/
│   ├── apiClient.ts
│   ├── apiError.ts
│   ├── persistence.ts
│   ├── runtimeRoutes.ts
│   └── operationContext.ts
├── styles/
│   ├── app.css
│   ├── tokens.css
│   └── animations.css
└── test/
    ├── setup.ts
    └── handlers/
```

Boundary rules:

- `app/` chỉ composition, providers, router và cross-cutting lifecycle.
- `components/ui` không gọi API và không import feature store.
- Component đặc thù nằm cạnh feature; chỉ promote sang shared sau khi có reuse thật.
- Mỗi feature chỉ expose public hooks, selectors và components qua `index.ts`.
- Không import internal store của feature khác.
- Review đọc canonical drafts từ assessment/comment stores; không tạo bản sao comment riêng.

## 8. State management

Không có một thư viện duy nhất phù hợp cho mọi state.

### 8.1 TanStack Query — server state

Dùng cho:

- Session hiện tại.
- Public-safe configuration và AI models.
- Classes và class detail.
- Homework submissions đã persist.
- Assessments đã persist/inherited.
- Grading job status.
- Checkpoint status.
- Kết quả LMS đã reload sau mutation.

Quy tắc:

- Query key luôn chứa đầy đủ context identifier.
- Mutation không auto-retry nếu có khả năng ghi dữ liệu.
- Fetch nhận `AbortSignal` từ Query.
- Không copy nguyên server response vào Zustand.
- Khi login/logout/session expiry, dùng đúng thứ tự: tăng `authEpoch`; abort operation-controller registry, generation controller và polling controller do app sở hữu; gọi `queryClient.cancelQueries()`; clear Query cache và Mutation cache; reset toàn bộ workflow store. Mọi mutation callback phải so sánh captured epoch trước khi ghi state. Không giả định TanStack Query có thể tự cancel mọi arbitrary mutation.

### 8.2 Feature-scoped Zustand — workflow drafts

Dùng khi state được nhiều component trong cùng workflow sử dụng:

- Homework: score/note drafts, selected IDs và batch operation context.
- Assessments: note/level drafts, touched/busy/error state, selected student, context epoch và autosave controller metadata.
- Comments: generated/manual drafts, generation metadata, per-student errors và frozen batch scope.
- Review: modal/filter/sort/selected row/scroll state; nội dung comment vẫn lấy từ comment store.
- Demo/Checkpoint: score/description/branch/expanded drafts theo slot.

Store phải:

- Reset theo class/slot/auth context.
- Dùng immutable update; không mutate `Set` hoặc `Map` tại chỗ.
- Không lưu derived arrays/counters như `filteredStudents`.
- Có selector hẹp để tránh render lại toàn trang.
- Không persist vào localStorage trừ key legacy đã được duyệt.

### 8.3 React Hook Form + Zod — submit form

Dùng cho:

- Login.
- AI configuration.
- Manual mark dialogs/forms.
- Các form có submit boundary rõ ràng.

Assessment autosave và cell edit không dùng React Hook Form vì đó là keyed workflow draft, không phải một submit form thông thường.

### 8.4 Local component state

Dùng cho modal open state, disclosure, focus target, menu và trạng thái hiển thị ngắn hạn nếu không cần chia sẻ ngoài subtree.

### 8.5 Derived state

Filter, sort, counts, progress labels và button enablement được tính qua selector/useMemo; không lưu bản sao trong store.

## 9. LocalStorage compatibility

Trong parallel mode, React và legacy dùng cùng origin nên phải giữ cả encoding lẫn write/removal semantics hiện tại:

| Key | Read/default | Write semantics | Removal semantics |
| --- | --- | --- | --- |
| `lms_email` | plain string, mặc định rỗng | ghi khi “Ghi nhớ đăng nhập” được bật | xóa khi checkbox bị tắt |
| `lms_password` | plain string, mặc định rỗng | ghi khi “Ghi nhớ đăng nhập” được bật | xóa khi checkbox bị tắt |
| `ai_api_key` | plain string, mặc định rỗng | chỉ ghi khi giá trị mới không rỗng | không tự xóa key cũ chỉ vì input trở thành rỗng |
| `lms-theme` | `light` hoặc `dark` | ghi đúng raw string | fallback theo behavior legacy nếu giá trị không hợp lệ |
| `studentNotes` | raw JSON object keyed by student ID; malformed được xử lý theo ngoại lệ invalid-state đã nêu ở §3 | chỉ rewrite khi user thực sự sửa note | không wrap/version object |
| `lms_config_first_visit_seen` | literal string `1` hoặc absent | ghi đúng `1` | không tự xóa |

Không wrap dữ liệu bằng `{ version, data }`. Nếu cần version metadata, dùng sidecar key riêng. Auth reset tiếp tục dọn các obsolete keys `lms_token`, `lms_token_expiry` và `lms_firebase_token` giống legacy. Thêm golden test hai chiều legacy → React và React → legacy cho read, write, remove và default semantics. Re-read theme/notes khi nhận `storage` event hoặc khi tab focus lại.

Việc lưu password/API key trong trình duyệt được ghi nhận là security debt, nhưng loại bỏ nó là post-parity decision.

## 10. Tailwind và UI parity

- Dùng Tailwind CSS v4 qua Vite integration.
- Port semantic tokens từ `public/css/shared.css` vào `frontend/src/styles/tokens.css`.
- Tắt hoặc giới hạn Preflight nếu nó làm thay đổi form/table/button mặc định.
- Dùng Tailwind utilities và component variants; CSS thường vẫn được phép cho tokens, animation, complex grid và reduced motion.
- Dùng `class-variance-authority`, `clsx` và `tailwind-merge` cho variants.
- Dùng Lucide React cho icon.
- Có thể dùng Radix primitives cho Dialog/AlertDialog/Dropdown nếu giữ nguyên visual và interaction contract.
- Không dùng emoji làm UI icon.
- Visual baseline cố định:
  - Chromium.
  - Locale `vi-VN`.
  - Timezone cố định.
  - Viewport 375×812, 768×1024, 1440×900.
  - Light và dark theme.
  - Disable animation trong screenshot test.
  - Chờ font tải xong trước capture.

## 11. Backend BFF và contracts

### 11.1 Nguyên tắc

- Giữ `/api/*` legacy.
- Mount `/api/v2` cho React.
- Mỗi route v2 là adapter mỏng trên service dùng chung, không duplicate business logic.
- Chỉ tạo endpoint khi React thực sự cần hoặc khi phải loại raw GraphQL/direct external call.
- Contract request/response nằm trong `packages/contracts`, validate bằng Zod tại network boundary.
- React parse response bằng cùng schema ở boundary; component chỉ nhận domain DTO đã chuẩn hóa.
- V2 có error envelope thống nhất:

```ts
{
  success: false,
  error: {
    code: string,
    message: string,
    requestId: string,
    details?: unknown
  }
}
```

### 11.2 Operation inventory

| Nhu cầu React | Hiện trạng | V2 decision |
| --- | --- | --- |
| Login/session/logout | Endpoint explicit đã có | Thin typed adapter/service reuse |
| Public-safe config/models | Endpoint explicit đã có | Thin adapter, không trả secret |
| Classes/class detail | Endpoint explicit đã có | Service normalization + typed adapter |
| Homework load/mark/AI/job | Endpoint explicit nhưng shape/security chưa đều | Typed adapter, ownership/auth từ lúc tạo |
| Assessment load/save | Endpoint explicit đã có | Typed adapter, giữ last-write-wins parity |
| Comment AI generation | Endpoint explicit + browser fallback | Typed adapter, fallback chuyển server-side |
| Session summary | Raw `UpdateSlotComment` | Endpoint domain mới |
| Comment submit | Raw `UpdateSlotComment` | Endpoint domain mới |
| Demo/Checkpoint submit | Payload build ở browser + raw GraphQL | Endpoint domain mới, golden payload tests |
| Checkpoint status | Browser gọi external host | Server proxy/normalizer mới |

### 11.3 V2 surface dự kiến

```text
POST  /api/v2/auth/login
GET   /api/v2/auth/session
POST  /api/v2/auth/logout
GET   /api/v2/config
PUT   /api/v2/config
GET   /api/v2/ai/models
GET   /api/v2/classes
GET   /api/v2/classes/:classId
GET   /api/v2/classes/:classId/homework
GET   /api/v2/slots/:slotId/assessments
PUT   /api/v2/slots/:slotId/assessments/:studentId
PATCH /api/v2/slots/:slotId/assessments/:studentId/learning-level
PUT   /api/v2/slots/:slotId/summary
POST  /api/v2/comments/generate
POST  /api/v2/slots/:slotId/comments/submit
POST  /api/v2/checkpoints/comments/generate
GET   /api/v2/checkpoints/status
POST  /api/v2/slots/:slotId/checkpoints/submit
POST  /api/v2/slots/:slotId/demo/submit
GET   /api/v2/homework/download-url
POST  /api/v2/homework/mark
POST  /api/v2/homework/batch-mark
POST  /api/v2/homework/ai-grade
POST  /api/v2/homework/jobs
GET   /api/v2/homework/jobs/:jobId
POST  /api/v2/homework/jobs/:jobId/cancel
POST  /api/v2/homework/jobs/:jobId/retry-failed
```

Batch comment/demo/checkpoint progress tiếp tục được React orchestrate theo từng typed per-student mutation nếu legacy đang hiển thị tiến độ từng mục. Không thêm batch endpoint chỉ để namespace đẹp.

### 11.4 LMS payload builders

Các logic sau được chuyển vào backend service và có golden tests so với legacy:

- `buildDefaultPayload`.
- `buildCheckpointPayload`.
- `buildFinalDemoPayload`.
- `UpdateSlotComment` mutation.
- Summary-only mutation.

React chỉ gửi domain input. Fixed area IDs, RATE areas, HTML content, rank, total score và upstream GraphQL document không nằm trong browser bundle mới.

## 12. Error, concurrency và mutation semantics

- Assessment giữ đúng context epoch, per-student save token và serialized promise hiện tại.
- Không thêm revision/ETag hoặc conflict UI trong parity phase.
- Class/slot/auth change abort request và reset context-specific drafts.
- Batch scope được snapshot/freeze khi bắt đầu; filter change không thay đổi operation đang chạy.
- Mutation ghi dữ liệu không auto-retry.
- Trong parity phase, timeout/error giữ retry semantics đã characterize từ legacy; không thêm UI `outcome_unknown` hoặc forced reconciliation. Uncertain-write reconciliation là post-parity hardening riêng.
- Có thể ngăn concurrent duplicate request trong cùng client nếu không thay đổi visible behavior, nhưng không tuyên bố exactly-once nếu upstream LMS không hỗ trợ idempotency.
- Homework job polling dừng khi route unmount, auth epoch đổi hoặc job terminal.
- Retry failed homework job dùng lại payload không-secret đang giữ trong React memory và yêu cầu API key lại nếu server không có configured key. Backend phải xác thực key availability trước mọi D1 update/queue send; `API_KEY_REQUIRED` không được làm thay đổi job/item state. API key không persist trong D1.

## 13. D1 migration

Core migration chỉ cần schema additive cần thiết, trước mắt là ownership cho v2 grading jobs.

- Dùng Wrangler D1 migrations chính thức, không dùng lại `src/db/schema.sql` như migration runner.
- `migrations/0000_baseline.sql`: schema hiện tại với `IF NOT EXISTS`.
- `migrations/0001_grading_job_owner.sql`: thêm nullable `owner_email` và index phù hợp.
- V2 job mới bắt buộc có owner.
- Job cũ không có owner không được đọc qua v2.
- Trước khi cập nhật snapshot, lưu schema pre-owner hiện tại tại `tests/fixtures/db/pre-owner-schema.sql`.
- `src/db/schema.sql` được cập nhật thành final snapshot cho môi trường mới.
- Kiểm thử trên hai D1 persistence directory tạm, tách khỏi database local của developer:
  1. Database trống apply `0000` + `0001`.
  2. Database seed bằng pre-owner fixture rồi apply ordered migrations.
- Assert schema/index bằng introspection, không chỉ dựa vào exit code.
- Trong rollback window, giữ nguyên top-level queue message shape hiện tại; chỉ thêm optional additive field như `version`. New consumer phải đọc legacy message, đồng thời new producer phải phát message mà immediately previous consumer vẫn đọc được.

Không thêm assessment revision hoặc durable API-key metadata trong parity migration.

## 14. Security baseline cho v2

Áp dụng ngay khi từng route v2 được tạo:

- Require session cho student/class/homework data và mọi mutation liên quan LMS/AI.
- Public config/model route chỉ trả public-safe fields và không trả stored key.
- Ownership check cho grading job, download/cache và user-scoped data.
- Same-origin/CSRF policy cho cookie-authenticated mutations.
- Giới hạn ID, body, note/comment và batch size.
- Redact password, API key, token, PII, teacher note và generated comment khỏi log.
- Request ID cho error correlation.
- CSP/header mới chỉ áp dụng cho `/new*`; không làm vỡ inline handler legacy.

Việc thay đổi global config thành teacher-scoped là ngoài parity và cần quyết định riêng.

## 15. Testing strategy

### 15.1 Baseline trước code React

Playwright được thiết lập ngay Phase 0, không để tới cuối:

- Route interception/fixtures ổn định cho LMS, AI, checkpoint và homework.
- Legacy screenshots cho các state chính.
- Golden request payloads.
- Paired scenario runner: legacy route và React route dùng cùng fixture.

### 15.2 Unit/component

- Vitest + React Testing Library + user-event.
- MSW cho frontend network boundary.
- Fake timers/delayed promises cho autosave, polling và stale-response tests.
- Pure selector/payload tests không phụ thuộc DOM lớn.

### 15.3 E2E/parity

- Playwright desktop/mobile, light/dark.
- So sánh visible text, enable/disabled states, request body, modal/focus và screenshot.
- Không dùng real LMS mutation trong CI.
- Preview Worker smoke test xác nhận D1/KV/R2/Queue/assets.

### 15.4 Root verification aggregators

Root scripts phải chứng minh đầy đủ cả ba workspace/boundary:

```text
typecheck:backend   = backend Worker TypeScript
typecheck:contracts = @tool-lms/contracts TypeScript
typecheck:frontend  = frontend TypeScript
typecheck           = chạy tuần tự cả ba lệnh trên

test:node           = existing Node tests
test:backend        = existing backend Vitest tests
test:frontend       = frontend Vitest/RTL tests
test:e2e            = Playwright tests
build:frontend      = Vite production build
verify              = typecheck + node + backend + frontend + build + e2e
```

Giữ `npm test` và `npm run test:vitest` tương thích với workflow hiện tại, nhưng final gate phải dùng deterministic aggregate `npm run verify`.

## 16. Observability tối thiểu

- Backend thêm request ID, route, status, duration và upstream error category, không log body nhạy cảm.
- React ErrorBoundary hiển thị message an toàn và request ID nếu có.
- Grading job log transition theo job/item ID.
- Health response có build/version metadata không nhạy cảm.
- Không thêm third-party telemetry trong parity phase.

## 17. Cutover và rollback

### Cutover gate

Chỉ cutover khi:

- Legacy và React parity suite pass.
- Không còn blocker/high defect.
- Preview route matrix pass.
- D1 migration upgrade test pass.
- Rollback drill đã được chạy.
- Người dùng xác nhận cutover riêng.

### Rollback

- Đổi `UI_DEFAULT` về `legacy`.
- Không xóa `public/index.html`, `public/homework.html`, legacy JS/CSS hoặc `/api/*` trong stabilization window.
- Rollback backend phải dùng version còn đọc được schema additive và cả queue message legacy/new.
- Không rollback các write hợp lệ đã thực hiện lên LMS/D1.

### Cleanup

Là release riêng sau stabilization:

- Xác nhận không còn traffic legacy.
- Xóa `/legacy*`.
- Xóa legacy HTML/JS/CSS.
- Xóa `/api/lms/graphql` cuối cùng sau repository/network search.
- Search gate không còn browser-side reference tới:
  - `https://ai.ducvu.io.vn`
  - `https://kiemtra.ducvu.io.vn`
  - `/api/lms/graphql`
  - `LMS_GRAPHQL_URL`
  - `maybeDirectAiFallback`

## 18. Acceptance criteria toàn dự án

Migration đạt yêu cầu khi:

1. `/`, `/homework`, `/new`, `/new/homework` cùng hoạt động trong parallel mode.
2. React giữ UI và behavior parity theo baseline đã khóa.
3. React không import hoặc chạy legacy DOM modules.
4. React không gọi raw LMS GraphQL hoặc external AI/checkpoint host trực tiếp.
5. Server state, draft state, form state và local UI state có owner rõ ràng.
6. Assessment autosave không mất update khi response về sai thứ tự hoặc context đổi.
7. Homework edit không mất khi filter/render lại.
8. Review không duplicate canonical comment/assessment state.
9. Auth transition xóa cache/store của principal cũ và chặn stale response.
10. LocalStorage đọc/ghi tương thích hai chiều với legacy.
11. Mọi route v2 có validation, error envelope và security baseline phù hợp.
12. Existing tests, frontend tests, contract tests, build và Playwright parity đều pass.
13. Build không ghi đè legacy assets.
14. Cutover có flag và rollback drill.
15. Legacy cleanup không nằm trong cùng release với cutover.

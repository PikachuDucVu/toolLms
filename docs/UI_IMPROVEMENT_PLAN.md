# Kế hoạch cải thiện UI/UX — LMS Auto Comment Tool

> **Trạng thái:** Giai đoạn 1–5 đã triển khai ✅ · Command palette được hoãn vì là hạng mục tùy chọn
> **Cập nhật:** 2026-07-21
> **Phạm vi:** 2 trang `public/index.html` (Nhận xét) + `public/homework.html` (Chấm BTVN)

---

## Mục lục

1. [Tổng quan & mục tiêu](#1-tổng-quan--mục-tiêu)
2. [Kiến trúc hiện tại](#2-kiến-trúc-hiện-tại)
3. [Giai đoạn 1 — Tách CSS + Chuẩn icon ✅](#3-giai-đoạn-1--tách-css--chuẩn-icon-)
4. [Giai đoạn 2 — Calm UI + Dọn dẹp ✅](#4-giai-đoạn-2--calm-ui--dọn-dẹp-)
5. [Giai đoạn 3 — Confirm modal + Batch safety ✅](#5-giai-đoạn-3--confirm-modal--batch-safety-)
6. [Giai đoạn 4 — Tách JS module + Skeleton loading](#6-giai-đoạn-4--tách-js-module--skeleton-loading)
7. [Giai đoạn 5 — Dark mode + Keyboard + Command palette](#7-giai-đoạn-5--dark-mode--keyboard--command-palette)
8. [Quy ước & chuẩn chung](#8-quy-ước--chuẩn-chung)
9. [Checklist kiểm chứng](#9-checklist-kiểm-chứng)
10. [Rủi ro & rollback](#10-rủi-ro--rollback)

---

## 1. Tổng quan & mục tiêu

App là công cụ nội bộ cho giáo viên MindX: tạo nhận xét học sinh bằng AI + chấm bài tập, chạy trên Cloudflare Workers (Hono) + D1 + KV + R2 + Queue. Frontend là 2 file HTML đơn lẻ (không build step).

**Vấn đề ban đầu:**
- CSS/JS nhúng inline khổng lồ (`index.html` 405KB, `homework.html` 79KB) → khó bảo trì.
- CSS trùng lặp giữa 2 file, nhiều dead code, nhiều "hệ màu" lẻ (demo tím, checkpoint cam).
- Emoji làm icon, `confirm()` native, nhiều batch action không có xác nhận.
- Nền gradient + nhiều shadow + card lồng card → rối.

**Mục tiêu:** UI nhất quán, "calm", dễ bảo trì, an toàn thao tác, nền tảng sẵn sàng cho dark mode.

**Nguyên tắc xuyên suốt:** Không đổi logic nghiệp vụ / API. Chỉ refactor presentation. Mỗi giai đoạn đều kiểm chứng bằng Playwright + `node --check` trước khi sang giai đoạn sau.

---

## 2. Kiến trúc hiện tại

### Backend (không thay đổi)
```
src/worker.ts          → entry, fetch + queue consumer
src/router.ts          → Hono routes: /api/*, /, /homework
src/routes/*.ts        → auth, classes, comments, homework, assessments, config, notes, health
src/services/*.ts      → lmsClient, aiClient, commentService, homeworkService, ...
src/constants/*.ts     → aiModels, learningLevels, lmsQueries, prompts
Bindings: DB (D1), SESSION_CACHE/TOKEN_CACHE (KV), ATTACHMENTS (R2), GRADING_QUEUE (Queue), ASSETS (static)
```

### Frontend sau triển khai (hiện tại)
```
public/
├── index.html / homework.html → markup thuần + module entrypoints, không còn application JS inline
├── css/
│   ├── shared.css             → tokens, base components, modal, skeleton, dark theme
│   ├── index.css              → styles riêng trang nhận xét
│   └── homework.css           → styles riêng trang chấm bài
└── js/
    ├── confirm.js             → confirmDialog() Promise-based
    ├── shared/                → dom, toast, skeleton, theme, keyboard
    ├── index/                 → registry, state, constants, core, ui, auth, classes,
    │                            assessments, comments, demo, checkpoint, main
    └── homework/              → state, api, config, session, submissions, grading, main
```

**Kết quả:** state có một nguồn duy nhất cho mỗi trang; domain giao tiếp qua module imports/registry; global bridge chỉ còn để tương thích với các handler HTML động hiện hữu.

---

## 3. Giai đoạn 1 — Tách CSS + Chuẩn icon ✅

**Mục tiêu:** Loại bỏ CSS trùng lặp, chuẩn 1 icon set, bỏ emoji làm icon.

### Đã làm
| # | Việc | Kết quả |
|---|------|---------|
| 1.1 | Trích CSS inline → `shared.css` / `index.css` / `homework.css` | index.html 405→323KB, homework 79→56KB |
| 1.2 | Build `shared.css`: tokens + base (header, card, btn, form, badge, toast, modal, scrollbar, responsive) | 98 selector dùng chung, sửa 1 nơi áp dụng cả 2 trang |
| 1.3 | Lọc trùng bằng `cssutils` (tôn trọng `@media` lồng) | Xóa 90 rule trùng ở index, 88 ở homework; verify 0 selector mất |
| 1.4 | Chuẩn Heroicons: thay `↻` bằng SVG (2 trang) | Nút refresh nhất quán |
| 1.5 | Bỏ emoji icon 🎯📋📜🎲🤖⭐📤 → SVG/text | Toast dùng SVG theo type; template/demo buttons text thuần |
| 1.6 | Giữ emoji trong nội dung Zalo copy (📚👤📖📝) | Cố ý — đó là format tin nhắn gửi phụ huynh, không phải icon UI |

### Bài học / quyết định
- Dùng `cssutils` thay regex thuần để tránh vỡ `@media` lồng nhau.
- Verify bằng cách diff selector set trước/sau (phải = 0 ngoại trừ rule cố ý xóa).

---

## 4. Giai đoạn 2 — Calm UI + Dọn dẹp ✅

**Mục tiêu:** Giảm nhiễu thị giác, chuẩn hoá màu sắc, xóa dead code.

### Đã làm
| # | Việc | Kết quả |
|---|------|---------|
| 2.1 | Nền body gradient → phẳng `--gray-50` | computed `rgb(248,250,252)`, `bgImage: none` |
| 2.2 | Gỡ `header::before` gradient bar (2 trang) | Header sạch |
| 2.3 | Gỡ `.logo:hover` scale (tránh layout shift) | — |
| 2.4 | Giảm shadow trong tokens | `--shadow*` nhẹ hơn |
| 2.5 | Chuẩn hoá feature accent: thêm `--feature-demo*`, `--feature-checkpoint*`, thay hardcode hex | Đổi theme/dark mode dễ hơn |
| 2.6 | Xóa 13 dead CSS rules (`.student-card`, `.comment-done`, `.slot-selector`, ...) | Xác nhận 0 tham chiếu trong HTML+JS cả 2 trang |

### Quyết định
- Semantic tokens: `--surface-body`, `--surface-card`, `--text-primary`, `--text-muted` → là nền cho dark mode (GĐ 5).

---

## 5. Giai đoạn 3 — Confirm modal + Batch safety ✅

**Mục tiêu:** Bỏ `confirm()` native, bảo vệ mọi batch action hủy diệt.

### Đã làm
| # | Việc | Kết quả |
|---|------|---------|
| 3.1 | Tạo `confirm.js`: `confirmDialog()` Promise-based, tự chèn markup | OK→true, Cancel/Esc/backdrop→false, `role="alertdialog"`, focus nút OK |
| 3.2 | CSS modal trong `shared.css` (overlay/box/icon, animation, mobile) | Reuse cho mọi modal sau này |
| 3.3 | Thay `confirmRegularNavigation` (chặn link `/homework`) | `preventDefault` + modal, navigate sau khi xác nhận |
| 3.4 | `confirmDiscardRegularWork` → async; cập nhật 4 nơi gọi (`refreshClassData`, `selectClass`, `loadSlotStudents`, nav) | 0 `window.confirm` còn lại |
| 3.5 | `deleteComment` → async + modal danger | — |
| 3.6 | homework: `markAllPending`, `aiGradeSelected`, `aiGradeAllPending` → modal; **thêm** confirm cho `markSelected` | — |
| 3.7 | index: thêm confirm cho `autoCommentAll`, `submitDemoAll`, `autoCheckpointCommentAll`, `submitCheckpointScoresAll`, `submitCheckpointAll` | Mỗi modal hiển thị số lượng học sinh |
| 3.8 | Chuẩn icon "AI nhận xét" (beaker → sparkles) | Nhất quán với nút AI chính |

### Giới hạn chấp nhận
- `beforeunload` vẫn dùng native warning (bắt buộc bởi trình duyệt, không thể custom).

---

## 6. Giai đoạn 4 — Tách JS module + Skeleton loading ✅

**Mục tiêu:** Giảm 5153 dòng inline JS của `index.html` thành các module ES dễ đọc; thay loading overlay/spinner bằng skeleton.

> **Độ khó: CAO** — inline JS dùng biến global dùng chung nhiều (`students`, `selectedClass`, `generatedComments`, `classData`, ...), hàm gọi chéo dày đặc, và nhiều handler inline `onclick="fn()"`. Cần làm từng bước nhỏ, kiểm chứng liên tục.

### 6A. Tách JS thành module (Ưu tiên: làm trước)

**Chiến lược "global bridge" — không rewrite logic:**
Vì các handler inline `onclick="login()"`, `onclick="saveNote(...)"` phụ thuộc global scope, ta tách theo hướng:
1. Tạo các file ES module trong `public/js/`.
2. Trong mỗi module, gán các hàm cần gọi từ inline handler lên `window` (bridge) để markup hiện có vẫn chạy.
3. HTML đổi `<script>` inline → `<script type="module" src="...">`.
4. Không đổi tên hàm / tham số / behavior.

**Cấu trúc đề xuất:**
```
public/js/
├── confirm.js              (đã có — dùng chung)
├── shared/
│   ├── dom.js              → escapeHtml, escapeAttr, escapeInlineJsAttr, sanitizeId, debounce, DOM cache
│   ├── api.js              → fetchJSON, lmsApiCall, apiCall, maybeDirectAiFallback + prompt builders
│   ├── state.js            → biến global dùng chung (students, selectedClass/Slot, caches...) + getters/setters
│   ├── toast.js            → showToast, playSound
│   └── ai-models.js        → loadAiModels, onAiModelChange, refreshAiModels, getSelectedModelConfig
├── index/
│   ├── main.js             → entry: init, DOMContentLoaded, wiring, expose window.*
│   ├── auth.js             → login, firebaseLogin, checkServerSession, updateLoginStatus, clearTokens
│   ├── classes.js          → loadClasses, selectClass, refreshClassData, renderClassList
│   ├── slots.js            → loadSlotStudents, submitSummary, getSessionNumber*
│   ├── students.js         → renderStudents, filterStudents, searchStudent, stats, exportToCSV
│   ├── comments.js         → generateSingle, autoCommentAll, submitAll, confirmSubmitAll, deleteComment, copy*, Zalo
│   ├── assessments.js      → learning level, note editor, save/persist snapshots, regular master-detail
│   ├── demo.js             → demo session 14 (random, submit single/all, banner)
│   └── checkpoint.js       → checkpoint scores/comments/submit (cả single & all)
└── homework/
    ├── main.js             → entry trang chấm bài
    ├── config.js           → loadSavedHomeworkConfig, saveHomeworkConfig, AI model selectors
    ├── submissions.js      → loadHomework, filterSubmissions, renderTable, selection
    └── grading.js          → markSelected, markAllPending, aiGrade*, createBatchGradeJob, polling queue
```

**Thứ tự thực hiện (mỗi bước là 1 commit, test sau mỗi bước):**

| Bước | Việc | Rủi ro | Cách giảm |
|------|------|--------|-----------|
| 4.1 | Tách `shared/dom.js` + `toast.js` (ít phụ thuộc nhất) | Thấp | Giữ tên hàm, expose window |
| 4.2 | Tách `shared/api.js` + prompt builders | Thấp | — |
| 4.3 | Tách `shared/state.js` — gom biến global | **Cao** | Dùng object `state` + accessor, tránh đổi call-site |
| 4.4 | Tách homework trước (nhỏ, 879 dòng, ít ràng buộc) | TB | Làm mẫu cho index |
| 4.5 | Tách index theo domain (auth → classes → slots → students → comments → assessments → demo → checkpoint) | **Cao** | Mỗi domain 1 lần, test Playwright sau mỗi domain |
| 4.6 | Bỏ bridge `window.*` dần khi chuyển handler inline → `addEventListener` | TB | Giai đoạn sau (tùy chọn) |

**Ràng buộc kỹ thuật cần nhớ:**
- ES module chạy ở strict mode + deferred → phải đảm bảo DOM ready trước khi query.
- Biến global dùng chéo giữa module → import từ `state.js`, không copy.
- `onclick="fn()"` trong template string (render động) vẫn cần `window.fn` → giữ bridge cho tới bước 4.6.
- Worker serve static: không cần đổi `router.ts` (đã serve `/*` → ASSETS).

### 6B. Skeleton loading (Ưu tiên: sau 6A)

**Hiện trạng:** `pageLoadingOverlay` full-screen + nhiều `.loading` spinner cục bộ → cảm giác giật.

| Bước | Việc |
|------|------|
| 4.7 | Thêm `.skeleton` + variants (`.skeleton-text`, `.skeleton-card`, `.skeleton-row`, `.skeleton-avatar`) + shimmer animation vào `shared.css` (tôn trọng `prefers-reduced-motion`) |
| 4.8 | Danh sách lớp: skeleton 5 dòng thay spinner |
| 4.9 | Danh sách học sinh: skeleton master-detail (list + panel) |
| 4.10 | Bảng homework: skeleton N hàng table |
| 4.11 | Chỉ giữ full-screen overlay cho thao tác blocking thật sự (submit hàng loạt) |

**Skeleton mẫu (shared.css):**
```css
.skeleton {
  background: linear-gradient(90deg, var(--gray-100) 25%, var(--gray-200) 50%, var(--gray-100) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-radius: var(--radius-xs);
}
@keyframes shimmer { to { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) { .skeleton { animation: none; } }
```

---

## 7. Giai đoạn 5 — Dark mode + Keyboard + Command palette ✅ (palette hoãn — tùy chọn)

**Mục tiêu:** Nâng trải nghiệm cho giáo viên dùng lặp lại nhiều lần/ngày.

### 7A. Dark mode
| Bước | Việc |
|------|------|
| 5.1 | Thêm `[data-theme="dark"]` override cho semantic tokens trong `shared.css` (`--surface-*`, `--text-*`, `--border-color`, shadow, scrollbar) |
| 5.2 | Toggle ở header (icon sun/moon), lưu `localStorage`, respect `prefers-color-scheme` làm default |
| 5.3 | Audit contrast light/dark (text ≥ 4.5:1, border visible, glass/gradient feature banner vẫn đọc được) |
| 5.4 | Điều chỉnh feature banner (demo/checkpoint) cho dark — giảm độ chói gradient |

**Lưu ý:** tokens đã tập trung nên dark mode chủ yếu là map lại biến; phần feature accent (tím/cam) cần kiểm tra riêng.

### 7B. Keyboard shortcuts
| Phím | Hành động | Phạm vi |
|------|-----------|---------|
| `Ctrl/Cmd + K` | Focus ô tìm học sinh | index |
| `Esc` | Đóng modal / bỏ chọn | cả 2 (đã có trong modal) |
| `Enter` | Xác nhận modal | đã có |
| `↑ / ↓` | Duyệt học sinh trong master-detail | index |
| `Ctrl/Cmd + Enter` | Submit form chính (lưu note / gửi nhận xét) | index |

Triển khai: 1 module `keyboard.js`, đăng ký listener ở `document`, bỏ qua khi focus trong `input/textarea/select` (trừ `Ctrl+Enter`, `Ctrl+K`).

### 7C. Command palette (tùy chọn, làm sau cùng)
- `Ctrl/Cmd + K` mở palette: jump tới học sinh / lớp / buổi, trigger action (Tạo AI, Submit, Refresh).
- Có thể tái sử dụng markup modal + 1 input filter. **Ưu tiên thấp** — chỉ làm nếu 7B đã ổn và có nhu cầu thực tế.

---

## 8. Quy ước & chuẩn chung

**Design tokens:** mọi màu/spacing/radius/shadow mới phải định nghĩa qua biến trong `shared.css`, không hardcode hex trong file riêng.

**Icon:** chỉ dùng inline SVG Heroicons (stroke, `viewBox="0 0 24 24"`, class `icon`/`icon-sm`/`icon-lg`). Không emoji làm icon. Emoji chỉ cho nội dung tin nhắn gửi đi (Zalo).

**Component mới:** đặt trong `shared.css` nếu dùng ≥ 2 trang, ngược lại vào file riêng.

**JS:** hàm mới vào module phù hợp; giữ tên rõ ràng; không thêm global nếu không cần bridge.

**Accessibility:** mọi interactive element có focus state; touch target ≥ 44px; respect `prefers-reduced-motion`; modal có `role` + `aria-modal`.

---

## 9. Checklist kiểm chứng

Chạy sau **mỗi** thay đổi đáng kể:

```
□ CSS parse hợp lệ (cssutils) — shared/index/homework
□ Không mất selector đang dùng (diff selector set so với baseline)
□ Inline JS: node --check OK
□ Playwright: không pageerror (trừ 401 chưa login — expected)
□ Playwright: computed style key components đúng (body bg, header, nav active, btn-primary)
□ Server: curl 200 cho /, /homework, /css/*.css, /js/*.js
□ Modal: OK→true, Cancel/Esc/backdrop→false, danger class đúng
□ Responsive: kiểm tra 375px / 768px / 1440px
□ (GĐ5) Dark mode: contrast + toggle persist
```

**Lệnh nhanh:**
```bash
# Dev server
npx wrangler dev --port 8787

# Type check backend (không liên quan UI nhưng giữ an toàn)
npm run typecheck
```

---

## 10. Rủi ro & rollback

| Rủi ro | Mức | Giảm thiểu |
|--------|-----|-----------|
| Tách JS làm vỡ logic chia sẻ biến global | **Cao** | Tách từng domain nhỏ, bridge `window.*`, test sau mỗi bước; giữ nguyên tên hàm |
| Skeleton che mất empty-state quan trọng | TB | Chỉ thay spinner, giữ logic empty-state riêng |
| Dark mode làm feature banner khó đọc | TB | Audit riêng demo/checkpoint, giảm chói gradient |
| Handler inline `onclick` trong template string không tìm thấy hàm sau khi module hóa | **Cao** | Giữ bridge `window.fn` cho tới khi chuyển hết sang `addEventListener` |
| Vỡ layout khi gỡ/gộp CSS | TB | Diff selector set = 0 (trừ rule cố ý), kiểm tra computed style |

**Rollback:**
- Backup tạm đã được xóa sau khi full validation pass; rollback bằng Git diff/commit.
- Mỗi giai đoạn nên là 1 commit riêng → `git revert` từng phần nếu cần.
- CSS/JS giờ đã tách file → dễ revert độc lập mà không đụng markup.

---

## Phụ lục A — Trạng thái triển khai

| File | Kích thước | Ghi chú |
|------|-----------|---------|
| `public/index.html` | Markup thuần | Module entry `/js/index/main.js`; không còn application JS inline |
| `public/homework.html` | Markup thuần | Module entry `/js/homework/main.js`; không còn application JS inline |
| `public/css/shared.css` | Design system | tokens + base + modal + skeleton + dark mode |
| `public/css/index.css` | Page CSS | nhận xét/demo/checkpoint, dùng semantic tokens |
| `public/css/homework.css` | Page CSS | chấm BTVN, dùng semantic tokens |
| `public/js/shared/*` | Shared modules | DOM, toast, skeleton, theme, keyboard |
| `public/js/index/*` | Domain modules | state/registry/constants/core/ui/auth/classes/assessments/comments/demo/checkpoint |
| `public/js/homework/*` | Domain modules | state/api/config/session/submissions/grading |

## Phụ lục B — Backlog sau triển khai

1. **Command palette** — hạng mục tùy chọn; chỉ triển khai khi giáo viên cần tìm nhanh lớp/học sinh/hành động từ một overlay duy nhất.
2. **Visual regression screenshots** — có thể bổ sung khi repo thiết lập Playwright như một dependency chính thức.
3. **Loại bỏ inline handler hoàn toàn** — global bridge hiện được giữ có chủ đích để tương thích; có thể chuyển dần sang event delegation ở một refactor riêng.

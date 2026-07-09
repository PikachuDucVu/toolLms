# Master–Detail Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the regular-session student cards with a compact student list plus selected-student detail panel while preserving every existing action.

**Architecture:** Keep `public/index.html` as the single-file UI because the project already uses embedded CSS/JS. Add regular-session-only rendering helpers and state, while leaving the existing Final/Demo and Checkpoint branches in `renderStudents()` untouched. Desktop renders split view; mobile hides the side detail and reveals selected-student detail inline under the compact row.

**Tech Stack:** Static HTML, embedded CSS, vanilla JavaScript, Cloudflare Worker/Hono backend, TypeScript typecheck via `npm run typecheck`.

## Global Constraints

- Apply the new Master–Detail layout to regular comment sessions only.
- Keep Final/Demo session UI unchanged.
- Keep Checkpoint session UI unchanged.
- Do not change API calls or payload builders.
- Do not change AI prompt behavior.
- Do not change comment submission semantics.
- Do not remove existing actions.
- Do not redesign class list, config panel, checkpoint cards, or demo scoring cards.
- Do not commit changes unless the user explicitly authorizes a commit.
- Preserve current uncommitted user changes in `public/index.html`, `src/routes/comments.ts`, `src/services/aiClient.ts`, and `bun.lock`.

---

## File Structure

- Modify: `public/index.html`
  - Add CSS classes for the regular-session Master–Detail workspace.
  - Add JS state for selected regular student.
  - Add helper functions for compact rows, detail panel, preview text, and selection.
  - Change only the regular-session branch of `renderStudents()`.
- No backend files need changes.
- No new dependencies.

---

### Task 1: Add Regular-Session Layout CSS

**Files:**
- Modify: `public/index.html` in the `<style>` block near the existing `/* Student Cards */` section.

**Interfaces:**
- Consumes: existing CSS variables such as `--gray-50`, `--primary`, `--success-light`, `--radius`, `--shadow-md`.
- Produces: CSS classes used by Task 3: `.student-workspace`, `.student-compact-list`, `.student-list-item`, `.student-detail-panel`, `.student-detail-inline`, `.student-detail-section`, `.student-detail-actions`.

- [ ] **Step 1: Locate the insertion point**

Run:

```bash
grep -n "Student Cards\|\.student-grid\|\.student-actions" public/index.html
```

Expected: output includes lines for `/* Student Cards */`, `.student-grid`, and `.student-actions`.

- [ ] **Step 2: Insert CSS after the existing `.student-grid` rule**

Add this block after the current `.student-grid { ... }` rule and before `.student-card { ... }`:

```css
        .student-workspace {
            display: grid;
            grid-template-columns: minmax(250px, 0.82fr) minmax(0, 1.45fr);
            gap: 16px;
            align-items: start;
        }

        .student-compact-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-height: 620px;
            overflow-y: auto;
            padding-right: 4px;
        }

        .student-list-entry {
            min-width: 0;
        }

        .student-list-item {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 12px;
            border: 1.5px solid var(--gray-200);
            border-radius: var(--radius-sm);
            background: white;
            cursor: pointer;
            transition: border-color var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast);
            text-align: left;
        }

        .student-list-item:hover {
            border-color: rgba(8, 145, 178, 0.28);
            box-shadow: var(--shadow-sm);
            background: var(--gray-50);
        }

        .student-list-item:focus-visible {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(8, 145, 178, 0.14);
        }

        .student-list-item.active {
            border-color: rgba(8, 145, 178, 0.55);
            background: linear-gradient(180deg, #FFFFFF 0%, #ECFEFF 100%);
            box-shadow: var(--shadow-md);
        }

        .student-list-main {
            min-width: 0;
            display: flex;
            align-items: center;
            gap: 10px;
            flex: 1;
        }

        .student-list-text {
            min-width: 0;
            flex: 1;
        }

        .student-list-badges {
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
            margin-top: 5px;
        }

        .student-list-preview {
            margin-top: 6px;
            font-size: 12px;
            color: var(--gray-500);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 100%;
        }

        .student-list-chevron {
            width: 18px;
            height: 18px;
            color: var(--gray-400);
            flex-shrink: 0;
            transition: transform var(--transition-fast), color var(--transition-fast);
        }

        .student-list-item.active .student-list-chevron {
            color: var(--primary);
            transform: rotate(90deg);
        }

        .student-detail-panel,
        .student-detail-inline {
            background: white;
            border: 1.5px solid var(--gray-200);
            border-radius: var(--radius);
            padding: 18px;
            box-shadow: var(--shadow-sm);
            min-width: 0;
        }

        .student-detail-panel {
            position: sticky;
            top: 16px;
        }

        .student-detail-inline {
            display: none;
            margin-top: 10px;
        }

        .student-detail-empty {
            text-align: center;
            color: var(--gray-500);
            padding: 44px 20px;
            border: 1px dashed var(--gray-200);
            border-radius: var(--radius-sm);
            background: var(--gray-50);
        }

        .student-detail-header {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 12px;
            padding-bottom: 14px;
            border-bottom: 1px solid var(--gray-200);
            margin-bottom: 14px;
        }

        .student-detail-title {
            display: flex;
            align-items: center;
            gap: 12px;
            min-width: 0;
        }

        .student-detail-title .student-name {
            font-size: 16px;
            font-weight: 800;
            color: var(--gray-900);
        }

        .student-detail-section {
            margin-top: 14px;
        }

        .student-detail-section-title {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            margin-bottom: 8px;
            font-size: 12px;
            font-weight: 800;
            color: var(--gray-600);
            text-transform: uppercase;
            letter-spacing: 0.04em;
        }

        .student-detail-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 16px;
            padding-top: 14px;
            border-top: 1px solid var(--gray-200);
        }

        .student-detail-actions .btn-primary {
            margin-left: auto;
        }

        .badge-generated {
            background: #DBEAFE;
            color: #1D4ED8;
            border: 1px solid #BFDBFE;
        }

        @media (max-width: 900px) {
            .student-workspace {
                grid-template-columns: 1fr;
            }

            .student-compact-list {
                max-height: none;
                padding-right: 0;
            }

            .student-detail-panel {
                display: none;
            }

            .student-detail-inline {
                display: block;
            }

            .student-list-item {
                min-height: 64px;
            }

            .student-detail-actions .btn,
            .student-actions .btn {
                min-height: 44px;
            }
        }

        @media (max-width: 640px) {
            .student-detail-header {
                flex-direction: column;
                align-items: stretch;
            }

            .student-detail-actions {
                flex-direction: column;
            }

            .student-detail-actions .btn-primary {
                margin-left: 0;
            }
        }
```

- [ ] **Step 3: Run TypeScript typecheck to confirm CSS edit did not disturb build inputs**

Run:

```bash
npm run typecheck
```

Expected: PASS with no TypeScript errors. CSS is not typechecked, so this only confirms the project still compiles.

---

### Task 2: Add Regular-Session Selection State and Utility Helpers

**Files:**
- Modify: `public/index.html` in the `<script>` block near existing global state and helper functions.

**Interfaces:**
- Consumes: existing `students`, `generatedComments`, `getLocalNote()`, `escapeHtml()`, `escapeAttr()`, `hasContentComment()`, `isPresentAttendance()`.
- Produces:
  - `selectedRegularStudentId: string | null`
  - `stripHtml(html: string): string`
  - `getRegularAttendanceBadge(att: object): { text: string, className: string }`
  - `getRegularCommentBadge(att: object): { text: string, className: string }`
  - `getRegularStudentPreview(att: object): string`
  - `ensureRegularSelection(toRender: object[]): object | null`
  - `selectRegularStudent(studentId: string): void`
  - `handleRegularStudentKeydown(event: KeyboardEvent, studentId: string): void`

- [ ] **Step 1: Add global selection state**

Find this block near the top of the script:

```js
        let generatedComments = {};
        let checkpointScoresCache = {}; // {studentScoreId: {theory: val, practice: val}}
        let manualComments = {}; // {studentId: comment text} for manual checkpoint comments
```

Change it to:

```js
        let generatedComments = {};
        let selectedRegularStudentId = null;
        let checkpointScoresCache = {}; // {studentScoreId: {theory: val, practice: val}}
        let manualComments = {}; // {studentId: comment text} for manual checkpoint comments
```

- [ ] **Step 2: Add utility helpers after `hasContentComment(att)`**

Find:

```js
        function hasContentComment(att) {
            return hasAreaType(att, 'CONTENT', true);
        }
```

Insert this block immediately after it:

```js
        function stripHtml(html) {
            const div = document.createElement('div');
            div.innerHTML = html || '';
            return (div.textContent || div.innerText || '').trim();
        }

        function getRegularAttendanceBadge(att) {
            if (att.status === 'ATTENDED') return { text: '✓ Có mặt', className: 'badge-success' };
            if (att.status === 'LATE_ARRIVED') return { text: '⏰ Đi muộn', className: 'badge-warning' };
            if (att.status === 'ABSENT_WITH_NOTICE') return { text: 'Vắng có phép', className: 'badge-gray' };
            return { text: 'Vắng', className: 'badge-gray' };
        }

        function getRegularCommentBadge(att) {
            if (generatedComments[att.student.id]) return { text: 'AI đã tạo', className: 'badge-generated' };
            if (hasContentComment(att)) return { text: '✓ Đã nhận xét', className: 'badge-success' };
            return { text: '○ Chưa nhận xét', className: 'badge-warning' };
        }

        function getRegularStudentPreview(att) {
            const studentId = att.student.id;
            const note = getLocalNote(studentId);
            if (note) return note;

            const generated = generatedComments[studentId];
            if (generated) return stripHtml(generated);

            const existing = att.commentByAreas?.find(a => a.type === 'CONTENT')?.content || '';
            if (existing) return stripHtml(existing);

            return 'Chưa có ghi chú';
        }

        function ensureRegularSelection(toRender) {
            if (!Array.isArray(toRender) || toRender.length === 0) {
                selectedRegularStudentId = null;
                return null;
            }

            const stillVisible = toRender.find(att => att.student.id === selectedRegularStudentId);
            if (stillVisible) return stillVisible;

            selectedRegularStudentId = toRender[0].student.id;
            return toRender[0];
        }

        function selectRegularStudent(studentId) {
            selectedRegularStudentId = studentId;
            renderStudents(filteredStudents.length ? filteredStudents : students);
        }

        function handleRegularStudentKeydown(event, studentId) {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            selectRegularStudent(studentId);
        }
```

- [ ] **Step 3: Reset selection when changing slots**

Find this block in `loadSlotStudents()`:

```js
            students = selectedSlot.studentAttendance || [];
            generatedComments = {};
            checkpointScoresCache = {};
            manualComments = {};
```

Change it to:

```js
            students = selectedSlot.studentAttendance || [];
            generatedComments = {};
            selectedRegularStudentId = null;
            checkpointScoresCache = {};
            manualComments = {};
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS with no TypeScript errors.

---

### Task 3: Add Regular-Session Compact Row and Detail Panel Builders

**Files:**
- Modify: `public/index.html` in the `<script>` block before `function renderStudents(studentList = null)`.

**Interfaces:**
- Consumes: helpers from Task 2 and existing actions `applyTemplate()`, `showPastComments()`, `generateSingle()`, `submitSingle()`, `copyZaloComment()`, `deleteComment()`, `saveNote()`, `updateComment()`.
- Produces:
  - `buildRegularStudentListItem(att: object, idx: number, selectedAtt: object): string`
  - `buildRegularStudentDetail(att: object, idx: number): string`
  - `renderRegularStudents(toRender: object[]): void`

- [ ] **Step 1: Insert builder functions before `renderStudents()`**

Find:

```js
        // Render students
        function renderStudents(studentList = null) {
```

Insert this full block immediately before it:

```js
        function buildRegularStudentListItem(att, idx, selectedAtt) {
            const studentId = att.student.id;
            const studentName = att.student.fullName;
            const initials = studentName.split(' ').slice(-2).map(n => n[0]).join('');
            const attendanceBadge = getRegularAttendanceBadge(att);
            const commentBadge = getRegularCommentBadge(att);
            const hasRateScore = att.commentByAreas && att.commentByAreas.some(a => a.type === 'RATE');
            const isActive = selectedAtt?.student?.id === studentId;
            const preview = getRegularStudentPreview(att);

            return `
                <div class="student-list-entry" role="option" aria-selected="${isActive ? 'true' : 'false'}">
                    <div class="student-list-item ${isActive ? 'active' : ''}"
                         role="button"
                         tabindex="0"
                         onclick="selectRegularStudent('${escapeAttr(studentId)}')"
                         onkeydown="handleRegularStudentKeydown(event, '${escapeAttr(studentId)}')">
                        <div class="student-list-main">
                            <div class="student-avatar">${escapeHtml(initials)}</div>
                            <div class="student-list-text">
                                <div class="student-name">${escapeHtml(studentName)}</div>
                                <div class="student-list-badges">
                                    <span class="badge ${attendanceBadge.className}">${attendanceBadge.text}</span>
                                    <span class="badge ${commentBadge.className}">${commentBadge.text}</span>
                                    ${hasRateScore ? `<span class="badge badge-nl" title="Đã có điểm năng lực">NL</span>` : ''}
                                </div>
                                <div class="student-list-preview">${escapeHtml(preview)}</div>
                            </div>
                        </div>
                        <svg class="student-list-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/>
                        </svg>
                    </div>
                    ${isActive ? `<div class="student-detail-inline">${buildRegularStudentDetail(att, idx)}</div>` : ''}
                </div>
            `;
        }

        function buildRegularStudentDetail(att, idx) {
            const studentId = att.student.id;
            const studentName = att.student.fullName;
            const initials = studentName.split(' ').slice(-2).map(n => n[0]).join('');
            const attendanceBadge = getRegularAttendanceBadge(att);
            const commentBadge = getRegularCommentBadge(att);
            const hasRateScore = att.commentByAreas && att.commentByAreas.some(a => a.type === 'RATE');
            const existingComment = att.commentByAreas?.find(a => a.type === 'CONTENT')?.content || '';
            const generatedComment = generatedComments[studentId] || '';
            const generatedText = stripHtml(generatedComment);
            const note = getLocalNote(studentId);

            return `
                <div class="student-detail-header">
                    <div class="student-detail-title">
                        <div class="student-avatar">${escapeHtml(initials)}</div>
                        <div>
                            <div class="student-name">${escapeHtml(studentName)}</div>
                            <div class="student-list-badges">
                                <span class="badge ${attendanceBadge.className}">${attendanceBadge.text}</span>
                                <span class="badge ${commentBadge.className}">${commentBadge.text}</span>
                                ${hasRateScore ? `<span class="badge badge-nl" title="Đã có điểm năng lực">NL</span>` : ''}
                            </div>
                        </div>
                    </div>
                </div>

                ${existingComment ? `
                    <div class="student-detail-section">
                        <div class="student-detail-section-title">Nhận xét hiện tại</div>
                        <div class="comment-box" style="margin-top:0">${existingComment}</div>
                    </div>
                ` : ''}

                ${generatedComment ? `
                    <div class="student-detail-section">
                        <div class="comment-box ai-generated" style="margin-top:0">
                            <div class="comment-box-label">
                                <span>AI tạo</span>
                                <button class="btn-icon" onclick="deleteComment('${escapeAttr(studentId)}')" title="Xóa nhận xét" aria-label="Xóa nhận xét AI của ${escapeAttr(studentName)}">
                                    <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                                    </svg>
                                </button>
                            </div>
                            <textarea class="comment-edit" id="comment-${escapeAttr(studentId)}" oninput="updateComment('${escapeAttr(studentId)}', this.value)">${escapeHtml(generatedText)}</textarea>
                        </div>
                    </div>
                ` : ''}

                <div class="student-detail-section">
                    <div class="student-detail-section-title">Ghi chú cho AI</div>
                    <div class="note-input" style="margin-top:0">
                        <input type="text" class="form-input" id="note-${escapeAttr(studentId)}" placeholder="Ghi chú: học tập trung, hay chơi game..." value="${escapeAttr(note)}">
                        <button class="btn btn-sm btn-outline" onclick="saveNote('${escapeAttr(studentId)}')" aria-label="Lưu ghi chú cho ${escapeAttr(studentName)}">
                            <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/>
                            </svg>
                        </button>
                    </div>
                    <div class="template-buttons">
                        <button class="btn btn-xs btn-template" onclick="applyTemplate('${escapeAttr(studentId)}', 'good')">Tốt</button>
                        <button class="btn btn-xs btn-template" onclick="applyTemplate('${escapeAttr(studentId)}', 'normal')">Bình thường</button>
                        <button class="btn btn-xs btn-template" onclick="applyTemplate('${escapeAttr(studentId)}', 'needwork')">Cần cố gắng</button>
                        <button class="btn btn-xs btn-template" onclick="applyTemplate('${escapeAttr(studentId)}', 'naughty')">Hay nghịch</button>
                    </div>
                </div>

                <div class="student-detail-actions">
                    <button class="btn btn-sm btn-outline" onclick="showPastComments('${escapeAttr(studentId)}', '${escapeAttr(studentName)}')">
                        <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        Xem buổi trước
                    </button>
                    <button class="btn btn-sm btn-primary" onclick="generateSingle('${escapeAttr(studentId)}', '${escapeAttr(studentName)}', ${idx})" id="gen-btn-${escapeAttr(studentId)}">
                        <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/>
                        </svg>
                        Tạo nhận xét
                    </button>
                    ${generatedComment ? `
                        <button class="btn btn-sm btn-success" onclick="submitSingle('${escapeAttr(studentId)}', '${escapeAttr(att._id)}')">
                            <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                            </svg>
                            Submit
                        </button>
                        <button class="btn btn-sm btn-outline" onclick="copyZaloComment('${escapeAttr(studentName)}', '${escapeAttr(studentId)}')">
                            <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"/>
                            </svg>
                            Zalo
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteComment('${escapeAttr(studentId)}')" aria-label="Xóa nhận xét AI của ${escapeAttr(studentName)}">
                            <svg class="icon-sm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                            </svg>
                        </button>
                    ` : ''}
                </div>
            `;
        }

        function renderRegularStudents(toRender) {
            const list = document.getElementById('studentList');
            const selectedAtt = ensureRegularSelection(toRender);

            if (!selectedAtt) {
                list.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon" aria-hidden="true">
                            <svg class="icon-lg" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:48px;height:48px;opacity:0.5">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/>
                            </svg>
                        </div>
                        <div class="empty-state-text">Chưa có học sinh trong buổi này</div>
                    </div>
                `;
                return;
            }

            const selectedIdx = toRender.findIndex(att => att.student.id === selectedAtt.student.id);
            list.innerHTML = `
                <div class="student-workspace">
                    <div class="student-compact-list" role="listbox" aria-label="Danh sách học sinh trong buổi học">
                        ${toRender.map((att, idx) => buildRegularStudentListItem(att, idx, selectedAtt)).join('')}
                    </div>
                    <div class="student-detail-panel" aria-live="polite">
                        ${buildRegularStudentDetail(selectedAtt, selectedIdx >= 0 ? selectedIdx : 0)}
                    </div>
                </div>
            `;
        }
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS with no TypeScript errors.

---

### Task 4: Route Regular Sessions Through the New Renderer

**Files:**
- Modify: `public/index.html` inside `function renderStudents(studentList = null)`.

**Interfaces:**
- Consumes: `renderRegularStudents(toRender)` from Task 3.
- Produces: Final and Checkpoint branches remain exactly as before; regular sessions use Master–Detail.

- [ ] **Step 1: Replace only the regular-session loop body**

In `renderStudents()`, keep the empty-state logic, `isFinal`, and `isCheckpoint` branches as-is.

Find this portion after the banner setup:

```js
            toRender.forEach((att, idx) => {
                const initials = att.student.fullName.split(' ').slice(-2).map(n => n[0]).join('');
                const isPresent = isPresentAttendance(att);
                let statusText = '✕ Vắng';
                let statusClass = 'badge-gray';
                if (att.status === 'ATTENDED') { statusText = '✓ Có mặt'; statusClass = 'badge-success'; }
                else if (att.status === 'LATE_ARRIVED') { statusText = '⏰ Đi muộn'; statusClass = 'badge-warning'; }
                else if (att.status === 'ABSENT_WITH_NOTICE') { statusText = '📝 Vắng có phép'; statusClass = 'badge-gray'; }

                const hasRateScore = att.commentByAreas && att.commentByAreas.some(a => a.type === 'RATE');

                const div = document.createElement('div');

                // ===== FINAL DEMO UI (session 14) =====
```

Replace the start of the loop with:

```js
            if (!isFinal && !isCheckpoint) {
                renderRegularStudents(toRender);
                return;
            }

            toRender.forEach((att, idx) => {
                const initials = att.student.fullName.split(' ').slice(-2).map(n => n[0]).join('');
                const isPresent = isPresentAttendance(att);
                let statusText = '✕ Vắng';
                let statusClass = 'badge-gray';
                if (att.status === 'ATTENDED') { statusText = '✓ Có mặt'; statusClass = 'badge-success'; }
                else if (att.status === 'LATE_ARRIVED') { statusText = '⏰ Đi muộn'; statusClass = 'badge-warning'; }
                else if (att.status === 'ABSENT_WITH_NOTICE') { statusText = '📝 Vắng có phép'; statusClass = 'badge-gray'; }

                const hasRateScore = att.commentByAreas && att.commentByAreas.some(a => a.type === 'RATE');

                const div = document.createElement('div');

                // ===== FINAL DEMO UI (session 14) =====
```

This leaves all existing Final and Checkpoint rendering code in place, and makes the old regular-card branch unreachable. Do not delete the old regular-card branch in this task unless it becomes syntactically necessary; leaving it temporarily reduces edit risk.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 3: Inspect the diff for accidental Checkpoint/Demo changes**

Run:

```bash
git diff -- public/index.html
```

Expected:

- CSS additions for the new regular layout.
- JS additions for regular selection and builders.
- A small routing change in `renderStudents()`.
- No changes to checkpoint payload, demo payload, backend routes, or AI clients.

---

### Task 5: Preserve Selection Across Actions and Filtering

**Files:**
- Modify: `public/index.html` in regular action helpers if needed.

**Interfaces:**
- Consumes: `selectedRegularStudentId`, `ensureRegularSelection()`, `renderStudents()`.
- Produces: stable selection after filter, generate, delete, save, and submit refresh.

- [ ] **Step 1: Update `deleteComment(studentId)` to preserve selected row**

Find:

```js
        function deleteComment(studentId) {
            delete generatedComments[studentId];
            saveCheckpointScoresToCache();
            renderStudents();
            updateStats();
            showToast('Đã xóa nhận xét');
        }
```

Change it to:

```js
        function deleteComment(studentId) {
            delete generatedComments[studentId];
            if (!selectedRegularStudentId) selectedRegularStudentId = studentId;
            saveCheckpointScoresToCache();
            renderStudents(filteredStudents.length ? filteredStudents : students);
            updateStats();
            showToast('Đã xóa nhận xét');
        }
```

- [ ] **Step 2: Update `applyTemplate(studentId, templateKey)` to re-render preview after local note update**

Find:

```js
        function applyTemplate(studentId, templateKey) {
            const note = NOTE_TEMPLATES[templateKey];
            const input = document.getElementById(`note-${studentId}`);
            if (input) {
                input.value = note;
                setLocalNote(studentId, note);
            }
        }
```

Change it to:

```js
        function applyTemplate(studentId, templateKey) {
            const note = NOTE_TEMPLATES[templateKey];
            const input = document.getElementById(`note-${studentId}`);
            if (input) {
                input.value = note;
                setLocalNote(studentId, note);
                selectedRegularStudentId = studentId;
                renderStudents(filteredStudents.length ? filteredStudents : students);
            }
        }
```

- [ ] **Step 3: Update `saveNote(studentId)` to preserve selection and refresh preview**

Find the end of `saveNote(studentId)`:

```js
            showToast('Đã lưu ghi chú!');
        }
```

Change it to:

```js
            selectedRegularStudentId = studentId;
            renderStudents(filteredStudents.length ? filteredStudents : students);
            showToast('Đã lưu ghi chú!');
        }
```

- [ ] **Step 4: Update `generateSingle()` success path to preserve selected student**

Find this block in `generateSingle()`:

```js
                generatedComments[studentId] = data.comment;
                renderStudents();
                updateStats();
```

Change it to:

```js
                generatedComments[studentId] = data.comment;
                selectedRegularStudentId = studentId;
                renderStudents(filteredStudents.length ? filteredStudents : students);
                updateStats();
```

- [ ] **Step 5: Update `autoCommentAll()` render call to preserve current selected student**

Find inside the `autoCommentAll()` loop:

```js
                renderStudents();
                updateStats();
```

Change it to:

```js
                renderStudents(filteredStudents.length ? filteredStudents : students);
                updateStats();
```

- [ ] **Step 6: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS with no TypeScript errors.

---

### Task 6: Manual UI Verification

**Files:**
- No code changes expected unless verification reveals a defect.

**Interfaces:**
- Consumes: completed Tasks 1–5.
- Produces: verified UI behavior in browser.

- [ ] **Step 1: Start the app**

Run:

```bash
npm run dev
```

Expected: Wrangler starts a local dev server and prints a local URL.

- [ ] **Step 2: Open the app and verify regular-session layout**

In the browser:

1. Log in if needed.
2. Select a class.
3. Select a regular session that is not session 5, 9, or 14.
4. Confirm the student area shows a compact list on the left and selected-student detail on the right.
5. Confirm the first visible student is selected by default.
6. Click another student and confirm the detail panel changes.

Expected: No console errors and no horizontal scroll.

- [ ] **Step 3: Verify regular per-student actions**

In the selected student detail panel:

1. Click `Tốt`; confirm the note input updates and the compact preview updates.
2. Click `Bình thường`, `Cần cố gắng`, and `Hay nghịch`; confirm each updates the note.
3. Click `Xem buổi trước`; confirm the existing modal opens.
4. If an API key is configured, click `Tạo nhận xét`; confirm AI text appears in the textarea and actions `Submit`, `Zalo`, and delete appear.
5. Click delete; confirm generated comment disappears and selection stays on the same student.

Expected: Existing toasts appear and UI stays on the selected student.

- [ ] **Step 4: Verify search/filter behavior**

1. Type a student name into search.
2. Confirm the compact list filters.
3. Confirm the first matching student is selected if the previous selected student is hidden.
4. Clear search.
5. Use filters `Có mặt`, `Vắng`, `Đã nhận xét`, `Chưa nhận xét`.

Expected: Selection remains sensible and stats remain visible.

- [ ] **Step 5: Verify mobile layout**

Use browser devtools responsive mode at 390px width:

1. Confirm the workspace becomes one column.
2. Confirm the side detail panel is hidden.
3. Tap a student row.
4. Confirm details open inline below that row.
5. Confirm buttons are easy to tap and no horizontal scroll appears.

Expected: mobile behaves like an accordion with one selected/expanded student.

- [ ] **Step 6: Verify unaffected session types**

1. Select Checkpoint session 5 or 9.
2. Confirm checkpoint accordion cards still appear.
3. Select Demo/final session 14.
4. Confirm demo score cards still appear.

Expected: Checkpoint and Demo UI are unchanged except for any globally inherited harmless CSS improvements.

- [ ] **Step 7: Stop dev server and inspect final diff**

Stop the dev server with `Ctrl+C`, then run:

```bash
git diff -- public/index.html
npm run typecheck
```

Expected:

- Diff is limited to regular-session layout CSS/JS.
- Typecheck passes.

---

## Self-Review Notes

- Spec coverage: Tasks 1–5 implement regular-session compact list, selected detail panel, mobile inline detail, state preservation, and existing action preservation. Task 6 verifies regular, mobile, Checkpoint, and Demo behavior.
- Placeholder scan: No `TBD`, `TODO`, or `implement later` entries are present.
- Type consistency: The helper names produced in Task 2 are consumed by Task 3; `renderRegularStudents(toRender)` is consumed by Task 4; all action buttons call existing function names from `public/index.html`.

# Master–Detail Student Comments Layout Design

Date: 2026-07-09
Project: LMS Auto Comment Tool
Target file: `public/index.html`

## Goal

Simplify the regular student comment workflow so teachers can scan the class quickly while still having access to every existing per-student action.

The current regular-session card repeats full comments, note input, quick templates, history, generate, submit, Zalo copy, and delete controls for every student. This makes the list noisy. The new layout uses progressive disclosure:

- Show a compact student list for scanning.
- Show full controls only for the selected student on desktop.
- Use an accordion-style expanded detail area on mobile.

## Scope

Apply the new Master–Detail layout to **regular comment sessions only**.

Keep these existing specialized layouts unchanged:

- Final/Demo session UI.
- Checkpoint session UI.

Reason: Checkpoint and Demo already have dedicated workflows and denser score-specific controls. Changing them at the same time would increase regression risk without addressing the issue shown by the user.

## Non-goals

- Do not change API calls or payload builders.
- Do not change AI prompt behavior.
- Do not change comment submission semantics.
- Do not remove existing actions.
- Do not redesign class list, config panel, checkpoint cards, or demo scoring cards.

## Recommended Layout

### Desktop and tablet wide view

Use a split workspace inside the existing student card body:

```text
Student Card Body
├── stats bar
├── loading state
└── regular comments workspace
    ├── left column: compact student list
    └── right column: selected student detail panel
```

The left column contains one compact row per student:

- Avatar initials.
- Student full name.
- Attendance badge: present, late, absent, absent with notice.
- Comment badge: commented, generated, not commented.
- Optional NL score badge if currently present.
- One-line preview using this priority:
  1. local note,
  2. generated AI comment,
  3. existing LMS comment,
  4. fallback prompt such as `Chưa có ghi chú`.

The right panel contains full controls for the selected student:

- Student header with name and status badges.
- Existing LMS comment if available.
- Generated AI comment textarea if available.
- Note input and save button.
- Quick note template buttons: `Tốt`, `Bình thường`, `Cần cố gắng`, `Hay nghịch`.
- Secondary action: `Xem buổi trước`.
- Primary action: `Tạo nhận xét`.
- Conditional actions when a generated comment exists: `Submit`, `Zalo`, `Xóa`.

### Mobile view

On narrow screens, use a single column list. Each student row is still compact, but tapping a row expands that student's detail panel directly below the row. Only one student should be expanded at a time.

This gives the same interaction model without forcing a two-column layout on small screens.

## State and Interaction Model

Add lightweight UI state in `public/index.html`:

- `selectedStudentId`: currently selected student for regular sessions.
- `expandedRegularStudentId`: same value can be reused for mobile accordion behavior.

Selection rules:

1. When rendering regular sessions, preserve the current selected student if it is still in the filtered list.
2. If there is no valid selected student, select the first student in the rendered list.
3. Clicking a compact student row updates the selected student and re-renders.
4. After generating, deleting, submitting, saving note, or filtering, preserve selection when possible.
5. On mobile, selected means expanded.

## Functional Requirements

The new regular-session layout must keep these existing capabilities working:

- Search students.
- Filter by all, present, absent, commented, not commented.
- Stats: total, present, generated, submitted.
- Generate AI comment for one student.
- Generate AI comments for all present students.
- Submit one generated comment.
- Submit all generated comments.
- Copy one generated/existing comment for Zalo.
- Copy all Zalo comments.
- Delete generated comment.
- Save local/server note.
- Apply quick note templates.
- Show past comments modal.
- Export CSV.
- Refresh class data.

## Rendering Plan

Keep `renderStudents()` as the main dispatcher.

For Final and Checkpoint sessions, leave current branches unchanged.

For regular sessions, replace the current full-card loop with helper functions:

- `renderRegularStudents(toRender)`
- `getStudentUiState(att)`
- `buildRegularStudentListItem(att, idx, state)`
- `buildRegularStudentDetail(att, idx, state)`
- `selectRegularStudent(studentId)`
- `getRegularStudentPreview(att)`

The helper names may be adjusted to match the style of the surrounding file, but the responsibilities should stay separate so `renderStudents()` does not grow harder to maintain.

## CSS Design

Use existing design tokens from the file:

- `var(--gray-*)`
- `var(--primary)`
- `var(--success*)`
- `var(--warning*)`
- `var(--danger*)`
- `var(--radius*)`
- `var(--shadow*)`

Add classes for:

- `.student-workspace`
- `.student-compact-list`
- `.student-list-item`
- `.student-list-item.active`
- `.student-list-preview`
- `.student-detail-panel`
- `.student-detail-empty`
- `.student-detail-section`
- `.student-detail-actions`

Accessibility and interaction rules:

- Student rows are buttons or button-like elements with `role="button"`, `tabindex="0"`, `aria-selected`, and keyboard Enter/Space support.
- All clickable elements keep visible focus states.
- Touch targets should be at least 44px high on mobile.
- Avoid hover transforms that shift layout.

## Responsive Behavior

- At desktop widths, `.student-workspace` uses a two-column grid, roughly `minmax(260px, 0.8fr) minmax(0, 1.4fr)`.
- The compact list has its own vertical scroll where appropriate.
- The detail panel remains visible next to the list.
- Under approximately 900px, switch to one column.
- On mobile, detail content appears inline after the selected list item; the standalone right detail panel is hidden or naturally moved below the list depending on the simplest implementation.

## Error Handling

No new API errors are introduced. Existing toast behavior remains:

- Missing API key shows existing error toast.
- AI generation failure shows existing error toast.
- Submit failure shows existing error toast.
- Note save uses existing toast.

The UI must not hide existing error states or leave buttons permanently disabled.

## Testing and Verification

Manual verification should cover:

1. Load a regular session with several students.
2. Confirm compact list renders and first student detail is selected.
3. Search and filter students; selection remains sensible.
4. Apply each quick note template and confirm the note input updates.
5. Save note and reload/render to confirm preview uses the note.
6. Generate one AI comment and confirm textarea appears in the detail panel.
7. Delete generated comment and confirm UI updates.
8. Submit one generated comment if test credentials/data allow it, or verify button wiring when submission cannot be safely performed.
9. Confirm `Auto nhận xét tất cả`, `Submit tất cả`, and `Copy Zalo tất cả` remain available.
10. Check mobile width: list becomes accordion-like and no horizontal scroll appears.
11. Check Checkpoint and Demo sessions remain unchanged.

## Acceptance Criteria

- Regular-session student list is visibly more compact than before.
- Full per-student functionality is available after selecting a student.
- Desktop uses a clear list + detail split.
- Mobile avoids two-column layout and shows detail inline for the selected student.
- Existing Checkpoint and Demo workflows are unchanged.
- Typecheck passes if applicable.
- The app can be launched and the regular-session UI inspected successfully.

# Context-Aware Student Call Name Design

**Date:** 2026-07-28  
**Status:** Approved for planning  
**Scope:** Regular-session AI comment call names and related regression coverage

## Goal

Use only the student's final name component when that name is unique in the selected class/session, and use the final two name components only when multiple students share the same final name.

## Rules

1. Normalize names by trimming whitespace, collapsing repeated spaces, Unicode-normalizing, and comparing case-insensitively in Vietnamese.
2. Extract the final name component from every student in the current session roster.
3. If the current student's final name occurs once, use only that final component:
   - `Nguyễn Minh Anh` → `Anh`
   - `Trần Gia Huy` → `Huy`
4. If the final name occurs at least twice, use the final two components:
   - `Nguyễn Minh Anh` → `Minh Anh`
   - `Trần Hoàng Anh` → `Hoàng Anh`
5. If a name contains one component, keep that component.
6. If no roster is available, preserve API compatibility by using the backend fallback behavior.
7. Class-wide Zalo output continues to use the full LMS name before `:`. Only the AI comment body's call name changes.

## Data Flow

- The frontend helper receives the current full name and `state.students`.
- `snapshotRegularStudent()` computes `studentCallName` from that roster.
- Single and batch generation continue to send the computed value as `student_call_name`.
- The backend uses the provided `student_call_name`; legacy callers without it continue to use the existing fallback.

## Error Handling

- Empty names fall back to `em`.
- One-component names remain unchanged.
- Malformed or missing roster entries are ignored when counting duplicates.
- The helper must not mutate the roster or selection state.

## Test Plan

1. Unique final name returns only the final component.
2. Duplicate final names return the final two components for each matching student.
3. Duplicate comparison ignores case and repeated whitespace.
4. One-component names remain unchanged.
5. Generation snapshots contain the roster-aware call name.
6. Zalo entries still use the full name before `:`.
7. Existing comment-generation, BTVN, L4, Review, Node, and typecheck suites remain green.

## Acceptance Criteria

- A class with no duplicate final names produces comments using only the final name.
- A class with duplicate final names produces comments using middle name plus final name for those duplicates.
- Selecting/generating comments and Zalo formatting retain all previously fixed behavior.

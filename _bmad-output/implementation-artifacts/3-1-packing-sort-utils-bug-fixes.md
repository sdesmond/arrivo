# Story 3.1: Packing Sort Utils Bug Fixes

Status: ready-for-dev

## Story

As a developer,
I want to fix core algorithm bugs in the packing sort utilities,
So that data corruption risks from `computeReorder`, `flatten`, and `byPosition` are eliminated and drag-reorder works reliably.

## Acceptance Criteria

1. **Given** a packing list has items at positions [0, 10, 20]
   **When** a drag triggers `computeReorder` and the server rejects the reorder
   **Then** the rollback payload restores the original positions [0, 10, 20]
   **And** `flatten()` does not renumber all positions from 0

2. **Given** a label has `id: undefined`
   **When** `groupPackingItems` builds `labelIds`
   **Then** the label is not added to the `Set` as the string `"undefined"`

3. **Given** a section label has an undefined `id`
   **When** `containerKeyOfItem` resolves the container for an item beneath it
   **Then** it returns a valid container key, not `null`

4. **Given** a drag ends and `onReorderItems` is invoked
   **Then** every entry in the ordered array has a defined `id` and `position`
   **And** no item is passed with `id: undefined` or `position: undefined`

5. **Given** all items in a sort group have `position: undefined`
   **When** `byPosition` compares them
   **Then** the sort produces a deterministic order, not `NaN`

6. **Given** the user drags a non-label item over a disabled label
   **When** the drag ends
   **Then** the item is placed at the nearest valid position outside the label's section

7. **Given** a label drag is attempted
   **Then** the user receives visual feedback that labels cannot be reordered (or the label is non-draggable)
   **And** `computeReorder` does not return `null` silently with no feedback path

## Tasks / Subtasks

- [ ] Fix `flatten()` to preserve original `position` values instead of sequential renumbering (AC: #1)
- [ ] Fix `groupPackingItems` to filter undefined label IDs from the `labelIds` Set (AC: #2)
- [ ] Fix `containerKeyOfItem` to handle undefined `label.id` with a fallback key (AC: #3)
- [ ] Fix `handleDragEnd` to guard against undefined `id`/`position` in `onReorderItems` callback (AC: #4)
- [ ] Fix `byPosition` to handle `Infinity - Infinity` = `NaN` edge case (AC: #5)
- [ ] Fix collision detection or `computeReorder` to handle non-label over disabled label (AC: #6)
- [ ] Add visual feedback or make labels non-draggable for label drag attempts (AC: #7)

## Dev Notes

### Bug Details (trace to source code)

All bugs are in `src/components/packt/packing-sort-utils.ts` (164 lines) and `src/components/packt/packing-list-sortable.tsx` (232 lines).

**Bug #1 — `flatten()` position corruption on rollback** (`packing-sort-utils.ts:57-73`):
`flatten()` assigns sequential positions `0, 1, 2, ...` regardless of the items' original DB positions. When `onReorderItems` calls back with this renumbered array and the server rejects the mutation, the rollback carries wrong positions. Fix: `flatten()` must preserve each item's original `position` value instead of sequential renumbering, or the caller must attach original positions outside flatten.

**Bug #2 — Undefined label ID in Set** (`packing-sort-utils.ts:27`):
`new Set(labels.map(label => label.id))` — if any label's `id` is undefined, the Set receives the string `"undefined"`. Downstream checks like `labelIds.has(item.labelId)` silently match the wrong item. Fix: filter undefined before building the Set.

**Bug #3 — `containerKeyOfItem` returns null** (`packing-sort-utils.ts:38-48`):
When `section.label.id` is undefined, line 41 `section.label.id ?? null` produces `null`, making the function return null. `computeReorder` then returns null silently (line 104). Fix: use the item's own `id` or a synthetic key as fallback.

**Bug #4 — Undefined id/position in reorder callback** (`packing-list-sortable.tsx:125-128`):
`handleDragEnd` maps items to `{ id: item.id!, labelId: ..., position: item.position! }`. If any item lacks `id` or `position`, the non-null assertion passes `undefined` through. Fix: filter or skip items with missing id/position before invoking the callback.

**Bug #5 — `byPosition` NaN** (`packing-sort-utils.ts:21-23`):
`(first.position ?? Infinity) - (second.position ?? Infinity)` — when ALL items in a group have undefined position, both resolve to `Infinity`, producing `Infinity - Infinity = NaN`. `Array.sort()` with a comparator returning NaN produces unstable/undefined ordering. Fix: add a tiebreaker (e.g., stable sort by name or index).

**Bug #6 — Label drag collision** (`packing-sort-utils.ts:109`):
`computeReorder` returns null when `active.isLabel` is true. This means the drag manager doesn't know the drag was invalid — the item visually moves (preview) but snaps back on drop. Fix: either prevent labels from being draggable entirely (remove from `SortableContext`) or provide visual feedback.

**Bug #7 — Silent label drag** (`packing-sort-utils.ts:96-111`):
Multiple code paths return `null` from `computeReorder` with no side-channel for UI feedback: `activeId === overId`, `!activeKey || !overKey`, `!active || active.isLabel`, containers not found, `sameOrder` check. Fix: at minimum, distinguish "no-op (already correct position)" from "rejected (label drag, null key, etc.)" so the caller can provide feedback.

### Key Architecture Constraints

- `computeReorder` is a **pure function** — no side effects, no server calls. All fixes must preserve purity.
- `flatten()` is called by `computeReorder` (line 140) and by `handleDragEnd` (line 114) — changes to flatten affect both paths.
- The `handleDragEnd` flow: `computeReorder` → `onOptimisticReorder(moved)` → `onReorderItems(mapped)` — rollback happens via `onOptimisticReorder(null)` in the error callback.
- `byPosition` is used in `groupPackingItems` for labels, section items, and ungrouped items.
- `SortablePackingRow` in `packing-list-row.tsx` wraps labels with `useSortable` but sets `disabled: true` on the drag handle. The label is still in the `SortableContext` — removing entirely or keeping with disabled sortable are both valid approaches.

### Existing Code That Must Not Break

- `groupPackingItems()` → `labels.sort(byPosition)` at line 26 — must not break normal label ordering
- `sameOrder()` at line 75-83 — used to detect no-op reorders; must still work after flatten changes
- `handleDragOver` creates preview via `computeReorder` + `setLocalItems` — must not break cross-container visual preview
- E2E tests: `packing-tab.feature` (18 scenarios, including drag reorder) — must pass after changes
- Unit tests: `packing-list-sortable.test.tsx` (677 lines, includes `computeReorder`, cross-container, collision) + `packing-sort-utils` implicitly tested

### Testing Standards

- **Unit tests**: Add/update tests for each fix. Pure utility fixes (flatten, byPosition, groupPackingItems, computeReorder, containerKeyOfItem) belong in a colocated `src/components/packt/packing-sort-utils.test.ts`. Component fixes (handleDragEnd guards, label drag feedback) go in `src/components/packt/packing-list-sortable.test.tsx`. Each fix must have an explicit named test case. Coverage thresholds: ≥95% lines/functions, ≥90% branches.
- **E2E tests**: Existing Playwright BDD scenarios in `tests/e2e/features/packing-tab.feature` should continue passing. New E2E scenarios for pointer-drag are deferred to Story 3.5.
- **Server action tests**: No server action changes in this story.
- **Global mocks**: `next/navigation` and `next/headers` are globally mocked in `vitest.setup.mts` — do not re-mock per file.

### Project Structure Notes

- No new files needed — only modify existing files. `packing-list-sortable.tsx` is at 232 lines (limit ~250). If label drag feedback logic exceeds ~15 lines, extract it into `packing-sort-utils.ts` instead to stay under the limit.
- `packing-sort-utils.ts` is a pure utility module (no React, no server imports) — new tests should be similarly pure
- All domain types come from `src/data/types.ts` (`PackingItem`) — no local type redefinitions

### References

- [Source: `src/components/packt/packing-sort-utils.ts`] — All sort utility functions
- [Source: `src/components/packt/packing-list-sortable.tsx`] — DragEnd/DragOver handlers
- [Source: `src/components/packt/packing-list-row.tsx`] — SortablePackingRow with label disabled sortable
- [Source: `src/data/types.ts:387`] — `PackingItem` interface
- [Source: `_bmad-output/implementation-artifacts/epics.md`] — Epic 3, Story 3.1

## Dev Agent Record

### Agent Model Used

opencode/big-pickle

### Completion Notes List

- Deferred items resolved: #26, #30, #31, #32, #29, #13, #28
- Deferred item #15 (optimistic reorder on concurrent add/remove) acknowledged as accepted Phase 1 behavior — no change

### File List

- `src/components/packt/packing-sort-utils.ts` — MODIFY (7 bug fixes)
- `src/components/packt/packing-list-sortable.tsx` — MODIFY (label drag feedback, undefined guard)
- `src/components/packt/packing-sort-utils.test.ts` — CREATE (tests for pure utility fixes)
- `src/components/packt/packing-list-sortable.test.tsx` — MODIFY (tests for component-level fixes)

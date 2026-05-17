---
title: 'Polish itinerary drag-and-drop: hide source row and remove drop snap-back'
type: 'feature'
created: '2026-05-16'
status: 'done'
baseline_commit: '6ac406847bda6cd4dc86d0680d2de7473bf54930'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** When reordering events/notes/checklists inside a `DayCard`, two visual artifacts make the interaction feel noisy. (1) The original row stays visible at 0.4 opacity and follows the cursor's target slot, so users see a "faded copy" jumping between rows in addition to the `DragOverlay` ghost that follows the pointer. (2) On drop, the `DragOverlay` runs dnd-kit's default drop animation back to the source rect before the optimistic state replaces it, producing a snap-back-then-flicker.

**Approach:** Keep the `DragOverlay` portal as the sole visible drag preview at full opacity, hide the in-list source slot (collapse opacity to 0 while preserving its height so the gap still opens at the destination), and disable the default drop animation so the overlay disappears cleanly the instant React commits the reorder. The three sortable wrappers — the seam the opacity change lives in — are extracted from `day-card.tsx` into a colocated `day-card-sortables.tsx` so the touched file lands closer to the project's ~250-line component-size guideline.

## Boundaries & Constraints

**Always:**
- The dragged source slot must occupy zero visible pixels but retain its original height during drag, so the surrounding rows shift to open a gap at the prospective drop target.
- The `DragOverlay` clone is the only visible representation of the active item while dragging, rendered at full opacity at the cursor.
- On drop, the overlay disappears in the same React commit that re-renders the reordered list — no fade, no translate, no snap-back animation.
- All three sortable wrappers (`SortablePlaceRow`, `SortableNoteItem`, `SortableChecklistItem`) keep identical drag-source styling so mixed-type lists behave uniformly.
- The sortable wrappers + `makeDragHandle` helper move verbatim from `day-card.tsx` into `src/components/packt/day-card-sortables.tsx`; behavior is unchanged aside from the opacity-0 edit.

**Ask First:**
- None.

**Never:**
- Do NOT collapse the source slot's height (e.g. via `display: none`, `height: 0`, or removing it from `SortableContext`) — that would shrink the list during drag instead of opening a gap at the destination.
- Do NOT add custom drop animations or transition stylings to `DragOverlay`.
- Do NOT change the `DndContext`/`SortableContext` wiring, collision detection, sensors, or the `onReorderDayItems` action/payload shape.
- Do NOT touch code outside `day-card.tsx`, the new `day-card-sortables.tsx`, and their colocated tests.
- Do NOT extract any other regions of `day-card.tsx` (`GapZone`, day header, subtitle edit, render-entries loop, etc.) — further splitting is a separate refactor task, not part of this polish.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Drag in progress (active row) | `isDragging === true` on a sortable wrapper | Wrapper renders with `opacity: 0`; height/layout slot unchanged | N/A |
| Drag in progress (other rows) | `isDragging === false` on a sortable wrapper | Wrapper renders at full opacity; sortable transforms still applied so the gap opens at the hovered target | N/A |
| Drag start | `handleDragStart` fires | `activeId` set; `DragOverlay` shows the clone at full opacity following the cursor | N/A |
| Drop on a valid target | `handleDragEnd` with `over.id !== active.id` | `onReorderDayItems` called once; `activeId` cleared; `DragOverlay` unmounts the same frame the parent renders the new order — no snap-back, no fade | N/A |
| Drop on self / outside | `over === null` or `over.id === active.id` | Early return; `activeId` cleared; `DragOverlay` unmounts immediately with no animation | N/A |
| Drag cancel (Esc) | `handleDragCancel` fires | `activeId` cleared; `DragOverlay` unmounts immediately with no animation | N/A |

</frozen-after-approval>

## Code Map

- `src/components/packt/day-card.tsx` (currently 566 lines) -- holds the three `Sortable*` wrappers + `makeDragHandle` helper (lines ~107–168) to be extracted, and the `<DragOverlay>` block (~line 525) where the default drop animation needs to be disabled. After extraction the file shrinks by ~60 lines.
- `src/components/packt/day-card-sortables.tsx` (new) -- destination for the extracted `SortablePlaceRow`, `SortableNoteItem`, `SortableChecklistItem`, and `makeDragHandle`. The opacity-0 change lands here.
- `src/components/packt/day-card.test.tsx` -- existing Vitest suite that mocks `@dnd-kit/core` and `@dnd-kit/sortable`. Needs one extension: capture the props passed to `DragOverlay` so `dropAnimation: null` can be asserted. Existing reorder/drag-end tests continue to pass through the imported wrappers unchanged.
- `src/components/packt/day-card-sortables.test.tsx` (new) -- colocated tests for the extracted wrappers. Mocks `@dnd-kit/sortable` `useSortable` to flip `isDragging` per render and asserts `style.opacity === 0` on each of the three wrappers.
- `@dnd-kit/core` `DragOverlay` API -- passing `dropAnimation={null}` disables the default drop animation entirely (see `node_modules/@dnd-kit/core/dist/core.esm.js`).

## Tasks & Acceptance

**Execution:**
- [x] `src/components/packt/day-card-sortables.tsx` (new) -- create with `"use client"`; move `makeDragHandle`, `SortablePlaceRow`, `SortableNoteItem`, `SortableChecklistItem` verbatim from `day-card.tsx`; in each wrapper change `opacity: isDragging ? 0.4 : 1` to `opacity: isDragging ? 0 : 1`. Export the three wrappers. -- Co-locates the seam being changed and removes ~60 lines from the oversized `day-card.tsx`.
- [x] `src/components/packt/day-card.tsx` -- delete the now-extracted helper + wrapper definitions; add `import { SortablePlaceRow, SortableNoteItem, SortableChecklistItem } from "./day-card-sortables";` near the other component imports; also remove the dnd-kit imports that are no longer used here (`useSortable`, `CSS`, `GripVertical`); on the `<DragOverlay>` element pass `dropAnimation={null}`. -- Wires the extracted module in and applies the second behavior fix.
- [x] `src/components/packt/day-card-sortables.test.tsx` (new) -- mock `@dnd-kit/sortable` `useSortable` (defaulting `isDragging: false`, overridable per test); mock `@dnd-kit/utilities` `CSS.Transform.toString`; mock `./place-row`, `./note-item`, `./checklist-item` as minimal `<div data-testid="..." />` stand-ins. Render each wrapper with minimal props and assert behavior listed in Acceptance Criteria.
- [x] `src/components/packt/day-card.test.tsx` -- extend the `@dnd-kit/core` mock so `DragOverlay` records its props on a module-scoped capture (e.g. `lastDragOverlayProps`). Add one new test: "passes dropAnimation={null} to DragOverlay". All existing DnD tests must continue to pass without modification (the wrappers are now imported but their public behavior is unchanged).

**Acceptance Criteria:**
- Given `useSortable` returns `isDragging: true` for an event/note/checklist wrapper, when the wrapper renders, then the wrapping `<div>`'s `style.opacity` is `0` (asserted independently in `day-card-sortables.test.tsx` for all three wrappers).
- Given `useSortable` returns `isDragging: false`, when the wrapper renders, then the wrapping `<div>`'s `style.opacity` is `1` (asserted for at least one wrapper to lock the off-state).
- Given the `DayCard` mounts, when `DragOverlay` is rendered, then the captured props include `dropAnimation: null` (asserted in `day-card.test.tsx`).
- Given any existing covered DnD path (e.g. "handleDragEnd calls onReorderDayItems with typed entries when ids differ"), when the spec changes are applied, then the test still passes unchanged — proving the reorder payload contract and wrapper imports are intact.

## Spec Change Log

### 2026-05-16 — bad_spec: `dropAnimation={null}` alone did not eliminate the snap-back

**Finding:** Manual test showed the source slot still animating from drop position back to original after `isDragging` flipped false, even with `dropAnimation={null}` on `DragOverlay`. Root cause: dnd-kit v10's `defaultAnimateLayoutChanges` returns `true` during sorting, which activates `useDerivedTransform` and applies a transform to the source for the duration of the sort — the wrapper's `transition` then animates that transform back to zero when the drag ends.

**Amendment:** Added `animateLayoutChanges: () => false` to each of the three `useSortable` calls in `day-card-sortables.tsx`. Locked in by a new test in `day-card-sortables.test.tsx` that captures the options passed to `useSortable` and asserts the opt-out is in place for all three wrappers.

**Known-bad state avoided:** The post-mortem in the prior drag-reorder work (removed from `deferred-work.md` in this branch) called out this opt-out had been tried but did not fix a different bug (height scaling). It does, in combination with `DragOverlay`, fix the snap-back symptom.

**KEEP:** The single-source-of-visual-truth pattern (DragOverlay clone at full opacity; source slot at `opacity: 0`) survives this amendment unchanged.

### 2026-05-16 — bad_spec: post-drop old-position flash from missing optimistic update

**Finding:** Even after the snap-back was gone, the dropped row was briefly visible at its original position for one frame before appearing at the new position. Root cause: `page-client.tsx`'s `handleDayItemsReorder` wraps the server action in `React.startTransition` but performs **no optimistic local state update**. The new order doesn't materialize until the server revalidates the route ~hundreds of ms later. The prior drag-reorder spec described "optimistic UI" but the actual implementation never delivered it.

**Amendment:** Added an `optimisticOrder` state (array of item ids) in `DayCard` that takes precedence over the order derived from the `day` prop. `handleDragEnd` sets it the same React event as the reorder action, so the row appears at its new position the very next render. A guarded `useEffect` clears the optimistic state once the parent's `day` prop reflects the new order (no visible change at that point). Locked in by a new test: "renders items in optimistic order immediately after drop, before the day prop catches up".

**Known-bad state avoided:** Pushing this up to `page-client.tsx` would have required either lifting `optimisticOrder` state to the page client or adopting React 19's `useOptimistic` against the server action — both larger scope changes than this polish warrants. The local approach is correct because the optimistic order is a pure UI concern (the server remains the source of truth) and `DayCard` already owns all drag-and-drop state.

**KEEP:** `onReorderDayItems`'s payload shape (`{ type, id }[]`) is unchanged; the parent contract is intact. The "Never touch code outside `day-card.tsx` / `day-card-sortables.tsx` / their tests" constraint held.

## Design Notes

dnd-kit v10's `verticalListSortingStrategy` applies a transform to the active source so its slot tracks the prospective drop position; this is the "row jumping between rows" the user described. Setting the wrapper's `opacity` to `0` keeps that transform-driven slot in the layout (its height still pushes neighbours and creates the destination gap) but makes the slot itself invisible. The `DragOverlay` portal already renders a fresh clone at full opacity at the cursor — that becomes the only visible representation of the dragged item.

`DragOverlay` accepts `dropAnimation` (default ≈ `{ duration: 250, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }`). Passing `dropAnimation={null}` (the documented opt-out) makes the overlay unmount synchronously on drop. Because the parent (`page-client.tsx`) already updates local day-items state inside the same React event as `onReorderDayItems`, the unmount and the reordered list commit in the same frame — no visible flicker.

**On the file split:** `day-card.tsx` is 566 lines, above the project's ~250-line component guideline. A full split is out of scope for a 2-line behavior polish, but the seam being changed (the three sortable wrappers, all sharing identical drag-source styling) is a natural unit to extract. Moving them and `makeDragHandle` to `day-card-sortables.tsx` (a) lands the opacity edit at its real home, (b) gives the new behavior its own colocated test file, and (c) trims ~60 lines off the host file with zero behavior change. Further extractions (`GapZone`, day header, etc.) are deferred to a dedicated refactor task.

Example wrapper change (one of three identical edits):

```tsx
const style = {
  transform: CSS.Transform.toString(transform),
  transition,
  opacity: isDragging ? 0 : 1, // was 0.4 — source slot is now invisible, DragOverlay is the sole preview
};
```

`DragOverlay` change:

```tsx
<DragOverlay dropAnimation={null}>
  {/* …existing clone rendering unchanged… */}
</DragOverlay>
```

## Verification

**Commands:**
- `npm test -- day-card` -- expected: all tests pass in both `day-card.test.tsx` and `day-card-sortables.test.tsx`, including the new opacity-0, opacity-1, and `dropAnimation: null` assertions.
- `npm run test:coverage` -- expected: coverage on `src/components/packt/day-card-sortables.tsx` ≥ 95% lines/functions, ≥ 90% branches (new file is under coverage enforcement).
- `npm run lint` -- expected: no new warnings or errors.
- `npx tsc --noEmit` -- expected: clean.

**Manual checks (start the dev server with `npm run dev`):**
- Open a trip with multiple events/notes/checklists in one day. Press-and-drag a row.
- During drag: confirm only ONE visual representation of the row moves with the cursor (the overlay), at full opacity. The original row's slot is invisible. As the cursor hovers different targets, a gap opens between adjacent rows at the prospective drop position.
- On drop: the row appears in its new position instantly with no fade and no snap-back animation toward the original position.
- Repeat for: event past checklist, checklist past event, note between two events, drop-on-self (no-op), and Esc-cancel (no-op).

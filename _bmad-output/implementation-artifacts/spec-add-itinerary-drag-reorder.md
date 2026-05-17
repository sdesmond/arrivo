---
title: 'Mixed drag-reorder for events, notes, and checklists in day itinerary'
type: 'feature'
created: '2026-05-16'
status: 'done'
baseline_commit: '88e31b29e8acee540d68814be145b63e5b09efb2'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Inside a day, only events are reorderable. Notes and checklists have a shared `position` field but no drag handle. A prior attempt to extend the existing `SortableContext` to all three types was reverted because the drag preview stretched/shrank when crossing items of different heights (dnd-kit v10 `useDerivedTransform` applies `scaleY` to the active item during sort).

**Approach:** Replace the per-type reorder with a single `reorderDayItems` server action that writes positions across all three tables in one transaction. Use `@dnd-kit/core`'s `DragOverlay` portal to render the drag preview at the source's natural size, eliminating the height-scaling artifact.

## Boundaries & Constraints

**Always:**
- Positions are shared across events/notes/checklists within a day (already true for inserts via `shiftItemsAtOrAbove`).
- `reorderDayItems` runs inside a single transaction; sequential per-type updates assign positions `0..n-1` in render order.
- `DragOverlay` renders a portaled clone of the active row at its real height — no `scaleY` transform on the source.
- Optimistic UI: on drag end, day items update in local state immediately; server action runs in `React.startTransition`.
- Drag handle visibility mirrors `PlaceRow`: always visible on mobile, hover-only on desktop (`sm:opacity-0 sm:group-hover:opacity-100`).

**Ask First:**
- None.

**Never:**
- Do NOT keep two reorder actions in parallel (`reorderEvents` + new one) — the new action replaces it.
- Do NOT add per-type SortableContext filtering — single `SortableContext` with all item IDs.
- Do NOT introduce `animateLayoutChanges: () => false` overrides; `DragOverlay` makes them unnecessary.
- Do NOT change the schema or the existing `position` semantics.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Reorder event past a checklist | Drag event from pos 0 to pos 2 (over checklist at pos 2) | All three rows get new positions 0..n-1 in the new order; checklist height unchanged during drag | N/A |
| Reorder checklist past two events | Drag checklist from pos 3 to pos 0 | Server writes new positions across events + checklists tables; UI updates optimistically | N/A |
| Drop on self | active.id === over.id | No-op; no server call | N/A |
| Drop outside any item | over === null | No-op | N/A |
| Reorder within events only | Two events, no notes/checklists | Same end-result as previous `reorderEvents` (positions 0..n-1) | N/A |
| Server action failure | Network error during reorder | UI optimistic state rolls back on next server-rendered prop update | Errors thrown by action surface via standard Next.js error boundary |

</frozen-after-approval>

## Code Map

- `src/data/types.ts` -- add `ReorderDayItemsInput` (`dayId`, `orderedItems: Array<{ type: "event"|"note"|"checklist"; id: string }>`); remove `ReorderEventsInput`
- `src/app/(app)/trips/[tripId]/actions.ts` -- replace `reorderEvents` with `reorderDayItems`; single transaction updates positions across `events`, `itineraryNotes`, `itineraryChecklists`
- `src/components/packt/day-card.tsx` -- wrap `ChecklistItem` and `NoteItem` in sortable wrappers (mirror `SortablePlaceRow`); include all item IDs in `SortableContext`; add `DragOverlay`; track `activeItem` state on `onDragStart`; rewrite `handleDragEnd` for mixed-type ordering; rename `onReorderEvents` prop to `onReorderDayItems`
- `src/components/packt/checklist-item.tsx` -- accept `dragHandle?: React.ReactNode` prop, render adjacent to the header chevron with `PlaceRow`-style visibility classes
- `src/components/packt/note-item.tsx` -- accept `dragHandle?: React.ReactNode` prop, render in the right-side action area with `PlaceRow`-style visibility classes
- `src/app/(app)/trips/[tripId]/page-client.tsx` -- replace `handleEventReorder` with `handleDayItemsReorder` that calls `reorderDayItems`; pass `onReorderDayItems` to `DayCard`
- `src/components/packt/day-card.test.tsx` -- update existing DnD mocks/tests for new prop name; add tests for mixed-type drags (event over note, checklist over event)
- `src/components/packt/checklist-item.test.tsx` -- add render test for `dragHandle` prop
- `src/components/packt/note-item.test.tsx` -- add render test for `dragHandle` prop

## Tasks & Acceptance

**Execution:**
- [x] `src/data/types.ts` -- add `ReorderDayItemsInput`, remove `ReorderEventsInput`
- [x] `src/app/(app)/trips/[tripId]/actions.ts` -- replace `reorderEvents` with `reorderDayItems` (transaction across 3 tables)
- [x] `src/components/packt/checklist-item.tsx` -- add `dragHandle` prop and render slot
- [x] `src/components/packt/note-item.tsx` -- add `dragHandle` prop and render slot
- [x] `src/components/packt/day-card.tsx` -- single `SortableContext` over all items; `DragOverlay`; `activeItem` state; rewritten `handleDragEnd`; rename `onReorderEvents` → `onReorderDayItems`; wrap notes and checklists in sortable wrappers
- [x] `src/app/(app)/trips/[tripId]/page-client.tsx` -- wire `handleDayItemsReorder` to call `reorderDayItems`
- [x] `src/components/packt/day-card.test.tsx` -- update prop name; cover edge-case matrix rows (event↔checklist, checklist↔event, self-drop, null over, events-only)
- [x] `src/components/packt/checklist-item.test.tsx` -- assert `dragHandle` renders when provided
- [x] `src/components/packt/note-item.test.tsx` -- assert `dragHandle` renders when provided

**Acceptance Criteria:**
- Given a day with mixed events/notes/checklists, when the user drags a checklist past an event, then on drop the new positions are persisted via one `reorderDayItems` call and the order survives a page reload.
- Given any item is being dragged, when the cursor crosses a row of different height, then the drag preview's height does NOT change (no `scaleY` artifact).
- Given the new action exists, when grep'd, then `reorderEvents` is no longer referenced anywhere in `src/`.

## Spec Change Log

_None — patches applied directly, no spec amendments._

## Review Patches Applied (2026-05-16)

- **onDragCancel wired** — `day-card.tsx` now passes `onDragCancel={handleDragCancel}` to `DndContext` so the `DragOverlay` clears when the user presses ESC mid-drag.
- **Overlay clones drop wrapper ids** — `NoteItem` and `ChecklistItem` accept an optional `displayOnly` prop. When true, the wrapper omits its `id="note-…"` / `id="checklist-…"` attribute. `DragOverlay` passes `displayOnly` so the document never holds duplicate ids during a drag.
- **NoteItem reserves right padding when draggable** — outer wrapper applies `pr-16` when a `dragHandle` is present, so long content does not run under the absolutely-positioned grip + trash icons.

Other reviewer findings (concurrent-mutation idempotency, `position ?? i` collision, optimistic rollback, overlay clone side-effects) were appended to `deferred-work.md` as out-of-scope follow-ups.

## Design Notes

**DragOverlay pattern (golden example):**

```tsx
const [activeItem, setActiveItem] = useState<TimelineItem | null>(null);

<DndContext onDragStart={({ active }) => setActiveItem(findItem(active.id))}
            onDragEnd={handleDragEnd}>
  <SortableContext items={timelineItems.map((it) => it.data.id)}>
    {/* rows */}
  </SortableContext>
  <DragOverlay>
    {activeItem ? renderRow(activeItem, { isOverlay: true }) : null}
  </DragOverlay>
</DndContext>
```

Why `DragOverlay`: when present, dnd-kit sets `shouldDisplaceDragSource = false`, so the source DOM node receives no cursor-following transform and stays at its natural height. The overlay portal handles the visual preview. This bypasses the v10 `useDerivedTransform` `scaleY` path that broke the prior attempt.

`handleDragEnd` uses `arrayMove` on the unified `timelineItems` array (sorted by current position), then projects the new order into `Array<{ type, id }>` for the server action.

## Verification

**Commands:**
- `npm run lint` -- expected: no errors
- `npx tsc --noEmit` -- expected: no errors
- `npm test -- --run` -- expected: all unit tests pass, including new DnD tests
- `npm run build` -- expected: production build succeeds

**Manual checks:**
- Drag an event over a tall checklist: the dragged event preview does not stretch.
- Drag a checklist above two events, refresh: order persists.
- Mobile viewport (390px): drag handles are visible without hover.

## Suggested Review Order

**Server contract (the shape everything else conforms to)**

- New input type — positions are shared across all three day-item tables.
  [`types.ts:340`](../../src/data/types.ts#L340)

- Single transaction writes positions 0..n-1 across `events`, `itineraryNotes`, `itineraryChecklists`.
  [`actions.ts:155`](../../src/app/(app)/trips/[tripId]/actions.ts#L155)

**DnD rewrite — unified context + DragOverlay**

- `SortableContext` now spans all timeline items, not just events.
  [`day-card.tsx:451`](../../src/components/packt/day-card.tsx#L451)

- Drag start/cancel/end — projects `arrayMove` over `timelineItems` into a typed payload.
  [`day-card.tsx:305`](../../src/components/packt/day-card.tsx#L305)

- `DragOverlay` portal renders a `displayOnly` clone so the source stays at natural height (sidesteps v10 `scaleY`).
  [`day-card.tsx:525`](../../src/components/packt/day-card.tsx#L525)

- Sortable wrappers mint each item's drag handle via a shared helper.
  [`day-card.tsx:107`](../../src/components/packt/day-card.tsx#L107)

**Drag handle slots on Note + Checklist**

- `dragHandle` + `displayOnly` props; wrapper id omitted in overlay mode; right padding reserved when draggable.
  [`note-item.tsx:8`](../../src/components/packt/note-item.tsx#L8)

- Same shape on checklist header — `pr-16` reserves space; handle sits at `right: 32`, delete at `right: 2`.
  [`checklist-item.tsx:8`](../../src/components/packt/checklist-item.tsx#L8)

**Client wiring**

- `handleDayItemsReorder` fires `reorderDayItems` inside `React.startTransition`.
  [`page-client.tsx:94`](../../src/app/(app)/trips/[tripId]/page-client.tsx#L94)

**Test coverage (peripherals)**

- Mixed-type drag scenarios + `DragOverlay` mock + new payload assertions.
  [`day-card.test.tsx:595`](../../src/components/packt/day-card.test.tsx#L595)

- `dragHandle` slot render assertions.
  [`note-item.test.tsx:163`](../../src/components/packt/note-item.test.tsx#L163)
  [`checklist-item.test.tsx:592`](../../src/components/packt/checklist-item.test.tsx#L592)

# Deferred Work

## Checklist drag handle

**Deferred from:** checklist bug fixes session (2026-05-15)

Checklists are not draggable in the itinerary, unlike place rows (events). The `SortableContext` in `day-card.tsx` only includes events (`items={allEvents.map(e => e.id)}`). Checklists have a `position` field in the DB but no reorder action exists.

**Scope when picked up:**
- New `reorderChecklists` server action in `actions.ts`
- `SortableChecklistItem` wrapper in `day-card.tsx` (mirrors `SortablePlaceRow`)
- Include checklist IDs in `SortableContext items` alongside events
- Update `handleDragEnd` to handle checklist reordering
- `dragHandle` prop on `ChecklistItem`
- `onReorderChecklists` prop on `DayCard` + wired in `page-client.tsx`

---

## Note/checklist drag reordering — prior attempt post-mortem (2026-05-16)

An attempt was made to extend the existing `SortableContext` in `day-card.tsx` to include notes and checklists alongside events. Two sessions of work were reverted. The following issues were encountered and left unresolved:

### Bug A — positions not saved after drag (fixed, then regressed)
Filtering `SortableContext items` to only same-type IDs caused `findIndex` to return `-1` for items of the other type, so `arrayMove` produced no change and the new order was never persisted. Fixed by including all item IDs in `SortableContext`, but this fix introduced Bug C.

### Bug B — drag preview height stretches/shrinks when dragged over a different-height item (root cause identified, not fixed)
**Root cause:** dnd-kit v10 changed `defaultAnimateLayoutChanges` to return `true` during `isSorting` (not just post-drop). This activates `useDerivedTransform`, which applies `scaleY: newRect.height / oldRect.height` to the dragged element — scaling it to match whatever item's slot it's currently hovering over. When the timeline mixes short event rows and tall checklist/note cards, the active item visually stretches or shrinks as it crosses boundaries.

Attempted fix: `animateLayoutChanges: () => false` on each `useSortable` call. **Did not resolve the issue.**

Recommended fix not yet tried: **`DragOverlay`** from `@dnd-kit/core`. This renders the drag preview as a portal element independent of the sortable transforms. When a `DragOverlay` is present, dnd-kit sets `shouldDisplaceDragSource = false`, which prevents the active item's DOM node from receiving any cursor-following transform (it becomes a ghost placeholder). The `DragOverlay` then handles the visual preview, with a fixed height independent of what's being hovered over.

### Bug C — active item disappears when dragged over a different item type (fixed, then re-introduced)
When same-type filtering was applied to `SortableContext items`, items not in the active context had broken `useSortable` position calculations, causing the dragged item to vanish when hovering over them. Fixed by reverting to all-items in the context and conditionally suppressing displacement transforms on non-matching-type items via an `activeDragType` prop. This fix worked but Bug B remained.

### Recommended approach for next attempt
Use **`DragOverlay`** as the foundation. Key changes:
1. Add `DragOverlay` from `@dnd-kit/core` inside `DndContext`; render the appropriate row/card clone based on `activeDragType` + `activeDragId` state
2. Keep all item IDs in a single `SortableContext` (no type-filtering)
3. Remove all `animateLayoutChanges` overrides — they are no longer needed
4. The `DragOverlay` preview has a fixed rendered size; the ghost placeholder in the list retains its own height, so no scaling artifacts occur
5. Cross-type displacement animations can be suppressed per-type if still needed, but may not be necessary once `DragOverlay` is in place

See dnd-kit docs and `node_modules/@dnd-kit/sortable/dist/sortable.esm.js` for `shouldDisplaceDragSource` and `useDerivedTransform` internals.

---

## Follow-ups from itinerary drag-reorder review (2026-05-16)

Surfaced during step-04 review of `spec-add-itinerary-drag-reorder.md`. Real but out of scope for that ticket.

### DragOverlay clones run their own side effects
`DragOverlay` mounts a fresh `NoteItem` / `ChecklistItem` for the duration of a drag. Each clone runs its own `useEffect`s — most visibly, a completed checklist's 600 ms completion-animation timer fires again on drag start. The clones also drop props the live row had (`isLast`, `onAddDoc`, etc.), so the overlay can look subtly different from the row that was grabbed. Fix path: add a stripped-down presentational variant or a `displayOnly` mode that no-ops the effects, used by the overlay branch in `day-card.tsx`.

### Reorder action lacks ownership/integrity checks
`reorderDayItems` in `src/app/(app)/trips/[tripId]/actions.ts` writes positions per item, gated only by `id = item.id AND dayId = input.dayId`. If a peer added or moved an item between the client's drag start and submit, the per-row UPDATE silently affects zero rows for the missing IDs and renumbers the rest against a stale set, producing colliding `position` values across the three tables. Fix path: inside the transaction, `SELECT` the live `(dayId)` rows, assert the submitted set matches (or merge unknown items at the tail), and reject mismatched payloads.

### `position ?? i` fallback in DayCard timeline
`src/components/packt/day-card.tsx` builds the timeline with `position: e.position ?? i` for events but raw `position` for notes/checklists. `TripEvent.position` is optional in `src/data/types.ts` even though the DB column is `notNull`. If any event row arrives without `position`, the fallback (0..N within events) can collide with note/checklist positions and a subsequent reorder will silently overwrite all positions with the wrong order. Fix path: tighten `TripEvent.position` to required at the type layer and drop the fallback, or compute the fallback as `i + maxOtherPos + 1`.

### No optimistic rollback / no error surfacing on reorder failure
`handleDayItemsReorder` in `page-client.tsx` calls `reorderDayItems` inside `React.startTransition` with no try/catch and no local snapshot. On network failure or auth loss the dropped order persists in the DOM until `revalidatePath` returns server state — no toast, no rollback, no signal to the user. Fix path: optimistic local state with rollback, or a try/catch + toast.


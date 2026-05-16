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

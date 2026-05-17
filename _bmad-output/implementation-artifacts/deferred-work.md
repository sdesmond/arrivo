# Deferred Work

## Checklist drag handle

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


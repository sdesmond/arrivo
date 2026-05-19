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

---

## Follow-ups from companions feature review (2026-05-18)

Surfaced during step-04 review of `spec-profile-companions.md`. Pre-existing patterns applied consistently; real but out of scope.

### No server-side input validation on companion actions
`addCompanion` and `updateCompanion` in `profile/actions.ts` pass field values straight to the DB with no length cap, no age bounds check (negative integers are accepted), no date format validation on `passportExpiry`, and no sanitization on `passportNumber` or `packtUsername`. This matches the existing pattern for `addLoyaltyNumber`, `addWishlistDestination`, etc. Fix path: add a Zod schema validation layer at the server action boundary for all profile mutation actions.

### Position gaps after companion delete
`deleteCompanion` removes the row but does not recompact `position` values for remaining companions. Gaps (e.g. positions [0, 1, 3]) cause `addCompanion`'s `count(*)`-based position assignment to produce duplicates when any intermediate position was deleted. Same issue exists in `userLoyaltyNumbers` and `userWishlistDestinations`. Fix path: recompact positions in a transaction after delete, or switch to a sparse-safe ordering scheme.

### No max companions limit
`addCompanion` has no guard on how many companions a user can add — unlimited inserts are accepted. Same pattern as loyalty numbers. Fix path: add a per-user cap (e.g. 20) enforced at the server action level.

---

## Deferred from: code review of 1-1-infrastructure-prerequisites-and-documents-tab-scaffold (2026-05-19)

Surfaced during step-04 review of `1-1-infrastructure-prerequisites-and-documents-tab-scaffold.md`. Real but pre-existing or out of scope for the scaffold story.

### PlaceRowActionBar doc-count pill a11y
The "N docs" toggle in `place-row-action-bar.tsx:94-115` is a disclosure trigger with a `ChevronDown` rotating to indicate state, but the button has no `aria-expanded`, no `aria-label`, and no `title`. Screen-reader users can't tell it toggles a panel. Pre-existing pattern that was just relocated by the split. Fix path: add `aria-expanded={showDocs}` and `aria-controls` pointing at the DocsBlock; add `title="Show attached documents"`.

### Cost pill renders bare number with no currency or locale formatting
`place-row-action-bar.tsx:90` shows `p.cost.toFixed(2)` — no symbol, no thousands separator, no locale. Pre-existing. Fix path: route through `Intl.NumberFormat` with the trip's currency, or at minimum prefix with the `$` icon's currency.

### `toHHMM` / `formatTime` produce `NaN:NaN` on malformed input
`place-row-action-bar.tsx:6-16` — `new Date(iso)` of an invalid string yields NaN getters, and `t.split(":").map(Number)` returns `undefined` for missing segments. Output becomes literal `"NaN:NaN PM"` or `"undefined:00 AM"`. Pre-existing utility behavior carried over by the split. Fix path: validate inputs and return `null` / `"—"` for unparseable values.

### Mapper returns `"trip"` when both `tripId` and `eventId` are null
`src/lib/db-mappers.ts:73` — the new ternary classifies orphan documents (both FKs null) as trip-scoped, which would surface them in the Trip Documents tab even though they don't belong to any trip. The schema allows both columns to be nullable (`src/db/schema.ts:151-152`). Not introduced by this story (the previous mapper had the same gap inverted). Fix path: tighten the schema to require at least one FK, or have the mapper return `undefined`/throw for the orphan case.

### E2E coverage for TripDocsTab empty state (deferred to Story 1.2)
Story 1.1 ships an empty `TripDocsTab` rendered when the Documents tab is active, but adds no E2E scenario for it. Defer reason: scaffold-only, no flow yet — the empty state has no user interaction, the unit test already asserts the copy, and Story 1.2 introduces the real upload flow which will cover both empty and populated states in one feature. Reconsider if Story 1.2 is delayed and 1.1 ships standalone.


## Deferred from: code review of 1-3-delete-a-note (2026-08-12)

- No transaction around `deleteTripNote`'s select→access-check→delete sequence (`src/app/(app)/trips/[tripId]/actions.ts:572-580`) — a narrow TOCTOU window if trip access is revoked between the check and the delete. Pre-existing pattern shared with `deleteEvent`, `deleteItineraryNote`, and others; the story explicitly scoped this story's action to "no transaction needed."
- `setTimeout(..., 0)` focus restoration races the delete dialog's ~200ms CSS exit transition (`src/components/packt/trip-notes-tab.tsx:98`, `trip-notes-delete-dialog.tsx:38`). Pre-existing codebase convention, matching `add-doc-dialog.tsx`, `add-reservation-doc-dialog.tsx`, and `new-trip-dialog.tsx`.

## Deferred from: code review of story 1-2-expand-and-edit-a-note-in-place (2026-08-11)

- Missing-note update reports success: `updateTripNote` silently no-ops when the note is gone, but the client still announces "Note saved" and resets its baseline, and `expandedNoteId` is never reconciled against the `notes` prop. Unreachable today (no delete action exists); wire reconciliation + a client-side guard into Story 1.3.

## Deferred from: code review of 1-1-create-and-view-trip-notes (2026-08-08)

- Trip-detail header Edit/Share row causes page-level horizontal overflow at 320 CSS px with `--font-scale: 2`; measured main content width was 320px with 422px scroll width. `trip-detail-hero.tsx` is unchanged from story baseline, so address in shared trip-detail responsive cleanup.

# Deferred Work

## Deferred from: code review of travel-history (2026-06-20)

- **`handleConfirmDeleteTrip` silently no-ops with no user feedback when both `deletingTrip` and the explicit `tripId` argument are absent** — pre-existing pattern in `use-trips-page-handlers.ts`, duplicated as-is into the new `use-travel-history-page-handlers.ts` since the new hook deliberately mirrors the established Trips-page edit/delete logic. Not introduced by this change.
- **Stale `tripDateConfirmation`/`pendingTripPatch` can survive if a different trip is deleted while a date-conflict confirmation is pending for the trip being edited** — same pre-existing coupling in `use-trips-page-handlers.ts`, duplicated unchanged into the new hook.
- **View-mode persistence (`localStorage` + cookie) shares one `try/catch`** — if `localStorage.setItem` throws (private browsing, quota), the cookie write is skipped too even though it might still succeed. Pre-existing pattern in `trips-desktop-layout.tsx`, duplicated unchanged into `travel-history-list.tsx`.
- **Cards/List toggle buttons have no `aria-pressed`/`role="tab"` wiring** — pre-existing gap in `trips-desktop-layout.tsx`'s `seg-item` buttons, duplicated unchanged into `travel-history-list.tsx`.

## Deferred from: code review of reservation-title-service-number (2026-06-20)

- **No coordination across concurrent `updateReservation` calls from sibling inline fields** — `reservation-row.tsx` fires an independent `updateReservation` on each field's blur/Enter with no lock/debounce shared across fields (provider, service number, notes, etc.), so rapidly editing two adjacent fields can race. Pre-existing pattern across the whole component, surfaced incidentally by adding the service-number title field; not introduced by this change. Left deferred deliberately — see "No row-level locking / TOCTOU across server actions" above; a local fix here would be inconsistent with that app-wide decision.

Fixed directly instead of deferring (small, mechanical, low-risk):
- `ReservationInlineTextField` now resyncs `draft` from `value` whenever `value` changes while not editing (render-time derived-state pattern, not an effect, per `react-hooks/set-state-in-effect`). [reservation-inline-text-field.tsx]
- `reservation-row.tsx` now trims `provider`/`confirmationCode`/`serviceNumber`/`notes` when seeding local state from the reservation, so legacy whitespace-only values fall back to their placeholders.

## Deferred from: code review of 4-2-reservations-polish-and-hardening-batch (2026-06-20)

- **`createReservation`'s new startAt/endAt parse checks treat `null` as a valid date** — `new Date(null)` is epoch (not `NaN`), so a `null` `startAt`/`endAt` silently degrades to "no date" instead of being rejected. Pre-existing characteristic mirrored intentionally from `updateReservation`'s pattern per this story's AC1, which required matching it exactly. Not exploitable for data corruption. [src/app/(app)/trips/[tripId]/reservations/actions.ts:25,29]

## Candidate Future Epics

- **No server-side upload validation** — document/cover uploads accept any file content/type and use the unsanitized client filename as the public blob key. Needs a MIME allowlist + key-generation scheme decision (e.g. server-generated key + extension check) applied app-wide, not per-feature.
- **No row-level locking / TOCTOU across server actions** — trip/day/reservation mutations read-then-write within a transaction but without `SELECT ... FOR UPDATE` or optimistic-lock versioning, so concurrent edits can race on a stale snapshot. Needs an isolation-level/locking approach decision applied consistently across all server actions, not just reservations.

## Deferred from: code review of 3-1-cover-overflow-menu-edit-remove-info (2026-06-19)

- **TOCTOU race in `removeTripCover`** — pre-existing race condition across all server actions, not specific to this change. See Candidate Future Epics above.

## Deferred from: code review of 2-3-now-card-surfaces-linked-events (2026-06-19)

- **UTC midnight timezone edge case in today date filter** [queries.ts:176-177] — deferred, matches existing codebase pattern; a standalone, already-accepted day-boundary nuance.

## Deferred from: code review of 2-2-reservations-extend-the-itinerarys-date-range (2026-06-19)

- **No row-level locking around the trip-dates read + days/trip writes** — `extendTripDateRange` (`reservations/actions.ts:173-220`) reads `trip.startDate`/`endDate` and the existing `days` rows, then writes, all inside one transaction but with no `SELECT ... FOR UPDATE`. See Candidate Future Epics above.

## Deferred from: code review of 1-5-attach-documents-to-a-reservation (2026-06-16)

- **No server-side file-type validation on upload** — `uploadReservationDocument` only checks `file instanceof File` and `file.size`; any content/type is accepted and stored `access: "public"`. See Candidate Future Epics above.
- **Unsanitized client `file.name` used as the public blob key** — `put(file.name, file, ...)` lets the client filename become the blob pathname, risking collisions/overwrites and key injection. See Candidate Future Epics above.
- **Minor upload input edge cases** — a zero-byte `File` passes the upload guard and creates an empty document; `del()` could receive an empty array if every attached doc's `url` is null (the length guard is on the pre-filter array). Deferred as low-likelihood robustness polish.

## Deferred from: code review of 1-1-add-a-reservation (2026-06-14)

- **Dev-date-picker overlay overlaps the drawer footer Save button** — the dev-only floating mock-date toggle (fixed bottom-right, `z-index: 9999`) intercepts pointer clicks on the right-direction drawer's Save button in dev/E2E; the E2E step uses focus+Enter to work around it (`reservations.steps.ts:29`). Deferred because the overlay only renders when `NODE_ENV === "development"` and is absent in production. Consider repositioning the dev overlay or the drawer footer if it bites again.
- **Weak E2E assertions** — the "drawer is open" step asserts substring text visibility rather than drawer role/state. Deferred as test-robustness polish.

## Deferred from: code review of story-1.2 (2026-06-15)

- **Orphan end-anchor when `startAt` absent but `endAt` set** — `reservation-type-section.tsx` renders start and end anchor lines independently, so a reservation with only `endAt` shows a lone "Arrival/Check-out/Return" line with no start. Deferred as a low-severity data-shape edge not introduced by this change; the Story 1.1 drawer generally couples the two anchors.
- **E2E `toHaveCount(0)` can pass vacuously** — `Then("no reservation type sections are shown")` asserts zero matching buttons, which is satisfied before the tab content mounts. Deferred as a test-robustness nit; it is gated by the prior visible-empty-state step. Strengthen by asserting the empty-state title is visible within the same step.

## Deferred from: code review of 1-3-edit-a-reservation (2026-06-15)

- **`updateReservation` select-then-update is non-transactional** — the existence/`assertTripAccess` check and the `db.update` are separate awaited calls with no optimistic-lock/version guard, so two concurrent edits race (last-write-wins, TOCTOU). See Candidate Future Epics above.

## Deferred from: code review of 1-4-delete-a-reservation (2026-06-16)

- **E2E confirm-click may be intercepted by the dev-only mock-date overlay** — the `When("I confirm the deletion")` step uses a plain `.click()`; the fixed bottom-right mock-date toggle (`z-index: 9999`) can intercept clicks, and the established pattern in the same file uses focus+Enter for exactly this reason. Deferred — unverifiable in this environment because E2E can't run without Postgres; the dialog footer is likely center-screen so interception is improbable, but confirm when the E2E suite can run.


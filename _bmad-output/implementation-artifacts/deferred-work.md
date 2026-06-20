# Deferred Work

## Candidate Future Epics

- **Timezone-naive UTC storage** — reservations/events store and render local wall-clock times as literal UTC (`Z` suffix) with no timezone field; round-tripping through a non-UTC viewer shifts displayed times. Needs a timezone strategy decision (store a TZ offset/IANA zone per trip or per anchor, or accept destination-bound display) before any fix is implementation-level.
- **No server-side upload validation** — document/cover uploads accept any file content/type and use the unsanitized client filename as the public blob key. Needs a MIME allowlist + key-generation scheme decision (e.g. server-generated key + extension check) applied app-wide, not per-feature.
- **No row-level locking / TOCTOU across server actions** — trip/day/reservation mutations read-then-write within a transaction but without `SELECT ... FOR UPDATE` or optimistic-lock versioning, so concurrent edits can race on a stale snapshot. Needs an isolation-level/locking approach decision applied consistently across all server actions, not just reservations.

## Closed by Epic 4 (pending — remove these once 4.1/4.2 ship)

- **Dateless-trip + reservation interaction creates orphaned/duplicate day rows** — `extendTripDateRange` (`reservations/actions.ts:51-72`) treats a dateless trip's existing `date: null` `days` rows as unrelated to the reservation's new date range, inserting brand-new dated days alongside them rather than filling them in. Closed by Story 4.1 — requiring trip dates before a Reservation can be added prevents this state from occurring at all.
- **`createReservation` never validates `startAt`/`endAt` are well-formed ISO datetime strings** (`reservations/actions.ts:157-171`), unlike `updateReservation` which validates parseability. Closed by Story 4.2.
- **`REQUIRES_END_AT` duplicated** in `reservations/actions.ts` and `reservation-edit-drawer.tsx`. Closed by Story 4.2.
- **Error text not linked via `aria-describedby`** — `ReservationAnchorFieldset` sets an `errorId` on the error `<p>` but does not wire it to the date/time inputs. Closed by Story 4.2.
- **Disclosure button lacks `aria-controls`** — the accordion header `<button aria-expanded>` in `reservation-type-section.tsx` has no `aria-controls` linking it to the region it toggles. Closed by Story 4.2.
- **Reservation documents have no deterministic ordering** — the `inArray` docs query in `getTripDetail` (`queries.ts:249-252`) has no `orderBy`. Closed by Story 4.2.
- **`PLACEHOLDER_STYLE` duplicated** in `reservation-row.tsx` and `reservation-inline-text-field.tsx`. Closed by Story 4.2.
- **Stale `openSections` entry after last-of-type delete** — `reservations-tab.tsx` keeps the deleted type in its `openSections` Set. Closed by Story 4.2.
- **Duplicate provider names yield duplicate "Delete {provider}" aria-labels** — two reservations with the same provider produce identical delete-button accessible names. Closed by Story 4.2.
- **No in-flight/double-submit guard on inline edits** — Enter-then-blur or a rapid double-click can invoke `updateReservation` twice. Closed by Story 4.2.

## Deferred from: code review of 3-1-cover-overflow-menu-edit-remove-info (2026-06-19)

- **TOCTOU race in `removeTripCover`** — pre-existing race condition across all server actions, not specific to this change. See Candidate Future Epics above.

## Deferred from: code review of 2-3-now-card-surfaces-linked-events (2026-06-19)

- **UTC midnight timezone edge case in today date filter** [queries.ts:176-177] — deferred, matches existing codebase pattern. See Candidate Future Epics above.

## Deferred from: code review of 2-2-reservations-extend-the-itinerarys-date-range (2026-06-19)

- **No row-level locking around the trip-dates read + days/trip writes** — `extendTripDateRange` (`reservations/actions.ts:173-220`) reads `trip.startDate`/`endDate` and the existing `days` rows, then writes, all inside one transaction but with no `SELECT ... FOR UPDATE`. See Candidate Future Epics above.

## Deferred from: code review of 1-5-attach-documents-to-a-reservation (2026-06-16)

- **No server-side file-type validation on upload** — `uploadReservationDocument` only checks `file instanceof File` and `file.size`; any content/type is accepted and stored `access: "public"`. See Candidate Future Epics above.
- **Unsanitized client `file.name` used as the public blob key** — `put(file.name, file, ...)` lets the client filename become the blob pathname, risking collisions/overwrites and key injection. See Candidate Future Epics above.
- **Minor upload input edge cases** — a zero-byte `File` passes the upload guard and creates an empty document; `del()` could receive an empty array if every attached doc's `url` is null (the length guard is on the pre-filter array). Deferred as low-likelihood robustness polish.

## Deferred from: code review of 1-1-add-a-reservation (2026-06-14)

- **Local wall-clock times stored as UTC** — `toIsoDateTime` concatenates the date/time picker values with a literal `Z` (`reservation-edit-drawer.tsx:72`). See Candidate Future Epics above.
- **Dev-date-picker overlay overlaps the drawer footer Save button** — the dev-only floating mock-date toggle (fixed bottom-right, `z-index: 9999`) intercepts pointer clicks on the right-direction drawer's Save button in dev/E2E; the E2E step uses focus+Enter to work around it (`reservations.steps.ts:29`). Deferred because the overlay only renders when `NODE_ENV === "development"` and is absent in production. Consider repositioning the dev overlay or the drawer footer if it bites again.
- **No index on `reservations.trip_id`** — `getTripDetail` queries reservations by `tripId` but the table defines no index (unlike `events`). Deferred because the story spec explicitly specified no index; add later if per-trip scan cost matters.
- **Weak E2E assertions** — the "drawer is open" step asserts substring text visibility rather than drawer role/state. Deferred as test-robustness polish.
- **AC4 focus-on-error lacks direct test coverage** — the drawer's focus-to-invalid-end-anchor behavior works (DOM order puts the DatePicker button first), but the drawer unit test mocks `ReservationAnchorFieldset`, so the focus move is not directly asserted. Deferred as a test-coverage gap.

## Deferred from: code review of story-1.2 (2026-06-15)

- **Timezone-naive anchor formatting** — `formatAnchorDateTime` in `reservation-type-section.tsx` uses `toLocaleDateString`/`toLocaleTimeString` with no `timeZone` option, so a reservation time stored as UTC renders shifted to the viewer's local timezone. See Candidate Future Epics above.
- **Orphan end-anchor when `startAt` absent but `endAt` set** — `reservation-type-section.tsx` renders start and end anchor lines independently, so a reservation with only `endAt` shows a lone "Arrival/Check-out/Return" line with no start. Deferred as a low-severity data-shape edge not introduced by this change; the Story 1.1 drawer generally couples the two anchors.
- **E2E `toHaveCount(0)` can pass vacuously** — `Then("no reservation type sections are shown")` asserts zero matching buttons, which is satisfied before the tab content mounts. Deferred as a test-robustness nit; it is gated by the prior visible-empty-state step. Strengthen by asserting the empty-state title is visible within the same step.

## Deferred from: code review of 1-3-edit-a-reservation (2026-06-15)

- **Timezone-naive anchor edit/display** — `reservation-anchor-edit-field.tsx` reads/writes the anchor in UTC (`value.slice(0,10)`/`slice(11,16)` + a forced `Z` in `save()`), while `formatAnchorDateTime` renders in the viewer's local timezone. See Candidate Future Epics above.
- **`updateReservation` select-then-update is non-transactional** — the existence/`assertTripAccess` check and the `db.update` are separate awaited calls with no optimistic-lock/version guard, so two concurrent edits race (last-write-wins, TOCTOU). See Candidate Future Epics above.

## Deferred from: code review of 1-4-delete-a-reservation (2026-06-16)

- **E2E confirm-click may be intercepted by the dev-only mock-date overlay** — the `When("I confirm the deletion")` step uses a plain `.click()`; the fixed bottom-right mock-date toggle (`z-index: 9999`) can intercept clicks, and the established pattern in the same file uses focus+Enter for exactly this reason. Deferred — unverifiable in this environment because E2E can't run without Postgres; the dialog footer is likely center-screen so interception is improbable, but confirm when the E2E suite can run.

---
title: "Fold service number into reservation title"
type: "feature"
created: "2026-06-20"
status: "done"
context: []
baseline_commit: "68e086d6e0910afc48d550a18ab38e3d8dc94aa3"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** In the reservation row (`reservation-row.tsx`), the title shows only the provider (e.g. "Delta"). The flight/train/bus/ferry/cruise service number is buried in a details-row chip with a `Hash` icon, which is not recognizable as "the flight number" at a glance.

**Approach:** Render the service number inline in the title, right after the provider, at the same visual weight (e.g. "Delta 1233"). Edit it via the same click-to-edit inline-text pattern already used for the provider, instead of opening `ReservationFieldDialog`. Remove the now-redundant Hash chip and its dialog/state entirely for reservation types that have a service number label.

## Boundaries & Constraints

**Always:**

- Title row becomes a flex row containing two `ReservationInlineTextField` instances (provider, then service number) only when `SERVICE_NUMBER_LABELS[type]` is defined for the reservation's type; otherwise render the title exactly as today (provider only).
- Service number field uses the same `displayStyle`/`inputStyle` (font size, weight 600, color) as the provider field, so filled state reads as one visually uniform title ("Delta 1233").
- When empty, the service number field shows its own placeholder (e.g. "Add flight number") styled via the existing `PLACEHOLDER_STYLE` fallback already built into `ReservationInlineTextField` — no custom empty-state styling needed.
- `ariaLabel` for the service number field is the existing `serviceNumberLabel` value (e.g. "Flight number") so it stays distinguishable from "Provider" in tests/AX.
- Saving mirrors the existing `notes` field pattern exactly: `onSave={async (next) => { await updateReservation(reservation.id, { serviceNumber: next || undefined }); setServiceNumber(next || undefined); }}`.
- Remove: the `showServiceNumberDialog` state, the Hash-icon chip block (lines ~397-414), and the `ReservationFieldDialog` instance for service number (lines ~558-572). Remove the now-unused `Hash` import if nothing else in the file uses it.
- Update `reservation-row.test.tsx`: replace the three service-number-via-dialog tests (chip rendering, "Add flight number" button, dialog-based update, dialog-save-failure toast) with inline-edit equivalents matching the `provider`/`notes` test patterns (click title segment → textbox with `serviceNumberLabel` aria-label → type → Enter/blur → assert `updateReservation` call and updated display). Keep the "does not render a service number chip for lodging" test, adjusted to assert absence of the service-number field/button entirely (lodging has no `serviceNumberLabel`).
- No changes to `confirmationCode`'s chip/dialog — out of scope.
- No changes to `linked-events.ts` itinerary title derivation — out of scope (different display surface).

**Ask First:** None — design already confirmed with the user (fold into title in both empty/filled states, space separator, remove chip entirely).

**Never:** Do not introduce a new shared title sub-component; keep both fields as direct `ReservationInlineTextField` siblings in `reservation-row.tsx`'s existing title `div`. Do not touch `reservation-edit-drawer.tsx` (separate add-reservation form with explicit labeled fields — not in scope).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Filled flight | provider="Delta", serviceNumber="1233" | Title renders "Delta" then "1233" as two adjacent same-style clickable spans | N/A |
| Empty service number | type=flight, serviceNumber=undefined | Title renders "Delta" then muted placeholder "Add flight number" | N/A |
| Type with no label | type=lodging/rental-car/other | Title renders provider only; no second field, no chip | N/A |
| Edit and clear | user clears the service-number textbox and blurs/Enters | `updateReservation` called with `{ serviceNumber: undefined }`; display reverts to placeholder | Save failure shows toast via existing `onSave` try/catch in `ReservationInlineTextField` |

</frozen-after-approval>

## Code Map

- `src/components/packt/reservation-row.tsx` -- title row markup, state, and the chip/dialog to remove
- `src/components/packt/reservation-row.test.tsx` -- tests to update for the new inline title field
- `src/components/packt/reservation-inline-text-field.tsx` -- reused as-is, no changes
- `src/components/packt/reservation-type-badge.tsx` -- `SERVICE_NUMBER_LABELS` read as-is, no changes

## Tasks & Acceptance

**Execution:**

- [x] `src/components/packt/reservation-row.tsx` -- add a second `ReservationInlineTextField` for `serviceNumber` next to the provider field inside the existing title `div`, gated on `serviceNumberLabel` -- moves the edit affordance into the title
- [x] `src/components/packt/reservation-row.tsx` -- delete `showServiceNumberDialog` state, the Hash chip block, and the service-number `ReservationFieldDialog` instance; drop unused `Hash` import -- removes the now-redundant duplicate affordance
- [x] `src/components/packt/reservation-row.test.tsx` -- replace dialog-based service-number tests with inline-edit tests (render with value, render placeholder when absent, edit+save, edit+clear, save-failure toast) -- keeps coverage for the new interaction without testing removed dialog code

**Acceptance Criteria:**

- Given a flight reservation with `provider="Acme Air"` and `serviceNumber="AA123"`, when the row renders, then the title shows both as adjacent same-weight clickable text with no separate Hash chip anywhere in the row.
- Given a flight reservation with no `serviceNumber`, when the row renders, then the title shows the provider plus a muted "Add flight number" placeholder, clicking which opens an inline textbox (not a dialog).
- Given a lodging reservation, when the row renders, then the title shows only the provider, with no service-number field or chip present.
- Given an in-progress inline edit of the service number, when the user clears the value and commits, then `updateReservation` is called with `serviceNumber: undefined` and the title reverts to the placeholder.

## Design Notes

Mirror the `notes` field's inline-edit save pattern exactly (`next || undefined` for both the action call and local state) rather than the dialog's `next ?? ""` pattern — they differ because the dialog distinguished "no change" from "explicit clear" via `undefined` vs `""`, but `ReservationInlineTextField` already collapses that distinction (it only calls `onSave` when the trimmed draft differs from the current value), so the simpler `notes`-style handler is correct here.

## Verification

**Commands:**

- `npm test -- reservation-row` -- expected: all tests pass, including new inline-edit service-number tests
- `npm run test:coverage` -- expected: `src/components/packt/reservation-row.tsx` stays within existing thresholds (95% lines/functions, 90% branches)

**Manual checks (if no CLI):**

- In the running app, open a trip with a flight reservation that has a flight number set — confirm the title reads like "Delta 1233" with both segments independently clickable to edit, and no Hash-icon chip remains in the details row.

## Suggested Review Order

**Title row: inline service-number field**

- Entry point — the second inline field added next to the provider, gated on whether the type has a service-number label.
  [`reservation-row.tsx:250`](../../src/components/packt/reservation-row.tsx#L250)

- Shared title styling extracted to constants so the provider and service-number fields stay visually uniform when filled.
  [`reservation-row.tsx:42`](../../src/components/packt/reservation-row.tsx#L42)

- Edit-mode input width is fixed (not `flex:1`) so the short service-number input doesn't stretch across the row during edit.
  [`reservation-row.tsx:47`](../../src/components/packt/reservation-row.tsx#L47)

- Save mirrors the existing `notes` pattern (`next || undefined`) rather than the old dialog's `next ?? ""`.
  [`reservation-row.tsx:257`](../../src/components/packt/reservation-row.tsx#L257)

**Removed: chip + dialog**

- `showServiceNumberDialog` state dropped — no longer needed once editing moved into the title.
  [`reservation-row.tsx:105`](../../src/components/packt/reservation-row.tsx#L105)

**Tests**

- Filled-state test asserts provider and service number render as adjacent same-weight title buttons.
  [`reservation-row.test.tsx:626`](../../src/components/packt/reservation-row.test.tsx#L626)

- Inline edit/save replaces the old dialog-based update test.
  [`reservation-row.test.tsx:636`](../../src/components/packt/reservation-row.test.tsx#L636)

- New clear-to-placeholder test covers the I/O matrix's "Edit and clear" row.
  [`reservation-row.test.tsx:650`](../../src/components/packt/reservation-row.test.tsx#L650)

- Empty-state placeholder test confirms the title shows "Add flight number" instead of a chip.
  [`reservation-row.test.tsx:614`](../../src/components/packt/reservation-row.test.tsx#L614)

- Lodging (no service-number label) test confirms the field is entirely absent, not just empty.
  [`reservation-row.test.tsx:607`](../../src/components/packt/reservation-row.test.tsx#L607)

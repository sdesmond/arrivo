---
baseline_commit: cb77ac0
---

# Story 1.4: Delete a Reservation

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a trip planner,
I want to delete a Reservation, with a confirmation step,
so that I can remove bookings that were canceled or entered by mistake without accidentally losing data.

## Acceptance Criteria

1. **Delete affordance opens confirmation (FR4)** — In an expanded `ReservationTypeSection`, each `ReservationRow` shows a delete icon button (`Trash2`, `size-8`, `title`/`aria-label` of `Delete {provider}`). Clicking it opens `DeleteReservationAlertDialog` (new, modeled on `delete-trip-alert-dialog.tsx`), asking the user to confirm.
2. **Confirm deletes (FR4)** — Confirming calls `deleteReservation(reservation.id)` (`requireUser()` → fetch existing row for `tripId` → `assertTripAccess(tripId, "editor")` → `db.delete` → `revalidatePath(/trips/${tripId})`). The dialog closes; after the server re-render, the row is gone from its accordion section.
3. **Cancel does nothing (FR4)** — Canceling closes the dialog with no `deleteReservation` call and the row stays in place.
4. **Last-of-type removes the section (FR4)** — When the deleted Reservation was the only one of its type, `ReservationsTab`'s existing `sections` filter (`items.length > 0`) means that type's accordion section is absent after the `reservations` prop updates — no new filtering code needed, just verify it via a re-render test.
5. **Last-overall shows the empty state (FR6)** — When the deleted Reservation was the trip's last Reservation, `ReservationsTab` renders the FR-6 "No reservations yet" empty state after the `reservations` prop updates to `[]` — same existing logic, verify via a re-render test.

## Tasks / Subtasks

- [x] **Task 1: `deleteReservation` server action** (AC: 2, 3)
  - [x] Add `deleteReservation(reservationId: string): Promise<void>` to `src/app/(app)/trips/[tripId]/reservations/actions.ts`, mirroring `updateReservation`'s existence/access-check shape (see Dev Notes for exact implementation).
  - [x] Extend `src/app/(app)/trips/[tripId]/reservations/actions.test.ts` with `describe("deleteReservation", ...)`: throws "Reservation not found." when missing (no access check, no delete call); checks `assertTripAccess(tripId, user.id, "editor")` before deleting; calls `db.delete` with the right `where`; calls `revalidatePath("/trips/{tripId}")` on success.

- [x] **Task 2: `DeleteReservationAlertDialog` component** (AC: 1, 3)
  - [x] Create `src/components/packt/delete-reservation-alert-dialog.tsx` — copy the shape of `delete-trip-alert-dialog.tsx` exactly (same `AlertDialog*` imports from `@/components/ui/alert-dialog`, `size="sm"` content, ghost Cancel / destructive Action). Props: `provider: string`, `open`, `onOpenChange`, `onConfirm`, `isDeleting?`. Title: `Delete {provider}?`. Description: `This cannot be undone — this reservation will be permanently removed.`
  - [x] Create `src/components/packt/delete-reservation-alert-dialog.test.tsx` — copy `delete-trip-alert-dialog.test.tsx`'s structure (same `@/components/ui/alert-dialog` mock): title/description render with the provider name, `onConfirm` fires on "Delete" click, `onOpenChange(false)` fires on dismiss, `isDeleting` disables both buttons and shows "Deleting...".

- [x] **Task 3: Wire the delete affordance into `ReservationRow`** (AC: 1, 2, 3)
  - [x] In `src/components/packt/reservation-row.tsx`: add `useTransition` + `confirmOpen` state, a `Trash2` icon button (`size-8`, `title`/`aria-label` = `` `Delete ${provider}` ``) positioned at the top-right of the row via a `flex items-start justify-between gap-2` wrapper around the provider field, and render `<DeleteReservationAlertDialog>` at the end of the row. On confirm, call `deleteReservation(reservation.id)` inside `startTransition`, catch errors with `toast.error(...)`, close the dialog on success (see Dev Notes for full snippet).
  - [x] Extend `src/components/packt/reservation-row.test.tsx`: clicking the delete button opens the dialog; clicking the dialog's dismiss control closes it without calling `deleteReservation`; confirming calls `deleteReservation(reservation.id)`. Add `deleteReservation: vi.fn()` to the existing `vi.mock("@/app/(app)/trips/[tripId]/reservations/actions", ...)` and mock `@/components/ui/alert-dialog` the same way `delete-trip-alert-dialog.test.tsx` does.

- [x] **Task 4: Section/empty-state disappearance coverage** (AC: 4, 5)
  - [x] In `src/components/packt/reservations-tab.test.tsx`, add two tests using `rerender`: (a) render with two reservations of different types, then `rerender` with one of them removed — assert that type's accordion header (`getByRole("button", { name: /^Lodging, /})` etc.) is gone while the other remains; (b) render with a single reservation, `rerender` with `reservations={[]}` — assert "No reservations yet" is shown and no `/reservation,/`-named buttons remain. These confirm `ReservationsTab`'s existing `sections` filter (`items.length > 0`) and empty-state branch handle post-delete re-renders correctly — no new production code is needed for this task, it is verification only.

- [x] **Task 5: E2E scenario** (AC: 1, 2, 3, 4, 5)
  - [x] Add a scenario to `tests/e2e/features/reservations.feature`: given the trip has a single Lodging reservation (reuse the existing `"the trip has a Lodging reservation"` Object Mother step — one reservation total, so deleting it covers both "last of type" and "last overall" in one scenario), expand its section, click the delete affordance, confirm in the dialog, and verify the reservation is gone, its section is gone, and the "No reservations yet" empty state reappears.
  - [x] Add step definitions to `tests/e2e/steps/reservations.steps.ts` (see Dev Notes for exact text/selectors).

## Dev Notes

### Scope boundary — read first

- Documents/blob cleanup: **out of scope**. `documents.reservation_id` does not exist yet (Story 1.5 adds it; verified in `src/db/schema.ts` — `documents` currently has only nullable `tripId`/`eventId`). `deleteReservation` is a plain `db.delete` with no `del()`-before-cascade step, unlike `deleteEvent`.
- Linked Events on the Itinerary (FR4's second sentence) — **Epic 2**, not built yet. `revalidatePath` is sufficient; no special-casing.
- No client-side list mutation is needed anywhere. Exactly like `handleEventDelete` (`use-trip-detail-handlers.ts:100-104`), which just calls `deleteEvent(id)` inside `startTransition` and relies on `revalidatePath` + the server component re-render to refresh the `reservations` prop passed down to `ReservationsTab`. `ReservationRow` must NOT try to remove itself from a parent array — there is no such callback, and none is needed.
- AC4/AC5 require **zero changes** to `reservation-type-section.tsx` or `reservations-tab.tsx` — `ReservationsTab`'s existing `sections = ... .filter((section) => section.items.length > 0)` and its `sections.length === 0` empty-state branch already produce the required behavior once `reservations` shrinks. Task 4 is verification (re-render tests), not implementation.

### Task 1 — `deleteReservation`

Add to `src/app/(app)/trips/[tripId]/reservations/actions.ts` (current file already imports `eq`, `requireUser`, `assertTripAccess`, `db`, `reservations`, `revalidatePath`):

```ts
export async function deleteReservation(reservationId: string): Promise<void> {
  const user = await requireUser();

  const [existing] = await db.select().from(reservations).where(eq(reservations.id, reservationId));
  if (!existing) {
    throw new Error("Reservation not found.");
  }

  await assertTripAccess(existing.tripId, user.id!, "editor");

  await db.delete(reservations).where(eq(reservations.id, reservationId));

  revalidatePath(`/trips/${existing.tripId}`);
}
```

This mirrors `updateReservation`'s existing fetch-then-access-check shape (Story 1.3) — reuse the same `db.select().from(reservations).where(eq(reservations.id, reservationId))` pattern for the not-found/`tripId` lookup.

Test mocking: `actions.test.ts` already hoists `db.select`/`db.update`/`db.insert`/`requireUser`/`assertTripAccess`/`revalidatePath` mocks (`vi.hoisted`, lines 4-13). Add `delete: vi.fn()` to the `db` mock object and mock its return shape the same way `db.update` is mocked in the `updateReservation` block (`db.delete.mockReturnValue({ where: async () => undefined })`). Reuse `mockExistingReservation`/`baseRow` from the `updateReservation` describe block (hoist them to module scope or duplicate — either is fine).

### Task 2 — `DeleteReservationAlertDialog`

`delete-trip-alert-dialog.tsx` (full source, copy this shape exactly — only the prop name, title, and description text change):

```tsx
"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface DeleteReservationAlertDialogProps {
  provider: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
  isDeleting?: boolean;
}

export function DeleteReservationAlertDialog({
  provider,
  open,
  onOpenChange,
  onConfirm,
  isDeleting = false,
}: DeleteReservationAlertDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader className="place-items-start text-left">
          <AlertDialogTitle>Delete {provider}?</AlertDialogTitle>
          <AlertDialogDescription className="text-left">
            This cannot be undone — this reservation will be permanently removed.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="ghost" disabled={isDeleting}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={isDeleting}
            onClick={() => {
              void onConfirm();
            }}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

Test: copy `delete-trip-alert-dialog.test.tsx` verbatim, swap `tripName`/`Tokyo Adventure` → `provider`/some test provider name, and `/Delete\s+Tokyo Adventure\?/` → `/Delete\s+<name>\?/`. Same `@/components/ui/alert-dialog` mock (passthrough components + a "dismiss-dialog" button calling `onOpenChange(false)`).

### Task 3 — `ReservationRow` wiring

Current `reservation-row.tsx` (post-Story-1.3) returns a single `<div className="px-4 py-3.5" style={{borderBottom: ...}}>` with the provider field first, then start/end anchors, confirmation code, notes — all stacked. Add:

1. New imports: `useTransition` (alongside the existing `useState` import), `Trash2` from `lucide-react`, `toast` from `sonner`, `deleteReservation` from `@/app/(app)/trips/[tripId]/reservations/actions` (extend the existing `updateReservation` import), `DeleteReservationAlertDialog` from `./delete-reservation-alert-dialog`.
2. New state: `const [confirmOpen, setConfirmOpen] = useState(false);` and `const [isDeleting, startTransition] = useTransition();`.
3. A delete handler:

```ts
function handleConfirmDelete() {
  startTransition(async () => {
    try {
      await deleteReservation(reservation.id);
      setConfirmOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete reservation.");
    }
  });
}
```

4. Wrap the provider field and a new delete button in a flex row, keep everything else unchanged:

```tsx
return (
  <div className="px-4 py-3.5" style={{ borderBottom: isLast ? "none" : "1px solid var(--line)" }}>
    <div className="flex items-start justify-between gap-2">
      <div className="flex-1">
        <ReservationInlineTextField
          value={provider}
          ariaLabel="Provider"
          /* ...unchanged props... */
        />
      </div>
      <button
        type="button"
        title={`Delete ${provider}`}
        aria-label={`Delete ${provider}`}
        onClick={() => setConfirmOpen(true)}
        className="inline-flex items-center justify-center size-8 shrink-0 rounded"
        style={{ border: "none", background: "transparent", color: "var(--fg-3)", cursor: "pointer" }}
      >
        <Trash2 size={15} strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
    {/* ...start anchor, end anchor, confirmation code, notes — unchanged... */}
    <DeleteReservationAlertDialog
      provider={provider}
      open={confirmOpen}
      onOpenChange={setConfirmOpen}
      onConfirm={handleConfirmDelete}
      isDeleting={isDeleting}
    />
  </div>
);
```

Use the live `provider` state (not `reservation.provider`) for the button's `aria-label`/`title` and the dialog's `provider` prop, so it reflects an in-session rename (Story 1.3).

Test additions to `reservation-row.test.tsx`: mock `@/components/ui/alert-dialog` exactly as `delete-trip-alert-dialog.test.tsx` does (passthrough components + "dismiss-dialog" button), add `deleteReservation: vi.fn()` to the existing actions mock. New tests:
- Clicking `getByRole("button", { name: "Delete Grand Hotel" })` shows the dialog (`getByText(/Delete\s+Grand Hotel\?/)`).
- Clicking "dismiss-dialog" closes it without calling `deleteReservation`.
- Clicking "Delete" (the `AlertDialogAction`) calls `deleteReservation("res-1")`.

### Task 5 — E2E scenario

Add to `tests/e2e/features/reservations.feature`:

```gherkin
  Scenario: Delete a reservation removes it, its section, and shows the empty state
    Given the trip has a Lodging reservation
    And the "Lodging" reservation section is expanded
    When I delete the reservation "Original Hotel Name"
    And I confirm the deletion
    Then the reservation "Original Hotel Name" is no longer shown
    And no reservation type sections are shown
    And I see the "No reservations yet" empty state
```

The existing `"Given the trip has a Lodging reservation"` step (Story 1.3) materializes exactly one reservation, so this single scenario exercises both AC4 (last-of-type) and AC5 (last-overall).

Add to `tests/e2e/steps/reservations.steps.ts`:

```ts
When("I delete the reservation {string}", async ({ page }, provider: string) => {
  await page.getByRole("button", { name: `Delete ${provider}` }).click();
});

When("I confirm the deletion", async ({ page }) => {
  // The dev-only mock-date overlay (fixed bottom-right, z-index 9999) can intercept this click in
  // dev/E2E — if a real click is flaky, use the same focus+Enter workaround as the "Save" step
  // (see "I click {string} on the reservation drawer" above / deferred-work.md).
  await page.getByRole("button", { name: "Delete" }).click();
});

Then("the reservation {string} is no longer shown", async ({ page }, provider: string) => {
  await expect(page.getByText(provider)).not.toBeVisible();
});
```

`"I confirm the deletion"` selects by accessible name `"Delete"` — the row's delete icon button has accessible name `"Delete {provider}"`, not bare `"Delete"`, so there is no ambiguity with `AlertDialogAction`.

### Testing standards summary (NFR2/NFR3)

- Coverage ≥95% lines/functions, ≥90% branches on `src/lib/**` and `src/components/packt/**` — applies to `delete-reservation-alert-dialog.tsx`, the edited `reservation-row.tsx`, and `reservations/actions.ts`.
- Mock `deleteReservation`/`updateReservation` (`vi.mock("@/app/(app)/trips/[tripId]/reservations/actions", ...)`) and `@/components/ui/alert-dialog` in component tests — do not hit the DB.
- E2E scenario must use `scenario.materialize(...)` (Object Mother) — no `global-setup.ts` changes.

## Project Structure Notes

- New files: `src/components/packt/delete-reservation-alert-dialog.tsx` (+ `.test.tsx`).
- Modified files: `src/app/(app)/trips/[tripId]/reservations/actions.ts` (+ `deleteReservation`), `src/app/(app)/trips/[tripId]/reservations/actions.test.ts` (+ `deleteReservation` tests), `src/components/packt/reservation-row.tsx` (+ delete affordance/dialog), `src/components/packt/reservation-row.test.tsx`, `src/components/packt/reservations-tab.test.tsx` (+ re-render tests for AC4/AC5), `tests/e2e/features/reservations.feature`, `tests/e2e/steps/reservations.steps.ts`.
- No new top-level directories or routes; `delete-reservation-alert-dialog.tsx` follows the existing flat `src/components/packt/` convention, alongside `delete-trip-alert-dialog.tsx`.

### References

- [Source: _bmad-output/epics.md#Story 1.4: Delete a Reservation] — full AC text (Given/When/Then), FR4
- [Source: _bmad-output/architecture.md] — lines 51, 129, 149, 153, 196-211: `del()`-before-cascade applies only once `documents.reservation_id` exists (Story 1.5); `deleteReservation` follows the standard `requireUser()` → `assertTripAccess(tripId, "editor")` → mutate → `revalidatePath` shape
- [Source: src/components/packt/delete-trip-alert-dialog.tsx, delete-trip-alert-dialog.test.tsx] — exact pattern copied for `DeleteReservationAlertDialog`
- [Source: src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts:100-104] — `handleEventDelete` precedent: `startTransition` + server action + `revalidatePath`, no local list mutation
- [Source: src/components/packt/reservations-tab.tsx] — `sections` filter (`items.length > 0`) and empty-state branch that already satisfy AC4/AC5 once `reservations` shrinks
- [Source: src/app/(app)/trips/[tripId]/reservations/actions.ts, actions.test.ts] — `updateReservation`'s fetch-then-access-check pattern (Story 1.3) reused by `deleteReservation`
- [Source: src/db/schema.ts#reservations, #documents] — confirms `documents.reservation_id` does not exist yet (no cascade/blob cleanup in this story)
- [Source: tests/e2e/features/reservations.feature, tests/e2e/steps/reservations.steps.ts] — `"the trip has a Lodging reservation"` Object Mother step (Story 1.3) reused for the new scenario
- [Source: _bmad-output/implementation-artifacts/1-3-edit-a-reservation.md] — prior story's `ReservationRow` structure, styling constants, and dev-overlay E2E caveat
- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — dev-only mock-date overlay z-index/click-interception caveat (line 6)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

- AC4/AC5 required zero production code changes — `ReservationsTab`'s existing `sections.filter(s => s.items.length > 0)` and `sections.length === 0` empty-state branch already handle these cases; Task 4 was verification only.
- No blob/document cleanup in `deleteReservation` — `documents.reservation_id` does not exist yet (Story 1.5). Plain `db.delete` is correct.
- `ReservationRow` uses the live `provider` state (not `reservation.provider`) for the delete button aria-label and dialog prop, so an in-session rename (Story 1.3) is reflected correctly.
- E2E environment lacks PostgreSQL in CI; unit tests (1944 passed), TypeScript, and ESLint all pass clean. E2E scenario code is complete and validated structurally.
- Coverage: lines 96.24%, functions 95.39%, branches 90.38% — all above thresholds.

### File List

- `src/app/(app)/trips/[tripId]/reservations/actions.ts` — added `deleteReservation`
- `src/app/(app)/trips/[tripId]/reservations/actions.test.ts` — added `describe("deleteReservation", ...)` (4 tests)
- `src/components/packt/delete-reservation-alert-dialog.tsx` — new file
- `src/components/packt/delete-reservation-alert-dialog.test.tsx` — new file (4 tests)
- `src/components/packt/reservation-row.tsx` — added delete affordance, `DeleteReservationAlertDialog`, `useTransition`, `confirmOpen` state
- `src/components/packt/reservation-row.test.tsx` — added 3 delete tests + alert-dialog mock
- `src/components/packt/reservations-tab.test.tsx` — added 2 re-render tests (AC4, AC5)
- `tests/e2e/features/reservations.feature` — added delete scenario
- `tests/e2e/steps/reservations.steps.ts` — added 3 step definitions

## Change Log

| Date | Change |
| --- | --- |
| 2026-06-15 | Story 1.4 created via `bmad-create-story` (ultimate context engine analysis). Status set to `ready-for-dev`. |
| 2026-06-16 | Story 1.4 implemented — all 5 tasks complete. Status set to `review`. |

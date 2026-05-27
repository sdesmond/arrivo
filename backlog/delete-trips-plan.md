# Delete Trips — Implementation Plan

**Goal:** Give users a way to delete trips from listing surfaces and the trip detail page.

## Split refactors (pre-requisite)

Before adding delete code, split these oversized files:

### Extract `DeleteTripAlertDialog` from `trip-edit-sheet.tsx`

**`src/components/packt/delete-trip-alert-dialog.tsx`** (new)

- Props: `tripName: string`, `open: boolean`, `onOpenChange: (open: boolean) => void`, `onConfirm: () => void`, `isDeleting?: boolean`
- Render `AlertDialog` with title "Delete {tripName}?", description "This cannot be undone — all days, events, notes, and documents will be permanently removed."
- Footer: Cancel (`AlertDialogCancel` ghost) + Delete (`AlertDialogAction variant="destructive"`)
- Reduces `trip-edit-sheet.tsx` by ~40 lines

**`src/components/packt/trip-edit-sheet.tsx`**

- Remove inline date-change `AlertDialog` (lines 282–319) — extract to new file below
- Import and use `TripDateChangeConfirmationDialog` instead

### Extract `TripDateChangeConfirmationDialog` from `trip-edit-sheet.tsx`

**`src/components/packt/trip-date-change-confirmation-dialog.tsx`** (new)

- Props: `dateChangeConfirmation`, `dateFormat`, `saving`, `onResolveDateChange`, `onCancelDateChange`
- Render the inline AlertDialog block from lines 282–319

**`src/components/packt/trip-edit-sheet.tsx`**

- Remove the inline date-change AlertDialog block
- Import and use `TripDateChangeConfirmationDialog`
- Final size: ~260 lines (was 334)

### Split `trips-mobile-tabs.tsx` into separate files

- `MobileActiveTab` → `src/components/packt/mobile-active-tab.tsx`
- `MobileUpcomingTab` → `src/components/packt/mobile-upcoming-tab.tsx`
- `MobilePastTab` → `src/components/packt/mobile-past-tab.tsx`
- `MobileUnscheduledTab` → `src/components/packt/mobile-unscheduled-tab.tsx`
- `src/components/packt/trips-mobile-tabs.tsx` becomes a barrel re-export

## Implementation (after split refactors above)

### 1. Server action

**`src/app/(app)/trips/actions.ts`** — no change needed. `deleteTrip()` already calls `revalidatePath("/trips")`. Do NOT add `redirect` — let client navigation handle it (detail page calls `router.push("/trips")`, listing page stays in place).

### 2. Central confirmation dialog (trips listing page)

**`src/app/(app)/trips/use-trips-page-handlers.ts`**

- Import `deleteTrip` from `./actions`
- Add `deletingTrip: Trip | null` state + `setDeletingTrip`
- Add `isDeleting` via `useTransition`
- Add `handleConfirmDeleteTrip()` that calls `deleteTrip(deletingTrip.id)`, resets `deletingTrip`, `startTransition` wrapper with error toast

**`src/app/(app)/trips/page-client.tsx`**

- Render `<DeleteTripAlertDialog>` when `deletingTrip !== null` with `tripName`, `open`, `onOpenChange`, `onConfirm`, `isDeleting`
- Pass `onDeleteTrip={(t) => h.setDeletingTrip(t)}` to `TripsDesktopLayout` and `TripsMobileLayout`
- Pass `onDelete={() => h.handleConfirmDeleteTrip()}` / `isDeleting={h.isDeleting}` to `TripEditSheet`

### 3. Trip Edit Sheet (universal delete from any context)

**`src/components/packt/trip-edit-sheet.tsx`**

- Add to `TripEditSheetProps`:
  - `onDelete?: () => void`
  - `isDeleting?: boolean`
- Add `[isDeleteDialogOpen, setDeleteDialogOpen]` local state
- In `DrawerFooter`, below a `<Separator />`, add:
  ```
  <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)} disabled={saving}>
    Delete trip
  </Button>
  ```
- Render `<DeleteTripAlertDialog>` bound to `isDeleteDialogOpen`, `draft.name`, `onDelete`

### 4. Trip detail page

**`src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts`**

- Import `deleteTrip` from `../actions`
- Add `isDeleting` via `useTransition`
- Add `handleDeleteTrip()` that calls `deleteTrip(trip.id)` then `router.push("/trips")` + `router.refresh()`
- Return `handleDeleteTrip` and `isDeleting` from interface + hook

**`src/app/(app)/trips/[tripId]/page-client.tsx`**

- Pass `onDelete={handlers.handleDeleteTrip}` + `isDeleting={handlers.isDeleting}` to `TripEditSheet`

### 5. TripCard overflow menu

**`src/components/packt/trip-card.tsx`**

- Add imports: `Trash2`, `MoreHorizontal` from `lucide-react`; `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem` from `@/components/ui/dropdown-menu`
- Add `onDeleteTrip?: (trip: Trip) => void` prop
- Replace the pencil-only button area in the footer with a `DropdownMenu`:
  - Trigger: `MoreHorizontal` button (`p-1 rounded-[6px] text-fg-4 hover:text-fg hover:bg-surface-2 transition-colors`, `title="Trip options"`, `onClick` with `e.preventDefault/stopPropagation`)
  - Content: "Edit trip" (`Pencil` icon, calls `onEditTrip(trip)`) + "Delete trip" (`Trash2` icon, `variant="destructive"`, calls `onDeleteTrip(trip)`)
  - Both items use `e.preventDefault()` + `e.stopPropagation()`

**`src/components/packt/unscheduled-section.tsx`**

- Add `onDeleteTrip` prop, pass to `TripCard`

**`src/components/packt/trips-desktop-layout.tsx`**

- Add `onDeleteTrip` prop, pass to `UnscheduledSection`, `TripCard` in upcoming grid, and `PastTripsList`

### 6. PastTripsList (desktop)

**`src/components/packt/trips-past-list.tsx`**

- Add imports: `Trash2` from `lucide-react`
- Add `onDeleteTrip?: (trip: Trip) => void` prop
- Add destructive "Delete trip" `DropdownMenuItem` below "Edit trip":
  ```
  <DropdownMenuItem variant="destructive" onClick={(e) => { e.stopPropagation(); onDeleteTrip?.(trip); }}>
    <Trash2 size={13} strokeWidth={1.5} />
    Delete trip
  </DropdownMenuItem>
  ```

### 7. MobilePastTab

**`src/components/packt/mobile-past-tab.tsx`** (new — extracted during split)

- Add `onEditTrip?: (trip: Trip) => void` + `onDeleteTrip?: (trip: Trip) => void` props
- Replace each `<Link>` wrapper with a `<div>` with same card styling, containing: `<TripCover>` + `<Link>` for name/detail + `DropdownMenu` at trailing edge
- Menu items: "Edit trip" (`Pencil`) + "Delete trip" (`Trash2`, `variant="destructive"`)
- Trigger button must have min touch target: `style={{ minHeight: 44, minWidth: 44 }}`

**`src/components/packt/trips-mobile-layout.tsx`**

- Add `onEditTrip` + `onDeleteTrip` props, pass to `MobilePastTab`

**`src/app/(app)/trips/page-client.tsx`**

- Pass `onEditTrip={(t) => h.setEditingTrip(t.id)}` + `onDeleteTrip={(t) => h.setDeletingTrip(t)}` to `TripsMobileLayout`

## UX Flow

| Entry point                          | Steps to delete                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| TripCard (upcoming/unscheduled grid) | `⋯` → "Delete trip" → confirmation dialog → "Delete" → revalidates listing                 |
| PastTripsList (desktop)              | `⋯` → "Delete trip" → same confirmation → "Delete"                                         |
| MobilePastTab                        | `⋯` → "Delete trip" → same confirmation → "Delete"                                         |
| Trip Edit Sheet (from any context)   | Edit trip → scroll down → "Delete trip" button → confirm → deletes + redirects to `/trips` |
| Trip detail page                     | Edit → "Delete trip" → confirm → deletes + redirects to `/trips`                           |

## Tests to update

### Split refactor tests

- `trip-edit-sheet.test.tsx` — update imports after extraction, verify component still renders correctly
- `trips-mobile-tabs.test.tsx` — update imports after split, each new tab file gets its own test

### Delete feature tests (unit)

- `delete-trip-alert-dialog.test.tsx` (new) — assert renders title with trip name, confirm/cancel buttons fire callbacks
- `trip-edit-sheet.test.tsx` — assert "Delete trip" button renders in footer, opens delete dialog on click
- `trips-past-list.test.tsx` — assert "Delete trip" `DropdownMenuItem` renders with destructive variant
- `trip-card.test.tsx` — assert `MoreHorizontal` trigger renders, dropdown contains "Delete trip" item
- `mobile-past-tab.test.tsx` (new) — assert overflow menu renders with delete option
- `trips-desktop-layout.test.tsx` — verify `onDeleteTrip` prop is passed through to `UnscheduledSection`, `TripCard`, `PastTripsList`
- `unscheduled-section.test.tsx` — verify `onDeleteTrip` prop forwarded to `TripCard`
- `trips-mobile-layout.test.tsx` — verify `onDeleteTrip` prop passed to `MobilePastTab`

### E2E

- New file: `tests/e2e/features/trip-delete.feature`
  ```gherkin
  Scenario: Delete a trip from the listing page
    Given I am logged in
    And I have at least one past trip
    When I open the trip options menu for that trip
    And I click "Delete trip"
    And I confirm the deletion
    Then the deleted trip is no longer visible in the trip list
  ```
- New step definitions in `tests/e2e/steps/trip-delete-steps.ts`
- Reuse existing `global-setup.ts` seed data — the E2E seeded trip is past

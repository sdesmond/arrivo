---
baseline_commit: 525f2d7d8d66bb265a4fb63e3988ac317c6bfb88
---

# Story 1.10: View and Manage All Trip Expenses in a Table

Status: done

## Story

As a trip owner/editor,
I want to see every expense on my trip in one sortable table,
So that I can review and manage my spend without hunting through the itinerary or reservations.

## Acceptance Criteria

1. **Expense-table renders below category tiles** — Row-per-expense `expense-table` (UX-DR28) on Budget tab, below the `category-tile` grid, listing every `expenses` row with Date, Title, Category, and Amount columns (FR22)

2. **Title content** — Shows the linked event's name, the linked reservation's provider, or — for Misc — its note, falling back to its category label when no note is set

3. **Client-side sortable headers** — Clicking Date, Amount, Category, or Title column header sorts ascending on first click, descending on second, with a sort-direction icon. No server request — operates on the already-loaded `expenses` array (FR22, UX-DR28)

4. **Event-linked row click → Itinerary tab** — Navigates to `?tab=itin&focus=<eventId>`, reusing the existing `useFocusScroll` / `?focus=` mechanism (FR22)

5. **Reservation-linked row click → Reservations tab** — Navigates to `?tab=res&highlight=<reservationId>`, reusing the existing `buildReservationsDeepLinkHref` and reservation highlight mechanism (FR22)

6. **Misc Expense row click → edit modal** — Opens `TripAddExpenseModal` in edit mode, pre-filled with the row's amount, currency, category, date, and note (FR22, UX-DR29)

7. **Edit modal: Save updates, Remove deletes** — Save calls the existing `updateExpense` action; Remove calls the existing `deleteExpense` action. Both update the expense table, Actual figure, and category tiles immediately (FR22, UX-DR29)

8. **Zero expenses → no table** — When trip has zero `expenses` rows, the existing "No expenses yet" message is shown and no table is rendered (FR22)

## Tasks / Subtasks

### 1. Build expense-table component (AC: 1, 2, 3, 4, 5, 6, 8)

- [x] Create `src/components/packt/expense-table.tsx`:
  - Define `ExpenseTableProps` interface with: `expenses: Expense[]`, `tripId: string`, `events: TripEvent[]`, `reservations: Reservation[]`, `onEditExpense: (expense: Expense) => void`
  - Renders below the category tile grid (div/card-based like `field-row`, not `<table>`) with columns: Date, Title, Category, Amount
  - Title column: for `eventId`-linked rows, show the matching event's `name`; for `reservationId`-linked rows, show the matching reservation's `provider`; for unlinked (Misc) rows, show `note` or fall back to `CATEGORY_LABELS[category]`
  - Column headers are clickable buttons — clicking toggles ascending/descending sort with a direction icon (chevron, `strokeWidth={1.5}`)
  - Sorting is client-side: `useMemo` over the expenses array, no server request
  - Row targets meet `h-8` minimum interactive sizing
  - When `expenses.length === 0`, returns `null` (caller shows "No expenses yet")
- [x] Create `src/components/packt/expense-table.test.tsx`:
  - "renders all expense rows with Date, Title, Category, Amount columns"
  - "shows event name for event-linked expense"
  - "shows reservation provider for reservation-linked expense"
  - "shows note for Misc expense, falls back to category label when no note"
  - "sorts by date ascending on first Date header click, descending on second"
  - "sorts by amount ascending on first Amount header click"
  - "sorts by category ascending on first Category header click"
  - "sorts by title ascending on first Title header click"
  - "shows sort direction icon on active column"
  - "returns null when expenses array is empty"

### 2. Wire expense-table into TripBudgetTab (AC: 1, 4, 5, 6, 8)

- [x] In `src/components/packt/trip-budget-tab.tsx`:
  - Import `ExpenseTable` and render it below the category tile grid, inside the `expenses.length > 0` block
  - Add `events` and `reservations` props to `TripBudgetTabProps` — needed so the table can resolve event/reservation names and build navigation links
  - Add `onEditExpense` callback prop — called when a Misc Expense row is clicked
  - Manage `editingExpense: Expense | null` state — set when a Misc Expense row is clicked, cleared on modal close
  - Pass `editingExpense` to `TripAddExpenseModal` as an optional `expense` prop (edit mode)
  - Modal `open` prop: `showAddExpenseModal || editingExpense !== null` — either add or edit mode opens it
  - Import `CATEGORY_LABELS` (already defined in the file) for the Title fallback
- [x] Update `src/components/packt/trip-budget-tab.test.tsx`:
  - "renders expense-table below category tiles when expenses exist"
  - "does not render expense-table when expenses array is empty"
  - "opens misc expense modal in edit mode when a misc expense row is clicked"
  - Update existing tests that don't pass `events`/`reservations` props — make those props optional with default `[]`

### 3. Extend TripAddExpenseModal for dual-mode add/edit (AC: 6, 7)

- [x] In `src/components/packt/trip-add-expense-modal.tsx`:
  - Add optional `expense?: Expense` prop to `TripAddExpenseModalProps`
  - When `expense` is provided (edit mode):
    - Pre-fill all fields from the expense: amount, currency, category, date, note
    - Change title from "Add Misc Expense" to "Edit Misc Expense"
    - Add Remove button (`sm:mr-auto`, ghost variant) alongside Cancel/Save
    - Save calls `updateExpense(expense.id, { category, amount, currency, date, note })` instead of `createExpense`
    - Remove calls `deleteExpense(expense.id)` then closes the modal
  - When `expense` is not provided (add mode): existing behavior unchanged
  - Reset `editingExpense` state on close via `onOpenChange(false)` — parent should clear its `editingExpense` state in the same handler
- [x] Update `src/components/packt/trip-add-expense-modal.test.tsx`:
  - "renders in add mode with Add Misc Expense title when no expense prop"
  - "renders in edit mode with Edit Misc Expense title when expense prop provided"
  - "pre-fills amount, currency, category, date, and note in edit mode"
  - "calls updateExpense with correct params on Save in edit mode"
  - "calls deleteExpense on Remove in edit mode"
  - "shows Remove button only in edit mode, not in add mode"
  - "Cancel closes modal in both modes"
  - Verify existing add-mode tests still pass

### 4. Thread data and callbacks through trip-detail-tab-body (AC: 4, 5, 6)

- [x] In `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx`:
  - Derive a flat `allEvents: TripEvent[]` array with `useMemo`: `const allEvents = useMemo(() => days.flatMap((d) => d.events).concat(unscheduledEvents), [days, unscheduledEvents])`
  - Add `events` and `reservations` to the `<TripBudgetTab>` props spread (both already available from `TripDetailTabBodyProps` — no new interface additions needed for those)
  - Add `onEditExpense?: (expense: Expense) => void` to `TripDetailTabBodyProps` and pass through to `<TripBudgetTab>`

### 5. Register in feature-map.mjs

- [x] Add `"src/components/packt/expense-table.tsx"` to the `trips` feature's sourceGlobs array in `tests/e2e/feature-map.mjs` (alongside `trip-budget-tab.tsx`, `trip-add-expense-modal.tsx`, etc.)

### 6. Navigation logic for clickable rows (AC: 4, 5)

- `ExpenseTable` imports `useRouter` from `next/navigation`
- Event-linked row: `router.push(\`?tab=itin&focus=\${expense.eventId}\`, { scroll: false })` — the existing `useFocusScroll()` reads `?focus=` from search params and scrolls/highlights the event in the itinerary view
- Reservation-linked row: builds the deep-link href using `buildReservationsDeepLinkHref` (or constructs `?tab=res&highlight=<id>` directly) and calls `router.push(href, { scroll: false })` — the ReservationsTab reads `?highlight=` to scroll to the reservation
- Misc Expense row: calls `onEditExpense(expense)` prop — parent sets editing state, which opens the modal

### Review Findings

**Patch (actionable):**
- [x] [Review][Patch] `budget.total!` non-null assertion throws if total is undefined [`trip-budget-tab.tsx:89`] — dismissed, guarded by `hasBudget` check on line 82
- [x] [Review][Patch] Stale ref window in `useViewportClampedPanel` — dismissed, intentional pattern; ref initializer sets correct value on first render, sync effect handles updates, recalculate effect correctly doesn't depend on preferred values
- [x] [Review][Patch] `tripCurrency.toUpperCase()` no guard — dismissed, `resolveTripCurrency` always returns a string (falls back to "USD"), safe
- [x] [Review][Patch] `cost-dialog.tsx` lost `flex-wrap` on Cancel/Save button group — deferred, intentional per user
- [x] [Review][Patch] `compareRows` amount sort returns NaN when both expenses have NaN `convertedAmountTrip` — dismissed, conversion pipeline (`amount * rate`) can't produce NaN with validated inputs
- [x] [Review][Patch] No keyboard arrow navigation (ArrowUp/ArrowDown/Home/End) between table rows — **FIXED** [`expense-table.tsx`]
- [x] [Review][Patch] Modal title conflict when both `showAddExpenseModal` and `editingExpense` are set simultaneously — dismissed, dialog overlay prevents concurrent user interaction
- [x] [Review][Patch] Missing test for `resolveTitle` fallback when event/reservation ID doesn't match any passed array entry — **FIXED** [`expense-table.test.tsx`]

**Deferred (pre-existing / intentional):**
- [x] [Review][Defer] `resolveTitle` silently prefers `eventId` when both `eventId` and `reservationId` are set — data model allows both but no valid use case for dual-linking
- [x] [Review][Defer] Empty `<span />` spacer in dialog footers — intentional layout pattern
- [x] [Review][Defer] Non-finite `convertedAmountTrip` display produces `"$10.00 (NaN)"` — corrupted data, no meaningful display possible
- [x] [Review][Defer] `formatDate` binary format check treats any non-"MM/DD/YYYY" as "D MMM YYYY" — pre-existing utility behavior
- [x] [Review][Defer] No `maxWidthPx` clamping in CategoryPicker — pre-existing issue, out of scope
- [x] [Review][Defer] Toolbar grouping dissolved from spec (Add Misc Expense moved to below tiles) — documented intentional user-requested fix
- [x] [Review][Defer] `onEditExpense` passthrough called but no parent wires it — documented as future scaffolding

**Dismissed (false positives / noise): 5**

## Dev Notes

### What must be preserved

- **Existing TripBudgetTab behavior** — The header (Actual/Remaining/%/StatusBadge/ProgressBar), category tile grid, toolbar (Add Misc Expense / Recalculate Conversions), and "No expenses yet" empty state must continue working exactly as before. The expense-table is additive at the bottom of the tab.
- **Existing TripAddExpenseModal add-only behavior** — When no `expense` prop is passed, the modal must work exactly as before (Story 1.5). The optional `expense` prop enables edit mode — both modes share the same validation, field layout, and save flow.
- **Existing `createExpense`/`updateExpense`/`deleteExpense` actions** — Already in `src/app/(app)/trips/[tripId]/budget/actions.ts` (created in Story 1.5). The modal's save path must import and call `updateExpense` in edit mode, not duplicate its logic.

### Existing code state — read before editing

**`src/components/packt/trip-budget-tab.tsx`** (209 lines) — Currently renders: header with Actual/budget/status, category tiles, toolbar. Accepts `TripBudgetTabProps`: `tripId`, `budget`, `expenses`, `defaultExpenseCurrency`, `warningThreshold`, `dangerThreshold`, `onOpenEditBudget`. Has internal `showAddExpenseModal` state. Renders `<TripAddExpenseModal>` as the last child. No expense-table, no `editingExpense` state, no `events`/`reservations` props.

**`src/components/packt/trip-add-expense-modal.tsx`** (237 lines) — Currently add-only. `TripAddExpenseModalProps`: `tripId`, `defaultCurrency`, `open`, `onOpenChange`. Has `handleSave()` that calls `createExpense`. No edit mode, no `updateExpense`/`deleteExpense`, no `expense` prop. Footer: Cancel + Save only (no Remove).

**`src/components/packt/trip-budget-tab.test.tsx`** (608 lines) — Tests for budget header, category tiles, threshold states, Recalculate Conversions, and Add Misc Expense modal. No constructors for event/reservation data needed by the new expense-table tests.

**`src/components/packt/trip-add-expense-modal.test.tsx`** (280 lines) — Tests for add mode only. Mocks `createExpense` from actions. No mocks for `updateExpense`/`deleteExpense`.

**`src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx`** — Currently passes `trip`, `budget`, `expenses`, `defaultExpenseCurrency`, `warningThreshold`, `dangerThreshold`, `onOpenEditBudget` to `TripBudgetTab`. Accepts `events` prop for its own itinerary rendering but currently excludes it from the Budget-tab props block (only passes `trip.budget` not the full `trip` with events).

**`src/app/(app)/trips/[tripId]/trip-detail-tabs.ts`** — Exports `buildReservationsDeepLinkHref(pathname, searchParams, target)` for reservation deep-links. Uses `?highlight=<id>` to highlight a specific reservation. The expense-table can import this utility.

**`src/data/types.ts`** — `Expense` interface exists (line 306): `id`, `tripId`, `eventId?`, `reservationId?`, `category`, `amount`, `currency`, `convertedAmountTrip?`, `convertedCurrencyTrip?`, `date`, `note?`, `createdAt?`, `updatedAt?`. `TripEvent` has `id` and `name`. `Reservation` has `id` and `provider`.

**`src/app/(app)/trips/[tripId]/budget/actions.ts`** — Has `createExpense(tripId, input)`, `updateExpense(expenseId, patch)`, `deleteExpense(expenseId)` — all gated by `assertTripAccess(tripId, user.id!, "editor")`. `updateExpense` accepts `{ category?, amount?, currency?, date?, note? }`. `deleteExpense` is `async function deleteExpense(expenseId: string): Promise<void>`.

### Accessibility

- Table uses div/card rows (not `<table>`) — add `role="table"` on container, `role="row"` on rows, `role="columnheader"` on sort buttons, `aria-sort="ascending"`/`"descending"` on active sort column
- Row click targets are interactive (navigation/edit) — add `tabIndex={0}` and keyboard handler (`Enter`/`Space`) for keyboard-only users
- Sort buttons have visible text (column name) — no `aria-label` needed on the button itself
- Modal and existing form labels are already handled

### Architecture compliance

- **Expense-table is pure display** — No server actions, no new queries. Sorting is client-side only. Navigation (event/reservation clicks) uses existing URL search params (`?focus=`, `?highlight=`) — no new routing infrastructure.
- **TripAddExpenseModal edit mode extends existing** — Reuses the same field layout, validation, and error handling as add mode. Only the save action changes (update vs create) and a Remove button is added.
- **No new URL scheme** — Event navigation reuses the existing `?focus=<eventId>` + `useFocusScroll` pattern. Reservation navigation reuses `?highlight=<reservationId>` + `buildReservationsDeepLinkHref`.
- **Row click on event/reservation-linked expense uses `router.push`** — not a server action, not a form submission. Standard App Router client-side navigation to update `?tab=itin` or `?tab=res` with the appropriate focus/highlight param.

### Previous story intelligence (Story 1.9 — Threshold Status Indicator)

**Dev patterns established:**
- New components in `src/components/packt/` with colocated `.test.tsx`
- `cn()` from `@/lib/utils` for className merging
- `lucide-react` icons with `strokeWidth={1.5}`
- CSS custom properties for colors, no hardcoded hex
- Interactive elements meet `h-8` minimum sizing

**Key findings from Story 1.9 dev notes that apply here:**
- `warningThreshold`/`dangerThreshold` were made optional at every layer (default 80/90) — new props added to `TripBudgetTab` should follow the same pattern (make `events`/`reservations` optional with `[]` default to avoid breaking existing tests)
- New components must be registered in `tests/e2e/feature-map.mjs` under the "trips" entry — `feature-map.test.mjs` will fail CI if they aren't
- `trip-detail-tab-body.tsx` is an intermediate prop-passing layer — any new props for `TripBudgetTab` must be threaded through it

### Git intelligence

Recent commits (stories 1.5–1.9) all passed through build-validator (lint/tsc/coverage/E2E/build). Key patterns from recent work:
- Colocated test files pass `npx vitest run` for individual modules
- `vi.mock` for `revalidatePath` and server actions (see existing patterns in `trip-budget-tab.test.tsx`)
- Full regression: `npx tsc --noEmit` before validation

### File structure requirements

| File | Change |
|------|--------|
| `src/components/packt/expense-table.tsx` | NEW — sortable expense list table |
| `src/components/packt/expense-table.test.tsx` | NEW — expense-table unit tests |
| `src/components/packt/trip-budget-tab.tsx` | MODIFY — add expense-table below category tiles, add `editingExpense` state, pass to TripAddExpenseModal |
| `src/components/packt/trip-budget-tab.test.tsx` | MODIFY — add expense-table and edit-modal tests |
| `src/components/packt/trip-add-expense-modal.tsx` | MODIFY — add optional `expense` prop for edit mode, Remove button, `updateExpense`/`deleteExpense` calls |
| `src/components/packt/trip-add-expense-modal.test.tsx` | MODIFY — add edit mode tests |
| `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` | MODIFY — thread events/reservations/onEditExpense to TripBudgetTab |
| `tests/e2e/feature-map.mjs` | MODIFY — add `expense-table.tsx` to trips feature entry |

**No changes needed to:** `src/data/types.ts` (all types already exist), `src/lib/budget.ts` (no new calculations needed), `src/app/(app)/trips/[tripId]/budget/actions.ts` (actions already exist), `src/app/(app)/trips/[tripId]/page-client.tsx` (already passes `days`/`unscheduledEvents`/`reservations` to tab-body; no new props or state needed), `src/app/(app)/trips/[tripId]/page.tsx` (expenses already fetched), `src/app/(app)/trips/[tripId]/trip-detail-tabs.ts` (existing utilities are sufficient).

### Library requirements

- No new npm packages
- `useRouter` from `next/navigation` — for navigation on row clicks
- `cn()` from `@/lib/utils` — for className merging
- `lucide-react` — `ArrowUpDown` or `ChevronUp`/`ChevronDown` for sort direction icons
- `@/data/types` — for `Expense`, `TripEvent`, `Reservation` types
- `@/app/(app)/trips/[tripId]/trip-detail-tabs` — for `buildReservationsDeepLinkHref` (reservation navigation)
- Existing `CATEGORY_LABELS` map in `trip-budget-tab.tsx` — for Title fallback on note-less Misc expenses

### Testing requirements

**`src/components/packt/expense-table.test.tsx`:**
- "renders all expense rows with Date, Title, Category, and Amount columns"
- "shows event name for event-linked expense" — resolves eventId to TripEvent.name
- "shows reservation provider for reservation-linked expense" — resolves reservationId to Reservation.provider
- "shows note for Misc expense"
- "falls back to category label for Misc expense with no note"
- "sorts by date ascending on first Date header click, descending on second"
- "sorts by amount ascending on first Amount header click"
- "sorts by category ascending on first Category header click"
- "sorts by title ascending on first Title header click"
- "shows sort direction indicator on active column"
- "resets sort direction when a different column header is clicked"
- "returns null when expenses array is empty"
- "row meets h-8 minimum interactive sizing"

**`src/components/packt/trip-budget-tab.test.tsx` additions:**
- "renders expense-table below category tiles when expenses exist"
- "does not render expense-table when expenses array is empty — shows No expenses yet"
- existing tests continue to pass with new optional `events`/`reservations` props

**E2E scenario (optional addition to existing trips.feature):**

A brief scenario covering the expense-table flow: sort by amount, click event-linked row → lands on Itinerary tab with focus=<eventId>, click misc row → edit modal opens, save updates amount. Add if `trips.feature` already exists for the Budget tab.

**`src/components/packt/trip-add-expense-modal.test.tsx` additions:**
- "renders in edit mode with Edit Misc Expense title when expense prop provided"
- "pre-fills amount, currency, category, date, and note from the expense prop"
- "calls updateExpense with updated fields on Save in edit mode"
- "calls deleteExpense with expense.id on Remove in edit mode"
- "shows Remove button only in edit mode, not in add mode"
- "Cancel in edit mode closes without saving"
- "validation errors work the same in edit mode as add mode"

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.6

### Debug Log References

- `npx vitest run "src/components/packt/expense-table.test.tsx"`
- `npx vitest run "src/components/packt/trip-budget-tab.test.tsx"`
- `npx vitest run "src/components/packt/trip-add-expense-modal.test.tsx"`
- `npx vitest run "src/lib/use-focus-scroll.test.ts"`
- `npx tsc --noEmit`
- `npm run test:coverage` (full suite — 2651 passed, lines 96.42%, branches 90.4%, functions 96.2%)
- `npm run build`
- `npm run test:e2e` (full suite — 158 passed)

### Completion Notes List

- `CATEGORY_LABELS` was relocated from `trip-budget-tab.tsx` into `src/lib/budget.ts` (rather than importing it from `trip-budget-tab.tsx` as the Dev Notes suggested) — importing it from the component would have pulled `trip-budget-tab.tsx`'s server-action import chain into `expense-table.tsx`'s module graph, breaking test isolation. `trip-budget-tab.tsx` now imports `CATEGORY_LABELS` from `@/lib/budget` too.
- Added `data-slot="category-tile-grid"` to the category tile container so unit tests and the `trips.steps.ts` E2E step can scope queries to it — the expense-table's Category column now also renders category label text below the tiles, which made unscoped `getByText(category)` queries ambiguous.
- `TripBudgetTabProps` gained an optional `onEditExpense?: (expense: Expense) => void` passthrough (Task 2/4 spec) in addition to `TripBudgetTab`'s own internal `editingExpense` state — the internal state controls the modal; the optional callback notifies a parent if one is supplied. No current caller passes it.
- Post-implementation fix: moved the "Add Misc Expense" button (per user request) from the top toolbar to sit directly above the category tiles/expense-table content, in both the empty and populated states.
- Post-implementation fix: the Amount column was right-aligned; changed to left-aligned to match the other columns (per user request).
- Post-implementation bug fix: clicking an event-linked expense row from a non-Itinerary tab switched tabs but did not scroll to or pulse-highlight the event. Root cause: `useFocusScroll`'s scroll effect only ran once when the `focus` query param changed, and on the first render after `router.push` the Itinerary view hadn't mounted yet (the `tab` state update commits in a later render), so `document.getElementById` found nothing and never retried. Fixed by polling for the target element for up to 2s (50ms interval) before giving up, with regression tests in `src/lib/use-focus-scroll.test.ts`.

### Additional changes outside story scope

The following landed on this branch alongside story 1.10 but address pre-existing UI issues
unrelated to the Budget tab / expense table. Called out separately so they aren't mistaken for
story 1.10 deliverables:

- `85cdec0` — Dialog footers (cost, reservation-field, time, currency-change dialogs) previously
  used `sm:mr-auto`/`sm:justify-between` to position an optional Remove button, which shifted the
  Cancel/Save group depending on whether Remove rendered. Footers now always render
  `flex-row justify-between` with an invisible spacer `<span />` standing in for Remove when absent,
  so Cancel/Save stay anchored.
- `0c593db` — Category/currency picker dropdown panels used plain absolute positioning, which isn't
  constrained by viewport edges; on short/narrow screens the panel could render past the bottom or
  right edge with no way to scroll it into view. Added `useViewportClampedPanel` (new hook) so both
  pickers flip above the trigger and clamp height when there's no room below, and the currency
  picker (fixed 320px panel width) also clamps width on narrow viewports. Also fixed the
  selected-option text color to use the existing `--accent-ink` token instead of `--accent-fg`,
  matching the convention used elsewhere for text on an `--accent-soft` background.
- `9ac64c6` — Right/left `Drawer` variants (used by Edit Trip and reservation editing) were always
  75vw capped at `max-w-sm`, leaving content cramped on phone-width screens. Below the `sm`
  breakpoint they're now full viewport width; side-panel sizing is unchanged at `sm` and up.
- `77a5bcf` — In the Edit Trip sheet, Delete trip sat above Cancel/Save (easy to tap by accident
  while scrolling toward the primary actions), and Cancel/Save stacked full-width on mobile. They
  now share one right-aligned row on both mobile and desktop, with Delete moved below a separator.

Files touched by these additional changes (not part of the File List below):
`src/components/packt/cost-dialog.tsx`, `src/components/packt/reservation-field-dialog.tsx`,
`src/components/packt/time-dialog.tsx`, `src/components/packt/trip-currency-change-dialog.tsx`,
`src/components/packt/category-picker.tsx` (+ test), `src/components/packt/currency-picker.tsx`
(+ test), `src/lib/use-viewport-clamped-panel.ts` (NEW, + test), `src/components/ui/drawer.tsx`,
`src/components/packt/trip-edit-sheet.tsx`.

### File List

- `src/components/packt/expense-table.tsx` — NEW
- `src/components/packt/expense-table.test.tsx` — NEW
- `src/components/packt/trip-budget-tab.tsx` — MODIFY
- `src/components/packt/trip-budget-tab.test.tsx` — MODIFY
- `src/components/packt/trip-add-expense-modal.tsx` — MODIFY
- `src/components/packt/trip-add-expense-modal.test.tsx` — MODIFY
- `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx` — MODIFY
- `src/lib/budget.ts` — MODIFY (added `CATEGORY_LABELS`)
- `src/lib/use-focus-scroll.ts` — MODIFY (poll-and-retry fix for tab-switch race)
- `src/lib/use-focus-scroll.test.ts` — MODIFY
- `tests/e2e/feature-map.mjs` — MODIFY
- `tests/e2e/steps/trips.steps.ts` — MODIFY (scope category-tile query to avoid ambiguity with expense-table)

---
baseline_commit: 7dabed9fe76544f3db5c3be4cbaece376871b5b5
---

# Story 1.2: Unified Cost Entry on Events/Reservations

Status: review

## Story

As a trip owner/editor,
I want the cost I set on an event or reservation to be tracked as a structured expense,
so that it contributes accurately to my trip's actual spend and category breakdown.

## Acceptance Criteria

1. **`expenses` table created** — New table with `trip_id`, nullable `event_id`/`reservation_id` (all 3 FKs `onDelete: "cascade"` matching `documents` precedent), `category`, `amount`, `currency`, dual-conversion columns (`converted_amount_trip`/`conversion_rate_trip`/`converted_currency_trip`, `converted_amount_profile`/`conversion_rate_profile`/`converted_currency_profile` — all nullable, populated null until Story 1.3), `date`, `note`. Ships with dual-conversion columns from the start, not a later migration.

2. **`ExpenseCategory` enum** — New const-object enum (11 values: Food, Lodging, Transport, Activity, Sightseeing, Gas, Groceries, Flights, CarRental [`"car-rental"`], Shopping, Misc) added to `src/data/types.ts`.

3. **`Event.cost`/`Reservation.cost` dropped** — Those fields removed from schema (not migrated — explicit data loss per NFR4). Every existing reader of those fields located and updated in the same change.

4. **`CostDialog` redesigned** — `field-row` stack: currency+amount row, category disclosure row (required, no default selected, no persistent marker — validated inline at save), date row, note row (UX-DR6, UX-DR9). Currency defaults to Trip Currency (or user's profile currency if none set). Saving creates/updates a linked `expenses` row instead of a bare numeric field.

5. **Tab order** — amount → currency → category → date → note → save/cancel (NFR3).

6. **`CurrencyPicker` reused** — Shared component from Story 1.1 (`src/components/packt/currency-picker.tsx`), not rebuilt. Selected row highlighted via `accent-soft` (no checkmark). ~150 ISO codes, no search field.

## Tasks / Subtasks

- [x] Schema & types: `ExpenseCategory` enum, `Expense` interface, `expenses` table, drop cost columns (AC: 1, 2, 3)
  - [x] Add `ExpenseCategory` const-object enum to `src/data/types.ts`
  - [x] Add `Expense` interface to `src/data/types.ts` (with dual-conversion fields)
  - [x] Add `CreateExpenseInput`/`UpdateExpensePatch` types
  - [x] Remove `cost` from `TripEvent`, `Reservation`, `CreateEventInput`, `UpdateEventPatch`, `CreateReservationInput`, `UpdateReservationPatch`
  - [x] Add `expenses` table to `src/db/schema.ts`
  - [x] Drop `events.cost` / `reservations.cost` from schema
- [x] DB mapper: `dbExpenseToType()` + remove cost from existing mappers (AC: 3)
  - [x] Add `dbExpenseToType()` to `src/lib/db-mappers.ts`
  - [x] Remove `cost` mapping from `dbEventToType()` and `dbReservationToType()`
- [x] Find-and-fix: update all Event/Reservation cost readers for new data model (AC: 3)
  - [x] `src/app/(app)/trips/[tripId]/actions.ts` — remove `cost` from createEvent insert / updateEvent set clause (cost lives on expenses table now)
  - [x] `src/app/(app)/trips/[tripId]/reservations/actions.ts` — remove `cost` from createReservation insert / updateReservation patch
  - [x] `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts` — update `handleEventUpdate` to pass expense data from CostDialog instead of bare `cost`
  - [x] `src/components/packt/cost-dialog.tsx` — redesign with field-row stack + currency/category/date/note. Props change from `cost?: number` to `expense?: Expense`. Save calls `createExpense`/`updateExpense` in `budget/actions.ts`.
  - [x] `src/components/packt/place-row-dialogs.tsx` — pass expense data and expense CRUD handlers to CostDialog; keep the trigger dialog open/close flow
  - [x] `src/components/packt/place-row-action-bar.tsx` — show expense amount from linked expense instead of bare cost field; keep the cost chip/button visual
  - [x] `src/components/packt/place-row.tsx` — keep showCostDialog/onOpenCost; fetch linked expense data and pass to CostDialog
  - [x] `src/components/packt/reservation-row.tsx` — keep cost inline display and CostDialog trigger; read expense amount from linked expense instead of bare `reservation.cost`
  - [x] `src/components/packt/reservation-edit-drawer.tsx` — remove cost from creation form (cost is added later via CostDialog on the reservation row)
- [x] Create `budget/actions.ts` with expense CRUD server actions (AC: 4)
  - [x] `createExpense(tripId, input)` — create new expense row, gated by `assertTripAccess(tripId, user.id!, "editor")`, `revalidatePath`
  - [x] `updateExpense(expenseId, patch)` — update existing expense, same gate + revalidate
  - [x] `deleteExpense(expenseId)` — delete expense, same gate + revalidate
  - [x] Build `src/app/(app)/trips/[tripId]/budget/actions.test.ts`
- [x] New `CategoryPicker` shared component (AC: 4)
  - [x] Build `src/components/packt/category-picker.tsx`
  - [x] Build `src/components/packt/category-picker.test.tsx`
- [x] Test updates for all modified files (AC: all)
  - [x] Update `src/lib/db-mappers.test.ts`
  - [x] Update `src/components/packt/cost-dialog.test.tsx`
  - [x] Update `src/components/packt/place-row.test.tsx`
  - [x] Update `src/components/packt/place-row-action-bar.test.tsx`
  - [x] Update `src/components/packt/place-row-dialogs.test.tsx`
  - [x] Update `src/components/packt/reservation-row.test.tsx`
  - [x] Update `src/components/packt/reservation-edit-drawer.test.tsx`
  - [x] Update `src/app/(app)/trips/[tripId]/reservations/actions.test.ts`

## Dev Notes

### Read existing code before editing — non-negotiable

Read the current state of every file in the file list below **before** making any edit. This prevents:
- Breaking existing actions that process cost fields
- Missing prop/type changes that cascade through component trees
- Losing existing cost-dialog interaction patterns (keyboard, focus, remove flow)
- Introducing type errors from stale import references

### What this story does

Creates the `expenses` table and `ExpenseCategory` enum, drops `Event.cost`/`Reservation.cost`, redesigns `CostDialog` to write `expenses` rows, and updates every file that references the old cost fields. Story 1.3 (Currency Conversion) adds the actual conversion logic on top of this — this story ships `expenses` rows with null conversion fields.

### What must be preserved

- The "Remove" button in the redesigned `CostDialog` must still delete the expense and null out the event/reservation link — same behavior as before, using `deleteExpense` in `budget/actions.ts` (created in this story)
- Event rows (`PlaceRow`) and reservation rows (`ReservationRow`) must still render cost chips/buttons — clicking them opens the redesigned CostDialog with full expense fields (currency, category, date, note). The cost action does not move to the Budget tab; it stays inline as the entry point to the new dialog.
- `CostDialog` keyboard operability: tab order, Esc dismiss, Enter to save — these patterns must carry forward into the redesigned dialog
- `TripEvent` and `Reservation` without linked expenses must render cleanly (no crashes, no cost UI shown)
- `reservation-edit-drawer.tsx` creation flow must still work — just don't include cost (cost is added later via CostDialog on the reservation row)

### Architecture compliance

- `ExpenseCategory` const-object enum in `src/data/types.ts` using existing pattern — never the `enum` keyword. Values: Food, Lodging, Transport, Activity, Sightseeing, Gas, Groceries, Flights, CarRental (`"car-rental"`), Shopping, Misc
- `expenses` table FK cascade matches `documents` table precedent — `tripId`, `eventId` (nullable), `reservationId` (nullable), all `onDelete: "cascade"`. Deleting an event/reservation/trip deletes its linked expense rows
- `dbExpenseToType()` added to `src/lib/db-mappers.ts` — always use this when reading expenses rows
- Dual-conversion columns (`converted_amount_trip`/`conversion_rate_trip`/`converted_currency_trip`, `converted_amount_profile`/`conversion_rate_profile`/`converted_currency_profile`) shipped from the start, all nullable. Left null until Story 1.3 adds the conversion logic
- Amount stored as Postgres `numeric` string — no floating-point
- **No new validation library (zod)** — inline validation matching existing action conventions
- Colors via CSS custom properties only
- Lucide icons: `strokeWidth={1.5}` always
- `category` field is required with no default selected — enforced via inline validation on save, not a persistent marker

### File structure requirements

**NEW files:**
| File | Purpose |
|------|---------|
| `src/db/schema.ts` | Add expenses table (MODIFIED — add table + drop cost columns) |
| `src/components/packt/category-picker.tsx` | Shared disclosure row + picker for `ExpenseCategory` |
| `src/components/packt/category-picker.test.tsx` | CategoryPicker tests |
| `src/app/(app)/trips/[tripId]/budget/actions.ts` | createExpense, updateExpense, deleteExpense Server Actions |
| `src/app/(app)/trips/[tripId]/budget/actions.test.ts` | Tests for expense CRUD actions |

**MODIFIED files (schema/types):**
| File | Change |
|------|--------|
| `src/data/types.ts` | Add `ExpenseCategory` enum, `Expense` interface, `CreateExpenseInput`/`UpdateExpensePatch`; remove `cost` from `TripEvent`, `Reservation`, `CreateEventInput`, `UpdateEventPatch`, `CreateReservationInput`, `UpdateReservationPatch` |
| `src/lib/db-mappers.ts` | Add `dbExpenseToType()`; remove `cost` mapping from `dbEventToType()` and `dbReservationToType()` |

**NEW file (actions):**
| File | Purpose |
|------|--------|
| `src/app/(app)/trips/[tripId]/budget/actions.ts` | NEW — createExpense, updateExpense, deleteExpense. Each gated by `assertTripAccess(tripId, user.id!, "editor")` + `revalidatePath(`/trips/${tripId}`)`. |

**MODIFIED files (actions):**
| File | Change |
|------|--------|
| `src/app/(app)/trips/[tripId]/actions.ts` | Remove `cost` from `createEvent()` insert and `updateEvent()` set clause |
| `src/app/(app)/trips/[tripId]/reservations/actions.ts` | Remove `cost` from `createReservation()` insert and `updateReservation()` update builder |

**MODIFIED files (components — update cost to expense data model):**
| File | Change |
|------|--------|
| `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts` | Update `handleEventUpdate` to pass expense data from new CostDialog instead of bare `cost` |
| `src/components/packt/place-row-dialogs.tsx` | Update CostDialog invocation to pass expense props; keep the trigger dialog open/close flow |
| `src/components/packt/place-row-action-bar.tsx` | Display expense amount from linked expense instead of bare cost field; keep cost chip/button as CostDialog trigger |
| `src/components/packt/place-row.tsx` | Keep `showCostDialog` state and handlers; pass linked expense data to CostDialog instead of bare `cost` |
| `src/components/packt/reservation-row.tsx` | Keep cost inline display and CostDialog trigger; read expense amount from linked expense instead of `reservation.cost` |
| `src/components/packt/reservation-edit-drawer.tsx` | Remove `cost` from form submit handler (cost is added later via CostDialog)

**MODIFIED files (CostDialog — redesigned):**
| File | Change |
|------|--------|
| `src/components/packt/cost-dialog.tsx` | Redesign with `field-row` layout: amount+currency row, category picker, date row, note row. Props change from `cost?: number, onSave: (cost?: number) => void` to `expense?: Expense, onSave: (expense: CreateExpenseInput) => void`. Import and use `CurrencyPicker`, `CategoryPicker` |
| `src/app/(app)/trips/[tripId]/budget/actions.ts` | NEW — createExpense, updateExpense, deleteExpense Server Actions, each gated by assertTripAccess(tripId, user.id!, "editor") + revalidatePath. CostDialog calls these directly. |

**MODIFIED files (tests):**
| File | Change |
|------|--------|
| `src/lib/db-mappers.test.ts` | Remove cost assertions from `BASE_EVENT`/`BASE_RESERVATION` fixtures; add `dbExpenseToType` tests |
| `src/components/packt/cost-dialog.test.tsx` | Rewrite tests for new props/fields |
| `src/components/packt/place-row.test.tsx` | Update cost dialog tests for new expense-based props |
| `src/components/packt/place-row-action-bar.test.tsx` | Update cost display assertion to read from linked expense |
| `src/components/packt/place-row-dialogs.test.tsx` | Update CostDialog mock and test for new expense props |
| `src/components/packt/reservation-row.test.tsx` | Update cost dialog tests for expense-based data; keep cost in fixtures as linked expense reference |
| `src/components/packt/reservation-edit-drawer.test.tsx` | Remove cost from submit assertions |
| `src/app/(app)/trips/[tripId]/reservations/actions.test.ts` | Remove cost test cases, cost from fixtures |
| `src/app/(app)/trips/[tripId]/budget/actions.test.ts` | NEW — test createExpense, updateExpense, deleteExpense |

**Total: ~20 files modified, 4 files new** (category-picker + tests + budget/actions.ts + budget/actions.test.ts)

### Library requirements

- `CurrencyPicker` already exists from Story 1.1 — import from `@/components/packt/currency-picker`, don't rebuild
- No new npm packages required
- `cn()` from `@/lib/utils` for className merging
- `date-fns` for date formatting in date row
- All validation is inline (no zod)

### Key design decisions to follow

- **CostDialog prop change**: old `cost?: number, onSave: (cost?: number) => void` → new `expense?: Expense, onSave: (expense: CreateExpenseInput) => void`. The dialog now manages amount+currency+category+date+note, not just a number
- **Event/Reservation rows keep cost chips as trigger** — the cost display badge/button stays visible on the row. Clicking it opens the redesigned CostDialog. The chip reads the expense amount from the linked expense row instead of the bare `cost` field
- **`place-row-action-bar.tsx`**: keep the cost chip/button; read cost from linked expense instead of bare `cost` field. Save/update expense via `budget/actions.ts` Server Actions
- **`reservation-row.tsx`**: same treatment — keep cost inline display and click-to-open behavior. Cost is managed through the linked expense row
- **CategoryPicker implementation**: `"use client"` component. Disclosure row that opens overlay on click/Enter; selecting a category or pressing Esc closes the picker and returns focus to the disclosure row. Same return-focus guarantee as CurrencyPicker
- **Date row**: defaults to today, past dates allowed. Uses the existing date-picker pattern from the codebase
- **Note row**: optional, multiline textarea
- **Remove button**: calls `deleteExpense(expenseId)` from `budget/actions.ts`. The Remove button must carry an accessible label (e.g. `title="Remove cost"`) since it's icon-only in narrow viewports
- **Remove button icon-only state**: when shown as just a trash icon, add `title="Remove cost"`. The full Remove text label from the existing CostDialog should be preserved for the wide layout

### Previous story intelligence (Story 1.1)

**Dev patterns established:**
- `CurrencyPicker` in `src/components/packt/currency-picker.tsx` — trigger with `aria-haspopup="listbox"`, listbox with role="option" items, Esc/Enter dismissal, focus return. ~150 static ISO currencies from a data array. **Reuse this for CostDialog's currency row**
- All `TripDetailTab` values are const-object enum members
- Colors via CSS custom properties — no hardcoded hex
- Coverage thresholds: ≥95% lines/functions, ≥90% branches across `src/components/packt/**`

**Open items from 1.1 review:**
- [ ] CurrencyPicker trigger click-to-close doesn't refocus trigger — only Esc handler returns focus. If fixing this in Story 1.2, do it in the shared component, not a fork
- Budget.currency typed as plain `string` (deferred) — pre-existing pattern, acceptable
- 150-item currency list in every page JS bundle (deferred, performance concern outside scope)

**Testing lessons:**
- `fireEvent.change` replacing `userEvent.type` lowers test fidelity — use `userEvent` for realistic interactions
- Mock `next/navigation` via global mocks in `vitest.setup.mts` — don't re-mock per file

### Testing requirements

**CostDialog redesign tests:**
- Renders amount, currency, category, date, note fields
- Currency defaults to Trip Currency (or profile currency fallback)
- Category is required — validation message shown on save with no category
- Tab order: amount → currency → category → date → note → save/cancel
- Remove button works (placeholder or real)
- Esc dismisses currency picker and category picker
- Save calls onSave with `CreateExpenseInput` shape

**CategoryPicker tests:**
- Opens on click/Enter
- Selecting category calls onChange and closes
- Esc closes without changing selection
- Focus returns to trigger on close
- Lists all 11 `ExpenseCategory` values

**Misc updated tests:**
- `db-mappers.test.ts`: verify `dbExpenseToType` maps all columns; verify dbEventToType/dbReservationToType no longer return cost
- `place-row.test.tsx`: update cost dialog tests for expense-based props (cost chip stays)
- `place-row-action-bar.test.tsx`: update cost display assertion to read from linked expense
- `place-row-dialogs.test.tsx`: update CostDialog invocation test for new expense props
- `reservation-row.test.tsx`: update cost dialog tests for expense-based data; keep cost in fixtures
- `reservation-edit-drawer.test.tsx`: no cost in submit
- `reservations/actions.test.ts`: no cost in create/update
- `budget/actions.test.ts`: test createExpense creates row with correct fields; updateExpense patches correctly; deleteExpense deletes; each action calls assertTripAccess first; edge cases (expense not found, unauthorized)

**Coverage guard:** maintain ≥95% lines/functions, ≥90% branches across `src/components/packt/**` and `src/lib/**`. Coverage excludes `src/components/ui/**`, `src/lib/auth-helpers.ts`, `src/lib/queries.ts`, `src/lib/server-now.ts`.

### References

- [Source: epics.md §Epic 1 Story 1.2] — ACs, user story, expense table spec, ExpenseCategory values
- [Source: architecture.md §Data Architecture] — expenses table FK cascade, dual-conversion columns, db:push migration
- [Source: architecture.md §Project Structure] — Complete file tree for all modified files
- [Source: architecture.md §Enforcement Guidelines] — Must use ExpenseCategory enum, dbExpenseToType() mapper, route mutations through budget/actions.ts
- [Source: architecture.md §Naming Patterns] — ExpenseCategory const-object enum definition (exact 11 values)
- [Source: architecture.md §Implementation Sequence] — category enum → expenses schema → drop cost → find-and-fix → dbExpenseToType → cost-dialog rework
- [Source: prd.md §4.2 Unified Cost Entry] — FR-4: cost becomes linked Cost Entry
- [Source: prd.md §5 Data migration] — cost field dropped, not migrated (intentional)
- [Source: EXPERIENCE.md §Component Patterns] — CostDialog redesigned, CurrencyPicker, CategoryPicker behaviors
- [Source: EXPERIENCE.md §Interaction Primitives] — Tab order, keyboard dismissal
- [Source: EXPERIENCE.md §Accessibility Floor] — Category `aria-required="true"`, inline validation
- [Source: EXPERIENCE.md §State Patterns] — Conversion lookup failure toast (Story 1.3 deferred)
- [Source: DESIGN.md §Components] — field-row, currency-picker-row visual specs
- [Source: project-context.md] — Tech stack, component conventions, CSS token rules, testing standards

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `npx tsc --noEmit`
- `npx vitest run src/components/packt/category-picker.test.tsx src/components/packt/cost-dialog.test.tsx`
- `npm run lint 2>&1`
- `npm run test:coverage 2>&1`
- `npm run build 2>&1`
- `npm run test:e2e:affected 2>&1`
- `node scripts/run-e2e.mjs --server=kill --grep=@feat:trip-cover-overflow`

### Completion Notes List

- Added `ExpenseCategory`, `Expense`, expense CRUD inputs, and `expenses` schema with nullable conversion fields while removing legacy event/reservation `cost` fields.
- Reworked `CostDialog` to manage structured expense data (amount, currency, category, date, note) using shared `CurrencyPicker` and new `CategoryPicker` components. Cost chips on event and reservation rows remain as the click-to-open trigger for the redesigned dialog.
- Added `budget/actions.ts` expense server actions plus tests, expanded mapper/query coverage, and threaded trip/profile default currency through itinerary and reservations surfaces.
- Added branch-focused coverage tests plus `feature-map.mjs` registration for `category-picker`, then passed lint, `tsc`, coverage, build, and full affected E2E validation.

### File List

- _bmad-output/implementation-artifacts/1-2-unified-cost-entry-on-events-reservations.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- src/app/(app)/trips/[tripId]/actions.ts
- src/app/(app)/trips/[tripId]/budget/actions.test.ts
- src/app/(app)/trips/[tripId]/budget/actions.ts
- src/app/(app)/trips/[tripId]/reservations/actions.test.ts
- src/app/(app)/trips/[tripId]/reservations/actions.ts
- src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts
- src/components/packt/category-picker.test.tsx
- src/components/packt/category-picker.tsx
- src/components/packt/cost-dialog.test.tsx
- src/components/packt/cost-dialog.date-fallback.test.tsx
- src/components/packt/cost-dialog.tsx
- src/components/packt/currency-picker.test.tsx
- src/components/packt/currency-picker.tsx
- src/components/packt/day-card-body.tsx
- src/components/packt/day-card-dnd.tsx
- src/components/packt/day-card.tsx
- src/components/packt/place-row-action-bar.test.tsx
- src/components/packt/place-row-action-bar.tsx
- src/components/packt/place-row-dialogs.test.tsx
- src/components/packt/place-row-dialogs.tsx
- src/components/packt/place-row.test.tsx
- src/components/packt/place-row.tsx
- src/components/packt/reservation-edit-drawer.test.tsx
- src/components/packt/reservation-edit-drawer.tsx
- src/components/packt/reservation-row.test.tsx
- src/components/packt/reservation-row.tsx
- src/components/packt/reservation-type-section.tsx
- src/components/packt/reservations-tab.tsx
- src/data/types.ts
- src/db/schema.ts
- src/app/(app)/trips/[tripId]/page.tsx
- src/app/(app)/trips/[tripId]/page-client.tsx
- src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx
- src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx
- src/app/(app)/trips/[tripId]/unscheduled-events-section.tsx
- src/lib/db-mappers.test.ts
- src/lib/db-mappers.ts
- src/lib/queries.test.ts
- src/lib/queries.ts
- tests/e2e/feature-map.mjs

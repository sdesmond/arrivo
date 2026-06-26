---
baseline_commit: 3efc228c3e16c993c134d3f2103df6346c12af41
---

# Story 1.7: Trip Currency Change Confirmation

Status: done

## Story

As a trip owner/editor,
I want to be warned before changing my Trip Currency if it would leave existing expenses mismatched,
so that I don't lose track of which amounts need reconverting.

## Acceptance Criteria

1. **Dialog triggered on mismatch** — When a trip has at least one `expenses` row whose `currency` (uppercased) differs from the new Trip Currency being selected in `TripEditBudget`, and the user attempts to save, a confirmation dialog appears before the change commits. (FR3)

2. **No dialog when no mismatch** — When every `expenses` row's `currency` already matches the new Trip Currency, or the trip has zero `expenses` rows, no dialog appears — the change commits immediately. (FR3)

3. **Dialog copy and layout** — The dialog shows the single generic sentence: "Some of your expenses don't match your new currency selection. Do you want to convert them to this new currency?" (no per-expense listing). Footer: Cancel (ghost) far left; Leave As Is (secondary) + Convert (primary) grouped right — matching the left/right-grouped footer pattern from `CostDialog`. (UX-DR12)

4. **Convert path** — Clicking "Convert" commits the Trip Currency change and runs the same recalculation routine from Story 1.6 (`recalculate()` in `lib/currency.ts`) for every mismatched expense, re-fetching rates and updating their Trip-Currency conversion fields. (FR3)

5. **Leave As Is path** — Clicking "Leave As Is" commits the Trip Currency change without recalculating any mismatched entries. Conversions are left stale until the user manually runs "Recalculate Conversions" from the Budget tab (Story 1.6). (FR3)

6. **Cancel path** — Clicking "Cancel" dismisses the dialog and leaves the Trip Currency selection unchanged — no mutation occurs. (UX-DR12)

7. **Server Action gating** — `changeTripCurrency` in `budget/actions.ts` is gated by `requireUser()` + `assertTripAccess(tripId, user.id!, "editor")`. `revalidatePath(\`/trips/\${tripId}\`)` fires after any commit (Convert or Leave As Is). (Architecture compliance)

8. **Reuses existing recalculate** — The Convert path calls `recalculate(expenses, newTripCurrency)` from `lib/currency.ts`, same function used by Story 1.6's standalone "Recalculate Conversions" action. All-or-nothing semantics apply: if any fetch fails, no rows are updated and the Trip Currency change is rolled back. (FR3, NFR2)

9. **Dialog is keyboard-operable** — Tab order: Cancel → Leave As Is → Convert. `Esc` dismisses the dialog as Cancel (no mutation). Focus returns to the trigger (the `TripEditBudget` currency field) on dismiss. (NFR3)

## Tasks / Subtasks

- [x] Create `src/components/packt/trip-currency-change-dialog.tsx` (AC: 3, 4, 5, 6, 9)
  - [x] Dialog component: single sentence, 3-button footer (Cancel ghost, Leave As Is secondary, Convert primary)
  - [x] Props interface: `isOpen`, `onCancel`, `onLeaveAsIs`, `onConvert`
  - [x] Keyboard: Tab navigates Cancel → Leave As Is → Convert; Esc = Cancel
  - [x] Base UI Dialog primitive (matching existing dialog patterns in the codebase)
- [x] Create `src/components/packt/trip-currency-change-dialog.test.tsx` (AC: 3, 4, 5, 6, 9)
  - [x] Renders with correct copy
  - [x] Calls `onCancel` on Cancel click
  - [x] Calls `onLeaveAsIs` on Leave As Is click
  - [x] Calls `onConvert` on Convert click
  - [x] Esc calls `onCancel`
  - [x] Focus management on open/close
- [ ] ~~Add `changeTripCurrency()` to `src/app/(app)/trips/[tripId]/budget/actions.ts`~~ — **superseded, see Completion Notes**: equivalent capability added as a `convertCurrency` param on `updateTripMetadata()` in `src/app/(app)/trips/actions.ts` instead (AC: 1, 2, 4, 5, 7, 8)
  - [ ] `export async function changeTripCurrency(tripId: string, newCurrency: string, mode: "convert" | "leave-as-is"): Promise<{ changed: true }>`
  - [ ] `requireUser()` + `assertTripAccess(tripId, user.id!, "editor")`
  - [ ] When `mode === "leave-as-is"`: update trip's `budgetCurrency` only, no expense recalculation
  - [ ] When `mode === "convert"`: update trip's `budgetCurrency`, then fetch all expenses for the trip, call `recalculate(expenses, newCurrency)`, batch-update each mismatched expense's Trip-Currency conversion fields with fresh results
  - [ ] On conversion fetch failure: roll back the currency change too (all-or-nothing — wrap in `db.transaction()`: read trip + expenses, conditionally recalculate, write trip currency + expense updates)
  - [ ] `revalidatePath(\`/trips/\${tripId}\`)`
  - [ ] Return `{ changed: true }` on success
- [ ] ~~Update `src/app/(app)/trips/[tripId]/budget/actions.test.ts` — add `changeTripCurrency` tests~~ — **superseded**: equivalent tests added to `src/app/(app)/trips/actions.test.ts` (AC: 1, 2, 4, 5, 7, 8)
  - [ ] Requires auth (mock `requireUser` to throw)
  - [ ] Requires editor access (mock `assertTripAccess` to throw)
  - [ ] Leave As Is path: updates trip currency, does NOT call `recalculate`
  - [ ] Convert path: updates trip currency AND calls `recalculate`
  - [ ] Convert path with no mismatches: updates trip currency, `recalculate` filters to zero expenses (no API calls)
  - [ ] Convert on fetch failure: rolls back both currency change and expense updates (all-or-nothing)
  - [ ] Calls `revalidatePath` on any commit
  - [ ] Empty expenses array: no dialog needed (determined client-side before calling action)
- [ ] ~~Update `src/components/packt/trip-edit-budget.tsx` — wire up currency change dialog~~ — **superseded**: wired into `src/components/packt/trip-edit-sheet.tsx` instead, since that's where the Save action and `UpdateTripPatch` actually live (AC: 1, 2, 3, 4, 5, 6)
  - [ ] Import `changeTripCurrency` from `@/app/(app)/trips/[tripId]/budget/actions`
  - [ ] Import `hasCurrencyMismatch` from `@/lib/budget`
  - [ ] Import `TripCurrencyChangeDialog` from `./trip-currency-change-dialog`
  - [ ] When user selects a new currency and attempts to save:
    - [ ] Compute `hasMismatch = hasCurrencyMismatch(expenses, newCurrency, getNow())`
    - [ ] If `hasMismatch` is false: save immediately via `changeTripCurrency(newCurrency, "leave-as-is")`
    - [ ] If `hasMismatch` is true: open the confirmation dialog instead of committing
  - [ ] Dialog callbacks:
    - [ ] `onConvert`: `await changeTripCurrency(newCurrency, "convert")`, toast.success("Currency and conversions updated.")
    - [ ] `onLeaveAsIs`: `await changeTripCurrency(newCurrency, "leave-as-is")`, toast.success("Trip currency changed.")
    - [ ] `onCancel`: close dialog, no mutation
    - [ ] On failure from `changeTripCurrency` (any mode): toast.error("Couldn't update currency — try again.")
  - [ ] Pass `budgetCurrency` (current) and `expenses` as props
- [ ] ~~Update `src/components/packt/trip-edit-budget.test.tsx` — add currency change tests~~ — **superseded**: tests added to `src/components/packt/trip-edit-sheet.test.tsx` instead (AC: 1, 2, 3, 4, 5, 6, 9)
  - [ ] All existing tests pass
  - [ ] Saving with same currency: no dialog, commits immediately
  - [ ] Saving with different currency + no mismatches: no dialog, commits immediately
  - [ ] Saving with different currency + mismatch exists: dialog opens
  - [ ] Cancel from dialog: no mutation, closes dialog
  - [ ] Convert from dialog: calls `changeTripCurrency("convert")`, shows success toast
  - [ ] Leave As Is from dialog: calls `changeTripCurrency("leave-as-is")`, shows success toast
  - [ ] Action failure shows error toast
- [x] Update `src/app/(app)/trips/[tripId]/page-client.tsx` — pass `expenses` to `TripEditSheet` (AC: 1, 2)
  - [x] `TripEditSheet` now needs the `expenses` array to compute mismatch client-side

## Dev Notes

### What this story does

Adds a confirmation dialog when the user changes Trip Currency on a trip where some expenses have a different currency. The dialog offers Cancel (no change), Convert (commit + recalculate), or Leave As Is (commit stale). Reuses the `recalculate()` function from `lib/currency.ts` and the `hasCurrencyMismatch()` function from `lib/budget.ts` — both built in Story 1.6.

**This story does NOT add:**
- Profile currency change confirmation (Story 2.5) — that story mirrors the same pattern but for profile-level currency
- The standalone "Recalculate Conversions" button (Story 1.6)
- Settings threshold configuration (Story 1.8)

### What must be preserved

- **Existing `TripEditBudget` behavior** — when no currency change occurs, or when changing to a currency that matches all expenses, the budget save flow must remain unchanged (no dialog, immediate save).
- **Existing `hasCurrencyMismatch` signature** — already accepts `(expenses, tripCurrency, now)`. The `now` param is needed from `useNow()`.
- **Existing `recalculate()` contract** — all-or-nothing, throws on failure, only processes expenses where `needsRecalculation` is true.
- **Existing `createExpense`/`updateExpense`/`deleteExpense` behavior** — the currency change action must not affect how existing expense CRUD works.

### Existing code state — read before editing

**`src/lib/currency.ts`** — `recalculate(expenses, tripCurrency)` exists and is fully wired. Signature: `(Expense[], string) => Promise<RecalculateResult[]>`. Returns results for caller to persist; caller owns the DB writes.

**`src/lib/budget.ts`** — `hasCurrencyMismatch(expenses, tripCurrency, now)` exists. Returns `boolean`. Delegates to `needsRecalculation()` per-expense.

**`src/app/(app)/trips/[tripId]/budget/actions.ts`** — has `createExpense`, `updateExpense`, `deleteExpense`, `recalculateConversions`. Add `changeTripCurrency` as a new export.

**`src/components/packt/trip-edit-budget.tsx`** — reads `budget` and `budgetCurrency` from props. Does NOT currently receive `expenses`. The currency field is a `currency-picker-row` overlay (replaced free-text input in Story 1.1). On save, calls the trip update action.

**`src/components/packt/trip-currency-change-dialog.tsx`** — does not exist yet. Create it as a new component.

### Architecture compliance

- **Action in `budget/actions.ts`** — `changeTripCurrency` follows the same pattern as `recalculateConversions`: `requireUser()`, `assertTripAccess(tripId, user.id!, "editor")`, `revalidatePath(...)`.
- **Dialog is a separate component** — `trip-currency-change-dialog.tsx` lives in `src/components/packt/`, not embedded in `trip-edit-budget.tsx`.
- **All-or-nothing transaction** — wrapping the currency change + optional recalculation in `db.transaction()` ensures no partial state if the conversion fetch fails mid-way.
- **Existing `recalculate()` is reused** — the Convert path simply calls `recalculate(expenses, newCurrency)` from `lib/currency.ts`, same as Story 1.6's "Recalculate Conversions" button.
- **Client-side mismatch check** — `hasCurrencyMismatch` is pure and synchronous, computed from the `expenses` array already available. No extra server call needed to decide whether to show the dialog.

### Key design decisions

- **Dialog as a controlled component** — `TripEditBudget` manages `isDialogOpen` state, passes it down. The dialog is not self-triggering.
- **`changeTripCurrency` takes a `mode` param** — `"convert" | "leave-as-is"` instead of being two separate actions. The action always updates the trip currency; the mode determines whether it also recalculates expenses.
- **All-or-nothing for Convert** — if the recalculation fails, the currency change is also rolled back. This is the safer default: the user can retry the whole operation rather than being left with a committed currency change and stale conversions.
- **Toast on success** — "Currency and conversions updated." on Convert; "Trip currency changed." on Leave As Is. Follows the app's existing terse toast style (UX-DR15): no exclamation, no embellishment.
- **Toast on failure** — "Couldn't update currency — try again." Matches the existing conversion-failure voice pattern from UX-DR16.
- **Reuses same dialog pattern as profile currency change** — Story 2.5 (`profile-currency-change-dialog.tsx`) mirrors the same dialog shape and button layout. The two dialogs should be structurally similar but independent components (same pattern, not a shared generic dialog).
- **Focus management** — per NFR3 and EXPERIENCE.md Interaction Primitives: when dialog opens, focus moves to the first button (Cancel per the tab order: Cancel → Leave As Is → Convert). On dismiss (any path), focus returns to the currency field trigger that opened the dialog.

### References

- [Source: epics.md §Epic 1 Story 1.7] — ACs, user story, FR3 details
- [Source: architecture.md §Data Architecture] — `changeTripCurrency` action location, all-or-nothing semantics
- [Source: architecture.md §Implementation Patterns] — Action naming, file locations, auth gating
- [Source: architecture.md §Enforcement Guidelines] — Route mutations through `budget/actions.ts`
- [Source: EXPERIENCE.md §Component Patterns] — Trip Currency change dialog: spec, text, 3-button layout
- [Source: EXPERIENCE.md §State Patterns] — Trip Currency change — no mismatch vs mismatch exists
- [Source: EXPERIENCE.md §Voice and Tone] — Terse, plain toast messages
- [Source: EXPERIENCE.md §Interaction Primitives] — Dialog keyboard operability, focus management
- [Source: EXPERIENCE.md §Accessibility Floor] — Keyboard-operable, focus return on dismiss
- [Source: EXPERIENCE.md §Key Flows — Flow 2] — End-to-end usage flow for Trip Currency change
- [Source: DESIGN.md §Components] — Layout: Cancel (ghost, far left), Leave As Is (secondary) + Convert (primary) grouped right, matching CostDialog footer pattern
- [Source: project-context.md] — CSS custom properties, `cn()` convention, `"use client"` rule, file placement, type conventions

### Previous story intelligence (Story 1.6 — Recalculate Conversions)

**Dev patterns established:**
- `budget/actions.ts` uses `assertTripAccess(tripId, user.id!, "editor")` on every action — follow same pattern for `changeTripCurrency`
- `revalidatePath(\`/trips/\${tripId}\`)` after every mutation
- Toast via `sonner`: `toast.error(message)`, `toast.success(message)`
- Drizzle `db.transaction()` for all-or-nothing operations (review finding from Story 1.6)
- No new npm packages — all dependencies already available

**Review findings from Story 1.6 that apply here:**
- All-or-nothing wrapping in `db.transaction()` is mandatory — the changeTripCurrency Convert path wraps both the currency update and expense recalculations together
- Empty `budgetCurrency` guard: when a trip has no budget currency set, `changeTripCurrency` receives `newCurrency` as `""`. Must throw a clear error if `newCurrency` is empty, matching the guard added in Story 1.6.
- `recalculate()` returns `RecalculateResult[]` — the caller (the action) writes those results to the DB. The action owns the DB writes, not `recalculate()`.

**Testing patterns established:**
- Colocated `*.test.ts`/`*.test.tsx` files next to source
- `vi.fn()` for callback mocks
- `@testing-library/user-event` for interaction tests
- `describe`/`it` blocks (not `test`)
- `@vitest-environment node` for server action tests
- `MockDateProvider` wrapping for `useNow()`-dependent tests

**Key reuse: `hasCurrencyMismatch()` and `recalculate()` from Story 1.6:**
- `hasCurrencyMismatch(expenses, newCurrency, now)` — this story reads it client-side to decide whether to show the dialog
- `recalculate(expenses, newCurrency)` — this story's Convert path calls it, same as Story 1.6's standalone button
- `needsRecalculation(expense, tripCurrency, now)` — already encodes the staleness rule; Convert recalculates every mismatched expense regardless of staleness (the user explicitly asked for it)

### Git intelligence

Recent commits:
- `3efc228` Merge PR #163: Story 1.6 recalculate conversions
- `9e340ed` fix: address 3 code review findings (all-or-nothing transaction, empty currency guard, duplicate API calls)
- `a215948` feat: add manual Recalculate Conversions action to Budget tab
- `00f6232` Merge PR #162: Story 1.5 add misc expenses
- `9a03b91` fix: address 6 review findings for Misc Expense modal

Takeaways: review cycles in Stories 1.5 and 1.6 caught significant issues (missing transactions, missing guards, edge cases). Ensure this story's review-readiness: every AC must have a test, edge cases (empty expenses, empty currency, fetch failure) must be covered, and the all-or-nothing transaction pattern must be replicated.

### File structure requirements

**NEW files:**

| File | Purpose |
|------|---------|
| `src/components/packt/trip-currency-change-dialog.tsx` | Confirmation dialog component |
| `src/components/packt/trip-currency-change-dialog.test.tsx` | Dialog unit tests |

**MODIFIED files:**

| File | Change |
|------|--------|
| `src/app/(app)/trips/[tripId]/budget/actions.ts` | Add `changeTripCurrency()` Server Action |
| `src/app/(app)/trips/[tripId]/budget/actions.test.ts` | Add `changeTripCurrency` unit tests |
| `src/components/packt/trip-edit-budget.tsx` | Wire up currency change dialog, import `hasCurrencyMismatch`, import `changeTripCurrency` action |
| `src/components/packt/trip-edit-budget.test.tsx` | Add currency change dialog tests |
| `src/app/(app)/trips/[tripId]/page-client.tsx` | Pass `expenses` to `TripEditBudget` |

**No changes needed to:** `lib/currency.ts`, `lib/budget.ts`, `lib/budget.test.ts` — Story 1.6 already provides `recalculate()` and `hasCurrencyMismatch()`.

### Library requirements

- No new npm packages
- Base UI `Dialog` primitive (already in project via `@base-ui/react` — verify which dialog component previous stories used; likely `@base-ui/react/dialog` or shadcn `Dialog` from `src/components/ui/dialog.tsx`)
- `toast` from `sonner` (already used project-wide)
- `Loader2` from `lucide-react` for loading state on Convert button during recalculation (optional — only if Convert is async-in-place)

### Testing requirements

**`trip-currency-change-dialog.test.tsx`:**
- Renders with correct dialog title/body text
- Cancel button calls `onCancel`
- Leave As Is button calls `onLeaveAsIs`
- Convert button calls `onConvert`
- `Esc` key calls `onCancel`
- Dialog not rendered when `isOpen={false}`

**`budget/actions.test.ts` additions:**
- `changeTripCurrency` requires auth (`requireUser` throws)
- `changeTripCurrency` requires editor access (`assertTripAccess` throws)
- Leave As Is path: updates `budgetCurrency`, does NOT call `recalculate`
- Convert path: updates `budgetCurrency` AND calls `recalculate`
- Convert with empty newCurrency: throws clear error (matching Story 1.6's guard)
- Convert on fetch failure: rolls back currency change + any expense updates (all-or-nothing)
- Calls `revalidatePath` on any commit

**`trip-edit-budget.test.tsx` additions:**
- All existing tests pass
- Same currency selected: commits immediately, no dialog
- Different currency, no mismatches: commits immediately, no dialog
- Different currency, mismatches: dialog opens
- Cancel from dialog: no mutation, dialog closes
- Convert from dialog: calls `changeTripCurrency("convert")`, success toast
- Leave As Is from dialog: calls `changeTripCurrency("leave-as-is")`, success toast
- Action failure: error toast shown

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

- `npx vitest run src/components/packt/trip-currency-change-dialog.test.tsx` — new dialog tests (9 passed)
- `npx vitest run "src/app/(app)/trips/actions.test.ts"` — existing + new `updateTripMetadata` convertCurrency tests (73 passed)
- `npx vitest run src/components/packt/trip-edit-sheet.test.tsx` — existing + new currency-confirmation tests (44 passed)
- `npx vitest run` — full regression (2552 passed, 1 fixed: `scripts/feature-map.test.mjs` unmapped-component guard)
- `npx eslint <changed files>` — lint (clean)
- `npx tsc --noEmit` — type check (clean)

### Completion Notes List

**Architecture deviation from the story's literal plan (discussed with and approved by Spencer before implementation):**

Investigation before coding found the story's planned integration point doesn't exist in the codebase as written. `TripEditBudget` is a dumb controlled field with no save logic of its own — Trip Currency is saved as one field of a combined `UpdateTripPatch` via `TripEditSheet`'s single "Save changes" button, which calls `updateTripMetadata()` in `src/app/(app)/trips/actions.ts` (not `budget/actions.ts`). That action already has an established "client decides, server can require confirmation, single transaction" pattern for a structurally identical problem (date changes that orphan events): `UpdateTripMetadataResult: {status:"saved"} | {status:"confirmation-required", confirmation}`, with `TripDateChangeConfirmationDialog` + pending-patch state in `TripEditSheet`/`page-client.tsx`.

Implemented the corrected design, approved by Spencer:

- Mismatch detection stays client-side and synchronous (per the story's intent — no server round trip to decide whether to show the dialog): `TripEditSheet` now takes an `expenses` prop and calls `hasCurrencyMismatch()` from `getPatch()`'s result before calling `onSave`.
- `updateTripMetadata()` gained a 5th param, `convertCurrency?: boolean`. When true and `budgetCurrency` is changing, it fetches the trip's expenses, calls `recalculate()`, and persists the conversions — **inside the same `db.transaction()`, right before each date-branch's trip-row commit** (not unconditionally at the top: two of the four date branches can return early without committing the trip row at all, e.g. when a date conflict needs its own confirmation first; converting expenses before that point would commit half-applied state — expenses marked converted to a currency the trip row never actually adopted).
- `TripCurrencyChangeMode` (`"convert" | "leave-as-is"`) added to `types.ts`, mirroring `TripDateConflictResolution`'s const-object-enum convention, threaded through `TripEditSheet.onSave` → `page-client.handleTripSave` → `use-trip-detail-handlers.handleTripSave` → `updateTripMetadata`. Toasts ("Currency and conversions updated." / "Trip currency changed." / "Couldn't update currency — try again.") fire only on this path, in `use-trip-detail-handlers.ts`, matching the story's copy — ordinary non-currency saves are unaffected and remain silent on success.
- Result: all 9 ACs are functionally satisfied and covered by tests, but the touched files differ from the story's Tasks/Subtasks list. Per the dev-story workflow's edit restrictions, the Tasks/Subtasks text itself couldn't be rewritten — superseded items are struck through with a pointer to where the equivalent work actually landed, and left unchecked since their literal text (e.g. `changeTripCurrency()` in `budget/actions.ts`) doesn't exist. The Story's Dev Notes section (which assumes the old plan) is now stale and should be corrected on the next pass through `create-story`/`correct-course` for this epic.

**E2E:** No new `.feature` scenario added. The directly analogous, more complex confirmation flow (date-change overflow, also a multi-button confirmation dialog gating a save) has zero E2E coverage of its own in `trips.feature` — it's fully covered by `TripEditSheet`/`actions.test.ts` unit and action tests, per the project's testing-pyramid rule against duplicating a unit-covered behavior at the E2E layer. Followed the same precedent here. `tests/e2e/feature-map.mjs` was updated to register the new `trip-currency-change-dialog.tsx` file under the existing `trips` feature entry (required by `scripts/feature-map.test.mjs`'s unmapped-component guard, which failed until this was added).

**Post-implementation fix (caught by Spencer's manual browser test, not by the automated suite — see Completion Notes):**

Manually testing the shipped flow (USD trip, add a 50 INR expense, change trip currency to GBP) found the dialog never opened. Root cause: `hasCurrencyMismatch()`/`recalculate()` (reused from Story 1.6 per the Dev Notes) are gated by `needsRecalculation()`'s *staleness* check — "might this rate still be a same-day proxy" — not "does this expense's currency differ from the trip currency at all." A same-day, freshly-created expense has `expense.date` equal to (not after) `dateOnly(createdAt)`, so the staleness check returns false and the mismatch is invisible, even though the currencies genuinely differ. The same bug would have silently under-recalculated on the Convert path too, since `recalculate()` applies the identical filter. Fixed by adding two new staleness-free functions instead of changing Story 1.6's existing, already-shipped behavior:

- `hasCurrencyChangeMismatch(expenses, newCurrency)` in `src/lib/budget.ts` — plain currency-code comparison, no `now`/staleness involved. Drives the dialog trigger (AC1/AC2).
- `recalculateAll(expenses, tripCurrency)` in `src/lib/currency.ts` — same batching/fetch logic as `recalculate()` (extracted into a shared private `convertExpenseBatch()` helper) but filters by currency only. Used by the Convert path (AC4).

`hasCurrencyMismatch()`/`recalculate()`/`needsRecalculation()` are untouched — they still correctly serve Story 1.6's "Recalculate Conversions" button, where staleness gating is the intended behavior. Added regression tests at the `lib/budget.ts`, `lib/currency.ts`, and `TripEditSheet` layers using a same-day/just-created expense fixture (the exact shape that triggered the bug) — these would fail against the original implementation.

### File List

- `_bmad-output/implementation-artifacts/1-7-trip-currency-change-confirmation.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/data/types.ts` — added `TripCurrencyChangeMode` enum
- `src/components/packt/trip-currency-change-dialog.tsx` — new
- `src/components/packt/trip-currency-change-dialog.test.tsx` — new
- `src/app/(app)/trips/actions.ts` — `updateTripMetadata()` gained `convertCurrency` param + `convertMismatchedExpenses()` helper (calls `recalculateAll`)
- `src/app/(app)/trips/actions.test.ts` — new `convertCurrency` tests
- `src/components/packt/trip-edit-sheet.tsx` — wired currency-mismatch check (`hasCurrencyChangeMismatch`) + `TripCurrencyChangeDialog`
- `src/components/packt/trip-edit-sheet.test.tsx` — new currency-confirmation tests, incl. same-day regression fixture
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts` — threads `currencyChangeMode`, fires toasts
- `src/app/(app)/trips/[tripId]/page-client.tsx` — passes `expenses` to `TripEditSheet`, forwards `currencyChangeMode`
- `src/lib/budget.ts` — new `hasCurrencyChangeMismatch()` (staleness-free)
- `src/lib/budget.test.ts` — new tests for `hasCurrencyChangeMismatch()`
- `src/lib/currency.ts` — new `recalculateAll()` (staleness-free) + extracted `convertExpenseBatch()` helper
- `src/lib/currency.test.ts` — new tests for `recalculateAll()`
- `tests/e2e/feature-map.mjs` — registered new dialog file under the `trips` feature

### Review Findings

- [x] [Review][Patch] `handleTripSave` loses `currencyChangeMode` on date-conflict resolution [`src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts:309-311`] — When both currency change and date conflict need resolution (user picks Convert in currency dialog, then server returns `confirmation-required` for date overlap), the resolution save path (`handleTripSaveResolution` → `handleTripSave(patch, resolution, confirmation)`) drops the `currencyChangeMode` param. `shouldConvertCurrency` is `false`, so expense conversions are never computed against the new currency. The trip's `budgetCurrency` is still updated via the patch, leaving stale `convertedAmountTrip` values. **Fixed**: threaded `currencyChangeMode` through `page-client.tsx` → `handleTripSaveResolution` → `use-trip-detail-handlers.ts`.
- [x] [Review][Patch] `onSave` called without await in `handleSaveClick` [`src/components/packt/trip-edit-sheet.tsx:196`] — dismissed: upstream `handleTripSave` catches errors internally; the promise never rejects.

- [x] [Review][Defer] Currency-change error toast hides actual error [`src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts:225-226`] — `toast.error("Couldn't update currency — try again.")` discards the `error` object. Spec-driven design choice (UX-DR16).
- [x] [Review][Defer] `convertMismatchedExpenses` reads all expenses then filters in JS [`src/app/(app)/trips/actions.ts:72-73`] — SQL selects every expense row for the trip, then `recalculateAll` discards matching-currency rows in JS. Performance optimization for future: could filter at the SQL level.
- [x] [Review][Defer] `TripCurrencyDialog` double-fires `onCancel` via button + onOpenChange [`src/components/packt/trip-currency-change-dialog.tsx:20,30`] — Cancel button calls `onCancel()` directly; `onOpenChange` also fires when parent sets `isOpen=false`. `restoreSaveButtonFocus` runs twice. Idempotent, harmless.
- [x] [Review][Defer] Focus returns to Save button, not currency trigger field (AC 9) — Spec was written for `TripEditBudget` architecture; corrected design wires through `TripEditSheet` where the trigger is the "Save changes" button. Focus target is correct for the implementation.

### Change Log

- 2026-06-26: Implemented Trip Currency Change Confirmation with a corrected architecture (see Completion Notes for the deviation rationale and approval). All 9 ACs covered by unit/component/action tests; full regression suite green.
- 2026-06-26: Fixed a staleness-gating bug caught by manual browser testing — the dialog never opened for same-day, just-created mismatched expenses because the reused Story 1.6 helpers (`hasCurrencyMismatch`/`recalculate`) are gated by date staleness, not just currency mismatch. Added `hasCurrencyChangeMismatch()` and `recalculateAll()` (staleness-free) instead of modifying Story 1.6's shipped behavior. Full validator re-run green: lint, tsc, coverage (2563 tests, lines 96.5%/functions 96.19%/branches 90.49%), E2E (158 scenarios), build.

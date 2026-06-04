# Story 3.5: Test Quality Improvements

Status: done

## Story

As a developer,
I want to fill gaps and improve robustness in packing tests,
So that edge cases are covered and tests are less brittle.

## Acceptance Criteria

### AC #1 — Pointer-drag E2E scenario

**Given** drag-to-reorder functionality
**When** E2E tests run
**Then** there is at least one mouse-based pointer-drag scenario (not just keyboard)

### AC #2 — groupPackingItems unit test

**Given** the `groupPackingItems` utility
**When** unit tests run
**Then** there is a dedicated pure-function test covering edge cases (undefined ids, empty groups, mixed labels/items)

### AC #3 — Touch target measurement

**Given** a touch target test
**When** it asserts 44×44px minimum
**Then** it uses rendered size measurement (E2E) or `getComputedStyle`, not class presence

### AC #4 — Parameterized keyboard-move index

**Given** the keyboard-move E2E step
**When** it asserts item position
**Then** the expected index is parameterized, not hardcoded to 1

### AC #5 — Drag helper retry on vanished target

**Given** the E2E drag helper encounters a vanished target
**When** `if (!box)` triggers
**Then** it retries instead of breaking out of the loop

### AC #6 — Optimistic update pattern test coverage

**Given** the packing list uses optimistic updates
**When** tests exercise add/remove/reorder
**Then** rollback, error handling, and concurrent mutation scenarios are covered

## Tasks / Subtasks

- [x] Split `packing-list-view.tsx` — extract `PackingEntryForm` into its own file
  - [x] Create `src/components/packt/packing-entry-form.tsx` with the extracted component (props: `draftName`, `hasItems`, `isSubmitting`, `onDraftNameChange`, `onSubmitItem`, `onSubmitLabel`)
  - [x] Import and render it from `packing-list-view.tsx`
  - [x] Create `src/components/packt/packing-entry-form.test.tsx` rendering `PackingEntryForm` directly
  - [x] **Move** these 4 tests from `packing-list-view.test.tsx` into the new file, rewritten to render `PackingEntryForm` directly instead of `PackingListView`:
    - "submits a plain-text item from the form"
    - "submits a section label from the form"
    - "submits an item from the entry form when the list already has items"
    - "submits a label from the entry form when the list already has items"
  - [x] **Keep** in `packing-list-view.test.tsx` — tests that reference form elements but test `PackingListView` behavior (empty state rendering, optimistic updates, touch target sizing, mutation guards). These continue rendering `PackingListView` and may need their imports updated to pull `PackingEntryForm` from the new path.
- [x] Add mouse/touch pointer-drag E2E scenario (AC: #1)
  - [x] Add `When` step for pointer-drag in `packing-tab.feature`
  - [x] Wire step to `dragItemOntoTarget` / `dragItemIntoUngroupedArea` helpers
- [x] Add dedicated `groupPackingItems` unit test (AC: #2)
  - [x] `packing-sort-utils.test.ts` already exists (191 lines, 4 groupPackingItems tests covering position sort, undefined-id filtering, stable-undefined-order)
  - [x] Add missing edge cases: empty items array, mixed labels/items with undefined properties, single-item sections, empty labels array
- [x] Fix touch target test approach (AC: #3)
  - [x] Replace `className` assertions in `packing-list-view.test.tsx` with `getComputedStyle` or rendered size checks
- [x] Parameterize keyboard-move E2E assertion (AC: #4)
  - [x] Update `packing-tab.steps.ts` keyboard-move step to accept expected index as parameter
- [x] Improve E2E drag helper retry logic (AC: #5)
  - [x] Replace `if (!box) break` with retry loop in `dragItemOntoTarget` and `dragItemIntoUngroupedArea`
- [x] Add optimistic update pattern test coverage (AC: #6)
  - [x] Test add/remove optimistic rollback on server failure
  - [x] Test concurrent mutation protection

### Review Findings

- [x] [Review][Patch] TypeScript type hack — `undefined as unknown as string` in test data bypasses the type system [`packing-sort-utils.test.ts`]
- [x] [Review][Patch] Void-operator swallows errors from async callbacks in test harness [`packing-entry-form.test.tsx`]
- [x] [Review][Patch] Race condition — `resolveAdd?.()` may silently no-op in deferred-announcement tests [`packing-list-view.test.tsx`]
- [x] [Review][Patch] No test coverage for `isSubmitting={true}` in isolated `PackingEntryForm` [`packing-entry-form.test.tsx`]
- [x] [Review][Patch] Retry loop exhaustion — all 4 `boundingBox` attempts fail, `mouse.up()` fires at stale coordinates [`packing-tab.steps.ts`]
- [x] [Review][Patch] Empty-string form submission not guarded — `handleSubmit` calls `onSubmitItem()` without validating `draftName` is non-empty [`packing-entry-form.tsx`]

Also dismissed: `minWidth` on `<span>` — element has `className="flex"` giving `display: flex`, so `minWidth` is effective. Not a bug.

## Dev Notes

### Pre-work: File Split

`packing-list-view.tsx` (347 lines) defines two components in one file: `PackingEntryForm` (lines 33–96) and `PackingListView` (lines 98–347). Extract `PackingEntryForm` into `src/components/packt/packing-entry-form.tsx` with its own colocated test file `packing-entry-form.test.tsx`. This brings the production file to ~280 lines (still slightly over the 250-line target — further extraction of handler logic into a custom hook is optional) and creates a natural split for the test file (1210 lines → ~1050 + ~160).

### Current State of Test Coverage

**`packing-sort-utils.test.ts` (191 lines)** — already exists despite epics marking it as NEW. Has tests for:
- `groupPackingItems`: sorting by position, undefined label id filtering (Bug #2 fix), stable order with undefined positions (Bug #5 fix)
- `containerKeyOfItem`: returns label id for items, UNGROUPED_KEY for ungrouped, fallback for undefined label id, null for missing
- `flatten`: preserves original positions (Bug #1 fix), sparse values, labelId correctness, section-then-ungrouped order
- `computeReorder`: within-section, cross-container, no-op on same id, label-as-active (Bug #7), label-as-over (Bug #6), container key, identical-order-null
- `sameOrder`: identical, different order, different labelIds, different lengths
- `arrayMove`: normal, out-of-bounds

`groupPackingItems` tests already exist but may need additional edge cases: empty groups, mixed labels/items arrays, undefined ids in mixed context.

**`packing-list-view.test.tsx` (1415 lines)** — 50+ tests across PackingListView + save-as-template blocks. Touch target tests use className assertions (`h-11`, `min-h-11`, `min-w-11`). Optimistic update tests exist for:
- Failure announcements (add failure, remove failure) — lines 1076, 1102
- Deferred announcements (add persistence wait) — lines 1129, 1160
- Server-triggered re-render (`isSubmitting` reset on prop change) — line 1199
- Concurrent mutation protection (lines 1242–1335): stale optimistic rollback ignored, mutation sequence increment

**`packing-tab.feature`** — 20 scenarios. 3 pointer-drag scenarios already exist (lines 135–164). Keyboard-move step (lines 82–88) asserts index 1.

**`packing-tab.steps.ts`** — `dragItemOntoTarget` and `dragItemIntoUngroupedArea` helpers have `if (!box) break` that exits the retry loop when target vanishes. Keyboard-move step (line 288) asserts `toBe("1")`.

### Implementation Details

**AC #1** — Add a mouse-based pointer-drag scenario. Three drag scenarios already exist using pointer events via `dragItemOntoTarget` and `dragItemIntoUngroupedArea`. Verify existing coverage suffices; if not, add scenario with explicit `page.mouse` steps.

**AC #2** — Add missing edge cases to `packing-sort-utils.test.ts`. The file already has `groupPackingItems` tests covering Bug #2 and Bug #5. Add tests for: empty items array, mixed labels and items with undefined properties.

**AC #3** — In `packing-list-view.test.tsx`, replace:
```ts
expect(textbox.className).toContain("h-11")
```
With rendered size check:
```ts
expect(textbox).toHaveStyle({ minHeight: "44px", minWidth: "44px" })
```
Or use `getComputedStyle` via `window.getComputedStyle(textbox).height`.

**AC #4** — Update keyboard-move step in `packing-tab.steps.ts`. Current assertion at line 288:
```ts
Then("I should see the item at position 1")  // hardcoded
```
Make it:
```ts
Then("the item should be at position {int}")
```
Update feature file to use `the item should be at position 1`.

**AC #5** — In both drag helpers, replace:
```ts
if (!box) break;
```
With retry loop:
```ts
if (!box) { await page.waitForTimeout(100); continue; }
```

**AC #6** — Add test cases in `packing-list-view.test.tsx` covering:
- Optimistic add rolls back on server error
- Optimistic remove rolls back on server error
- Concurrent reorder with stale mutation sequence guard

### Files to Modify

| File | Action | Changes |
|------|--------|---------|
| `src/components/packt/packing-list-view.tsx` | MODIFY | Extract `PackingEntryForm`; import from new file |
| `src/components/packt/packing-entry-form.tsx` | CREATE | Extracted `PackingEntryForm` component |
| `src/components/packt/packing-list-view.test.tsx` | MODIFY | Remove entry-form tests; fix touch target assertions; add optimistic update tests |
| `src/components/packt/packing-entry-form.test.tsx` | CREATE | Entry-form tests moved from `packing-list-view.test.tsx` |
| `tests/e2e/features/packing-tab.feature` | MODIFY | Add pointer-drag scenario; parameterize keyboard-move assertion |
| `tests/e2e/steps/packing-tab.steps.ts` | MODIFY | Fix drag helper retry; parameterize keyboard-move step |
| `src/components/packt/packing-sort-utils.test.ts` | MODIFY | Add missing edge cases for `groupPackingItems` |

### What Must NOT Change

- No changes to sort utils, server actions, or schema
- No new E2E scenarios that duplicate existing unit test coverage
- No changes to `packing-tab.feature` Gherkin steps structure (only add/update scenarios)
- `packing-sort-utils.test.ts` — do not remove or restructure existing tests; only add new ones
- Existing passing tests must continue to pass

### Testing Requirements

Story 3.5 IS about testing — all changes are to test files. Validation:
1. `npx vitest run --coverage` — coverage must remain ≥95% lines/functions, ≥90% branches
2. `npm run test:e2e` — all existing E2E scenarios must pass
3. New E2E scenarios must pass

### Library Constraints

- No new npm packages — Vitest, @testing-library/react, Playwright already installed
- Vitest ^4.1.6 — `toHaveStyle` matcher available
- `test:e2e` runs via `bddgen && playwright test` on port 3001

### Project Context Reference

- `src/components/packt/` — domain components with colocated test files
- `tests/e2e/features/` — Gherkin `.feature` files
- `tests/e2e/steps/` — Playwright step definitions
- Path alias `@/*` → `./src/*`
- E2E webServer runs on port 3001 with `UPLOAD_STUB=true`
- Before E2E run, `global-setup.ts` wipes and re-seeds E2E database

### Previous Story Intelligence (3.4)

From `3-4-database-schema-housekeeping.md`:
- Story 3.4 was pure schema administration: named indexes on `packingTemplates.userId` and `packingTemplateItems.labelId`
- Story 3.4 modified `src/db/schema.ts`, `packing-actions.ts`, `packing-actions.test.ts`, `actions.test.ts`, `package.json`, `tsconfig.json`
- Review findings from 3.4 identified test quality gaps that feed into this story:
  - Cache-hit test does not assert `transaction.select` was called with correct args — test quality gap deferred
  - `vi.resetAllMocks()` should be `vi.clearAllMocks()` — pre-existing pattern, not introduced by 3.4
- Story 3.4 added 9 saveTripListAsTemplate behavior tests to `packing-actions.test.ts`
- Story 3.4 modified `package.json` so `test:coverage` now migrates E2E schema before Vitest

### Git Intelligence

Recent commits (from `3-4-database-schema-housekeeping` branch merged):
- `ec914e1` — fix: name packing template indexes
- `84d8492` — test: align packing template action coverage
- `ad6549e` — chore: stabilize local validation inputs
- `087bfc4` — docs: update story 3.4 implementation status
- `1ee7835` — clean up lint warnings
- `9c0c786` — fix(review): restore saveTripListAsTemplate behavior test coverage

Test patterns established in previous stories:
- Test files live next to source: `packing-list-view.test.tsx` beside `packing-list-view.tsx`
- E2E steps in `tests/e2e/steps/packing-tab.steps.ts`
- Unit tests use `@testing-library/react` with `vi.mock` for server actions
- Optimistic update tests already exist in `packing-list-view.test.tsx` (lines 1199–1335)

## Dev Agent Record

### Agent Model Used

opencode/big-pickle

### Debug Log References
- `npx vitest run src/components/packt/packing-entry-form.test.tsx`
- `npx vitest run src/components/packt/packing-list-view.test.tsx`
- `npx vitest run src/components/packt/packing-sort-utils.test.ts`
- `npx bddgen`
- `npx playwright test .features-gen/tests/e2e/features/packing-tab.feature.spec.js`
- `npm run lint`
- `npx tsc --noEmit`
- `npm run test:coverage`
- `npm run test:e2e`
- `npm run build`

### Completion Notes List
- Extracted `PackingEntryForm` into its own client component with a colocated test file and kept `PackingListView` focused on stateful behavior.
- Replaced class-name touch-target assertions with rendered style checks and made the measured controls expose explicit 44px minimum dimensions.
- Added `groupPackingItems` edge-case coverage plus populated-form optimistic rollback and persistence tests in `packing-list-view.test.tsx`.
- Added explicit pointer-drag Gherkin steps, parameterized keyboard position assertions, and retry-on-vanish drag helper behavior in the packing E2E suite.
- Full validation passed with lint, type-checking, coverage, build, and Playwright E2E.

### File List
- `_bmad-output/implementation-artifacts/3-5-test-quality-improvements.md`
- `src/components/packt/packing-entry-form.tsx`
- `src/components/packt/packing-entry-form.test.tsx`
- `src/components/packt/packing-list-row.tsx`
- `src/components/packt/packing-list-view.tsx`
- `src/components/packt/packing-list-view.test.tsx`
- `src/components/packt/packing-sort-utils.test.ts`
- `tests/e2e/features/packing-tab.feature`
- `tests/e2e/steps/packing-tab.steps.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log
- 2026-06-03: Completed Story 3.5 by extracting the packing entry form, tightening packing-list and sort-utils test coverage, and updating packing-tab E2E drag/keyboard assertions.

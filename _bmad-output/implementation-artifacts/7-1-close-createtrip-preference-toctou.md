---
baseline_commit: cbc331710a2525a427c8895fd6ef8f1d901fe10d
---

# Story 7.1: Close the createTrip preference TOCTOU

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a traveler creating a new trip right after changing my global transit-mode or currency preference,
I want my new trip to use the preference values as they are at the moment the trip is actually committed,
so that a race between reading my preferences and committing the insert can't silently seed the trip with stale values.

## Acceptance Criteria

1. **Given** `createTrip` in `src/app/(app)/trips/actions.ts` currently selects the user's `transitMode` and `currency` via `db.select` before `db.transaction` opens, **when** the fix lands, **then** that select is removed and replaced by a `tx.select` of the same columns executed inside the `db.transaction` callback, immediately before the trip insert.
2. **Given** a user updates their global `transitMode` or `currency` in the window between when the old pre-transaction select would have run and when the insert commits, **when** `createTrip` runs with the fix applied, **then** the persisted `trips.transitMode` and `trips.budgetCurrency` reflect the value read inside the transaction, not any earlier value.
3. **And** the existing seeding precedence is unchanged: `transitMode = input.transitMode ?? user.transitMode ?? "drive"` (an invalid stored value still falls back to `"drive"` via `isTransitMode`), and `budgetCurrency = resolveBudgetCurrency(input.budgetCurrency ?? (user.currency ?? detectPreferredCurrency(acceptLanguage)))`.
4. **And** `requireUser()` and `headers()`/`detectPreferredCurrency` — neither of which reads the `users` table — stay outside the transaction; only the DB-sourced preference read moves.
5. **And** everything already inside the transaction (`trips` insert, `collaborators` insert, `days` insert) is unaffected in shape — only the source of `userId`/`userEmail`/`userName`/`transitMode`/`budgetCurrency` moves from an outer `const` computed before the transaction to values resolved inside the callback.

## Tasks / Subtasks

- [x] **Task 1: Move the preference read and validation inside `db.transaction`** (AC: #1, #2, #3, #4, #5)
  - Read `src/app/(app)/trips/actions.ts:219-346` (the full `createTrip` function) before starting.
  - [x] Delete the pre-transaction `db.select` (lines 222-231), the `if (!user?.id || !user.email) throw ...` guard, and the `budgetCurrency`/`resolvedTransitMode`/`transitMode` const computations (lines 247-249) from their current location — all of this moves inside `db.transaction`.
  - [x] Declare `let userId = ""` next to the existing `let tripId = ""` above the `db.transaction(...)` call.
  - [x] As the first statement inside `db.transaction(async (tx) => { ... })`, run `tx.select({ id: users.id, email: users.email, name: users.name, currency: users.currency, transitMode: users.transitMode }).from(users).where(eq(users.email, sessionUser.email!))` — same columns, same query, just via `tx` instead of `db`.
  - [x] Keep the `if (!user?.id || !user.email) throw new Error("Signed-in user could not be resolved before trip creation.")` guard inside the callback — throwing here rolls the transaction back cleanly (no partial rows), matching how `updateTripMetadata`'s "Trip not found." throw already behaves inside its own transaction in this same file.
  - [x] Assign `userId = user.id` (the outer-scoped variable), and compute `userEmail`, `userName`, `preferredCurrency`, `budgetCurrency`, `resolvedTransitMode`, `transitMode` as local `const`s inside the callback from the freshly-read `user` row. `acceptLanguage` (from `headers()`, computed before the transaction — no DB dependency) is captured by the closure unchanged.
  - [x] The `trips`/`collaborators`/`days` inserts that already run inside the transaction now reference these in-callback values — no shape or signature changes, only where the values are computed.
  - [x] Do not touch anything after `await db.transaction(...)` closes (the cover-image lookup/fetch block, `actions.ts:288+`). Its `db.select` for `defaultCoverType` stays a top-level call after the transaction — that data is unrelated to this TOCTOU.
  - [x] Leave the `startDate`/`endDate` format validation (lines 241-246) exactly where it is, before `db.transaction` opens — it's a pure input-format check with no `user`/DB dependency, so it stays a cheap fail-fast ahead of the transaction; do not fold it into the callback.
- [x] **Task 2: Update existing tests for the in-transaction read** (AC: #1, #2, #3, #4, #5)
  - `src/app/(app)/trips/actions.test.ts` — read the full `createTrip` describe block (lines 698-1086) before editing; it is the single largest source of implicit assumptions about call shape in this story.
  - [x] `setupCreateTripDb` (lines 732-777): move the user-preference row — currently the first `db.select.mockReturnValueOnce(...)` — onto a new `select` method on the `transaction` fixture object (alongside its existing `insert`). Keep the second `mockReturnValueOnce` (the `defaultCoverType` lookup) as the only remaining top-level `db.select` behavior. Add an optional third parameter `currency: string | null = "USD"` so callers can vary it without touching `db.select` directly.
  - [x] "rejects unsupported budget currencies before inserting a trip" (lines 719-730): currently asserts `expect(db.transaction).not.toHaveBeenCalled()`. That will now be false — currency resolution happens inside the transaction and rolls back on throw. Rebuild this test on `setupCreateTripDb` and assert the real invariant instead: `operations.inserts` is empty after the rejection (no trip/collaborator/day rows persisted).
  - [x] "falls back to locale-derived currency when the user preference is null" (lines 842-874): currently does a manual `db.select.mockReset()` + two `mockReturnValueOnce` calls to override the user row with `currency: null`. Replace with `setupCreateTripDb(null, null, null)` (new `currency` param) — no direct `db.select` manipulation needed since the user row now comes from the transaction fixture.
  - [x] "applies graphic cover without loading user preference when no destination is selected (AC6)" (line 1028): currently asserts `expect(db.select).toHaveBeenCalledOnce()`. After the fix, the preference read no longer goes through top-level `db.select` at all, and this scenario has no destination so the `defaultCoverType` lookup is also skipped — change to `expect(db.select).not.toHaveBeenCalled()`.
  - [x] "applies graphic cover preference when trip has coordinates but no destination name" (line 1045): currently asserts `expect(db.select).toHaveBeenCalledTimes(2)`. After the fix only the `defaultCoverType` lookup remains a top-level call — change to `expect(db.select).toHaveBeenCalledOnce()`.
  - [x] Every other `setupCreateTripDb`-based test in the describe block should need no logic changes, only picking up the updated helper — re-run them to confirm.
- [x] **Task 3: Add the TOCTOU regression test** (AC: #1, #2)
  - [x] Add a new test to the `createTrip` describe block that proves the persisted preference values are sourced from inside the transaction, not from any value available before `db.transaction` is called: build a transaction fixture with a `select: vi.fn(...)` spy returning a distinctive row (e.g. `{ id: "user-1", email: "test@example.com", name: "Test User", currency: "EUR", transitMode: "transit" }`), run `createTrip({ name: "Test" })`, then assert (a) that `select` spy was called exactly once, and (b) the inserted `trips` row's `transitMode`/`budgetCurrency` equal `"transit"`/`"EUR"` — the in-transaction values.
- [x] **Task 4: Full regression pass** (AC: all)
  - [x] Run `npx vitest run "src/app/(app)/trips/actions.test.ts"` — confirm every `createTrip` and `updateTripMetadata` test passes (this file covers both; don't skim past unrelated failures).
- [x] Run `packt-build-validator` once implementation and targeted tests are green. `src/app/(app)/trips/actions.ts` is a `SHARED_GLOB` (`tests/e2e/feature-map.mjs:227`), so affected-E2E runs the full Playwright suite for this story — do not skip it.

### Review Findings

- [x] [Review][Patch] Lock the preference row across the read and trip insert [src/app/(app)/trips/actions.ts:233] — PostgreSQL's default Read Committed isolation takes a new snapshot for each statement, so a profile update can commit after `tx.select(...)` and before the later `INSERT`; the new trip then still receives stale preference values. The row is now locked with `FOR UPDATE`, with regression coverage asserting the locked transactional read.

## Dev Notes

- **Scope discipline:** only `createTrip` and its colocated test change. `updateTripMetadata`, lower in the same file, already opens its own `db.transaction` for all its writes and does not have this TOCTOU shape — do not touch it.
- **Design decision — one consolidated read, not two:** `deferred-work-plan.md`'s Story A describes adding a fresh in-transaction re-read of `transitMode`/`currency` *alongside* the existing pre-transaction select. This story instead removes the pre-transaction select entirely and folds the user-existence check + preference read into one `tx.select` — keeping two reads of the same columns would be redundant and would reintroduce exactly the stale-vs-fresh ambiguity this story exists to close. This is a stricter (and simpler) fix than the plan's literal wording, consistent with its stated goal: "the values persisted are committed in the same snapshot as the insert."
- **Why `tx.select` is safe:** the object `db.transaction`'s callback receives (`tx`) exposes the same `select`/`insert`/`update` chain API as `db` — no new import needed, `tx.select(...)` composes identically to `db.select(...)`.
- **Rollback semantics:** throwing inside the transaction callback (invalid currency via `resolveBudgetCurrency`, or the unresolved-user guard) triggers Drizzle's automatic ROLLBACK — no partial `trips`/`collaborators`/`days` rows persist. This is the same behavior `updateTripMetadata` already relies on in this file (e.g. its "Trip not found." throw).
- **Don't touch the post-transaction `defaultCoverType` lookup** (`actions.ts:288+`) — different table columns, unrelated to this TOCTOU, stays a top-level `db.select` exactly where it is today.

### Project Structure Notes

- No new files.
- Modify: `src/app/(app)/trips/actions.ts` (`createTrip` only), `src/app/(app)/trips/actions.test.ts` (`createTrip` describe block only).
- Matches existing file/test colocation convention exactly.

### References

- [Source: _bmad-output/implementation-artifacts/deferred-work.md] — "Deferred from: code review of 1-2-seed-trip-transit-default-automatically (2026-07-13)": "TOCTOU: transitMode resolved from a snapshot taken before the insert transaction... Same pattern already exists for budgetCurrency resolution in this function; not introduced uniquely by this change."
- [Source: _bmad-output/implementation-artifacts/deferred-work-plan.md#Story A — Close the createTrip preference TOCTOU] — planning rationale and approach this story formalizes.
- [Source: _bmad-output/planning-artifacts/epics.md#Epic 7: Deferred-Work Hardening — Route Correctness, Effect Stability & Measured Sizing] — Story 7.1 acceptance criteria (this file's ACs are adapted from there).
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Model: Transit Mode Preference] — confirms `trips.transitMode` seeding precedence (`input.transitMode ?? user.transitMode ?? "drive"`) mirrors the pre-existing `budgetCurrency` pattern exactly; this story's fix must preserve that precedence.
- [Source: src/app/(app)/trips/actions.ts:219-346] — `createTrip`, the function being modified.
- [Source: src/app/(app)/trips/actions.test.ts:698-1086] — `createTrip` describe block, tests being modified/added.
- [Source: tests/e2e/feature-map.mjs:227] — confirms `src/app/(app)/trips/actions.ts` is a `SHARED_GLOB` entry (full E2E suite triggered for this story via affected-E2E).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

`npx vitest run "src/app/(app)/trips/actions.test.ts"` — 83 passed (0 failed)
`npm run test:coverage` — 3168 passed, lines 96.29%, functions 96.57%, branches 90.38%
`npm run test:e2e:affected` — 190 passed (full suite; `actions.ts` is a `SHARED_GLOB`)
`npx tsc --noEmit`, `npm run lint`, `NEXT_DISTDIR=.next-validate npm run build` — all clean

### Completion Notes List

- Moved the `createTrip` user-preference read (`transitMode`, `currency`) from a pre-transaction `db.select` into a `tx.select` executed as the first statement inside `db.transaction`, alongside the existing user-existence guard, `budgetCurrency`/`transitMode` resolution, and the trip/collaborator/day inserts that already ran there — one consolidated in-transaction read instead of the plan's literal two-read approach, since a second read of the same columns would just reintroduce a stale-vs-fresh ambiguity.
- Left `requireUser()`, `headers()`, and the `startDate`/`endDate` format validation exactly where they were (no DB dependency, cheap fail-fast ahead of the transaction). Left the post-transaction `defaultCoverType` lookup untouched (unrelated data, different table columns).
- Updated 3 existing test assertions that depended on the old call shape: the invalid-currency test now asserts no rows were inserted instead of asserting `db.transaction` was never called (it now opens and rolls back); the two `db.select` call-count assertions in the AC6/coordinates-only cover tests dropped by one each since the preference read no longer goes through top-level `db.select`.
- Added a new regression test asserting the transaction's own `select` is called exactly once and that the persisted `trips` row's `transitMode`/`budgetCurrency` match the in-transaction read.
- Also added Epic 7 (all 5 deferred-work stories, 7.1-7.5) to `epics.md` and corresponding `sprint-status.yaml` entries, since `deferred-work-plan.md` isn't a dev-ready story file and explicitly calls for this via `bmad-create-story` before dev begins.
- Validation: lint, TypeScript, coverage (3168 tests), full E2E (190 scenarios, `actions.ts` is a `SHARED_GLOB`), and production build all passed.

### File List

- src/app/(app)/trips/actions.ts
- src/app/(app)/trips/actions.test.ts
- _bmad-output/implementation-artifacts/7-1-close-createtrip-preference-toctou.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- _bmad-output/planning-artifacts/epics.md

## Change Log

- 2026-08-03: Closed the `createTrip` preference TOCTOU by moving the `transitMode`/`currency` read inside the insert transaction.

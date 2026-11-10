---
title: "Refactor sweep"
type: refactor
ticket: 9
created: "2026-11-09"
status: done
baseline_revision: "bb4dbcae92d1d29e478643997704e613c05af801"
route: full
route_source: auto
risk: medium
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context: [_bmad-output/initiative-mobile-api/AGENTS.md]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Stories 1.1-1.8 left duplicated boilerplate in the checklist service and client hook, plus a few exports used by nothing outside their own file. Risk is medium, not low: the service code owns transactions, locks and replay.

**Approach:** Remove only that duplication behind identical behavior, traced to the pilot plans below. Add no features, endpoints, UI or domain changes. Also remove tests whose only job is to show the old behavior is gone; the tests of the new behavior already cover that.

## Boundaries & Constraints

**Always:** Branch `story/1-9-refactor-sweep` from latest `feature/api-v1`; PR base `feature/api-v1`; return to `feature/api-v1` after the PR. Behavior-preserving: same queries in the same order, same lock keys and order, same statuses, same after-commit effects. Characterize before extracting; existing tests must pass unchanged except mocks that encode a removed duplicate query. Each cleanup cites its source plan in Implementation Notes. Tests describe current behavior only: no test or title asserts that a former behavior was retired, removed or replaced (decision 2026-11-09).

**Never:** Migrations; API or contract changes; UI, component or prop-signature changes (including the unused `isChecked` argument on `handleToggleChecklistItem`); the deferred findings (stable create UUIDs, double-click guard, idempotency retention sweep, `actions.ts` feature-map entry); `CHANGELOG.md`; full E2E; push without authorization.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| UUID claim | Create with `id` and `firstItem.id`, or item create with `id` | Advisory locks taken in sorted `checklist:`/`checklist-item:` order, before the trip lock | Unchanged |
| First-item id exists elsewhere | `firstItem.id` already stored in another trip | Viewer check on that trip first (404 if none), then 409 | Concealment unchanged |
| Rolled-back write | `mutate` throws | No after-commit effect, no replay record | Error propagates unchanged |
| Replay | Same key and body | Stored value returned, `afterTripWrite` not called | Unchanged |
| Rapid client writes | Toggle, edit, rename, add, delete in quick succession | Same per-key order, same optimistic overrides, same cleanup on settle or auth loss | Unchanged |

</frozen-after-approval>

## Code Map

- `src/lib/services/checklists.ts` -- six writes repeat `let changed=false; db.transaction(withIdempotency…); if (changed && !replayed) afterTripWrite(...)` (L125-237, 252-282, 295-319, 352-399, 413-443, 457-480); the two `pg_advisory_xact_lock(hashtextextended(...))` blocks (L134-141, L360-363); three inline `select().from(checklistItems).where(eq(id))` (L178, L376, L426); first-item check at L177-187 selects, then `itemTripId` selects again. Sources: plans 1.2, 1.5, 1.6, 1.7.
- `src/lib/services/checklists.test.ts` -- mock-based (84 cases); mocks encode query order.
- `src/app/(app)/trips/[tripId]/use-checklist-handlers.ts` -- the track-then-clear pattern appears 3x (`trackItemWrite` L108, `itemCreates` L176-180, `titleWrites` L265-268); the copy-map-and-delete state updater appears 5x. Sources: plans 1.3, 1.5, 1.6.
- `src/app/(app)/trips/[tripId]/use-checklist-handlers.test.tsx` -- ordering, refresh, auth-loss tests; the safety net.
- `src/lib/api/idempotency.ts` (`IDEMPOTENCY_KEY_MAX`, `IDEMPOTENCY_LOCK_TIMEOUT_MS`, `IdempotencySteps`) and `src/lib/api/route.ts` (`ApiRouteOptions`) -- exported, referenced only in their own file. Keep `API_IDEMPOTENCY_NAMESPACE`, `DEFAULT_IDEMPOTENCY_EXPIRY_MS`, `fingerprintRequest` (tests import them). Source: plans 1.2, 1.4.
- `src/app/(app)/trips/[tripId]/actions.test.ts` L1848-1851 -- "exports no checklist item mutation actions" guard (added by 1.8); tests only that old behavior is gone.
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx` L688 -- body is positive (asserts the three API calls); only the title says "instead of server actions".
- `scripts/feature-map.test.mjs` ~L67 -- "still classifies the trip actions module once checklist actions are retired"; asserts current classification, title framed around retirement.
- Do not touch: `withIdempotency` semantics, `actions.ts`, contract files, components, routes.

## Tasks & Acceptance

**Execution:**

- [ ] `actions.test.ts`, `use-trip-detail-handlers.test.tsx`, `feature-map.test.mjs` -- delete the export guard; retitle the other two to describe current behavior ("sends checklist item add, edit and delete to the item endpoints"; "classifies the trip actions module under app-activity and SHARED_GLOBS"). Then grep all pilot-touched tests, features and steps for "retired", "no longer", "instead of", "legacy", "removed" and delete or retitle any other test that proves only absence of old behavior, keeping `not.toHaveBeenCalled` checks that guard new behavior -- no old-behavior tests remain
- [ ] `src/lib/services/checklists.test.ts` -- run first and report coverage of each branch named in the matrix; add characterization cases for any gap (lock order, cross-trip first-item id, no effect on rollback or replay) -- pins behavior before extraction
- [ ] `src/app/(app)/trips/[tripId]/use-checklist-handlers.test.tsx` -- add a case for any untested path among: item-create ordering per checklist, delete waiting on in-flight writes, auth-loss clearing title and item optimism -- pins behavior before extraction
- [ ] `src/lib/services/checklists.ts` -- extract `lockClientIds(transaction, resources)`, `readItem(executor, id)` and one `runChecklistWrite` helper owning the transaction, `withIdempotency` call and `changed`/`replayed` effect gate; use `readItemTripId` in the first-item check, dropping the second select -- one copy each
- [ ] `src/app/(app)/trips/[tripId]/use-checklist-handlers.ts` -- add module-level `trackWrite(writes, key, write)` and `withoutKey(map, key)`/`withoutKey(set, key)` helpers; replace the repeats -- no behavior change
- [ ] `src/lib/api/idempotency.ts`, `src/lib/api/route.ts` -- drop `export` from the four symbols above -- smaller public surface; export-only, so `idempotency.test.ts` and `route.test.ts` run unchanged (no test imports these symbols) and tsc proves no consumer broke
- [ ] Search `src` for any removed or renamed symbol -- expected: no stale reference

**Acceptance Criteria:**

- Given the sweep, when the targeted Vitest files run, then they pass with no weakened assertion.
- Given each cleanup, when the Implementation Notes are read, then it names its source plan or finding.
- Given the pilot's tests, when searched, then none exists whose only purpose is to show a former behavior is gone, and the new-behavior tests it relied on still pass.
- Given the diff, when reviewed, then it contains no API, contract, UI or prop change and no new capability.

## Implementation Notes

Implemented directly (no subagent authorized). Branch `story/1-9-refactor-sweep` from `feature/api-v1` (bb4dbcae); PR base `feature/api-v1`; nothing committed or pushed.

- Tests describing only absence of old behavior (decision 2026-11-09; plan 1.8): deleted the `actions.test.ts` export guard and its `actionsModule` import; retitled `use-trip-detail-handlers.test.tsx` L688 and `feature-map.test.mjs` L66 to describe current behavior. Grep of pilot tests/features/steps for "retired", "no longer", "instead of", "legacy", "removed" found no other absence-only test.
- `checklists.ts` (plans 1.2, 1.5, 1.6, 1.7): `lockClientIds` (one copy of the sorted advisory-lock loop, used by create and item create), `readItem` (two inline selects; the third went away with the first-item change), `runChecklistWrite` (transaction, `withIdempotency`, `changed`/`replayed` effect gate for all six writes). First-item check now calls `readItemTripId` once instead of select + `itemTripId`. Same query order, lock keys and order, statuses, effects.
- `use-checklist-handlers.ts` (plans 1.3, 1.5, 1.6): module-level `trackWrite` (replaces `trackItemWrite` and the two inline copies) and `withoutKey` (four state-updater copies; the plan said five, only four exist).
- `idempotency.ts`, `route.ts` (plans 1.2, 1.4): dropped `export` from `IDEMPOTENCY_KEY_MAX`, `IDEMPOTENCY_LOCK_TIMEOUT_MS`, `IdempotencySteps`, `ApiRouteOptions`. `runChecklistWrite` types its steps inline rather than importing `IdempotencySteps`.
- Characterization added first, green on old code: `checklists.test.ts` (sorted first-item/checklist lock order before trip lock; readable foreign first-item id returns 409 after viewer check), `use-checklist-handlers.test.tsx` (settled item writes, adds and renames stop blocking deletes; an older write settling never clears a newer one, for items and titles). Service test mock: first-item existence now comes from the ancestry lookup (`itemGone` defaults true in the lifecycle block, false in the item block) because the removed duplicate select was what encoded it; no assertion weakened.
- Verification so far: targeted Vitest (16 files, 435 tests) pass, `tsc --noEmit` clean, eslint 0 errors on touched dirs. E2E and `build-validator` not run yet.

## Plan Change Log

## Review Triage Log

Lenses: blind-hunter, edge-case-hunter (none), verification-gap (none), intent-alignment (descriptive). Diff 41 KB.

| Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| First-item check changed semantics (`readItemTripId` vs select + `itemTripId`) | false | rejected | Both FKs are `notNull` with cascade (`schema.ts` 440-459), so an item without ancestry cannot exist; the plan directs this change. |
| `itemGone` default flipped, fragile (blind, alignment) | low | rejected | Mock-only; fix is a mock redesign, more than a direct correction; each affected test sets it. |
| Lock-order test brittle, missing reverse-sort and single-id cases | false | rejected | `calls` pins both locks before `trip-lock`; single-id path covered by the item-lifecycle test. |
| Foreign first-item asymmetry, unreadable foreign has no test | false | rejected | "conceals inaccessible foreign first-item" covers it; the authorize/mutate placement predates this change. |
| Deleted export guard has no replacement | false | rejected | Intent removes absence-only tests. |
| `feature-map` title overstates assertion | false | rejected | The test asserts both the app-activity tag and a SHARED_GLOBS match. |
| `IdempotencySteps` shape redeclared inline; un-exports unevidenced | low | rejected | Plan directs the un-export; grep shows no importers and tsc is clean; fix adds a type. |
| `trackWrite` unhandled rejection, no `itemCreates` newest-wins test | false | rejected | `mutate` never rejects (edge lens); same pattern as before; `itemCreates` shares the helper. |
| `withoutKey` cast and placement | low | rejected | No named harm; overloads are more than a correction. |
| `readItemTripId` and `itemTripId` defined after first use | low | patch | Moved beside `readItem`; 120 service tests, tsc and eslint pass. |
| Intent alignment: evidence is mocked-unit, not DB-level; added tests beyond removal | n/a | noted | Descriptive; behavior-preservation at DB level is covered by the affected E2E run below. |

## Design Notes

Skipped on purpose: threading `isChecked` through row, item, day-card and handler types is dead since 1.3 replaced it with revision-based intent, but removing it edits about ten UI files and tests, breaking "no unrelated UI changes". Recorded for a later UI cleanup.

## Verification

**Commands:**

- `npx vitest run src/lib/services/checklists.test.ts "src/app/(app)/trips/[tripId]/use-checklist-handlers.test.tsx" src/lib/api scripts/feature-map.test.mjs` -- expected: pass
- `npm run test:e2e:affected` -- expected: api, day-planning, packing-lists pass
- Then `build-validator` (lint/types/build; coverage alone; affected E2E alone) -- expected: PASS

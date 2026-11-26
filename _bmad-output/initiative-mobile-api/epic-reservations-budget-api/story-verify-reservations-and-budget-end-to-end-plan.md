---
title: Verify reservations and budget end to end
type: chore
ticket: 9
created: "2026-11-25"
status: done
baseline_revision: "dbbe043c6b47e475a4edd740480286409f7b14b3"
route: full
route_source: auto
risk: low
review: ""
review_source: ""
lenses_ran: []
review_loop_iteration: 0
context: ["_bmad-output/initiative-mobile-api/AGENTS.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Separate tests cover reservations, documents and expenses. Story 7.9 needs proof that they work together through the production app and that API safeguards hold across the epic.

**Approach:** Drive one reservation and its budget lifecycle through the browser, verify persisted outcomes after reload, and record executable evidence for deletion records, replay windows and ETag determinism.

## Boundaries & Constraints

**Always:** Use scenario-owned trips and rows, the production E2E build, and the existing FX fixture. Await mutation responses before reload. Story branch `story/7-9-verify-reservations-budget`; PR base `feature/api-v1`.

**Never:** Add shared seed rows, sleep through replay windows, or change runtime behavior, API contracts or schema for this verification story.

## I/O & Edge-Case Matrix

| Case | Action | Expected |
| --- | --- | --- |
| Combined lifecycle | Create and rename lodging, upload a document, add a linked USD 100 cost and an unlinked EUR 35 Misc expense, switch trip currency to EUR without conversion and recalculate | Reload shows renamed lodging with its document and linked cost. Budget shows €127.00 and persisted conversion fields. |
| Cascade | Delete lodging, reload both tabs | Lodging, linked expense and uploaded document and file are gone. Misc row and €35.00 total survive. |
| Direct expense delete | Delete an expense under a surviving trip and retry its client ID | Recent deletion returns 409 and no row reappears. |
| Key lifetime | Retry a keyed reservation request while live and again after aging its own replay record | While live, return the stored response without writing. After expiry, execute the request and replace the record. |
| Snapshot | Fetch a populated trip twice and send the original ETag conditionally | Same ETag on unchanged state and bodiless 304. A write affecting the snapshot changes its ETag. |

</frozen-after-approval>

## Code Map

- `tests/e2e/features/reservations.feature` and `tests/e2e/steps/reservations.steps.ts` cover lodging, linked costs, file cleanup and direct reservation/date-pruning replay. Reuse the existing provider value for the inline rename step.
- `tests/e2e/steps/budget.steps.ts` has Misc UI, currency change and recalc steps plus exact persisted FX assertions. Use a scenario-owned USD budget. Age only the foreign expense and give it a historical date so the recalc control appears deterministically.
- `tests/e2e/features/api.feature` and `tests/e2e/steps/api.steps.ts` have scoped expiry fixtures, cascade record checks and snapshot tests including ties with reservations and expenses.
- `src/lib/api/idempotency.test.ts` covers the exact expiry boundary and retention. `src/lib/services/deletion-records.test.ts` covers recent deletion lookup and namespace.

## Tasks & Acceptance

**Execution**

- [ ] Add the combined scenario to `tests/e2e/features/reservations.feature`. Extend `tests/e2e/steps/reservations.steps.ts` and `tests/e2e/steps/budget.steps.ts` for the currency fixture and exact persisted totals and row checks. Use the existing mother and API wait helpers. Scope displayed totals to the Actual spent summary. Verify the surviving EUR Misc row by ID and the removed document by ID and storage key.
- [ ] In `tests/e2e/features/reservations.feature` and `tests/e2e/steps/reservations.steps.ts`, add direct expense deletion to the replay audit and add a reservation key-expiry case. Reuse existing HTTP helpers and scoped record aging. Apply a keyed PATCH, change the same field separately, then retry the original request before and after aging its record to distinguish replay from a persisted write.
- [ ] In `tests/e2e/feature-map.mjs`, map the budget steps and Budget UI dependencies reached by the combined reservation scenario so relevant changes select it.
- [ ] Run focused tests and record each invariant, the exact proving test, and its result in Verification. Include direct reservation and expense deletion, reservation/date pruning and parent cascades, live and expired replay, and stable/invalidation ETag checks.

**Acceptance Criteria**

- Given an isolated trip, when the combined scenario runs against the production build and reloads, then the browser and persisted rows show the recalculated total before deletion and the surviving Misc amount after it.
- Given prior API coverage and the new checks, when the invariant pass completes, then each requested invariant has named, passing evidence in the plan.

## Implementation Notes

## Plan Change Log

## Review Triage Log

## Verification

- Run focused production Playwright via `node scripts/run-e2e.mjs --grep=<scenario-pattern>` for the combined scenario, deletion and cascade cases, replay windows and snapshot ETags.
- Run `npx vitest run src/lib/api/idempotency.test.ts src/lib/services/deletion-records.test.ts scripts/feature-map.test.mjs`.
- Run build-validator after targeted checks pass.

Branch: `story/7-9-verify-reservations-budget`; PR base `feature/api-v1`.

Focused production Playwright (`node scripts/run-e2e.mjs --grep=…`): 12 + 9 scenarios passed. Vitest (`idempotency`, `deletion-records`, `feature-map`): 72 passed.

| Invariant | Proving test | Result |
| --- | --- | --- |
| Combined lifecycle, recalculation, cascade, Misc survives | `reservations.feature` › A lodging reservation and its budget survive reload until the lodging is deleted | pass |
| Direct reservation + expense deletion record | `reservations.feature` › Deleted reservation and expense IDs cannot be replayed (direct) | pass |
| Reservation/date pruning deletion record | same outline (pruning) | pass |
| Direct expense deletion record | `reservations.feature` › A directly deleted expense ID cannot be replayed | pass |
| Parent cascades (event, day, checklist, packing, trip) | `api.feature` › Cascade-deleted client IDs cannot be recreated under a live parent (5 examples) | pass |
| Live replay writes nothing | `reservations.feature` › A live reservation key replays and an expired key writes again | pass |
| Expired key executes and replaces record | same scenario; `api.feature` › Expired keys execute again and replace the record; `idempotency.test.ts` boundary | pass |
| ETag stable, 304, invalidated by write | `api.feature` › Trip snapshot ETag is stable, changes with a write and answers 304 | pass |
| ETag stable under position ties | `api.feature` › Trip snapshot ETag stays stable when rows tie on position | pass |

**Build-validator result:** PASS. Lint pass; TypeScript pass; production build pass; coverage pass (521 files, 8441 tests; 97.29% statements, 94.3% branches, 97.76% functions, 98.19% lines); affected E2E pass (742 passed). Lint, TypeScript and feature-map tests were rerun after the final step-file edit. A first affected run failed 4 scenarios because the shared "Actual spent" step was tightened; fixed by adding a separate strict step. One budget recalc scenario failed once under load and passed on isolated reruns and the full rerun.

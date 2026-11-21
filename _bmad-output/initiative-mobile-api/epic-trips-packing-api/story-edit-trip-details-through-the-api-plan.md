---
title: "Edit trip details through the API"
type: feature
ticket: 6
created: 2026-11-20
status: done
baseline_revision: "e5f34139b5f1ff153ca2b7adae48c760e5182aa8"
route: full
route_source: auto
risk: high
review: 'thorough'
review_source: 'auto'
lenses_ran: ['blind-hunter', 'edge-case-hunter', 'verification-gap']
review_loop_iteration: 1
context: ["{project-root}/_bmad-output/initiative-mobile-api/AGENTS.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Trip metadata edits depend on a server action unavailable to API clients.

**Approach:** Add a partial trip metadata PATCH and migrate metadata-only edits from trips, trip detail and travel history, preserving existing behavior and currency conversion.

## Boundaries & Constraints

**Always:** Story branch `story/5-6-trip-details-api`; PR base `feature/api-v1`. Test first. Preserve editor authorization, transactional locking, conversion rollback, activity, live events, refresh and error handling. API writes recheck access for idempotent replay. Unsent fields remain unchanged. No schema or environment changes.

**Never:** Add date or cover fields to this endpoint, migrate trip date changes or covers, alter server-side page reads, commit directly to the integration branch, or target main.

## I/O & Edge-Case Matrix

| Scenario | Input / state | Expected behavior |
| --- | --- | --- |
| Partial edit | Name, destination, tags, budget or transit mode provided | Only supplied metadata changes; nullable values and zero retain their meaning |
| Currency | Supported currency with conversion requested | Recalculate expense amounts in the same locked transaction; failure rolls back all changes. Without conversion, preserve amounts |
| Invalid input | Unknown, date, cover, unsupported currency or invalid mode | Reject without writing |
| Access and replay | Editor, viewer, stranger or keyed retry | Editor succeeds; viewer 403; stranger 404; replay rechecks authorization without repeating writes |
| Mixed edit | Metadata and dates changed together | Keep entire request on existing date action until story 5.7; conflict preview/cancel commits nothing and confirmation remains atomic |

</frozen-after-approval>

## Code Map

- `src/app/(app)/trips/actions.ts` — `updateTripMetadata` combines metadata, dates, covers and conversion; keep date/cover action and its confirmation behavior for story 5.7. Conversion uses `recalculateAll` and `dbExpenseToType` within a locked transaction.
- `src/lib/services/trip-write.ts` — reuse `runTripWrite`, locking, authorization, idempotency and after-write effects. Preserve `/trips` revalidation and existing live events. `src/lib/validation-schemas.ts` contains the existing update constraints; derive a strict metadata-only request schema.
- `src/lib/api/contract/packing.ts`, `src/app/api/v1/packing-items/[itemId]/route.ts` — contract and route patterns. `src/data/types.ts` owns domain types. `docs/api-v1.md` and `tests/e2e/feature-map.mjs` document and map endpoint ownership.
- `src/components/arrivo/trip-edit-sheet.tsx` sends dates even when unchanged; compare against the original trip in the callers, not mere field presence. Preserve unchanged null/date semantics and whole mixed patches on the legacy action. Detail alone passes conversion choice.
- `src/app/(app)/trips/use-trips-page-handlers.ts`, `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts`, `src/app/(app)/travel-history/use-travel-history-page-handlers.ts` — migrate metadata-only saves, retaining date confirmation, pending state and error behavior. `src/app/(app)/trips/[tripId]/transit-actions.ts` has no production callers.

## Tasks & Acceptance

**Execution:**

- [x] Tests first: create `src/lib/services/trips.test.ts`, `src/lib/api/contract/trips.test.ts`, and `src/app/api/v1/trips/[tripId]/route.test.ts`. Cover matrix cases, normalized currency, null/zero, conversion failure rollback, partial preservation, effects and replay authorization. Update `src/app/(app)/trips/actions.test.ts` for retained date/cover behavior.
- [x] Tests first: update `src/app/(app)/trips/use-trips-page-handlers.test.tsx`, `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx`, `src/app/(app)/travel-history/use-travel-history-page-handlers.test.tsx`, and `src/app/(app)/trips/page-client.test.tsx`. Verify metadata API calls, errors, unchanged dates, mixed edit confirmation/cancel and conversion choice. Create `src/lib/trip-metadata-save.test.ts` for date comparison, nullable dates and dispatch of mixed edits.
- [x] Extend `tests/e2e/features/trips.feature`, `trip-tabs.feature`, `travel-history.feature`, `api.feature` and `tests/e2e/steps/trips.steps.ts`, `trip-tabs.steps.ts`, `travel-history.steps.ts`, `api.steps.ts` for edits and reload from all three callers, API partial preservation, conversion and access. Use scenario-owned fixtures and API waits for metadata; retain server-action waits for date saves.
- [x] Add `src/lib/services/trips.ts`, `src/lib/api/contract/trips.ts`, and `src/app/api/v1/trips/[tripId]/route.ts` for strict PATCH, atomic conversion and authorized replay. Create `src/lib/trip-metadata-save.ts` for shared date comparison and update the three handlers; keep mixed date edits atomic on the existing action. Remove unused `transit-actions.ts` and its tests. Update `docs/api-v1.md` and register service, contract and route in `tests/e2e/feature-map.mjs` for all affected features.

**Acceptance Criteria:**

- Given an editor changes metadata on trips, trip detail or travel history, when they save and reload, then the change persists and omitted fields remain unchanged.
- Given a metadata edit with changed dates requiring confirmation, when the user cancels or confirms, then no partial metadata is saved before confirmation and the existing date behavior remains intact.
- Given a viewer or stranger sends PATCH, when authorization is checked, then the response is 403 or 404 respectively and nothing changes.
- Given a requested currency conversion, when it succeeds or fails, then expense conversions and trip currency commit together or both roll back.

## Implementation Notes

Review fixes: verify HTTP response fields, authorized replay without repeated effects, omitted and null metadata, no-conversion preservation, conversion failure, caller error paths and side effects. Map the shared save helper to day-planning and document constraints and failures. Treat a conversion flag without currency or other metadata as a no-op.


## Plan Change Log

- User directed fixing review findings in place; retain the existing implementation instead of resetting and rebuilding it.

- Review found expenses already in the newly selected currency retained conversions in the old currency. Reset matching expenses to their native amount, rate 1, and selected currency in the transaction alongside other conversions; test stored values and budget totals. Preserve strict partial metadata, locked access and replay, rollback, effects, mixed-date dispatch, and passing caller and access scenarios. Avoid stale conversions when changing currencies.


## Review Triage Log

- Edge hunter: medium, bad_plan — conversion skips expenses matching the new currency; budget totals use stale converted amounts. Fix identity conversions transactionally.
- Blind 1: medium, deferred — web saves lack a retry key; a retry after a timeout can reconvert at another rate. Retry-key lifecycle requires a broader interaction design; existing manual retry has no automatic replay guarantee.
- Blind 2: low, patch — conversion without currency triggers a timestamp and effects while converting nothing.
- Blind 3: medium, defer — the established Trip mapper omits budget when its total is null, so the existing domain representation does not expose currency alone.
- Blind 4: medium, patch — the save helper is not mapped to day-planning, skipping mixed-date E2E for its changes.
- Blind 5: medium, bad_plan — rate failure is mocked and transaction rollback is tested via replay insertion; verify the real rate-failure path.
- Blind 6 / verification 2: medium, bad_plan — authorized replay lacks a test for identical response and no repeated effects.
- Blind 7: medium, bad_plan — tests do not verify persisted omitted and explicitly null metadata against real storage.
- Blind 8: medium, bad_plan — no test verifies currency changes without conversion preserve expense values.
- Blind 9: medium, patch — API documentation lacks request constraints and failure behavior.
- Verification 1: medium, bad_plan — updated response and preserved fields are not asserted at the HTTP boundary.
- Intent alignment: descriptive report confirms narrow dispatch and identifies the same side-effect and error-path coverage gaps. Shared afterTripWrite records activity, publishes the event, and revalidates the trip route; the service also revalidates /trips.


## Handoff — work in progress

Implementation is present as uncommitted and untracked changes on the current story branch. Do not reset it or start over. Task checkboxes above have not been reconciled with the implementation. Review fixes were interrupted for handoff: the service now includes a native-currency conversion reset and a no-op guard, with unit tests added, but these latest edits have not been verified. Inspect the working tree and finish all review fixes in place. The intent-alignment findings were supplied by the user and summarized in the triage log; the separate intent-alignment prompt file is a temporary review artifact.

The initial implementer reported focused unit suites passing (238, then 113 and 150 tests), 21 feature-map tests passing, and targeted E2E passes for all three caller surfaces, access, revoked replay, conversion commit/rollback, mixed-edit confirmation, and deep-linked detail editing. The production build and TypeScript passed during those runs. These results predate the interrupted review fixes. The full build-validator gate has not run.

## Verification

- Run targeted Vitest files and affected trip, travel-history and API scenarios first.
- Invoke `build-validator` after targeted checks pass; it runs lint, types, build, coverage and affected E2E in the required order.

---
title: "Pack and edit a packing item through the API"
type: feature
ticket: 1
created: 2026-11-19
status: done
baseline_revision: "66d70173ca326bb04fc56cd1b8a06ec79f892ec8"
route: full
route_source: auto
risk: high
review: "thorough"
review_source: "auto"
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 1
context: ["{project-root}/_bmad-output/initiative-mobile-api/AGENTS.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Packing edits use server actions and a replayed toggle can reverse the intended state.

**Approach:** Move item rename, absolute packed state and deletion through an authorized packing service and API, preserving the existing web experience.

## Boundaries & Constraints

**Always:** Story branch `story/5-1-packing-item-api`; PR base `feature/api-v1`. Preserve activity, live events, trip locking, revalidation, optimistic rollback, label rename and empty-section deletion. Use existing API authorization and idempotency conventions. No schema or environment changes. Test first. Before any PR, verify its base; after opening, return to `feature/api-v1` and pull before creating the next story branch.

**Never:** Migrate packing creation, ordering, lists or templates in this story; change page reads; commit directly to integration branch or target main.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected behavior | Error handling |
| --- | --- | --- | --- |
| Edit | PATCH item with name and/or `isPacked` | Only supplied fields change; name follows existing validation; `isPacked` maps to `done` | Invalid input gets API validation error |
| Replay | Repeat `isPacked: true`, with or without idempotency key | Remains packed; no duplicate write effects | Cached replay rechecks access |
| Delete | DELETE with trip ID, item absent | 204 after trip authorization | Existing item in another trip is hidden |
| Access | Viewer or non-member writes | Viewer gets 403; non-member gets 404 | No mutation or leaked resource |
| Concurrent UI | Toggle or delete fails, or writes overlap | Existing optimistic rollback and ordering remain correct | Surface error using existing UI behavior |

</frozen-after-approval>

## Code Map

- `src/app/(app)/trips/packing-actions.ts` contains existing item writes and normalization; `trips/actions.ts` forwards them. Preserve unrelated exports.
- `src/lib/services/checklists.ts` and `trip-write.ts` demonstrate authorization before and inside locked writes, mapped rows, replay checks, and write effects. DELETE carries `tripId` to authorize missing rows.
- `src/lib/api/contract/checklists.ts` and `src/app/api/v1/checklist-items/[itemId]/route.ts` show strict contracts, route wrappers and idempotent replay.
- `src/components/arrivo/packing-list-view.tsx` already owns optimistic toggle and pending state; pass `!item.done` through `packing-lists-view.tsx`, `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx`, and `use-packing-handlers.ts`. Preserve pending and rollback semantics. `use-api-mutation.ts` handles refresh and errors; use existing checklist ordering patterns.
- `tests/e2e/steps/packing-tab.steps.ts` has existing reload coverage; API waits must be armed before gestures. `tests/e2e/steps/api.steps.ts` uses scenario-owned fixtures.

## Tasks & Acceptance

**Execution:**

- [ ] First expand tests: `src/lib/services/packing.test.ts`, `src/lib/api/contract/packing.test.ts`, `src/app/api/v1/packing-items/[itemId]/route.test.ts`, `src/app/(app)/trips/[tripId]/use-packing-handlers.test.tsx`, `use-trip-detail-handlers.test.tsx`, `trip-detail-tab-body.test.tsx`, `src/components/arrivo/packing-list-view.test.tsx`, `packing-lists-view.test.tsx`, and new `packing-list-overview.test.tsx`. Cover matrix cases, normalized names, labels, locked rechecks, effects, pending/rollback and ordered writes. Update existing `packing-actions.test.ts` and `actions.test.ts` for retired exports.
- [ ] `tests/e2e/features/packing-tab.feature` and `tests/e2e/steps/packing-tab.steps.ts` — exercise check, uncheck, item and label rename, delete and reload; await exact API responses. `tests/e2e/features/api.feature` and `tests/e2e/steps/api.steps.ts` — scenario-owned fixtures for absolute replay, absent delete, viewer and non-member, including access on cached replay.
- [ ] `src/lib/services/packing.ts` — implement partial updates and idempotent delete using `requireTripRole`, locked recheck, `runTripWrite`, mapper and existing effects; ensure row/trip match and unchanged requests cause no duplicate effects.
- [ ] `src/lib/api/contract/packing.ts` and `src/app/api/v1/packing-items/[itemId]/route.ts` — define strict UUID and name validation, partial PATCH, DELETE with authorized trip ID, and idempotent route handlers.
- [ ] `src/components/arrivo/packing-list-view.tsx`, `packing-lists-view.tsx`, `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx`, and `use-packing-handlers.ts` — propagate absolute value and migrate three callers, retaining optimistic error behavior and per-item ordering. Extract the list overview from oversized `packing-lists-view.tsx` into `src/components/arrivo/packing-list-overview.tsx`, with explicit props, client directive and colocated tests; keep UI and accessibility behavior unchanged.
- [ ] `src/app/(app)/trips/packing-actions.ts` and `actions.ts` — retire only migrated action implementations and forwarding exports.
- [ ] `docs/api-v1.md` and `tests/e2e/feature-map.mjs` — document fields, validation, statuses and replay; map new files to API, packing, activity and live-refresh features as applicable.

**Acceptance Criteria:**

- Given an editor in the packing tab, when they check, rename or remove an item and reload, then each change persists, including label rename and empty-section removal.
- Given an authorized API client, when it repeats an absolute packed update or deletes an absent item, then the item stays packed or deletion returns 204 respectively, with access still enforced.
- Given a viewer or non-member, when they attempt a write, then the API returns 403 or 404 respectively and no data changes.

## Implementation Notes

- Keep each pending toggle guarded until its own write and corresponding refreshed state settle; unrelated item refreshes must not clear its guard. Test overlapping writes and stale props.
- Coordinate live and mutation refreshes without releasing keyed writes before their queued refresh starts and settles. Test the queued-refresh interaction and unmount behavior.
- Verify keyed deletion replay and key conflict against the API, including access checks. Document delete behavior for section labels and PATCH access errors.

## Plan Change Log

- Review loop 1: The original plan left pending-toggle guards and refresh coordination underspecified. Rework these so unrelated refreshed props cannot reopen a still-pending item, and a queued refresh cannot prematurely release an existing keyed write. Preserve the passing absolute API, locked authorization, live events, normalized names, deletion semantics, extraction, and scenario-owned fixtures. Add keyed DELETE replay/conflict coverage and complete API documentation.

## Review Triage Log

- medium / bad_plan: Unkeyed packing writes can finish before refresh; stale props may be applied while a subsequent write is pending. Preserve pending state through the item's own completion.
- medium / bad_plan: Any new items array clears all pending IDs, allowing a second absolute toggle during an unrelated refresh. Track each item independently.
- medium / bad_plan: Per-hook queues do not span unmount/remount; a write continuing after navigation can be overtaken by a new instance. Preserve ordering across those lifetimes.
- medium / bad_plan: A keyed mutation may release via waitForRefresh while its own refresh remains queued. Queue completion must account for its actual refresh.
- maybe-false / defer: A transition that never settles would block shared refreshes; establish a reachable stuck transition before adding recovery.
- low / defer: Extracted rename/delete buttons inherit pre-existing 32px targets; improve them separately.
- low / defer: Extracted create/cancel controls inherit pre-existing 36px targets; improve them separately.
- medium / bad_plan: Keyed DELETE replay and conflict have no packing-specific integration test; add coverage.
- medium / bad_plan: Existing DELETE E2E requests are unkeyed, leaving cached access replay unverified; add coverage.
- low / patch: PATCH documentation omits role and missing-item responses; describe them.
- low / patch: DELETE documentation omits label removal's SET NULL behavior; describe it.
- low / rejected: Packing E2E helper finds by trip and name, but current scenarios use unique names; support for duplicates adds fixture complexity.
- medium / bad_plan: Key reuse on a different DELETE item lacks API conflict verification; add a test against the DB.
- Intent alignment: The diff implements the API contract reading; direct API replay tests establish request behavior, while browser scenarios exercise ordinary interactions rather than injecting network replays.

## Verification

- Targeted concurrency and hook tests: 120 passed. Focused Playwright: 13 passed.
- Build validator: lint, TypeScript, production build, coverage (8,151 tests; 98.08% lines, 97.81% functions, 94.04% branches), and affected E2E (1,213 scenarios) passed.



- Run targeted Vitest files named above and targeted packing/API Playwright scenarios before broad validation.
- Run `build-validator` once after implementation and targeted tests pass; fix failures and rerun if needed. It owns lint, TypeScript, build, coverage and affected E2E in project-required order.

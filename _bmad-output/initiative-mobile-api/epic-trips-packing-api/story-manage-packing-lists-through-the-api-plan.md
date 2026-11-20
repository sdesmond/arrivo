---
title: "Manage packing lists through the API"
type: feature
ticket: 4
created: 2026-11-19
status: built
baseline_revision: "80408db2151d4449cbc320222e8d5542ac27bd38"
route: full
route_source: auto
risk: medium
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context: ["{project-root}/_bmad-output/initiative-mobile-api/AGENTS.md"]
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Packing list create, rename and delete still use server actions, blocking API clients.

**Approach:** Add client-ID-safe create, rename and delete endpoints for trip packing lists with item cascade, and switch the three web callers to them without changing the interaction.

## Boundaries & Constraints

**Always:** Branch `story/5-4-packing-lists-api`; PR base `feature/api-v1` (verify before opening, switch back afterward). Test first. Preserve trip authorization, `lockTripForUpdate` ordering, activity and live events, API idempotency and failure behavior. No schema or environment changes. Names are trimmed, 1 to `FIELD_LIMITS.packingListName` characters.

**Never:** Migrate `pullTemplatesOntoTrip`, `saveTripListAsTemplate`, template actions or page reads. Do not commit to the integration branch or target main. Do not touch other packing-actions exports.

## I/O & Edge-Case Matrix

| Scenario | Input / state | Expected behavior |
| --- | --- | --- |
| Create | `POST /trips/:tripId/packing-lists` `{id, name}` | Return created list (200); appended at max position + 1 |
| Replay | Same UUID, same trip and name | Return existing list; no duplicate, activity or event. Same UUID with other name or trip → 409, no leak of other trip |
| Over limit / blank name | Name empty or longer than limit after trim | 422, no write (create and rename) |
| Rename | `PATCH /packing-lists/:listId` `{tripId, name}` | Update name; return list. Missing list → 404; list of another trip → 404 |
| Delete | `DELETE /packing-lists/:listId` `{tripId}` | Delete list and every item in it; other lists and default list untouched; 204 |
| Delete missing | Authorized, list absent | 204 without writes. List of another trip → 404 |
| Access / retry | Viewer, nonmember, keyed replay | 403 / 404; replay rechecks access |
| Client error | API rejects any call | Toast the error as today; create returns no id so the overview stays open |

</intent-contract>

## Code Map

- `src/app/(app)/trips/packing-actions.ts` -- `createPackingList`, `renamePackingList`, `deletePackingList` (lines ~303-377) hold current logic and messages; remove those three exports only, keep the rest and shared imports still used.
- `src/lib/services/packing.ts` -- add `createPackingList`, `renamePackingList`, `deletePackingList` beside `createPackingItem`/`removePackingSection`: `lockClientIds` then `lockTrip`, `requireTripRole`, `runTripWrite` with `markChanged`, `TripNotFoundError`, `ConflictError`; map rows with `dbPackingListToType` (`src/lib/db-mappers.ts`).
- `src/lib/api/contract/packing.ts` -- add `createPackingList` (`POST /api/v1/trips/:tripId/packing-lists`, body strict `{id, name}`, returns `TripPackingList`), `renamePackingList` (`PATCH /api/v1/packing-lists/:listId`, body `{tripId, name}`), `deletePackingList` (`DELETE /api/v1/packing-lists/:listId`, body `{tripId}`, status 204). Name schema trims and caps at `FIELD_LIMITS.packingListName`.
- `src/app/api/v1/trips/[tripId]/packing-lists/route.ts`, `src/app/api/v1/packing-lists/[listId]/route.ts` -- new `apiRoute` handlers with `{ idempotent: {} }`, modeled on the packing-items routes.
- `src/app/(app)/trips/[tripId]/use-packing-handlers.ts` -- switch the three handlers to `useApiMutation`; create mints one UUID per call and returns it from `onSuccess`/after success, undefined on failure; keep toasts. `page-client.tsx` consumers keep their signatures.
- `tests/e2e/feature-map.mjs` -- map the two new routes under `packing-lists` and `api` entries, beside the existing packing-items globs; `packing-actions.ts` stays mapped.
- `docs/api-v1.md` -- document the three endpoints under Packing items (new "Packing lists" heading).

## Tasks & Acceptance

**Execution:**

- [ ] Tests first: extend `src/lib/api/contract/packing.test.ts`, `src/lib/services/packing.test.ts` (matrix: create, replay, conflict, name limit, rename missing/foreign, delete cascade, missing delete, access), add route tests beside both new routes, update `use-packing-handlers.test.tsx`, `packing-actions.test.ts` (remove migrated cases) and any `actions.ts` forward tests.
- [ ] Update `tests/e2e/features/packing-lists.feature` and `steps/packing-lists.steps.ts` for create, rename and delete persisting after reload, awaiting API responses; update `tests/e2e/features/api.feature` and `steps/api.steps.ts` for UUID replay, name limit, rename 404, delete 204 and item cascade with scenario-owned fixtures.
- [ ] Implement contracts, routes and services; switch the hook; remove only the three migrated actions.
- [ ] Update `docs/api-v1.md` and `tests/e2e/feature-map.mjs`.

**Acceptance Criteria:**

- Given an editor creates, renames or deletes a list, when the trip reloads, then the change persists.
- Given a list with items, when it is deleted, then its items are gone and other lists keep theirs.
- Given a repeated client UUID, when create is retried, then one list exists.
- Given a name over the limit, when create or rename is requested, then it is rejected without changes.
- Given a missing list, when rename is requested then 404, and when delete is requested then 204.

## Implementation Notes

## Plan Change Log

## Review Triage Log

### 2026-11-19 — Review pass

- verdicts: 7 findings — high 0, medium 1, low 3, false 2, maybe-false 0 (1 low rejected as unlikely)
- findings:
  - `[medium]` `[patch]` Optimistic rename override kept a rejected name 4 s, a second rename's entry was deleted by the first timer, a remote rename was masked — override now applies only while the stored name equals the replaced name, and timers carry a token; test added.
  - `[low]` `[patch]` Over-limit list name lost its "List name must be 30 characters or fewer." toast text — contract schema now uses `overLimitMessage`; assertion added.
  - `[low]` `[reject]` Create returns no id when the component unmounted mid-request — caller is gone, nothing visible is lost.
  - `[low]` `[reject]` Non-member of the other trip gets 404 on a reused UUID — matches createPackingItem convention and avoids leaking trip existence.
  - `[low]` `[reject]` Foreign-trip rename/delete 404 not in E2E — covered by service tests; unlikely to regress separately.
  - `[false]` `[reject]` Lock order untested — code locks client IDs before the trip lock in createPackingList.
  - `[false]` `[reject]` Docs omit 409 on rename — rename has no replay-conflict path.

## Auto Run Result

- Summary: packing list create (client UUID, replay, 409), rename (404 when missing) and delete (204 when missing, item cascade) now run through `/api/v1`; the three web callers use them. Rename shows the new name immediately.
- Files: contract, service, two routes, `use-packing-handlers.ts`, `packing-list-overview.tsx`, removed three actions from `packing-actions.ts`, docs, feature-map, E2E features and steps, colocated tests.
- Review: 2 patches applied (medium, low), 3 lows and 2 false rejected with reasons above, none deferred.
- Follow-up review recommended: false.
- Verification: 241 targeted Vitest tests and `tsc` passed before patches; 45 targeted after.

## Design Notes

Rename and delete carry `tripId` in the body like the other packing-item endpoints, so authorization runs before the list lookup and a missing list is distinguishable only after the caller proved access. Lock client IDs (`packing-list:<id>`) before the trip lock, per `createPackingItem`.

## Verification

- Run targeted Vitest files and affected packing-lists/API E2E first.
- Run `build-validator` after implementation and targeted tests pass.

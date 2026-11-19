---
title: "Apply contributor changes through the API"
type: "feature"
ticket: "2"
created: "2026-11-17"
status: done
baseline_revision: "0cca1870a77f2accc6ee60a502dc0f75571ca5ed"
route: "full"
route_source: "auto"
risk: "high"
review: "thorough"
review_source: "auto"
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context: [_bmad-output/initiative-mobile-api/AGENTS.md]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Contributor role changes and removals still run through `saveContributorChanges` server actions; manager authority is asserted before the writer transaction, and the API has no atomic batch endpoint.

**Approach:** Add `PATCH /api/v1/trips/:tripId/collaborators` on 4.1's transaction/deadline/replay composition, reuse the locked writer's guards in-transaction, move the share dialog controller to it, and retire both action exports.

## Boundaries & Constraints

**Always:** Branch `story/4-2-contributor-changes-api`, PR base `feature/api-v1`; switch back to `feature/api-v1` after an authorized PR. Trip lock, then locked manager recheck, then replay lookup, all in one transaction under `guardTransactionDeadline`. Preserve max 50, duplicate-target, invalid type/role, stale `fromRole`/missing-target, creator and self guards with all-or-nothing writes. Postcommit order: per removed user `MembershipRemoved` then `removeTripSubscribersForUser`; then per role-changed user `MembershipChanged`; then one trip `MembershipChanged`; revalidate `/trips/:tripId` and `/trips`. Effects never run on rollback or replay. Stale UI recovery (clear staged, recovery refresh) and live-refresh deferral during save stay. Tests precede runtime edits. Domain types stay in `src/data/types.ts`.

**Never:** Schema/env changes, activity logging for batches (none exists today), UI redesign, migrating leave/resend/rescind/dismiss/accept/decline, changing `saveContributorChangesWrite`'s external signature (used by `deletion-concurrency.steps.ts`), CHANGELOG or ticket edits, automatic full E2E, unauthorized push/PR.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Mixed batch | Manager stages role change + removal | 200; both persist after reload; removed user gets revocation, demoted user live access update | None |
| Empty batch | `changes: []` | 200 no-op; no transaction effects | None |
| Oversized/duplicate/invalid | 51 changes, repeated `collaboratorId`, bad type/role/UUID | No writes | 422 `validation_failed` |
| Stale | `fromRole` mismatch, target gone or on another trip, trip deleted under lock | Whole batch rolled back; UI clears staged and reloads data | 409 `conflict` |
| Creator/self target | Change targets creator seat or caller | Whole batch rolled back | 422 `validation_failed` |
| Access | Editor/viewer; nonmember; manager demoted before lock acquired | No writes, no replay disclosure | 403; 404; 403 |
| Replay | Same Idempotency-Key + payload retried | Saved result; no duplicate writes/events | Changed payload same key → 409 |
| Deadline | Exceeded mid-transaction | Writes and replay row roll back together | 503 `deadline_exceeded` |

</frozen-after-approval>

## Code Map

- `src/app/(app)/trips/actions.ts:900-973` -- `saveContributorChanges`, `MAX_CONTRIBUTOR_CHANGES`: source of validation and postcommit event sequence; delete after migration.
- `src/app/(app)/trips/[tripId]/actions.ts:40-46` -- wrapper (only client import); delete. Resend/rescind/dismiss stay.
- `src/lib/membership-writes.ts:22,247-331` -- `ContributorChangeGuardError {stale}`, `ContributorChangeOutcome`, `saveContributorChangesWrite` (own transaction, `lockTripForUpdate`, locked manager recheck, guards, tripName/removedBy lookup). Mirror 4.1's split (`inviteContributorWrite` :104 → `inviteContributorInTransaction` :132): extract `saveContributorChangesInTransaction(tx, …)`; outer keeps signature.
- `src/lib/services/sharing.ts:85-216` -- 4.1 composition to copy: `db.transaction` → `guardTransactionDeadline` (`src/lib/request-deadline.ts:46`) → `withIdempotency(tx, …, {authorize, mutate})` (`src/lib/api/idempotency.ts:122`); effects only when changed and not replayed. Use `fingerprintRequest`/`concretePath` as invite does. `runTripWrite` is unsuitable (fixed `afterTripWrite` effects).
- `src/lib/api/errors.ts:22` -- `errorResponse` maps `ConflictError`→409, `ValidationFailedError`→422; does not know `ContributorChangeGuardError` (would 500). Service translates guard errors.
- `src/lib/api/contract/sharing.ts` -- `defineEndpoint` + `tripParams` + `z.strictObject`; add PATCH contract with discriminated change union, `.max(50)`, duplicate refine.
- `src/app/api/v1/trips/[tripId]/collaborators/route.ts` -- add `PATCH` alongside GET; shape from `src/app/api/v1/checklist-items/[itemId]/route.ts` (`apiRoute(..., {idempotent: {}})`, `src/lib/api/route.ts:47`).
- `src/components/arrivo/use-trip-share-dialog-controller.ts:5,109-171` -- staged `Record<collaboratorId, ContributorChange>`; `handleSaveChanges` error/stale/success/toast paths. Switch to `api()` (`src/lib/api/client.ts:26`), map `ApiClientError` 409 → stale recovery, 422/403/404 → `saveError` message, other → existing toast. Follow 4.1 invite form's refresh convention.
- `src/components/arrivo/trip-share-collaborator-row.tsx` -- only raises `onRoleChange`/remove callbacks into the controller; no change or test edit needed (the "row callers" in the ticket go through the controller).
- `src/data/types.ts:933-938` -- `ContributorChange`, `SaveContributorChangesResult` (remove result type if unused after retirement).
- Tests: `membership-writes.test.ts:74`; `trips/actions.test.ts:260-760` (19 batch cases to port to service tests, then delete); `[tripId]/actions.test.ts:102-125`; `services/sharing.test.ts` mock layout :17-28.
- E2E: `trip-sharing.feature:106-153`, step "I save the contributor changes" `trip-sharing.steps.ts:334` (clicks only, no wait); `revocation-modal.steps.ts:23-34`; `api.feature:1990-2108`. `feature-map.mjs` already maps sharing service/contract/collaborators routes (`api`, `trip-sharing`) and `membership-writes.ts`.
- `docs/api-v1.md:537-594` Sharing section; `api-reference.test.ts` requires the `### PATCH /api/v1/trips/:tripId/collaborators` heading.

## Tasks & Acceptance

**Execution:**

- [ ] `src/lib/membership-writes.test.ts`, `src/lib/services/sharing.test.ts`, `src/lib/api/contract/sharing.test.ts`, `src/app/api/v1/trips/[tripId]/collaborators/route.test.ts` -- write first: port all 19 action batch cases plus every matrix row; assert lock→recheck→replay order, exact event order/counts, no effects on rollback/replay/deadline, guard→409/422 mapping.
- [ ] `src/lib/membership-writes.ts` -- extract in-transaction batch function (caller holds trip lock and rechecked manager); outer function unchanged externally.
- [ ] `src/lib/api/contract/sharing.ts`, `src/lib/services/sharing.ts`, `collaborators/route.ts` -- PATCH contract, `saveContributorChanges` service (translate guard errors to `ConflictError`/`ValidationFailedError`), route with idempotency.
- [ ] `src/components/arrivo/use-trip-share-dialog-controller.test.ts` then `.ts` -- API save, 409 recovery, typed error messages, thrown toast, success close/refresh, deferred live refresh; update `trip-share-dialog.test.tsx` only if mocks change.
- [ ] Both `actions.ts` and matching `actions.test.ts`, `src/data/types.ts` -- remove migrated exports/tests/types; grep audit no remaining callers.
- [ ] `tests/e2e/features/trip-sharing.feature` + steps, `revocation-modal.steps.ts`, `tests/e2e/features/api.feature` + `api.steps.ts` -- save step arms exact `PATCH` path wait before click; add stale-batch rollback UI scenario and API scenarios for validation, creator/self, access matrix, replay, rollback persistence. Scenario-owned fixtures via mothers.
- [ ] `docs/api-v1.md`, `feature-map.mjs` (verify entries cover new/changed files) -- document endpoint, fields, errors, replay; then targeted tests and build-validator.

**Acceptance Criteria:**

- Given production build, when manager saves role change + removal in the dialog, then both persist after reload and removed/demoted users get correct live updates.
- Given final tree, when retired-export audit and targeted/affected validation run, then no `saveContributorChanges` action callers remain and checks pass without migrations or new settings.

## Implementation Notes

## Plan Change Log

- Pre-implementation plan-reviewer: scope, architecture, component, accessibility and test checks PASS; 0 blocking, 2 warnings (sharing service growth acceptable; row component unchanged, now noted in Code Map). Original request: build ticket 4.2, apply contributor changes through the API.

## Review Triage Log

| # | Lens | Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- | --- | --- |
| 1 | blind, edge (x2) | Manager demoted/removed before save gets 403/404 with staged rows kept, no reload | medium | patch | Old locked demotion returned `stale: true` → clear + recovery refresh; controller now recovers only on 409. Frozen "stale UI recovery stays" covers it. |
| 2 | blind, edge, intent | Empty batch still opens transaction, trip lock, recheck, replay row | low | reject | No writes or postcommit effects (docs accurate); keyed empty request storing replay is consistent; controller never sends empty batches. |
| 3 | blind, intent | Writer `myRow` guard would map to 409 not 403 | false | reject | `authorize` runs `requireTripRole` under the same trip lock first; role cannot change between, so the guard is unreachable via the API. |
| 4 | blind | `NO_LONGER_ON_TRIP_MESSAGE` duplicated in writer and service | low | patch | Two literals can drift; direct fix is export + import. |
| 5 | blind, edge | `removedByName` `??` keeps empty display name | low | reject | Old code used `user.name ?? username` with the same semantics; not a regression. |
| 6 | blind, edge | Web client sends no Idempotency-Key; timeout after commit then retry looks stale | low | reject | Pre-existing: server action had the same failure mode; client `api()` key policy outside this change. |
| 7 | blind | Stale E2E label `"Removable Contributor will be removed"` hardcoded, can't fail | false | reject | Fixture inserts name "Removable Contributor" (`trip-sharing.steps.ts:110`); dialog label is `${collaborator.name} will be removed`. |
| 8 | blind | Batch scenarios under checklist Background, reuse checklist role step; no 401 scenario | low | reject | Same placement as 4.1 `@sharing-api` scenarios; 401 owned by shared `apiRoute`. |
| 9 | blind | Docs omit `fields.changes`, 401, bad tripId 422, 409 cause ambiguity | low | reject | General error envelope documented elsewhere; no client misbehaviour demonstrated. |
| 10 | blind | Plan state/tasks unchecked, steps file name, outcome type gained field | — | reject | Fix edits this plan; `saveContributorChangesWrite` parameters unchanged. |
| 11 | blind, verification-gap | Feature map: `trip-live-refresh` lacks contract; `dashboard-live-sync` not selected for PATCH path pushes | medium | patch | Dashboard role-change/removal scenarios drive Save through the PATCH yet map no source; adding sharing files unions features without demoting the dashboard hook. |
| 12 | edge, intent | Acting manager page no longer refreshed by server-action revalidate | false | reject | Actor's trip page subscribes to the trip channel; `publishTripEvent(MembershipChanged)` triggers `useTripLiveRefresh` refresh. |
| 13 | edge | Writer duplicate check precedes locked manager recheck | low | reject | Only direct caller is the deletion-concurrency fixture; no user impact. |
| 14 | blind, edge | Status-0 `timeout` not in toast test list | low | reject | Same branch as `network_error`, already tested. |
| 15 | verification-gap | Deletion-concurrency E2E exercises unused `saveContributorChangesWrite`, not the service path | medium | defer | Same precedent as 4.1 `inviteContributorWrite`; cross-story fixture migration. |

## Design Notes

Guard errors become HTTP errors rather than 200 typed results, matching the API's typed-error convention: `stale: true` → 409 `conflict` (client recovery path keys on 409), `stale: false` (creator/self/invalid) → 422 with the existing message. Contract-level 422 covers max/duplicate/invalid before any transaction; the in-transaction duplicate check stays as defense.

## Verification

**Commands:**

- `npx vitest run src/lib/membership-writes.test.ts src/lib/services/sharing.test.ts src/lib/api/contract/sharing.test.ts src/app/api/v1/trips src/components/arrivo/use-trip-share-dialog-controller.test.ts "src/app/(app)/trips"` -- expected: pass.
- `node scripts/run-e2e.mjs --grep="@feat:(trip-sharing|api|revocation-modal)"` -- expected: pass.
- `build-validator` -- expected: PASS; no full-suite run.

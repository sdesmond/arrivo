---
title: "Let editors and viewers leave a shared trip"
type: "feature"
created: "2026-09-28"
status: "done"
baseline_commit: "a4f0f8138e6b385fc5bed1d796459d9ee36a81d6"
review_loop_iteration: 0
context:
  - "{project-root}/_bmad-output/implementation-artifacts/epic-3-retro-2026-09-04.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Editors and viewers cannot remove themselves from a shared trip. They must retain a private exit path without gaining access to manager-only sharing controls.

**Approach:** Add a Leave trip control on trip detail, confirm its effect, remove only the signed-in collaborator's membership, then return them to trips. Notify other open sessions so stale trip views close.

## Boundaries & Constraints

**Always:** Keep trip, its content, and other memberships intact. Enforce identity, role, and creator protection in server action; client visibility is insufficient. Keep contributor list and Share dialog manager-only. Confirmation explains that leaving removes access and trip disappears from personal list. All interactive targets meet 44×44px minimum.

**Ask First:** If product scope expands to non-creator managers or requires a dashboard entry point, return to planning before implementation.

**Never:** Let creator leave; use manager-only `saveContributorChanges` for self-removal; expose contributor list to editors/viewers; present self-exit as removal by another person.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Confirmed exit | Signed-in editor or viewer on trip | Delete caller's membership; leave trip intact; navigate to `/trips`; trip absent from list and direct URL denied | Show error and stay on trip if mutation fails |
| Cancel | Confirmation open | Keep membership and trip view | None |
| Unauthorized | Creator, manager, non-member, or forged trip ID | No membership deleted | Return safe error or deny access |
| Concurrent exit | Membership removed before confirmation completes | No other row deleted | Treat as stale; refresh or return to trips without false success |
| Other sessions | Same user has trip or dashboard open elsewhere | Personal leave event closes trip view or refreshes list; remaining collaborators receive membership update | No erroneous revocation modal |

</frozen-after-approval>

## Code Map

- `src/app/(app)/trips/actions.ts:978` — manager batch removal rejects self; add separate authenticated, transaction-locked self-leave action here, following post-commit publish/revalidation pattern at lines 1062–1092.
- `src/lib/auth-helpers.ts:30`, `src/lib/queries.ts:131` — access derives from collaborator row; dashboard list inner-joins membership; direct route access stops after deletion.
- `src/app/(app)/trips/[tripId]/trip-detail-hero.tsx:141` — crumb controls currently gated by `canEdit`; add distinct editor/viewer Leave control visible to viewer, separate from manager Share at line 169.
- `src/app/(app)/trips/[tripId]/page-client.tsx:252` — connect Leave control, confirmation state, action result, navigation; Share dialog stays conditional at line 368.
- `src/components/packt/delete-trip-alert-dialog.tsx` — reuse AlertDialog composition for new leave confirmation without deletion wording.
- `src/data/types.ts:681`, `src/lib/use-trip-live-refresh.ts`, `src/lib/use-dashboard-live-refresh.ts` — add personal `MembershipLeft` event; redirect open trip tabs and refresh dashboard tabs without `MembershipRemoved` modal.
- `src/lib/trip-events.ts:231`, `src/app/api/trips/[tripId]/events/route.ts:9` — close departing user's trip stream after commit; reconnect rechecks access.
- `tests/e2e/scenario-fixture.ts`, `tests/e2e/steps/viewer-trip-access.steps.ts` — reuse scenario-owned owner/collaborator fixtures; await mutation POST before reload assertions.

## Tasks & Acceptance

**Execution:**

- [x] `src/app/(app)/trips/actions.test.ts`, `src/app/(app)/trips/actions.ts`, `src/data/types.ts` — test editor/viewer exit, creator/manager/non-member rejection, forged trip ID, stale repeat, and post-commit events; implement scoped transaction and typed result.
- [x] `src/lib/use-trip-live-refresh.test.ts`, `src/lib/use-dashboard-live-refresh.test.ts` and matching hooks — test personal leave handling across open tabs; add redirect/list refresh behavior.
- [x] `src/app/(app)/trips/[tripId]/trip-detail-hero.test.tsx`, `src/app/(app)/trips/[tripId]/page-client.test.tsx` and matching components — test role-gated entry, cancellation, pending/error/success states, and manager-only Share.
- [x] `src/components/packt/leave-trip-alert-dialog.test.tsx`, `src/components/packt/leave-trip-alert-dialog.tsx` — build interactive client component with explicit `LeaveTripAlertDialogProps`; test destructive confirmation, cancel/Escape, focus return, and pending state.
- [x] `tests/e2e/features/leave-trip.feature`, `tests/e2e/steps/leave-trip.steps.ts`, `tests/e2e/feature-map.mjs` — cover editor leave, viewer leave, cancellation, loss of direct access, and unchanged owner trip with scenario-owned fixtures.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` — mark Epic 3 retro item 17 done only after feature verification.

**Acceptance Criteria:**

- Given editor or viewer opens shared trip, when they inspect trip controls, then Leave trip is available and Share remains absent.
- Given creator or manager opens trip, when they inspect trip controls, then no Leave trip action is offered.
- Given collaborator confirms exit, when action commits, then trip vanishes from their list, direct access is denied, and other collaborators retain access.
- Given another session displays same trip, when leave event arrives, then trip view closes without manager-removal message.

## Spec Change Log

## Design Notes

Keep exit separate from trip deletion and manager Share. Label control `Leave trip` visibly, give it trip-specific screen-reader context, and size it at least 44×44px. AlertDialog moves focus inside on open and returns focus to trigger on cancel or Escape; successful exit sends focus to trips page through navigation. Publish a distinct personal leave event because existing `MembershipRemoved` opens a modal claiming another person removed access; action success must still navigate when SSE is offline.

## Verification

**Commands:**

- Targeted Vitest files named above — role, mutation, and UI cases pass.
- `npm run test:e2e:affected` — leave-trip scenarios pass.
- `packt-build-validator` — lint, types, coverage, build, and affected E2E pass after targeted tests.

## Suggested Review Order

**Server-side self-leave**

- Entry point: session-derived identity, UUID guard, locked role/creator re-check, own-row delete.
  [`actions.ts:1115`](<../../src/app/(app)/trips/actions.ts#L1115>)

- Trip deleted before lock maps to stale instead of generic failure.
  [`actions.ts:1136`](<../../src/app/(app)/trips/actions.ts#L1136>)

- Post-commit order: personal leave event, close leaver streams, then trip-wide broadcast.
  [`actions.ts:1167`](<../../src/app/(app)/trips/actions.ts#L1167>)

- Shared lock message constant so lock miss is matched without string duplication.
  [`server-action-locks.ts:8`](../../src/lib/server-action-locks.ts#L8)

**Live sync across sessions**

- Distinct personal event avoids manager-removal modal wording.
  [`types.ts:688`](../../src/data/types.ts#L688)

- Open trip tabs redirect to trips on personal leave, no toast.
  [`use-trip-live-refresh.ts:53`](../../src/lib/use-trip-live-refresh.ts#L53)

- Dashboard tabs refresh so departed trip drops out.
  [`use-dashboard-live-refresh.ts:25`](../../src/lib/use-dashboard-live-refresh.ts#L25)

**Trip detail UI**

- Attempt counter keeps superseded in-flight leaves from writing into closed dialog.
  [`page-client.tsx:247`](<../../src/app/(app)/trips/[tripId]/page-client.tsx#L247>)

- Force-close bumps attempt and resets pending/error state.
  [`page-client.tsx:114`](<../../src/app/(app)/trips/[tripId]/page-client.tsx#L114>)

- Leave control gated to non-managers, trip-specific accessible name.
  [`trip-detail-hero.tsx:188`](<../../src/app/(app)/trips/[tripId]/trip-detail-hero.tsx#L188>)

- Confirmation dialog explains loss of access; pending blocks close.
  [`leave-trip-alert-dialog.tsx:25`](../../src/components/packt/leave-trip-alert-dialog.tsx#L25)

**Tests and config**

- Server action matrix: roles, forged ids, stale, lock miss, event ordering.
  [`actions.test.ts:843`](<../../src/app/(app)/trips/actions.test.ts#L843>)

- Page-level leave flow including mid-flight force-close cases.
  [`page-client.test.tsx:425`](<../../src/app/(app)/trips/[tripId]/page-client.test.tsx#L425>)

- E2E steps wait for real list/hero render before absence assertions.
  [`leave-trip.steps.ts:67`](../../tests/e2e/steps/leave-trip.steps.ts#L67)

- Scenario coverage: editor, viewer, cancel, manager, creator.
  [`leave-trip.feature:1`](../../tests/e2e/features/leave-trip.feature#L1)

- Feature map registration for leave-trip sources.
  [`feature-map.mjs:195`](../../tests/e2e/feature-map.mjs#L195)

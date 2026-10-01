---
title: "Invitation expiry and rescind"
type: "feature"
created: "2026-09-01"
status: "done"
baseline_commit: "f9337a78c0e0c4d0c5d2c8c2d8c2d8c2d8c2d8c2"
review_loop_iteration: 0
context: ["{project-root}/docs/drizzle-workflow.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A manager who invited someone by email (story 1.2) has no way to revoke that invitation before it expires. The expiry filter in `getMyPendingInvitations` already excludes expired rows at query time (`sql\`${invitations.expiresAt} > now()\`` at `src/lib/invitations.ts:50`), and `acceptInvitation`/`declineInvitation` already guard against expired rows in their WHERE clauses (`src/app/(app)/trips/actions.ts:812`, `:870`), but none of this has test coverage proving it works. There is no `rescindInvitation` action.

**Approach:** Add `rescindInvitation(tripId, invitationId)` — a manager-only server action that sets `status='rescinded'` atomically, following the same conditional-UPDATE pattern as accept/decline. Add test coverage for expiry filtering in `getMyPendingInvitations` and for the expiry/rescind guards in `acceptInvitation`. No UI changes — the share dialog wires this action in Epic 3 (Story 3.2).

## Boundaries & Constraints

**Always:** `rescindInvitation` gated by `requireUser()` + `assertTripAccess(tripId, userId, "manager")`. Must verify `invitation.tripId === tripId` independently of the caller's role on some other trip — prevents cross-trip manipulation. Atomic conditional UPDATE: `WHERE id = ? AND status = 'pending' RETURNING *` — never read-then-write. Publishes events via `publishTripEvent`/`publishUserEvent` from `src/lib/trip-events.ts` (import is safe even if pub-sub module doesn't exist yet — defer with TODO if needed, same pattern as `acceptInvitation` at `:847`). Returns `RescindInvitationResult` discriminated union. `getMyPendingInvitations` already excludes expired rows — only add tests, do not modify the query. `acceptInvitation` already guards expired/rescinded — only add tests, do not modify the action.

**Ask First:** N/A — story fully specified by epic ACs.

**Never:** Never build the share dialog UI (Epic 3). Never modify the expiry filter logic or accept/decline implementations — only add test coverage. Never add a separate `'expired'` status transition — expiry is query-time filtering, not a state change. Never add E2E scenarios — rescind UI is Epic 3.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Rescind happy path | manager on trip, pending invitation for this trip | `status='rescinded'`, events published, `revalidatePath("/trips")` called | returns `{ status: "success" }` |
| Rescind already-rescinded | invitation already has `status='rescinded'` | zero-row match (WHERE `status='pending'`) | returns `{ status: "error", message: "Invitation is no longer pending." }` |
| Rescind already-accepted | invitation has `status='accepted'` | zero-row match | returns `{ status: "error", message: "Invitation is no longer pending." }` |
| Rescind already-declined | invitation has `status='declined'` | zero-row match | returns `{ status: "error", message: "Invitation is no longer pending." }` |
| Rescind wrong trip | invitation belongs to a different trip | `invitation.tripId !== tripId` guard rejects | returns `{ status: "error", message: "Invitation not found." }` |
| Rescind editor (not manager) | caller has editor role on the trip | `assertTripAccess` rejects via `notFound()` | 404 |
| Rescind non-existent ID | no invitation row with that ID | zero-row match | returns `{ status: "error", message: "Invitation not found." }` |
| Expiry filter — expired excluded | `expiresAt` in the past, `status='pending'` | excluded from `getMyPendingInvitations` result | N/A |
| Expiry filter — pending included | `expiresAt` in the future, `status='pending'` | included in `getMyPendingInvitations` result | N/A |
| Accept expired guard | invitation past `expiresAt`, `status='pending'` | zero-row match, no collaborator created | returns `{ status: "error", message: "This invitation has expired." }` |
| Rescinded invitation not accepted | `status='rescinded'` | zero-row match, no collaborator created | returns `{ status: "error", message: "This invitation was rescinded by the trip owner." }` |

</frozen-after-approval>

## Code Map

- `src/app/(app)/trips/actions.ts:88` — file carries `"use server"` directive; every exported function must be async. Current last action is `updateCollaboratorRole` at `:899`. Insert `rescindInvitation` after `declineInvitation` (`:888`) and before `removeCollaborator` (`:890`). Pattern: `requireUser()` → `assertTripAccess(tripId, user.id!, "manager")` → `db.select().from(invitations).where(eq(invitations.id, invitationId))` inside `db.transaction` → guard `invitation.tripId === tripId` → conditional `UPDATE invitations SET status = 'rescinded' WHERE id = ? AND status = 'pending' RETURNING *` → if zero rows: return `{ status: "error", message: describeUnmatchedInvitation-style diagnostic }` → publish events → `revalidatePath("/trips")` → return `{ status: "success" }`.
- `src/app/(app)/trips/actions.ts:770-794` — `describeUnmatchedInvitation` already handles the `rescinded` case at `:781` (returns "This invitation was rescinded by the trip owner."). Reuse this function for the zero-row diagnostic message in `rescindInvitation` when the row was already resolved.
- `src/app/(app)/trips/actions.ts:804-815` — `acceptInvitation`'s atomic UPDATE already includes `expiresAt > now()` guard at `:812`. The expiry test proves this works; no code change needed.
- `src/app/(app)/trips/actions.ts:863-874` — `declineInvitation`'s atomic UPDATE already includes the same expiry guard.
- `src/lib/invitations.ts:30-63` — `getMyPendingInvitations` query filters `status = 'pending' AND expiresAt > now()` at `:48-51`. The expiry-filter tests prove expired rows are excluded; no code change needed.
- `src/data/types.ts:41-48` — `InvitationStatus` already includes `rescinded` at `:46`. No schema change needed.
- `src/data/types.ts:552-554` — `AcceptInvitationResult` and `DeclineInvitationResult` patterns. Add `RescindInvitationResult` after `:554`: `{ status: "success" } | { status: "error"; message: string }`.
- `src/app/(app)/trips/actions.test.ts:919-964` — `setupAcceptDeclineDb` test fixture pattern. Extend or clone for `rescindInvitation` tests. Uses `vi.fn()` for `transaction.update().set().where().returning()` capturing `{table, values, condition}`.
- `src/app/(app)/trips/actions.test.ts:1117-1219` — `declineInvitation` test cases as the structural template for rescind tests.
- `src/lib/invitations.test.ts:52-118` — `getMyPendingInvitations` tests with `mockQueryResult` helper chaining `.from().innerJoin().innerJoin().where()`. Add expired-row-excluded and pending-row-included cases.

## Tasks & Acceptance

**Execution:**

- [x] `src/data/types.ts` — add `RescindInvitationResult` discriminated union type after `:554`, following `AcceptInvitationResult`/`DeclineInvitationResult` pattern
- [x] `src/app/(app)/trips/actions.ts` — add `rescindInvitation(tripId, invitationId)` server action after `declineInvitation` (`:888`): `requireUser()` → `assertTripAccess(tripId, userId, "manager")` → transaction lookup → `tripId` guard → conditional UPDATE → diagnostic message → publish events → `revalidatePath` → return result
- [x] `src/app/(app)/trips/actions.test.ts` — add `rescindInvitation` tests (7 I/O-matrix rows): happy path, already-rescinded, already-accepted, already-declined, wrong trip, editor rejection, non-existent ID. Add acceptInvitation expiry-guard tests: expired invitation returns error, rescinded invitation returns error
- [x] `src/lib/invitations.test.ts` — add `getMyPendingInvitations` expiry-filter tests: expired row excluded from result, pending row included in result

**Acceptance Criteria:**

- Given an invitation with `expiresAt` in the past and `status='pending'`, when the invited user's dashboard queries pending invitations, then it's excluded from the list.
- Given an expired invitation, when `acceptInvitation` is called for it, then the atomic conditional update matches zero rows and access is not granted.
- Given a manager rescinds a pending invitation, when the rescind action runs, then the invitation's `status` becomes `'rescinded'` and it no longer appears in the recipient's pending list.
- Given a rescinded invitation, when `acceptInvitation` is called for it, then zero rows match and access is not granted.
- Given an editor (not a manager) attempts to rescind an invitation, when the action runs, then it's rejected server-side.
- Given an `invitationId` that belongs to a different trip than the one the caller manages, when rescind is called with that id, then it's rejected — the action verifies `invitation.tripId === tripId`, not only the caller's manager role on some trip.

### Review Findings

- [x] [Review][Patch] `rescindInvitation` reads before writing, violating the frozen "never read-then-write" constraint [src/app/(app)/trips/actions.ts:895-905]
- [x] [Review][Patch] `rescindInvitation` test suite never verifies the atomic UPDATE's `status = 'pending'` predicate — a dropped/broken status guard would not fail any test [src/app/(app)/trips/actions.test.ts:1246-1297]
- [x] [Review][Patch] `getMyPendingInvitations` "expiry" tests are renamed pre-existing tests that don't verify filtering behavior — mock returns canned rows regardless of the WHERE condition [src/lib/invitations.test.ts:61-118]
- [x] [Review][Patch] `RescindInvitationFixture`'s `status` fields are typed as bare `string` instead of `InvitationStatus` from `@/data/types` [src/app/(app)/trips/actions.test.ts:61-64]
- [x] [Review][Patch] TODO comment above `revalidatePath("/trips")` in `rescindInvitation` copies `acceptInvitation`'s wording verbatim ("on trip:{tripId} and user:{userId}"), but the rescinding actor is the manager, not the invitee [src/app/(app)/trips/actions.ts:915-916]

## Spec Change Log

- Initial draft: story 1.4 server-side rescind action + expiry test coverage.

## Design Notes

`rescindInvitation` follows the identical atomic conditional UPDATE pattern as `acceptInvitation` and `declineInvitation`: `WHERE id = ? AND status = 'pending' RETURNING *`. If zero rows match (already rescinded, accepted, declined, expired, or non-existent), the action returns an error result via `describeUnmatchedInvitation` (`:770`) which already handles every terminal state including `rescinded` (`:781`). No new diagnostic logic needed.

The `invitation.tripId === tripId` guard is checked after the lookup but before the UPDATE, independently of `assertTripAccess`. This prevents a manager of trip A from rescinding an invitation belonging to trip B — the caller may have manager access to *some* trip, but the invitation must belong to the specific trip being managed.

## Verification

**Commands:**

- `npm run lint` — expected: no errors
- `npx tsc --noEmit` — expected: no type errors
- `npx vitest run src/app/\(app\)/trips/actions.test.ts src/lib/invitations.test.ts` — expected: all pass
- `npm run test:e2e:affected` — expected: no new E2E scenarios (rescind UI is Epic 3)

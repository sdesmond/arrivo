---
title: "Accept and decline invitations through the API"
type: "feature"
ticket: "3"
created: "2026-11-17"
status: done
baseline_revision: "9ca251e8cc2f49f5fb4979225f79a5fc7fb5d086"
route: "full"
route_source: "auto"
risk: "high"
review: "thorough"
review_source: "auto"
lenses_ran: ["blind-hunter", "edge-case-hunter", "verification-gap", "intent-alignment"]
review_loop_iteration: 0
context: [_bmad-output/initiative-mobile-api/AGENTS.md]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Invitees accept and decline through `acceptInvitation`/`declineInvitation` server actions; the API has no invitee decision endpoints, and decline takes no locks.

**Approach:** Add `POST /api/v1/invitations/:invitationId/{accept,decline}` on 4.1's transaction/deadline/replay composition, reuse the accept writer in-transaction, move `PendingInvitationsList` to them, and retire both action exports.

## Boundaries & Constraints

**Always:** Branch `story/4-3-accept-decline-invitations-api`, PR base `feature/api-v1`; switch back to `feature/api-v1` after an authorized PR. Authorize the addressed invitee (not trip membership): foreign or missing invitation is a concealed 404. Lock user then trip (`lockUsersThenTripForUpdate`) before touching the invitation, re-verify the row is addressed to the actor under the lock, then replay lookup, all in one transaction under `guardTransactionDeadline`. Accept keeps the pending/unexpired check on the database clock and atomic membership upsert. Postcommit only, never on rollback or replay: accept records `invitation_accepted`, publishes trip `MembershipChanged`, user `MembershipChanged` and `InvitationChanged`, revalidates `/trips` and `/trips/:tripId`; decline publishes the same events without activity. Dashboard badge refresh and `router.push` to the accepted trip stay. Tests precede runtime edits. Domain types stay in `src/data/types.ts`.

**Never:** Schema/env changes, UI redesign, migrating resend/rescind/dismiss/leave, changing `acceptInvitationWrite`'s external signature (used by `deletion-concurrency.steps.ts`), CHANGELOG or ticket edits, automatic full E2E, unauthorized push/PR, Server Component pending-invitation reads.

## I/O & Edge-Case Matrix

| Scenario          | Input / State                           | Expected Output / Behavior                                                                  | Error Handling                           |
| ----------------- | --------------------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Accept            | Addressed invitee, pending, unexpired   | 200 `{status:"accepted", tripId}`; collaborator row with invited role; UI navigates to trip | None                                     |
| Decline           | Same state                              | 200 `{status:"declined"}`; row removed from list, badge drops                               | None                                     |
| Foreign/missing   | Another account's or unknown invitation | No writes, no events                                                                        | 404 `not_found`                          |
| Not pending       | Rescinded, accepted or declined         | No writes                                                                                   | 409 `conflict`, existing refusal message |
| Expired           | `expiresAt` not in the future           | No writes                                                                                   | 409 `conflict` "expired"                 |
| Account/trip gone | Trip or invitee deleted before lock     | No writes                                                                                   | 404                                      |
| Replay            | Same Idempotency-Key + payload          | Saved result; no second membership upsert, activity or events                               | Changed path same key → 409              |
| Deadline          | Exceeded mid-transaction                | Writes and replay row roll back together                                                    | 503 `deadline_exceeded`                  |

</frozen-after-approval>

## Code Map

- `src/app/(app)/trips/actions.ts:749-843` -- `describeUnmatchedInvitation`, `acceptInvitation`, `declineInvitation`: source of postcommit sequence and refusal messages; delete after migration (rescind/dismiss stay).
- `src/lib/membership-writes.ts:188-244` -- `acceptInvitationWrite` (own transaction, candidate lookup, user→trip lock, guarded update, collaborator upsert). Mirror 4.1/4.2 split: extract `acceptInvitationInTransaction(tx, …)` (caller holds locks, row addressed-to-actor verified); outer keeps signature. Add `declineInvitationInTransaction` and an in-transaction refusal-message helper (moved from the action).
- `src/lib/services/sharing.ts:85-216,235+` -- composition to copy (`db.transaction` → `guardTransactionDeadline` → `withIdempotency`, effects only when changed and not replayed). Pre-lookup `{tripId}` where id and `inviteeId = actor` outside the tx only to find lock targets; missing → `TripNotFoundError`; refusals → `ConflictError`.
- `src/lib/api/contract/sharing.ts` -- add `acceptInvitation`/`declineInvitation` via `defineEndpoint` (`invitationId` uuid param, `z.strictObject({})` body).
- `src/app/api/v1/invitations/[invitationId]/{accept,decline}/route.ts` -- new; shape from `src/app/api/v1/trips/[tripId]/invitations/route.ts` (`apiRoute(..., {idempotent: {}})`).
- `src/components/arrivo/pending-invitations-list.tsx:6,37,50` -- switch to `api()` (`src/lib/api/client.ts:26`); `ApiClientError` → `toast.error(message)` (404 → "Invitation not found."); success paths unchanged.
- `src/data/types.ts:923-925` -- `AcceptInvitationResult`/`DeclineInvitationResult` lose the `error` arm (errors are HTTP now).
- Tests: `membership-writes.test.ts`; `services/sharing.test.ts` mock layout :17-60; `contract/sharing.test.ts`; `pending-invitations-list.test.tsx`; `trips/actions.test.ts:1712-2070,2309-2360` (port accept/decline cases to service tests, then delete; keep rescind/dismiss).
- E2E: `pending-invitations.feature` + `steps/pending-invitations.steps.ts:85-92` (accept/decline arm exact API wait, currently none); new `steps/api-invitation-decisions.steps.ts` + `api.feature`; `src/lib/api/idempotency-expiry-cap.test.ts` route list.
- `tests/e2e/feature-map.mjs` -- add `src/app/api/v1/invitations/**` and the new steps file to `api`; `pending-invitations` gains sharing service/contract/writer and the route glob.
- `docs/api-v1.md:537+` -- `api-reference.test.ts` needs `### POST /api/v1/invitations/:invitationId/accept` and `/decline` headings.

## Tasks & Acceptance

**Execution:**

- [ ] `src/lib/membership-writes.test.ts`, `src/lib/services/sharing.test.ts`, `src/lib/api/contract/sharing.test.ts`, `src/app/api/v1/invitations/[invitationId]/{accept,decline}/route.test.ts`, `src/components/arrivo/pending-invitations-list.test.tsx` -- write first: port accept/decline action cases plus every matrix row; assert lock→recheck→replay order, exact event order and counts, no effects on rollback/replay/deadline, refusal→404/409 mapping, API call args and toasts.
- [ ] `src/lib/membership-writes.ts` -- extract in-transaction accept; add decline and refusal helper.
- [ ] `src/lib/api/contract/sharing.ts`, `src/lib/services/sharing.ts`, two route files -- contracts, `acceptInvitation`/`declineInvitation` services, routes with idempotency.
- [ ] `src/components/arrivo/pending-invitations-list.tsx`, `src/data/types.ts` -- API calls, result types.
- [ ] Both retired exports in `trips/actions.ts` and matching `actions.test.ts` blocks -- remove; grep audit for callers.
- [ ] `tests/e2e/features/pending-invitations.feature` + steps, `api.feature` + `api-invitation-decisions.steps.ts` -- UI steps await exact `POST` path before assert; API scenarios: accept+keyed retry, decline, foreign 404, expired 409, retired 409. Fixtures via mothers.
- [ ] `docs/api-v1.md`, `feature-map.mjs`, idempotency-cap test -- document, register; then targeted tests and build-validator.

**Acceptance Criteria:**

- Given production build, when an invitee accepts from the dashboard, then they land on the persisted trip as a collaborator; when they decline, the row and badge drop.
- Given final tree, when retired-export audit and affected validation run, then no `acceptInvitation`/`declineInvitation` action callers remain and checks pass without migrations or new settings.

## Implementation Notes

## Plan Change Log

- Pre-implementation plan-reviewer: scope, architecture, component, accessibility and test checks PASS; 0 blocking, 1 warning (plan above 1600 tokens; single goal, kept). Original request: build ticket 4.3, accept and decline invitations through the API.

## Review Triage Log

| Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| Collaborator upsert can overwrite an existing member/creator on accept | medium | defer | Identical `onConflictDoUpdate` existed at baseline; not caused by this change. |
| `acceptInvitationWrite` wrapper has no production caller | low | defer | Signature kept by intent for `deletion-concurrency.steps.ts`; same follow-up as 4.1/4.2. |
| Expired message uses `Date.now()` not DB clock | low | rejected | Moved verbatim from the retired action (baseline actions.ts:768); only message text under clock skew; fix adds SQL complexity. |
| `waitForApiResponse` not imported | false | rejected | Imported at `pending-invitations.steps.ts:10`; E2E ran green. |
| Keyed retry after row dismissed returns 404 | false | rejected | Documented plan decision in Design Notes. |
| Missing router.refresh after accept/decline | maybe-false | rejected | Live-refresh events drive the badge; E2E badge/navigation scenarios pass; only low if real. |
| Raw error text for non-404 statuses; 409 leaves row visible | low | rejected | API messages are user-safe; matches prior migrated dialogs; fix adds branches. |
| Missing E2E cases (401, 400, replay decline, double-accept) | low | rejected | Verification-gap lens found matrix fully covered; 400/401 handled by shared `apiRoute` tests. |
| Unsafe `as Result` cast; `fallbackName: ""` | low | rejected | Fallback unreachable after user lock; cast type-checks and is exercised by both paths. |
| Lock contract unenforced on in-transaction helpers | low | rejected | Same pattern as 4.1/4.2 helpers; no new caller exists. |
| Client loses response after commit (no key sent) | low | rejected | Same behavior as the retired action. |
| Weak unit guard coverage / docs thin / duplicate route tests | low | rejected | Guards covered by E2E DB assertions; docs satisfy `api-reference.test.ts`. |

## Design Notes

Refusals become HTTP errors instead of 200 `{status:"error"}`, matching the API convention: wrong-recipient/unknown is 404 (epic decision: stranger concealment replaces the old "not addressed to your account" message), non-pending/expired is 409 with the old message. Decline joins accept's user→trip lock so account deletion cannot race it. Known edge: a keyed retry after a manager dismisses the accepted row gets 404, since recipient authorization needs the row; documented, not worked around.

## Verification

**Commands:**

- `npx vitest run src/lib/membership-writes.test.ts src/lib/services/sharing.test.ts src/lib/api src/app/api/v1/invitations src/components/arrivo/pending-invitations-list.test.tsx "src/app/(app)/trips"` -- expected: pass.
- `node scripts/run-e2e.mjs --grep="@feat:(pending-invitations|api)"` -- expected: pass.
- `build-validator` -- expected: PASS; no full-suite run.

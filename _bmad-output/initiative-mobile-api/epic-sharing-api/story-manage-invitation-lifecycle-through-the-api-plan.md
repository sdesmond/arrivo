---
title: "Manage invitation lifecycle through the API"
type: "feature"
ticket: "4"
created: "2026-11-18"
status: "built"
baseline_revision: "955eb18b1504ec13e6e9b60cef9b88810dd2b8c1"
route: "full"
route_source: "auto"
risk: "medium"
review: "thorough"
review_source: "auto"
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context: [_bmad-output/initiative-mobile-api/AGENTS.md]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Managers resend, rescind and dismiss share-dialog invitations through `resendShareInvitation`/`rescindShareInvitation`/`dismissShareInvitation` server actions that authorize outside any transaction, take no locks and have no replay.

**Approach:** Add `POST /api/v1/invitations/:invitationId/{resend,dismiss}` (body `{tripId}`) and `DELETE /api/v1/trips/:tripId/invitations/:invitationId` on 4.1's transaction/deadline/replay composition, move `use-share-invitation-actions.ts` to them, and retire the actions and `resendInvitation`.

## Boundaries & Constraints

**Always:** Branch `story/4-4-manage-invitation-lifecycle-api` from latest `feature/api-v1`, PR base `feature/api-v1`; switch back after an authorized PR. Authorize the current manager of the supplied `tripId` (never the row): non-member 404, below manager 403. In one transaction under `guardTransactionDeadline`: `lockUsersThenTripForUpdate(actor, tripId)`, `requireTripRole(manager, tx)`, then replay lookup, then mutate. The invitation is bound to the authorized trip (`id` and `tripId`); another trip's or unknown id is 404 `not_found`. Because authority comes from the body/path trip, a keyed dismiss replay after the row is deleted still returns the saved success. Resend refreshes `expiresAt` on pending rows including expired ones; non-pending is 409 "Invitation is no longer pending."; rescind non-pending 409 same message; dismiss of a pending row 409 "Invitation is still pending.". Postcommit only, never on rollback or replay: resend publishes trip `MembershipChanged` and invitee `InvitationChanged`; rescind records `invitation_rescinded`, publishes the same two, revalidates `/trips` and `/trips/:tripId`; dismiss publishes trip `MembershipChanged` and revalidates. Hook keeps suppressed-id, pending-action and toast behavior. Tests precede runtime edits.

**Never:** Schema/env changes, UI redesign, leave/contributor work, changing `applyInvitationResend` semantics (invite reinvite uses it), CHANGELOG or ticket edits, automatic full E2E, unauthorized push/PR.

## I/O & Edge-Case Matrix

| Scenario        | Input / State                              | Expected Output / Behavior                                         | Error Handling                  |
| --------------- | ------------------------------------------ | ------------------------------------------------------------------ | ------------------------------- |
| Resend          | Manager, pending (even expired)            | 200 `{status:"success",expiresAt}`; expiry +72h; events            | None                            |
| Rescind         | Manager, pending                           | 200 `{status:"success"}`; row `rescinded`; activity + events       | None                            |
| Dismiss         | Manager, non-pending                       | 200 success; row deleted; stays gone after reload                  | None                            |
| Wrong state     | Resend/rescind non-pending; dismiss pending | No writes, no events                                              | 409 `conflict` existing message |
| Cross-trip/unknown | Id of another trip's or missing row      | No writes; indistinguishable                                       | 404 `not_found`                 |
| Role            | Editor/viewer 403; non-member, stranger 404 | No writes, no saved-response read                                 | 403 / 404                       |
| Replay          | Same key + payload (incl. after dismiss deleted row) | Saved result; no second write, activity or events        | Changed path/body same key → 409 |
| Deadline        | Exceeded mid-transaction                   | Writes and replay row roll back together                           | 503 `deadline_exceeded`         |

</frozen-after-approval>

## Code Map

- `src/app/(app)/trips/actions.ts:741-786` -- `rescindInvitation`, `dismissInvitation`: guarded update/delete, refusal text, postcommit order; delete after migration (drop unused imports, `publishInvitationChanged` still used by `account-deletion-effects.ts`).
- `src/app/(app)/trips/[tripId]/actions.ts` -- only holds the three share actions; delete file and `actions.test.ts` once ported.
- `src/lib/invitations.ts:66-80` -- `resendInvitation` (non-transactional); remove it and its `invitations.test.ts:146+` block; keep `getInvitationExpiry`, `publishInvitationChanged`, `applyInvitationResend` re-export.
- `src/lib/invitation-resend.ts` -- `applyInvitationResend(tx, id, tripId, expiresAt)` reuse as is; its not-pending/not-found message split drives 409 vs 404.
- `src/lib/services/sharing.ts:104-235,314-380` -- composition to copy (`db.transaction` → `guardTransactionDeadline` → `withIdempotency`, effects only when changed and not replayed). Add one shared `transitionInvitation` helper for the three operations; unknown/foreign → `TripNotFoundError`, state refusals → `ConflictError`.
- `src/lib/membership-writes.ts` -- add `rescindInvitationInTransaction` / `dismissInvitationInTransaction` (move guarded SQL from actions) returning row or refusal.
- `src/lib/api/contract/sharing.ts` -- add `resendInvitation`, `dismissInvitation` (POST, `invitationParams`, body `z.strictObject({tripId: uuid})`) and `rescindInvitation` (DELETE `/api/v1/trips/:tripId/invitations/:invitationId`, empty body). Result types `ResendInvitationResult` etc. in `src/data/types.ts:927-931` lose the `error` arm.
- `src/app/api/v1/invitations/[invitationId]/{resend,dismiss}/route.ts`, `src/app/api/v1/trips/[tripId]/invitations/[invitationId]/route.ts` -- new; shape from the accept route (`apiRoute(..., {idempotent: {}})`).
- `src/components/arrivo/use-share-invitation-actions.ts:49-99` -- swap action calls for `api()` (`src/lib/api/client.ts`); `ApiClientError` → `toast.error(message)`. Mocks in `use-share-invitation-actions.test.ts`, `use-trip-share-dialog-controller.test.ts`, `trip-share-dialog.test.tsx` move from actions module to the API client.
- E2E: `trip-sharing.steps.ts:274-310` (resend/rescind/dismiss: arm `waitForApiResponse` with exact method/path before click), `app-activity.steps.ts:523-540`, `pending-invitations.steps.ts:210`; new `steps/api-invitation-lifecycle.steps.ts` + `api.feature` scenarios.
- `tests/e2e/feature-map.mjs` -- map new route globs and steps file to `api`, `trip-sharing`, `pending-invitations`, `app-activity`; remove deleted action path. `docs/api-v1.md` -- `### POST /api/v1/invitations/:invitationId/resend`, `.../dismiss`, `### DELETE /api/v1/trips/:tripId/invitations/:invitationId`; `api-reference.test.ts` enforces headings. `src/lib/api/idempotency-expiry-cap.test.ts` route list.

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/membership-writes.test.ts`, `src/lib/services/sharing.test.ts`, `src/lib/api/contract/sharing.test.ts`, three `route.test.ts`, `use-share-invitation-actions.test.ts`, `use-trip-share-dialog-controller.test.ts`, `trip-share-dialog.test.tsx` -- write first: every matrix row, lock→role recheck→replay order, event order/counts, no effects on rollback/replay/deadline, 403/404/409 mapping, API call args and toasts.
- [x] `src/lib/membership-writes.ts`, `src/lib/api/contract/sharing.ts`, `src/lib/services/sharing.ts`, three route files, `src/data/types.ts` -- writers, contracts, services, routes.
- [x] `src/components/arrivo/use-share-invitation-actions.ts` -- move to `api()`.
- [x] Retire `rescindInvitation`/`dismissInvitation` (trips/actions.ts + tests), `trips/[tripId]/actions.ts` + test, `resendInvitation` (invitations.ts + tests) -- grep audit for callers.
- [x] `tests/e2e/features/{trip-sharing,pending-invitations,app-activity,api}.feature` + steps -- exact API waits before reload assertions; API scenarios: resend expired, rescind keyed retry, dismiss keyed retry after delete, cross-trip 404, editor 403. Fixtures via mothers.
- [x] `docs/api-v1.md`, `feature-map.mjs`, idempotency-cap test -- document, register; then targeted tests and build-validator.

**Acceptance Criteria:**

- Given production build, when a manager resends, rescinds or dismisses from the share dialog, then expiry refreshes, pending rows disappear, and the dismissed row stays gone after reopening and reload.
- Given final tree, when retired-export audit and affected validation run, then no `resendShareInvitation`/`rescindShareInvitation`/`dismissShareInvitation`/`rescindInvitation`/`dismissInvitation`/`resendInvitation` callers remain and checks pass without migrations or new settings.

## Implementation Notes

## Plan Change Log

## Review Triage Log

- medium, patch: resend lost trip revalidation; restored postcommit refresh with replay coverage (blind and edge).
- medium, patch: persisted expiry was not verified; API scenario now compares database expiry to response and 72-hour window (verification-gap).
- medium, patch: writer tests did not inspect trip and state SQL guards; predicate assertions added (blind: rescind, dismiss, resend).
- false: service success tests omit event details and activity; existing assertions cover event targets and rescind activity.
- low, reject: separate API role, cross-trip and conflict scenarios for each operation duplicate shared authorization and writer coverage.
- intent alignment: keyed replay is available to API callers; existing client does not retry or provide a key. Approved plan specifies keyed API replay, not automatic dialog retries.

## Design Notes

Authority comes from the trip the caller names, checked under the trip lock, not from the row. That keeps cross-trip ids concealed (404, same as unknown) and lets a keyed dismiss retry succeed after the row is deleted without storing extra evidence. Refusals become HTTP errors instead of 200 `{status:"error"}`. Global resend/dismiss paths carry `tripId` in the body because the epic's endpoint assumptions fix those paths; rescind is trip-scoped.

## Verification

Lint, TypeScript, production build and coverage passed. Scoped E2E passed 615 of 616 scenarios; the remaining activity scenario passed on targeted rerun after fixing its obsolete API wait. Affected selection requested the full suite, which was stopped under project policy; no validator PASS marker recorded.


**Commands:**

- `npx vitest run src/lib/membership-writes.test.ts src/lib/services/sharing.test.ts src/lib/invitations.test.ts src/lib/api src/app/api/v1 src/components/arrivo "src/app/(app)/trips"` -- expected: pass.
- `node scripts/run-e2e.mjs --grep="@feat:(trip-sharing|pending-invitations|app-activity|api)"` -- expected: pass.
- `build-validator` -- expected: PASS; no full-suite run.

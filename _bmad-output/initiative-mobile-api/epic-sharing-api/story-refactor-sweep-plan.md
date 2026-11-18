---
title: "Sharing refactor sweep"
type: refactor
ticket: "6"
created: "2026-11-18"
status: built
baseline_revision: "aed0f2c8d5af295623f6e9f067ed92bda639f589"
route: oneshot
route_source: auto
risk: low
review: quick
review_source: auto
lenses_ran: [quick]
review_loop_iteration: 0
context: [_bmad-output/initiative-mobile-api/AGENTS.md]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sharing migration left an unused resend helper re-export; retired actions and remaining wrappers require an explicit caller audit.

**Approach:** Remove the unused `applyInvitationResend` re-export from `src/lib/invitations.ts` and update its colocated test first. Keep the helper itself, its direct production callers, and transaction wrappers used by deletion-concurrency tests. Audit all retired sharing action names against their old modules and callers; retain deferred behavioral work. Use branch `story/4-6-sharing-refactor-sweep`, PR base `feature/api-v1`; no push or PR without authorization.

</frozen-after-approval>

## Implementation Notes

One-shot: one obsolete re-export and its matching test; no user-facing behavior changes. Story 4.4 removed the re-export's last indirect consumer. Four writer wrappers remain used by deletion-concurrency fixtures; moving those fixtures and inherited behavior fixes are deferred.

The retired-export declaration audit found no old sharing actions in action modules or `invitations.ts`. Direct resend imports remain in the sharing service and membership writer. Targeted Vitest: 193 tests pass across four files; the new alias test failed before removal.

## Plan Change Log

- Plan-reviewer: scope, architecture, component, accessibility and test checks pass; no blocking findings. Original request: build story 4.6, sharing refactor sweep.

## Review Triage Log

- False: review reported deleted BMad override; sandbox could not read protected `_bmad/` files when generating the diff. `git status` outside the sandbox shows no deletion; regenerated diff with repository access for re-review.

## Verification

Run `npx vitest run src/lib/invitations.test.ts src/lib/invitation-resend.test.ts src/lib/membership-writes.test.ts src/lib/services/sharing.test.ts`; audit old action modules and imports for the eight core actions `listInvitableUsers`, `inviteContributor`, `acceptInvitation`, `declineInvitation`, `rescindInvitation`, `dismissInvitation`, `saveContributorChanges`, `leaveTrip`, five detail wrappers `getShareDialogData`, `resendShareInvitation`, `rescindShareInvitation`, `dismissShareInvitation`, `saveContributorChanges`, and `resendInvitation` from invitations; distinguish valid API/service names. Run build-validator after targeted tests. No new UI flow, schema, environment, or E2E scenario.

Results: lint, TypeScript, production build, and coverage passed (8,127 tests; 98.15% lines, 97.82% functions, 94.05% branches). Affected pending-invitations E2E: 8 passed. Quick review: no findings in corrected diff.

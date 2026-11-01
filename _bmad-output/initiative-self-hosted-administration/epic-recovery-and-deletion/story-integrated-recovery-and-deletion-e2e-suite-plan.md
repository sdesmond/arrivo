---
title: "Integrated recovery and deletion E2E suite"
type: "chore"
ticket: 7
created: "2026-10-30"
status: done
baseline_revision: "eac1acec2b2ccff72fbb1082b849589bc331fc69"
route: "full"
route_source: "auto"
risk: "low"
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context: [AGENTS.md]
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** CAP-5/6/7 have per-feature and service-level coverage, but no browser proof that reset, CLI recovery and admin deletion together revoke a member's live session, retire sibling links across purposes, and leave Activity and deletion surfaces free of credentials and private trip detail.

**Approach:** Add one scenario-owned integrated suite reusing existing reset, recovery and deletion steps, then register it in the feature map. No production change expected; a real defect found is fixed minimally and reported.

## Boundaries & Constraints

**Always:** Object Mothers and scenario-owned users, trips, links and cleanup; the member's live session lives in a second browser context closed at scenario end. Open credential links only through `openCredentialLink` (`tests/e2e/onboarding-browser.ts`) and keep tokens, passwords and keys in memory. Await mutation POSTs with `waitForServerActionResponse` before reloads. Assert Activity through the admin Activity page in the browser, not only the DB. Branch note: PR targets `feat/self-hosted-administration`; current `ticket/4-6-refactor-sweep` base is accepted because 4.7 depends on unmerged 4.6.

**Never:** Add permanent seed rows, `global-setup.ts` data, ordering tags, sleeps, or production auth bypasses. Do not duplicate scenarios already in `password-reset`, `admin-recovery-completion` or `admin-account-deletion`. No full-suite E2E launch.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Reset | Member with live session, MFA, trusted device, recovery link; admin reset completed | Live session reaches sign-in; device and recovery link gone; MFA kept; fresh sign-in works | Recovery link page says unavailable |
| Recovery | Same member plus sibling reset link; operator recovery completed | Live session reaches sign-in; reset link unavailable; new codes shown once | Reset link page says unavailable |
| Deletion | Member owning a trip, with reset and recovery links and a live session; admin deletes after review | Heir owns trip; both links unavailable; live session refused; admin stays signed in | Links show unavailable pages |
| Privacy | After the above | Activity page and deletion dialog contain no token, password, key, trip name or collaborator detail | Assertion lists leaked category, never the value |

</intent-contract>

## Code Map

- `tests/e2e/steps/password-reset.steps.ts` -- reuse "I generate a password reset link…", "I open the generated…", "I complete the password reset…"; race steps show second-page sign-in via `scenario.signInAsUser`.
- `tests/e2e/steps/admin-recovery-completion.steps.ts` -- reuse operator issue/open/complete steps, `siblingResetToken`, `memberRow`; helpers are file-local, so mirror rather than import.
- `tests/e2e/steps/admin-account-deletion.steps.ts` -- `seedOwnedTrip` pattern, review/confirm steps and privacy assertions; file-local, mirror.
- `tests/e2e/onboarding-browser.ts` -- `openCredentialLink`, `recipientContext` (second context with own client IP).
- `src/app/(app)/admin/activity/page.tsx`, `src/components/arrivo/app-activity-viewer.tsx` -- Activity table (`aria-label` "Activity table") to scan.
- `src/db/schema.ts` -- `credential_authorizations.user_id` cascades on delete; `trusted_devices`.
- `tests/e2e/feature-map.mjs` -- register `integrated-recovery-and-deletion`; unit contract in `scripts/feature-map.test.mjs`.

## Tasks & Acceptance

**Execution:**

- [x] `tests/e2e/features/integrated-recovery-and-deletion.feature` -- tag `@feat:integrated-recovery-and-deletion`; three scenarios (reset, recovery, deletion) covering the matrix, privacy checks inside each -- first edit, tests are the deliverable
- [x] `tests/e2e/steps/integrated-recovery-and-deletion.steps.ts` -- new steps only: live member session in second context, member provisioning (MFA, device, links), session-refused, link-unavailable, Activity-page and dialog leak scans; reuse existing steps by wording where identical
- [x] `tests/e2e/feature-map.mjs` -- add entry with source globs for reset, recovery and deletion libs plus Activity viewer; run `scripts/feature-map.test.mjs`

**Acceptance Criteria:**

- Given a member with a live session, MFA, trusted device and recovery link, when an admin reset completes, then the live session reaches sign-in, device and recovery link are gone, MFA stays, and the recovery link page is unavailable.
- Given a member with a live session and a sibling reset link, when operator recovery completes, then the live session reaches sign-in and the reset link page is unavailable.
- Given a member owning a trip with outstanding links, when the admin deletes them after review, then the heir owns the trip, both link pages are unavailable, the live session is refused and the admin remains signed in.
- Given the completed flows, when the Activity page and deletion dialog are read, then no token, password, authenticator key, trip name or collaborator detail appears and no report or artifact holds a credential URL.

## Implementation Notes

Implemented by subagent: feature, steps and feature-map entry only; no production change. Deletion scenario reads `adminDeletionSeeded` from the existing deletion steps and promotes the owner to admin so a recovery link can exist. Reused reset/recovery steps still `page.goto` credential URLs directly (existing behavior). Verified: feature-map/affected-e2e vitest 25 passed; targeted E2E 35 passed including all 3 new scenarios. Matrix rows all covered by those scenarios, which ran.

## Plan Change Log

## Review Triage Log

### 2026-10-30 — Review pass

- verdicts: 10 findings — high 0, medium 0, low 5, false 5, maybe-false 0
- findings:
  - `[low]` `[reject]` Dialog and artifacts not scanned in reset/recovery scenarios — no dialog is read there; the deletion dialog uses the reused privacy step, and reports are covered by `openCredentialLink`; a fix adds scan machinery for no named harm.
  - `[low]` `[reject]` Leak-scan probes can miss tokens or false-positive on short values and the URL regex — suite passed against real pages; widening adds guards for an unlikely case.
  - `[false]` `[reject]` Deletion-scenario Activity wait is fragile and shows the deleted owner's username — Activity stores target username by design (existing step asserts `targetUsername`); the scenario passed.
  - `[false]` `[reject]` Collaborator probes may confuse heir/admin entries — probes cover only trip collaborators; scenario passed.
  - `[false]` `[reject]` Live-session check has no negative control — `signInAsUser` waits for `**/trips` before the flow, proving the second context was authenticated.
  - `[low]` `[reject]` Hard-coded origin — same pattern in the existing recovery steps; fix is a refactor.
  - `[low]` `[reject]` Scenario 2 does not assert trusted-device revocation — not in the matrix; already covered in `admin-recovery-completion`.
  - `[low]` `[reject]` Owner promoted to admin in deletion scenario — recovery links exist only for admins; documented in plan notes.
  - `[false]` `[reject]` New steps file missing from feature map — `entry()` always adds its own feature and step files.
  - `[false]` `[reject]` No unit-test evidence — no runtime code changed; `scripts/feature-map.test.mjs` ran and passed (25 tests).

## Design Notes

Second context: `recipientContext(page)` then `scenario.signInAsUser(memberPage, username)`. "Refused" means reload lands on `/sign-in`. Scan helper returns category names only so failures never echo secrets.

## Verification

**Commands:**

- `npx vitest run scripts/feature-map.test.mjs scripts/affected-e2e.test.mjs` -- expected: pass
- `node scripts/run-e2e.mjs --server=kill "--grep=@feat:(integrated-recovery-and-deletion|password-reset|admin-recovery-completion|admin-account-deletion)"` -- expected: all pass

## Auto Run Result

Status: built

- Summary: integrated browser suite of three scenarios (admin reset, operator recovery, admin deletion) proving live-session revocation, cross-purpose link retirement, trip succession and secret-free Activity. No production change.
- Files changed: `tests/e2e/features/integrated-recovery-and-deletion.feature` (scenarios); `tests/e2e/steps/integrated-recovery-and-deletion.steps.ts` (second-context session, link and leak-scan steps); `tests/e2e/feature-map.mjs` (suite entry); this plan.
- Review: quick lens, 10 findings, 0 patches, 0 deferred, 10 rejected (5 false, 5 low; reasons in triage log). Follow-up review recommended: false.
- Verification: `scripts/feature-map.test.mjs` and `scripts/affected-e2e.test.mjs` 25 passed; targeted E2E (`@feat:` integrated-recovery-and-deletion, password-reset, admin-recovery-completion, admin-account-deletion) 35 passed including all 3 new scenarios. ESLint and tsc clean on the new steps file. build-validator not run by this workflow; parent owns it.
- Residual risks: deletion scenario reads the `adminDeletionSeeded` key from existing deletion steps; reused reset/recovery steps still `page.goto` credential URLs directly.

## Completion verification — 2026-10-30

Marked done at the user's request after checking implementation, tests and subsequent verification records. Evidence and fresh check results are recorded in the [ticket status audit](../status-audit-2026-10-30.md). Historical execution results above remain unchanged.

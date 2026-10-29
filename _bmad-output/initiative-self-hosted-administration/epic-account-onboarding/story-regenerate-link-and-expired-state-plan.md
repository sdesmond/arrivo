---
title: "Regenerate link and expired state"
type: feature
ticket: 6
created: "2026-10-28"
status: done
baseline_revision: "7cc640191f97457239d872b19d64d0f99a7001b3"
route: full
route_source: auto
risk: high
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - AGENTS.md
  - .agents/skills/shadcn/SKILL.md
  - _bmad-output/initiative-self-hosted-administration/architecture-self-hosted-administration/architecture-self-hosted-administration.md
warnings: [oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Admins cannot replace a pending or expired account's setup link from Users.

**Approach:** Add Generate new link to unfinished rows, issuing a fresh 24-hour authorization for the existing account ID, invalidating prior links, displaying a one-time copyable result, and recording regeneration Activity.

## Boundaries & Constraints

**Always:** Use configured trusted origin; refuse before writes when absent with existing actionable NEXTAUTH_URL/AUTH_URL message. Recheck completed-admin authority and unfinished target under instance-then-sorted-user locks. Atomic invalidation and issuance; only hashed tokens persist. Return immutable ID and safe identity snapshots. Activity after commit through recordActivity, identity only; failures never affect success. Reconcile unknown results from current account state before another deliberate generation. Use established Base UI dialog primitives, explicit Props interface and use client, 44px targets, CSS tokens, named controls, keyboard open/Escape/return focus and result heading focus. Expired accounts stay visible. Domain types in src/data/types.ts.

**Never:** Create/recreate an account, retrieve a lost token, derive origin from headers, change /setup or setup completion, add delete/reset functionality, migrations, new dependencies, or changelog. Do not commit/push. Parent owns build-validator; implementation child must not run it. Use approved outside-sandbox execution for Git and dependency/cache commands; keep TLS verification enabled.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected behavior | Error handling |
| --- | --- | --- | --- |
| Replace | Pending or expired account | Same ID, fresh 24h link, old link/context invalid, new link admits setup | One regeneration event, no account-created event |
| Stale target | Completed/deleted since row loaded | No issuance/account insert; authoritative Users refresh | Safe changed-state message |
| Authority | Actor missing/demoted/unfinished | No writes or events | Forbidden and refresh |
| Origin | No trusted origin | No writes/events | Actionable operator error |
| Contention | Missing singleton or retryable SQLSTATE | No partial replacement | Instance-unavailable/retry |
| Unknown response | Mutation throws or response lost | Read current target by ID before retry; never recover token | Failed read locks retry; Check again |
| Copy/result | Copy denied or dialog closes | Selectable URL fallback; close discards URL | Status feedback; focus restored |
| Activity failure | Scheduling/persistence fails | Link committed and success unchanged | Existing best-effort boundary |

</intent-contract>

## Code Map

- src/lib/credential-authorizations.ts: reuse issueCredentialAuthorizationInTransaction unchanged; owns locks, eligibility, replacement and 1440-minute expiry. compose within one transaction, no nested transaction.
- src/lib/account-creation.ts: service pattern, identity SQL and retryable SQLSTATE handling; no modification needed.
- src/lib/setup-link-regeneration.ts (new): request-independent service, locks and snapshots then existing issuer; missing/completed distinguished from forbidden. Service never inserts users.
- src/app/(app)/admin/users/actions.ts: requireAdmin, trustedLinkOrigin, recordActivity, revalidatePath; add replacement and authoritative target-state read by ID.
- src/components/arrivo/instance-users-list.tsx: 118 lines; already retains pending/expired status; add separate dialog trigger for unfinished rows. src/lib/instance-users.ts already retains expired expiry; unchanged.
- src/components/arrivo/regenerate-setup-link-dialog.tsx (new): use existing Dialog/Button and Add User result pattern, under 250 lines; initial explicit generation followed by one-time result. Avoid expanding add-user-dialog.tsx (already near 250 lines).
- src/data/types.ts, src/lib/activity-labels.ts: result/failure/outcome types, SetupLinkRegenerated event, Accounts / Regenerated setup link label. Existing recordActivity catches scheduling/write failures.
- tests/e2e/scenario-fixture.ts, e2e-seed-data.ts, credential-authorization-fixture.ts, role-service-fixture.ts: scenario-owned materialization/mothers and deterministic lock gates; do not add permanent seed rows. Suppress credential URLs in diagnostics/traces using existing sensitive-flow patterns.

## Tasks & Acceptance

**Execution:**

- [x] Tests FIRST: create src/lib/setup-link-regeneration.test.ts and src/components/arrivo/regenerate-setup-link-dialog.test.tsx; extend src/app/(app)/admin/users/actions.test.ts, src/components/arrivo/instance-users-list.test.tsx, src/lib/activity-labels.test.ts and src/components/arrivo/instance-activity.test.tsx. Cover every matrix row, IDs/24h, lock order, invalid IDs, stale authority/target, retry and rollback, secret-free events, pending duplicate suppression, unknown reconciliation failure/success, focus, Escape and copy fallback/clearing. Use existing global navigation/header mocks.
- [x] Create tests/e2e/features/setup-link-regeneration.feature and tests/e2e/steps/setup-link-regeneration.steps.ts: pending/expired Users regeneration, same ID/no duplicate, old rejected/new setup opens, fresh expiry and Activity; stale completed/deleted rows reconcile; lost response requires current-state check. Add real-Postgres race/rollback checks via existing fixture helpers where appropriate. Await server action POST before reload.
- [x] Implement domain types, service, action/state read, event label, dialog and row trigger at paths above. No new account writes. Block duplicate submits/dismissal while pending. Unknown state must survive close/reopen until reconciled. Explicit generation only, not on dialog open. Successful result refreshes Users without losing displayed URL. Lost result can only be deliberately replaced after authoritative state read. Stale completed/deleted row refreshes without issuance.
- [x] tests/e2e/feature-map.mjs: register new service/component and shared action/list/label paths for setup-link-regeneration; preserve existing maps.
- [x] Run targeted Vitest and focused Playwright feature; append commands/results to Implementation Notes. Parent handles broad validator after review fixes.

**Acceptance Criteria:**

- Given an unfinished account with pending or expired link, when admin generates a new link in Users, then same row/account ID remains, result shows fresh 24-hour expiry and copyable URL, old link is refused and new link opens mandatory setup.
- Given expired authorization, when Users loads, then account remains visible with expired text and Generate new link.
- Given account completed/deleted after Users loaded, when generation is attempted, then current state is refreshed with no duplicated or resurrected account.
- Given an unknown generation result, when retry is attempted, then authoritative state must first be checked; a failed check prevents further issuance.
- Given committed regeneration, when Activity is read, then actor and target snapshots identify regeneration without URL/token or account creation.

## Plan Review

Original request: ticket 3.6, regenerate pending/expired setup links for same account. Scope, architecture, component, accessibility and test checks PASS; no blocking findings. Existing Users list is below component limit; new dialog specifies Props, client boundary, keyboard/focus/44px requirements. Every covered source file and user flow has named tests. Corrected focused E2E runner syntax before dispatch.

## Implementation Notes

- Added request-independent regeneration service, immutable-ID state read and guarded server action. Existing issuer remains unchanged; replacement and invalidation share one transaction, with completed-admin and unfinished-account snapshots under lifecycle locks. No account inserts, schema changes or dependencies.
- Added separate Base UI dialog and unfinished-row trigger, one-time selectable/copyable result, result-heading focus, pending dismissal/duplicate guards, persistent uncertain state, and explicit replacement after authoritative reconciliation. Changed-state toast survives removal of stale row during refresh.
- Added identity-only `setup_link_regenerated` Activity and Accounts label. Reused recorder's best-effort boundary.
- Tests authored before runtime implementation. Initial targeted run failed on missing new modules/actions; final targeted command below passes 108 tests across six files.
- `npx vitest run src/lib/setup-link-regeneration.test.ts src/components/arrivo/regenerate-setup-link-dialog.test.tsx src/components/arrivo/instance-users-list.test.tsx src/lib/activity-labels.test.ts src/components/arrivo/instance-activity.test.tsx "src/app/(app)/admin/users/actions.test.ts"` — PASS.
- `npx vitest run src/lib/setup-link-regeneration.test.ts src/components/arrivo/regenerate-setup-link-dialog.test.tsx --coverage --coverage.include=src/lib/setup-link-regeneration.ts --coverage.include=src/components/arrivo/regenerate-setup-link-dialog.tsx` — PASS, 100% lines/functions, 96% branches before final changed-state toast addition (covered by dialog assertions).
- `npx vitest run scripts/feature-map.test.mjs` — PASS, eight map-contract tests. An initial invocation through `node --test` was incorrect; rerun with Vitest passed.
- `npx tsc --noEmit` and ESLint over new service/dialog/tests, users actions/tests and new E2E steps — PASS.
- `node scripts/run-e2e.mjs --grep=@feat:setup-link-regeneration` — PASS, eight checks including auth; covers pending/expired, same ID, new expiry, old link and old open context, Activity, stale completed/deleted rows, lost response/failed reconciliation/reopen, PostgreSQL completion/demotion races and rollback. One intermediate rerun returned admin authorization 404 before feature interaction; a clean fresh-server/global-setup rerun passed all eight in 23.9s. Cause unresolved; no product workaround introduced.
- Extended scenario-owned user materialization with optional unfinished setup state and added fixture self-test. Credentials stay in scenario memory; existing harness leaves traces/video disabled. Parent owns broad build-validator and review; no commit or push performed.

- Parent independently reran plan verification: targeted Vitest 108/108 PASS; focused Playwright 8/8 PASS (23.1s). Matrix audit satisfied by service/action/dialog tests, real-Postgres replacement/race/rollback scenarios and existing Activity recorder coverage in broad gate.

## Plan Change Log

## Review Triage Log

### 2026-10-28 — Review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- Quick reviewer inspected full diff and surrounding code; no findings. No patches, deferred items or rejected findings.

## Design Notes

Full route: more than 100 production lines and cross-layer work. Reuse credential lifecycle unchanged; its account locks serialize completion and replacement. No query change required for expired rows.

## Verification

- npx vitest run src/lib/setup-link-regeneration.test.ts src/components/arrivo/regenerate-setup-link-dialog.test.tsx src/components/arrivo/instance-users-list.test.tsx src/lib/activity-labels.test.ts src/components/arrivo/instance-activity.test.tsx "src/app/(app)/admin/users/actions.test.ts" — all pass.
- node scripts/run-e2e.mjs --grep=@feat:setup-link-regeneration — new scenarios pass (check runner arguments before invoking; use equivalent existing focused command if needed).

## Auto Run Result

- Initial check blocked on Git metadata access; approved outside-sandbox rerun passed. Resumed planning on ticket branch with original baseline preserved.

- Summary: Users can regenerate pending/expired setup links for the same immutable account ID, invalidating old links and open contexts, displaying a fresh one-time 24-hour link, reconciling stale/unknown outcomes and recording identity-only Activity.
- Files: `src/lib/setup-link-regeneration.ts` and tests implement locked replacement; users actions/tests implement guarded issuance and state read; `regenerate-setup-link-dialog.tsx` and tests implement result/copy/reconciliation; users list/tests add unfinished-row control; domain types and Activity labels/tests add regeneration event; E2E feature/steps, fixture materializer/self-test, seed type and feature map cover full flow.
- Review: Quick inspection returned no findings; 0 patches, 0 deferred, 0 rejected. Follow-up review recommended: false (no patched entries).
- Verification: parent targeted Vitest 108 passed; focused regeneration Playwright 8 passed. Build-validator lint, TypeScript, coverage and production build PASS. Full coverage: 327 files, 5212 tests passed; lines 97.29%, functions 96.93%, branches 92.37%. Production build generated 15 static pages; remaining routes rendered on demand; Next.js report does not provide bundle sizes.
- E2E broad gate: 422 passed, 1 failed (pre-existing viewer-access editor Edit trip menu item not found). Focused viewer-access rerun: all 8 checks passed. All new regeneration and fixture checks passed in broad run. No runtime changes made after validation/review. Validator pass marker remains cleared because broad run was not wholly green.
- Residual risks: non-reproducing viewer-menu E2E failure and intermediate admin-page 404 remain unexplained; both passed clean focused reruns. No product workaround introduced.
- Finalization: implementation-agent commit restriction applied during handoff; parent follows workflow finalization to record reviewed changes on ticket branch. No push.

---
title: "Refactor sweep"
type: "refactor"
ticket: 6
created: "2026-10-30"
status: done
baseline_revision: "f8a41b26d15d83f8cfce87496c910948810e0e30"
route: "full"
route_source: "auto"
risk: "high"
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

**Problem:** Two deferred 4.1 review findings remain: sign-out-everywhere and device removal trust a session checked before a competing reset, allowing stale requests to revoke fresh authentication afterward.

**Approach:** Reuse existing account-lock/security-version guard for both actions and execute their mutations in that same transaction. Complete this bounded epic cleanup without new feature scope.

## Boundaries & Constraints

**Always:** Recheck originating session version under account lock, before any mutation. Preserve successful global sign-out notice, current-device cookie removal/sign-out and other-device profile refresh. Stale, missing-version or deleted-account requests perform no mutation or success effects; redirect to `/sign-in` after transaction finishes. Preserve device ownership restriction. Keep browser effects outside transaction. AD-5 applies.

**Never:** Change schema, recovery/deletion policy, Activity, MFA semantics or normal auth flows. Extract duplicated reset/recovery sessions or fix unrelated intermittent E2E failures. Log secrets or add new services.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Global sign-out | Current session | Increment version once under lock, then existing success sign-out | Transaction failure propagates; no success |
| Device removal | Current session, own device | Delete in guarded transaction; current device signs out, other device refreshes | Other user's device untouched |
| Stale request | Reset wins account lock; missing version or account | No version bump/device delete/cookie delete/success effect; fresh state survives | Redirect to sign-in |

</intent-contract>

## Code Map

- `src/app/(app)/profile/security-actions.ts`: other MFA actions already use `lockCurrentSecurityVersion`; two final actions do not. Reuse existing guard and defer redirects/cookie changes until commit.
- `src/lib/session-version.ts`: guard locks account FOR UPDATE; `bumpSessionVersion` currently writes through singleton. Let bump accept supplied transaction executor, preserving default path.
- `src/lib/trusted-devices.ts`: `forgetTrustedDevice` owns user-scoped delete and current-token hash comparison. Let it accept supplied transaction executor, preserving default path. No extra DB connection.
- `tests/e2e/steps/password-reset.steps.ts`: existing password-change race holds account lock, observes pg_blocking_pids, completes real reset through scoped transaction, then awaits browser POST. Reuse pattern and scenario-owned member.
- `tests/e2e/feature-map.mjs`: security actions already map to mfa; also register with password-reset. Shared helper source remains broad shared scope to preserve other auth consumers.

## Tasks & Acceptance

**Execution:**

- [x] First expand `src/app/(app)/profile/security-actions.test.ts`: guard receives session version and transaction; stale/missing version/deleted account do not mutate or run success effects; transaction failure does not sign out; valid global/current-device/other-device/ownership semantics remain. Use existing global Next mocks.
- [x] First expand `src/lib/session-version.test.ts` and `src/lib/trusted-devices.test.ts`: supplied executor performs write instead of singleton; existing default behavior preserved. Then update helpers and actions as above; no new domain types.
- [x] Add scenarios in `tests/e2e/features/password-reset.feature` and `tests/e2e/steps/password-reset.steps.ts`: global sign-out and device removal waiting for account lock cannot modify post-reset authentication. Hold target account lock, trigger actual profile action, observe blocked transaction, complete reset, release lock, await action response. For removal recreate targeted device ID at fresh version inside reset transaction so unfixed deletion has observable impact; otherwise absence of old device would falsely pass. Verify fresh version/device remain, stale browser reaches sign-in without global-success notice. Deterministic gates, no sleeps/shared fixtures. Add tests before production edits where practical.
- [x] Update `tests/e2e/feature-map.mjs` password-reset mapping; run `scripts/feature-map.test.mjs`. Run targeted Vitest and password-reset/mfa E2E; parent invokes build-validator after final implementation and targeted checks, E2E separate from all other checks.

**Acceptance Criteria:**

- Given reset completes while global sign-out waits for account lock, when stale browser request resumes, then sign-in appears without success notice and fresh authentication version remains unchanged.
- Given reset completes and fresh device exists while removal waits, when stale browser request resumes, then sign-in appears and fresh device survives.
- Given current authenticated user, when normal sign-out or device removal runs, then existing success notices, current-browser sign-out and other-browser removal remain functional.

## Implementation Notes

Plan-reviewer: original request is ticket 4.6 epic cleanup. Scope, architecture, component, accessibility and test coverage PASS; zero blockers/warnings. Existing transaction helpers are reused; no UI components or schema change. Every covered library has matching colocated tests; changed race behavior has feature and steps. Shared helper scope remains broad for affected coverage.

Full route: estimated 250–350 changed production/test lines. High risk reflects protection of fresh authentication. Earlier sandbox metadata failure resolved by approved execution; user selected ticket branch. Only generated blocked stub was removed for retry; source tree was clean.

Implementation complete: account lock/version guard surrounds both writes; helper executors keep mutations in same transaction. Browser effects follow commit. Expanded tests first produced eight expected failures; 65 targeted tests and 14 password-reset/MFA browser tests passed. Matrix rows covered by normal sign-out/removal, ownership/executor, stale/missing/deleted-session and commit-failure tests. Next version-matched mutation and Form docs read before edits.

## Plan Change Log

## Review Triage Log

### 2026-10-30 — Review pass

- verdicts: 0 findings — high 0, medium 0, low 0, false 0, maybe-false 0
- findings: none. Independent quick lens inspected complete diff and surrounding code; no findings. Patches 0; deferred 0; rejected 0. Follow-up review not recommended.

## Verification

- `npx vitest run "src/app/(app)/profile/security-actions.test.ts" src/lib/session-version.test.ts src/lib/trusted-devices.test.ts scripts/feature-map.test.mjs` — pass.
- `npx bddgen` then `npx playwright test --project=chromium --grep '@feat:password-reset|@feat:mfa'` — pass, including both new controlled races.
- Parent runs build-validator: lint, TypeScript, coverage, build, then affected E2E separately. Never launch full E2E command.
## Auto Run Result

Status: built

Implemented both deferred 4.1 security-action fixes. Stale global sign-out/device-removal requests now recheck originating session version under account lock and cannot modify fresh post-reset authentication. Existing valid-session behavior remains.

Files changed:

- `src/app/(app)/profile/security-actions.ts` and `.test.ts`: guarded transactions, stale redirects, post-commit effects and regression tests.
- `src/lib/session-version.ts` and `.test.ts`: transaction executor for version increment; default singleton path preserved.
- `src/lib/trusted-devices.ts` and `.test.ts`: transaction executor for owned-device deletion; ownership/default behavior tested.
- `tests/e2e/features/password-reset.feature` and `tests/e2e/steps/password-reset.steps.ts`: two controlled browser/reset races preserving fresh version/device.
- `tests/e2e/feature-map.mjs`: security-action changes select reset coverage alongside MFA.
- This plan: reviewed scope, execution evidence and result.

Review: independent quick lens, zero findings. Patches applied 0 (high 0, medium 0, low 0); deferred 0; rejected 0. Follow-up review recommended: false. No unverified risk identified by review.

Verification:

- Tests first produced eight expected failures before production changes.
- Targeted Vitest and feature-map: 65 passed.
- Targeted password-reset/MFA browser suite: 14 passed, including both new race scenarios.
- Build-validator: lint, TypeScript, production build and all 5,571 unit tests passed. Coverage lines 97.34%, functions 96.86%, branches 92.62%.
- Affected E2E, run alone after all other workers finished: 495 passed in 9.8 minutes; successful process exit. Both new race scenarios passed in this broader run.
- Production build generated 15 static pages; current Next build output reports route modes without bundle-size totals.
- Matrix audit: all three rows covered by executed passing action/helper unit tests and password-reset/MFA browser scenarios, including transaction failures, ownership restriction and stale/missing/deleted contexts.

Residual limitations: no schema changes or new feature scope; unrelated prior deferred E2E intermittency remains separate historical work. Branch remains local; no push requested by workflow.

## Completion verification — 2026-10-30

Marked done at the user's request after checking implementation, tests and subsequent verification records. Evidence and fresh check results are recorded in the [ticket status audit](../status-audit-2026-10-30.md). Historical execution results above remain unchanged.

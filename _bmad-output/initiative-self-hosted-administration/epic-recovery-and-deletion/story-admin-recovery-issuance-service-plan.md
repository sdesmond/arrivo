---
title: "Admin recovery issuance service"
type: feature
ticket: 4
created: "2026-10-29"
status: done
baseline_revision: "3e2963911a09a5b207f0fe0bb4a9422ccc75e71c"
route: full
route_source: auto
risk: high
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
context: [AGENTS.md]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Operators lack request-independent recovery issuance with username lookup, explicit origin and isolated Activity.

**Approach:** Inject DB/clock; accept trusted-operator authority, username and browser-facing origin; reuse recovery authorizations; return one URL/expiry after commit and attempt bounded Activity separately.

## Boundaries & Constraints

**Always:** Normalize/validate username. Require completed admin under singleton-then-user locks; recheck requested username against locked stable ID, refusing renamed/deleted targets. Real security time; one-hour expiry; hash-only storage; atomic same-purpose replacement. Accept explicit HTTP/HTTPS origin with optional port/root slash; reject userinfo, non-root path, query, fragment and other schemes before DB work. No headers/environment fallback.

After commit, separate caught Activity transaction, five-second bound, no retry. Dedicated event; null actor ID, fixed `Server operator (CLI)` label, locked target ID/username. No fake authenticated actor or machine identity.

**Never:** Change credentials, MFA, recovery codes, sessions or devices. Add browser completion, web action, CLI packaging/cutover or migrations (ticket 4.5). No Next request APIs, runtime DB singleton, hidden connection, encryption-secret dependency, token retrieval or secrets in Activity/errors.

## I/O & Edge-Case Matrix

| Scenario | State | Outcome |
| --- | --- | --- |
| Issue | Eligible admin, valid origin/operator | `/account-recovery?token=…`, identity and ISO expiry 60 minutes from locked issuance |
| Refuse | Invalid input/operator; missing/member/unfinished account | Structured refusal; no writes |
| Replace | Prior recovery and other-purpose links | Only recovery replaced; rollback preserves original; contention returns retry |
| Race | Demotion/deletion/rename before acquired locks | Refuse stale target without substitution |
| Activity | Committed issuance; writer rejects/throws/stalls | Success within Activity bound; link remains valid; no secrets logged |

</frozen-after-approval>

## Code Map

- `src/lib/credential-authorizations.ts`: reuse `issueCredentialAuthorizationInTransaction` with trusted-operator/Recovery for entropy, digest, eligibility, expiry/replacement. Leave unchanged.
- `src/lib/account-lifecycle-locks.ts`: locks. `password-reset-issuance.ts`: rollback/SQLSTATE pattern.
- `src/lib/username.ts`: validation. Keep strict origin validation local.
- `src/data/types.ts`: canonical contracts/event. Existing Activity schema supports nullable actor ID/text snapshot; queries derive known types automatically.
- `src/lib/activity.ts`: Next/singleton imports; use `with-timeout.ts` instead.
- Existing `app-activity.tsx` renders operator snapshot unchanged.
- `tests/e2e/credential-authorization-fixture.ts`: isolated schema, local authorization FK, lock gates. Extend via new fixture; copy Activity/device/code tables for snapshots. Mother-owned users need valid short usernames overriding fixture defaults. Register cleanup before setup.

## Tasks & Acceptance

**Execution:**

- [x] Tests first: `src/lib/admin-recovery-issuance.test.ts` covers matrix, normalization, HTTP/HTTPS, strict origin/authority rejection, locked username, missing instance, nested retry, rollback/unexpected failure, post-commit Activity order, throw/rejection/timeout and secret-free fields. Update `src/lib/activity-labels.test.ts` for event.
- [x] Add `tests/e2e/features/admin-recovery-issuance.feature`, `tests/e2e/steps/admin-recovery-issuance.steps.ts`, `tests/e2e/admin-recovery-issuance-fixture.ts`. Real Postgres scenarios: digest-only storage, exact expiry/purpose, replacement/rollback, invalid origin and ineligible targets, unchanged credential/session/MFA/device/code snapshots, concurrent issuance and locked demotion/deletion/rename rechecks. Deterministic gates; scenario-owned rows.
- [x] Add contracts/event in `src/data/types.ts`; implement `src/lib/admin-recovery-issuance.ts` using injected DB/clock, safe discriminated results and locked identity. Delegate authorization lifecycle; construct URL before primary commit. Unexpected primary failures roll back and propagate without secret logging. No Activity on refusal/rollback.
- [x] Same service: separate post-commit Activity transaction; `withTimeout` bounds wait to five seconds, SQL statement timeout bounds execution. Catch optional failures. Unit fake timers prove bound; real DB rejected INSERT proves committed link survives.
- [x] Update `src/lib/activity-labels.ts`; register source/fixture and `@feat:admin-recovery-issuance` in `tests/e2e/feature-map.mjs`. Verify persisted operator/target/event and no secrets; event readable through existing Activity contracts.

**Acceptance Criteria:**

- Given eligible admin, when issuance succeeds, then purpose/expiry and unchanged credentials match matrix.
- Given prior links, when replacement commits or rolls back, then matrix outcomes persist.
- Given invalid input/stale target, when issuance runs, then no writes occur.
- Given committed issuance, when Activity fails, then link survives; successful events distinguish operator from target without secrets.

## Implementation Notes

Activity follow-up: narrowing filters alone did not resolve the full-run timeout. Removed redundant Activity navigation/reload after the database assertion already awaited persistence. All 32 Activity tests passed; combined onboarding, retention, recovery and Activity run passed 85 tests using four workers. No timeout increase, ordering tag, serialization or shared reseeding added.

Final validation initially passed lint, TypeScript, build and 5,486 unit tests, but one of 485 E2E tests timed out: forged-ticket Activity assertion assumed its row remained on the unfiltered first page. Isolated rerun passed. Narrowed that scenario in `tests/e2e/features/app-activity.feature` and matching steps to failed-sign-in type and captured request interval, preserving parallel execution and scenario-owned data.

Plan-reviewer: scope, architecture, components, accessibility and tests PASS; zero blockers/warnings. Original ticket 4.4 checked. No component changes; service/labels have colocated tests and real-Postgres BDD coverage.

Implementation completed: injected `issueAdminRecovery` resolves normalized username once, locks singleton then stable account ID, rechecks eligibility/identity, delegates Recovery authorization issuance, and constructs URL before commit. Independent Activity transaction uses a five-second wait and SQL statement timeout; optional failures remain caught. Dedicated operator event and label added without schema changes.

Targeted verification completed:

- `npx vitest run src/lib/admin-recovery-issuance.test.ts src/lib/activity-labels.test.ts scripts/feature-map.test.mjs` — 58 tests passed. Output: temporary-directory `arrivo-admin-recovery-unit.log`.
- `npx bddgen` then `npx playwright test --project=chromium --grep '@feat:admin-recovery-issuance'` — eight real-Postgres recovery scenarios plus authentication setup passed (9 tests, 14.1 seconds). Includes immediately-before/exact expiry and cross-purpose refusal assertions. Output: temporary-directory `arrivo-admin-recovery-bddgen.log` and `arrivo-admin-recovery-e2e.log`.
- `npx tsc --noEmit --incremental false` — passed.
- ESLint on all touched TypeScript files — passed.
- Parent validation completed: lint, TypeScript, production build and all 5,486 unit tests passed. Coverage: lines 97.32%, functions 96.93%, branches 92.54%. Broad E2E: 483 passed, two failed; both failures passed unchanged in isolated rerun (3 tests with auth setup). Gate remains FAIL; no PASS marker.

## Plan Change Log

## Review Triage Log

Quick review completed by independent reviewer: no findings, no deferred work. Matrix audit passed against executed unit and real-Postgres tests, including expiry boundary and purpose isolation.

Follow-up inspection of Activity test correction: no findings. Final broad E2E gate remains failed: 483 passed, two broader scenarios failed (rename/self-deletion Activity at 30-second budget; trip transit-mode persistence assertion). Both scenarios passed in earlier broad runs; recovery scenarios pass throughout. Cover-picker search also had one intermittent timeout and passed unchanged in isolation. No runtime changes were made to those flows. Full-run intermittency is deferred for separate investigation; no validation PASS marker recorded.

## Design Notes

Full route exceeds 100 lines. Browser endpoint belongs to 4.5.

## Verification

- `npx vitest run src/lib/admin-recovery-issuance.test.ts src/lib/activity-labels.test.ts` — pass.
- `npx vitest run scripts/feature-map.test.mjs` — 9 tests passed. This file imports Vitest; the original Node test-runner command does not apply.
- `npm run test:e2e:affected` — final broad run: 483 passed, two broader failures; see Review Triage Log. Eight recovery scenarios passed. Targeted concurrent onboarding/retention/recovery/Activity run: 85 passed.
- Parent runs build-validator after targeted tests; implementation child does not. E2E follows other validation separately.

## Completion verification — 2026-10-30

Marked done at the user's request after checking implementation, tests and subsequent verification records. Evidence and fresh check results are recorded in the [ticket status audit](../status-audit-2026-10-30.md). Historical execution results above remain unchanged.

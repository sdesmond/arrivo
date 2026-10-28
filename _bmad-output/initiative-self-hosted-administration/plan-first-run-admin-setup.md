---
title: First-run admin setup
type: feature
ticket: ""
created: 2026-10-27
status: built
baseline_revision: 714ff742ff3d00141c568470f156575aa4537ce6
route: full
route_source: auto
risk: medium
review: quick
review_source: pinned
lenses_ran: [quick]
review_loop_iteration: 0
context: [AGENTS.md]
---

<frozen-after-approval reason="human-owned intent — approved in conversation">

## Intent

**Problem:** First-run signup does not explain admin creation and remains visible after bootstrap closes.

**Approach:** Dedicated `/setup` welcome screen creates first admin, then disappears behind sign-in redirects. Existing bootstrap transaction remains authority.

## Boundaries & Constraints

**Always:** Use durable instance initialization, server-side eligibility and validation, existing auth card/theme, labeled 44px controls, password-manager support, and existing auto-sign-in to Trips. Keep exactly-one-admin concurrency and best-effort Activity. Branch creation approved; branch is `ticket/first-run-admin-setup`. Preserve pre-existing changes in SETUP.md and onboarding epic. No commits or pushes requested.

**Never:** Schema changes, account-count-based reopening, DB reads in proxy, general public signup, or interference with later token-based account setup. Do not run full E2E directly; use affected coverage. Do not invoke build-validator inside delegated implementation; parent owns final gate.

## I/O & Edge-Case Matrix

| Scenario | State/input | Expected behavior |
| --- | --- | --- |
| Fresh entry | Unauthenticated `/`, `/trips`, `/sign-in` | Existing proxy sign-in path resolves to `/setup`; no sign-in form flashes |
| Welcome | Fresh `/setup` | Welcome to Arrivo!; Let's get your admin account set up.; required Username, Name, Password, Confirm password in that order; Create admin account button |
| Valid creation | Valid matching fields | One initialized admin, Activity creation once, remembered sign-in, Trips |
| Invalid creation | Invalid username, blank name, short password, absent/mismatched confirmation | Associated error, no account or Activity, instance stays fresh |
| Closed entry | Initialized `/setup` or `/sign-up` | Redirect `/sign-in`, no setup form; sign-in has no signup link |
| Old entry | Fresh `/sign-up` | Redirect `/setup` |
| Stale submit | Setup page open before another bootstrap completes | Existing transaction refuses creation; Setup is already complete. Sign in to continue. No setup-page sign-in link |
| Missing state/failure | Missing singleton or failed DB read | Never render setup form; missing state fails closed, DB error propagates |
| Concurrent bootstrap | Two valid first submissions | Existing lock yields exactly one admin |

</frozen-after-approval>

## Code Map

- `src/lib/instance-bootstrap.ts` owns transactional initialization; preserve its API and service tests.
- `src/app/(auth)/actions.ts` owns signUpAction, normalization, hashing, Activity and automatic sign-in. Rename to setupAdminAction with all consumers updated, no compatibility alias.
- `src/components/arrivo/auth-forms.tsx` has sign-in and signup forms, currently under 250 lines. Replace SignUpForm with AdminSetupForm; remove signup navigation. Keep file under 250 lines; explicit Props interfaces and use client retained.
- Auth pages live outside protected app layout. Add `/setup`; replace `/sign-up` with redirect; sign-in redirects fresh instances before rendering.
- `src/proxy.ts` intentionally has database-free JWT checks. Add `/setup` public route only.
- `tests/e2e/steps/instance-bootstrap.steps.ts` and feature exclusively own singleton mutation; reuse scenario-owned fixtures, never change global setup.

## Tasks & Acceptance

**Execution:**

- [x] Tests first: update `src/components/arrivo/auth-forms.test.tsx` for field order, required confirmation/autocomplete, accessible errors and no signup navigation; `src/app/(auth)/actions.test.ts` for required name/confirmation, mismatch, closed state and retained success/Activity; `src/proxy.test.ts` for public setup.
- [x] Add `src/lib/instance-setup.test.ts` alongside new server-only eligibility reader used by all three auth pages: fresh/initialized/missing/error. Add page tests beside `setup`, `sign-in`, `sign-up` pages verifying render and redirects with global navigation mock configured to throw per test where needed; no per-file navigation re-mock.
- [x] Expand `tests/e2e/features/instance-bootstrap.feature` and matching steps: root/sign-in fresh entry, welcome fields, desktop/mobile success, confirmation mismatch and missing/short password validation, initialized redirects and no signup links, legacy fresh redirect, stale open-form refusal, duplicate username. Preserve Activity and sign-back-in scenarios. Await mutation responses before reload where needed. Keep state-mutating cases in this feature only.
- [x] Run expanded targeted unit tests to establish failure, implement production changes, rerun targeted units and bootstrap E2E. Register all new source in `tests/e2e/feature-map.mjs`; run its contract tests. Parent runs final validator after all edits.
- [x] Update planning contract and self-hosting guide for first-run setup, preserving prior edits. Save approved course proposal and foundation follow-up entry; keep completed story history. Reserve separate future user setup URL.

**Acceptance Criteria:**

- Given fresh instance, when operator opens Arrivo on desktop or mobile, then welcome setup appears automatically and matching credentials create admin and open Trips.
- Given initialized instance, when visitor follows old signup or setup URL, then sign-in appears without signup advertising.
- Given invalid or stale setup submission, when submitted, then no extra account or creation event exists.

## Implementation Notes

User follow-up: focus Username when admin setup mounts; remove Already set up? text and sign-in link entirely. Tests first established failures before production edits. User directed positive behavior checks instead of absence checks for former UI: component and desktop/mobile browser tests assert Username focus; initialized-route tests assert sign-in destination. This user direction supersedes earlier sign-in-link acceptance and its historical width review finding.

Plan reviewed inline with plan-reviewer: scope, architecture, components, accessibility and test coverage. No blocking findings; page redirects must return immediately so nonthrowing global test mocks cannot expose guarded content. User approved course and requested implementation; no repeated approval needed.

Targeted runtime verification: 85 unit/contract tests and 19 bootstrap browser scenarios passed. Initial validator: lint, TypeScript, 4,997 tests with coverage thresholds, and production build passed; E2E stopped after independent review exposed shared-singleton interference. Bootstrap browser coverage must use an isolated database/server project while normal features keep four workers. Additional tests: `scripts/e2e-bootstrap.test.mjs`, `scripts/run-e2e.test.mjs`, and scenario-fixture project/database selection coverage. No production bypass or ordering workaround.

Ticket validation added explicit dependency on Activity producer story 2.3 and recorded historical closure exception; recheck passed.

## Plan Change Log

- Review follow-up: first-run eligibility makes ordinary sign-in requests read the singleton. Bootstrap scenarios therefore run in a dedicated Playwright project against a derived `_bootstrap` sibling of the configured E2E database, a separate app on port 3002, and `.next-e2e-bootstrap`. Normal Chromium excludes the bootstrap feature; bootstrap starts with empty browser state and no auth setup dependency. An automatic worker fixture selects the correct DB before scenario work. Runner validates derivation, creates the sibling only when missing, resets/migrates both E2E targets, and manages both ports with existing ownership checks. Global setup inserts only baseline admin and initialized singleton in each DB. Four-worker scheduling and scenario cleanup remain intact. Add helper/runner safety tests and fixture DB-selection self-test; require targeted bootstrap plus ordinary-auth concurrency coverage.

## Review Triage Log

- Harness follow-up also isolates bootstrap file storage in sibling `.e2e-bootstrap-storage`, ignored alongside its build cache. Runner integration tests inspect actual dual-port/dual-database preparation and Playwright project wiring. Windows npm/npx dispatch preserves grep expressions as literal process arguments. Targeted verification includes ordinary authentication, bootstrap scenarios and fixture self-tests together; final validator remains parent-owned.

- medium, patch: new sign-in eligibility reads instance state that bootstrap E2E resets while unrelated workers sign in. Isolate bootstrap project, app server and database; keep production eligibility and existing parallel scenario ownership.
- low, patch: setup form's Sign in link has height 44px but text width below 44px. Add explicit minimum width and matching component assertion.

Initial implementation verification: lint PASS (one pre-existing unused-variable warning), TypeScript PASS, coverage PASS (316 files / 5,019 tests; lines 97.09%, functions 96.91%, branches 91.99%), production build PASS (dynamic setup route), affected E2E PASS (379 checks). Failed tooling workers were corrected and rerun; all checks passed. Independent quick review after isolation fixes: no findings. Matrix audit: every row covered by passing targeted units/browser scenarios; concurrency coverage retained. Final plan-reviewer checks passed across scope, architecture, components, accessibility and tests. No deferred findings, commits or pushes.

## Verification

- Targeted Vitest files listed above plus `src/lib/instance-bootstrap.test.ts` and `scripts/feature-map.test.mjs` must pass.
- Targeted bootstrap Playwright scenarios must pass; parent runs build-validator afterward.

Follow-up verification: 18 component tests and 18 bootstrap browser scenarios passed. Final validator: lint, TypeScript, production build and all 5,019 unit tests passed; coverage lines 97.14%, functions 96.91%, branches 92.01%. Broad affected E2E had 377 passes and two unchanged mobile-scenario failures (transient retention target measurement and toast-intercepted Profile click); both passed targeted retry (3 checks including auth setup). All 379 broad checks covered successfully after retry. No absence assertions for removed setup/sign-in copy; tests assert focus and routing. No commits or pushes.

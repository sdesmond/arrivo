---
title: "Integrated onboarding E2E suite"
type: "chore"
ticket: "10"
created: "2026-10-28"
status: done
baseline_revision: "1d384bf526db92099ebe1a997bced75343c04a17"
route: "full"
route_source: "auto"
risk: "low"
review: "quick"
review_source: "pinned"
lenses_ran: ["quick"]
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Onboarding has feature-level tests, but no integrated proof from Add User issuance to recipient completion and no complete setup-only isolation matrix. Activity's producer inventory also omits onboarding producers.

**Approach:** Add scenario-owned pending-user fixtures and an integrated browser suite closing CAP-2/CAP-3 gaps while retaining existing lifecycle coverage. Register the suite and document actual Activity producers.

## Boundaries & Constraints

**Always:** Use Object Mothers, scenario-owned users/trips/files and cleanup. Exercise real HTTP entry points, including a real captured server-action request; prove tested storage and feeds work for an authorized account before checking denial. Keep credential values only in memory, disable credential-bearing artifact capture, and use boolean assertions/safe errors that cannot echo tokens or URLs. Preserve bootstrap closure and account ID. Await mutation POSTs before reloads.

**Never:** Add permanent fixture rows, global reseeding, execution ordering, production auth bypasses, a new credential route, or unrelated production changes. Do not suppress shared feature-map scope to avoid validation. User explicitly requested branching from current branch; preserve that base rather than ticket notes' older integration-branch instruction. No push authorization supplied.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Add and complete | Admin-created pending account | Fixed username, required Name/password/confirmation, mandatory dialog, same account signs in only after save; link consumed | Invalid fields preserve pending state |
| Setup-only access | Valid setup cookie, no ordinary session | Routes, real action, real storage object, user feed and trip feed refused; no data or mutation | Assert redirect/refusal and unchanged DB |
| Replace / expire / delete | Unfinished account's link or held context | Same account ID on replacement, fresh 24 hours; stale/expired/deleted links refuse entry; valid reopen retains expiry | Generic unavailable surface |
| Closed bootstrap | Add User on initialized instance | Both /setup and /sign-up lead to sign-in with no signup link | Pending account remains unchanged |
| Duplicate username | Existing normalized username | No duplicate account or extra issuance | Taken-username error |

</intent-contract>

## Code Map

- `tests/e2e/features/account-setup.feature`, `steps/account-setup.steps.ts` — existing mandatory-dialog, completion, replay, validation, resume, concurrency and wrong-account coverage. Current isolation tests use only /trips, a nonexistent storage key and user feed.
- `tests/e2e/features/setup-link-regeneration.feature`, `steps/setup-link-regeneration.steps.ts` — replacement/expiry, stale rows, rollback and locks. Shared pending-target step also serves unfinished-account-deletion tests. Previous plan records browser setup failures; investigate before accepting suite pass.
- `tests/e2e/steps/add-user-dialog.steps.ts` — real Add User gestures, cleanup and normalized duplicate checks; reuse when suitable.
- `tests/e2e/e2e-seed-data.ts`, `scenario-fixture.ts`, `scenario-fixture.spec.ts` — mother cloning/materialization/cleanup; setupComplete:false already creates a passwordless account.
- `tests/e2e/server-action.ts` — mutation response barrier. Capture a real action from authorized browser and replay its action ID/body using only setup cookies, then verify refusal and no mutation.
- `src/app/api/storage/`, `src/app/api/users/me/events/route.ts`, `src/app/api/trips/[tripId]/events/route.ts` — HTTP isolation surfaces. Existing storage adapter and E2E storage helpers own test object lifecycle; never use a nonexistent key as proof.
- `src/lib/account-setup-session.ts` — setup cookie is separate from Auth.js; invalid exchanges count a shared IP throttle. Synthetic scenario client addresses may isolate independent browser clients through existing trusted proxy headers; retain throttling tests and do not clear shared throttle records.
- `tests/e2e/feature-map.mjs` — add integrated suite entry for onboarding source owners; shared mother/map changes legitimately select broad affected scope.
- `_bmad-output/initiative-self-hosted-administration/epic-activity-and-retention/activity-producer-inventory.md` — append actual onboarding event owners, boundaries and payload restrictions.

## Tasks & Acceptance

**Execution:**

- [x] Start with `tests/e2e/features/integrated-onboarding.feature` and `tests/e2e/steps/integrated-onboarding.steps.ts`: Add User-to-recipient completion, duplicate prevention, post-add bootstrap closure, full isolation matrix and CAP-3 UI lifecycle gaps. Reuse existing covered scenarios rather than mechanically duplicate all cases.
- [x] Update `tests/e2e/scenario-fixture.spec.ts` before `tests/e2e/e2e-seed-data.ts`: named pending-user mother clones independently, materializes no password and cleans up. Reuse mother in new scenarios and existing pending setup/regeneration steps where needed.
- [x] Keep any complex integration helpers under `tests/e2e/` with registered cleanup and closed browser contexts. Set credential scenarios' traces/screenshots/video off and sanitize navigation failures/assertions; no credential URLs in command output or artifacts.
- [x] Run account setup, Add User, regeneration and unfinished deletion scenarios together; diagnose known baseline failures and fix scenario isolation if confirmed without weakening assertions.
- [x] Register suite in `tests/e2e/feature-map.mjs` and update producer inventory after checking actual action owners/types.

**Acceptance Criteria:**

- Given an initialized instance, when admin adds a user and recipient completes setup, then Users and authenticated recipient identify the same unique account, credentials work on fresh sign-in and used link refuses access.
- Given only a valid setup context, when requests target app routes, a valid protected action, existing uploaded file and both live feeds, then every surface refuses access, no protected data is returned and action changes no rows.
- Given an admin-added unfinished account, when bootstrap entries are opened, then both remain closed and sign-in offers no signup navigation.
- Given pending/expired/deleted/replaced/resumed links, when their browser flows run alongside existing onboarding features, then CAP-3 outcomes pass with scenario-owned fixtures and original identity/expiry where applicable.
- Given suite execution, when reports and artifacts are inspected, then no raw setup token or credential URL appears and feature-map contract passes.

## Implementation Notes

Full route: estimated 300–500 changed lines across browser steps, feature, fixture tests, mother, map and inventory. No production runtime change expected; no unit/component changes required unless investigation proves a runtime defect.

## Plan Change Log

- Browser isolation: independent setup clients use existing trusted proxy headers, preventing unrelated invalid-link cases from sharing an IP throttle budget; no throttle records are cleared. Pending fixtures navigate away from authenticated pages before clearing cookies so in-flight session refreshes cannot restore ordinary sessions.

## Review Triage Log

### 2026-10-28 — Review pass

- verdicts: 1 findings — high 0, medium 1, low 0, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Catching `page.goto` errors does not stop Playwright recording raw credential URLs in API report steps (independent of trace/video) — Verified with real report probes. Fixed: `tests/e2e/onboarding-browser.ts` wraps navigation and credential exchange in Playwright's internal `_wrapApiCall(..., { internal: true })`; new `exchangeCredentialLink` replaces the raw exchange request in account-setup steps; safe generic errors kept; synthetic IPv6 corrected to `2001:db8::…`; new `tests/e2e/onboarding-browser.test.ts` registered in `vitest.config.mts`. Evidence: 3 probes (success, navigation failure, exchange failure) and HTML/JSON/blob/decompressed-blob scans found zero raw credential matches.

## Verification

- `npx vitest run tests/e2e/onboarding-browser.test.ts scripts/feature-map.test.mjs scripts/affected-e2e.test.mjs` — PASS, 27 tests (helper 3, map and scope contracts 24).
- `node scripts/run-e2e.mjs --server=kill "--grep=E2E scenario fixtures|@feat:(integrated-onboarding|account-setup|add-user-dialog|setup-link-regeneration|unfinished-account-deletion)"` — PASS, 58 tests after the review patch (48.3s). One earlier run failed `add-user-dialog` "Mobile creation clears one-time result" (file untouched by this change); it passed alone and on the full rerun, so treated as a load flake.
- Command correction: contract tests use Vitest, not Node's test runner. The E2E wrapper accepts `--grep=<pattern>` and no `--project` option.
- Targeted ESLint and TypeScript passed before the review patch; credential artifact scans found zero raw credential URLs and no trace/screenshot/video files.
- build-validator (root-owned): LINT PASS, TSC PASS, BUILD PASS. Coverage PASS after a one-line fix (5269 tests; lines 97.31%, branches 92.42%, functions 96.94%). Affected E2E scope was `full` (shared mother/map/config changes): first run 437/440 with three load flakes (`dashboard-live-sync`, `trip-live-refresh`, `trips` transit mode) that pass in isolation (9/9); solo rerun 440/440.
- Coverage failure found by the validator: `add-user-dialog.test.tsx` "keeps creation locked after failed checking…" failed reproducibly under coverage (and when run without this change's new test file) because `findByRole` resolved while "Retry creation" was still disabled. Pre-existing race, fixed by awaiting `waitFor(... toBeEnabled())` in a separate test-only commit.

## Auto Run Result

- Summary: five integrated onboarding E2E scenarios (Add User to recipient setup to fresh sign-in; normalized duplicate rejection and closed `/setup` and `/sign-up`; setup-only isolation across routes, server-action POST, PDF and live feeds; held context expiry; deleted-account link refusal), a named pending-user mother with clone/materialization/cleanup tests, and credential-safe browser helpers. No production runtime changes.
- Files changed: `tests/e2e/features/integrated-onboarding.feature` and `steps/integrated-onboarding.steps.ts` (new scenarios); `tests/e2e/onboarding-browser.ts` and `.test.ts` (credential-safe navigation/exchange helpers); `tests/e2e/e2e-seed-data.ts`, `scenario-fixture.spec.ts` (pending-user mother and tests); `steps/account-setup`, `setup-link-regeneration`, `unfinished-account-deletion` (reuse mother, independent client IPs); `tests/e2e/feature-map.mjs`; `playwright.config.ts` (captures and failure snapshots off); `vitest.config.mts` (register helper test); Activity producer inventory; `add-user-dialog.test.tsx` (race fix).
- Review findings: 1 patch applied (medium: Playwright API-report steps recorded credential URLs); 0 deferred; 0 rejected.
- Follow-up review recommendation: false (one medium patched, verified by report probes).
- Verification: see Verification section; all five validator checks pass.
- Residual risks: relies on Playwright's internal `_wrapApiCall`, which may change on upgrade; the helper unit tests and report probes would need rerunning. E2E load flakes seen when the suite shares the machine with coverage and build.

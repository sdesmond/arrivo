# Ticket status audit — 2026-10-30

At the user's request, checked all 35 planned leaves against current code, tests, merged history and verification records. No implementation gap was identified. Retained the 28 existing done states, including separately verified 4.1; marked 1.8 and 4.2–4.7 done through `tickets.py mark`.

## Completion evidence

- **1.8:** PR #350 (`c99d9520`); guarded first-run setup, transactional singleton bootstrap, required matching passwords, Activity and desktop/mobile entry coverage.
- **4.2:** PR #370 (`c8449ab6`); stable account/trip locks, serialized membership writers and explicit self-service transfer/delete outcomes; 15 deletion concurrency scenarios.
- **4.3:** PR #371 (`3e296391`); locked authority checks, private aggregate preview, fingerprint recheck, deterministic succession and isolated post-commit effects.
- **4.4:** PR #372 (`c0d93b1f`); explicit trusted origin, completed-admin eligibility, one-hour hash-only recovery issuance and best-effort operator Activity.
- **4.5:** PR #373 (`f8a41b26`); isolated browser recovery, authorization-scoped pending MFA, atomic credential replacement/revocation, show-once codes, CLI packaging and removal of immediate MFA reset.
- **4.6:** `eac1acec`; stale sign-out/device-removal requests recheck security version under account lock. Its plan records clean lint, TypeScript, build, 5,571 unit tests and 495 affected E2E checks.
- **4.7:** `0895b94d`; scenario-owned integrated browser tests prove live-session and cross-purpose link revocation, succession and secret-free Activity. Recorded review has no accepted outstanding findings.

Already-done foundation, Activity/retention and onboarding tickets have matching implementation, tests and merged history. Onboarding's closing plan records clean validation with 5,269 unit tests and 440 affected E2E checks, superseding earlier failures.

## Fresh verification

- Targeted Vitest: nine files, 164 tests passed for deletion/effects, recovery issuance/completion/context, bootstrap/setup and feature-map/affected-suite selection.
- `node scripts/run-e2e.mjs --server=kill "--grep=@feat:(app-bootstrap|deletion-concurrency|admin-account-deletion|admin-recovery-issuance|admin-recovery-completion)"`: 64 passed; command exited 0. Teardown also emitted `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`; this does not establish warning-free teardown.
- Immediately preceding 4.1 audit on unchanged runtime code: 405 targeted unit/component tests and 13 reset/integrated browser checks passed with successful exits, including both 4.6 races and all three 4.7 scenarios.

This audit changes ticket metadata only; no new production change or full-suite E2E run. Historical Auto Run Result sections remain as execution history; current plan frontmatter holds ticket state.

## Metadata and boundaries

- Removed resolved password-policy question from 3.5 and recorded its existing decision.
- Removed empty ticket identities from three historical initiative-root plans. The first-run plan remains in place, linked by 1.8's state companion; the other two artifacts do not identify board tickets.
- Preserved 1.8's dependency on 2.3 and historical epic order. The foundation epic's existing 2026-10-29 Decision explicitly accepts this resolved exception; raw board dependency diagnostics still report it.
- Leaf completion does not close containers. Epic 5, Instance overview, remains an unsliced envelope; 35 done leaves do not mean the full initiative is complete.

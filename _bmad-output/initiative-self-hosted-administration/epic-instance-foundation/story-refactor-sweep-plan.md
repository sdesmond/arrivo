---
title: "Refactor sweep"
type: "refactor"
ticket: "6"
created: "2026-10-25"
status: done
baseline_revision: "1ab1dee726696cfd97f4151dea4d7d31d900804c"
route: "oneshot"
route_source: "auto"
risk: "low"
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Foundation code still declares bootstrap account input/result types outside the canonical domain module and compares admin authority against a role literal. Prior review fixes are already present; these are the remaining small convention inconsistencies found by this sweep.

**Approach:** Move `BootstrapAccountValues` and `BootstrapResult` to `src/data/types.ts`, import them directly into the bootstrap service and its tests, and use `UserRole.Admin` in the authority reader and its test fixtures. Keep transaction-capability types local. Preserve all runtime outcomes, locking, queries, and public UI behavior; add no compatibility re-exports, features, migration changes, or shared concurrency abstractions.

</frozen-after-approval>

## Implementation Notes

Oneshot: fewer than 50 changed lines across two services, their matching tests, and the domain module. This is type relocation and a same-value constant substitution, with no runtime branch change; test-first updates establish canonical type imports and role fixtures before service edits. Preserve bootstrap first-account creation, concurrent winner, closed/missing singleton, and unique-violation rollback tests; preserve authority admin/member/unknown/missing-user and demotion coverage.

Investigation checked all five predecessor plans and current implementations. Existing concurrency gate steps remain explicit because their blocking/release safeguards are already correct. The deferred real-Postgres migration 0004 zero/one/multiple-legacy-user verification remains recorded in the initiative deferred-work file; it is separate verification work, not a behavior-preserving refactor.

- Plan-reviewer: all five checks passed with no findings. Updated the two matching test files before service edits; no runtime branches or E2E scenarios changed.

## Plan Change Log

## Review Triage Log

Quick lens: no findings; no new deferrals.

## Verification

- `npx vitest run src/lib/instance-bootstrap.test.ts src/lib/instance-roles.test.ts` — existing outcomes pass with canonical domain imports.
- `npx tsc --noEmit` — relocated type consumers compile; no old type definitions or re-export shims remain.
- Repository-owned `build-validator` after targeted tests and review — lint, TypeScript, coverage, affected E2E, production build pass. Shared type changes may select the full affected scope; use the affected runner only.





**Results:** Nine targeted tests passed; TypeScript passed. Final build-validator run passed lint, types, 4,692 unit tests (96.98% lines, 96.79% functions, 91.76% branches), 301 affected E2E tests, and production build (16 static pages). First E2E run passed 300 tests and failed an unrelated Notes responsive geometry assertion; that scenario passed a focused rerun and the full affected rerun. No Notes code changed.

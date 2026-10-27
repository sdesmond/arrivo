---
title: "Refactor sweep"
type: "refactor"
ticket: "9"
created: "2026-10-26"
status: built
baseline_revision: "13a7394e1a3c6547ab049a143204a6351d325585"
route: "oneshot"
route_source: "auto"
risk: "low"
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Activity code repeats one timeout-race idiom (timer, reject, race, clear) in the recorder and in the trip actor lookup, and the admin Activity action and page each import from `@/data/types` in two statements. Remaining deferred review findings (real-Postgres read-service test, merged-row admin E2E) add verification, not cleanup, so they stay outside this sweep.

**Approach:** Extract one `withTimeout` helper in `src/lib/activity.ts`, use it in `persist` and in the trip actor lookup, and merge the split type imports. Preserve timeouts, late-rejection swallowing, logging, locking, queries and all UI behavior; add no features, migrations, compat shims or new abstractions beyond the helper.

</intent-contract>

## Implementation Notes

Oneshot: about 60 changed lines across `activity.ts`, `trip-activity.ts`, new `with-timeout.ts`, two import blocks and tests. Behavior-preserving extraction; tests first. Add `withTimeout` cases in `src/lib/with-timeout.test.ts` (resolves, rejects with the message after the timer, clears the timer, swallows a late rejection) then refactor. Existing timeout tests in `activity.test.ts` and `trip-activity.test.ts` must pass unchanged. Import merges in `src/app/(app)/admin/activity/actions.ts` and `page.tsx` are covered by `actions.test.ts`; no runtime branch changes, no E2E scenario changes.

- Surprise: `trip-activity.test.ts` mocks `@/lib/activity` wholesale, so the helper lives in its own `src/lib/with-timeout.ts` (+ colocated test) instead of `activity.ts` as the contract said (location only; behavior unchanged). Targeted tests (72), `tsc` and ESLint pass.

## Plan Change Log

## Review Triage Log

### 2026-10-26 — Review pass

- verdicts: 4 findings — high 0, medium 0, low 2, false 2, maybe-false 0
- findings:
  - `[low]` `reject` Helper lives in `with-timeout.ts`, contract names `activity.ts` — documented deviation; `trip-activity.test.ts` mocks `@/lib/activity` wholesale; fix would edit the plan.
  - `[false]` `reject` Work expression now built before the timer starts — synchronous throws still hit the callers' try/catch, no timer exists to leak.
  - `[low]` `reject` Late-rejection test lacks explicit assertion — Vitest fails the run on unhandled rejection (seen earlier when the helper was absent); extra guard adds complexity.
  - `[false]` `reject` `activity.test.ts` modified — diff shows no change; only a line-ending warning.

## Verification

**Commands:**

- `npx vitest run src/lib/activity.test.ts src/lib/trip-activity.test.ts "src/app/(app)/admin/activity/actions.test.ts"` -- expected: pass
- `npx tsc --noEmit` -- expected: no errors
- `build-validator` after targeted tests and review -- expected: lint, types, coverage, build, affected E2E pass

## Auto Run Result

- Summary: extracted `withTimeout` shared by the Activity recorder and trip actor lookup; merged split `@/data/types` imports in the admin Activity action and page. No behavior change.
- Files: `src/lib/with-timeout.ts` (+ test) new helper; `src/lib/activity.ts`, `src/lib/trip-activity.ts` use it; `src/app/(app)/admin/activity/actions.ts`, `page.tsx` merged imports.
- Review: patches 0, deferred 0, rejected 4 (reasons in triage log). Follow-up review recommended: false.
- Verification: 72 targeted Vitest tests pass; `tsc --noEmit` clean; ESLint clean on touched files. `build-validator` not run here (owned by the user-level gate per AGENTS.md).
- Residual risk: low; coverage/E2E gate still pending.

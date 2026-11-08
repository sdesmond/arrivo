---
title: "Preserve optimistic state and serialize rapid writes"
type: feature
ticket: 3
created: "2026-11-08"
status: built
baseline_revision: "1f387cf89f93a6283cbdc2ca99360bb164614026"
route: full
route_source: auto
risk: high
review: thorough
review_source: auto
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context: [docs/plans/mobile-api.md, _bmad-output/initiative-mobile-api/AGENTS.md]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The checked-state toggle derives its next value from server props and fires unordered requests, so rapid clicks resend the same value, the checkbox snaps back until refresh lands, and a failed write leaves no recovery path.

**Approach:** Extend `useApiMutation` with per-resource FIFO queuing (through refresh) and add a checklist adapter that keeps the user's intended absolute state visible until refreshed server data lands, rolls back on failure, and leaves independent resources concurrent.

## Boundaries & Constraints

**Always:** Branch `story/1-3-optimistic-serialized-writes`; PR base `feature/api-v1`. Every queued write sends an absolute value derived from the currently displayed (optimistic) state. Same-resource writes run FIFO, each starting after the prior request and its refresh settle. Different resources never wait on each other. A failed write never blocks later queued writes. Keep existing auth/enrollment navigation, field errors, toasts, labels, focus, 44×44px targets, completion indicator and collapse behavior. Hook stays generic for later endpoints.

**Never:** New endpoints, replay/idempotency-key sending, client retries, or migration of other checklist writes (stories 1.5–1.7). No new props through the callback chain (`trip-itinerary-view`, `trip-detail-tab-body`, `day-card*`). No unrelated UI refactors, schema or env changes, or full E2E auto-run.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Rapid same item | 3 clicks while requests/refresh are slow | UI shows each click immediately, never snaps back; requests send true,false,true in order, one at a time; reload shows final value | No error expected |
| Independent items | Click items A and B while A is slow | B's request starts without waiting for A | No error expected |
| Refresh pending | Newer click after earlier success, earlier refresh not landed | Intended value stays; stale refreshed props do not overwrite it | No error expected |
| Final write fails | Last queued write rejects | Item reverts to server state; error toast | Toast message from `ApiClientError` or generic |
| Middle write fails | Write 2 of 3 rejects | Write 3 still runs and its absolute value wins; no revert | Toast; queue continues |
| Auth lost | 401 or `mfa_enrollment_required` | Navigate once; remaining queued writes for the session are skipped; overrides cleared | Existing navigation |

</frozen-after-approval>

## Code Map

- `src/lib/api/use-api-mutation.ts` -- `startTransition` + `api()` + `router.refresh()`, no queue; add keyed FIFO chain (ref `Map<key, Promise>`), settle signal after refresh, result/failure callbacks. Tests in `use-api-mutation.test.tsx` (mocks `./client`, `sonner`, `navigation`).
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts:88,249` -- `handleToggleChecklistItem` calls `mutate` directly; prefer extracting a `use-checklist-handlers.ts` beside it (epic boundary) and composing it here; file is 347 lines.
- `src/components/arrivo/checklist-item-row.tsx:44` -- sends `!item.isChecked` from props; stays unchanged if overrides are merged into `days` upstream.
- `src/app/(app)/trips/[tripId]/page-client.tsx:99-102,294` -- `useTripDetailHandlers(detail)`, `days` destructured and passed down (385 lines; add no JSX).
- `src/lib/api/contract/checklists.ts` -- `updateChecklistItem` endpoint, reuse as is. `src/lib/api/client.ts` -- `ApiClientError`; reuse.
- `tests/e2e/api-response.ts` + `features/day-planning.feature:50` + `steps/day-planning.steps.ts:578` -- existing PATCH wait; extend. `tests/e2e/feature-map.mjs:461` lists the handlers file; `src/lib/api/**` is shared (full affected suite).

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/api/use-api-mutation.test.tsx` then `use-api-mutation.ts` -- keyed FIFO through refresh, unrelated-key concurrency, failure recovery, skip-after-auth-loss, delayed refresh, unmount safety -- core of P5
- [x] `src/app/(app)/trips/[tripId]/use-checklist-handlers.test.tsx` then `use-checklist-handlers.ts` (`"use client"`) -- intended-state overlay merged into `days`, toggle derives from overlay, clear on settle or rollback on final failure -- optimistic continuity
- [x] `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx` and `.ts`, `page-client.test.tsx` and `.tsx` -- compose the hook, apply merged `days`; drop inline toggle mutation -- wiring
- [x] `tests/e2e/features/day-planning.feature`, `steps/day-planning.steps.ts` (+ `api-response.ts`/`.test.ts` if multi-response waits are needed) -- delayed-network scenarios (observe request order/overlap via `page.route` timestamps or `page.on("request")`): rapid toggles survive reload with FIFO order, independent items concurrent, failed request recovers -- P9 regression
- [x] `tests/e2e/feature-map.mjs`, `scripts/feature-map.test.mjs` -- classify new hook files; keep day-planning mapping

**Acceptance Criteria:**

- Given slow PATCH and refresh, when one item is clicked repeatedly, then the checkbox never reverts and the final intent persists after reload.
- Given a failed final write, when the request rejects, then the item reverts, a toast shows, and the next click succeeds.

## Design Notes

Overlay entry per item holds the last enqueued intent; it clears when the item's queue is drained and the final refresh settles (props match is an early clear). Verify against `node_modules/next/dist/docs` whether `router.refresh()` inside a transition keeps it pending until data lands; if not, signal settle from props change.

## Verification

**Commands:**

- `npx vitest run src/lib/api src/app/(app)/trips/[tripId] scripts/feature-map.test.mjs` -- expected: pass
- `npm run test:e2e:affected` -- expected: day-planning, api features pass

## Review Triage Log

| Finding | Verdict | Evidence and route |
| --- | --- | --- |
| Blind 1: stale validation errors after queued success | medium | Errors clear only at enqueue, before predecessor fails. Move clearing into guarded run; patch. |
| Blind 2: throwing settlement callback blocks cleanup | false | Actual adapter settlement callbacks only update refs/state; no throwing callback exists in runtime callers. Hypothetical caller exception does not establish reachable failure. |
| Blind 3: ignored absolute callback argument | false | Frozen constraint requires deriving each write from current optimistic UI. All runtime calls originate in checkbox gestures; no repeated absolute-command caller exists. |
| Blind 4: cloning overlay loses reference stability | low | Cloning adds allocation but no measured regression or memoized-consumer failure established. Reject added memoization complexity for negligible unproven harm. |
| Blind 5: no browser test of independent refresh follow-up | false | Requirement permits hook/component evidence; passing B2 suspended-refresh regression exercises exact ordering, with browser coverage of concurrent requests. |
| Blind 6: no three-write browser middle-failure scenario | false | Passing generic middle-failure test plus adapter revision test prove matrix row; browser scenario proves actual rollback/recovery/persistence. No requirement for every matrix row in E2E. |
| Blind 7: completion/collapse coverage missing | false | Existing checklist component tests cover completion auto-collapse and draft exception; existing day-planning checklist scenario covers completion/collapse/reload. New tests isolate rapid repeated gestures with another item present. |
| Blind 8: adapter and queue never integrated in tests | false | Handler tests use real composed hooks and mock API transport; page forwarding and gated RSC browser tests additionally exercise integration. Claim that every layer is mocked is false. |
| Edge 1: stale validation errors | medium | Same verified defect as Blind 1; same patch. |
| Edge 2: generic fallback shares transition | false | Only keyed runtime consumer is checklist adapter, which supplies per-item committed-props signals. Regression proves B2 progresses while A refresh is pending. No runtime keyed caller lacks signal. |
| Intent 1: gesture versus absolute-command reading | false | Frozen Always constraint resolves reading to current optimistic UI; checkbox is only runtime source. No absolute command API changed. |
| Intent 2: transition completion fallback | false | Refresh may contain external conflicting edits, so matching boolean cannot be sole completion proof. Transition commit is tested with Suspense and real gated RSC E2E; no premature release shown. |
| Intent 3: independence tested at different surfaces | false | Hook B2 test directly proves independent settlement; browser covers independent first PATCH and gated same-resource refresh. Layered verification satisfies intent. |
| Intent 4: queues scoped to one hook instance | false | Each trip page owns one adapter; no duplicate runtime hook instances write same item. Cross-instance/global locking is not required by this feature. |
| Intent 5: failure recovery across test layers | false | Generic middle-failure, adapter revision ownership, and browser final failure/recovery together cover intended outcomes. No conflicting outcome established. |

Verification-gap lens reported no gaps. All four lenses completed. No deferred findings.

## Implementation Evidence

- Generic keyed FIFO chains wait through refresh. Per-mutation `waitForRefresh` acknowledgments let independent resources release without waiting for coalesced transitions; transition commit remains fallback for externally conflicting data.
- Checklist acknowledgments require a new committed server-days identity after request success. Revision ownership retains newer optimistic intent through older settlements and failures.
- Targeted scope passed 557 tests before final independence refinements; final affected four hook/page suites passed 128 tests. Final mutation suite passed 16 tests, including review regression that failed before patch.
- Matrix audit: rapid absolute-state test and gated FIFO E2E; independent requests E2E and B2 suspended-refresh unit regression; delayed-refresh/stale-props tests; rollback/recovery E2E; middle-failure queue plus revision-ownership tests; parameterized 401/MFA and all-overlay cancellation tests. Every row has passing executed coverage.
- Thorough review: all four lenses completed; one shared stale-field-errors defect patched and retested; no deferred findings.

## Final Validation

- Lint, TypeScript, production build: PASS. TypeScript rerun after generated-type race passed; build generated 18/18 static pages.
- Coverage: 408 files, 6765 tests passed; lines 97.64%, functions 97.18%, branches 93.28%.
- Affected E2E selector expanded shared API-hook change to full scope: 591 checks passed, 0 failed (13.1 minutes). Invoked affected command only.
- All execution tasks complete; no deferred review findings.

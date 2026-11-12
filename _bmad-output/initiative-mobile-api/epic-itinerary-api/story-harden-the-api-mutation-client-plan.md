---
title: "Harden the API mutation client"
type: "feature"
ticket: "2"
created: "2026-11-10"
status: done
baseline_revision: "2a216e5860cd93f1f49ff3ac886842c0d1e3cabe"
route: "full"
route_source: "auto"
risk: "medium"
review: "thorough"
review_source: "auto"
lenses_ran: ["blind-hunter", "edge-case-hunter", "verification-gap", "intent-alignment"]
review_loop_iteration: 0
context: ["{project-root}/_bmad-output/initiative-mobile-api/AGENTS.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The web API client has no request timeout, so one hung write stalls its keyed queue and keeps `isPending` true (retro F-2). `useApiMutation` also clears one hook-wide `fields` on every run, so a concurrent write wipes another resource's field errors, and it toasts "Could not save changes" when `onSuccess` throws after the write committed (F-6). A same-value `PATCH /checklist-items/:id` still marks changed and publishes activity and live-sync effects (F-4).

**Approach:** Add a 30 s timeout in `api()` that fails as `ApiClientError(0, "timeout", …)`, key field errors by resource key, report post-commit callback errors without a failure toast, and make the item PATCH skip write and effects when nothing differs. Branch `story/2-2-harden-api-mutation-client` from `feature/api-v1`; PR base `feature/api-v1`; switch back to `feature/api-v1` after the PR.

## Boundaries & Constraints

**Always:** Tests first. A timed-out write fails like any other failure (toast, `onError`, `onSettled`), so the next write on the same key runs. A timed-out write may have committed; the client does not retry it. Field errors for a key are cleared only by the next write on that key. A failure of `onSuccess`, `waitForRefresh` or the refresh after a committed write is logged with `console.error`, never toasted and never `onError`. The no-op check compares the parsed patch with the stored row inside the trip lock; the response is still 200 with the stored item.

**Never:** Add retries, abort-on-unmount, per-call timeout options, or a `ConflictError`/server change beyond `updateChecklistItem`. Do not change `src/lib/validation-schemas.ts`, add migrations, or edit `CHANGELOG.md`. No client UUIDs (entry 3), no new routes. No push or PR without user confirmation.

## I/O & Edge-Case Matrix

| Scenario                  | Input / State                                              | Expected Output / Behavior                                                  | Error Handling                      |
| ------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------- |
| Hung request              | `fetch` never settles for 30 s                             | `api()` rejects `ApiClientError(0, "timeout", "The request timed out. Try again.")`; fetch aborted | Hook toasts, runs `onError`, queue moves on |
| Hung body read            | headers arrive, `response.json()` hangs                    | Same timeout error; timer cleared once the body is read                     | —                                   |
| Fast response             | resolves before 30 s                                       | Result returned; no timer left running                                      | —                                   |
| Concurrent keyed writes   | key A fails 422 with fields; key B starts and succeeds     | `fields` still holds A's errors; B's entry is empty                         | —                                   |
| Same key retried          | key A fails with fields, next write on A starts            | A's entry cleared when that write starts                                    | —                                   |
| `onSuccess` throws        | write committed, callback throws                           | Refresh still runs; `console.error`; no toast, no `onError`; `onSettled` runs | —                                   |
| Same-value item PATCH     | `{ content: "Boots" }` on item already "Boots", or `{}`    | 200 stored item; no UPDATE; no `afterTripWrite`                             | —                                   |
| Mixed item PATCH          | `{ content: "Boots", isChecked: true }`, only one differs  | Both set as sent (existing allow-list); effects once                        | —                                   |
| Missing item              | item deleted before the locked read                        | No write                                                                    | 404 via `TripNotFoundError`         |

</frozen-after-approval>

## Code Map

- `src/lib/api/client.ts:16-63` -- `api()`: `fetch` has no signal. Add `AbortController` + 30 s timer (exported `REQUEST_TIMEOUT_MS`), cleared in `finally` after the body is parsed; map an abort at fetch or body read to the timeout error; keep the `network_error` path for other failures.
- `src/lib/api/use-api-mutation.ts:24,63,86,120` -- hook-wide `fields` state: change to `Record<string, Record<string, string[]>>` keyed by `options.key ?? ""`; clear only that key at run start, set only that key on `ApiClientError`. Nobody outside tests reads `fields`.
- `src/lib/api/use-api-mutation.ts:64-82` -- post-commit block (`onSuccess`, `waitForRefresh`, `startTransition(router.refresh)`, wait): wrap in its own try/catch so errors there reach `console.error`, not the outer catch that toasts. Keep `finally` bookkeeping and `refreshWaiters` cleanup.
- `src/lib/services/checklists.ts:356-389` -- `updateChecklistItem`: replace the empty-patch branch with "read current; if every supplied key equals the stored value, return `dbChecklistItemToType(current)`". `updateChecklistTitle` (:261) is the pattern. `markChanged` only on UPDATE.
- `src/lib/services/checklists.test.ts:96-102,1219-1268` -- top-of-file `it.each` and the content tests assume a write; the select mock must now serve the item row (`items`/`storedItem` as at :1233) before the UPDATE branch, and values must differ from the stored row.
- `src/lib/api/client.test.ts`, `src/lib/api/use-api-mutation.test.tsx` -- existing tests mock `fetch`/`api`; `result.current.fields` assertions at :51 and :319 change shape. The hook test mocks `./client` `api`; use the original for the timeout test.
- `tests/e2e/feature-map.mjs:759-760` -- `src/lib/api/**` is a `SHARED_GLOBS` entry, so editing `client.ts` or `use-api-mutation.ts` makes `affected-e2e.mjs` select the full suite (retro F-P3). Leave as is; both files serve every UI mutation.

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/api/client.test.ts` then `client.ts` -- fake timers: hung fetch and hung `json()` reject with `code: "timeout"` after 30 s and abort the signal; fast response leaves no timer; network failure stays `network_error`.
- [x] `src/lib/api/use-api-mutation.test.tsx` then `use-api-mutation.ts` -- timed-out write fails and the next same-key write runs; two keys keep separate `fields`; same-key run clears its own entry; throwing `onSuccess` still refreshes, logs, no toast/`onError`; update the two existing `fields` assertions.
- [x] `src/lib/services/checklists.test.ts` then `checklists.ts` -- same-value content, same-value `isChecked`, and `{}` write nothing and skip `afterTripWrite`; a differing field writes and publishes once; vanished item still 404.
- [x] `tests/e2e/features/api.feature` + `steps/api.steps.ts` -- new step after the existing item-patch scenario (`api.feature:200`): resend the same content and checked state, expect 200 and an unchanged item after reload.

**Acceptance Criteria:**

- Given a hung write on key K, when 30 s pass, then the user sees a failure toast and the next write on K reaches `fetch`.
- Given a failed write on one item and a successful concurrent write on another, when both settle, then the failed item's field errors remain.
- Given a committed write whose `onSuccess` throws, when it settles, then no failure toast shows and the list refreshes.
- Given a same-value item PATCH, when it runs, then no activity row or live-sync event is produced (`afterTripWrite` not called).
- Given the change set, when `scripts/affected-e2e.mjs` runs, then it selects the E2E features the change maps to (it chose `api`, `day-planning`, `packing-lists`, `trip-live-refresh`).

## Implementation Notes

- Implemented directly (no implementer subagent), tests first. Targeted Vitest (`src/lib/api`, `checklists.test.ts`, trip `[tripId]`, `feature-map.test.mjs`): 31 files, 790 tests pass; `tsc` and ESLint clean on touched files.
- `client.ts`: `REQUEST_TIMEOUT_MS = 30_000`, one `AbortController` per request, timer cleared in `finally`; an abort during fetch, error-body read or success-body read maps to `ApiClientError(0, "timeout")`.
- `use-api-mutation.ts`: `fields` is `Record<resourceKey, Record<field, string[]>>` (unkeyed writes use `""`). `onSuccess`, `waitForRefresh` and the refresh each fail separately into `console.error`, so the refresh still runs after a throwing `onSuccess`.
- `checklists.ts`: `updateChecklistItem` reads the row first and returns it without UPDATE or `markChanged` when every supplied field equals the stored value. The first describe in `checklists.test.ts` now serves an item row from its `select` mock (stored `isChecked: false`).
- The affected selector chose four features, not the full suite: the earlier plan assumed `src/lib/api/**` (SHARED) would win, but explicit `FEATURE_MAP` entries from 2.1 take precedence for these files.
- E2E: one added step in the existing item-patch scenario resends the same values and expects 200 with the item unchanged. It cannot assert "no activity row"; that is covered by the unit test (`afterTripWrite` not called).
- build-validator: lint, tsc, build pass; coverage 420 files, 7031 tests (lines 97.7%, branches 93.41%); affected E2E 169 pass (12 features).

## Plan Change Log

## Review Triage Log

Pass 1: 4 lenses; verdicts: 0 high, 3 medium/low defer-or-patch (1 patch, 3 defer), 10 low rejected, 1 false.

| Finding | Source | Verdict | Route | Evidence |
| --- | --- | --- | --- | --- |
| Outer post-commit catch (async-rejecting `waitForRefresh`) has no test | verification-gap | medium | patch | Added `does not report a rejecting waitForRefresh as a failed keyed save`; a synchronous throw from `router.refresh` inside React `startTransition` does not reach the catch (React reports it), so no test for that case. |
| Timed-out write may still commit later and land after the next same-key write | blind-hunter | low | defer | Inherent to client-side abort; fixing needs server-side ordering or idempotency keys (entry 3/idempotency work). Plan Design Notes accept it. |
| No refresh or "outcome unknown" message after a timeout | blind-hunter, edge-case-hunter | low | defer | Same refresh-on-error design choice already deferred from story 2.1; existing hook test asserts failures never refresh. |
| Malformed 200 body throws a raw `SyntaxError`; a test locks it in | blind-hunter, edge-case-hunter | low | defer | Pre-existing (`return response.json()`); the hook already toasts the generic message for non-`ApiClientError`. |
| `fields` shape change, `""` key, unkeyed concurrent writes share one entry, stale entries linger | blind-hunter, edge-case-hunter | low | rejected | No code reads `fields` outside tests; intent is per resource key and keyed writes are isolated. Fix adds API surface. |
| Swallowed callback errors only reach `console.error` | blind-hunter | low | rejected | Matches `errors.ts` logging; intent says report without a failure toast. |
| No caller cancellation or per-call timeout; mixed abort causes | blind-hunter | low | rejected | No external signal exists; plan Never excludes both; no harm today. |
| Async hook tests use fixed microtask ticks; keyed-queue test asserts only call count | blind-hunter | low | rejected | Same style as the existing hook tests. |
| E2E same-value step asserts only 200 and body | blind-hunter, verification-gap, intent-alignment | low | rejected | The no-effects claim is pinned in `checklists.test.ts` (`update` and `afterTripWrite` not called); an activity-table assertion is disproportionate. Recorded in Implementation Notes. |
| Service no-op change is out of the client-hardening scope | blind-hunter | false | rejected | The intent names the same-value item PATCH explicitly. |
| No-op compare: explicit `undefined` key, extra SELECT on each PATCH | blind-hunter | low | rejected | JSON bodies cannot carry `undefined`; the extra read mirrors `updateChecklistTitle`. |
| `propsSettled` rejects unhandled if `startTransition` throws first | edge-case-hunter | low | rejected | Requires `startTransition` to throw synchronously, which React does not do. |
| Test claims "reaches fetch" but stubs `api` for the second write | edge-case-hunter | low | rejected | `client.test.ts` covers fetch; the hook test covers queue release. |

## Design Notes

30 s sits above normal request time and the trip-lock wait, so it frees a stalled queue without cutting off slow commits. After a timeout the write may have committed; item PATCH is an absolute write, so the next write on the key is safe. Create calls get retry safety from client UUIDs in entry 3. Field errors keep the `Record<field, string[]>` value shape per key, so a future consumer reads `fields[key]`.

## Verification

**Commands:**

- `npx vitest run src/lib/api src/lib/services/checklists.test.ts "src/app/(app)/trips/[tripId]"` -- expected: pass
- `node scripts/affected-e2e.mjs` -- expected: lists the mapped features
- `build-validator` -- expected: PASS

---
title: "Sync Status Indicator"
type: "feature"
created: "2026-09-04"
status: "done"
review_loop_iteration: 1
context: []
baseline_commit: "e32e0e280dca8fea8093c6533fe1c17a1cc793e9"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 4-1 shipped the SSE channels, but nothing on the client consumes them — a contributor cannot tell whether live sync is actually up, so when realtime updates silently stop (FR8) there is no indicator.

**Approach:** Ship the client-side live-sync hook (`use-live-sync.ts`) that opens the personal SSE channel and tracks connection state, plus a global status-bar chip (`sync-status-indicator.tsx`) mounted once in `(app)/layout.tsx` rendering connected / reconnecting / offline. Make server heartbeats observable so a dead channel is detected and surfaces as offline.

## Boundaries & Constraints

**Always:**
- New client-safe constants module `src/lib/live-sync-constants.ts` holds `SSE_HEARTBEAT_INTERVAL_MS = 15_000` and `LIVE_SYNC_DEAD_CHANNEL_GRACE_MS = 10_000`. Both the server `trip-events.ts` and the client hook import from it. The hook must NEVER import the server-only `trip-events.ts` (or `queries.ts`).
- Make the heartbeat observable: `formatSseHeartbeat()` in `src/lib/trip-events.ts` emits a data event (`data: {"type":"heartbeat"}\n\n`) instead of the `: ping` comment, so the browser's `onmessage` fires as a keepalive. Pub-sub API, route gating, and SSE response headers stay unchanged; both routes keep calling `formatSseHeartbeat()` unchanged.
- Hook `useLiveSync(url = "/api/users/me/events")` (`"use client"`, `src/lib/use-live-sync.ts`): one EventSource per mount; status machine `reconnecting (initial) → connected ⇄ reconnecting → offline`; any `onopen` or `onmessage` resets a watchdog; silence longer than heartbeat interval + grace window ⇒ `offline`; a later signal returns the machine to `connected`. Unmount closes the EventSource and clears all timers.
- Status type `SyncConnectionStatus` (`"connected" | "reconnecting" | "offline"`) as const-object + union in `src/data/types.ts` per project convention.
- Indicator `src/components/packt/sync-status-indicator.tsx` — `"use client"`, explicit `SyncStatusIndicatorProps` interface (empty unless overrides are added), consumed from the hook: `role="status"` + `aria-live="polite"` wrapper with `<span className="sr-only">` announcing only on state transitions — never the initial mount. Dot + visible text label per state: connected = "Connected" in `fg-4` (quiet, no accent); reconnecting = "Reconnecting" in `warning` with a pulsing dot — static warning dot when `prefers-reduced-motion` (matchMedia check, `map-tab.tsx:48-50`); offline = "You're offline. Changes from other people won't appear until you reconnect." in `danger`, static dot (never pulsing). No toast for connection state.
- Colors via CSS custom-property utilities only (`bg-fg-4`, `bg-warning`, `bg-danger`); no hardcoded hex. Any icon used gets `strokeWidth={1.5}` and a `title`.
- Mount `<SyncStatusIndicator />` once in `src/app/(app)/layout.tsx` — fixed, non-interactive, bottom-right above the mobile tab bar (`pb-14`), z-index above page content.

**Ask First:**
- _None._

**Never:**
- No changes to pub-sub API signatures, route gating, or SSE response headers shipped in 4-1. No reconnect/backoff logic beyond EventSource's built-in retry. No server-side close when the client shows offline.
- No refetch-on-event wiring, revocation modal, or dashboard live refresh — those are Stories 4.3–4.5.
- No Redis / horizontal fan-out, no DB/schema changes, no new dependencies, no `EventSource` polyfill.
- Client hook must not import any `server-only` module.

## I/O & Edge-Case Matrix

| Scenario   | Input / State | Expected Output / Behavior | Error Handling |
| ---------- | ------------- | -------------------------- | -------------- |
| MOUNT      | first render (SSR + hydration) | status `reconnecting`, chip renders "Reconnecting" | no aria-live announcement on mount |
| CONNECT    | EventSource `onopen` fires | status `connected`, chip "Connected" (quiet) | N/A |
| DROP       | `onerror` fires (network drop, session expiry) | status `reconnecting`, chip warning + pulsing dot | announced once |
| RECOVER    | `onopen` after a drop | status back to `connected` | recovery announced |
| SILENT     | no `onopen`/`onmessage` for interval + grace | watchdog ⇒ status `offline`, static danger dot + offline microcopy | announced once |
| RESET      | heartbeat / data event received | watchdog resets; stays `connected` (or `offline` → `connected`) | N/A |
| UNMOUNT    | component unmounts | EventSource closed, all timers cleared | cleanup idempotent |

</frozen-after-approval>

## Code Map

- `src/lib/trip-events.ts` (`formatSseHeartbeat` L30-32, `SSE_HEARTBEAT_INTERVAL_MS` L24) -- flip heartbeat to an observable data event; pull the interval from the new constants module.
- `src/lib/trip-events.test.ts` -- heartbeat wire-format assertions must be updated (they currently assert `: ping\n\n`).
- `src/lib/live-sync-constants.ts` -- NEW client-safe constants module (no `server-only` import); colocated test.
- `src/data/types.ts` (`LiveSyncEvent` L678-697) -- add `SyncConnectionStatus` beside the live-sync types.
- `src/app/api/users/me/events/route.ts` -- read-only reference: the channel the hook opens (`requireUser`-only gating, heartbeat enqueue L24-26). Do not modify.
- `src/lib/use-live-sync.ts` + `use-live-sync.test.ts` -- NEW hook + EventSource-mocked unit tests. Browser-only access inside `useEffect` only, mirroring `src/lib/use-is-mobile.ts`.
- `src/components/packt/sync-status-indicator.tsx` + `.test.tsx` -- NEW chip + colocated tests; a11y pattern (aria-live wrapper + sr-only span) from `schedule-conflict-badge.tsx:26,42`.
- `src/app/(app)/layout.tsx` (L16-29) -- mount `<SyncStatusIndicator />` once in the app shell.
- `tests/e2e/features/sync-status.feature` + `tests/e2e/steps/sync-status.steps.ts` + `tests/e2e/feature-map.mjs` -- one E2E scenario; register `@feat:sync-status` and map `sync-status-indicator.tsx` + `(app)/layout.tsx` under it. (`src/lib/**` already sits in `SHARED_GLOBS`, so the whole suite runs regardless.)
- `src/components/packt/map-tab.tsx:48-50` -- `prefers-reduced-motion` matchMedia pattern to reuse.

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/live-sync-constants.ts` + `live-sync-constants.test.ts` -- add `SSE_HEARTBEAT_INTERVAL_MS` (15_000) and `LIVE_SYNC_DEAD_CHANNEL_GRACE_MS` (10_000) -- client-safe shared timings.
- [x] `src/data/types.ts` -- add `SyncConnectionStatus` const-object + union -- shared status contract for hook and indicator.
- [x] `src/lib/trip-events.ts` -- change `formatSseHeartbeat()` to emit `data: {"type":"heartbeat"}\n\n`; import the interval constant from the constants module -- observable keepalive without touching routes.
- [x] `src/lib/trip-events.test.ts` -- assert the new heartbeat wire format; event format assertions unchanged -- keep server-side coverage green.
- [x] `src/lib/use-live-sync.ts` -- implement the hook (default URL `/api/users/me/events`, status transitions, watchdog, cleanup) -- the client connection + status machine.
- [x] `src/lib/use-live-sync.test.ts` -- tests: initial reconnecting; onopen→connected; onerror→reconnecting; recovery→connected; watchdog silence→offline; heartbeat reset keeps connected; unmount cleanup (local EventSource mock class) -- coverage-gated, exercise the I/O matrix.
- [x] `src/components/packt/sync-status-indicator.tsx` -- chip rendering all three states (explicit `SyncStatusIndicatorProps` interface, dot + label, role=status, aria-live, sr-only on transitions, reduced-motion static pulse) -- the visible indicator.
- [x] `src/components/packt/sync-status-indicator.test.tsx` -- tests: each state's label + dot styling + token colors, a11y attributes, no announcement on mount, announcement on transition, reduced-motion branch -- coverage-gated.
- [x] `src/app/(app)/layout.tsx` -- mount `<SyncStatusIndicator />` once -- app-wide indicator.
- [x] `tests/e2e/features/sync-status.feature` + `tests/e2e/steps/sync-status.steps.ts` + `tests/e2e/feature-map.mjs` -- scenario: signed-in user on the app shell sees the indicator reach "Connected" once the live channel opens; tag `@feat:sync-status`; register source mapping -- user-facing verification + mapping contract.

**Acceptance Criteria:**

- Given a signed-in page in the `(app)` shell, when the shell mounts, then exactly one EventSource opens on `/api/users/me/events` and the indicator reaches "Connected" after `onopen`.
- Given the connection drops, when `onerror` fires, then the indicator shows "Reconnecting" with a warning pulsing dot and announces the change via `aria-live`.
- Given a dead channel (no signal for interval + grace), then the indicator shows the offline microcopy with a static danger dot and announces it once.
- Given recovery, when `onopen` fires again, then the indicator returns to the quiet "Connected" state and announces recovery.
- Given the component unmounts, then the EventSource is closed and all timers are cleared.
- Given coverage and checks, then `npm run test:coverage` stays ≥95% lines/functions and ≥90% branches, `npm run lint` and `npx tsc --noEmit` are clean, and `npm run test:e2e:affected` passes (full suite — `src/lib/**` is `SHARED_GLOBS`).

### Review Findings

- [x] [Review][Patch] Unauthorized heartbeat-on-connect change to both SSE routes, violating frozen "do not modify" / "unchanged" constraints [src/app/api/users/me/events/route.ts:24] — reverted the added enqueue calls and matching test hunks in both routes
- [x] [Review][Patch] `layout.tsx` added to the `sync-status` FEATURE_MAP entry silently defeats its existing SHARED_GLOBS full-suite trigger [tests/e2e/feature-map.mjs:137] — dropped `layout.tsx` from the entry's globs
- [x] [Review][Patch] templates.steps.ts assertion weakened to a tautology, losing ARIA role="status" verification [tests/e2e/steps/templates.steps.ts:91] — restored role-based assertion via `.filter({ hasText })`
- [x] [Review][Patch] aria-live region wraps both the always-visible label and the sr-only announcement span, risking double announcement [src/components/packt/sync-status-indicator.tsx:74-97] — moved role="status"/aria-live to the sr-only span only, hid the visible pill from AT
- [x] [Review][Patch] Offline microcopy sentence has no max-width/wrap handling in the pill, unverified for overflow on narrow viewports [src/components/packt/sync-status-indicator.tsx:34-35] — added `maxWidth: min(90vw, 22rem)` to the pill
- [x] [Review][Patch] `pb-14` offset doesn't account for BottomTabBar's safe-area-inset-bottom on notched devices [src/components/packt/sync-status-indicator.tsx:78] — added an `env(safe-area-inset-bottom)` spacer
- [x] [Review][Patch] `formatSseHeartbeat()` hand-types the heartbeat JSON string instead of `JSON.stringify` like `formatSseEvent()` [src/lib/trip-events.ts] — switched to `JSON.stringify`
- [x] [Review][Patch] `waitForLoadState` swapped from `networkidle` to `domcontentloaded` across 5 E2E files with no comment explaining why [tests/e2e/scenario-fixture.ts] — added explanatory comment in trip-tabs.steps.ts
- [x] [Review][Patch] No test exercises a live `prefers-reduced-motion` change event or listener cleanup [src/components/packt/sync-status-indicator.test.tsx] — added live-toggle and unmount-cleanup tests
- [x] [Review][Defer] "heartbeat" wire sentinel has no shared constant/type in `LiveSyncEventType` [src/data/types.ts] — deferred, pre-existing (explicitly out of scope for 4.3 per this spec's Design Notes)
- [x] [Review][Defer] `refreshCurrentPage` in scenario-fixture.ts has no callers anywhere in tests/e2e [tests/e2e/scenario-fixture.ts:654-657] — deferred, pre-existing dead code unrelated to this change

## Spec Change Log

## Design Notes

- **Heartbeat observability:** browsers ignore SSE comment lines (`: ping`), so with the 4-1 comment heartbeat an idle-but-healthy channel can never reset a client watchdog and the indicator would falsely show offline every ~25s. Changing only `formatSseHeartbeat()`'s payload — keeping the exported name and the routes' call sites — makes dead-channel detection real and keeps the 4-1 routes intact. `"heartbeat"` is a transport keepalive, not a `LiveSyncEvent`; 4.3 consumers filter to known event types.
- **Status machine:** the initial state is `reconnecting` (a connection has not opened yet), deterministic on both server and client so SSR/hydration cannot mismatch. aria-live announces transitions only — announcing "Reconnecting" on every page load would be noise.
- **offline is soft:** the EventSource is left open in the `offline` state; any later signal returns to `connected`. Forced reconnect/backoff work is out of scope because EventSource already retries natively.
- **Grace math:** 15s heartbeat + 10s grace ⇒ ~25s of total silence before the channel is declared dead.

## Verification

**Commands:**

- `npx vitest run src/lib/live-sync-constants.test.ts src/lib/trip-events.test.ts src/lib/use-live-sync.test.ts` -- expected: pass (constants, updated heartbeat wire, hook state machine).
- `npx vitest run src/components/packt/sync-status-indicator.test.tsx` -- expected: pass (three states, a11y, reduced motion).
- `npm run test:coverage` -- expected: ≥95% lines/functions, ≥90% branches (incl. new `use-live-sync.ts`, `sync-status-indicator.tsx`, `live-sync-constants.ts`).
- `npm run lint` -- expected: clean. `npx tsc --noEmit` -- expected: clean.
- `npm run test:e2e:affected` -- expected: full suite (all touched files fall under `SHARED_GLOBS` via `src/lib/**`; indicator + layout map to the new scenario) — must pass.

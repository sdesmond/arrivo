---
title: "Move Sync Status Indicator to a Problem-Only Corner Icon"
type: "feature"
created: "2026-09-06"
status: "done"
review_loop_iteration: 0
context: []
baseline_commit: "9263316f3b4efc5052c1bb23e4bbf9244672619a"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 4-2 shipped `SyncStatusIndicator` as an always-visible floating dot+text pill in the bottom-right corner of the `(app)` shell. That has two problems. First, the pill is always on screen even when the connection is healthy, which is UI noise for an ambient state the project philosophy already calls "the quiet default." Second, on notched (safe-area) mobile devices the pill's fixed `pb-14` (56px) anchor rides up over the bottom tab bar, which is 56px *plus* `env(safe-area-inset-bottom)`, so the pill overlaps the tab bar — the 4-2 review's "fix" (a spacer *inside* the container) never moved the pill's vertical anchor.

**Approach:** Make the indicator **problem-only** (renders nothing when connected) and move it to a **fixed bottom-left corner** on both breakpoints, clear of the bottom tab bar. (Renegotiated during code review — the top-right corner turned out to be occupied on both breakpoints; see the Spec Change Log.) Each visible state is **icon-only**, with the descriptive text available as a tooltip on hover/focus/tap (so the state is never color-only — the text label exists, it just isn't always visible). Transitions, including recovery back to connected, remain announced via `aria-live`.

## Boundaries & Constraints

**Always:**
- Problem-only rendering: when `useLiveSync()` returns `connected`, the indicator renders nothing visible (no pill, no dot, no icon). The existing `aria-live` announcement span stays mounted so recovery (offline/reconnecting → connected) is still announced even though nothing visible appears.
- New position: `fixed bottom-0 left-4` (`lg:left-64`, clear of the 240px sidebar), lifted by a `lg:hidden` `calc(3.5rem + env(safe-area-inset-bottom))` spacer so the icon clears the mobile tab bar and the notch below it. Replaces the old `bottom-0 right-0 pb-14 lg:pb-4` float. The wrapper is `pointer-events-none` so the connected state cannot shield a corner of the page.
- Icon-only visible states with a tooltip carrying the label, reached by hover, keyboard focus, *and* tap (Base UI tooltip in `src/components/ui/tooltip.tsx` — hover + focus + touch, not a bare `title` attribute).
  - Reconnecting: warning-toned icon (pulsing; static when `prefers-reduced-motion`), tooltip text `Reconnecting`. A problem is only shown once it outlives a 2s grace window, since every page load starts at `reconnecting` until the SSE handshake completes.
  - Offline: danger `WifiOff` icon (static — never pulsing), tooltip text `Unable to sync`.
- Copy change: offline state's label/announcement becomes `Unable to sync` (was "You're offline. Changes from other people won't appear until you reconnect."). Reconnecting stays `Reconnecting`, connected stays `Connected`.
- Keep: `SyncConnectionStatus` type, `useLiveSync()` hook, single mount in `(app)/layout.tsx` — all unchanged. Only the indicator component's presentation and position change.
- Icons: lucide, `strokeWidth={1.5}`, `aria-label`/accessible name set (never color-only). No `title` attribute — `aria-label` names the button and a native bubble would double up on the tooltip. Colors via CSS custom-property utilities (`text-warning`, `text-danger`) — no hardcoded hex.
- The tooltip trigger is a focusable element and must carry a **44×44px hit area** (padding), matching the interactive-target floor in AGENTS.md.
- The `aria-live="polite"` announcement contract from 4-2 is preserved: announce on state *transitions* only, never the initial mount, including recovery back to connected.

**Ask First:**
- Tooltip side/alignment — **resolved 2026-09-06:** `side="top"`, `align="center"` (default). The trigger is bottom-anchored, so `top` never has to flip.

**Never:**
- No changes to `useLiveSync()` or the `SyncConnectionStatus` machine, no new connection logic, no layout/`layout.tsx` structural change.
- No visible text pill on the connected state — that is the point of this story.
- No Redis / horizontal fan-out, no DB/schema changes, no new dependencies.
- Must not regress the notched-mobile tab-bar overlap or introduce a status-bar/header overlap.
- No flash of a problem state on a healthy page load.

## I/O & Edge-Case Matrix

| Scenario   | Input / State                   | Expected Output / Behavior | Error Handling |
| ---------- | ------------------------------- | -------------------------- | -------------- |
| CONNECTED  | `status === connected`          | renders nothing visible; announcement span empty; no icon, no pill | N/A |
| RECONNECT  | `status === reconnecting` past the grace window | warning icon visible bottom-left, pulsing (static under reduced-motion); tooltip `Reconnecting` on hover/focus/tap; announced once | N/A |
| OFFLINE    | `status === offline`            | danger `WifiOff` icon visible bottom-left, static; tooltip `Unable to sync`; announced once | N/A |
| RECOVER    | `offline/reconnecting` → `connected` | icon disappears; `aria-live` announces `Connected` (or the connected label) once | N/A |
| TOOLTIP    | hover / keyboard focus / tap on the icon | tooltip shows the state's label; dismisses on blur/outside | tooltip keyboard-reachable (focus) |
| MOTION     | `prefers-reduced-motion: reduce` | reconnecting icon static (no pulse), same reduced-motion static behavior as 4-2 | matches 4-2 behavior |
| NOTCH      | mobile viewport with safe-area inset | icon sits above the bottom tab bar and the notch below it | spacer respects `env(safe-area-inset-bottom)`, which needs `viewport-fit=cover` |
| HANDSHAKE  | `reconnecting` on a cold load that connects within 2s | nothing visible, nothing announced | grace window swallows it |
| UNMOUNT    | component unmounts               | EventSource closed, timers cleared (unchanged from 4-2) | cleanup idempotent |

</frozen-after-approval>

## Code Map

- `src/components/packt/sync-status-indicator.tsx` — rewrite: problem-only render behind a 2s grace window, bottom-left fixed position with a tab-bar + `env(safe-area-inset-bottom)` spacer, icon + Base UI tooltip for reconnecting/offline, remove the connected pill, keep `aria-live` announcement span and reduced-motion handling. Import `Tooltip`, `TooltipTrigger`, `TooltipContent` from `@/components/ui/tooltip` (the app-wide `TooltipProvider` already wraps the tree in `src/app/layout.tsx`), and lucide `RefreshCw` / `WifiOff`.
- `src/components/packt/sync-status-indicator.test.tsx` — rework for problem-only behavior: nothing on connected; icon-only visible on reconnecting/offline; tooltip label; recovery announcement; reduced-motion static pulse; safe-area spacer; icon accessible name; a11y attributes.
- `tests/e2e/features/sync-status.feature` + `tests/e2e/steps/sync-status.steps.ts` — four scenarios: connected renders nothing (behind a positive page anchor); reconnecting icon + label on keyboard focus; label on tap; dead channel reports `Unable to sync` and clears on recovery. `tests/e2e/feature-map.mjs` entry `sync-status` is unchanged; `src/app/layout.tsx` is in `SHARED_GLOBS`, so this change set runs the full suite.
- `src/app/layout.tsx` — add `export const viewport: Viewport = { viewportFit: "cover" }` so `env(safe-area-inset-*)` resolves to real values.
- `src/app/(app)/layout.tsx` — reference only; the single `<SyncStatusIndicator />` mount (L31) is unchanged — no layout edit.
- `src/components/ui/tooltip.tsx` — existing Base UI tooltip primitive; reference for API, do not modify.
- `src/lib/use-live-sync.ts` + `src/data/types.ts` (`SyncConnectionStatus`) — reference only, unchanged.

## Tasks & Acceptance

**Execution:**

- [x] `src/components/packt/sync-status-indicator.test.tsx` — rewrite tests first: nothing renders on connected; reconnecting/offline render icon-only bottom-left with tooltip label; recovery announces; reduced-motion static; safe-area spacer; icon accessible name.
- [x] `src/components/packt/sync-status-indicator.tsx` — problem-only render, bottom-left fixed position + tab-bar/`env(safe-area-inset-bottom)` spacer, reconnecting/offline icons with Base UI tooltip labels, keep `aria-live` + reduced-motion handling.
- [x] `tests/e2e/features/sync-status.feature` + `tests/e2e/steps/sync-status.steps.ts` — rework scenarios for problem-only (connected → nothing; icon appears on reconnecting/offline) and the copy change.
- [x] `npm run test:coverage` — ≥95% lines/functions, ≥90% branches; `npm run lint` and `npx tsc --noEmit` clean; `npm run test:e2e:affected` passes (full suite via `src/lib/**` `SHARED_GLOBS`).

**Acceptance Criteria:**

- Given a healthy connection, when the shell mounts, then no visible sync indicator is rendered (nothing in the bottom-left corner) and no announcement fires on mount.
- Given the connection drops for longer than the grace window, then a warning icon appears in the bottom-left corner with a tooltip reading `Reconnecting`, pulsing (static under `prefers-reduced-motion`), and the change is announced once via `aria-live`.
- Given the channel dies, then a static danger `WifiOff` icon appears bottom-left with a tooltip reading `Unable to sync`, announced once.
- Given recovery, then the icon disappears and the connected state is announced once via `aria-live`.
- Given a notched mobile viewport, then the icon sits above the bottom tab bar and its safe-area inset, and does not overlap the tab bar or any header control.
- Given a healthy page load whose SSE handshake completes inside the grace window, then no icon appears and nothing is announced.
- Given coverage and checks, then `npm run test:coverage`, `npm run lint`, `npx tsc --noEmit`, and `npm run test:e2e:affected` all pass.

### Review Findings

_Code review 2026-09-06 — layers: blind-hunter, edge-case-hunter, verification-gap, acceptance-auditor._

- [x] [Review][Decision] Top-right corner is not empty chrome — icon overlaps header actions — the spec's "Never introduce a status-bar/header overlap" is violated. `Topbar` (`src/components/packt/trips-topbar.tsx:14,45-51`, `px-6 py-4`) puts Notifications/New trip flush right at the top of `<main>`, and the trip crumb bar (`src/app/(app)/trips/[tripId]/trip-detail-hero.tsx:141-175`, `py-2.5`) puts Edit/Share there. The indicator is `fixed right-0 top-0 z-50` with a `size-11` circle → occupies x 16-60px from the right, y 0-44px, over buttons ending 24px from the right at y≈10-52. While reconnecting/offline it visually covers and blocks clicks on those controls. Options: offset the indicator down/left clear of the header rows; render it inside the header row instead of as a fixed overlay; or keep it fixed but bottom-right (top-left of the tab bar) with a correct safe-area anchor.
- [x] [Review][Decision] `env(safe-area-inset-top)` is inert — no `viewport-fit=cover` in the app — `grep -rn "viewport-fit|export const viewport" src/` returns nothing, so Next emits the default viewport meta and the inset resolves to `0px`. AC 5 ("icon sits below the top safe-area inset") cannot hold on a notched device. Fix requires a global `export const viewport = { viewportFit: "cover" }` in `src/app/layout.tsx`, which also changes how every other fixed element sits against the safe areas — a global call, not a component-local one.
- [x] [Review][Decision] `title` attribute duplicates the Base UI tooltip — the trigger carries `aria-label`, `title`, and a `TooltipContent` all reading the same string (`src/components/packt/sync-status-indicator.tsx:84,91,104`). On hover the native browser bubble renders on top of the custom popup. Spec line 24 says "not a bare `title` attribute"; spec line 29 and AGENTS.md say icon buttons need `title`. `aria-label` already supplies the accessible name. Options: drop `title` (accepting the AGENTS.md convention exists for buttons with no other name), or keep it and accept the double bubble.
- [x] [Review][Decision] Tooltip side was never confirmed — the spec's only "Ask First" item. `TooltipContent` is used bare, inheriting `side="top"` (`src/components/ui/tooltip.tsx:22`) on a trigger anchored at `top-0`, so the positioner always flips. `side="bottom"` (or `"left"`) would be the deliberate choice.
- [x] [Review][Patch] Problem icon flashes top-right on every page load — `useLiveSync` initializes to `Reconnecting` and only reaches `Connected` on `onopen` [src/lib/use-live-sync.ts:131,150]; with problem-only rendering, every cold load and shell remount paints a pulsing warning icon until the SSE handshake completes, then announces "Connected". Needs a grace delay (e.g. show the problem UI only after ~2s of non-connected) [src/components/packt/sync-status-indicator.tsx:66]
- [x] [Review][Patch] Tooltip label unreachable by tap — Base UI's tooltip trigger is hover+focus only (`mouseOnly: true` on its hover interaction); `title` does not fire on touch either. Spec constraint requires "hover, keyboard focus, *and* tap". On mobile the state is icon+color with no readable label. Needs a controlled `open` toggled on press [src/components/packt/sync-status-indicator.tsx:83-104]
- [x] [Review][Patch] E2E reconnecting scenario races the 25s dead-channel watchdog — `SSE_HEARTBEAT_INTERVAL_MS` 15s + `LIVE_SYNC_DEAD_CHANNEL_GRACE_MS` 10s; the aborted route never fires `onopen`/`onmessage`, so the status flips to `Unable to sync` 25s after reload while later steps still assert `Reconnecting` (first assertion alone allows 15s) [tests/e2e/steps/sync-status.steps.ts:8-25]
- [x] [Review][Patch] "No problem indicator" step passes vacuously — `toHaveCount(0)` is satisfied before hydration mounts anything, and `Given I am signed in` only waits for the URL. Needs a positive anchor (e.g. the trips topbar rendered) before asserting absence [tests/e2e/steps/sync-status.steps.ts:4-6]
- [x] [Review][Patch] Keyboard reachability of the tooltip is not actually verified — `matchesFocusVisible` returns `true` unconditionally under JSDOM, so the unit test cannot fail for the reason it names, and the E2E uses programmatic `locator.focus()` rather than a real `Tab` [src/components/packt/sync-status-indicator.test.tsx:57-65, tests/e2e/steps/sync-status.steps.ts:19-21]
- [x] [Review][Patch] No E2E for the offline state or recovery — AC 3 (`Unable to sync` + static `WifiOff`) and AC 4 (icon disappears, `Connected` announced) have no scenario; the copy change never appears in the E2E diff [tests/e2e/features/sync-status.feature:3-9]
- [x] [Review][Patch] Icon is flush against the viewport top on non-notched viewports — only `pr-4` is applied; vertical offset comes solely from an inset that is `0` on desktop. Needs a `pt-*` or `max(env(safe-area-inset-top), 1rem)` spacer [src/components/packt/sync-status-indicator.tsx:78-79]
- [x] [Review][Patch] Connected-state wrapper still renders as a fixed `z-50` box with no `pointer-events-none` — an invisible strip over the top-right corner (16px wide × inset tall) on notched devices [src/components/packt/sync-status-indicator.tsx:78]
- [x] [Review][Patch] Redundant nested `TooltipProvider` — `src/app/layout.tsx:51` already wraps the tree, so the local provider creates a second scope outside the app-wide delay group [src/components/packt/sync-status-indicator.tsx:81]
- [x] [Review][Patch] Unreachable `content && StatusIcon` branch — `StatusIcon` is `content?.icon`, so `content` truthy already implies it; dead branch drags the 90% branch gate [src/components/packt/sync-status-indicator.tsx:80]
- [x] [Review][Patch] Copy duplicated across two tables — `Reconnecting` / `Unable to sync` live in both `STATUS_ANNOUNCEMENTS` and `PROBLEM_CONTENT[].label`; derive one from the other so tooltip and screen-reader text cannot drift [src/components/packt/sync-status-indicator.tsx:24-41]
- [x] [Review][Patch] Tests assert library internals — `toHaveClass("lucide-wifi-off")` and `[data-slot="tooltip-content"]` couple the suite to lucide/Base UI naming; prefer `getByRole("tooltip")` and an owned `data-testid` [src/components/packt/sync-status-indicator.test.tsx:64,74, tests/e2e/steps/sync-status.steps.ts:23]
- [x] [Review][Patch] Aborted SSE route is never unrouted — `route.abort("failed")` makes `EventSource` retry for the rest of the scenario, spinning requests through teardown; use `{ times: N }` or `page.unroute` [tests/e2e/steps/sync-status.steps.ts:8-13]
- [x] [Review][Patch] Missing unit coverage — no `connected → reconnecting` announcement edge, no "same status rerender does not re-announce" (the guard at line 69), no tooltip-content assertion for the offline label [src/components/packt/sync-status-indicator.test.tsx:67-89]
- [x] [Review][Patch] Focus is silently dropped on recovery — the trigger unmounts while focused and focus falls to `<body>`; no handling or test [src/components/packt/sync-status-indicator.tsx:80-107]
- [x] [Review][Patch] Spec Verification claim is wrong — it states the full E2E suite runs because touched files fall under `src/lib/**` `SHARED_GLOBS`, but the diff touches no `src/lib/**` file, so `test:e2e:affected` runs only `@feat:sync-status` [_bmad-output/implementation-artifacts/spec-4-6-move-sync-status-indicator-to-top-bar-icon.md:101]
- [x] [Review][Defer] Announcement region keeps stale text indefinitely — after recovery the sr-only span still reads the last transition; a reader browsing in later hears an out-of-date status [src/components/packt/sync-status-indicator.tsx:108-110] — deferred, pre-existing (4-2)
- [x] [Review][Defer] No debounce on flapping status announcements — an unstable SSE channel spams alternating announcements [src/components/packt/sync-status-indicator.tsx:68-73] — deferred, pre-existing (4-2)
- [x] [Review][Defer] `bottom-tab-bar` `env(safe-area-inset-bottom)` is inert for the same missing-`viewport-fit` reason [src/components/packt/bottom-tab-bar.tsx:26] — deferred, pre-existing

## Spec Change Log

- **2026-09-06 — position renegotiated from top-right to bottom-left (code review, decision 1).** The Intent's premise that "the top-right corner is currently empty chrome" is wrong on both breakpoints: `trips-topbar.tsx` puts Notifications/New trip flush right at the top of `<main>`, `trip-detail-hero.tsx` puts Edit/Share there and a cover-options menu at `absolute right-2 top-2`. A `fixed top-0 right-0 z-50` badge covers them while a problem shows. Bottom-right is taken too — `DevDatePicker` sits at `fixed bottom:16 right:16 z-9999`, and E2E runs the dev server. Bottom-left is free on both breakpoints.
- **2026-09-06 — `viewport-fit=cover` added to `src/app/layout.tsx` (code review, decision 2).** Without it every `env(safe-area-inset-*)` resolves to `0px`. This — not the spacer's position in the DOM — is why 4-2's bottom-right pill overlapped the tab bar on notched devices; the Intent's diagnosis of that bug was wrong. The fix is global and also repairs `bottom-tab-bar.tsx`.
- **2026-09-06 — `title` dropped from the trigger (code review, decision 3).** `aria-label` supplies the accessible name; keeping `title` rendered a native bubble on top of the Base UI tooltip.
- **2026-09-06 — tooltip side resolved to `top` (code review, decision 4, closing the spec's only "Ask First").** The trigger is bottom-anchored, so `top` is the side that never has to flip.
- **2026-09-06 — 2s problem grace window added (code review).** `useLiveSync` starts every channel at `reconnecting`, so problem-only rendering would otherwise flash a warning icon on every page load and announce "Connected" each time.

## Design Notes

- **Problem-only, not always-visible:** connected is the ambient "quiet default" per the epic's own philosophy — a permanent reminder of a healthy state is noise. Rendering nothing when connected also removes any ambiguity between "connected" and "indicator not mounted." Recovery is still announced so an AT user isn't left wondering after hearing "Unable to sync"/"Reconnecting."
- **Tooltip = text label, not always visible:** UX-DR12 requires status to "never be color-only, every pill/badge carries a text label." This story keeps the text *label* — it just lives in a Base UI tooltip (hover/focus/tap) and in the `aria-live` announcement rather than as an always-on pill. That satisfies "never color-only" (an accessible text label always exists) while honoring the user's request for icon-only visible chrome. The tooltip primitive is a real accessible tooltip (reachable by keyboard focus and touch), not a bare `title` attribute.
- **Copy:** offline now reads `Unable to sync` — short, direct, matches the Voice and Tone table ("direct, unadorned"). Same string used for the tooltip and the `aria-live` announcement.
- **Position rationale (revised 2026-09-06):** bottom-left is the only corner free on both breakpoints. Top-right carries the topbar Notifications/New trip buttons and the trip crumb bar Edit/Share plus the hero cover menu; bottom-right carries `DevDatePicker` at `z-9999` in dev, which is how E2E runs. Desktop shifts to `lg:left-64` to clear the 240px sidebar; mobile lifts above the tab bar. The tab-bar overlap 4-2 hit was caused by a missing `viewport-fit=cover`, not by the anchor, and that is now fixed globally.
- **Visual change:** this is a user-visible design change — run `mobile-reviewer` and `desktop-reviewer` sequentially after implementation (they share one Playwright browser, so never in parallel).

## Verification

**Commands:**

- `npx vitest run src/components/packt/sync-status-indicator.test.tsx` — expected: pass (problem-only, tooltip, a11y, reduced-motion, safe-area).
- `npm run test:coverage` — expected: ≥95% lines/functions, ≥90% branches (incl the reworked indicator).
- `npm run lint` — expected: clean. `npx tsc --noEmit` — expected: clean.
- `npm run test:e2e:affected` — expected: full suite, because `src/app/layout.tsx` (the `viewport-fit=cover` export) is in `SHARED_GLOBS`; `sync-status-indicator.tsx` maps to `@feat:sync-status` — must pass.

---
baseline_commit: c71a67c3b3c6e1313dbf42ee271e4edb5e666891
---

# Story 1.5: Connectivity Indicator (Base States)

Status: review

## Story

As a traveler,
I want a persistent, unobtrusive signal when I've lost connectivity,
So that I understand why and trust my work is still being saved.

## Acceptance Criteria

1. **OfflineProvider context mounted** — `OfflineProvider` is created in `src/components/providers/offline-provider.tsx` (following `theme-provider.tsx` pattern) and mounted in `src/app/layout.tsx`, exposing `online | offline | conflict` state. `conflict` is wired by Epic 2; this story consumes only `online`/`offline`.

2. **Desktop trips list: Bell icon replaced** — `trips-topbar.tsx` swaps its unused `Bell` icon button for the connectivity indicator. Shows `WifiOff` when offline; hidden (no element rendered) when online.

3. **Trip detail view: crumb relabeled and wired** — `trip-detail-crumb.tsx` replaces its `Download`-icon "Offline" button with the connectivity indicator (`WifiOff` when offline, hidden when online). The component is imported and rendered in the trip detail layout (`trip-detail-hero.tsx`), replacing the existing inline crumb's `Download`+`Offline` button (preserving the Edit, Share, and overflow controls).

4. **Mobile trips header: static stub removed** — `trips-mobile-layout.tsx` removes the always-on dot + "Synced offline" `<div>` (lines ~71–82) and replaces it with a state-driven `WifiOff` icon that renders only when offline.

5. **No persistent "online" badge** — All three surfaces hide the indicator entirely when online. No "you're online" badge renders anywhere.

6. **WifiOff clickable with dismissible message** — Clicking `WifiOff` shows a message: "You're offline. Any changes you make will be synced when you're back online." Dismissed by user tap/click. No other action from it. (The clickable `CloudAlert` conflict state with "Resolve now" is added in Epic 2.)

7. **WifiOff icon has aria-label and tooltip** — Carries `aria-label="Offline"` (persistent, not just on hover) plus a hover `title` attribute (e.g. `title="Offline"`). Follows existing icon-button rules: `strokeWidth={1.5}`, icon buttons need `title`.

8. **trip-hero.tsx metaTag cleaned** — `metaTag="ACTIVE TRIP · OFFLINE"` drops `· OFFLINE`, becoming `metaTag="ACTIVE TRIP"` (metaTag keeps only the "ACTIVE TRIP" text). `trip-card.tsx`'s `coverMetaTag` has no offline stub and needs no change — confirmed.

## Tasks / Subtasks

- [x] Create OfflineProvider context (AC: 1)
  - [x] `src/components/providers/offline-provider.tsx` — context + provider following `theme-provider.tsx` pattern
  - [x] Provider consumes `useOnlineStatus()` from `src/lib/offline/use-online-status.ts` for `online` flag
  - [x] Exposes: `{ online: boolean; offline: boolean; conflict: boolean; pendingCount: number; retrySync: () => void; openConflictReview: () => void; pinFailure: string | null }`
  - [x] `conflict` always `false`, `pendingCount` = 0, `retrySync`/`openConflictReview` empty no-ops, `pinFailure` = null (all wired in later stories)
  - [x] Mount in `src/app/layout.tsx` inside `<TooltipProvider>`, wrapping `{children}`
- [x] Modify trips-topbar.tsx (AC: 2)
  - [x] Import `useOffline()` from the new provider
  - [x] Replace `<Button variant="outline" size="icon-sm" title="Notifications"><Bell ... /></Button>` with conditional `WifiOff` icon button (visible only when offline)
  - [x] Icon: `<WifiOff size={14} strokeWidth={1.5} />`
  - [x] `aria-label="Offline"` + `title="Offline"`
  - [x] Click behavior: show dismissible message (AC 6)
- [x] Modify trip-detail-crumb.tsx (AC: 3)
  - [x] Import `useOffline()`
  - [x] Replace `<Button ...><Download .../>Offline</Button>` with conditional `WifiOff` icon button
  - [x] Same icon/strokeWidth/aria-label/title/click pattern as topbar
- [x] Wire TripDetailCrumb into trip detail layout (AC: 3)
  - [x] In `trip-detail-hero.tsx`, import and render `<TripDetailCrumb tripName={trip.name} />`
  - [x] Replace the inline crumb bar's `Download`+`Offline` button with the connectivity indicator
  - [x] Preserve Edit, Share, and MoreHorizontal overflow controls from the inline crumb
- [x] Modify trips-mobile-layout.tsx (AC: 4)
  - [x] Import `useOffline()`
  - [x] Remove the static `<span>...Synced offline</span>` block (dot + text that was always-on)
  - [x] Add conditional `WifiOff` icon: `size={15} strokeWidth={1.5}`, shown only when `!offline` is false
  - [x] `aria-label="Offline"` + `title="Offline"`
  - [x] Click behavior: same dismissible message (AC 6)
- [x] Modify trip-hero.tsx (AC: 8)
  - [x] Change `metaTag="ACTIVE TRIP · OFFLINE"` to `metaTag="ACTIVE TRIP"`
- [x] Update offline-provider.test.tsx (AC: 1) — new colocated test
  - [x] Test: context provides default values (online on mount if navigator.onLine)
  - [x] Test: offline state is derived correctly (mock navigator.onLine)
  - [x] Test: conflict/pendingCount/pinFailure default values
- [x] Update trip-hero.test.tsx (AC: 8)
  - [x] Assert metaTag no longer contains "OFFLINE"
  - [x] Assert day-count content preserved
- [x] Update trips-topbar.test.tsx (AC: 2, 5, 6, 7)
  - [x] Assert Bell icon is absent
  - [x] Assert WifiOff renders when offline, hidden when online
  - [x] Assert aria-label="Offline" on the icon
  - [x] Assert click toggles dismissible inline message with correct copy
- [x] Update trip-detail-crumb.test.tsx (AC: 3, 5, 6, 7)
  - [x] Assert Download icon + "Offline" text absent
  - [x] Assert WifiOff renders when offline
  - [x] Assert aria-label present
- [x] Update trips-mobile-layout.test.tsx (AC: 4, 5)
  - [x] Assert static "Synced offline" text absent
  - [x] Assert WifiOff renders when offline

## Dev Notes

### Architecture Context

**OfflineProvider** follows the exact pattern of `theme-provider.tsx` and `mock-date-provider.tsx` in `src/components/providers/`:
- "use client" at top
- `createContext` + `useContext` hook exported as `useOffline()`
- Provider component wrapping children with context value
- No Dexie dependency in this story — pure `useOnlineStatus()` hook for connectivity

**`useOnlineStatus()`** already exists at `src/lib/offline/use-online-status.ts`. It debounces raw `navigator.onLine` and listens to `online`/`offline` events. This story uses it as-is. (Epic 2 adds a health-check ping for reliable reconnect detection — deferred.)

### Current State of Target Files

- **trips-topbar.tsx**: Has `<Button variant="outline" size="icon-sm" title="Notifications">` with `<Bell>` icon — unused stub. Replace the entire button with the connectivity indicator.
- **trip-detail-crumb.tsx**: Has `<Button variant="outline" size="sm">` with `<Download>` + "Offline" text. Defined at `src/components/packt/trip-detail-crumb.tsx` but NOT currently imported or rendered anywhere — must be wired into the trip detail layout.
- **trips-mobile-layout.tsx**: Lines ~71–82 have `<span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "var(--accent-brand)", marginRight: 6, verticalAlign: "middle" }} />Synced offline` — an always-on static stub. Remove entirely; replace with conditional `WifiOff`.
- **trip-hero.tsx**: `metaTag="ACTIVE TRIP · OFFLINE"` at line 62. Drop `· OFFLINE` → `metaTag="ACTIVE TRIP"`.
- **trip-detail-hero.tsx** (in `src/app/(app)/trips/[tripId]/`): Contains an inline crumb bar with `<Button><Download .../>Offline</Button>` (lines 131–134). This is where TripDetailCrumb should be wired in, replacing the inline crumb's Download/Offline with the connectivity indicator. Also has `heroStatusLabel` with `· OFFLINE` suffixes (lines 67–67) — those are the TripCover metaTag on the trip detail page and are NOT part of this story's ACs (they will need cleanup but defer to avoid scope creep).
- **trip-card.tsx**: `coverMetaTag` already uses `tripStatus.toUpperCase()` with no offline suffix — confirmed no change needed.

### Wiring TripDetailCrumb

The standalone `TripDetailCrumb` component (currently unused) should replace the inline crumb bar in `trip-detail-hero.tsx`. Steps:
1. Modify `trip-detail-crumb.tsx`: swap `Download` button for connectivity indicator (`WifiOff` when offline, hidden when online)
2. Add Edit button to `TripDetailCrumb` (it was missing from the standalone component but is present in the inline bar)
3. Import `<TripDetailCrumb tripName={trip.name} />` in trip-detail-hero.tsx
4. Remove the inline crumb `<div>` (lines 105–136 in trip-detail-hero.tsx) except for the Edit/Share/overflow controls that TripDetailCrumb doesn't have — merge them

Alternative: keep the inline crumb bar in trip-detail-hero.tsx and just update its Download button to WifiOff. The advantage of wiring TripDetailCrumb is eliminating duplicate crumb code. Dev agent chooses the approach.

### Message Behavior for AC 6

The WifiOff click handler shows a simple dismissible overlay/message. No toast API — this isn't a sonner notification. Use a state-based inline dismissible message (a `div` with a close button, not `window.alert` — `window.alert` is fragile in JSDOM tests). Content: "You're offline. Any changes you make will be synced when you're back online." Must be dismissible by user action.

### Testing Requirements

- **New tests:**
  - `src/components/providers/offline-provider.test.tsx` — unit test for context state: online by default, offline when mocked, default values for conflict/pendingCount/pinFailure
- **Updated tests (existing files):**
  - `src/components/packt/trip-hero.test.tsx` — assert metaTag dropped OFFLINE suffix
  - `src/components/packt/trips-topbar.test.tsx` — assert Bell absent, WifiOff conditional, aria-label, click message
  - `src/components/packt/trip-detail-crumb.test.tsx` — assert Download/Offline absent, WifiOff conditional, aria-label
  - `src/components/packt/trips-mobile-layout.test.tsx` — assert "Synced offline" absent, WifiOff conditional
- **Coverage baseline:** maintain existing ≥95% lines/functions, ≥90% branches
- **E2E impact:** No new E2E in this story. The offline-aware connectivity states will be exercised by Epic 2's E2E scenarios.
- Mock `navigator.onLine` via `Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false })` in offline-path tests, consistent with Story 1.4's pattern.

### Previous Story Learnings (1.4)

- **`writeOfflineAware` helper** introduced in Story 1.3; not needed for this story (no write operations).
- **`fakeIndexedDB` pattern** for Dexie tests — not needed here (no Dexie dependency in this story).
- **Coverage enforcement**: Story 1.4 maintained 95%+ across the board. This story must not regress it.
- **File patterns**: New tests colocated with source files; mock setup in test, not vitest.setup.
- **Story 1.4 review findings**: Two decisions pending (UI audit confirmation, param shape alignment with spec) — neither affects this story.

### Known Traps

- **Do not wire the `CloudAlert` conflict state** — that's Epic 2. This story's `conflict` is hardcoded `false`. The `CloudAlert` icon, conflict toast/modal, and "Resolve now" action are all out of scope.
- **Do not create a connectivity-indicator shared component** unless it simplifies the 3-surface wiring. The 3 slots have different container patterns (icon-button in topbar/crumb, bare icon in mobile header) — a shared component may not reduce duplication. Dev agent evaluates.
- **Do not modify `trip-detail-hero.tsx`'s `heroStatusLabel` OFFLINE suffix** — that's a different metaTag on the TripCover for the trip detail hero specifically. Only `trip-hero.tsx`'s hardcoded metaTag is in scope.
- **trip-detail-crumb.tsx must be rendered**, not just updated — currently nowhere in the component tree.
- **Mobile search icon** has `minHeight: 44, minWidth: 44` for touch targets. If adding the connectivity indicator in the same header area, maintain the same minimum tap target dimensions.
- **No sonner toast** for the WifiOff click message — use a simple alert/dialog/popover, not the toast notification infrastructure.

### Architecture Compliance

- All new code follows project conventions: `cn()` for className merging, `strokeWidth={1.5}` on all Lucide icons, `"use client"` as first line, explicit prop interfaces, no `any` types, no single-letter variable names.
- `OfflineProvider` follows the established provider pattern in `src/components/providers/`.
- No component reads `navigator.onLine` directly — all consume `useOffline()` context.
- `OfflineProvider` separates `pinFailure` and `conflict` as independently-nullable fields (per architecture.md). Even though both are unused in this story, the shape must match the fixed contract for Epic 2 compatibility.

### References

- [Source: epics.md lines 186–203] — Full ACs for Story 1.5
- [Source: epics.md lines 68–71] — UX-DR3: connectivity indicator across three slots
- [Source: epics.md lines 69] — UX-DR2: trip-hero.tsx OFFLINE suffix removal
- [Source: epics.md lines 77] — UX-DR10: persistent aria-label on every state-bearing icon
- [Source: DESIGN.md lines 75–90] — Global connectivity indicator icon vocabulary and slot assignments
- [Source: DESIGN.md lines 29–38] — No new colors; icon colors inherited from existing token system
- [Source: EXPERIENCE.md lines 63–65] — State patterns: hidden on online, WifiOff on offline, CloudAlert on conflict
- [Source: EXPERIENCE.md lines 53–54] — Component patterns: connectivity indicator is display/toggle-only
- [Source: EXPERIENCE.md lines 91–94] — Accessibility: persistent aria-label on every state icon
- [Source: architecture.md lines 167–168] — OfflineProvider React Context, mounted in layout.tsx
- [Source: architecture.md lines 253–254] — pinFailure/conflict as distinct context fields
- [Source: architecture.md lines 311–320] — File change matrix: trips-topbar, trip-detail-crumb, trips-mobile-layout, trip-hero, layout.tsx
- [Source: Story 1.4 lines 192–199] — Previous story learnings: fakeIndexedDB pattern, coverage baseline, review approaches
- [Source: project-context.md lines 48–84] — TypeScript conventions, component rules, styling rules
- [Source: project-context.md lines 72–73] — Icon buttons need `title` attribute, `strokeWidth={1.5}`

## Dev Agent Record

### Agent Model Used

GPT-5 Codex

### Debug Log References

- `npm run lint 2>&1`
- `npx tsc --noEmit 2>&1`
- `npm run test:coverage 2>&1`
- `npm run test:e2e:affected 2>&1`
- `npm run build 2>&1`

### Completion Notes List

- Created `OfflineProvider` (context + hook) consuming `useOnlineStatus()`, mounted in `layout.tsx` inside `TooltipProvider`.
- Built a single shared `ConnectivityIndicator` component (icon button + dismissible message) consumed by all three surfaces (topbar, trip detail crumb, mobile header), parameterized via `variant`/`iconSize`/`style` — evaluated against "Known Traps" guidance and judged that the 3 surfaces' click/dismiss/aria logic was identical enough to warrant one component.
- Wired `TripDetailCrumb` into `trip-detail-hero.tsx`, replacing the inline crumb bar entirely (Edit/Share/overflow preserved via a new `onEdit` prop on `TripDetailCrumb`).
- Removed the Bell icon (`trips-topbar.tsx`), the Download/"Offline" button (`trip-detail-crumb.tsx`/inline crumb), and the static dot+"Synced offline" stub (`trips-mobile-layout.tsx`).
- Dropped the `· OFFLINE` suffix from `trip-hero.tsx`'s metaTag; left `trip-detail-hero.tsx`'s separate `heroStatusLabel` OFFLINE suffix untouched per Known Traps.
- During E2E (`test:e2e:affected`), found and fixed a pre-existing hydration-mismatch bug in `useOnlineStatus()`: its `useState` initializer eagerly read the real `navigator.onLine` on the client's first (hydrating) render, diverging from the server's `navigator === undefined` fallback. Because `ConnectivityIndicator` branches between `null` and a full DOM subtree on this value (unlike the hook's other 19 consumers, which only gate attributes/behavior), the mismatch was structurally visible to React and shifted sibling markup in `trip-detail-crumb.tsx`. Fixed by always initializing to `true` (matching the server) and letting the existing mount effect correct it immediately after hydration — this was the only change needed; no consumer behavior changed since the effect already re-synced on mount.
- Added a regression test in `use-online-status.test.ts` that performs a real `renderToString` (SSR) + `hydrateRoot` (client hydration) pass with `navigator.onLine` mocked false, asserting no React hydration-mismatch console error and that the client settles on the correct post-mount value — this directly covers the bug fixed above.
- Final validation: lint clean, `tsc --noEmit` clean, coverage 95.11%/90.08%/95.25%/96.58% (stmts/branch/funcs/lines, all ≥ thresholds), full `test:e2e` suite 157/157 passed (forced full because `use-online-status.ts` is a SHARED_GLOBS file), production build succeeded.

### File List

**New:**
- `src/components/providers/offline-provider.tsx`
- `src/components/providers/offline-provider.test.tsx`
- `src/components/packt/connectivity-indicator.tsx`
- `src/components/packt/connectivity-indicator.test.tsx`

**Modified:**
- `src/app/layout.tsx`
- `src/components/packt/trips-topbar.tsx`
- `src/components/packt/trips-topbar.test.tsx`
- `src/components/packt/trip-detail-crumb.tsx`
- `src/components/packt/trip-detail-crumb.test.tsx`
- `src/app/(app)/trips/[tripId]/trip-detail-hero.tsx`
- `src/app/(app)/trips/[tripId]/trip-detail-hero.test.tsx`
- `src/components/packt/trips-mobile-layout.tsx`
- `src/components/packt/trips-mobile-layout.test.tsx`
- `src/components/packt/trip-hero.tsx`
- `src/components/packt/trip-hero.test.tsx`
- `src/components/packt/trips-desktop-layout.test.tsx`
- `src/lib/offline/use-online-status.ts`
- `src/lib/offline/use-online-status.test.ts`
- `tests/e2e/feature-map.mjs`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

- Added `OfflineProvider` context and a shared `ConnectivityIndicator` component; wired it into the desktop topbar, trip detail crumb, and mobile header, replacing the dead Bell icon, the Download/"Offline" button, and the static "Synced offline" stub. Dropped the `· OFFLINE` suffix from `trip-hero.tsx`'s metaTag. Fixed a hydration mismatch in `useOnlineStatus()` surfaced by the new structural conditional rendering.

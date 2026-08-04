---
title: "Move Schedule Conflict warning into Day Route Strip as an interactive button"
type: "feature"
created: "2026-07-16"
status: "done"
baseline_commit: 36d031d1673150bdef53a3ab45d8247c4fc04094
context: ["_bmad-output/implementation-artifacts/epic-4-context.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The "N tight connection(s) today" schedule-conflict warning (story 4.2) renders as a small, non-interactive pill below the Day Route Strip (story 4.1) and does nothing when clicked. It's visually disconnected from the strip it describes.

**Approach:** Move it inside `DayRouteStrip`'s bordered container, right-aligned, as a real ≥44px `Button`. Clicking it jumps to the first conflicting row using the same `?focus=<eventId>` URL mechanism `expense-table.tsx`'s `handleRowActivate` already uses — `useFocusScroll` (mounted at `page-client.tsx`) picks up the param and scrolls + pulses (`highlight-pulse-ring`) that row. No new scroll/highlight machinery is built.

## Boundaries & Constraints

**Always:** Button renders only when `conflicts.length > 0` (silence at zero is unchanged); keeps icon+word pairing, exact copy ("1 tight connection today" / "N tight connections today" — E2E asserts this text via regex, must not change), `warning-soft`/`warning-ink` colors, and the `aria-live="polite"` wrapper (still always mounted whenever the strip mounts, empty at zero conflicts). Button is ≥44px tall (`Button` `size="lg"` → `h-11`). Route summary text truncates with ellipsis before the button ever wraps to a new line. `ScheduleConflictBadge` and `DayRouteStrip` stay presentational — `DayCardBody` owns the router/search-params wiring, matching how it already owns every other handler passed down.

**Ask First:** none — the click destination (first conflicting row) and layout mechanics (truncate, not wrap) were already confirmed with the user.

**Never:** No standalone/fallback badge rendering outside `DayRouteStrip` — a conflict always implies 2+ Located Items, so the strip is always present whenever conflicts exist. Do not touch `PlaceRow`'s focusability or the row-level "Schedule conflict" `ButtonGroup` control — out of scope. ~~Do not touch `useFocusScroll`~~ — **renegotiated live 2026-07-16**: touching it became necessary, see Spec Change Log.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Conflicts exist | `conflicts.length > 0`, strip renders | Button inside strip, right-aligned, "N tight connection(s) today" | N/A |
| Zero conflicts | `conflicts.length === 0` | No button; `aria-live` wrapper stays mounted empty | N/A |
| Button activated (click/Enter) | user activates the button | Current search params gain/update `focus=<first conflict's currentEventId>`, `router.push(..., { scroll: false })`; existing `useFocusScroll` scrolls + pulses that row | N/A — button is absent when there's nothing to focus |
| Narrow viewport | thumbnail + text + button don't fit one row | Route text truncates with ellipsis; button stays inline, never wraps | N/A |
| Strip absent | `locatedEvents.length < 2` | No conflict UI anywhere for that day (was previously still shown standalone) | N/A |

</frozen-after-approval>

## Code Map

- `src/components/packt/schedule-conflict-badge.tsx` -- pill → real button; needs an `onClick` prop
- `src/components/packt/day-route-strip.tsx` -- bordered flex container the button must live inside, right-aligned
- `src/components/packt/day-card-body.tsx` -- currently renders `<ScheduleConflictBadge>` standalone (line ~262); owns `conflicts` state already
- `src/components/packt/expense-table.tsx:120-123` -- reference pattern for the `router.push('?...focus=...', { scroll: false })` click wiring
- `src/lib/use-focus-scroll.ts` -- scroll+pulse consumer of the `focus` param; had a latent reset bug, fixed live (see Spec Change Log)
- `src/components/ui/button.tsx` -- `size="lg"` gives the required `h-11`
- `tests/e2e/steps/schedule-conflict.steps.ts` -- existing conflict fixtures (`@trip-with-schedule-conflict` etc.) to extend, not duplicate
- `src/app/(app)/trips/[tripId]/page-client.tsx` -- root wrapper had `min-h-full` instead of `h-full`, breaking the intended nested scroll container; fixed live (see Spec Change Log)

## Tasks & Acceptance

**Execution:**

- [x] `src/components/packt/schedule-conflict-badge.tsx` -- replace the `<span>` pill with a `Button` (`variant="ghost"`, `size="lg"`, `rounded-full`, `warning-soft`/`warning-ink` inline style) wired to a new required `onClick` prop; keep icon, count text, sr-only announcement, and `aria-live` wrapper as-is -- makes it a real focusable 44px control
- [x] `src/components/packt/schedule-conflict-badge.test.tsx` -- update to `getByRole("button", ...)`, add a click-fires-`onClick` test, keep existing zero/singular/plural/aria-live/announcement coverage
- [x] `src/components/packt/day-route-strip.tsx` -- add optional `conflictCount?`, `conflictingEventNames?`, `onConflictClick?` props; render `ScheduleConflictBadge` as the last child with `ml-auto shrink-0` when `conflictCount` is set; give the route-summary `<p>` `min-w-0 flex-1 truncate`
- [x] `src/components/packt/day-route-strip.test.tsx` -- add tests: badge shows/hides by `conflictCount`, click invokes `onConflictClick`; confirm the 4 existing tests still pass with the new props omitted
- [x] `src/components/packt/day-card-body.tsx` -- delete the standalone `<ScheduleConflictBadge>` call; import `useRouter`/`usePathname`/`useSearchParams`; add `handleConflictClick` merging `focus=<conflicts[0]?.currentEventId>` into current search params and `router.push(href, { scroll: false })`; pass `conflictCount={conflicts.length}`, `conflictingEventNames`, `onConflictClick={handleConflictClick}` into `<DayRouteStrip>`
- [x] `src/components/packt/day-card-body.test.tsx` -- add a local `next/navigation` mock override (`vi.hoisted`, mirroring `expense-table.test.tsx`) asserting `router.push` receives a `focus=` query on click; update the `DayRouteStrip` mock to accept/surface the new props; move the "wraps badge in aria-live" test onto a 2-located-event day
- [x] `tests/e2e/features/schedule-conflict.feature` -- add a scenario under `@trip-with-schedule-conflict`: clicking the day-level button updates the URL with a `focus` param
- [x] `tests/e2e/steps/schedule-conflict.steps.ts` -- add the `When`/`Then` steps for that scenario (click the button by its accessible name regex; assert `page` URL matches `/focus=/`)
- [x] `src/lib/use-focus-scroll.ts` -- reset `highlightedFocusId`/`dismissedFocusId` when `focusId` changes (adjust-state-during-render pattern) so a repeat click on the same target re-runs the settle/pulse cycle instead of silently no-op'ing
- [x] `src/lib/use-focus-scroll.test.ts` -- add regression test: re-highlights the same event id after it clears and is re-set
- [x] `src/components/packt/day-card-body.tsx` -- `handleConflictClick` detects the "already at this focus id" case and clears-then-resets the param (via a `pendingRefocusEventIdRef` + effect) so `useFocusScroll` actually observes a `focusId` transition on repeat clicks
- [x] `src/app/(app)/trips/[tripId]/page-client.tsx` -- `min-h-full` → `h-full` on the root wrapper so the nested `overflow-y-auto` content div is properly height-bounded and becomes the real (single) scroll container instead of `#main-content`

**Acceptance Criteria:**

- Given a day with 2+ Located Items and 1+ conflicts, when `DayCardBody` renders, then the conflict button appears inside `DayRouteStrip`'s bordered container, right-aligned, ≥44px tall, with unchanged copy/colors.
- Given zero conflicts, when `DayCardBody` renders, then no conflict button exists anywhere, and no standalone `ScheduleConflictBadge` call remains in `day-card-body.tsx`.
- Given the button is activated, when the click handler runs, then the URL's `focus` param is set/updated to the first conflicting event's id while other existing search params are preserved, and the corresponding row scrolls into view and pulses via the existing `useFocusScroll` mechanism.
- Given the strip is too narrow for thumbnail + text + button, when rendered, then the route text truncates and the button never wraps off-row.
- Given AC5 of story 4.2 (live-region announcements), when conflict count or conflicting rows change, then the `aria-live="polite"` behavior is preserved, just relocated inside `DayRouteStrip`.

## Spec Change Log

- **2026-07-16, triggered by:** live manual testing after implementation surfaced two real bugs the automated review didn't catch (both require actually clicking the button in a browser with real timing). **Amended:** the frozen `Never` line's `useFocusScroll` restriction — human explicitly renegotiated it live rather than accepting either a partial fix or reverting. **Known-bad state avoided:** (1) shipping a button whose repeat-click is a silent no-op with no user-visible affordance explaining why; (2) shipping the button while a pre-existing, previously-dormant layout bug it happens to expose (nested double `overflow-y-auto` scroll containers, root cause `min-h-full` vs `h-full` in `page-client.tsx`) causes a visible scrollbar glitch specifically when this button's `scrollIntoView` call runs. **KEEP:** the original click-wiring design (merge into `searchParams`, `router.push`) is correct and unchanged — the fix is entirely in making the retrigger and the layout height chain actually work, not in redesigning the click handler.

## Design Notes

Route-click wiring mirrors `expense-table.tsx:120-123` exactly, except params are merged (not replaced) since we're already on the itinerary surface and must preserve other query state (e.g. `tab`):

```ts
const nextParams = new URLSearchParams(searchParams.toString());
nextParams.set("focus", targetEventId);
router.push(`${pathname}?${nextParams.toString()}`, { scroll: false });
```

## Verification

**Commands:**

- `npx vitest run src/components/packt/schedule-conflict-badge.test.tsx src/components/packt/day-route-strip.test.tsx src/components/packt/day-card-body.test.tsx src/lib/use-focus-scroll.test.ts "src/app/(app)/trips/[tripId]/page-client.test.tsx"` -- expected: all pass (64/64 confirmed)
- `npm run test:e2e:affected` -- expected: `day-route-strip` and `schedule-conflict` features pass (both touched by this change)
- Manual: verified live in Chrome — first click and repeat clicks both scroll+pulse the correct row; all 6 trip-detail tabs (Itinerary/Budget/Reservations/Map/Documents/Packing/Notes) visually checked at desktop width for layout regressions from the `h-full` change. Mobile width was NOT verified (viewport resize tool didn't take effect in this environment) — no mobile-specific classes were touched, but this is unverified, not confirmed-safe.

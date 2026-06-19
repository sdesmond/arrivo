---
baseline_commit: bd3ee40
---

# Story 2.4 — Itinerary CTA and Tap-to-Edit Redirect

**Status:** done
**Epic:** 2 — Reservations Sync to the Itinerary
**Branch:** feature/2-4-itinerary-cta-and-tap-to-edit-redirect

---

## User Story

As a trip planner,
I want a prompt on my Itinerary to add reservations, and to be taken straight to the right Reservation when I tap a Linked Event,
so that I can move fluidly between "what's planned" and "what's booked" without hunting for the right tab or row.

---

## Acceptance Criteria

### AC1 — Itinerary CTA shows correct copy above Day 1

**Given** a trip with zero Reservations
**When** I view the Itinerary
**Then** a compact FR-9 CTA row appears above the first day card with copy "Add reservations for hotels, rentals, and more"

**And Given** a trip with one or more Reservations
**When** I view the Itinerary
**Then** the same CTA row remains visible and changes copy to "Add another reservation"

### AC2 — CTA navigates to Reservations and opens the type picker sequentially

**Given** the FR-9 CTA row
**When** I activate it
**Then** the app navigates to `?tab=res&action=add-reservation`

**And Then** an `aria-live="polite"` region announces the Reservations tab once the tab change has settled

**And Then** the Reservation Type picker opens after the tab switch, with focus on its first menu item

### AC3 — ReservationsTab consumes `action=add-reservation` once

**Given** `ReservationsTab`
**When** it mounts with `action=add-reservation`
**Then** it auto-opens the existing Reservation Type picker

**And Then** it clears only the one-shot `action` param via `router.replace()`, preserving `tab=res` and unrelated params

### AC4 — Linked Event taps navigate to the owning Reservation

**Given** a Linked Event row on the Itinerary or a Linked Event surfaced from the active-trip card
**When** I tap it
**Then** the app navigates to `?tab=res&highlight={reservationId}`

**And Then** the Reservations tab expands the owning type section, scrolls the owning Reservation row into view, and visually highlights that row

### AC5 — ReservationsTab consumes `highlight` once

**Given** `ReservationsTab`
**When** it mounts with `highlight={reservationId}`
**Then** it expands the correct accordion section before scrolling

**And Then** it scrolls to the matching Reservation row, moves focus to that row target, applies a transient non-color-only highlight affordance, and clears only the `highlight` param via `router.replace()`

### AC6 — One-shot params do not retrigger on later tab visits

**Given** either `action=add-reservation` or `highlight={reservationId}` has already been processed
**When** the param has been stripped from the URL
**Then** later tab changes, refreshes, or back/forward navigation do not re-open the picker or re-run the highlight unless a new param is added

### AC7 — Existing manual-event deep links still work

**Given** manual Itinerary or trip-list event links that already use `?focus={eventId}`
**When** this story is implemented
**Then** those manual-event deep links still focus the event as they do today

**And Then** CTA/Linked Event navigation removes stale `focus` params so Reservations flows do not trigger Itinerary-only scroll behavior

### AC8 — Mobile active-trip card stays consistent with desktop

**Given** the mobile active-trip surface consumes the same `todayEvents` data as the desktop `NowCard`
**When** a Linked Event is shown there
**Then** activating it uses the same `?tab=res&highlight={reservationId}` contract instead of the manual-event `focus` contract

---

## Technical Tasks

### [x] Task 1 — Add a dedicated Itinerary CTA component

**New file:** `src/components/packt/itinerary-cta.tsx`

Create one reusable CTA row component for FR-9 instead of duplicating markup inside `trip-itinerary-view.tsx`.

Requirements:

1. Render one full-width `<button>` using the UX shell from `DESIGN.md` / `EXPERIENCE.md`:
   - `h-12`
   - `rounded-[14px]`
   - `1px solid var(--line)`
   - `var(--surface)` background
   - `10px 12px` padding
   - `16px` bottom margin before the first day card
2. Copy switches by reservation count:
   - `0` reservations → "Add reservations for hotels, rentals, and more"
   - `>=1` reservation → "Add another reservation"
3. Accessible name is the full CTA copy plus navigation intent, e.g. `Add reservations for hotels, rentals, and more — opens the Reservations tab`
4. Visual children are `aria-hidden="true"`
5. Use `Luggage` and `ChevronRight`, both `strokeWidth={1.5}`
6. No dismiss button, no secondary description, no new color tokens
7. Define an explicit `ItineraryCtaProps` interface
8. `"use client"` at top because the component handles click interaction

**Why this file:** Epic ACs already name `itinerary-cta.test.tsx`; do not create both `fr9-cta-row.tsx` and `itinerary-cta.tsx`.

### [x] Task 2 — Wire CTA and linked-event navigation from itinerary view

**Update files:**
- `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx`
- `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx`

Current state:

- `TripItineraryView` has `handleLinkedEventTap(): void {}` placeholder
- It has no FR-9 CTA
- `TripDetailTabBody` renders `TripItineraryView` without any Reservations-aware navigation props

Changes:

1. Add Reservations count / presence awareness to `TripItineraryView`
2. Render `<ItineraryCta />` above the first day card and below `UnscheduledEventsSection`
3. Replace the itinerary `handleLinkedEventTap` no-op with a real callback prop from the parent
4. Thread both CTA activation and linked-event taps upward through `TripDetailTabBody`
5. Preserve all existing day-card, unscheduled-events, add-day, and destructive-remove behavior

### [x] Task 3 — Centralize Reservations deep-link navigation in trip detail client

**Update files:**
- `src/app/(app)/trips/[tripId]/page-client.tsx`
- `src/app/(app)/trips/[tripId]/trip-detail-tabs.ts`
- `src/app/(app)/trips/[tripId]/page-client.test.tsx`
- optionally add `src/app/(app)/trips/[tripId]/trip-detail-tabs.test.ts`

Critical current-state discovery:

- `TripDetailClient` only syncs `activeTab` from `initialActiveTab` and `popstate`
- child components using `router.push()` / `router.replace()` with `?tab=res` will not update `activeTab` unless the client also reacts to search-param changes

Required implementation guardrails:

1. Add one canonical helper for Reservations deep links that:
   - sets `tab=res`
   - sets either `action=add-reservation` or `highlight={reservationId}`
   - removes the other one-shot param
   - removes stale `focus`
   - preserves unrelated params such as `new=1`
2. Make `TripDetailClient` react to actual URL/search-param changes, not only `popstate`
3. Keep existing tab-button deep-link behavior intact
4. Add a stable `aria-live="polite"` region at the page-client level for the Reservations-tab announcement
5. The CTA flow must be sequential:
   - URL/tab change first
   - announcement once tab is active
   - picker auto-open second

Do not solve this with a global store.

### [x] Task 4 — Make ReservationsTab consume one-shot search params

**Update files:**
- `src/components/packt/reservations-tab.tsx`
- `src/components/packt/reservation-type-picker.tsx`
- `src/components/packt/reservation-type-section.tsx`
- `src/components/packt/reservation-row.tsx`

Current state:

- `ReservationsTab` owns local drawer and accordion state only
- it does not read search params
- `ReservationTypePicker` is uncontrolled
- `ReservationRow` has no stable row id/highlight contract

Changes:

1. `ReservationsTab` reads `action` / `highlight` from `useSearchParams()`
2. `ReservationsTab` uses `router.replace()` after consuming one-shot params
3. `ReservationTypePicker` gains whatever minimal API is needed for programmatic open
   - preferred: controlled `open` / `onOpenChange`
   - fallback: trigger ref + synthetic click if the menu primitive only moves focus correctly when triggered
4. `ReservationsTab` expands the correct type section before attempting row scroll
5. `ReservationTypeSection` provides the stable DOM target per reservation, e.g. a wrapper with `id`, `data-testid`, `tabIndex={-1}`, and highlight styling around each `ReservationRow`
6. The highlight affordance must not be color-only; pair focus movement with a visible outline/ring or text/ARIA cue
7. Closing the programmatically opened type picker must preserve the menu primitive's normal focus-return behavior
8. Add a transient highlight state that does not introduce a permanent selected-row concept
9. Preserve existing local `openSections`, drawer state, inline-edit flows, docs block behavior, and sorting rules

### [x] Task 5 — Replace Linked Event placeholders on trip-list surfaces

**Update files:**
- `src/components/packt/trips-desktop-layout.tsx`
- `src/components/packt/trips-active-entry-panel.tsx`
- `src/components/packt/mobile-active-tab.tsx`

Current state:

- `NowCard` already calls `onLinkedEventTap(linkedReservationId)` for linked events
- `TripsDesktopLayout` still passes `onLinkedEventTap={() => {}}`
- `MobileActiveTab` still hard-links all events to `?focus={event.id}`, which is wrong for linked reservations

Changes:

1. `trips-desktop-layout.tsx` is already large; before adding new active-entry wiring, extract the active-entry block into `src/components/packt/trips-active-entry-panel.tsx` with:
   - an explicit `TripsActiveEntryPanelProps` interface
   - `"use client"` at top
   - only the active-entry responsibilities now embedded in `trips-desktop-layout.tsx`
2. Desktop active-trip linked events navigate to `/trips/{tripId}?tab=res&highlight={reservationId}` through the existing `NowCard` callback
3. Mobile active-trip linked events use the same Reservations deep-link contract
4. Manual events keep their current `focus` behavior
5. Do not regress existing `NowCard` aria-label behavior from Story 2.3

### [x] Task 6 — Extend E2E coverage in the existing linked-events feature

**Update files:**
- `tests/e2e/features/linked-events.feature`
- `tests/e2e/steps/linked-events.steps.ts`

Add scenarios for:

1. Tapping the FR-9 CTA on the Itinerary and landing on Reservations with the type picker open
2. Tapping a Linked Event on the Itinerary and landing on Reservations with the correct accordion expanded and the matching row highlighted

Use scenario-owned fixture creation only. No new global seed rows in `global-setup.ts`.

### Review Findings

- [x] [Review][Patch] Same-value one-shot params cannot rerun while `ReservationsTab` stays mounted [src/components/packt/reservations-tab.tsx:43]
- [x] [Review][Patch] Linked-events E2E scenarios reuse the base seed trip start date, risking nondeterministic trip lookup collisions [tests/e2e/steps/linked-events.steps.ts:131]
- [x] [Review][Patch] Unknown `highlight` targets are stripped before a matching reservation can be resolved, turning stale or racey deep links into silent no-ops [src/components/packt/reservations-tab.tsx:70]

---

## Previous Story Intelligence

### Story 2.3 learnings that must carry forward

1. `NowCard` already has correct Linked Event rendering, aria-label composition, and `onLinkedEventTap` plumbing. Story 2.4 must only replace the caller-side placeholder with real navigation.
2. Story 2.3's artifact said the placeholder lived in `page.tsx`, but current code uses `src/components/packt/trips-desktop-layout.tsx`. Update the real caller, not the stale story note.
3. Linked Event marker fields remain the sole contract:
   - `linkedReservationId`
   - `reservationType`
4. `todayEvents` already includes derived Linked Events. Do not re-fetch or re-derive in UI components.

### Existing codebase behaviors to preserve

1. `useFocusScroll()` already handles manual-event `focus` deep links. Reservations flows must not break it.
2. `TripDetailTab.Reservations` and `ReservationsTab` already exist. Do not create a new route segment or alternate Reservations shell.
3. `ReservationsTab` already sorts sections by next-upcoming reservation and rows by `startAt`; keep those behaviors while adding highlight/auto-open state.

---

## Dev Notes

### Core implementation risks

1. **Active-tab sync bug if only child navigation changes**
   - `page-client.tsx` currently updates `activeTab` from initial props and `popstate` only.
   - If a child calls `router.push('/trips/{id}?tab=res&highlight=...')`, the URL can change while the rendered tab stays on Itinerary.
   - Story implementation must make tab state follow live query-string changes.

2. **`useSearchParams()` is read-only**
   - Per Next.js docs, `useSearchParams()` returns a read-only `URLSearchParams`-like object.
   - To clear one-shot params, clone into a mutable `URLSearchParams`, then navigate with `router.replace()`.

3. **Auto-open must move focus**
   - Simply toggling local open state is not enough if the menu primitive does not transfer focus into the first item.
   - Validate focus lands in the first Reservation Type option after CTA navigation.

4. **Avoid stale `focus` collisions**
   - Manual-event deep links still use `?focus={eventId}`.
   - CTA/highlight navigation must delete `focus` or the Itinerary-only scroll hook can fire on the Reservations path.

5. **Highlight must not become durable selection**
   - `highlight` is a one-shot onboarding affordance, not a stored row-selection state.
   - Strip the param after use, keep only local transient UI state.

### File-specific guidance

#### `src/app/(app)/trips/[tripId]/page-client.tsx`

- Best place for:
  - canonical Reservations-tab navigation helper
  - `aria-live` announcement state
  - synchronizing `activeTab` from live URL state
- Preserve existing query-param preservation behavior from `buildTripDetailTabHref()`

#### `src/components/packt/reservation-type-picker.tsx`

- Current picker is:
  - uncontrolled
  - trigger-driven
  - built on `DropdownMenu`
- Any API extension must preserve existing plain usages in:
  - populated Reservations tab header
  - FR-6 empty state

#### `src/components/packt/reservation-row.tsx`

- Current root row already owns many dialogs and inline-edit states.
- Add highlight/scroll targeting without breaking:
  - provider inline edit
  - date editing
  - document toggles
  - delete dialog

#### `src/components/packt/mobile-active-tab.tsx`

- Not named in the original story, but it consumes the same `todayEvents` and currently uses manual-event `focus` links for everything.
- If left unchanged, linked reservations on mobile route to nonexistent event-focus targets instead of Reservations.
- Treat this as required existing-system preservation, not optional polish.

### Architecture compliance

1. No new server actions
2. No schema changes
3. No new global store
4. No new route segment
5. No new color tokens
6. No arbitrary Tailwind values
7. Keep `"use client"` at the top of every interactive component you modify/create

---

## Latest Tech Information

1. Next.js `useSearchParams` docs (latest version page shows 16.2.2, last updated March 31, 2026) say it is a Client Component hook and returns a read-only `URLSearchParams` interface.
2. Next.js `useRouter` docs say `router.replace(href)` performs client-side navigation without adding a browser-history entry, which matches the requirement to strip one-shot params after consumption.
3. Next.js `useRouter` docs also recommend composing `usePathname` and `useSearchParams` when reacting to route changes in Client Components; that matches this story's need to keep `activeTab` synchronized with live query-string changes.
4. Next.js `usePathname` docs confirm pathname/search-param reactions belong in Client Components, which fits `TripDetailClient` and `ReservationsTab`.

Do not introduce `next/router`; App Router code must continue to use `next/navigation`.

---

## Testing Requirements

### Unit / component tests to add or update in this story

- `src/components/packt/itinerary-cta.test.tsx`
  - zero-reservations copy
  - one-or-more-reservations copy
  - single-button accessible name
  - click delegates to navigation callback
- `src/app/(app)/trips/[tripId]/trip-itinerary-view.test.tsx`
  - CTA renders above day stack
  - CTA click calls the Reservations navigation callback
  - linked-event tap is no longer a dead no-op inside itinerary wiring
- `src/app/(app)/trips/[tripId]/page-client.test.tsx`
  - live URL/query changes update `activeTab`
  - deep-link helper preserves unrelated params
  - Reservations navigation deletes stale `focus`
  - returning to itinerary still removes `tab`
- `src/components/packt/reservations-tab.test.tsx`
  - mount with `action=add-reservation` opens picker, then strips param
  - mount with `highlight={id}` expands correct section, scrolls/highlights row, then strips param
  - one-shot params do not retrigger after cleanup
- `src/components/packt/reservation-type-picker.test.tsx`
  - controlled/imposed-open path still renders menu items
  - focus lands on first item after programmatic open if that logic lives here
- `src/components/packt/reservation-type-section.test.tsx`
  - highlighted reservation wrapper gets target id / `tabIndex={-1}` / non-color-only affordance
- `src/components/packt/trips-active-entry-panel.test.tsx`
  - linked-event activation delegates to Reservations highlight navigation
  - manual events still use `focus`
- `src/components/packt/trips-desktop-layout.test.tsx`
  - extracted active-entry panel wiring still renders the active trip and passes edit/delete callbacks
- `src/components/packt/mobile-active-tab.test.tsx`
  - linked-event card/list rows use Reservations highlight links
  - manual events still use `focus`
- `src/app/(app)/trips/[tripId]/trip-detail-tabs.test.ts`
  - if helper logic grows, add direct coverage for search-param mutation behavior

### E2E coverage required in this story

- `tests/e2e/features/linked-events.feature`
  - `Scenario: Tapping the itinerary CTA opens Reservations with the type picker`
  - `Scenario: Tapping a Linked Event opens Reservations with the row highlighted`
- `tests/e2e/steps/linked-events.steps.ts`
  - add reusable steps for CTA activation, Reservations-tab assertion, expanded-section assertion, highlighted-row assertion

### Explicit non-goals for tests

- Do not add feature-specific records to `tests/e2e/global-setup.ts`
- Do not duplicate Story 2.1 / 2.3 rendering assertions that are already covered unless needed to prove new navigation behavior

---

## References

- `_bmad-output/epics.md` — Epic 2 / Story 2.4 acceptance criteria
- `_bmad-output/architecture.md` — Frontend Architecture, Naming Patterns, Structure Patterns
- `_bmad-output/prds/prd-packt-2026-06-12/prd.md` — FR-9, FR-11, UJ-1, UJ-4
- `_bmad-output/ux-designs/ux-packt-2026-06-13/DESIGN.md` — FR-9 CTA row visual spec, linked-event visual rules
- `_bmad-output/ux-designs/ux-packt-2026-06-13/EXPERIENCE.md` — sequential navigation, `aria-live`, Reservations-tab behavior
- `_bmad-output/project-context.md` — Packt implementation rules
- `_bmad-output/implementation-artifacts/2-3-now-card-surfaces-linked-events.md` — prior story learnings and corrected assumptions
- `https://nextjs.org/docs/app/api-reference/functions/use-search-params`
- `https://nextjs.org/docs/app/api-reference/functions/use-router`
- `https://nextjs.org/docs/app/api-reference/functions/use-pathname`

---

## Definition of Done

- [x] FR-9 CTA renders on Itinerary with correct zero/nonnull reservation copy
- [x] CTA navigation is sequential: tab change, live-region announcement, picker open, first-item focus
- [x] Linked Event taps route to Reservations with correct `highlight` target
- [x] Reservations tab expands, scrolls, and highlights the correct row from a deep link
- [x] One-shot params are stripped with `router.replace()` after consumption
- [x] Manual-event `focus` deep links still work
- [x] Desktop and mobile active-trip linked-event surfaces use the same Reservations deep-link contract
- [x] Required unit/component tests are updated in the same change
- [x] Required E2E scenarios are updated in the same change

---

## Dev Agent Record

### Completion Notes

- Implemented all 6 tasks: `ItineraryCta` component; CTA + linked-event wiring through `TripItineraryView`/`TripDetailTabBody`; a canonical `buildReservationsDeepLinkHref()` helper in `trip-detail-tabs.ts` plus reactive `activeTab`/aria-live announcement sync in `page-client.tsx`; one-shot `action`/`highlight` param consumption in `ReservationsTab` with a controlled `ReservationTypePicker` and a stable highlight/scroll/focus target on `ReservationRow`; extraction of `TripsActiveEntryPanel` and a Reservations-aware `MobileActiveTab`; new E2E scenarios for the CTA and Linked Event deep-link flows.
- Fixed a pre-existing, unrelated bug in `NowCard` (confirmed present on baseline `bd3ee40`): `displayEvent` selection required `startAt`, so a Linked Event with no time never rendered even though its own test expected a "time not set" fallback. Added a third fallback tier (`undatedLinkedEvent`) scoped to linked events only, so untimed manual events still correctly render nothing (existing test preserved).
- Discovered and fixed a real regression introduced by the new CTA's accessible name: several E2E steps used non-exact `getByRole("button", { name: "Reservations" })` to click the tab button, which started also matching the CTA's "...opens the Reservations tab" label. Added `exact: true` at all 6 call sites (`linked-events.steps.ts`, `reservations.steps.ts`).
- Full validator run is green: lint, tsc, build, and E2E (145/145) all pass; unit coverage is 2238/2238 passing with lines 96.31% / functions 95.19% / branches 90.57% (all above the 95/95/90 thresholds). One known-flaky, pre-existing, unrelated unit test (`save-as-template-dialog.test.tsx`, async `waitFor` timing) was confirmed to fail intermittently on unmodified baseline too and was left untouched per scope.

### Debug Log

- `now-card.test.tsx > renders Linked Event with fallback aria-label when startAt is missing` failed under `npm run test:coverage`; root-caused to `now-card.tsx`'s `currentEvent`/`nextEvent` derivation requiring `startAt`, confirmed pre-existing on `bd3ee40`, fixed with user approval.
- E2E full-suite run surfaced `strict mode violation` on `getByRole('button', { name: 'Reservations' })` in two pre-existing linked-events scenarios once the new CTA was rendered; fixed by scoping those locators with `exact: true`.

### File List

**New files:**
- `src/components/packt/itinerary-cta.tsx`
- `src/components/packt/itinerary-cta.test.tsx`
- `src/components/packt/trips-active-entry-panel.tsx`
- `src/components/packt/trips-active-entry-panel.test.tsx`
- `src/app/(app)/trips/[tripId]/trip-detail-tabs.test.ts`

**Modified files:**
- `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx`
- `src/app/(app)/trips/[tripId]/trip-itinerary-view.test.tsx`
- `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx`
- `src/app/(app)/trips/[tripId]/page-client.tsx`
- `src/app/(app)/trips/[tripId]/page-client.test.tsx`
- `src/app/(app)/trips/[tripId]/trip-detail-tabs.ts`
- `src/components/packt/reservations-tab.tsx`
- `src/components/packt/reservations-tab.test.tsx`
- `src/components/packt/reservation-type-picker.tsx`
- `src/components/packt/reservation-type-picker.test.tsx`
- `src/components/packt/reservation-type-section.tsx`
- `src/components/packt/reservation-type-section.test.tsx`
- `src/components/packt/reservation-row.tsx`
- `src/components/packt/reservation-row.test.tsx`
- `src/components/packt/trips-desktop-layout.tsx`
- `src/components/packt/mobile-active-tab.tsx`
- `src/components/packt/mobile-active-tab.test.tsx`
- `src/components/packt/now-card.tsx` (pre-existing bug fix, see Completion Notes)
- `tests/e2e/features/linked-events.feature`
- `tests/e2e/steps/linked-events.steps.ts`
- `tests/e2e/steps/reservations.steps.ts` (E2E locator fix, see Completion Notes)

## Change Log

- 2026-06-19: Implemented Story 2.4 — FR-9 Itinerary CTA, sequential Reservations deep-link navigation (CTA + Linked Event taps), one-shot `action`/`highlight` search-param consumption in `ReservationsTab`, and consistent desktop/mobile Linked Event routing. Fixed a pre-existing `NowCard` bug (untimed Linked Events never displayed) and an E2E locator collision caused by the new CTA's accessible name.

---

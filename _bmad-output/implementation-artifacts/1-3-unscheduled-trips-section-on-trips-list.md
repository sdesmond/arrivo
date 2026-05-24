# Story 1.3: Unscheduled Trips Section on Trips List

Status: done

## Story

As a traveler,
I want dateless trips to appear in a dedicated Unscheduled section at the top of my trips list,
so that trips I haven't scheduled yet are easy to find and don't disappear into other sections.

## Acceptance Criteria

1. Given I have at least one dateless trip, when I view the trips list, then an "Unscheduled" section appears above the Upcoming section.
2. Given I have no dateless trips, then the Unscheduled section is not rendered on the trips list.
3. Given the Unscheduled section is visible, then it is visually distinct from the Upcoming, Active, and Past sections (different label style, color, or icon treatment).
4. Given a dateless trip in the Unscheduled section, when I click it, then I navigate to its detail page.
5. Given a trip that was dateless is updated to have dates, then it moves out of the Unscheduled section and into the correct status section (Upcoming/Active/Past).

**FRs:** FR11, FR12

## Tasks / Subtasks

- [ ] Split `src/app/(app)/trips/page-client.tsx` before adding more code (298 lines — REQUIRED pre-step)
  - [ ] Extract desktop layout JSX (current lines ~113-173) into `src/components/packt/trips-desktop-layout.tsx` — accepts props: `activeEntry`, `upcomingTrips`, `pastTrips`, `unscheduledEntries`, `now`, `dateFormat`, `nextInDays`, `onNewTrip`, `onEditTrip`; wraps with `"use client"` and renders desktop div with Topbar + section grid
  - [ ] Extract mobile layout JSX (current lines ~177-263) into `src/components/packt/trips-mobile-layout.tsx` — accepts props: `activeEntry`, `upcomingTrips`, `pastTrips`, `unscheduledEntries`, `now`, `dateFormat`, `mobileTab`, `onTabChange`, `onNewTrip`; wraps with `"use client"` and renders mobile div with tabs
  - [ ] Both extracted components receive `unscheduledEntries` to render the Unscheduled section and mobile tab conditionally (this story's feature work) — the split happens in one commit, then the unscheduled logic is added in the same pass
  - [ ] Confirm `page-client.tsx` is under 100 lines after extraction
- [ ] Add an UnscheduledSection component (AC: 1, 2, 3)
  - [ ] Create `src/components/packt/unscheduled-section.tsx` — renders SectionHead with "Unscheduled" title, distinct visual style, and TripCard grid for dateless trips
  - [ ] Use a distinct icon (e.g., `CalendarOff` from lucide) with `strokeWidth={1.5}` and different color treatment
  - [ ] Hide section entirely when `trips` array is empty — conditional render, not CSS visibility
- [ ] Separate unscheduled entries in trips page client (AC: 1, 5)
  - [ ] In `src/app/(app)/trips/page-client.tsx`, split `initialEntries` into `unscheduledEntries` and `datedEntries` using `!e.trip.startDate`
  - [ ] Filter `datedEntries` by status for Active/Upcoming/Past sections
  - [ ] Pass `unscheduledEntries` to both `TripsDesktopLayout` and `TripsMobileLayout`
  - [ ] Update Topbar `tripCount` to include unscheduled count
- [ ] Add Unscheduled mobile tab (AC: 1, 3)
  - [ ] Create `MobileUnscheduledTab` in `src/components/packt/trips-mobile-tabs.tsx` — render dateless trip cards
  - [ ] In `TripsMobileLayout`, conditionally prepend `"Unscheduled"` to the mobile tabs array when unscheduled entries exist
  - [ ] Filter unscheduled trips out of mobile upcoming/past tabs
- [ ] Update query ordering (AC: 1, 5)
  - [ ] In `src/lib/queries.ts`, change `listTripsForUser` to `ORDER BY trips.startDate NULLS FIRST, trips.name` — dateless trips come first
- [ ] Write unit tests
  - [ ] Add `src/components/packt/unscheduled-section.test.tsx` — renders when trips provided, hides when empty, links work
  - [ ] Add `src/app/(app)/trips/page-client.test.tsx` — separation into unscheduled vs dated, section render/hide, mobile tab
  - [ ] Add `src/components/packt/trips-desktop-layout.test.tsx` — renders all sections, unscheduled section conditional
  - [ ] Add `src/components/packt/trips-mobile-layout.test.tsx` — renders tabs, unscheduled tab conditional
  - [ ] Update `src/components/packt/trips-mobile-tabs.test.tsx` — add MobileUnscheduledTab tests
- [ ] Write E2E tests
  - [ ] Add scenario to `tests/e2e/features/trips.feature`: create dateless trip → verify Unscheduled section → click navigates to detail page

## Dev Notes

### Current Implementation Context

`getTripStatus(undefined, undefined)` returns `"upcoming"` (Story 1.2). Story 1.3 does NOT change `getTripStatus` — it separates dateless trips by checking `startDate` presence BEFORE status filtering. This is the correct approach: datelessness is a property of the data, not the status.

Current filter that silently includes unscheduled in Upcoming:
```ts
const upcomingEntries = initialEntries.filter(
  (e) => getTripStatus(e.trip.startDate, e.trip.endDate, now) === "upcoming"
);
```

After Story 1.3 — separate unscheduled first, then filter remaining by status:
```ts
const unscheduledEntries = initialEntries.filter((e) => !e.trip.startDate && !e.trip.endDate);
const datedEntries = initialEntries.filter((e) => e.trip.startDate && e.trip.endDate);
const activeEntries = datedEntries.filter((e) => getTripStatus(e.trip.startDate, e.trip.endDate, now) === "active");
const upcomingEntries = datedEntries.filter((e) => getTripStatus(e.trip.startDate, e.trip.endDate, now) === "upcoming");
const pastEntries = datedEntries.filter((e) => getTripStatus(e.trip.startDate, e.trip.endDate, now) === "past");
```

The split is mutually exclusive — every entry goes into exactly one category. Do not filter `initialEntries` twice.

### Current State of Files Being Modified

**`src/app/(app)/trips/page-client.tsx`** — Currently 298 lines (exceeds the 250-line limit). Defines state, filters, handlers, AND both desktop + mobile layout JSX. REQUIRED pre-step: split into orchestrator + two layout components. The file holds:

| Section | Lines | Extraction target |
|---------|-------|-------------------|
| Imports + types + props | 1-37 | stays in page-client |
| State, filters, handlers | 39-108 | stays in page-client |
| Desktop layout JSX | 113-173 | → `TripsDesktopLayout` |
| Mobile layout JSX | 177-263 | → `TripsMobileLayout` |
| Dialogs (TripEditSheet, NewTripAlert, etc.) | 265-297 | stays in page-client |

After extraction, `page-client.tsx` delegates:
```tsx
return (
  <>
    <TripsDesktopLayout ... />
    <TripsMobileLayout ... />
    <TripEditSheet ... />
    <NewTripDialog ... />
    <AlertDialog ... />
  </>
);
```

Topbar `tripCount` = `activeEntries.length + upcomingEntries.length`. Mobile tab array `["Active", "Upcoming", "Past"]` is hardcoded at line 232 — moves to TripsMobileLayout after split.

**`src/lib/queries.ts` `listTripsForUser` (line 78)** — `.orderBy(trips.startDate)` puts NULLs last. Change to NULLS FIRST:
```ts
import { sql } from "drizzle-orm";
.orderBy(sql`${trips.startDate} NULLS FIRST, ${trips.name}`);
```

**`src/components/packt/trips-mobile-tabs.tsx`** — Has `MobileActiveTab`, `MobileUpcomingTab`, `MobilePastTab`. Add `MobileUnscheduledTab` that renders dateless trips with unscheduled badge. Does NOT need `now` prop since dates are absent.

**`src/components/packt/trip-card.tsx`** — Already handles dateless trips: line 73 shows `"unscheduled"` badge when `inDays === null`; line 29 shows `"No dates"` for dateLine. No changes needed.

### Architecture Guardrails

- **No changes to:** `src/data/types.ts`, `src/lib/utils.ts`, `src/lib/db-mappers.ts`, `src/app/(app)/trips/actions.ts`, `src/app/(app)/trips/create-trip-days.ts`, `src/app/(app)/trips/page.tsx`, `src/app/(app)/trips/[tripId]/page.tsx`, `src/app/(app)/trips/[tripId]/page-client.tsx`, `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts`, `src/app/(app)/trips/[tripId]/trip-detail-tab-body.tsx`, `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx`, `src/components/packt/trip-card.tsx`, `src/components/packt/new-trip-card.tsx`, `src/components/packt/trips-topbar.tsx`, `src/components/packt/trips-section-head.tsx`, `src/components/packt/past-trips-list.tsx`, `src/components/packt/now-card.tsx`, `src/components/packt/day-ribbon.tsx`
- `"use client"` must be first line of any new interactive component
- **CSS custom properties only** — no hardcoded hex/rgb values
- `cn()` for className merging — no string concat
- **Lucide icons: `strokeWidth={1.5}`** — icon-only buttons need `title`
- **No `new Date()` for "now"** — use `now` prop from server; `useNow()` from mock-date-provider
- **`TripStatus` stays computed-only** — `getTripStatus` unchanged
- **SectionHead already generic** — `src/components/packt/trips-section-head.tsx` accepts `title`, `count`, `children`. Reuse as-is.

### Visual Distinction for Unscheduled Section (UX-DR4)

The Unscheduled section must be visually distinct from Upcoming/Active/Past:
- Use `CalendarOff` or `Clock` icon (lucide) in the SectionHead
- Title uses `var(--fg-2)` or `var(--fg-3)` instead of `var(--fg)` to signal it's a "system" section
- Badge on TripCard already shows `"unscheduled"` for dateless trips — consistent

### Testing Requirements

- UnscheduledSection component: renders with trip list, heading text, count, hidden when empty
- MobileUnscheduledTab: renders dateless trip names, "unscheduled" badge, "no docs" badge
- Page client: unscheduled/dated separation, section render/hide, topbar count, mobile tab condition
- E2E: create dateless trip → verify section on reload → nav to detail page

### Previous Story Intelligence

**Story 1.2 established:**
- Dates are optional on `Trip`, `CreateTripInput`, and DB schema
- `getTripStatus` returns `"upcoming"` for null/undefined dates — Story 1.3 must NOT change this
- Day generation returns empty array when no startDate
- `buildDayRows` extracted as own module — no changes needed
- `createTrip` in action uses `db.transaction` — unscheduled creation already works
- `page-client.tsx` was modified for `NewTripDialog` + `createTrip` wiring — the unscheduled separation goes in the same file, in the filter section (lines 46-50)
- `listTripsForUser` uses `ORDER BY trips.startDate` — change to NULLS FIRST

### Git Intelligence

Recent commits confirm pairing pattern: Story 1.1 (modal) → Story 1.2 (server action + trip page). Story 1.2 split the trip-detail `page-client.tsx` (extracted `useTripDetailHandlers`) and `day-card.tsx` (extracted DnD orchestration). This story follows the same pattern by splitting the trips-list `page-client.tsx` before adding feature code. Tests colocated, E2E in `tests/e2e/features/`. Verification: `npm test -- --run` then `npm run build`.

### Post-Creation Trip Status Flow

When user creates dateless trip (Story 1.2) → `redirect("/trips/{id}?new=1")` → stays on trip detail page. When user navigates back to `/trips` → `listTripsForUser` returns trip with NULL dates → `page-client.tsx` renders it in Unscheduled section. When user edits trip to add dates (TripEditSheet) → `updateTripMetadata` → `revalidatePath("/trips")` → fresh render → trip moves from Unscheduled to correct status section automatically.

## Testing Requirements

### Unit Tests — `src/components/packt/unscheduled-section.test.tsx` (new)

```tsx
// Renders trip name in the section
// Shows "Unscheduled" heading
// Shows correct count (e.g., "2 TRIPS")
// Each trip links to its detail page
// Does not render when trips array is empty
// Edit button works when onEditTrip provided
```

### Unit Tests — `src/components/packt/trips-mobile-tabs.test.tsx` (update)

Add MobileUnscheduledTab tests:
```tsx
// Renders dateless trip names
// Shows "unscheduled" badge for each trip
// Shows "no docs" badge when docs absent
```

### Unit Tests — `src/app/(app)/trips/page-client.test.tsx` (new)

The page-client is now a thin orchestrator — test its composition logic:
```tsx
// Separates unscheduled entries from dated entries
// Passes correct props to TripsDesktopLayout
// Passes correct props to TripsMobileLayout
// TripEditSheet opens with correct trip
// NewTripDialog wired to handlers
```

### Unit Tests — `src/components/packt/trips-desktop-layout.test.tsx` (new)

```tsx
// Renders Topbar with correct tripCount
// Renders NowCard and DayRibbon when activeEntry present
// Renders Upcoming section with TripCards
// Renders Past section with PastTripsList
// Renders UnscheduledSection when unscheduledEntries non-empty
// Does NOT render UnscheduledSection when unscheduledEntries empty
// NewTripCard renders at end of grid
```

### Unit Tests — `src/components/packt/trips-mobile-layout.test.tsx` (new)

```tsx
// Renders correct mobile layout with tab navigation
// Shows "Unscheduled" tab conditionally when unscheduled entries exist
// Filters unscheduled trips out of upcoming/past tab content
// Active tab renders MobileActiveTab
// Upcoming tab renders MobileUpcomingTab
// Past tab renders MobilePastTab
// Unscheduled tab renders MobileUnscheduledTab
```

### E2E Tests — `tests/e2e/features/trips.feature` (update)

```gherkin
Scenario: Dateless trip appears in Unscheduled section
  Given I am signed in
  When I open the New Trip dialog
  And I type "Unscheduled Test Trip" in the title field
  And I click the Create button
  Then I am on the trip detail page for "Unscheduled Test Trip"
  When I navigate to the trips list
  Then I see an "Unscheduled" section with "Unscheduled Test Trip"
```

## Review Findings

### Patch
- [x] [Review][Patch] `getTripDays` called on dateless trips renders "0 DAYS" in MobileUnscheduledTab [`src/components/packt/trips-mobile-tabs.tsx`]
- [x] [Review][Patch] Stale `mobileTab` state — when Unscheduled tab disappears from tab array, active indicator is lost and tab content goes blank [`src/components/packt/trips-mobile-layout.tsx` / `src/app/(app)/trips/use-trips-page-handlers.ts`]
- [x] [Review][Patch] Two E2E steps missing for the new scenario: "I navigate to the trips list" and "I see an 'Unscheduled' section with {string}" [`tests/e2e/steps/trips.steps.ts`]
- [x] [Review][Patch] SQL ORDER BY uses single `sql\`\`` template with comma — split into two `.orderBy()` args to guarantee two-column sort [`src/lib/queries.ts`]
- [x] [Review][Patch] `React.startTransition` should use the destructured `startTransition` from the same import — `React` default import is otherwise unused [`src/app/(app)/trips/use-trips-page-handlers.ts`]
- [x] [Review][Patch] `MobileTab` type duplicated in `trips-mobile-layout.tsx` — import the exported type from `use-trips-page-handlers.ts` instead [`src/components/packt/trips-mobile-layout.tsx`]
- [x] [Review][Patch] `SectionHead` title hardcoded to `var(--fg)` — spec guardrail requires Unscheduled section title to use `var(--fg-2)` or `var(--fg-3)` for visual distinction; add optional `titleColor` prop to `SectionHead` [`src/components/packt/trips-section-head.tsx`, `src/components/packt/unscheduled-section.tsx`]

### Deferred
- [x] [Review][Defer] Half-dated trip (startDate only or endDate only) routed to Upcoming with "0 DAYS" display [`src/app/(app)/trips/use-trips-page-handlers.ts`] — deferred, pre-existing data model gap; story 1.3 does not address partial-date entries
- [x] [Review][Defer] `nextInDays` can render as `Infinity` when only half-dated trips exist in upcoming [`src/app/(app)/trips/use-trips-page-handlers.ts`] — deferred, same root as above
- [x] [Review][Defer] Multiple simultaneous active trips: only first shown, rest silently dropped — deferred, pre-existing behavior unchanged by this story
- [x] [Review][Defer] `updateTripMetadata` fire-and-forget drops server errors silently — deferred, pre-existing behavior
- [x] [Review][Defer] `submitCreateTrip` exposed in hook return value, allowing callers to bypass 30/45-day guards — deferred, design concern; the only current caller (AlertDialog) is safe

## File List (Expected)

- `src/components/packt/unscheduled-section.tsx` (new)
- `src/components/packt/unscheduled-section.test.tsx` (new)
- `src/components/packt/trips-desktop-layout.tsx` (new — extracted from page-client.tsx)
- `src/components/packt/trips-desktop-layout.test.tsx` (new)
- `src/components/packt/trips-mobile-layout.tsx` (new — extracted from page-client.tsx)
- `src/components/packt/trips-mobile-layout.test.tsx` (new)
- `src/app/(app)/trips/page-client.tsx` (updated — split + unscheduled logic)
- `src/app/(app)/trips/page-client.test.tsx` (new)
- `src/components/packt/trips-mobile-tabs.tsx` (updated)
- `src/components/packt/trips-mobile-tabs.test.tsx` (updated)
- `src/lib/queries.ts` (updated)
- `tests/e2e/features/trips.feature` (updated)
- `tests/e2e/steps/trips.steps.ts` (updated or new)

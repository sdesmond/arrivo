---
title: "Travel History section for past trips"
type: "feature"
created: "2026-06-20"
status: "done"
context: []
baseline_commit: "ee0afb2a184a2b8f82bbfada78281afe54450145"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Past trips currently live inside the Trips page ("Past" section on desktop, "Past" tab on mobile). The sidebar already links to `/travel-history` (Clock icon) but that route doesn't exist, so past trips have no dedicated home.

**Approach:** Remove past trips from the Trips page entirely and give them a new `/travel-history` route: a chronological list (most recent trip first) with the same cards/list view toggle the Trips page already has, plus edit/delete trip parity and an empty state consistent with the rest of the app.

## Boundaries & Constraints

**Always:**

- A trip counts as "past" via the existing `getTripStatus(startDate, endDate, now)` returning `"past"` — never re-derive status differently.
- Sort past trips by `endDate` descending (most recent first); `getTripStatus` only returns `"past"` when both `startDate` and `endDate` are set, so no fallback sort key is needed.
- Reuse existing pieces rather than rebuilding them: `PastTripsList` (desktop cards/list rendering), `MobilePastTab` (mobile rendering), `TripEditSheet` + `DeleteTripAlertDialog` (edit/delete), `updateTripMetadata`/`deleteTrip` actions from `src/app/(app)/trips/actions.ts`.
- Empty state uses `Empty`/`EmptyHeader`/`EmptyMedia`/`EmptyTitle`/`EmptyDescription` from `@/components/ui/empty` (same pattern as `trip-docs-tab.tsx`, `reservations-tab.tsx`, `template-library.tsx`), with a `Clock` icon to match the sidebar nav item.
- View-mode toggle (cards/list) only appears on desktop, persisted via its own cookie+localStorage key (`travel-history-view-mode`) — independent of the Trips page's `trips-view-mode` key. Mobile has no toggle, matching today's Trips mobile behavior.
- `sidebar-nav.tsx` already has the nav entry and active-path logic — no changes needed there.

**Ask First:** none.

**Never:** Do not add trip creation from this page. Do not change `getTripStatus` semantics or the `upcoming`/`active` sections of the Trips page.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Multiple past trips | 3 trips with distinct past date ranges | Listed most-recent `endDate` first | N/A |
| No past trips | User has zero trips with status `"past"` | Empty state renders (Clock icon, title, description) | N/A |
| Edit past trip | User opens edit sheet, changes name, saves | `updateTripMetadata` called, sheet closes, list reflects new name | Toast error on failure, sheet stays open |
| Delete past trip | User confirms delete dialog | `deleteTrip` called, trip removed from list | Toast error on failure, dialog stays open |
| Toggle view mode | User clicks "List" on desktop | View switches to list rows, persisted to cookie + localStorage | N/A |

</frozen-after-approval>

## Code Map

- `src/app/(app)/trips/use-trips-page-handlers.ts` -- drop `pastEntries`/`pastTrips` computation and `"Past"` from `MobileTab`
- `src/app/(app)/trips/page-client.tsx` -- stop passing `pastTrips` to the two layouts
- `src/components/packt/trips-desktop-layout.tsx` -- remove `pastTrips` prop + "Past" `SectionHead`/`PastTripsList` block + now-unused imports
- `src/components/packt/trips-mobile-layout.tsx` -- remove `pastTrips` prop, drop `"Past"` tab + `MobilePastTab` usage
- `src/components/packt/trips-past-list.tsx` -- reused as-is by the new page (desktop cards/list)
- `src/components/packt/mobile-past-tab.tsx` -- reused as-is by the new page (mobile)
- `src/lib/queries.ts` `listTripsForUser` -- reused as-is (already returns all trips; filtering/sorting happens client-side like Trips does)
- `src/app/(app)/trips/actions.ts` -- `updateTripMetadata`/`deleteTrip` imported (not modified)

## Tasks & Acceptance

**Execution:**

- [x] `src/app/(app)/travel-history/page.tsx` -- new server component: `requireUser`, `getServerNow`, read `travel-history-view-mode` cookie, fetch `listTripsForUser` + `getUserById`/`detectDefaultDateFormat` (mirrors `trips/page.tsx`) -- stands up the route the nav already links to
- [x] `src/app/(app)/travel-history/use-travel-history-page-handlers.ts` -- new hook: filter entries to `status === "past"`, sort by `endDate` desc, manage `editingTrip`/`deletingTrip`/saving/deleting state, `handleTripSave`/`handleTripSaveResolution`/`cancelTripDateChange`/`closeTripEditSheet`/`handleConfirmDeleteTrip` calling the trips actions -- gives edit/delete parity without touching the Trips page's own hook
- [x] `src/app/(app)/travel-history/page-client.tsx` -- new client component wiring the hook to `TravelHistoryList` + `TripEditSheet` + `DeleteTripAlertDialog`
- [x] `src/components/packt/travel-history-list.tsx` -- new component: desktop block (header, cards/list toggle, `PastTripsList`) + mobile block (header, `MobilePastTab`), each showing the `Empty` state when `trips.length === 0`
- [x] `src/app/(app)/trips/use-trips-page-handlers.ts` -- remove past-trip computation per Code Map
- [x] `src/app/(app)/trips/page-client.tsx` -- remove `pastTrips` prop-passing
- [x] `src/components/packt/trips-desktop-layout.tsx` -- remove Past section per Code Map
- [x] `src/components/packt/trips-mobile-layout.tsx` -- remove Past tab per Code Map
- [x] Colocated unit tests: new `use-travel-history-page-handlers.test.ts` (filter/sort/edit/delete), new `travel-history-list.test.tsx` (toggle, empty state, list rendering), updated `use-trips-page-handlers.test.tsx`, `trips-desktop-layout.test.tsx`, `trips-mobile-layout.test.tsx` reflecting removed Past section
- [x] `tests/e2e/features/travel-history.feature` + step defs -- new scenario(s): past trips listed most-recent-first on `/travel-history`, cards/list toggle works, empty state with no past trips, Trips page no longer shows a Past section/tab
- [x] `src/components/packt/bottom-tab-bar.tsx` + test -- added a "History" tab (Clock icon) to the mobile bottom nav linking to `/travel-history`; the desktop `SidebarNav` already had the entry, but mobile had no path to reach it (found via manual review, not in the original Code Map)

**Acceptance Criteria:**

- Given a user with past, upcoming, and active trips, when they open `/trips`, then no past trips or "Past" section/tab appear.
- Given a user with 2+ past trips with different end dates, when they open `/travel-history`, then trips are listed with the most recent `endDate` first.
- Given a user with zero past trips, when they open `/travel-history`, then the `Empty` state renders instead of an empty list.
- Given a user on `/travel-history` desktop, when they click the "List" toggle, then the view switches and persists across a reload.
- Given a user edits or deletes a past trip from `/travel-history`, when the action succeeds, then the list updates and the existing `TripEditSheet`/`DeleteTripAlertDialog` behavior (including date-conflict confirmation) is unchanged.

## Spec Change Log

## Design Notes

`getTripStatus` guarantees `startDate`/`endDate` are both set whenever status is `"past"`, so the sort comparator can safely do `(a, b) => b.endDate!.localeCompare(a.endDate!)` — ISO `YYYY-MM-DD` strings sort correctly as strings, no `Date` parsing needed.

## Verification

**Commands:**

- `npm run test:coverage` -- expected: passes, thresholds met for `src/lib/**` and `src/components/packt/**`
- `npm run db:migrate:e2e && npm run test:e2e` -- expected: new travel-history scenarios pass alongside existing trips scenarios
- `npm run build` -- expected: production build succeeds with the new route

## Suggested Review Order

**Past-trip filtering and sort (the core logic)**

- Filters entries to `status === "past"` and sorts most-recent `endDate` first — the entry point for the whole feature.
  [`use-travel-history-page-handlers.ts:24`](../../src/app/(app)/travel-history/use-travel-history-page-handlers.ts#L24)

**New route wiring**

- Server component mirrors `trips/page.tsx`'s data-fetch + cookie-read pattern for the new route.
  [`page.tsx:8`](../../src/app/(app)/travel-history/page.tsx#L8)

- Wires the hook to `TravelHistoryList` and the reused `TripEditSheet`/`DeleteTripAlertDialog`.
  [`page-client.tsx:23`](../../src/app/(app)/travel-history/page-client.tsx#L23)

**Travel History UI**

- Desktop/mobile blocks reuse `PastTripsList`/`MobilePastTab`; toggle and empty-state gating live here.
  [`travel-history-list.tsx:46`](../../src/components/packt/travel-history-list.tsx#L46)

- Empty state follows the app's `Empty`/`EmptyMedia` convention with a `Clock` icon.
  [`travel-history-list.tsx:23`](../../src/components/packt/travel-history-list.tsx#L23)

**Removal from the Trips page**

- Past-trip computation dropped from the Trips page's own handlers hook.
  [`use-trips-page-handlers.ts:45`](../../src/app/(app)/trips/use-trips-page-handlers.ts#L45)

- "Past" section removed from the desktop layout's prop surface.
  [`trips-desktop-layout.tsx:28`](../../src/components/packt/trips-desktop-layout.tsx#L28)

- "Past" tab removed from the mobile layout's prop surface and tab list.
  [`trips-mobile-layout.tsx:10`](../../src/components/packt/trips-mobile-layout.tsx#L10)

**Mobile navigation fix (found during manual review, not in original Code Map)**

- Added a "History" tab so mobile users can actually reach `/travel-history` — the sidebar nav already had the entry, but mobile's bottom tab bar didn't.
  [`bottom-tab-bar.tsx:7`](../../src/components/packt/bottom-tab-bar.tsx#L7)

**Peripherals**

- New colocated hook/component tests: [`use-travel-history-page-handlers.test.tsx`](../../src/app/(app)/travel-history/use-travel-history-page-handlers.test.tsx), [`travel-history-list.test.tsx`](../../src/components/packt/travel-history-list.test.tsx)
- New E2E coverage: [`travel-history.feature`](../../tests/e2e/features/travel-history.feature), [`travel-history.steps.ts`](../../tests/e2e/steps/travel-history.steps.ts)
- Updated existing tests reflecting the Trips-page removal: [`use-trips-page-handlers.test.tsx`](../../src/app/(app)/trips/use-trips-page-handlers.test.tsx), [`trips-desktop-layout.test.tsx`](../../src/components/packt/trips-desktop-layout.test.tsx), [`trips-mobile-layout.test.tsx`](../../src/components/packt/trips-mobile-layout.test.tsx), [`bottom-tab-bar.test.tsx`](../../src/components/packt/bottom-tab-bar.test.tsx)

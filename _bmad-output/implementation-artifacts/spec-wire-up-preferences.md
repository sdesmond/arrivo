---
title: 'Wire up font size and date format preferences'
type: 'feature'
created: '2026-05-18'
status: 'done'
baseline_commit: 'f8f8036056bd8110dee3915ed9b1a11d5518ab60'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Both preferences are captured but the app ignores them — font size settings (stored in localStorage) have no visible effect because every component uses hardcoded px values, and the saved date format preference is never used when displaying trip dates.

**Approach:** (1) Add a `--font-scale` CSS variable driven by a `data-font-size` attribute on `<html>`, update `FontSizeSelect` to set that attribute, and convert all hardcoded inline font sizes to use `calc(Npx * var(--font-scale))`. (2) Add `formatDate` and `detectDefaultDateFormat` utilities; server pages resolve an effective dateFormat (saved preference → locale-based default from `Accept-Language` header) and thread it as a prop to TripCard, NowCard, and TripHero.

## Boundaries & Constraints

**Always:**
- Use `calc(Npx * var(--font-scale))` for all inline `fontSize` styles; small = 0.867 scale, large = 1.133 scale
- Date format applied to trip start/end dates in TripCard, NowCard, and TripHero only
- When no preference is saved, derive the default from the `Accept-Language` request header — `en-US` and `en-PH` → MM/DD/YYYY, all other locales → DD/MM/YYYY
- Server pages must call `getUserById(session.id!)` to read `dateFormat`; `requireUser()` returns session-only fields and does not include it
- Keep the day-card date display ("Mon, May 3") as a localized string — it's unambiguous

**Ask First:**
- If a test file fails due to structural change in FontSizeSelect (dataset vs setProperty mock), confirm approach before rewriting the whole test suite

**Never:**
- Add a `fontSize` column to the DB — it's a per-device display preference, localStorage is appropriate
- Use CSS `zoom` — it scales layout and fixed elements, not just text
- Store `dateFormat` in the Auth.js session
- Thread `dateFormat` into DayCard — no current consumer there
- Change the "Mon, May 3" day-card label to slash format

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Font size: Small selected | User picks Small in Appearance tab | All component text scales to ~87% of base | N/A |
| Font size: persists on reload | `packt-font-size=large` in localStorage | On mount, `data-font-size="large"` is set on `<html>` | N/A |
| Date format MM/DD | `dateFormat: "MM/DD/YYYY"` in user profile | TripCard shows "04/24/2026 — 05/01/2026" | N/A |
| Date format DD/MM | `dateFormat: "DD/MM/YYYY"` in user profile | TripCard shows "24/04/2026 — 01/05/2026" | N/A |
| Date format null, en-US browser | No preference saved, `Accept-Language: en-US` | Defaults to MM/DD/YYYY | N/A |
| Date format null, non-US browser | No preference saved, `Accept-Language: en-GB` | Defaults to DD/MM/YYYY | N/A |

</frozen-after-approval>

## Code Map

- `src/app/globals.css` — defines `--font-scale: 1` in `:root`; add data-attribute overrides here
- `src/components/packt/font-size-select.tsx` — applies font size via localStorage + CSS variable; needs to also set `data-font-size` attribute
- `src/components/packt/font-size-select.test.tsx` — unit tests; needs update for data attribute
- `src/lib/utils.ts` — utility functions; add `formatDate` and `detectDefaultDateFormat` here
- `src/lib/utils.test.ts` — unit tests for utils; add coverage for both new functions
- `src/app/(app)/trips/page.tsx` — server page for trips list; call `getUserById` + resolve dateFormat, pass to client
- `src/app/(app)/trips/page-client.tsx` — client for trips list; thread `dateFormat` to TripCard + NowCard
- `src/components/packt/trip-card.tsx` — shows raw ISO start/end dates; apply formatDate
- `src/components/packt/trip-card.test.tsx` — existing tests; update for new dateFormat prop
- `src/components/packt/now-card.tsx` — uses `formatTripDate()`; switch to `formatDate` with user pref
- `src/components/packt/now-card.test.tsx` — existing tests; update for new dateFormat prop
- `src/app/(app)/trips/[tripId]/page.tsx` — server page for trip detail; call `getUserById` + resolve dateFormat, pass to client
- `src/app/(app)/trips/[tripId]/page-client.tsx` — 395 lines, must be split before this change; thread `dateFormat` to TripHero
- `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx` — new component extracted from page-client to bring it under 250 lines
- `src/components/packt/trip-hero.tsx` — shows raw start/end dates; apply formatDate
- `src/components/packt/trip-hero.test.tsx` — existing tests; update for new dateFormat prop
- `src/components/packt/**` and `src/app/(app)/**` — all inline `fontSize: N` → `fontSize: "calc(Npx * var(--font-scale))"` and `text-[Npx]` → inline style equivalent (~32 component files, ~98 occurrences)
- `tests/e2e/features/preferences-date-format.feature` — new E2E scenario for date format
- `tests/e2e/steps/preferences-date-format.steps.ts` — step definitions for above feature

## Tasks & Acceptance

**Execution:**
- [x] `src/app/globals.css` -- Add `--font-scale: 1` to `:root`, add `html[data-font-size="small"] { --font-scale: 0.867; --font-size-base: 13px }` and `html[data-font-size="large"] { --font-scale: 1.133; --font-size-base: 17px }` -- drives proportional text scaling via CSS cascade
- [x] `src/components/packt/font-size-select.tsx` -- Update `applyFontSize` to set `document.documentElement.dataset.fontSize = value` in addition to the existing `setProperty`; update `useEffect` on mount to also set the data attribute from stored preference -- wires the selector to the CSS cascade
- [x] `src/components/packt/font-size-select.test.tsx` -- Update mock to include `dataset: {}` on `document.documentElement`; add assertion that `dataset.fontSize` is set on change -- keeps tests green after data attribute addition
- [x] All component files in `src/components/packt/` and `src/app/(app)/` -- Replace every `style={{ fontSize: N }}` with `style={{ fontSize: "calc(Npx * var(--font-scale))" }}` and convert `text-[Npx]` Tailwind classes to equivalent inline styles -- makes all text respect the scale preference
- [x] `src/lib/utils.ts` -- Add `detectDefaultDateFormat(acceptLanguage: string): "MM/DD/YYYY" | "DD/MM/YYYY"` that returns "MM/DD/YYYY" when the primary locale is `en-US` or `en-PH`, "DD/MM/YYYY" otherwise; add `formatDate(dateStr: string, format: string): string` that parses "YYYY-MM-DD" and returns the date in the given format -- single source of truth for date format detection and rendering
- [x] `src/lib/utils.test.ts` -- Add tests for `detectDefaultDateFormat`: en-US → MM/DD, en-GB → DD/MM, empty string → DD/MM; add tests for `formatDate`: MM/DD happy path, DD/MM happy path, edge case leading zeros ("2026-01-05" DD/MM → "05/01/2026") -- full branch coverage for both functions
- [x] `src/app/(app)/trips/[tripId]/page-client.tsx` -- Extract the DayCard list rendering section into `src/app/(app)/trips/[tripId]/trip-itinerary-view.tsx` (a client component accepting `days`, all event handlers, and `now` as props); this reduces page-client below 250 lines -- required before adding the dateFormat prop
- [x] `src/app/(app)/trips/page.tsx` -- After `requireUser()`, call `getUserById(session.id!)`; resolve `dateFormat` as `profile?.dateFormat ?? detectDefaultDateFormat((await headers()).get("accept-language") ?? "")`; pass to `TripsPageClient` -- session user lacks dateFormat, full profile required
- [x] `src/app/(app)/trips/page-client.tsx` -- Add `dateFormat: string` to `TripsPageClientProps`; thread it as prop to `TripCard` and `NowCard` -- connects server data to leaf components
- [x] `src/components/packt/trip-card.tsx` -- Accept `dateFormat: string` prop; replace raw `{trip.startDate} — {trip.endDate}` with `{formatDate(trip.startDate, dateFormat)} — {formatDate(trip.endDate, dateFormat)}` -- trips list respects preference
- [x] `src/components/packt/trip-card.test.tsx` -- Add dateFormat prop coverage: render with "MM/DD/YYYY" and assert formatted output; render with "DD/MM/YYYY" and assert reversed order -- prevents regression on date display
- [x] `src/components/packt/now-card.tsx` -- Accept `dateFormat: string` prop; replace `formatTripDate()` calls with `formatDate(date, dateFormat)` -- active trip card respects preference
- [x] `src/components/packt/now-card.test.tsx` -- Update to pass `dateFormat` prop; assert dates render in MM/DD format with "MM/DD/YYYY" and DD/MM with "DD/MM/YYYY" -- keeps coverage green
- [x] `src/app/(app)/trips/[tripId]/page.tsx` -- After `requireUser()`, call `getUserById(session.id!)`; resolve `dateFormat` same as trips page; pass to `TripDetailClient` -- session user lacks dateFormat
- [x] `src/app/(app)/trips/[tripId]/page-client.tsx` -- Add `dateFormat: string` to `TripDetailClientProps`; pass it to `TripHero` -- connects preference to detail view header
- [x] `src/components/packt/trip-hero.tsx` -- Accept `dateFormat: string` prop; format `startDate`/`endDate` with `formatDate` -- trip detail header respects preference
- [x] `src/components/packt/trip-hero.test.tsx` -- Add dateFormat prop tests: assert both MM/DD and DD/MM formats render correctly -- prevents regression
- [x] `tests/e2e/features/preferences-date-format.feature` + `tests/e2e/steps/preferences-date-format.steps.ts` -- Add scenario: user navigates to Profile → Preferences, sets date format to "Day/Month", saves, navigates to trips list, asserts trip dates appear in DD/MM/YYYY format; step definitions drive the UI via Playwright -- confirms end-to-end preference application

**Acceptance Criteria:**
- Given Small is selected in Appearance, when any page is viewed, then all app text is visibly smaller at ~87% scale compared to Medium
- Given Large is selected, when any page is viewed, then all text is visibly larger at ~113% scale
- Given user has `dateFormat: "DD/MM/YYYY"` saved, when the trips list loads, then trip cards show dates as "DD/MM/YYYY" (e.g. "24/04/2026")
- Given user has `dateFormat: "MM/DD/YYYY"` saved, when the trips list loads, then trip cards show dates as "MM/DD/YYYY" (e.g. "04/24/2026")
- Given no dateFormat is saved, when an en-US browser loads the trips page, then dates default to MM/DD/YYYY
- Given no dateFormat is saved, when a non-US browser loads the trips page, then dates default to DD/MM/YYYY
- Given font size was previously set to Large in localStorage, when the app loads in a fresh browser tab, then text is large before the user interacts with anything

## Spec Change Log

**2026-05-18 — post-review fixes:**
- Removed day-card.tsx dateFormat threading (no current consumer — premature abstraction)
- Replaced hardcoded "MM/DD/YYYY" fallback with locale-based default via `detectDefaultDateFormat` + `Accept-Language` header
- Added `getUserById` call to both server pages (`requireUser` returns session-only fields, not dateFormat)
- Added split step for `[tripId]/page-client.tsx` (395 lines → extract `TripItineraryView`)
- Added test update steps for trip-card.test.tsx, now-card.test.tsx, trip-hero.test.tsx
- Added E2E scenario for date format preference application

## Design Notes

**Font scale values:** Small = 13/15 ≈ 0.867, Large = 17/15 ≈ 1.133. Match the pixel values in `FontSizeSelect.SIZES`.

**Mechanical font size update:** `style={{ fontSize: N }}` → `style={{ fontSize: "calc(Npx * var(--font-scale))" }}`. Integer N becomes `Npx` (13 → `calc(13px * var(--font-scale))`). Fractional values: 12.5 → `calc(12.5px * var(--font-scale))`.

**Key utility signatures:**
```ts
export function detectDefaultDateFormat(acceptLanguage: string): "MM/DD/YYYY" | "DD/MM/YYYY" {
  const primary = acceptLanguage.split(",")[0]?.trim().split(";")[0] ?? "";
  return /^en-US|^en-PH/i.test(primary) ? "MM/DD/YYYY" : "DD/MM/YYYY";
}

export function formatDate(dateStr: string, format: string): string {
  const [year, month, day] = dateStr.split("-");
  if (format === "DD/MM/YYYY") return `${day}/${month}/${year}`;
  return `${month}/${day}/${year}`;
}
```

**getUserById in server pages:**
```ts
const session = await requireUser();
const profile = await getUserById(session.id!);
const dateFormat = profile?.dateFormat
  ?? detectDefaultDateFormat((await headers()).get("accept-language") ?? "");
```

## Verification

**Commands:**
- `npm run build` -- expected: no TypeScript errors, clean build
- `npm test -- --run src/lib/utils.test.ts src/components/packt/font-size-select.test.tsx src/components/packt/trip-card.test.tsx src/components/packt/now-card.test.tsx src/components/packt/trip-hero.test.tsx` -- expected: all tests pass
- `npm run test:e2e` -- expected: preferences-date-format scenario passes

**Manual checks:**
- Open Appearance tab, switch font size to Small, verify all visible text is noticeably smaller; switch to Large, verify noticeably larger

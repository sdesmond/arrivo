---
name: Trip View Backlog
description: Audit of unimplemented/placeholder features in the trip detail and day planner views, as of 2026-05-03
type: project
originSessionId: c00db797-8618-43fb-b977-9a342396eec7
---

Audited on 2026-05-03. These items were identified as needing implementation or fixing in the trip view.

**Why:** The trip detail and day planner pages are currently UI shells with hardcoded mock data — most buttons and features are non-functional.
**How to apply:** Use this list to pick the next item to work on. Check off / remove entries as they are completed.

---

## Foundation (most blocking)

- [ ] Route params not used — neither `trips/[tripId]/page.tsx` nor `days/[dayId]/page.tsx` reads `tripId`/`dayId` from the URL
- [ ] All data is static mock data — pages import from `/data/tokyo.ts` and `/data/day-planner.ts` instead of real DB/API
- [ ] Trip name hardcoded — "Tokyo" appears literally in trip detail page (lines ~41, 61, 98)

## Day Planner Navigation

- [ ] Prev/Next day buttons do nothing — ChevronLeft/ChevronRight have no `onClick`
- [ ] Day selector doesn't reflect actual day — shows hardcoded "day 5 today" regardless of `dayId` param

## Unimplemented Tabs (trip detail page)

- [ ] Documents tab — placeholder text only
- [ ] Map tab — placeholder text only
- [ ] Packing list tab — placeholder text only
- [ ] Notes tab — placeholder text only

## Unimplemented Actions (day planner / place cards)

- [ ] "Add place" button — no handler
- [ ] "Add flexible place" button — no handler
- [ ] "Open in map" button — no handler (appears in expanded place cards)
- [ ] "Edit" button on events — no handler
- [ ] "Reschedule" button — no handler
- [ ] "Mark visited" button — no handler, no mutation to persist state
- [ ] "Edit note" button — no handler on day notes section
- [ ] Schedule/More buttons on flex cards — no handlers

## Trip-level Actions (header)

- [ ] "Share" button — no handler
- [ ] "Offline" button — no handler
- [ ] "More" menu (⋯) — no handler

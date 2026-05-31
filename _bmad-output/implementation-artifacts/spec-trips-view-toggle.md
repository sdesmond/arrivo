---
title: "View Toggle for All Trip Sections"
type: "feature"
created: "2026-05-30"
status: "ready-for-dev"
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The trips page has a non-functional Cards/List segmented control tucked inside the Upcoming section heading, a non-functional Date sort button, and a non-functional Filter button on Past trips. Users want one master toggle at the page level that switches all three sections (Unscheduled, Upcoming, Past) between card and list views consistently.

**Approach:** Insert a master Cards/List toggle below the active trip section (if present) and above the trip listing sections. Remove the unused Date sort button from Upcoming and the Filter button from Past trips. Persist the user's preference in localStorage so it survives page reloads.

## Boundaries & Constraints

**Always:**
- Use the existing `.seg`/`.seg-item` CSS classes for the toggle styling (already in `globals.css`)
- Default to `cards` view when no preference is stored
- Store preference in localStorage under a key like `trips-view-mode`
- All three sections (Unscheduled, Upcoming, Past) must respond to the toggle

**Ask First:** Whether the mobile layout tabs should also get the toggle

**Never:**
- Do not persist to a database or user profile
- Do not add the toggle to the topbar

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| -------- | ------------- | -------------------------- | -------------- |
| First visit | No localStorage value | All sections render as cards | N/A |
| Switch to list | Click "List" in toggle | All sections render as list rows | N/A |
| Reload after list pick | localStorage has `"list"` | All sections render as list | Corrupt value defaults to cards |

</frozen-after-approval>

## Code Map

- `src/components/packt/trips-desktop-layout.tsx` — Add master toggle section, remove Date/Filter buttons, pass viewMode to child sections
- `src/components/packt/unscheduled-section.tsx` — Accept `viewMode` prop, render cards (grid) or rows
- `src/components/packt/trips-past-list.tsx` — Accept `viewMode` prop, render rows (current) or cards
- `src/app/(app)/trips/page-client.tsx` — Thread viewMode state if lifted to parent
- `src/components/packt/trips-desktop-layout.test.tsx` — Test toggle rendering, switching, and default state

## Tasks & Acceptance

**Execution:**

- [ ] `src/components/packt/trips-desktop-layout.tsx` — Add `viewMode` state (initialized from localStorage with `"cards"` fallback), render master toggle below active trip, remove Date sort button, remove Filter button and count text (`${pastTrips.length} OF ${pastTrips.length}`) from Past trips heading, pass `viewMode` to UnscheduledSection, upcoming section, and PastTripsList
- [ ] `src/components/packt/unscheduled-section.tsx` — Accept `viewMode:` "cards" | "list"` prop; when`"list"`, render rows instead of the card grid
- [ ] `src/components/packt/trips-past-list.tsx` — Accept `viewMode:` "cards" | "list"` prop; when`"cards"`, render `TripCard`s in a grid
- [ ] `src/components/packt/trips-desktop-layout.test.tsx` — Add tests: default renders as cards, switching to list toggles sections, preference persists across re-render, unscheduled renders null when empty in both modes
- [ ] `src/components/packt/unscheduled-section.test.tsx` — Add test cases covering `viewMode="cards"` (grid) and `viewMode="list"` (rows) rendering
- [ ] `src/components/packt/trips-past-list.test.tsx` — Add test cases covering `viewMode="list"` (existing rows) and `viewMode="cards"` (TripCard grid) rendering

### Review Findings

- [x] [Review][Patch] Past-trip cards show upcoming status copy and countdowns [src/components/packt/trips-past-list.tsx:30]

**Acceptance Criteria:**

- Given the trips page, when no view preference is stored, then all three sections render as cards
- Given any section is visible, when the user clicks "List" in the master toggle, then all sections switch to list view
- Given the user selected "List" view, when the page is reloaded, then all sections still render as list
- Given the user selected "List" view, when they click "Cards" in the toggle, then all sections switch back to card view

## Spec Change Log

## Design Notes

The toggle sits on its own row below the active trip section (or top of the scroll area when no active trip), acting as a global filter for the three list sections below it. Each section independently checks the same viewMode value.

## Verification

**Commands:**

- `npx vitest run src/components/packt/trips-desktop-layout.test.tsx` — all tests pass
- `npx vitest run --coverage` — coverage thresholds maintained

**Manual checks:**

- Load trips page with no localStorage value → all sections show as cards
- Click "List" → all sections switch to row layout
- Refresh page → view persists as list
- Click "Cards" → all sections switch back to cards

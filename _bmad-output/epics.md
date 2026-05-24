---
stepsCompleted: [1, 2, 3, 4]
workflow_completed: true
inputDocuments:
  - _bmad-output/brainstorming/brainstorming-session-2026-05-23-0900.md
  - _bmad-output/project-context.md
---

# Packt - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for the **New Trip Creation** feature in Packt, decomposing requirements from the brainstorming session (2026-05-23) and existing codebase architecture into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: The app provides a "New Trip" modal accessible from both the header button and the empty-state CTA; both entry points open the same modal.
FR2: The modal displays three fields upfront: trip title (required), date range (optional), and budget (optional).
FR3: The title field auto-focuses when the modal opens — no tap required.
FR4: The Create button is enabled the moment the title field has any content; it is disabled when the title is empty.
FR5: Inline validation feedback is shown on submit if the title is empty; never a silent failure.
FR6: Canceling the modal dismisses it without saving anything.
FR7: Submitting the modal immediately persists the trip to the database, then navigates to the new trip's page with Day 1 expanded.
FR8: If a date range is provided, the app generates one day per calendar date in the range.
FR9: If only a start date is provided (no end date), the app creates exactly 1 day.
FR10: If no dates are provided, the trip is created as a dateless ("unscheduled") trip with no days.
FR11: An "Unscheduled" section appears at the top of the trips list and contains all dateless trips; it is distinct from Upcoming, Active, and Past sections.
FR12: The unscheduled section on the trips list is only rendered when at least one dateless trip exists.
FR13: On the trip itinerary, an "Add Day" button appears at the end of the day list and extends the trip's end date by 1 day.
FR14: On the trip itinerary, a "Remove" control appears on the last day only; triggering it removes that day and decrements the trip's end date by 1.
FR15: If the user attempts to remove the only remaining day, a dialog appears: "Keep this trip without any days?" — Yes clears dates (trip becomes unscheduled), No aborts.
FR16: Extending the trip's date range (via date edit or Add Day) silently adds empty days for the new dates.
FR17: Shortening or shifting the trip's date range when events exist on impacted days shows a warning — the user can delete those events or keep them in an unscheduled events section.
FR18: An "Unscheduled Events" section appears at the top of the itinerary and contains events displaced by date changes; it is collapsible and only rendered when events exist in it.
FR19: The budget field in the New Trip modal accepts numeric currency input only.
FR20: The date range picker in the New Trip modal enforces that the end date is not before the start date.
FR21: A post-creation confetti micro-celebration fires after the trip page has fully loaded (not over a loading spinner).
FR22: When dates are set in the modal, a staggered "Building Your Trip" animation plays as day cards appear in the itinerary on the new trip page.

### NonFunctional Requirements

NFR1: Validation never silently fails — the user always receives visible feedback when a required field is missing or invalid.
NFR2: The Create button's enabled state is driven purely by real-time title field content (no submit required to discover the button state).
NFR3: Trip dates always stay in sync with day count: Add Day → end date +1; Remove Last Day → end date -1; date range edit → days adjusted accordingly.
NFR4: The Unscheduled section in the trips list is visually distinct from the status-based sections (different label, color, or icon treatment).
NFR5: The confetti celebration fires only after the trip page has successfully loaded — never over a loading/pending state.
NFR6: Cover image failures degrade gracefully — solid color or gradient fallback, no broken image icon.
NFR7: Day 1 is always expanded on a newly created trip page.

### Additional Requirements

- New `createTrip` server action follows existing auth guard pattern: `requireUser()` → `assertTripAccess()` (where applicable) → mutation → `revalidatePath`.
- New DB types/fields added to `src/data/types.ts`; no type definitions elsewhere.
- DB mapper layer (`src/lib/db-mappers.ts`) must be used for all DB reads — raw row mapping in actions/queries is forbidden.
- `position: integer` field must be maintained when creating days and events.
- Trip status remains computed-only (`getTripStatus(startDate, endDate, now)` from `@/lib/utils`) — never stored.
- `getNow()` / `useNow()` used for "now" throughout — never `new Date()` directly.
- Page split pattern: `page.tsx` (Server Component for data + auth) and `page-client.tsx` (Client Component for interactivity) — applies to any new route.
- New Trip modal's date range picker reuses the same component as the edit-trip drawer.
- All new interactive components include `"use client"` as the very first line.
- E2E tests run against `packt_e2e` DB; each scenario seeds its own state via `Before` hooks (no UI-driven setup chains).

### UX Design Requirements

UX-DR1: New Trip modal — title auto-focused on open; title, date range, and budget all visible upfront with no progressive disclosure; modal is the intentional "commitment gate" before a trip exists.
UX-DR2: Post-creation confetti micro-celebration — brief (~1 second), fires after trip page loads, then disappears; treats trip creation as a celebratory event.
UX-DR3: "Building Your Trip" staggered day animation — when dates are set, day cards appear in sequence with a staggered entrance animation, not all at once.
UX-DR4: Unscheduled section in trips list — rendered above Upcoming; uses a visually distinct label/color/icon to signal it is not a status section.
UX-DR5: Unscheduled Events section in itinerary — collapsible, appears at top above Day 1; only rendered when displaced events exist; visually distinct from numbered day cards.

### FR Coverage Map

FR1: Epic 1 — Modal entry points (header button + empty state CTA)
FR2: Epic 1 — Modal fields: title (required), date range (optional), budget (optional)
FR3: Epic 1 — Title field auto-focuses on modal open
FR4: Epic 1 — Create button enabled the moment title has content
FR5: Epic 1 — Inline validation message on submit when title is empty
FR6: Epic 1 — Cancel dismisses modal without saving
FR7: Epic 1 — Create → immediate persist → navigate to trip page with Day 1 expanded
FR8: Epic 1 — Date range provided → generate one day per calendar date
FR9: Epic 1 — Start date only → create exactly 1 day
FR10: Epic 1 — No dates → dateless trip with no days
FR11: Epic 1 — Unscheduled section at top of trips list for dateless trips
FR12: Epic 1 — Unscheduled section only rendered when at least one dateless trip exists
FR19: Epic 1 — Budget field accepts numeric currency input only
FR20: Epic 1 — Date picker enforces end date ≥ start date
FR13: Epic 2 — Add Day button at end of itinerary; extends trip end date +1
FR14: Epic 2 — Remove Last Day control; decrements trip end date -1
FR15: Epic 2 — Remove only-remaining-day triggers dialog: keep as unscheduled or abort
FR16: Epic 2 — Date range extend → silently add empty days
FR17: Epic 2 — Date range shorten/shift with events on impacted days → warn → delete or keep as unscheduled
FR18: Epic 2 — Unscheduled Events section in itinerary (collapsible, top, only when non-empty)
FR21: Epic 2 — Post-creation confetti micro-celebration fires after trip page loads
FR22: Epic 2 — Staggered "Building Your Trip" day animation on new trip page

## Epic List

### Epic 1: New Trip Creation
Users can create a new trip from any entry point, optionally set dates and a budget, and immediately land on a populated trip page. Dateless trips are surfaced in a dedicated Unscheduled section on the trips list.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8, FR9, FR10, FR11, FR12, FR19, FR20

### Epic 2: Trip Structure Management & Creation Delight
Users can add and remove days dynamically, change date ranges safely with graceful handling of displaced events, and experience the celebratory creation animations.
**FRs covered:** FR13, FR14, FR15, FR16, FR17, FR18, FR21, FR22

---

## Epic 1: New Trip Creation

Users can create a new trip from any entry point, optionally set dates and a budget, and immediately land on a populated trip page. Dateless trips are surfaced in a dedicated Unscheduled section on the trips list.

### Story 1.1: New Trip Modal

As a traveler,
I want to open a New Trip modal from the trips list and fill in a title, optional date range, and optional budget,
So that I have a frictionless, intentional entry point for starting a new trip.

**Acceptance Criteria:**

**Given** I am on the trips list page
**When** I click the "New Trip" button in the header
**Then** the New Trip modal opens

**Given** I am on the trips list page with no trips
**When** I click the empty-state CTA
**Then** the same New Trip modal opens

**Given** the modal is open
**Then** the title field is focused automatically — no tap or click required

**Given** the modal is open
**Then** it displays a title field, a date range picker, and a budget field — all visible upfront with no progressive disclosure

**Given** the title field is empty
**Then** the Create button is disabled

**Given** I have typed at least one character in the title field
**Then** the Create button is enabled

**Given** the title field is empty and the form is submitted
**Then** an inline validation message appears near the title field; the failure is never silent

**Given** the date range picker is open
**When** I attempt to set an end date earlier than the start date
**Then** the picker rejects the selection and the date values remain unchanged

**Given** the budget field
**When** I type non-numeric characters
**Then** those characters are not accepted

**Given** the modal is open
**When** I click Cancel or press Escape
**Then** the modal closes and no trip is created

**FRs:** FR1, FR2, FR3, FR4, FR5, FR6, FR19, FR20

---

### Story 1.2: Create Trip Server Action & Initial Trip Page

As a traveler,
I want clicking Create in the modal to immediately save my trip and land me on its page,
So that I can start planning without delay.

**Acceptance Criteria:**

**Given** the title field has content and I click Create
**When** the server action completes successfully
**Then** I am navigated to the new trip's detail page

**Given** I provided a date range
**Then** the trip page shows one day card per calendar date in the range, with Day 1 expanded

**Given** I provided only a start date (no end date)
**Then** the trip page shows exactly 1 day card, expanded

**Given** I provided no dates
**Then** the trip page shows an empty dateless state with placeholder content (no day cards)

**Given** I provided a budget amount
**Then** the trip page reflects that budget value

**Given** the Create button is clicked
**When** the action is in progress
**Then** the modal shows a pending/loading state and the Create button is not clickable a second time

**FRs:** FR7, FR8, FR9, FR10

---

### Story 1.3: Unscheduled Trips Section on Trips List

As a traveler,
I want dateless trips to appear in a dedicated Unscheduled section at the top of my trips list,
So that trips I haven't scheduled yet are easy to find and don't disappear into other sections.

**Acceptance Criteria:**

**Given** I have at least one dateless trip
**When** I view the trips list
**Then** an "Unscheduled" section appears above the Upcoming section

**Given** I have no dateless trips
**Then** the Unscheduled section is not rendered on the trips list

**Given** the Unscheduled section is visible
**Then** it is visually distinct from the Upcoming, Active, and Past sections (different label style, color, or icon treatment)

**Given** a dateless trip in the Unscheduled section
**When** I click it
**Then** I navigate to its detail page

**Given** a trip that was dateless is updated to have dates
**Then** it moves out of the Unscheduled section and into the correct status section (Upcoming/Active/Past)

**FRs:** FR11, FR12

---

## Epic 2: Trip Structure Management & Creation Delight

Users can add and remove days dynamically, change date ranges safely with graceful handling of displaced events, and experience the celebratory creation animations.

### Story 2.1: Add Day & Remove Last Day

As a traveler,
I want to add days to the end of my trip and remove the last day from the itinerary,
So that I can adjust trip length directly from the itinerary without touching the date picker.

**Acceptance Criteria:**

**Given** the trip has at least one day
**When** I scroll to the bottom of the itinerary
**Then** an "Add Day" button is visible below the last day card

**Given** I click Add Day
**Then** a new empty day card appears at the end of the list
**And** the trip's end date advances by 1 calendar day

**Given** the trip has more than one day
**When** I look at the last day card
**Then** a Remove Day control is visible on that card only (not on any other day cards)

**Given** I click Remove Day on the last day (with more than one day remaining)
**Then** the last day card is removed
**And** the trip's end date decrements by 1 calendar day

**Given** the trip has exactly one day
**When** I click Remove Day
**Then** a confirmation dialog appears: "Removing the only day will mark this trip as unscheduled."
**And** the dialog has a Cancel button and a "Remove Day" button

**Given** the dialog is open and I click "Remove Day"
**Then** the trip becomes dateless, the day is removed, and the trip appears in the Unscheduled section of the trips list

**Given** the dialog is open and I click Cancel
**Then** the dialog closes and no changes are made

**FRs:** FR13, FR14, FR15

---

### Story 2.2: Date Range Change — Silent Extend & Displaced Events

As a traveler,
I want the app to handle date range edits intelligently,
So that extending my trip adds days automatically and shortening it never silently destroys events.

**Acceptance Criteria:**

**Given** I edit the trip's date range to add dates at the end
**Then** new empty day cards are silently added for the new dates — no confirmation dialog

**Given** I edit the trip's date range to add dates at the start
**Then** new empty day cards are silently added for the new dates at the start — no confirmation dialog

**Given** I shorten or shift the date range such that one or more days with events would be removed
**When** I confirm the date change
**Then** a warning appears listing the affected events with two choices: "Delete events" and "Keep as unscheduled"

**Given** I choose "Keep as unscheduled"
**Then** the displaced events are moved into an Unscheduled Events section at the top of the itinerary
**And** the day cards for the removed dates are deleted

**Given** I choose "Delete events"
**Then** those events and their day cards are permanently deleted with no further confirmation

**Given** the Unscheduled Events section is present
**Then** it appears above Day 1 and is collapsible

**Given** all events in the Unscheduled Events section are deleted or moved to scheduled days
**Then** the Unscheduled Events section is no longer rendered

**Given** I shorten or shift the date range but the affected days have no events
**Then** the day cards are silently removed — no dialog shown

**FRs:** FR16, FR17, FR18

---

### Story 2.3: Creation Delight — Confetti & Staggered Day Animation

As a traveler,
I want a brief celebration and animated reveal when I first land on a newly created trip,
So that the creation moment feels intentional and memorable.

**Acceptance Criteria:**

**Given** I have just created a new trip and the trip page has fully loaded
**Then** a confetti animation plays for approximately 1 second, then stops and clears

**Given** the confetti animation
**Then** it fires only after the trip page content is visible — never over a loading spinner or skeleton state

**Given** the new trip was created with dates
**When** the trip page first loads
**Then** the day cards appear with a staggered entrance animation — each card fades/slides in sequentially with a brief offset — rather than all at once

**Given** the staggered day animation
**Then** it plays only on the initial load of the newly created trip, not on subsequent navigations to the same trip

**Given** I navigate to a trip I did not just create
**Then** no confetti or staggered animation plays

**FRs:** FR21, FR22

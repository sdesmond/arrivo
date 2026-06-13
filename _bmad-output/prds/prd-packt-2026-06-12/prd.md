---
title: Trip Overview Consolidation
status: draft
created: 2026-06-12
updated: 2026-06-12
---

# PRD: Trip Overview Consolidation

_Working title — confirm._

## 0. Document Purpose

## 2. Target User

### 2.3 Key User Journeys

- **UJ-1. Ashley adds her first reservation from a confirmation email.**
  - **Persona + context:** Ashley, mid-trip-planning, just received a hotel confirmation email.
  - **Entry state:** Authenticated, opens the app, lands on the Itinerary tab (default) for the trip — no reservations yet.
  - **Path:** Sees a CTA at the top of the Itinerary ("Add reservations for hotels, rentals, and more") → taps it → navigates to the Overview tab with the Add Reservation dialog already open → picks type (Lodging), fills in provider, check-in/check-out, confirmation code → saves.
  - **Climax:** Lands back on Overview and sees the new reservation as a row in the Lodging section. Switches to the Itinerary and sees Check-in/Check-out details filled in on the corresponding days.
  - **Resolution:** The Itinerary CTA changes to prompt adding more reservations, continuing to direct Ashley to the Overview tab as the source of truth for reservations.

- **UJ-2. Ashley checks a reservation detail mid-trip.**
  - **Persona + context:** Ashley, partway through the trip, wants to confirm a detail (e.g., rental car pickup time) for a reservation she already added.
  - **Entry state:** Authenticated, mid-trip, opens the app to the Itinerary.
  - **Path:** If the reservation's linked event is the next thing coming up, it's already surfaced on the Now Card — no further navigation needed. If it's further out, Ashley either navigates to the Itinerary day where she expects the linked event (if she knows roughly when), or goes to the Overview tab and finds it in the relevant reservation section (e.g., Rental Cars) if she'd rather not hunt by date.
  - **Climax:** Ashley finds the detail she needs (pickup time, confirmation code) via whichever path she chose, without needing to cross-reference the other tab.
  - **Resolution:** Confirms the detail and continues with the trip. Both the Itinerary (via linked events) and the Overview (via reservation sections) are valid, equally-supported paths to the same underlying reservation data.

- **UJ-3. Ashley manages the trip's cover image.**
  - **Persona + context:** Ashley wants to change, remove, or check the credit for the trip's cover image.
  - **Entry state:** Authenticated, viewing a trip with a Photo or Map cover.
  - **Path:** Taps the "⋯" overflow menu in the upper-right of the cover image. Sees up to three options depending on cover state:
    - **Edit Cover** — always shown; opens the existing cover edit dialog (photo/map/graphic picker).
    - **Remove Cover** — shown only when the current cover is a Photo or Map; reverts the cover to a random Graphic cover.
    - **Info** — shown only when the current cover is an Unsplash photo; opens a dialog with photographer credit and a link back to Unsplash.
  - **Climax:** Whichever action Ashley picks completes immediately and the cover reflects the new state (new image selected, reverted to a graphic, or attribution dialog shown).
  - **Resolution:** Ashley returns to viewing the trip with the cover in its new state; the overflow menu's options adjust automatically based on the new cover type (e.g., Remove Cover and Info disappear once the cover is a Graphic).

- **UJ-4. Ashley edits a reservation and the Itinerary updates automatically.**
  - **Persona + context:** Ashley's flight time changed and she needs to update the reservation she already added.
  - **Entry state:** Authenticated, viewing either the Reservations tab or the Itinerary tab for the trip.
  - **Path:** From Reservations, Ashley expands the relevant accordion section, finds the reservation row, and edits the changed field inline (click-to-edit, matching the app's existing inline-edit pattern). From the Itinerary, Ashley taps the linked event (e.g., a Check-in/Check-out generated from a reservation) and is redirected to the Reservations tab to make the edit there — the same redirect pattern as the empty-state CTA in UJ-1.
  - **Climax:** Ashley saves the field change on Reservations; the linked Itinerary event(s) reflect the new date/time immediately, with no separate edit step.
  - **Resolution:** Ashley trusts that the reservation is the single source of truth — any Itinerary event generated from it is always in sync, never independently editable.

## 3. Glossary

- **Reservation** — A booked logistics item belonging to a trip. Has a `type` (see Reservation Type), a `startTime` (required), an optional `endTime`, a `provider` (operator/company name), an optional `confirmationCode`, and an optional free-text `notes` field. Reservations are managed on the Reservations tab and are the single source of truth for their Linked Events on the Itinerary.
- **Reservation Type** — The category of a Reservation: Flight, Train, Bus, Ferry, Rental Car, Lodging, or Cruise. Selected first when adding a Reservation, before other fields, since it determines the labels shown for `startTime`/`endTime`.
- **Linked Event** — An Itinerary event generated from a Reservation's `startTime` (and `endTime`, if present). Always derived from the Reservation; never independently editable — editing the Reservation updates its Linked Event(s) everywhere they appear on the Itinerary. Labeled per Reservation Type:
  - Lodging → Check-in / Check-out
  - Rental Car → Pickup / Return
  - Flight, Train, Bus, Ferry → Departure / Arrival
  - Cruise → Departure / Return
  - If `endTime` is absent, only the start Linked Event is generated.
- **Reservations Tab** — A new top-level trip tab (added to `TripDetailTab`) that lists all of a trip's Reservations, grouped by Reservation Type into accordion sections, and is the entry point for adding/editing Reservations.
- **Now Card** — Existing component that surfaces the current or next-upcoming Itinerary event, including Linked Events from Reservations.
- **Cover** — A trip's cover image, with existing `CoverType` of Photo, Map, or Graphic.
- **Cover Overflow Menu** — A "⋯" menu in the upper-right of the Cover, containing Edit Cover (always shown), Remove Cover (shown only when Cover is Photo or Map; reverts to a random Graphic Cover), and Info (shown only when Cover is an Unsplash photo; opens an attribution dialog).

## 4. Features

### 4.1 Reservations Tab

**Description:** A new top-level trip tab listing all Reservations, grouped by Reservation Type into accordion sections. Each section shows a count and a preview of the next-upcoming Reservation of that type when collapsed, and expands in place to show every Reservation of that type. Adding and editing Reservations both happen on this tab. Realizes UJ-1, UJ-4.

**Functional Requirements:**

#### FR-1: Add a Reservation

A user can add a Reservation to a trip from the Reservations tab. Realizes UJ-1.

**Consequences (testable):**

- Tapping "Add Reservation" first shows a Reservation Type picker (Flight, Train, Bus, Ferry, Rental Car, Lodging, Cruise).
- After a type is selected, the add dialog shows fields labeled per that type (e.g., Lodging shows "Check-in"/"Check-out"; Flight shows "Departure"/"Arrival"), plus provider, optional confirmation code, and optional notes.
- `endTime` is optional for every type; saving without it produces a Reservation with only a `startTime`.
- On save, the new Reservation appears as a row in its type's accordion section on the Reservations tab.

#### FR-2: View Reservations grouped by type

A user can see all of a trip's Reservations organized by Reservation Type. Realizes UJ-2, UJ-4.

**Consequences (testable):**

- Each Reservation Type with at least one Reservation gets its own accordion section; types with zero Reservations show no section.
- A collapsed section shows the Reservation count and a preview (provider + start time) of the next-upcoming Reservation of that type.
- Expanding a section reveals every Reservation of that type as individual rows.

**Out of Scope:**

- Chronological (all-types, date-sorted) view — deferred; see §6.2.

#### FR-3: Edit a Reservation

A user can edit any field of an existing Reservation. Realizes UJ-4.

**Consequences (testable):**

- Each field on a Reservation row is click-to-edit, consistent with the app's existing inline-edit pattern.
- Saving an edit to `startTime`, `endTime`, or `type` updates that Reservation's Linked Event(s) on the Itinerary immediately, with no separate sync step.
- Linked Events are never independently editable from the Itinerary.

#### FR-4: Delete a Reservation

A user can delete a Reservation. `[ASSUMPTION: standard delete action with confirmation, consistent with existing delete patterns elsewhere in the app — not explicitly discussed.]`

**Consequences (testable):**

- Deleting a Reservation removes it from its accordion section.
- Deleting a Reservation removes its Linked Event(s) from the Itinerary.

#### FR-5: Empty state for new trips

A trip with zero Reservations shows a single descriptive prompt on the Reservations tab instead of empty per-type sections.

**Consequences (testable):**

- The empty state invites the user to add a Flight, Lodging, Rental Car, and more, and leads into the FR-1 add flow (type picker first).
- Per-type accordion sections only appear once at least one Reservation of that type exists.

### 4.2 Itinerary Integration

**Description:** Reservations project Linked Events onto the Itinerary, and the Itinerary surfaces an entry point into the Reservations tab for users who haven't added any Reservations yet (or want to add more). Realizes UJ-1, UJ-2, UJ-4.

**Functional Requirements:**

#### FR-6: Linked Events on the Itinerary

Each Reservation projects one or two Linked Events onto the Itinerary, labeled per Reservation Type (see Glossary). Realizes UJ-1.

**Consequences (testable):**

- A Reservation with only `startTime` produces one Linked Event on the corresponding day.
- A Reservation with both `startTime` and `endTime` produces two Linked Events, one on each corresponding day.
- Linked Events are visually distinguishable from manually-created Itinerary events (e.g., a "linked" indicator), so users understand they originate from a Reservation.

#### FR-7: Itinerary empty-state CTA

A trip with zero Reservations shows a CTA at the top of the Itinerary prompting the user to add reservations. Realizes UJ-1.

**Consequences (testable):**

- Tapping the CTA navigates to the Reservations tab with the FR-1 add dialog already open (type picker shown).
- Once the trip has at least one Reservation, the CTA's copy changes to prompt adding more Reservations, but continues to link to the Reservations tab.

#### FR-8: Now Card surfaces Linked Events

The existing Now Card includes Linked Events when determining the current/next-upcoming event. Realizes UJ-2.

**Consequences (testable):**

- If a Linked Event is the chronologically next event, it appears on the Now Card exactly as a manually-created event would.

#### FR-9: Editing from the Itinerary redirects to Reservations

Tapping a Linked Event on the Itinerary takes the user to the Reservations tab to edit it. Realizes UJ-4.

**Consequences (testable):**

- Tapping a Linked Event navigates to the Reservations tab, scrolled/expanded to the relevant Reservation's accordion section row.
- No inline editing of a Linked Event is available directly on the Itinerary.

### 4.3 Cover Overflow Menu

**Description:** The trip Cover gains a "⋯" overflow menu in its upper-right corner, consolidating cover-image management that previously lived in the trip edit sheet. Realizes UJ-3.

**Functional Requirements:**

#### FR-10: Cover Overflow Menu

A user can open a "⋯" menu on the trip Cover with up to three actions, conditional on the current Cover state. Realizes UJ-3.

**Consequences (testable):**

- "Edit Cover" is always shown and opens the existing cover edit dialog (photo/map/graphic picker).
- "Remove Cover" is shown only when `CoverType` is Photo or Map; selecting it sets the Cover to a random Graphic.
- "Info" is shown only when the Cover is an Unsplash photo; selecting it opens a dialog with photographer credit and a link to Unsplash.
- The menu's available options update immediately after any action that changes `CoverType` (e.g., Remove Cover hides "Remove Cover" and "Info" on next open, since the Cover is now Graphic).

#### FR-11: Cover controls removed from the edit sheet

The trip edit sheet no longer contains cover image controls; all cover management happens via FR-10.

**Consequences (testable):**

- `trip-edit-sheet.tsx` (and `trip-edit-cover.tsx` if it becomes unused) no longer renders cover image editing UI.
- All other edit sheet fields (name, dates, destination, budget, collaborators, Delete Trip) remain unchanged.

**Notes:**

- `[NOTE FOR PM]` Confirm whether `trip-edit-cover.tsx` becomes fully dead code after FR-11, or still has a role (e.g., shared sub-component reused by FR-10's Edit Cover dialog).


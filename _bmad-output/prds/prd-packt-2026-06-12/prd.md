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


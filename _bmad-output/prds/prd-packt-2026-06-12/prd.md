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


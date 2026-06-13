---
title: Reservations & Trip Logistics
status: final
created: 2026-06-12
updated: 2026-06-13
---

# PRD: Reservations & Trip Logistics

## 0. Document Purpose

This PRD is for whoever implements (and reviews) the Reservations tab, its Itinerary integration, and the Cover Overflow Menu in Packt. It builds on `_bmad-output/brainstorming/brainstorming-session-2026-06-12-0657.md`, which explored the original ideas — this PRD narrows and revises that exploration into an implementation-ready scope (notably, the new tab is reservations-only rather than a full trip-metadata "command center," and the trip edit sheet is retained). The document is organized around named user journeys (§2.2), a shared Glossary (§3) that the rest of the document uses verbatim, and Features with globally-numbered Functional Requirements (§4). `[ASSUMPTION]` tags are used inline where inferred without explicit confirmation, and indexed in §9.

## 1. Vision

Packt currently treats a trip as an Itinerary of day-by-day events, with a separate edit sheet for trip metadata. There's no place to record what's actually been booked — flights, hotel stays, rental cars, trains, buses, ferries, or cruises — beyond manually adding events for them.

This feature adds **Reservations**: a first-class record of a trip's bookings, each with a type, time window, provider, and confirmation code. Reservations live on a new Reservations tab, organized by type so a user can quickly see "what hotels do I have," "what's my rental car situation," and so on. Critically, Reservations aren't just a list — each one projects Linked Events onto the Itinerary (check-in/check-out, pickup/return, departure/arrival), so the day-by-day view automatically reflects what's booked without the user re-entering the same information twice. Editing a Reservation's time updates the Itinerary everywhere it matters, automatically.

Separately, and independently shippable, the trip Cover gains an overflow menu that consolidates image management (edit, remove, attribution) that currently lives in the edit sheet — a small but immediate reduction in edit-sheet surface area.

Together, these changes make Packt a more complete source of truth for a trip: not just "what am I doing each day" but "what have I actually booked," with the two views staying in sync automatically.

## 2. Target User

### 2.1 Jobs To Be Done

- As a trip planner, I want to record my bookings (flights, hotels, rental cars, etc.) in one place, so I have a single reference for confirmation codes and provider details without digging through email.
- As a trip planner, I want booking details to automatically show up on the right days in my Itinerary, so I don't have to manually re-create check-in/check-out or pickup/return events.
- As a traveler mid-trip, I want to quickly find "what time is my rental car pickup" or "what's my hotel confirmation number" without hunting through email or a separate app.
- As a trip owner, I want to manage my trip's cover image (change it, remove it, check photo credit) without opening the full edit sheet.

### 2.2 Key User Journeys

- **UJ-1. Ashley adds her first reservation from a confirmation email.**
  - **Persona + context:** Ashley, mid-trip-planning, just received a hotel confirmation email.
  - **Entry state:** Authenticated, opens the app, lands on the Itinerary tab (default) for the trip — no reservations yet.
  - **Path:** Sees a CTA at the top of the Itinerary ("Add reservations for hotels, rentals, and more") → taps it → navigates to the Reservations tab with the Add Reservation dialog already open → picks type (Lodging), fills in provider, check-in/check-out, confirmation code → saves.
  - **Climax:** Lands back on the Reservations tab and sees the new reservation as a row in the Lodging section. Switches to the Itinerary and sees Check-in/Check-out details filled in on the corresponding days.
  - **Resolution:** The Itinerary CTA changes to prompt adding more reservations, continuing to direct Ashley to the Reservations tab as the source of truth for reservations.

- **UJ-2. Ashley checks a reservation detail mid-trip.**
  - **Persona + context:** Ashley, partway through the trip, wants to confirm a detail (e.g., rental car pickup time) for a reservation she already added.
  - **Entry state:** Authenticated, mid-trip, opens the app to the Itinerary.
  - **Path:** If the reservation's linked event is the next thing coming up, it's already surfaced on the Now Card — no further navigation needed. If it's further out, Ashley either navigates to the Itinerary day where she expects the linked event (if she knows roughly when), or goes to the Reservations tab and finds it in the relevant reservation section (e.g., Rental Cars) if she'd rather not hunt by date.
  - **Climax:** Ashley finds the detail she needs (pickup time, confirmation code) via whichever path she chose, without needing to cross-reference the other tab.
  - **Resolution:** Confirms the detail and continues with the trip. Both the Itinerary (via linked events) and the Reservations tab (via reservation sections) are valid, equally-supported paths to the same underlying reservation data.

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

- **Reservation** — A booked logistics item belonging to a trip. Has a `type` (see Reservation Type), a `startTime` (required), an `endTime` (required for Lodging, Rental Car, and Cruise; optional for Flight, Train, Bus, and Ferry), a `provider` (operator/company name), an optional `confirmationCode`, and an optional free-text `notes` field. Reservations are managed on the Reservations tab and are the single source of truth for their Linked Events on the Itinerary.
- **Reservation Type** — The category of a Reservation: Flight, Train, Bus, Ferry, Rental Car, Lodging, or Cruise. Selected first when adding a Reservation, before other fields, since it determines the labels shown for `startTime`/`endTime` and whether `endTime` is required. Immutable once the Reservation is created.
- **Linked Event** — An Itinerary entry computed/derived from a Reservation's `startTime` (and `endTime`, if present) — not a separate `TripEvent` row. The Itinerary renders Linked Events alongside regular `TripEvent` rows. Always derived from the Reservation; never independently editable — editing the Reservation's `startTime`/`endTime` changes its Linked Event(s) everywhere they appear on the Itinerary with no separate sync step, and deleting the Reservation simply removes its Linked Event(s) from the computed view. Labeled per Reservation Type:
  - Lodging → Check-in / Check-out (both required)
  - Rental Car → Pickup / Return (both required)
  - Cruise → Departure / Return (both required)
  - Flight, Train, Bus, Ferry → Departure / Arrival (Arrival optional)
  - If `endTime` is absent (only possible for Flight, Train, Bus, Ferry), only the start Linked Event is generated.
- **Reservations Tab** — A new top-level trip tab (added to `TripDetailTab`) that lists all of a trip's Reservations, grouped by Reservation Type into accordion sections, and is the entry point for adding/editing Reservations.
- **Document** — Existing entity (`Document` in `src/data/types.ts`) representing an uploaded file, with a `scope` of `"trip"` or `"event"`. This PRD adds `"reservation"` as a valid `scope`, so Documents can be attached directly to a Reservation (e.g., a boarding pass PDF or hotel confirmation).
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
- `endTime` is required for Lodging, Rental Car, and Cruise; the dialog cannot be saved without it for those types.
- `endTime` is optional for Flight, Train, Bus, and Ferry; saving without it produces a Reservation with only a `startTime`.
- On save, the new Reservation appears as a row in its type's accordion section on the Reservations tab.
- Once saved, a Reservation's `type` cannot be changed. Only its other fields (time anchor, provider, confirmation code, notes, documents) are editable afterward (FR-3).

#### FR-2: View Reservations grouped by type

A user can see all of a trip's Reservations organized by Reservation Type. Realizes UJ-2, UJ-4.

**Consequences (testable):**

- Each Reservation Type with at least one Reservation gets its own accordion section; types with zero Reservations show no section.
- A collapsed section shows the Reservation count and a preview (provider + start time) of the next-upcoming Reservation of that type.
- Expanding a section reveals every Reservation of that type as individual rows, ordered by `startTime`. `[ASSUMPTION: chronological order within a section — not explicitly discussed.]`

**Out of Scope:**

- Chronological (all-types, date-sorted) view — deferred; see §6.2.

#### FR-3: Edit a Reservation

A user can edit any field of an existing Reservation except `type` (immutable, see FR-1). Realizes UJ-4.

**Consequences (testable):**

- Each editable field on a Reservation row is click-to-edit, consistent with the app's existing inline-edit pattern. `type` is displayed but not editable.
- Saving an edit to `startTime` or `endTime` updates that Reservation's Linked Event(s) on the Itinerary immediately, with no separate sync step (Linked Events are computed from the Reservation, not stored separately).
- Linked Events are never independently editable from the Itinerary.

#### FR-4: Delete a Reservation

A user can delete a Reservation, with a confirmation step before the delete is applied.

**Consequences (testable):**

- Deleting a Reservation removes it from its accordion section.
- Deleting a Reservation removes its Linked Event(s) from the Itinerary.

#### FR-5: Attach documents to a Reservation

A user can attach Documents (e.g., a boarding pass PDF, hotel confirmation) directly to a Reservation. `[ASSUMPTION: uses the existing Document upload UI/components from the Documents tab, with scope "reservation" — not discussed in detail.]`

**Consequences (testable):**

- `Document.scope` supports `"reservation"` in addition to the existing `"trip"` and `"event"`.
- Documents attached to a Reservation are visible from that Reservation's row on the Reservations tab.
- Deleting a Reservation (FR-4) also removes its attached Documents, consistent with how deleting a trip/event removes its scoped Documents today. `[ASSUMPTION: not explicitly discussed — cascading delete assumed to match existing Document lifecycle behavior.]`

#### FR-6: Empty state for new trips

A trip with zero Reservations shows a single descriptive prompt on the Reservations tab instead of empty per-type sections.

**Consequences (testable):**

- The empty state invites the user to add a Flight, Lodging, Rental Car, and more, and leads into the FR-1 add flow (type picker first).
- Per-type accordion sections only appear once at least one Reservation of that type exists.

### 4.2 Itinerary Integration

**Description:** Reservations project Linked Events onto the Itinerary, and the Itinerary surfaces an entry point into the Reservations tab for users who haven't added any Reservations yet (or want to add more). Realizes UJ-1, UJ-2, UJ-4.

**Functional Requirements:**

#### FR-7: Linked Events on the Itinerary

Each Reservation projects one or two Linked Events onto the Itinerary, labeled per Reservation Type (see Glossary). Realizes UJ-1.

**Consequences (testable):**

- A Reservation with only `startTime` produces one Linked Event on the corresponding day.
- A Reservation with both `startTime` and `endTime` produces two Linked Events, one on each corresponding day.
- Linked Events are visually distinguishable from manually-created Itinerary events (e.g., a "linked" indicator), so users understand they originate from a Reservation.

#### FR-8: Reservations extend the Itinerary's date range

If a Reservation's `startTime` or `endTime` falls outside the trip's current date range, the Itinerary is extended with real Day(s) to cover it — not a placeholder "Day 0." Realizes UJ-1.

**Consequences (testable):**

- Saving a Reservation whose date falls before the trip's `startDate` or after its `endDate` extends that boundary to include the Reservation's date(s).
- A new Day is added to the Itinerary for each newly-included date, and existing Day numbering shifts accordingly (e.g., a Reservation the night before the original Day 1 becomes the new Day 1, and the original Day 1 becomes Day 2).
- The new Day(s) display the Reservation's Linked Event(s) (FR-7) like any other Day.

**Notes:**

- `[ASSUMPTION]` Day-number shifts from this extension are assumed to be acceptable (e.g., no separate "pre-trip"/"post-trip" section) — not discussed in detail.

#### FR-9: Itinerary empty-state CTA

A trip with zero Reservations shows a CTA at the top of the Itinerary prompting the user to add reservations. Realizes UJ-1.

**Consequences (testable):**

- Tapping the CTA navigates to the Reservations tab with the FR-1 add dialog already open (type picker shown).
- Once the trip has at least one Reservation, the CTA's copy changes to prompt adding more Reservations, but continues to link to the Reservations tab.

#### FR-10: Now Card surfaces Linked Events

The existing Now Card includes Linked Events when determining the current/next-upcoming event. Realizes UJ-2.

**Consequences (testable):**

- If a Linked Event is the chronologically next event, it appears on the Now Card exactly as a manually-created event would.

#### FR-11: Editing from the Itinerary redirects to Reservations

Tapping a Linked Event on the Itinerary takes the user to the Reservations tab to edit it. Realizes UJ-4.

**Consequences (testable):**

- Tapping a Linked Event navigates to the Reservations tab, scrolled/expanded to the relevant Reservation's accordion section row.
- No inline editing of a Linked Event is available directly on the Itinerary. The same "linked" visual indicator from FR-7 communicates to the user that tapping will navigate away to edit, rather than open inline editing.

### 4.3 Cover Overflow Menu

**Description:** The trip detail page's Cover (`trip-hero.tsx`) gains a "⋯" overflow menu in its upper-right corner, consolidating cover-image management that previously lived in the trip edit sheet. This is a new menu instance on the trip detail page, following the same visual pattern (`MoreHorizontal` trigger, `DropdownMenu`) as the existing trip-list card overflow menu in `now-card.tsx` — it does not modify or duplicate that menu's "Edit trip"/"Delete trip" items. Realizes UJ-3.

**Functional Requirements:**

#### FR-12: Cover Overflow Menu

A user can open a "⋯" menu on the trip Cover with up to three actions, conditional on the current Cover state. Realizes UJ-3.

**Consequences (testable):**

- "Edit Cover" is always shown and opens the existing `CoverImagePicker` dialog — the same dialog component currently opened from the edit sheet via `trip-edit-cover.tsx`, not a new dialog.
- "Remove Cover" is shown only when `CoverType` is Photo or Map; selecting it sets the Cover to a random Graphic.
- "Info" is shown only when the Cover is an Unsplash photo; selecting it opens a dialog with photographer credit and a link to Unsplash.
- The menu's available options update immediately after any action that changes `CoverType` (e.g., Remove Cover hides "Remove Cover" and "Info" on next open, since the Cover is now Graphic).

**Notes:**

- `[NOTE FOR PM]` "Remove Cover" (revert to a random Graphic cover) is a new behavior, distinct from the existing `trip-edit-cover.tsx` "Remove image" action (clears `coverImageUrl` to `null`, falling back to a deterministic per-trip tinted stripe pattern — not a `graphic:` cover). Confirm this is an intentional behavior change, not a reuse of the existing clear-to-null action.

#### FR-13: Cover controls removed from the edit sheet

The trip edit sheet no longer contains cover image controls; all cover management happens via FR-12.

**Consequences (testable):**

- `trip-edit-sheet.tsx` no longer renders cover image editing UI; `trip-edit-cover.tsx` is removed as it becomes unused (FR-12 invokes `CoverImagePicker` directly).
- All other edit sheet fields (name, dates, destination, budget, collaborators, Delete Trip) remain unchanged.

## 5. Non-Goals (Explicit)

- This feature does not change how trip metadata (name, dates, destination, budget, collaborators) is edited — the edit sheet remains the home for these fields, unchanged except for the removal of cover controls (FR-13).
- This feature does not introduce cost-tracking or linking Reservations to the trip budget.
- Restaurant reservations, activities, and tours remain plain Itinerary events; they are not a Reservation Type.

## 6. MVP Scope

### 6.1 In Scope

- Reservations tab (FR-1 through FR-6): add, view (grouped by type), edit, delete, document attachments, empty state.
- Reservation Types: Flight, Train, Bus, Ferry, Rental Car, Lodging, Cruise.
- Itinerary integration (FR-7 through FR-11): Linked Events, date-range extension, empty-state CTA, Now Card support, redirect-to-edit.
- Cover Overflow Menu (FR-12, FR-13): Edit Cover, Remove Cover, Info, removal of cover controls from the edit sheet.

### 6.2 Out of Scope for MVP

- Chronological (all-types, date-sorted) view toggle for the Reservations tab — deferred; the by-type accordion view with collapsed previews is the v1 view. `[NOTE FOR PM]` Revisit if dense itineraries make by-type scanning tedious.
- Type-specific structured fields beyond the uniform shape (flight number, room number, etc.) — captured via the free-text notes field for now.
- Cost tracking / budget linkage for Reservations.

## 7. Success Metrics

Given this is a personal project moving toward a public release, success is qualitative for v1:

**Primary**

- **SM-1**: Spenc adds at least one real trip's worth of Reservations (flights, lodging, etc.) and finds the Linked Events on the Itinerary match reality without manual correction. Validates FR-1, FR-7.
- **SM-2**: Editing a Reservation's time updates the Itinerary correctly every time, with no observed drift between Reservation and Linked Event. Validates FR-3, FR-7.

**Counter-metrics (do not optimize)**

- **SM-C1**: Adding a Reservation should not feel slower or more cumbersome than just adding a manual Itinerary event for the same thing — the type-first picker (FR-1) should not add friction. Counterbalances SM-1.

## 8. Open Questions

1. Should the chronological view toggle (§6.2) be revisited before or after initial usage feedback?

## 9. Assumptions Index

- §4.1 FR-5 — Document attachment on Reservations is assumed to reuse the existing Document upload UI/components from the Documents tab, with `scope: "reservation"`.
- §4.1 FR-5 — Deleting a Reservation is assumed to cascade-delete its attached Documents, matching existing Document lifecycle behavior for trip/event-scoped Documents.
- §4.2 FR-8 — Day-number shifts from extending the Itinerary's date range (e.g., original Day 1 becoming Day 2) are assumed acceptable, with no separate "pre-trip"/"post-trip" section.
- §4.1 FR-2 — Reservations within an expanded accordion section are assumed to be ordered chronologically by `startTime`.


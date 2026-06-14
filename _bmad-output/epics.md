---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - _bmad-output/prds/prd-packt-2026-06-12/prd.md
  - _bmad-output/architecture.md
  - _bmad-output/ux-designs/ux-packt-2026-06-13/DESIGN.md
  - _bmad-output/ux-designs/ux-packt-2026-06-13/EXPERIENCE.md
  - _bmad-output/project-context.md
---

# Packt - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Packt, decomposing the requirements from the PRD, UX Design, and Architecture for the **Reservations & Trip Logistics** feature into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: A user can add a Reservation to a trip from the Reservations tab. Tapping "Add Reservation" first shows a Reservation Type picker (Flight, Train, Bus, Ferry, Rental Car, Lodging, Cruise, Other). After a type is selected, the add dialog shows fields labeled per that type, plus provider, optional confirmation code, and optional notes. `endTime` is required for Lodging, Rental Car, and Cruise; optional for Flight, Train, Bus, Ferry, and Other. On save, the new Reservation appears as a row in its type's accordion section. Once saved, a Reservation's `type` cannot be changed. **[ADDED]** "Other" is a catch-all 8th type for bookings that don't fit the other 7 categories; its anchor fields use generic "Start"/"End" labels (instead of a type-specific pair like Check-in/Check-out) and follow the same `endTime`-optional rule as Flight/Train/Bus/Ferry.

FR2: A user can see all of a trip's Reservations organized by Reservation Type. Each Reservation Type with at least one Reservation gets its own accordion section; types with zero Reservations show no section. A collapsed section shows the Reservation count and a preview (provider + start time) of the next-upcoming Reservation of that type. Expanding a section reveals every Reservation of that type as individual rows, ordered chronologically by `startTime`.

FR3: A user can edit any field of an existing Reservation except `type` (immutable). Each editable field is click-to-edit, consistent with the app's existing inline-edit pattern. Saving an edit to `startTime` or `endTime` updates that Reservation's Linked Event(s) on the Itinerary immediately, with no separate sync step. Linked Events are never independently editable from the Itinerary.

FR4: A user can delete a Reservation, with a confirmation step before the delete is applied. Deleting a Reservation removes it from its accordion section and removes its Linked Event(s) from the Itinerary.

FR5: A user can attach Documents (e.g., a boarding pass PDF, hotel confirmation) directly to a Reservation. `Document.scope` supports `"reservation"` in addition to the existing `"trip"` and `"event"`. Documents attached to a Reservation are visible from that Reservation's row. Deleting a Reservation also removes its attached Documents (cascade).

FR6: A trip with zero Reservations shows a single descriptive prompt on the Reservations tab instead of empty per-type sections. The empty state invites the user to add a Flight, Lodging, Rental Car, and more, and leads into the FR-1 add flow (type picker first). Per-type accordion sections only appear once at least one Reservation of that type exists.

FR7: Each Reservation projects one or two Linked Events onto the Itinerary, labeled per Reservation Type. A Reservation with only `startTime` produces one Linked Event; with both `startTime` and `endTime` produces two Linked Events, one on each corresponding day. Linked Events are visually distinguishable from manually-created Itinerary events (a "linked" indicator). **[ADDED]** For the "Other" type, Linked Events use generic "Start"/"End" labels, matching that type's anchor field labels.

FR8: If a Reservation's `startTime` or `endTime` falls outside the trip's current date range, the Itinerary is extended with real Day(s) to cover it. Saving a Reservation whose date falls before the trip's `startDate` or after its `endDate` extends that boundary to include the Reservation's date(s). A new Day is added to the Itinerary for each newly-included date, and existing Day numbering shifts accordingly. The new Day(s) display the Reservation's Linked Event(s) like any other Day.

FR9: A trip with zero Reservations shows a CTA at the top of the Itinerary prompting the user to add reservations. Tapping the CTA navigates to the Reservations tab with the FR-1 add dialog already open (type picker shown). Once the trip has at least one Reservation, the CTA's copy changes to prompt adding more Reservations, but continues to link to the Reservations tab.

FR10: The existing Now Card includes Linked Events when determining the current/next-upcoming event. If a Linked Event is the chronologically next event, it appears on the Now Card exactly as a manually-created event would.

FR11: Tapping a Linked Event on the Itinerary takes the user to the Reservations tab to edit it, scrolled/expanded to the relevant Reservation's accordion section row. No inline editing of a Linked Event is available directly on the Itinerary.

FR12: A user can open a "⋯" menu on the trip Cover with up to three actions, conditional on the current Cover state. "Edit Cover" is always shown and opens the existing `CoverImagePicker` dialog. "Remove Cover" is shown only when `CoverType` is Photo or Map; selecting it sets the Cover to a random Graphic. "Info" is shown only when the Cover is an Unsplash photo; selecting it opens a dialog with photographer credit and a link to Unsplash. The menu's available options update immediately after any action that changes `CoverType`.

FR13: The trip edit sheet no longer contains cover image controls; all cover management happens via FR-12. `trip-edit-sheet.tsx` no longer renders cover image editing UI; `trip-edit-cover.tsx` is removed as it becomes unused (FR-12 invokes `CoverImagePicker` directly). All other edit sheet fields (name, dates, destination, budget, collaborators, Delete Trip) remain unchanged.

### NonFunctional Requirements

NFR1: WCAG AA accessibility floor (inherited Packt standard) applies, extended with the specific aria patterns in EXPERIENCE.md's Accessibility Floor — accordion accessible names, click-to-edit keyboard support, paired date/time fieldsets, Linked Event row labeling.

NFR2: Existing coverage thresholds (≥95% lines/functions, ≥90% branches on `src/lib/**` and `src/components/packt/**`) apply unchanged to all new/modified code in this feature.

NFR3: Existing testing pyramid applies unchanged — Vitest unit/component tests for logic and rendering, Playwright-BDD E2E only for user-facing behavior that crosses server/client boundaries, with no duplication across layers.

NFR4: No new performance, offline, or real-time requirements — Linked Events are computed at request time in the existing server-rendered/revalidated flow; no caching or sync layer is introduced.

### Additional Requirements

- New `reservations` table in `src/db/schema.ts`, modeled on `events` (uuid primary key via `gen_random_uuid()`, FK to `trips` with cascade delete, `type`/`startAt`/`endAt`/`provider`/`confirmationCode`/`notes`/timestamps). No `position` field — sorted by `startAt`.
- `ReservationType` added to `src/data/types.ts` as a const-object + union (`flight | train | bus | ferry | rental-car | lodging | cruise | other`), per the project's enum convention. These exact kebab-case string literals must be used everywhere (DB column, accordion grouping keys, icon maps, tests). **[ADDED]** `other` is an 8th catch-all type; its anchor fields/Linked Events use generic "Start"/"End" labels (not a type-specific pair) and follow the `endTime`-optional rule (like flight/train/bus/ferry).
- `documents` table gains a nullable `reservation_id` FK column (`onDelete: "cascade"`), alongside existing nullable `tripId`/`eventId`. `Document["scope"]` union becomes `"trip" | "event" | "reservation"`. `dbDocToType()`'s orphan check extends to all three FKs.
- `dbReservationToType()` mapper added to `src/lib/db-mappers.ts` (existing file, not a new mapper file).
- New pure module `src/lib/linked-events.ts` exporting `deriveLinkedEvents(reservations: Reservation[]): TripEvent[]` — no alternate function names. For each Reservation, produces 1–2 synthetic `TripEvent`-shaped objects per the Glossary's anchor labels (Check-in/Check-out, Pickup/Return, Departure/Arrival, Departure/Return).
- `TripEvent` extended with exactly two new optional fields: `linkedReservationId?: string` and `reservationType?: ReservationType` — the sole contract between derivation, query-layer merge, and rendering components. No alternate/extra marker fields.
- `src/lib/queries.ts` merges `deriveLinkedEvents()` output into each `DayItinerary.events` array (interleaved with real events, sorted by `startAt`) and into the Now Card's `todayEvents`. No new `events` rows are written; Linked Events never touch the DB.
- New server actions file `src/app/(app)/trips/[tripId]/reservations/actions.ts` (own file, not appended to existing `actions.ts`): `createReservation`, `updateReservation`, `deleteReservation`, plus reuse of existing document upload/delete actions with `scope: "reservation"`. Each follows `requireUser()` → `assertTripAccess(tripId, "editor")` → mutate → `revalidatePath(/trips/${tripId})`. Return `Promise<void>`, throw `Error("<user-facing message>")` on failure — no `{ success, error }` wrapper.
- FR-8's `days` extension (insert new day(s), shift `dayNumber` for existing days, update `trip.startDate`/`endDate`) and the Reservation insert/update happen in a single `db.transaction()` — any failure rolls back both. This is the only feature area touching the `days` table; `addDay`/`removeLastDay` in the existing `actions.ts` remain untouched.
- Vercel Blob `del()`-before-cascade rule applies: deleting a Reservation must `del()` each attached Document's blob URL before the Reservation row (and its cascade-deleted `documents` rows) are removed.
- `TripDetailTab` gains a `Reservations: "res"` value (3-char code matching `itin`/`docs`/`pack` length convention); `resolveTripDetailTab()` (`trip-detail-tabs.ts`) is extended to recognize it. `TripDetailTabBody` gains an `activeTab === "res"` branch rendering a new `ReservationsTab` component, as a sibling to `TripItineraryView`/`TripDocsTab`/`PackingListsView`.
- URL search params `action` and `highlight` are the only two new param names for FR-9/FR-11 cross-tab orchestration: `?tab=res&action=add-reservation` (auto-opens FR-1 type picker on mount) and `?tab=res&highlight={reservationId}` (scrolls to/expands the accordion section containing that Reservation, highlights its row). Values are kebab-case. `ReservationsTab` reads these via `useSearchParams()` on mount, performs the sequenced behavior, then calls `router.replace()` to strip the param.
- `npm run db:migrate:e2e` must be re-run after the schema migration for the new `reservations` table and `documents.reservation_id` column is generated.
- Accordion expand/collapse state and Add/Edit Drawer state (open/closed, selected type, add-vs-edit mode) are local `useState` in the Reservations tab's client component — no global store.
- **[ADDED]** `trips` table gains two nullable text columns, `coverPhotographer` and `coverPhotographerUrl`, to support FR-12's "Info" action. `CoverImageSearchResult` (and the Unsplash response mapping in `cover-image-search-actions.ts`) is extended with a `photographerUrl` field (from Unsplash's `user.links.html`). The cover-image search tab's `onImageSelected` is extended to pass `{ url, photographer, photographerUrl }` through so both are persisted alongside `coverImageUrl` when a Photo is selected. A trip's cover is considered an "Unsplash photo" (for FR-12's conditional "Info" item) when `CoverType === "photo"` AND `coverPhotographer` is non-null; selecting a Map, Graphic, custom upload, or URL-based Photo cover clears both `coverPhotographer`/`coverPhotographerUrl` to `null`.

### UX Design Requirements

UX-DR1: A single, centralized Reservation Type → icon mapping (lucide-react, `strokeWidth={1.5}` always) — Flight→`Plane`, Train→`Train`, Bus→`Bus`, Ferry→`Ship`, Rental Car→`Car`, Lodging→`Hotel`, Cruise→`Anchor`, Other→`Package` — must be used consistently across the FR-1 dropdown items, accordion headers, drawer title icon swatches, and Linked Event rows. Centralized as the single exported source in `reservation-type-badge.tsx`, imported by `reservation-type-picker.tsx` and the accordion header. `Anchor` (not `Ship`) is used for Cruise specifically to disambiguate from Ferry. **[ADDED]** `Package` is used for the catch-all "Other" type, distinct from all other type icons.

UX-DR2: Reservation Type accordion sections are visually modeled on `day-card.tsx`/`day-card-header.tsx`: `rounded-[14px]` container, `1px solid var(--line)` border, `var(--bg)` background, `12px` bottom margin, `overflow: hidden`. Header (`12px 16px` padding, `var(--surface)` background, clickable) shows the type icon + name (`card-title`) on the left, and a count badge (pill, `22px` height, `11px` weight 600, `aria-hidden`) + `ChevronDown` (rotates 180° when open, `aria-hidden`) on the right. Border between header and body only present when expanded. Collapsed preview ("Next: **{provider}** · {weekday}, {month} {day} · {time}") uses `var(--fg-2)` (not the default `var(--fg-3)`) for AA contrast on `var(--surface)`. Sections with zero Reservations of that type render no accordion at all. Populated sections are ordered by each type's next-upcoming Reservation's `startTime`, soonest first, re-sorting live as Reservations are added/edited/deleted across types.

UX-DR3: Within an expanded accordion section, each Reservation renders as a row (`14px 16px` padding, `1px solid var(--line)` bottom border, omitted on the last row): provider name (`card-title`, 15px/weight 600), one or two anchor lines (label `var(--fg-3)` fixed `68px` min-width + value `var(--fg-2)`, both `card-sub`/13px, format "Tue, Jun 16 · 3:00 PM"), an optional confirmation code chip (`var(--surface-2)` background, mono font, with `aria-hidden` `Wallet`-style icon), and attached documents as inline document rows (`DocKindBadge`, truncated filename, `32px`/`size-8` upload-affordance icon button with `title="Add document"`). A no-documents state shows a dashed row reading "Add confirmation document" with an `Upload` icon, matching the Documents-tab empty affordance but inline/compact. Each editable field (provider, anchor times, confirmation code, notes) is click-to-edit per `doc-row.tsx`'s inline-rename pattern (click text → input with teal underline, blur/Enter saves, Escape cancels); `type` is displayed via the accordion icon/title only, never editable on the row.

UX-DR4: The Add/Edit Reservation drawer uses `Drawer`/`DrawerContent`/`DrawerHeader`/`DrawerFooter` (same primitive as `trip-edit-sheet.tsx`). Header: `32px`×`32px` rounded icon swatch (selected type's icon) + drawer title ("Add {Type} Reservation" / "Edit {Type} Reservation", 18px heading font) + subtitle "Type: {Type} (cannot be changed after saving)" (without the parenthetical on Edit). Body (`16px 20px 24px` padding, `18px` field gap, scrollable) contains: Provider* (`h-9` Input), time-anchor fields labeled per Reservation Type as `<fieldset>`s with `<legend>`/`aria-labelledby` = visible label and per-input `aria-label`s for date/time (second anchor required* for Lodging/Rental Car/Cruise, optional for Flight/Train/Bus/Ferry), Confirmation code (Optional, Input), Notes (Optional, Textarea, `72px` min-height), and a Documents section reusing the Documents-tab empty-state composition (`Empty`/`EmptyMedia variant="icon"`/etc., "No documents yet", "Add document" button) when empty, or inline document rows when populated. Required fields show a teal `*` and `aria-required="true"`; optional fields show a muted "Optional" suffix — both as part of the `<label>` text. Footer (`1px solid var(--line)` top border, `14px 20px` padding): right-aligned ghost Cancel + primary Save, identical to `trip-edit-sheet.tsx`'s `DrawerFooter`. On Add, the drawer opens directly into the selected type's fields with no in-drawer type switcher.

UX-DR5: A Linked Event renders as a normal Itinerary event row (same padding, border, time column, "happening now" treatment). The only two differences from a manual event row: (1) the Reservation Type's icon (per UX-DR1 mapping) replaces the default `MapPin` icon, same size/color/`strokeWidth`, `aria-hidden="true"`; (2) a small "Linked" pill badge (`18px` height, `0 7px` padding, `999px` radius, `10px` text, weight 500, `var(--surface-2)`/`var(--fg-2)` — exactly the `Badge` `muted`/`secondary` variant, no new variant) placed inline after the event name, with the badge text itself `aria-hidden="true"`. The meta line shows the full date+time anchor format ("Check-in: Tue, Jun 16 · 3:00 PM — from {Type} reservation"). No left border, no row background tint, no new color token — a Linked Event that is also "happening now" uses the standard `var(--accent-soft)`/"Now" pill treatment with no badge-specific override.

UX-DR6: No new color tokens are introduced by this feature. The previously-proposed `--linked-brand`/`--linked-soft`/`--linked-ink` violet token triple, a left-border accent, or a tinted row background for Linked Events were explicitly rejected and must not be (re)introduced. All Reservation/Linked Event visuals reuse existing Packt tokens and the `Badge` `muted` variant verbatim.

UX-DR7: The FR-9 CTA row is a permanently-visible, compact `h-12` row (`rounded-[14px]`, `1px solid var(--line)`, `var(--surface)` background, `10px 12px` padding, `16px` bottom margin), positioned above the first day card, with no shadow and no dismiss control. Contents: a `28px`×`28px` `8px`-radius icon swatch (`var(--accent-soft)`/`var(--accent-ink)`) with a `Luggage` icon (`aria-hidden`), single-line primary-weight text (`flex: 1`, truncates), and a trailing `ChevronRight` (`aria-hidden`). The entire row is one `<button>` whose `aria-label` is the full copy plus a navigation hint (e.g. "Add reservations for hotels, rentals, and more — opens the Reservations tab") — all visual children are `aria-hidden`. Copy is "Add reservations for hotels, rentals, and more" when the trip has zero Reservations, switching to "Add another reservation" once ≥1 exists (same row/behavior, never disappears). Tapping the row is sequential: (1) navigate to the Reservations tab — an `aria-live="polite"` region announces the tab change once the transition settles; (2) the FR-1 type-picker `DropdownMenu` auto-opens with focus moved to its first item.

UX-DR8: The Reservations tab empty state (FR-6) uses the standard `Empty`/`EmptyHeader`/`EmptyMedia(variant="icon")`/`EmptyTitle`/`EmptyDescription`/`EmptyContent` composition, identical in structure to `trip-docs-tab.tsx`'s zero-documents state. `EmptyMedia` uses a relevant icon (e.g. `Luggage` or `Plane`, `strokeWidth={1.5}`, standard `size-8 rounded-lg bg-muted` swatch). Title: "No reservations yet". Description invites Flight/Lodging/Rental Car/etc. `EmptyContent` holds the "Add Reservation" button, which opens the same FR-1 type-picker `DropdownMenu` as the top-level entry point — no separate empty-state-specific add flow.

UX-DR9: The Cover Overflow Menu directly reuses `now-card.tsx`'s `MoreHorizontal`/`DropdownMenu` overflow pattern, applied to `trip-hero.tsx`'s cover. Trigger: `absolute top-2 right-2`, `MoreHorizontal` icon (`18px`, `strokeWidth={1.5}`), `bg-black/25 text-white backdrop-blur-sm` (hover `bg-black/45`), `6px` radius, `title="Cover options"`. Content: `DropdownMenuContent` (`side="bottom" align="end"`), `var(--bg)` background, `1px solid var(--line)` border, `xl` radius, `shadow-3`. Items, all conditional on current `CoverType` and re-evaluated on every open: "Edit Cover" (always, `Pencil` icon, opens existing `CoverImagePicker` dialog directly), "Remove Cover" (only when Photo/Map, `Trash2` icon, matching the "Remove day" destructive-icon convention, reverts to a random Graphic with no confirmation dialog — reversible via Edit Cover), "Info" (only when cover is an Unsplash photo, `Info` icon, opens the photographer-credit/attribution dialog). This is a new menu instance and does not modify the existing trip-list card overflow menu in `now-card.tsx`.

UX-DR10: Each click-to-edit field on a Reservation row (provider, anchor times, confirmation code, notes — up to 5 fields per row) is itself a `<button>` (or `role="button" tabindex="0"` with Enter/Space handlers), focusable in normal tab order with the standard `:focus-visible` ring, matching `doc-row.tsx`'s existing inline-rename pattern. After Escape-cancel or blur-save, focus returns to that same field's display element (never lost to `<body>`).

UX-DR11: All new interactive targets meet Packt's minimum sizing: the inline document-upload affordance is raised to at least `size-8` (`32px`); the FR-9 CTA row is `h-12`; the "Add Reservation" button is `h-10` (default size token). All new interactive elements (accordion headers, Reservation row inline-edit triggers, drawer fields, dropdown items, Linked Event rows, the FR-9 CTA row) inherit Packt's global `:focus-visible` ring with no custom focus treatment.

UX-DR12: Every icon introduced by this feature uses `strokeWidth={1.5}` consistently. Decorative icons that duplicate information already in text (Reservation Type icons in accordion headers/drawer headers/dropdown items, the `Wallet` confirmation-chip icon, date/time field icons in the drawer, the FR-9 row's `Luggage` icon and `ChevronRight`, and the Reservation Type icon on a Linked Event row) are marked `aria-hidden="true"`. The accordion header's accessible name is "{Type name}, {count} reservation{s}, {expanded|collapsed}" (count badge and `ChevronDown` are `aria-hidden`). The entire Linked Event row is one `<button>`/link with a single constructed `aria-label` (e.g. "Check-in: Tue, Jun 16 · 3:00 PM — Hotel Avenida Palace, Linked, opens Reservations") with all visual children `aria-hidden`, so "Linked" is announced exactly once.

### FR Coverage Map

FR1: Epic 1 - Add a Reservation (type picker, type-specific fields)
FR2: Epic 1 - View Reservations grouped by type (accordions)
FR3: Epic 1 - Edit a Reservation (click-to-edit)
FR4: Epic 1 - Delete a Reservation (with confirmation)
FR5: Epic 1 - Attach documents to a Reservation
FR6: Epic 1 - Empty state for new trips
FR7: Epic 2 - Linked Events on the Itinerary
FR8: Epic 2 - Reservations extend the Itinerary's date range
FR9: Epic 2 - Itinerary empty-state CTA
FR10: Epic 2 - Now Card surfaces Linked Events
FR11: Epic 2 - Editing from the Itinerary redirects to Reservations
FR12: Epic 3 - Cover Overflow Menu (Edit/Remove/Info)
FR13: Epic 3 - Cover controls removed from the edit sheet

## Epic List

### Epic 1: Record & Manage Reservations
Users can add, view (grouped by type into accordions), edit, delete, and attach documents to Reservations from a new Reservations tab — giving them a single source of truth for trip bookings (flights, lodging, rental cars, etc.), independent of any Itinerary changes. Includes the foundational `reservations` table, `ReservationType`/`Reservation` types, `dbReservationToType()`, and `documents.scope` extension — all needed by Epic 2 as well.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6

### Epic 2: Reservations Sync to the Itinerary
Users see their Reservations automatically reflected on the Itinerary and Now Card as Linked Events (Check-in/Check-out, Pickup/Return, etc.), with the trip's date range extending automatically to cover bookings outside it, and a permanent CTA guiding users from the Itinerary to Reservations. Builds on Epic 1's Reservation entity and CRUD — cannot function without it. Introduces `src/lib/linked-events.ts`, the query-layer merge, and the FR-9/FR-11 search-param orchestration.
**FRs covered:** FR7, FR8, FR9, FR10, FR11

### Epic 3: Cover Overflow Menu
Users can manage their trip's cover image (edit, remove, view photo attribution) via a new "⋯" overflow menu on the cover, with cover controls removed from the edit sheet. Fully independent of Epics 1 & 2 — can be built/shipped in any order relative to them.
**FRs covered:** FR12, FR13

## Epic 1: Record & Manage Reservations

Users can add, view (grouped by type into accordions), edit, delete, and attach documents to Reservations from a new Reservations tab — giving them a single source of truth for trip bookings, independent of any Itinerary changes.

### Story 1.1: Add a Reservation

As a trip planner,
I want to add a Reservation (flight, lodging, rental car, or anything else I've booked) to my trip,
So that I have a single place to record my bookings without re-creating them as itinerary events.

**Acceptance Criteria:**

**Given** I'm on the Reservations tab
**When** I tap "Add Reservation"
**Then** a `DropdownMenu` opens listing all 8 Reservation Types (Flight, Train, Bus, Ferry, Rental Car, Lodging, Cruise, Other) with their UX-DR1 icon mapping (`Plane`/`Train`/`Bus`/`Ship`/`Car`/`Hotel`/`Anchor`/`Package`, `strokeWidth={1.5}`)

**Given** the type picker is open
**When** I select a type (e.g. Lodging)
**Then** the Add Reservation drawer opens directly into that type's fields per UX-DR4 — title "Add Lodging Reservation", subtitle "Type: Lodging (cannot be changed after saving)", anchor fields labeled "Check-in"/"Check-out", plus Provider*, Confirmation code (Optional), Notes (Optional), and an empty Documents section

**Given** I select "Other"
**When** the Add Reservation drawer opens
**Then** it shows title "Add Other Reservation", subtitle "Type: Other (cannot be changed after saving)", and generic anchor field labels "Start"/"End" (rather than a type-specific pair)

**Given** I selected Lodging, Rental Car, or Cruise
**When** I tap Save without filling in the second anchor (`endTime`)
**Then** Save is blocked, the `endTime` field shows its required/`aria-invalid` state, and focus moves to it

**Given** I selected Flight, Train, Bus, Ferry, or Other
**When** I tap Save without filling in `endTime`
**Then** the Reservation is saved successfully with only `startTime` set

**Given** all required fields are filled in
**When** I tap Save
**Then** `createReservation` (in `src/app/(app)/trips/[tripId]/reservations/actions.ts`) runs `requireUser()` → `assertTripAccess(tripId, "editor")` → inserts the `reservations` row → `revalidatePath(/trips/${tripId})`, the drawer closes, and the new Reservation appears as a row in its type's accordion section on the Reservations tab

**Given** a Reservation has been saved
**When** I view it afterward
**Then** its `type` is shown via the accordion's icon/title only and is not editable anywhere on the row or in the drawer

**And** `reservations` table added to `src/db/schema.ts` (modeled on `events`, FK to `trips` with cascade delete, no `position` field); `ReservationType` (kebab-case const-object + union: `flight | train | bus | ferry | rental-car | lodging | cruise | other`) and `Reservation` added to `src/data/types.ts`; `dbReservationToType()` added to `src/lib/db-mappers.ts`

**And** `TripDetailTab` gains `Reservations: "res"`, `resolveTripDetailTab()` recognizes it, and `TripDetailTabBody` renders a new `ReservationsTab` component (with minimal accordion rendering sufficient to display newly-added Reservations) when `activeTab === "res"`

**And** a **Reservation Object Mother** is added to `tests/e2e/e2e-seed-data.ts`/`tests/e2e/scenario-fixture.ts` — a default Reservation fixture (overridable `type`/`startAt`/`endAt`/`provider`/`confirmationCode`/`notes`) that materializes a fresh `reservations` row scoped to a scenario-owned trip; Stories 1.2–1.5 and Epic 2 scenarios reuse this mother rather than inventing ad hoc fixtures

**And** unit/component tests: `dbReservationToType()` mapper test, `createReservation` action test (covering type-dependent `endAt` validation for all 8 types, including "Other"), `reservation-type-picker.test.tsx`, `reservation-edit-drawer.test.tsx` (Add mode, including "Other"'s generic Start/End labels)

**And** E2E: `tests/e2e/features/reservations.feature` gains a scenario for adding a Lodging Reservation (via the new Object Mother for trip setup) and verifying it appears in the Lodging accordion section

### Story 1.2: View Reservations Grouped by Type, with Empty State

As a trip planner,
I want to see all my Reservations organized by type, with quick previews, and a helpful empty state when I haven't added any yet,
So that I can quickly scan "what hotels do I have" or "what's my rental car situation" without hunting through a flat list.

**Acceptance Criteria:**

**Given** the trip has zero Reservations
**When** I open the Reservations tab
**Then** I see the FR-6 `Empty` composition (`EmptyHeader`/`EmptyMedia(icon)`/`EmptyTitle` "No reservations yet"/`EmptyDescription` inviting Flight, Lodging, Rental Car, etc./`EmptyContent` with an "Add Reservation" button opening the FR-1 type picker), and no per-type accordion sections render

**Given** the trip has ≥1 Reservation of a given type
**When** I view the Reservations tab
**Then** that type gets its own accordion section per UX-DR2 (`rounded-[14px]`, `var(--line)` border, `var(--surface)` header); types with zero Reservations show no section

**Given** an accordion section is collapsed
**When** rendered
**Then** the header shows the type icon + name, an `aria-hidden` count badge, and a "Next: **{provider}** · {weekday}, {month} {day} · {time}" preview (in `var(--fg-2)`) of that type's next-upcoming Reservation

**Given** I tap an accordion header
**When** it expands (chevron rotates 180°, border appears between header and body)
**Then** every Reservation of that type renders as a row, ordered by `startTime` ascending

**Given** Reservations exist across multiple types
**When** the Reservations tab renders
**Then** populated accordion sections are ordered by each type's next-upcoming Reservation's `startTime` (soonest first), and re-sort live as Reservations are added, edited, or deleted

**Given** any accordion header
**When** inspected by assistive tech
**Then** its accessible name is "{Type name}, {count} reservation{s}, {expanded|collapsed}", with the count badge and `ChevronDown` marked `aria-hidden="true"`

**And** tests use the **Reservation Object Mother** from Story 1.1 with overrides (varying `type`/`startAt`) to materialize multiple Reservations across types for empty/populated/sorting scenarios

**And** unit/component tests: `reservations-tab.test.tsx` (empty state + populated accordion list), `reservation-type-section.test.tsx` (collapse/expand, preview text, chronological ordering within a section, cross-type section ordering, accessible name)

**And** E2E: `tests/e2e/features/reservations.feature` gains scenarios for (1) the zero-Reservations empty state and (2) a grouped, soonest-first accordion view across multiple types (via Object Mother overrides)

### Story 1.3: Edit a Reservation

As a trip planner,
I want to edit any field of an existing Reservation (except its type),
So that I can keep my booking details accurate as my plans change.

**Acceptance Criteria:**

**Given** an expanded accordion section
**When** I click an editable field on a Reservation row (provider, an anchor date/time, confirmation code, or notes)
**Then** it becomes an inline input with a teal underline (`doc-row.tsx`'s inline-rename pattern)

**Given** an inline input is open
**When** I press Enter or blur the field
**Then** `updateReservation` (`requireUser()` → `assertTripAccess(tripId, "editor")` → update → `revalidatePath`) persists the new value and the row displays it

**Given** an inline input is open
**When** I press Escape
**Then** the edit is discarded, the field reverts to its prior value, and focus returns to that field's display element (never lost to `<body>`) per UX-DR10

**Given** any of the up to 5 editable fields on a Reservation row
**When** not in edit mode
**Then** each is itself a `<button>` (or `role="button" tabindex="0"` with Enter/Space handlers), focusable in normal tab order with the standard `:focus-visible` ring

**Given** any Reservation, including "Other"-type ones
**When** I view its row
**Then** `type` remains displayed via the accordion's icon/title only and is never editable; for "Other", the generic "Start"/"End" anchor labels remain as labels (only the date/time values are editable)

**And** tests use the **Reservation Object Mother** from Story 1.1 with overrides to create an existing Reservation to edit

**And** unit/component tests: `reservation-row.test.tsx` (click-to-edit per field — provider, anchors, confirmation code, notes — covering Enter/blur-save, Escape-cancel, and focus-return), `updateReservation` action test

**And** E2E: `tests/e2e/features/reservations.feature` gains a scenario editing a Reservation's provider and an anchor time inline and verifying the persisted values after reload

### Story 1.4: Delete a Reservation

As a trip planner,
I want to delete a Reservation, with a confirmation step,
So that I can remove bookings that were canceled or entered by mistake without accidentally losing data.

**Acceptance Criteria:**

**Given** an expanded accordion section
**When** I tap the delete affordance on a Reservation row
**Then** the existing delete-confirmation pattern (`delete-*-alert-dialog.tsx` family) opens, asking me to confirm

**Given** the delete confirmation dialog is open
**When** I confirm
**Then** `deleteReservation` (`requireUser()` → `assertTripAccess(tripId, "editor")` → delete → `revalidatePath`) removes the `reservations` row and the row disappears from its accordion section

**Given** the delete confirmation dialog is open
**When** I cancel instead
**Then** nothing is deleted and the dialog closes, leaving the row in place

**Given** the deleted Reservation was the last one of its type
**When** the Reservations tab re-renders
**Then** that type's accordion section disappears entirely

**Given** the deleted Reservation was the trip's last Reservation overall
**When** the Reservations tab re-renders
**Then** the FR-6 empty state (Story 1.2) is shown again

**And** `deleteReservation` is added to `src/app/(app)/trips/[tripId]/reservations/actions.ts`

**And** tests use the **Reservation Object Mother** from Story 1.1 (including overrides to create the "last of its type" and "last overall" scenarios)

**And** unit/component tests: `reservation-row.test.tsx` (delete affordance opens confirmation dialog, cancel vs. confirm), `deleteReservation` action test, `reservation-type-section.test.tsx` (section removal when its last Reservation is deleted), `reservations-tab.test.tsx` (empty state reappears when the last Reservation overall is deleted)

**And** E2E: `tests/e2e/features/reservations.feature` gains a scenario deleting a Reservation via the confirmation dialog and verifying it's gone, including the section-disappears/empty-state-reappears cases

### Story 1.5: Attach Documents to a Reservation

As a trip planner,
I want to attach documents (e.g. a boarding pass PDF, hotel confirmation) directly to a Reservation,
So that all the relevant paperwork for a booking lives in one place.

**Acceptance Criteria:**

**Given** the `documents` table
**When** this story is implemented
**Then** it gains a nullable `reservation_id` FK column (`onDelete: "cascade"`) alongside existing `tripId`/`eventId`; `Document["scope"]` becomes `"trip" | "event" | "reservation"`; and `dbDocToType()`'s orphan check is extended to all three FKs (exactly one must be set, scope derived from which)

**Given** an expanded Reservation row with no attached documents
**When** rendered
**Then** it shows a dashed "Add confirmation document" row with an `Upload` icon, matching the Documents-tab empty affordance (UX-DR3)

**Given** an expanded Reservation row (with or without existing documents)
**When** I use the upload affordance (`size-8` icon button, `title="Add document"`, or the dashed row when empty) to select a file
**Then** it uploads via the existing `put()` document-upload logic with `scope: "reservation"` and `reservationId` set (respecting the `UPLOAD_STUB` guard in E2E), and appears as an inline document row (`DocKindBadge` + truncated filename + `size-8` upload affordance) below the confirmation chip

**Given** the Add/Edit Reservation drawer's Documents section
**When** the Reservation has attached documents
**Then** the same inline document rows render there; when empty, it shows the Documents-tab-style empty composition (`FileText` icon, "No documents yet", "Attach a hotel confirmation, receipt, or other reservation document.", "Add document" button at `outline`/`sm`)

**Given** a Reservation with attached Documents
**When** it is deleted (via Story 1.4's `deleteReservation`)
**Then** `deleteReservation` calls `del()` on each attached Document's Blob URL *before* the `reservations` row (and its cascade-deleted `documents` rows) are removed

**And** reservation-document attach/detach actions are added to `src/app/(app)/trips/[tripId]/reservations/actions.ts`, reusing the existing upload/delete document logic from `actions.ts` parameterized for `scope: "reservation"`

**And** tests extend the **Reservation Object Mother** from Story 1.1 with an option to materialize attached Documents (`scope: "reservation"`) for a Reservation

**And** unit/component tests: `db-mappers.test.ts` (extended `dbDocToType()` orphan/scope tests for `reservation_id`), `reservation-row.test.tsx` (document rows + no-documents dashed affordance), `reservation-edit-drawer.test.tsx` (Documents section populated/empty), `reservations/actions.test.ts` (attach/detach, cascade delete including Blob `del()`-before-cascade)

**And** E2E: `tests/e2e/features/reservations.feature` gains scenarios for (1) attaching a document to a Reservation and seeing it appear inline, and (2) deleting a Reservation with an attached document and verifying both are gone

## Epic 2: Reservations Sync to the Itinerary

Users see their Reservations automatically reflected on the Itinerary and Now Card as Linked Events, with the trip's date range extending automatically to cover bookings outside it, and a permanent CTA guiding users from the Itinerary to Reservations.

### Story 2.1: Linked Events Appear on the Itinerary

As a trip planner,
I want my Reservations to automatically appear as events on the Itinerary,
So that I don't have to manually re-create check-in/check-out, pickup/return, or departure/arrival events for things I've already booked.

**Acceptance Criteria:**

**Given** a Reservation with only `startTime` set (Flight, Train, Bus, Ferry, or Other with no `endTime`)
**When** `deriveLinkedEvents()` runs
**Then** it produces exactly one synthetic `TripEvent` labeled per the Glossary (e.g. "Departure" for Flight/Train/Bus/Ferry, "Start" for Other), with `linkedReservationId` set to the Reservation's id and `reservationType` set to its type

**Given** a Reservation with both `startTime` and `endTime` set (Lodging, Rental Car, Cruise, or any optional-`endTime` type that has one)
**When** `deriveLinkedEvents()` runs
**Then** it produces exactly two synthetic `TripEvent`s, one per anchor (e.g. Check-in/Check-out for Lodging, Pickup/Return for Rental Car, Departure/Return for Cruise, Start/End for Other), each on its corresponding day

**Given** `src/lib/linked-events.ts`
**When** implemented
**Then** it exports exactly one function, `deriveLinkedEvents(reservations: Reservation[]): TripEvent[]`, with no alternate or additional exported names

**Given** `TripEvent` in `src/data/types.ts`
**When** extended for this feature
**Then** it gains exactly two new optional fields, `linkedReservationId?: string` and `reservationType?: ReservationType`, with no other marker fields added

**Given** `src/lib/queries.ts` builds a trip's `DayItinerary[]`
**When** it runs
**Then** it merges `deriveLinkedEvents()` output into each `DayItinerary.events` array, interleaved with real events and sorted by `startAt`, without writing any new `events` rows to the database

**Given** a Day's itinerary contains a Linked Event
**When** `day-card-body.tsx` renders it
**Then** the row uses the same padding/border/time-column layout as a manual event row, but the Reservation Type's icon (per UX-DR1) replaces the default `MapPin` icon (`aria-hidden="true"`), and a "Linked" `Badge` `muted`/`secondary` pill (text `aria-hidden="true"`) appears inline after the event name

**Given** a Linked Event row
**When** inspected by assistive tech
**Then** the entire row is one `<button>`/link with a single constructed `aria-label` (e.g. "Check-in: Tue, Jun 16 · 3:00 PM — Hotel Avenida Palace, Linked, opens Reservations"), with all visual children (icon, "Linked" badge text, chevron) marked `aria-hidden="true"`, so "Linked" is announced exactly once

**Given** a Linked Event is the chronologically current event for "happening now" purposes
**When** rendered
**Then** it uses the standard `var(--accent-soft)`/"Now" pill treatment identical to a manual event's "happening now" state — no left border, no row background tint, and no new color token (per UX-DR6, `--linked-brand`/`--linked-soft`/`--linked-ink` remain rejected)

**Given** `day-card-body.tsx`
**When** implemented for this story
**Then** it accepts an `onLinkedEventTap(linkedReservationId: string)` callback prop, invoked when a Linked Event row is tapped; this story wires it as a placeholder/no-op (real navigation to the Reservations tab is implemented in Story 2.4)

**And** tests reuse the **Reservation Object Mother** from Story 1.1, with overrides spanning all 8 Reservation Types and both single-anchor and dual-anchor combinations

**And** unit tests: `linked-events.test.ts` (one TripEvent per single-anchor type, two TripEvents per dual-anchor type, correct Glossary labels including Other's Start/End, correct `linkedReservationId`/`reservationType` on each), `day-card-body.test.tsx` (Linked Event icon/badge rendering, constructed `aria-label`, "happening now" + Linked co-occurrence using standard Now treatment, `onLinkedEventTap` invocation)

**And** E2E: new file `tests/e2e/features/linked-events.feature` with a scenario that materializes a Lodging Reservation (Check-in/Check-out) via the Object Mother and verifies both Linked Events appear on their respective Itinerary days with the "Linked" badge and Hotel icon

### Story 2.2: Reservations Extend the Itinerary's Date Range

As a trip planner,
I want my Itinerary's date range to automatically extend when I add a Reservation outside it,
So that I don't have to manually add Days before booking a flight that lands before my trip currently starts (or ends after it currently ends).

**Acceptance Criteria:**

**Given** a trip's current date range is `startDate`–`endDate`
**When** I save a Reservation (via `createReservation` or `updateReservation`) whose `startTime` or `endTime` falls on a date before `startDate` or after `endDate`
**Then** the trip's `startDate` and/or `endDate` is extended to include that date, and a new `days` row is added for each newly-included date

**Given** a Reservation's date falls before the trip's current `startDate`
**When** the new Day(s) are inserted at the front of the Itinerary
**Then** existing Days' `dayNumber` values shift to remain sequential (e.g. a Reservation 2 days before the current Day 1 becomes Day 1, current Day 1 becomes Day 3)

**Given** a Reservation's date falls after the trip's current `endDate`
**When** the new Day(s) are appended to the Itinerary
**Then** they receive the next sequential `dayNumber`(s), and existing Days are unaffected

**Given** the days-extension and the Reservation insert/update
**When** either part fails
**Then** both are rolled back together — the extension and the Reservation write happen inside a single `db.transaction()`, per the architecture's single-transaction rule

**Given** a Reservation's `startTime`/`endTime` falls within the trip's existing date range
**When** the Reservation is saved
**Then** no `days` rows are added and `trip.startDate`/`endDate` are unchanged

**Given** a newly-added Day created by this story
**When** the Itinerary renders it
**Then** it displays the triggering Reservation's Linked Event(s) (per Story 2.1's `deriveLinkedEvents()`/query merge) exactly like any other Day — no special-casing for "extension" Days

**And** this is the only feature area that writes to the `days` table; existing `addDay`/`removeLastDay` actions in `src/app/(app)/trips/[tripId]/actions.ts` remain unchanged

**And** tests reuse the **Reservation Object Mother** from Story 1.1, with overrides for dates before/after/within the trip's current range, and for multi-day extensions (Reservation date 2+ days outside range)

**And** unit tests: `reservations/actions.test.ts` extended — `createReservation`/`updateReservation` cases for extend-before (with `dayNumber` reshuffle), extend-after (append), no-extension (in-range), and transactional rollback on simulated failure

**And** E2E: `tests/e2e/features/linked-events.feature` gains a scenario creating a Reservation dated before the trip's current `startDate` (via Object Mother) and verifying a new Day 1 appears on the Itinerary with the Reservation's Linked Event, and prior Days shift their numbering

### Story 2.3: Now Card Surfaces Linked Events

As a trip planner,
I want my Now Card to show check-ins, pickups, departures, and other booked events when they're happening or coming up next,
So that I don't miss a flight or check-in just because I created it as a Reservation instead of a manual itinerary event.

**Acceptance Criteria:**

**Given** the Now Card's "current/next-upcoming event" logic in `src/lib/queries.ts`
**When** building `todayEvents` for the Now Card
**Then** it includes Linked Events derived via `deriveLinkedEvents()` (Story 2.1), merged with manual events and sorted by `startAt`, exactly like the Itinerary's `DayItinerary.events` merge

**Given** a Linked Event is the chronologically current event (its time window contains "now")
**When** the Now Card renders
**Then** it displays the Linked Event exactly as it would a manually-created "happening now" event — same layout, same `var(--accent-soft)`/"Now" pill treatment — plus the Reservation Type icon (replacing `MapPin`, `aria-hidden`) and "Linked" `Badge` `muted` pill (per UX-DR5)

**Given** a Linked Event is the chronologically next-upcoming event (no event is currently "happening now")
**When** the Now Card renders
**Then** it displays the Linked Event exactly as it would a manually-created "next up" event, with the same icon/badge treatment as above

**Given** the Now Card displays a Linked Event
**When** inspected by assistive tech
**Then** it uses the same single-`aria-label`-button construction as the Itinerary's Linked Event row (Story 2.1), so "Linked" is announced exactly once

**Given** `now-card.tsx`
**When** it determines which event is "current" vs "next-upcoming"
**Then** the existing `isEventPast`/`isEventNow` helpers in `src/lib/utils.ts` operate on Linked Events the same as manual events, with no Linked-specific time logic added

**And** tests reuse the **Reservation Object Mother** from Story 1.1, with overrides producing a Reservation whose Linked Event falls in the "happening now" window and another whose Linked Event is "next up"

**And** unit/component tests: `now-card.test.tsx` extended — Linked Event shown when "happening now", Linked Event shown when "next up", icon/badge/aria-label rendering matches Story 2.1's Itinerary row treatment, manual event still preferred when it's chronologically current and a Linked Event is only "next up"

**And** E2E: `tests/e2e/features/linked-events.feature` gains a scenario where a Reservation's Linked Event falls within the seeded "now" window (via Object Mother override) and verifies it appears on the Now Card with the "Now" pill and "Linked" badge

### Story 2.4: Itinerary CTA and Tap-to-Edit Redirect

As a trip planner,
I want a prompt on my Itinerary to add reservations, and to be taken straight to the right Reservation when I tap a Linked Event,
So that I can move fluidly between "what's planned" and "what's booked" without hunting for the right tab or row.

**Acceptance Criteria:**

**Given** a trip with zero Reservations
**When** I view the Itinerary
**Then** the FR-9 CTA row (per UX-DR7: `h-12`, `rounded-[14px]`, `Luggage` icon swatch, single `<button>` with constructed `aria-label`) appears above the first day card, with copy "Add reservations for hotels, rentals, and more"

**Given** a trip with ≥1 Reservation
**When** I view the Itinerary
**Then** the same CTA row still appears, with copy changed to "Add another reservation"

**Given** the CTA row
**When** I tap it
**Then** the app navigates to `?tab=res&action=add-reservation`, an `aria-live="polite"` region announces the tab change once the transition settles, and the FR-1 type-picker `DropdownMenu` auto-opens with focus moved to its first item

**Given** the `ReservationsTab` component
**When** it mounts with `?action=add-reservation` in the URL
**Then** it opens the FR-1 type picker automatically, then calls `router.replace()` to strip the `action` param

**Given** a Linked Event row on the Itinerary or Now Card (rendered with `onLinkedEventTap` from Story 2.1/2.3)
**When** I tap it
**Then** the app navigates to `?tab=res&highlight={reservationId}`, replacing Story 2.1/2.3's placeholder `onLinkedEventTap` with this real navigation

**Given** the `ReservationsTab` component
**When** it mounts with `?highlight={reservationId}` in the URL
**Then** it scrolls to and expands the accordion section containing that Reservation, visually highlights its row, then calls `router.replace()` to strip the `highlight` param

**Given** either `action=add-reservation` or `highlight={reservationId}` has been processed
**When** the param is stripped via `router.replace()`
**Then** the URL no longer contains the param, so re-navigating to the tab (e.g. via browser back/forward) does not re-trigger the auto-open/highlight behavior

**And** tests reuse the **Reservation Object Mother** from Story 1.1 for the "≥1 Reservation" CTA-copy case and for the highlight-target Reservation

**And** unit/component tests: `itinerary-cta.test.tsx` (zero vs. ≥1 Reservation copy, `aria-label`, click navigation target), `reservations-tab.test.tsx` extended (mount with `action=add-reservation` opens type picker + strips param, mount with `highlight={id}` expands/scrolls/highlights + strips param), `day-card-body.test.tsx`/`now-card.test.tsx` extended (`onLinkedEventTap` now navigates to `?tab=res&highlight={id}`)

**And** E2E: `tests/e2e/features/linked-events.feature` gains scenarios for (1) tapping the empty-state CTA and landing on Reservations with the type picker open, and (2) tapping a Linked Event on the Itinerary and landing on Reservations with the correct accordion section expanded and the Reservation highlighted

## Epic 3: Cover Overflow Menu

Users can manage their trip's cover image (edit, remove, view photo attribution) via a new "⋯" overflow menu on the cover, with cover controls removed from the edit sheet.

### Story 3.1: Cover Overflow Menu (Edit/Remove/Info)

As a trip planner,
I want a "⋯" menu on my trip's cover image with quick actions to edit, remove, or see photo credit,
So that I can manage my cover image without opening the full trip edit sheet.

**Acceptance Criteria:**

**Given** `trips.coverPhotographer` and `trips.coverPhotographerUrl` (nullable text columns)
**When** added to `src/db/schema.ts`
**Then** `Trip` in `src/data/types.ts` gains optional `coverPhotographer?: string` and `coverPhotographerUrl?: string` fields, and the relevant db-mapper includes them

**Given** `CoverImageSearchResult` and the Unsplash response mapping in `cover-image-search-actions.ts`
**When** extended for this story
**Then** each result includes a `photographerUrl` field sourced from Unsplash's `user.links.html` (and the E2E stub builder produces a stub profile URL per result)

**Given** the cover-image search tab's `onImageSelected`
**When** a user selects an Unsplash search result as their cover
**Then** `coverImageUrl`, `coverPhotographer`, and `coverPhotographerUrl` are all persisted together on the trip; selecting a Map, Graphic, custom upload, or URL-based Photo cover instead persists `coverImageUrl` with `coverPhotographer`/`coverPhotographerUrl` set to `null`

**Given** `trip-hero.tsx`
**When** rendered
**Then** it shows a "⋯" overflow trigger per UX-DR9 (`absolute top-2 right-2`, `MoreHorizontal` `18px`/`strokeWidth={1.5}`, `bg-black/25 text-white backdrop-blur-sm` hover `bg-black/45`, `6px` radius, `title="Cover options"`), opening a `DropdownMenuContent` (`side="bottom" align="end"`, `var(--bg)`/`var(--line)` border/`xl` radius/`shadow-3`) — a new menu instance, not a modification of `now-card.tsx`'s existing trip-list overflow menu

**Given** the Cover Overflow Menu is open, for any `CoverType`
**When** rendered
**Then** "Edit Cover" (`Pencil` icon) is always present and, when selected, opens the existing `CoverImagePicker` dialog directly

**Given** the trip's current `CoverType` is Photo or Map
**When** the Cover Overflow Menu is open
**Then** "Remove Cover" (`Trash2` icon, destructive-icon styling matching the "Remove day" convention) is shown; selecting it sets the cover to a random Graphic (via the existing `deriveGraphicCover` helper) with no confirmation dialog, and clears `coverPhotographer`/`coverPhotographerUrl`

**Given** the trip's current `CoverType` is Graphic
**When** the Cover Overflow Menu is open
**Then** "Remove Cover" is not shown (Edit Cover remains available to choose a new Photo/Map, which is how a Graphic cover is reversed)

**Given** the trip's current cover is an Unsplash photo (`CoverType === "photo"` AND `coverPhotographer` is set)
**When** the Cover Overflow Menu is open
**Then** "Info" (`Info` icon) is shown; selecting it opens a dialog displaying the photographer's name and a link to their Unsplash profile (`coverPhotographerUrl`)

**Given** the trip's current cover is a Map, Graphic, custom upload, or URL-based Photo (no `coverPhotographer`)
**When** the Cover Overflow Menu is open
**Then** "Info" is not shown

**Given** any action in the Cover Overflow Menu changes `CoverType` (or attribution fields)
**When** the page re-renders after the change
**Then** the menu's available items (Remove Cover, Info) immediately reflect the new state on next open — no stale conditional items

**And** a new server action (e.g. `removeTripCover`) is added to `src/app/(app)/trips/actions.ts` following `requireUser()` → `assertTripAccess(tripId, "editor")` → update → `revalidatePath(/trips/${tripId})`, setting a random Graphic cover and clearing attribution fields

**And** unit/component tests: `trip-hero.test.tsx` (overflow trigger renders, conditional Edit/Remove/Info items per `CoverType`/`coverPhotographer` combination, Edit opens `CoverImagePicker`, Remove calls the new action, Info opens the attribution dialog with correct name/link), `actions.test.ts` extended (`removeTripCover` sets Graphic cover + clears attribution), `cover-image-search-actions.test.ts` extended (`photographerUrl` mapping, E2E stub), db-mapper test extended for the new `Trip` fields

**And** E2E: new file `tests/e2e/features/trip-cover-overflow.feature` with scenarios for (1) selecting an Unsplash photo cover then viewing its Info dialog, and (2) removing a Photo cover and verifying it becomes a Graphic with "Remove Cover"/"Info" no longer shown

### Story 3.2: Remove Cover Controls from the Trip Edit Sheet

As a trip planner,
I want the trip edit sheet to focus on trip details rather than duplicate cover management,
So that the edit sheet stays simple and cover editing happens in one place — the Cover Overflow Menu.

**Acceptance Criteria:**

**Given** `trip-edit-sheet.tsx`
**When** this story is implemented
**Then** it no longer renders the "Cover image" `Section` (preview, "Edit cover image"/"Remove image" buttons, embedded `CoverImagePicker`) — `coverImageUrl`-related props/state used only for that section are removed from `TripEditSheet`'s props/state

**Given** `trip-edit-cover.tsx` and `trip-edit-cover.test.tsx`
**When** this story is implemented
**Then** both files are deleted, as `TripEditCover` becomes unused (the Cover Overflow Menu from Story 3.1 invokes `CoverImagePicker` directly)

**Given** the trip edit sheet's remaining fields (name, dates, destination, budget, collaborators, Delete Trip)
**When** the edit sheet is opened after this story
**Then** all of them continue to render and function exactly as before — no other field's layout, validation, or behavior changes

**Given** a trip whose cover was previously editable only via the edit sheet
**When** a user wants to change it after this story
**Then** the Cover Overflow Menu (Story 3.1) is the only entry point, and it remains fully functional (Edit/Remove/Info) independent of the edit sheet

**And** any test in `trip-edit-sheet.test.tsx` that exercised the removed cover section (rendering the section, triggering `CoverImagePicker`, "Remove image") is deleted; remaining tests for name/dates/destination/budget/collaborators/Delete Trip are unaffected and continue to pass

**And** a search for other references to `TripEditCover`/`trip-edit-cover` across `src/` confirms no remaining imports after deletion

**And** E2E: `tests/e2e/features/trip-cover-overflow.feature` (from Story 3.1) gains a scenario opening the trip edit sheet and verifying no cover image controls are present, alongside the existing overflow-menu scenarios

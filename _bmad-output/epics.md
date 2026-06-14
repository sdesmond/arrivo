---
stepsCompleted: [1, 2]
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

---
title: Reservations & Trip Logistics — Experience
status: draft
created: 2026-06-13
updated: 2026-06-13
sources:
  - file:_bmad-output/prds/prd-packt-2026-06-12/prd.md
name: Packt
status_design_pairing: DESIGN.md
---

# Reservations & Trip Logistics — Experience Spine

> Addition to Packt's existing trip-detail experience. Pairs with `DESIGN.md` (this run's Reservations delta) and Packt's overall visual identity in `src/app/globals.css`. Covers FR-1 through FR-13 (PRD `_bmad-output/prds/prd-packt-2026-06-12/prd.md`).

## Foundation

Same responsive trip-detail tab shell as Itinerary / Map / Documents / Packing / Notes: bottom tab bar on mobile, top tabs on desktop. Reservations becomes a new top-level tab in `TripDetailTab` — no new navigation pattern, no new shell. UI system is shadcn/Base UI (Drawer, DropdownMenu, Badge, Button, Empty, Dialog), per `{DESIGN.md}` and Packt's existing conventions. Single-tenant per trip; the Reservations tab is scoped to the currently-viewed trip, same as every other tab.

## Information Architecture

| Surface | Reached from | Purpose |
| --- | --- | --- |
| Reservations tab | Trip tab bar (new tab, alongside Itinerary/Map/Documents/Packing/Notes) | List all of a trip's Reservations, grouped by type into accordions; entry point for add/edit/delete |
| Add/Edit Reservation drawer | "Add Reservation" button (Reservations tab or FR-9 banner) → type picker → drawer; or tap a Reservation row's edit affordance | Create or edit a single Reservation's fields, anchors, and documents |
| Itinerary tab (Linked Event rows) | Existing Itinerary tab, day cards | Read-only surfacing of Reservation-derived Check-in/Check-out, Pickup/Return, Departure/Arrival events; tapping redirects to Reservations |
| FR-9 empty-state CTA banner | Top of Itinerary tab, shown when trip has 0 Reservations (or fewer than desired) | Prompts adding Reservations; deep-links to Reservations tab with type picker pre-opened |
| Now Card (existing) | Trip list / trip detail | Surfaces the current/next event, including Linked Events, exactly as it does manual events today |
| Cover Overflow Menu | "⋯" trigger, upper-right of trip Cover (`trip-hero.tsx`) | Edit Cover / Remove Cover / Info — cover-image management moved out of the edit sheet |

→ Composition reference: `.working/key-reservations-tab.html`, `.working/key-add-reservation-drawer.html`, `.working/key-itinerary-linked-event.html`, `.working/key-cover-overflow-menu.html`, `.working/key-itinerary-empty-cta-banner.html`. Spine wins on conflict. *(Note: these links point at `.working/` — update to `mockups/` if/when promoted at Finalize.)*

## Voice and Tone

Microcopy. Brand voice and aesthetic posture live in `{DESIGN.md}`.

| Do | Don't |
| --- | --- |
| "No reservations yet" / "Add reservations for hotels, rentals, and more" | "You haven't added any bookings! Let's fix that 🎉" |
| "Add Reservation" (button label, both the top-level entry point and the FR-9 banner CTA) | "New Booking", "Create Reservation", "+ Add" |
| Type-specific drawer titles: "Add Lodging Reservation", "Edit Flight Reservation", etc. | Generic "Add Reservation" as a drawer title once a type is chosen |
| Anchor labels per Glossary — "Check-in" / "Check-out" (Lodging), "Pickup" / "Return" (Rental Car), "Departure" / "Return" (Cruise), "Departure" / "Arrival" (Flight, Train, Bus, Ferry) | Generic "Start" / "End" labels regardless of type |
| Full date + time per anchor: "Check-in: Tue, Jun 16 · 3:00 PM" | Date-only or time-only anchor displays |
| Drawer subtitle: "Type: {Type} (cannot be changed after saving)" | Hiding the type, or implying it could be changed |
| FR-9 banner (0 reservations): "Track your bookings here" / "Add reservations for hotels, rentals, and more" | FR-9 banner (≥1 reservation): same shell, copy shifts to inviting *more* reservations — still links to Reservations tab |
| "No documents yet" / "Attach a hotel confirmation, receipt, or other reservation document." (drawer Documents empty state, matches Documents-tab tone) | Different empty-state copy for Reservation-scoped documents vs. trip-scoped documents |
| "Linked" (badge text, neutral) | "Auto", "Synced", "From Reservation" or other badge copy |

## Component Patterns

Behavioral. Visual specs live in `{DESIGN.md.Components}`.

| Component | Use | Behavioral rules |
| --- | --- | --- |
| Add Reservation type-picker `DropdownMenu` | Reservations tab (top-level button), FR-9 banner CTA | Tapping "Add Reservation" opens a `DropdownMenu` listing all 7 Reservation Types with icons (`{DESIGN.md.Components.add-reservation-button}` mapping). Selecting a type closes the dropdown and opens the Add Reservation `Drawer` pre-configured for that type — no separate in-drawer type switcher. From the FR-9 banner, this whole sequence (navigate to Reservations tab + open dropdown) happens on a single tap. |
| Reservation Type accordion section | Reservations tab | Each populated type renders one accordion (`{DESIGN.md.Components.reservation-accordion}`). Click header to toggle expand/collapse — same `onToggle`/chevron-rotate behavior as `DayCardHeader`. Collapsed state shows a one-line preview of the next-upcoming Reservation (provider + start time). Expanded state lists every Reservation of that type, ordered by `startTime` ascending `[ASSUMPTION, per PRD §9]`. Types with zero Reservations render no section — the set of visible sections changes live as Reservations are added/removed/edited across the date boundary. |
| Reservation row | Expanded accordion section | Displays provider, one or two anchor lines (label per type), confirmation code chip (if present), and attached documents inline. Each field (provider, anchors, confirmation code, notes) is independently click-to-edit — click text → inline input with teal underline, blur or Enter saves, Escape cancels (matches `doc-row.tsx`'s rename pattern). `type` is shown via the accordion icon/title only, never editable on the row. A delete affordance opens the existing delete-confirmation pattern (`delete-*-alert-dialog.tsx` family) before removing the row. |
| Add/Edit Reservation `Drawer` | Triggered from the type-picker (Add) or a Reservation row's edit affordance (Edit) | `Drawer`/`DrawerContent`/`DrawerHeader`/`DrawerFooter`, same container as `trip-edit-sheet.tsx`. Add: opens directly to the selected type's fields, no type re-selection. Edit: same fields, type shown read-only in the subtitle. `endTime` is a hard-required field (blocks Save) for Lodging/Rental Car/Cruise; optional for Flight/Train/Bus/Ferry. Footer Cancel/Save mirrors `trip-edit-sheet.tsx` exactly (ghost Cancel, primary Save, busy-state label swap). |
| Inline document attachment | Reservation row (expanded) and Add/Edit drawer's Documents section | Reuses `DocKindBadge` + filename row + small upload affordance, matching the Documents tab's row visual language. Uploading attaches with `Document.scope = "reservation"`. Deleting the parent Reservation cascades to remove its attached documents (FR-5), matching existing trip/event-scoped Document lifecycle. |
| Linked Event row (Itinerary) | Day card body, alongside manual `TripEvent` rows | Renders exactly like a manual event row (`{DESIGN.md.Components.linked-event-badge}` is the *only* visual delta: Reservation-Type icon instead of `MapPin`, plus a neutral "Linked" badge after the event name). Tapping the row navigates to the Reservations tab, scrolled to and with the relevant accordion section expanded, highlighting the source Reservation's row. No inline edit affordance — the icon swap + "Linked" badge communicate "tap to go edit elsewhere" rather than "tap to edit here". |
| FR-9 empty-state CTA banner | Top of Itinerary tab | Dismissible (`X`, `title="Dismiss"`, top-right, `icon-xs`/`size-8`). Tapping "Add Reservation" navigates to the Reservations tab AND immediately opens the FR-1 type-picker `DropdownMenu` — single tap, no intermediate state. `[ASSUMPTION carried from PRD]` — dismiss persistence (session-only vs. cross-session) is undefined; flagged below. |
| Cover Overflow Menu | Trip Cover (`trip-hero.tsx`), upper-right | `MoreHorizontal` trigger opens a `DropdownMenu` with up to 3 conditional items (Edit Cover always; Remove Cover if Photo/Map; Info if Unsplash photo). Selecting "Edit Cover" opens the existing `CoverImagePicker` dialog. "Remove Cover" sets `CoverType` to a random Graphic immediately (no confirmation — distinct from Delete-style destructive flows elsewhere, since it's reversible via Edit Cover). "Info" opens the attribution dialog. Menu re-evaluates its item set on every open based on current `CoverType`. |
| Reservations tab empty state | Reservations tab, 0 reservations | `Empty`/`EmptyHeader`/`EmptyMedia(icon)`/`EmptyTitle`/`EmptyDescription`/`EmptyContent`, matching `trip-docs-tab.tsx`. `EmptyContent` holds the same "Add Reservation" button/type-picker as the top-level entry point — no separate empty-state-specific add flow. |

## State Patterns

| State | Surface | Treatment |
| --- | --- | --- |
| Trip with 0 Reservations | Reservations tab | Full-surface `Empty` composition (FR-6) — "No reservations yet", description inviting Flight/Lodging/Rental Car/etc., "Add Reservation" button opening the FR-1 type picker. No per-type accordion sections render. |
| Trip with 0 Reservations | Itinerary tab | FR-9 banner shown at top, dismissible, copy = "Track your bookings here" / "Add reservations for hotels, rentals, and more". |
| Trip with ≥1 Reservation | Itinerary tab | FR-9 banner copy switches to prompt adding *more* reservations; same shell, same deep-link-and-auto-open behavior, still dismissible. |
| Accordion section, collapsed | Reservations tab | Header + one-line "Next: {provider} · {date} · {time}" preview, `var(--surface)` background continuing from the header. |
| Accordion section, expanded | Reservations tab | Header (bottom border added) + full list of Reservation rows for that type, ordered by `startTime`. |
| Reservation with only `startTime` (Flight/Train/Bus/Ferry, no `endTime`) | Reservation row + Itinerary | Row shows a single anchor line (Departure only); Itinerary gets exactly one Linked Event (FR-7). |
| Reservation with both `startTime` and `endTime` | Reservation row + Itinerary | Row shows two anchor lines; Itinerary gets two Linked Events, one per corresponding day. |
| Now Card showing a Linked Event (FR-10) | Now Card (trip list / trip detail) | Identical treatment to a manual event in the "Now"/"Next Event" slot — no Linked-specific styling on the Now Card itself; the distinction lives on the Itinerary row when the user navigates there. |
| Itinerary date range extended by a Reservation (FR-8) | Itinerary tab | New Day(s) inserted at the correct chronological position; existing Day numbers shift (e.g., a pre-trip-night Lodging check-in becomes the new Day 1, prior Day 1 becomes Day 2). New Day(s) render with the same day-card shell and immediately show the Reservation's Linked Event(s). `[ASSUMPTION, per PRD §9]` — no separate "pre-trip"/"post-trip" section; shifted numbering is accepted as-is. |
| Reservation deleted (FR-4) | Reservations tab + Itinerary | Row disappears from its accordion (section disappears entirely if it was the last Reservation of that type); its Linked Event(s) disappear from the Itinerary on next render — no orphaned rows. Attached documents are cascade-deleted. |
| Edit saved on `startTime`/`endTime` (FR-3, UJ-4) | Reservations tab + Itinerary | Linked Event(s) on the Itinerary reflect the new date/time immediately — no separate sync action, no stale-state risk. If the new date falls outside the current trip range, FR-8 extension applies. |

## Interaction Primitives

- **Tap/click to expand/collapse** — accordion sections (chevron rotates, same as day cards).
- **Click-to-edit** — every editable Reservation field (provider, anchors, confirmation code, notes): click text → inline input, blur/Enter saves, Escape cancels. No separate "edit mode" toggle for the whole row.
- **Type-first creation** — Reservation Type is chosen via a `DropdownMenu` *before* any other field is shown; immutable afterward (FR-1).
- **Tap-to-navigate, not tap-to-edit, for Linked Events** — tapping a Linked Event row on the Itinerary always navigates to Reservations; there is no inline edit path from the Itinerary (FR-11).
- **Deep-link + auto-open** — both the FR-9 banner CTA and (per UJ-1/UJ-4) Linked Event taps that land on Reservations may pre-open UI state (type picker, or scroll-to/expand a specific accordion row) on arrival — single interaction, no second tap required.
- **Inline document upload** — small upload affordance (`28px` icon button or dashed "Add confirmation document" row) attaches directly to the Reservation; no separate upload page.
- **Delete with confirmation** — Reservation deletion reuses the existing `delete-*-alert-dialog.tsx` confirmation pattern (FR-4); Cover "Remove Cover" does **not** use a confirmation dialog (reversible, immediate).
- **Banned**: a second in-drawer type switcher after initial selection; inline editing of Linked Events on the Itinerary; new left-border/tinted-background indicators for Linked Events (superseded — see `{DESIGN.md}` Do's and Don'ts).

## Accessibility Floor

Behavioral. Visual contrast lives in `{DESIGN.md}` (inherits Packt's existing WCAG-conformant token pairs).

- **The "Linked" indicator is never the sole signal.** Per `{DESIGN.md.Components.linked-event-indicator}`, the Reservation-Type icon swap (Hotel/Plane/etc. replacing `MapPin`) and the "Linked" text badge both convey the same information redundantly — a user relying on icon shape alone, or on the text badge alone, both get the signal. Neither relies on color alone (the badge uses neutral `var(--surface-2)`/`var(--fg-3)`, not a hue-coded accent).
- **Icon-only buttons need `title`** — the inline document-upload icon button (`title="Add document"`), the FR-9 banner dismiss button (`title="Dismiss"`), and the Cover Overflow trigger (`title="Cover options"`, inherited from `now-card.tsx`'s existing pattern) all carry explicit `title` attributes.
- **Tap targets ≥ `h-8`** — the inline document-upload affordance (`28px`/`size-7`-ish in the mock) must be raised to at least `size-8` (`32px`) per `CLAUDE.md`'s minimum; the FR-9 dismiss button is already `size-8`; the "Add Reservation" button is `h-10` (default size token).
- **Focus states** — all new interactive elements (accordion headers, Reservation row inline-edit triggers, drawer fields, dropdown items, Linked Event rows) inherit Packt's global `:focus-visible` ring (`outline: 2px solid var(--accent-brand)`); no custom focus treatment introduced.
- **Keyboard operability** — accordion headers are `<button>`s with `aria-expanded`; the type-picker `DropdownMenu` and Cover Overflow `DropdownMenu` are fully keyboard-navigable (inherited from the Base UI primitive); the Add/Edit drawer's Cancel/Save footer follows standard tab order (fields → Cancel → Save).
- **Screen-reader labeling** — Linked Event rows should expose their "Linked" status and target type in their accessible name/description (e.g., "Hotel Check-in — Riverside Inn, Linked, tap to edit in Reservations"), not rely on the visual badge alone.

## Key Flows

### Flow 1 — UJ-1: Ashley adds her first reservation from a confirmation email

1. Ashley, mid-trip-planning, has just received a hotel confirmation email. She opens Packt to the Itinerary tab (default) for the trip — zero Reservations exist yet.
2. The FR-9 banner sits at the top: "Track your bookings here — Add reservations for hotels, rentals, and more" with an "Add Reservation" button.
3. She taps "Add Reservation". The app navigates to the Reservations tab and immediately opens the FR-1 type-picker `DropdownMenu` — no second tap.
4. She picks **Lodging**. The Add Lodging Reservation drawer opens (Hotel icon in the title swatch, "Type: Lodging (cannot be changed after saving)" subtitle).
5. She fills in Provider ("Torel Avantgarde"), Check-in (date + time), Check-out (date + time, required for Lodging), Confirmation code ("TAV-88410"), and a note about late checkout. She leaves Documents empty for now.
6. **Climax:** She taps Save. The drawer closes; she's back on the Reservations tab, and a new Lodging accordion section (or a new row within an existing one) shows "Torel Avantgarde" with both anchor lines and the confirmation chip. Switching to the Itinerary tab, she sees a "Check-in" Linked Event on the corresponding day (Hotel icon, "Linked" badge) and a "Check-out" Linked Event on the departure day — if either date fell outside the trip's prior range, new Day(s) were inserted (FR-8) and existing Day numbers shifted accordingly.
7. **Resolution:** The FR-9 banner's copy changes — it now prompts adding *more* reservations, still linking to the Reservations tab with the same auto-open behavior. Ashley trusts that any future booking confirmation follows this same path.

### Flow 2 — UJ-2: Ashley checks a reservation detail mid-trip

1. Partway through the trip, Ashley wants to confirm her rental car pickup time. She opens the app to the Itinerary (today's day card is expanded by default, per existing `DayCard` behavior).
2. **Path A — it's on the Now Card:** If the rental car pickup Linked Event is the next chronological event, it's already surfaced on the Now Card (FR-10) exactly as a manual event would be — she sees it without navigating anywhere.
3. **Path B — she knows roughly when:** She scrolls the Itinerary to the day she expects the pickup, finds the Linked Event row (Car icon, "Linked" badge, "Pickup: Fri, Jun 19 · 2:00 PM — from Rental Car reservation").
4. **Path C — she'd rather browse by category:** She switches to the Reservations tab, finds the "Rental Car" accordion section, expands it, and reads the row directly (provider, Pickup/Return anchors, confirmation code).
5. **Climax:** Whichever path she took, she finds the pickup time and confirmation code without cross-referencing the other tab.
6. **Resolution:** She closes the app and heads to pick up the car. Both Itinerary (via Linked Events) and Reservations (via accordion sections) remain equally valid, always-in-sync entry points to the same underlying data.

### Flow 3 — UJ-3: Ashley manages the trip's cover image

1. Ashley is viewing a trip with an Unsplash photo cover. She taps the "⋯" overflow trigger in the cover's upper-right corner (`MoreHorizontal`, `bg-black/25` over the photo).
2. The Cover Overflow `DropdownMenu` opens showing all three items, since the cover is a Photo and specifically an Unsplash photo: **Edit Cover**, **Remove Cover**, **Info**.
3. **Branch — Edit Cover:** Opens the existing `CoverImagePicker` dialog (same component `trip-edit-cover.tsx` used to open from the edit sheet). She picks a new photo; the cover updates and the dialog closes.
4. **Branch — Remove Cover:** The cover immediately reverts to a random Graphic cover (no confirmation dialog — reversible via Edit Cover). On next open, the overflow menu now shows only "Edit Cover" (Remove Cover and Info disappear, since the cover is no longer Photo/Map/Unsplash).
5. **Branch — Info:** A dialog opens showing the Unsplash photographer's credit and a link back to Unsplash.
6. **Climax:** Whichever branch Ashley takes, the cover reflects the new state immediately and the overflow menu's item set updates to match on its next open.
7. **Resolution:** Ashley returns to viewing the trip with the cover in its new state. Separately, she notices the edit sheet ("Edit Trip") no longer has any cover controls (FR-13) — all cover management now lives behind this "⋯" menu.

### Flow 4 — UJ-4: Ashley edits a reservation and the Itinerary updates automatically

1. Ashley's flight time changed. She has two equally-valid starting points.
2. **Starting from Reservations:** She opens the Reservations tab, expands the "Flights" accordion section, finds the affected Reservation row, and clicks the Departure time field directly (click-to-edit — inline input appears with a teal underline).
3. **Starting from the Itinerary:** Alternatively, she taps the Linked "Departure" event row for that flight on the Itinerary. Because Linked Events are never inline-editable (FR-11), this tap redirects her to the Reservations tab, scrolled to and with the Flights accordion expanded, the relevant row highlighted — landing her at the same place as step 2.
4. She edits the Departure date/time inline and presses Enter (or blurs the field) to save.
5. **Climax:** The save completes; without any separate sync step, the corresponding Linked Event(s) on the Itinerary (Departure, and Arrival if present) immediately reflect the new date/time. If the new date falls outside the trip's current range, FR-8 extension kicks in — new Day(s) appear and numbering shifts.
6. **Resolution:** Ashley trusts the Reservation as the single source of truth — she never needs to separately update an Itinerary event for something she's already recorded as a Reservation. Both Reservations and Itinerary now agree, with zero drift (SM-2).

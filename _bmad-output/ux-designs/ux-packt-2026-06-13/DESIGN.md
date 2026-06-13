---
title: Reservations & Trip Logistics — Design
status: draft
created: 2026-06-13
updated: 2026-06-13
sources:
  - file:_bmad-output/prds/prd-packt-2026-06-12/prd.md
name: Packt
description: Travel itinerary planning app. This spine documents Packt's existing visual identity (source of truth: src/app/globals.css) plus the additions introduced by the Reservations & Trip Logistics feature.
colors:
  # No new color tokens. All values below are EXISTING Packt tokens (globals.css),
  # restated here because Reservations-feature components consume them directly.
  bg: "#ffffff"
  surface: "#f6f6f4"
  surface-2: "#efefec"
  surface-3: "#e6e6e2"
  line: "rgba(20, 20, 18, 0.08)"
  line-strong: "rgba(20, 20, 18, 0.14)"
  fg: "#131311"
  fg-2: "#4a4a45"
  fg-3: "#7a7a72"
  fg-4: "#a0a098"
  accent-brand: "#0e8b80"
  accent-soft: "#d6efec"
  accent-fg: "#ffffff"
  accent-ink: "#0a4a44"
  bg-dark: "#0e1014"
  surface-dark: "#161922"
  surface-2-dark: "#1d212c"
  surface-3-dark: "#262b38"
  line-dark: "rgba(255, 255, 255, 0.07)"
  line-strong-dark: "rgba(255, 255, 255, 0.13)"
  fg-dark: "#ecedef"
  fg-2-dark: "#b8bbc4"
  fg-3-dark: "#8b8f9a"
  fg-4-dark: "#61656e"
  accent-brand-dark: "#2bb5a6"
  accent-soft-dark: "rgba(43, 181, 166, 0.14)"
  accent-fg-dark: "#07151a"
  accent-ink-dark: "#b6ece6"
typography:
  # Inherited from globals.css — no overrides for this feature.
  card-title:
    note: "var(--fs-card-title) = 15px base, scaled by var(--font-scale); font-family var(--font-heading, ui-sans-serif); font-weight 600. Used for accordion section titles and Reservation provider names."
  card-sub:
    note: "var(--fs-card-sub) = 13px base, scaled by var(--font-scale); color var(--fg-3). Used for accordion preview rows, Reservation anchor lines, Linked Event meta."
  drawer-title:
    note: "18px, font-family var(--font-heading, ui-sans-serif), font-weight 600, letter-spacing -0.01em. Used for Add/Edit Reservation drawer titles."
  field-label:
    note: "12.5px, font-weight 500, color var(--fg-2). Used for drawer field labels (Provider, Check-in, Confirmation code, etc.)."
  mono-confirmation:
    note: "12px, font-family var(--font-mono, ui-monospace), letter-spacing 0.02em. Used for the confirmation-code chip on Reservation rows."
rounded:
  sm: "calc(var(--radius) - 4px)"
  md: "calc(var(--radius) - 2px)"
  lg: "var(--radius)"
  xl: "calc(var(--radius) + 4px)"
  card: "14px"
  full: "9999px"
spacing:
  # Tailwind default 4-based scale, inherited. No new spacing tokens.
  gutter: "16px"
  card-gap: "12px"
  row-padding-y: "14px"
  row-padding-x: "16px"
components:
  reservation-accordion:
    radius: "{rounded.card}"
    border: "{colors.line}"
    headerBackground: "{colors.surface}"
    background: "{colors.bg}"
    titleTypography: "{typography.card-title}"
    previewTypography: "{typography.card-sub}"
  reservation-type-badge:
    background: "{colors.surface-3}"
    foreground: "{colors.fg-2}"
    radius: "{rounded.full}"
  reservation-row:
    providerTypography: "{typography.card-title}"
    anchorLabelColor: "{colors.fg-3}"
    anchorValueColor: "{colors.fg-2}"
    confirmationBackground: "{colors.surface-2}"
    confirmationTypography: "{typography.mono-confirmation}"
  linked-event-badge:
    background: "{colors.surface-2}"
    foreground: "{colors.fg-3}"
    radius: "{rounded.full}"
    note: "Reuses Badge component's secondary/muted styling — same background/foreground pair as badge variant=muted ([background:var(--surface-2)] [color:var(--fg-2)]), rendered slightly smaller/lighter (fg-3) per the approved mock. No new variant required if muted is acceptable; otherwise add a same-palette size override only."
  add-reservation-button:
    size: "default"
    height: "h-10"
    paddingX: "px-4"
    background: "{colors.accent-brand}"
    foreground: "{colors.accent-fg}"
  fr9-cta-banner:
    radius: "{rounded.card}"
    border: "{colors.line}"
    background: "{colors.surface}"
    shadow: "var(--shadow-1)"
    iconBackground: "{colors.accent-soft}"
    iconForeground: "{colors.accent-ink}"
    buttonSize: "sm"
    dismissButtonSize: "icon-xs"
  cover-overflow-menu:
    triggerBackground: "rgba(0,0,0,0.25)"
    triggerForeground: "#ffffff"
    triggerBackdropBlur: "6px"
    contentBackground: "{colors.bg}"
    contentBorder: "{colors.line}"
    contentRadius: "{rounded.xl}"
---

## Brand & Style

Packt's visual identity does not change for this feature. The product remains a calm, editorial trip-planning surface: a warm off-white canvas (`var(--bg)` / `var(--surface)` family), a single teal accent (`var(--accent-brand)`) reserved for primary actions and "happening now" states, and a restrained type system (`var(--font-heading)` for titles, `var(--font-body)` for everything else, `var(--font-mono)` for codes/timestamps/metadata). `src/app/globals.css` is the source of truth for every token referenced here.

Reservations & Trip Logistics is additive: a new tab, a new drawer, and a handful of new row/badge patterns, all built from the existing card, badge, button, and empty-state vocabulary that already powers the Itinerary, Documents, and trip-list surfaces. Nothing in this feature introduces a new color, a new radius scale, or a new typographic voice. Where the feature needed a visual cue (the "Linked" indicator), the decision — after one revision — was to *reuse* existing neutral badge styling rather than invent a new accent. That reuse-first posture is the throughline for every component below.

## Colors

No new color tokens are introduced by this feature. Every value listed in this DESIGN.md's `colors` frontmatter is restated directly from `src/app/globals.css` (light + dark) for convenience, because the Reservations components below reference them by name.

- **`--accent-brand` / `--accent-soft` / `--accent-fg` / `--accent-ink`** (teal) — unchanged meaning: primary actions ("Add Reservation" button, Save buttons), and the "happening now" highlight on Itinerary event rows (`now-row` background, "Now" pill). Reservations and Linked Events do **not** get their own accent — a Linked Event that is also the "now" event uses the same `--accent-soft`/`now-pill` treatment as any other event.
- **`--surface` / `--surface-2` / `--surface-3`** — unchanged meaning: `--surface` for card headers and inset panels (accordion headers, FR-9 banner background, inline document rows); `--surface-2` for secondary chips and the "Linked" badge background; `--surface-3` for count badges on accordion headers.
- **`--line` / `--line-strong`** — unchanged meaning: hairline borders on cards, accordions, dashed upload affordances (`--line-strong` for dashed/empty-state borders).
- **`--fg` / `--fg-2` / `--fg-3` / `--fg-4`** — unchanged text-color ramp: `--fg` for primary text (provider names, event names), `--fg-2` for secondary labels and the "Linked" badge text, `--fg-3` for tertiary metadata (anchor labels, accordion previews, stop counts), `--fg-4` for placeholders and disabled affordances.

### Anti-pattern called out explicitly

Mid-run, a violet/indigo `--linked-brand` / `--linked-soft` / `--linked-ink` token triple was proposed for the Itinerary "Linked Event" indicator (left-border accent + tinted row background). The user rejected this on review. **These tokens were never added to `globals.css` and must not be added.** See Do's and Don'ts.

## Typography

Inherited wholesale from `globals.css` — `var(--font-heading)` for titles and section headers, `var(--font-body)` for body copy, `var(--font-mono)` for codes/timestamps, all with `var(--font-scale)` multipliers for the app's font-size preference. The feature reuses two existing size tokens directly:

- **`var(--fs-card-title)`** (15px base, weight 600, heading font) — accordion section titles (Lodging, Flights, Rental Car, etc.) and each Reservation row's provider name (e.g. "Hotel Avenida Palace").
- **`var(--fs-card-sub)`** (13px base, color `var(--fg-3)`) — accordion collapsed-preview text ("Next: TAP Air Portugal · Sun, Jun 14 · 8:35 AM"), Reservation anchor lines ("Check-in: Tue, Jun 16 · 3:00 PM"), and Linked Event meta lines.

New, feature-specific typographic roles (sized relative to existing scales, no new tokens):

- **Drawer title** (18px, heading font, weight 600, letter-spacing -0.01em) — "Add Lodging Reservation" / "Edit Lodging Reservation".
- **Drawer subtitle** (12.5px, `var(--fg-3)`) — "Type: Lodging (cannot be changed after saving)".
- **Field label** (12.5px, weight 500, `var(--fg-2)`) with a teal `*` for required fields and a muted "Optional" suffix (`var(--fg-4)`) for optional fields — matches the field-label pattern already used in `form-section.tsx`/`trip-edit-sheet.tsx`.
- **Confirmation code chip** (12px, mono font, letter-spacing 0.02em, `var(--fg-2)` on `var(--surface-2)`) — e.g. "AVP-22971-LIS".

## Layout & Spacing

Standard Tailwind 4-based scale, no new spacing tokens. Notable feature-specific spacing values, all drawn from existing patterns:

- **Accordion cards**: `rounded-[14px]`, `1px solid var(--line)` border, `12px` bottom margin between sections — same card rhythm as `day-card.tsx`.
- **Accordion header**: `12px 16px` padding, `var(--surface)` background — same as `day-card-header.tsx`.
- **Reservation row**: `14px 16px` padding, `1px solid var(--line)` bottom border (omitted on the last row in a section) — denser than a day-card event row (`12px 16px`) to fit more fields (provider, two anchor lines, confirmation chip, document row).
- **Inline document row** (within an expanded Reservation row): `8px 10px` padding, `8px` border-radius, `var(--surface)` background, `1px solid var(--line)` border, `10px` top margin from the confirmation chip.
- **Add Reservation drawer body**: `16px 20px 24px` padding, `18px` gap between fields — consistent with `trip-edit-sheet.tsx`'s drawer body spacing.
- **FR-9 CTA banner**: `14px` padding (`40px` right padding to clear the dismiss button), `12px` gap between icon/body, `14px` border radius, `16px` bottom margin before the first day card.

No layout/breakpoint changes: the Reservations tab joins the existing responsive tab shell (bottom tab bar on mobile, top tabs on desktop) used by Itinerary/Map/Documents/Packing/Notes. No custom desktop layout for Reservations.

## Elevation & Depth

Inherited from `globals.css` — `--shadow-1` (subtle, for resting cards: the FR-9 banner), `--shadow-2` (now-card-level elevation, not used by this feature's surfaces), `--shadow-3` (popovers/dropdowns/drawers: the FR-1 type-picker `DropdownMenu`, the Cover Overflow `DropdownMenuContent`, the Add/Edit Reservation `Drawer`). No new elevation tokens. Accordion cards and Reservation rows are flat (border only, no shadow), matching `day-card.tsx`.

## Shapes

Inherited radius scale: `--radius` (`0.625rem` / 10px) as the base, `rounded-sm`/`rounded-md`/`rounded-lg`/`rounded-xl` derived from it per `globals.css`'s `@theme inline` block, plus the app-wide `14px` "card" radius used for day cards and now applied identically to Reservation accordion sections and the FR-9 banner. Pills (`rounded-full` / `9999px`) are used for: the accordion count badge, the "Active" soft badge, the "Now" pill, and the new "Linked" badge — all existing pill usages, no new shape introduced.

Inline document rows and the empty-documents dashed panel use `8px`–`10px` radii, matching the existing `doc-row`/upload-affordance treatment in Documents.

## Components

### Add Reservation entry point (FR-1)

A `Button` (default size — `h-10`, `px-4`, `var(--accent-brand)` fill, `var(--accent-fg)` text, `Plus` icon `strokeWidth={1.5}`) labeled "Add Reservation", positioned above the accordion list on the Reservations tab. Opens a `DropdownMenu` (same trigger/content pattern as the "⋯" menu in `now-card.tsx`, but left-aligned under the button rather than positioned over an image) listing the 7 Reservation Types under an uppercase "Reservation Type" label (`11px`, weight 600, letter-spacing 0.04em, `var(--fg-3)`).

Each dropdown item: `6px 8px` padding, `6px` border radius, `10px` gap between icon and label, `14px` label text, icon `16px` at `strokeWidth={1.5}` in `var(--fg-3)`. Hover/active state: `var(--surface-2)` background.

**Reservation Type → icon mapping (lucide-react, `strokeWidth={1.5}` always):**

| Type | Icon |
| --- | --- |
| Flight | `Plane` |
| Train | `Train` |
| Bus | `Bus` |
| Ferry | `Ship` |
| Rental Car | `Car` |
| Lodging | `Hotel` |
| Cruise | `Anchor` |

`Anchor` (not `Ship`) is used for Cruise specifically to disambiguate it from Ferry's `Ship` icon — this mapping is used everywhere a Reservation Type icon appears (dropdown items, accordion headers, drawer title icon, Linked Event rows).

Reference: `.working/key-reservations-tab.html` (dropdown shown open, all 7 items).

### Reservation Type accordion section (FR-2)

Visually modeled directly on `day-card.tsx` / `day-card-header.tsx`:

- **Container**: `rounded-[14px]`, `1px solid var(--line)`, `var(--bg)` background, `12px` bottom margin, `overflow: hidden`.
- **Header** (`12px 16px` padding, `var(--surface)` background, clickable to toggle): left side is an icon-title group — the Reservation Type icon (`18px`, `var(--fg-2)`, `strokeWidth={1.5}`) + type name in `{typography.card-title}`. Right side: a count badge (pill, `22px` height, `var(--surface-3)` background, `var(--fg-2)` text, `11px` weight 600) + a `ChevronDown` (`14px`, `var(--fg-4)`, rotates 180° when open) — same chevron-rotation behavior as `DayCardHeader`.
- **Border between header and body**: `1px solid var(--line)`, only present when expanded (matches `DayCardHeader`'s conditional border).
- **Collapsed preview**: `0 16px 12px 16px` padding, `var(--surface)` background (continuation of header), `{typography.card-sub}` text — "Next: **{provider}** · {weekday}, {month} {day} · {time}" where the provider name is `var(--fg-2)` weight 500 and the rest is `var(--fg-3)`.
- **Sections with zero Reservations of that type render no accordion at all** (FR-2).

Only Reservation Types with ≥1 Reservation get a section; sections are not in a fixed display order beyond "types with reservations appear, types without don't" — `[ASSUMPTION]` ordering of multiple populated sections by next-upcoming Reservation date (earliest first) is visually implied by the mock (Lodging expanded first, then Flights, then Rental Car) but not explicitly specified; flagged in summary.

Reference: `.working/key-reservations-tab.html`.

### Reservation row (FR-2, FR-3, FR-5)

Within an expanded accordion section, each Reservation renders as a row: `14px 16px` padding, `1px solid var(--line)` bottom border (omitted on the last row).

- **Provider name**: `{typography.card-title}` (15px, weight 600, heading font), `6px` bottom margin.
- **Anchor lines** (one or two, per Reservation Type — see Glossary): each is a flex row with `6px` gap, baseline-aligned. The label ("Check-in:", "Check-out:", "Departure:", etc.) is `var(--fg-3)`, fixed `68px` min-width; the value ("Tue, Jun 16 · 3:00 PM") is `var(--fg-2)`, both at `{typography.card-sub}` (13px). Format is "{Weekday, Month Day} · {h:mm AM/PM}" — the day-card date format (`Tue, Jun 16`) plus a time, per the decision log.
- **Confirmation code chip** (if present): inline-flex, `3px 8px` padding, `6px` radius, `var(--surface-2)` background, `{typography.mono-confirmation}`, with a small `Wallet`/credit-card-style icon (`13px`, `var(--fg-3)`) — `8px` top margin from the last anchor line.
- **Attached documents** (FR-5): each rendered as an inline document row directly below the confirmation chip — `8px` top margin, flex row with `8px` gap, `8px 10px` padding, `8px` radius, `var(--surface)` background, `1px solid var(--line)` border. Contains a `DocKindBadge` (reused as-is from `doc-kind-badge.tsx`), a truncated filename (`{typography.card-sub}`, `flex: 1`), and a `28px`×`28px` upload-affordance icon button (`6px` radius, `1px dashed var(--line-strong)` border, `var(--fg-3)`) with `title="Add document"`.
- **No-documents state**: a single dashed row (`border-style: dashed`, centered content, `var(--fg-3)`, `12px` text) reading "Add confirmation document" with an `Upload` icon (`14px`) — same visual family as the Documents-tab empty affordance but inline and compact.

Each editable field (provider, anchor times, confirmation code, notes) is click-to-edit, consistent with `doc-row.tsx`'s inline-rename pattern (click text → input with `border-bottom: 1px solid var(--accent-brand)`, blur/Enter to save, Escape to cancel). `type` is displayed (as the accordion's icon/title) but never editable on the row.

Reference: `.working/key-reservations-tab.html` (two Lodging rows — one with an attached PDF, one with the empty-upload affordance).

### Add/Edit Reservation drawer (FR-1, FR-3)

Container: `Drawer` / `DrawerContent` / `DrawerHeader` / `DrawerFooter` — the same primitive used by `trip-edit-sheet.tsx` (`direction="right"` on desktop, bottom sheet on mobile per the `drawer.tsx` primitive's responsive behavior).

- **Header**: a `32px`×`32px` rounded (`8px`) icon swatch (`var(--surface)` background, `var(--fg-2)` icon, the selected Reservation Type's icon per the FR-1 mapping) + drawer title ("Add {Type} Reservation" / "Edit {Type} Reservation") in `{typography.drawer-title}`. Below, left-indented to align under the title (`42px` margin-left, matching the icon+gap width): a subtitle, `{typography.drawer-subtitle}` — "Type: {Type} (cannot be changed after saving)" on Add; on Edit, the same subtitle but without the parenthetical (type is simply shown, not editable — no type picker re-shown).
- **Body**: `16px 20px 24px` padding, `18px` vertical gap between fields, scrollable.
- **Fields**, each `{typography.field-label}` with a teal `*` (required) or muted "Optional" suffix:
  - **Provider*** — single-line `Input` (`h-9`, per the `sm` size token).
  - **Time anchor fields** — labeled per Reservation Type (Check-in/Check-out for Lodging, Pickup/Return for Rental Car, Departure/Return for Cruise, Departure/Arrival for Flight/Train/Bus/Ferry). Each anchor is an `input-row`: two `h-9` inputs side by side (date with `Calendar` icon, time with `Clock` icon, both `14px` field icons in `var(--fg-3)`). `endTime`/second-anchor field is required (`*`) for Lodging, Rental Car, Cruise; omitted entirely as a hard requirement (still offered, optional) for Flight/Train/Bus/Ferry — if left blank, only the start Linked Event is generated (FR-7).
  - **Confirmation code** (Optional) — single-line `Input`, placeholder "e.g. TAV-88410".
  - **Notes** (Optional) — `Textarea`, `72px` min-height.
  - **Documents** (FR-5) — uppercase `12px` section label ("Documents", weight 600, letter-spacing 0.04em, `var(--fg-3)`), followed by either the existing attached-document inline rows (same styling as the Reservation-row document rows above) or, when empty, a dashed empty panel (`1px dashed var(--line-strong)`, `10px` radius, `var(--surface)` background, centered `FileText` icon in a `32px` `var(--bg)` swatch, "No documents yet" title, descriptive copy, and an "Add document" button at `outline`/`sm` size — directly reusing the Documents-tab empty-state visual language from `trip-docs-tab.tsx`/`empty.tsx`).
- **Footer**: `1px solid var(--line)` top border, `14px 20px` padding, right-aligned `Cancel` (ghost) + `Save` (primary, `var(--accent-brand)`) — identical to `trip-edit-sheet.tsx`'s `DrawerFooter`.

On **Add**, the drawer opens directly into the selected type's fields (no in-drawer type switcher — type is chosen via the FR-1 dropdown before the drawer opens). On **Edit**, the same drawer/fields render with the type shown read-only in the header subtitle.

Reference: `.working/key-add-reservation-drawer.html` (Lodging, both anchors required, one notes line, empty Documents panel).

### Linked Event indicator on the Itinerary (FR-7, FR-11) — REVISED

A Linked Event renders as a **normal Itinerary event row** — same `12px 16px` padding, same `1px solid var(--line)` bottom border, same time column, same "happening now" `var(--accent-soft)`/"Now" pill treatment if applicable. The **only** two differences from a manually-created event row:

1. **Leading icon**: the Reservation Type's icon (per the FR-1 mapping — e.g. `Hotel` for a Lodging check-in) replaces the default `MapPin` icon used by manual events. Same size (`16px`), same color (`var(--fg-3)`), same `strokeWidth={1.5}`.
2. **"Linked" badge**: a small pill badge — `18px` height, `0 7px` padding, `999px` radius, `10px` text, weight 500, `var(--surface-2)` background, `var(--fg-3)` foreground — placed inline after the event name, reading "Linked". This is the same neutral palette as the `Badge` component's `muted`/`secondary` variants (`[background:var(--surface-2)] [color:var(--fg-2)]`); no new badge variant is strictly required, though a slightly lighter `var(--fg-3)` foreground was used in the approved mock — see `{components.linked-event-badge}`.

**No left border, no row background tint, no new color token.** The event's meta line shows the same full date+time anchor format as Reservation rows ("Check-in: Tue, Jun 16 · 3:00 PM — from {Type} reservation").

Reference: `.working/key-itinerary-linked-event.html` — shows a manual event (MapPin, no badge), a "happening now" event (teal highlight, MapPin, "Now" pill), and a Linked Event (Hotel icon, "Linked" badge) side by side for contrast.

### FR-9 Itinerary empty-state CTA banner

A compact horizontal card, `rounded-[14px]`, `1px solid var(--line)`, `var(--surface)` background, `var(--shadow-1)`, `14px` padding (`40px` on the right to clear the dismiss control), `16px` bottom margin, positioned above the first day card.

- **Icon swatch**: `36px`×`36px`, `10px` radius, `var(--accent-soft)` background, `var(--accent-ink)` foreground, `Luggage` icon (`18px`, `strokeWidth={1.5}`).
- **Body**: title (`14px`, weight 600, heading font, `var(--fg)`) + description (`12.5px`, `var(--fg-3)`) + an "Add Reservation" button (`sm` size — `h-9`/`px-3.5`, `var(--accent-brand)` fill, `Plus` icon, `8px` top margin).
- **Dismiss control**: top-right, `icon-xs`/`size-8` icon button, `var(--fg-4)` foreground, `X` icon (`15px`), `title="Dismiss"`.

Copy: title "Track your bookings here" / description "Add reservations for hotels, rentals, and more" when the trip has zero Reservations; description switches to a prompt for adding *more* Reservations once ≥1 exists (same shell, same deep-link behavior). Tapping the button navigates to the Reservations tab and immediately opens the FR-1 type-picker `DropdownMenu` — no second tap.

Reference: `.working/key-itinerary-empty-cta-banner.html`.

### Reservations tab empty state (FR-6)

Standard `Empty` / `EmptyHeader` / `EmptyMedia` (`variant="icon"`) / `EmptyTitle` / `EmptyDescription` / `EmptyContent` composition — identical structure to `trip-docs-tab.tsx`'s zero-documents state. `EmptyMedia` uses a relevant icon (e.g. `Luggage` or `Plane`, `strokeWidth={1.5}`, in the standard `size-8 rounded-lg bg-muted` swatch). Title: "No reservations yet". Description invites Flight/Lodging/Rental Car/etc. `EmptyContent` holds the "Add Reservation" button, which opens the same FR-1 type-picker `DropdownMenu`.

### Cover Overflow Menu (FR-12)

Direct reuse of `now-card.tsx`'s overflow pattern, applied to `trip-hero.tsx`'s cover instead of the trip-list card's cover:

- **Trigger**: `absolute top-2 right-2`, `MoreHorizontal` icon (`18px`, `strokeWidth={1.5}`), `bg-black/25 text-white backdrop-blur-sm` (hover: `bg-black/45`), `6px` radius, `title="Cover options"`.
- **Content**: `DropdownMenuContent` (`side="bottom" align="end"`), `var(--bg)` background, `1px solid var(--line)`, `{rounded.xl}` radius, `var(--shadow-3)`.
- **Items** (conditional per cover state, all `13px`/`14px`, `10px` icon-label gap, `var(--fg-3)` icons):
  - **Edit Cover** (always) — `Pencil` icon, opens the existing `CoverImagePicker` dialog directly (the same dialog `trip-edit-cover.tsx` opens today).
  - **Remove Cover** (only when `CoverType` is Photo or Map) — `Trash2` icon, matching the "Remove day" destructive-icon convention in `day-card-header.tsx`. Reverts cover to a random Graphic.
  - **Info** (only when cover is an Unsplash photo) — `Info` icon, opens the photographer-credit/attribution dialog.

This is a new menu instance on the trip detail page — it does not modify or duplicate the trip-list card's "Edit trip"/"Delete trip" overflow menu in `now-card.tsx`.

Reference: `.working/key-cover-overflow-menu.html` (all three items shown — Photo/Unsplash cover state).

## Do's and Don'ts

| Do | Don't |
| --- | --- |
| Reuse `day-card.tsx`/`day-card-header.tsx` styling (rounded-14, `var(--surface)` header, `var(--line)` border, chevron) for Reservation accordion sections | Invent a new card shell for accordion sections |
| Use the FR-1 Reservation Type → icon mapping (Plane/Train/Bus/Ship/Car/Hotel/Anchor, `strokeWidth={1.5}`) consistently across the dropdown, accordion headers, drawer titles, and Linked Event rows | Use different icons for the same Reservation Type in different surfaces |
| Indicate a Linked Event with **only** (1) the Reservation Type icon replacing `MapPin` and (2) a neutral "Linked" badge (`var(--surface-2)`/`var(--fg-3)`, same family as `Badge` `muted`) | Reintroduce the superseded `--linked-brand` / `--linked-soft` / `--linked-ink` violet tokens, a left-border accent, or a tinted row background for Linked Events |
| Keep the "happening now" `var(--accent-soft)`/"Now" pill treatment as the *only* accent-colored state on Itinerary rows — it can co-occur with the Linked indicator | Add a second accent color or a competing highlight for Linked Events |
| Reuse `DocKindBadge` and the Documents-tab empty-state composition (`Empty`/`EmptyMedia variant="icon"`/etc.) for Reservation document attachments | Build a parallel document-row or empty-state component for Reservations |
| Reuse the `now-card.tsx` `MoreHorizontal`/`DropdownMenu` overflow pattern verbatim for the Cover Overflow Menu | Create a new trigger style or menu shell for the Cover Overflow Menu |
| Keep all new interactive targets at or above `h-8` (icon buttons `size-8`+, primary buttons `h-9`/`h-10` per `CLAUDE.md` size tokens) | Use sub-`h-8` tap targets for inline document upload affordances, dismiss buttons, etc. |
| Use `strokeWidth={1.5}` on every lucide icon introduced by this feature | Mix icon stroke weights |

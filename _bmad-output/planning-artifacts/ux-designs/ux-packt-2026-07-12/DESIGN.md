---
name: "Packt — Location-Aware Itinerary"
description: "Visual delta for the Location-Aware Itinerary feature (PRD prd-packt-2026-07-12), inheriting Packt's existing shadcn + Base UI + CSS-custom-property system (src/app/globals.css) wholesale — the same inheritance discipline as the June 2026 budget-feature DESIGN.md. No new colors, typography, radii, or spacing are introduced; only new component tokens are specified."
status: final
sources:
  - _bmad-output/planning-artifacts/prds/prd-packt-2026-07-12/prd.md
  - _bmad-output/planning-artifacts/prds/prd-packt-2026-07-12/addendum.md
updated: 2026-07-13
colors: {} # empty — component refs below resolve against src/app/globals.css token names
typography: {}
rounded: {}
spacing: {}
components:
  distance-time-pill:
    icon: "lucide:navigation"
    icon-stroke-width: 1.5
    bg: "{colors.accent-soft}"
    fg: "{colors.accent-ink}"
    rounded: "{rounded.full}"
    min-target: "44px × 44px"
    replaces: "hardcoded '— · — km' placeholder text in now-card.tsx"
    loading-state: "neutral surface-2/fg-3 skeleton fill while distance/time is calculating — never accent-soft until data resolves"
  geo-hint-pill:
    icon: "lucide:navigation"
    icon-stroke-width: 1.5
    bg: "{colors.surface-2}"
    fg: "{colors.fg-3}"
    rounded: "{rounded.full}"
    min-target: "44px × 44px"
    occupies: "same slot as distance-time-pill — mutually exclusive, never both shown"
    denied-state: "same bg/fg as the not-yet-asked state; label text changes to communicate the blocked state (see EXPERIENCE.md State Patterns)"
  address-button-group:
    component: "shadcn Base UI ButtonGroup (ui.shadcn.com/docs/components/base/button-group), orientation: horizontal — shown only when the Address is filled; empty state stays a single button, no group"
    segment-1:
      content: "lucide:map-pin icon (existing PlaceRowActionBar convention) + location name text"
      action: "opens External Maps — filled state becomes a live navigation action under FR-13, not a grandfathered legacy chip"
      variant: "outline"
    segment-2:
      content: "lucide:pencil icon only, no text"
      icon-stroke-width: 1.5
      action: "opens the edit dialog — the only way to reach it once an Address exists"
      variant: "outline"
    joining: "shared border between segments (outline variant self-borders per shadcn convention) — no ButtonGroupSeparator needed, no gap between segments"
    min-target: "44px × 44px per segment"
  schedule-conflict-row-icon:
    icon: "lucide:triangle-alert"
    icon-stroke-width: 1.5
    color: "{colors.warning}"
    size: "IconSize.actionChip (12px), matches existing action-chip icon scale"
    position: "appended after the Time chip on the affected PlaceRow"
  schedule-conflict-day-badge:
    icon: "lucide:triangle-alert"
    icon-stroke-width: 1.5
    bg: "{colors.warning-soft}"
    fg: "{colors.warning-ink}"
    rounded: "{rounded.full}"
    reuses: "status-badge pattern from budget-feature DESIGN.md — icon + word, never color alone"
  getting-around-segmented-control:
    variant: "icon + label segmented button group, 3 segments (walk, drive, transit) — 'smart' dropped per PRD amendment 2026-07-13"
    selected-bg: "{colors.accent-soft}"
    selected-fg: "{colors.accent-ink}"
    unselected-fg: "{colors.fg-3}"
    rounded: "{rounded.md}"
    each-segment-min-target: "44px × 44px (width, not just height)"
    keyboard-model: "arrow-key roving tabindex within the group, Home/End jump to first/last — matches the trip-detail tab bar's convention"
    reused-on: "Profile page's global Transit Mode default (see transit-preference-fields) — identical control, different Field label ('Default transit mode' vs. trip edit's 'Getting Around')"
  transit-preference-fields:
    context: "Profile page, new Fields inside the existing preferences-section.tsx, alongside distanceUnit/currency — not a new page or dialog"
    default-mode: "reuses getting-around-segmented-control (walk/drive/transit), Field label 'Default transit mode'"
    walk-threshold:
      component: "shadcn Select, matches the existing Budget 'Warning %' / 'Danger %' preset-list pattern in preferences-section.tsx — not a free-text numeric input"
      options: "'Off' (null — default) plus a short preset distance list, displayed in the user's distanceUnit (m or ft/mi) matching PlaceRowActionBar's existing unit-display convention"
      min-target: "44px × 44px, matches every other Select trigger on the page"
    label: "'Walk if closer than' — [ASSUMPTION: exact preset distance values deferred to implementation; follow the THRESHOLD_OPTIONS precedent (fixed short list, not a slider or free entry)]"
    mock: "mockups/profile-transit-preferences.html (states: threshold off, threshold set with menu open)"
  day-route-strip:
    bg: "{colors.surface}"
    border: "1px solid {colors.line}"
    rounded: "{rounded.lg}"
    thumbnail-bg: "{colors.surface-2}"
    route-line-color: "{colors.accent-brand}"
    pin-active: "{colors.accent-brand}"
    pin-inactive: "{colors.surface-3}"
    thumbnail-min-target: "44px × 44px (clickable, deep-links to Map Tab)"
    loading-state: "thumbnail renders a neutral surface-2 skeleton block until route data resolves; summary text row shows no distance/time figures until then"
  map-tab-day-selector:
    variant: "horizontal scrollable segmented control, same visual language as the trip-detail tab bar"
    selected-border: "2px solid {colors.accent-brand} (bottom)"
    selected-fg: "{colors.fg}"
    unselected-fg: "{colors.fg-3}"
    each-segment-min-target: "44px × 44px (width, not just height)"
    keyboard-model: "arrow-key roving tabindex, Home/End jump to first/last — same convention as getting-around-segmented-control and the existing trip-detail tab bar"
  map-pin:
    color: "{colors.accent-brand}"
    variant: "single color for all pins — no per-day hue coding"
    contrast-requirement: "accent-brand pin fill must be re-verified for 3:1 non-text contrast (WCAG 1.4.11) against whichever base map tile style architecture selects — street vs. satellite tiles can fail contrast differently; not verifiable until the map dependency is chosen."
  place-row-action-chip:
    scope: "Time chip, Cost chip, Docs toggle, Attach chip, and the empty-Address single button — every PlaceRowActionBar chip, not just the ones this feature adds"
    min-target: "44px × 44px (up from today's ~24px effective height at px-2/py-0.5) — brings the existing shared component into compliance with Packt's own non-negotiable interactive-sizing rule, deliberately pulled into this pass so the new 44px Address ButtonGroup doesn't sit next to visibly undersized siblings in the same row"
    shape: "unchanged — rounded.full pill, same accent-soft/fg-4 fill logic per chip state (filled vs. empty)"
    icon-size: "unchanged — IconSize.actionChip (12px) stays inside the larger tap area; only the button's own height/padding grows, not the icon"
    ripple: "PlaceRowActionBar is shared by every event/reservation row app-wide — this resize is visible on every trip, not only on Located ones"
---

## Brand & Style

This feature adds a location-aware layer to Packt's existing itinerary and trip-detail surfaces. It introduces **no new brand expression** — no new colors, no new type roles, no new corner-radius scale. Every new element (distance pills, conflict badges, the transit-mode control, the route strip, the map) is built entirely from tokens Packt already has, styled to match components that already exist on the same screens (PlaceRow's action chips, the budget feature's status-badge pattern, the trip-detail tab bar). The discipline mirrors the June 2026 budget-feature DESIGN.md: **if the brand can't justify a new token, this feature doesn't add one.**

One deliberate exception to "visual delta only": once the Address control grows to a real 44px `ButtonGroup`, leaving `PlaceRowActionBar`'s Time/Cost/Docs/Attach chips at their current ~24px undersizes the whole row visually and against Packt's own interactive-sizing rule. This pass resizes all of them to 44px — a scope decision beyond the PRD's stated FRs, made explicitly for row consistency rather than left as silent debt.

## Colors

No new color tokens. This feature reuses:

- **`accent-brand`** (`#0e8b80` light / `#2bb5a6` dark) — map pins, route lines, and the filled/active state of location affordances (distance pill, filled Address pill, selected transit mode, selected map day).
- **`accent-soft` / `accent-ink`** — the same soft-background + readable-ink pairing that every other filled action chip in Packt already uses (Time chip, Cost chip). The Distance/Time pill and selected segmented-control options follow this exact convention.
- **`warning` / `warning-soft` / `warning-ink`** (added in the June 2026 budget feature) — Schedule Conflict badges, both row-level and day-level. Reusing budget's warning family rather than inventing a third semantic color keeps "something needs attention" a single visual language across the app; icon + word always accompanies it, per the existing accessibility convention — color is never the sole signal.
- **`surface-2` / `fg-3` / `fg-4`** — neutral/muted states: the geolocation compact hint (before permission is granted), unfilled Address pills, inactive map pins in the Day Route Strip thumbnail.

## Shapes

Pills (Distance/Time pill, geo-hint pill, Getting Around segments, and every `PlaceRowActionBar` chip) use `rounded.full` — unchanged shape, only the tap-area dimensions grow. The Day Route Strip card uses `rounded.lg`, matching `chart-card` and other bordered surface cards from the budget feature. No new radius values.

## Components

- **Distance/Time pill** — Replaces the literal `"— · — km"` placeholder text at `now-card.tsx:196-197`. Lives in a new second zone of the restructured Next Event row (see EXPERIENCE.md Component Patterns), sized to the 44×44px interactive minimum, `lucide:navigation` icon + distance/time text, `accent-soft`/`accent-ink` fill matching the existing chip vocabulary. Never nested inside the row's itinerary Link. Renders a neutral skeleton fill while the calculation is pending — never shows stale or zeroed data.
- **Geo-hint pill** — Same shape, size, and position as the Distance/Time pill; occupies its slot when geolocation permission is missing but the Next Event is Located. Neutral `surface-2`/`fg-3` fill (not accent) — it's an invitation, not an active-state confirmation. Tapping triggers the browser permission prompt on first ask; after an explicit deny, tapping re-attempts and, if still blocked, the label swaps to communicate that (see EXPERIENCE.md State Patterns) rather than repeating a no-op prompt.
- **Address button group** — Once an Address is filled, `PlaceRowActionBar`'s location chip becomes a two-segment shadcn `ButtonGroup`: segment 1 (map-pin icon + location name) opens External Maps — a live navigation action under FR-13, not a legacy static chip; segment 2 (pencil, icon-only) opens the edit dialog, the only way to reach it once an Address exists. Both segments are real `outline`-variant `Button` elements sharing a border, joined with no visible gap — genuine DOM siblings, never nested. Empty Address stays a single button (unchanged today's behavior), no group.
- **Schedule Conflict row icon** — `lucide:triangle-alert`, `warning` color, appended after the Time chip on any `PlaceRow` with a flagged conflict. Mirrors the existing `TabStatusIcon` accessibility pattern: icon is `aria-hidden`, a visually-hidden span carries the text so the row's accessible name becomes "Time, Schedule conflict."
- **Schedule Conflict day badge** — Same icon + `warning-soft`/`warning-ink` pairing as the budget tab's `status-badge`. Appears once per day, summarizing conflict count; never shown at zero conflicts (silence is the neutral signal, same rule as budget's status badge). Unlike the bare row icon, the count text itself is the visible and accessible name — the icon stays `aria-hidden` with no extra `sr-only` span needed.
- **Getting Around segmented control** — 3-segment icon+label group (walk / drive / transit) in the Trip Edit "Getting Around" section. Selected segment: `accent-soft` fill, `accent-ink` text. Each segment meets the 44×44px minimum on both axes — this is a settings control, not a compact chip — and supports arrow-key roving-tabindex navigation. **[AMENDED 2026-07-13: "smart" dropped per PRD FR-6 amendment — architecture found no MVP inference logic to back a fourth segment.]**
- **Transit preferences (Profile page)** — New Fields inside the existing `preferences-section.tsx`, alongside `currency`/`distanceUnit`: (1) a global default reusing the identical Getting Around segmented control (3 segments), and (2) a "Walk if closer than" `Select` offering "Off" plus a short preset distance list, mirroring the Budget section's existing `THRESHOLD_OPTIONS` preset-list pattern rather than a slider or free-text field. Neither existed before this pass — both are new MVP-scoped surfaces per FR-8's amendment pulling the account-level default and walk-distance exception into MVP.
- **Day Route Strip** — New component, not a restyle of the dead `mini-map-rail.tsx`/`RailPanel`. Bordered `surface` card, `rounded.lg`, containing a compact route thumbnail (`surface-2` background, `accent-brand` route line and active pins, `surface-3` inactive pins) that is a real 44×44px tap target deep-linking into the Map Tab scoped to that day. Renders a neutral skeleton block while route data is pending.
- **Map Tab day selector** — Horizontal scrollable segmented control reusing the trip-detail tab bar's exact visual language (2px `accent-brand` bottom border on the selected segment, `fg` vs `fg-3` text weight/color split). "Whole Trip" is always the first segment. Each segment meets 44×44px on both axes with arrow-key roving-tabindex navigation, same as Getting Around's control.
- **Map pin** — Single `accent-brand` color for every Located Item pin, in both whole-trip and day-scoped views. No qualitative per-day palette — the day selector, not pin color, is what narrows scope. Contrast against the base map tile style must be re-verified once architecture selects the map dependency.
- **PlaceRowActionBar chips (Time, Cost, Docs, Attach, empty-Address)** — Resized to the 44×44px minimum, same `rounded.full` shape and accent-soft/fg-4 fill logic as today, only the tap area grows. Not a PRD-required change — a deliberate consistency decision so the new 44px Address ButtonGroup doesn't sit next to visibly undersized siblings in the same row. Ripples across every event/reservation row app-wide, not just Located ones.

## Do's and Don'ts

| Do | Don't |
| --- | --- |
| Reuse `accent-brand` for every "this is where you're going / this is located" signal (pills, pins, route lines, selected states) | Introduce a new brand color for map or location UI |
| Reuse the budget feature's `warning` family for Schedule Conflicts | Invent a third semantic color for conflicts — two "something's off" languages compete for attention |
| Give the Distance/Time pill and geo-hint pill their own 44×44px tap target, independent of the row's itinerary Link | Nest a second interactive element inside the existing Next Event `<Link>`/`<button>` |
| Build the filled Address control as a real shadcn `ButtonGroup` — two `outline` `Button` siblings, each 44×44px | Nest the edit pencil inside the location button's own tappable element, or float it as a separate detached control with a gap |
| Show a neutral skeleton fill on the Distance/Time pill and Day Route Strip thumbnail while data is pending | Show stale, zero, or placeholder-dash values while a calculation is in flight |
| Pair every Schedule Conflict indicator with the triangle-alert icon and word | Rely on `warning` color alone to signal a conflict |
| Use `lucide:navigation` for "opens external maps" actions | Reuse `lucide:map-pin` for both "has a saved location" and "navigate there" — the two need to read as visually distinct actions |
| Keep map pins a single color across the whole trip | Color-code pins per day — that's the day selector's job |
| Resize every `PlaceRowActionBar` chip to 44×44px, not just the ones this feature adds | Ship a new 44px Address ButtonGroup next to visibly undersized Time/Cost/Docs/Attach chips in the same row |

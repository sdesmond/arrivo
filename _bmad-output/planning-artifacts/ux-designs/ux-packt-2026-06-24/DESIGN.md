---
name: "Packt — Budget Tab & Travel Retrospective"
description: "Visual delta for Trip Budget Management & Travel Retrospective, inheriting Packt's existing shadcn + Base UI + CSS-custom-property system (src/app/globals.css). Only new tokens and feature-specific components are specified here — everything else (surfaces, text scale, radii, shadows, base components) is the existing system as-is."
status: final
updated: 2026-06-24
colors:
  warning: "#b6790a"
  warning-soft: "#fbeacb"
  warning-ink: "#6b4406"
  warning-dark: "#e3a83a"
  warning-soft-dark: "rgba(227,168,58,0.16)"
  warning-ink-dark: "#f5d9a0"
  danger-soft: "#fbe4e1"
  danger-ink: "#7a261d"
  danger-soft-dark: "rgba(255,99,71,0.14)"
  danger-ink-dark: "#ffb3a8"
typography: {}
rounded: {}
spacing:
  tile-gap: "{spacing.2}"
components:
  budget-progress-bar:
    track: "{colors.surface-2}"
    fill-neutral: "{colors.accent-brand}"
    fill-warning: "{colors.warning}"
    fill-danger: "{colors.destructive}"
    height: "8px"
    rounded: "{rounded.full}"
  status-badge:
    neutral:
      bg: "{colors.accent-soft}"
      fg: "{colors.accent-ink}"
      icon: none
    warning:
      bg: "{colors.warning-soft}"
      fg: "{colors.warning-ink}"
      icon: "lucide:triangle-alert"
    danger:
      bg: "{colors.danger-soft}"
      fg: "{colors.danger-ink}"
      icon: "lucide:circle-x"
    icon-stroke-width: 1.5
  tab-status-icon:
    show-at: ["warning", "danger"]
    hide-at: ["neutral"]
    size: "14px"
    icon-warning: "lucide:triangle-alert"
    icon-danger: "lucide:circle-x"
    color-warning: "{colors.warning}"
    color-danger: "{colors.destructive}"
  category-tile:
    bg: "{colors.surface}"
    border: "1px solid {colors.line}"
    rounded: "{rounded.lg}"
    min-width: "120px"
    label-color: "{colors.fg-3}"
    figure-color: "{colors.fg}"
  field-row:
    bg: "{colors.surface}"
    border: "1px solid {colors.line}"
    rounded: "{rounded.lg}"
    padding: "{spacing.3} {spacing.4}"
  currency-picker-row:
    swatch-bg: "{colors.surface-2}"
    swatch-fg: "{colors.fg-2}"
    selected-bg: "{colors.accent-soft}"
  chart-card:
    bg: "{colors.surface}"
    border: "1px solid {colors.line}"
    rounded: "{rounded.lg}"
    padding: "{spacing.4}"
  headline-figure:
    label-color: "{colors.fg-3}"
    figure-color: "{colors.fg}"
  donut-chart:
    center-figure-color: "{colors.fg}"
    center-label-color: "{colors.fg-3}"
    legend-position: "below"
    unknown-segment-color: "{colors.fg-4}"
    unknown-segment-contrast-note: "fg-4 (#a0a098 light / #61656e dark) against {colors.surface} and against neighboring segments must clear the same 3:1 non-text contrast rule as the category palette — verify at implementation time, same as category-donut-palette."
    accessible-name: "Each chart's root SVG/canvas element carries role=\"img\" and an aria-label summarizing it, e.g. \"Category breakdown donut chart: Lodging $1,200, Food $640, ...\" — the chart graphic itself is never name-less, independent of the legend/label text already on-screen."
  category-donut-palette:
    source: "11 distinct hues (one per ExpenseCategory value) — no --chart-N tokens exist yet in globals.css; implementation defines them following shadcn's chart-token convention (CSS custom properties, light/dark variants)."
    contrast-requirement: "Every pair of segments that can sit adjacent in the donut must clear 3:1 non-text contrast (WCAG 1.4.11) against each other and against {colors.surface} (the chart-card background); verify at implementation time since exact hues aren't fixed here. No two adjacent segments may share both similar hue AND similar lightness — labels are the primary signal, but adjacency must still be visually distinguishable."
  budget-adherence-donut:
    under: "{colors.accent-brand}"
    on: "{colors.warning}"
    over: "{colors.destructive}"
  destination-donut-palette:
    source: "Same convention as category-donut-palette, sized to however many distinct countries appear in the filtered range (no fixed segment count) — not a separate hand-picked palette."
    unknown-segment-color: "{colors.fg-4}"
---

## Colors

- `warning` / `warning-soft` / `warning-ink` (+ `-dark` variants) are new — Packt's existing palette had `accent-brand` (teal, positive) and `destructive` (red, danger/error) but no amber middle state. Added following the existing `accent` family's soft/ink pairing convention (a muted background + a readable-on-it ink color, not a flat saturated fill), so the warning badge and progress-bar segment sit visually between the calm teal and the existing red rather than competing with either.
- `danger-soft` / `danger-ink` are new for the same reason — `destructive` itself is a solid, attention-grabbing red meant for buttons/text; the Budget tab needs a _softer_ danger background for the status badge so it reads as a state, not an alarm. `destructive` itself remains the progress-bar fill and tab-icon color at the danger threshold.
- Everywhere else — `surface`, `line`, `fg` family, `accent-brand` — is the existing system, unchanged. `budget-progress-bar`'s track reuses the existing `surface-2` token in both themes (light `#efefec`, dark `#1d212c`) — no new track color; `warning-dark` (`#e3a83a`) against dark `surface-2` clears 3:1 non-text contrast with more margin than the light-mode pairing (light `warning` `#b6790a` against light `surface-2` `#efefec` is ~3.18:1 — passes WCAG 1.4.11 but with little headroom; don't darken `warning` further without re-checking this pairing).
- Travel Retrospective introduces no new color tokens beyond what's already here — the budget adherence donut reuses `accent-brand`/`warning`/`destructive` (the same under/on/over semantics as the Budget tab's own threshold states, deliberately shared rather than inventing a parallel palette), and the "Unknown" destination segment reuses the existing `fg-4` muted-neutral token. The category donut's 11-step qualitative palette extends shadcn's own `chart-N` CSS variable convention rather than hand-picked hex values — color there is a secondary aid (segment labels/legend carry the primary signal, per the Accessibility Floor), so exact hues are an implementation detail, not a UX decision.

## Components

- **budget-progress-bar**: a single thin (8px) bar, full-width, `rounded.full`, fill color switches between `accent-brand` / `warning` / `danger` based on which threshold band Actual currently falls in (FR-11). Track is `surface-2`.
- **status-badge**: icon + word pill next to the big Actual figure. Three states map 1:1 to FR-11's neutral/warning/danger — icon is never omitted at warning/danger (color is never the sole signal, per the Accessibility Floor in EXPERIENCE.md); at neutral there's no badge shown at all (an "on track" badge would be visual noise on every trip, every time).
- **tab-status-icon**: the same warning/danger icon, shown inline after the "Budget" tab label in the trip-detail tab bar — hidden entirely at neutral. First status-bearing tab in the tab bar; other tabs are unaffected.
- **category-tile**: the FR-6 breakdown unit — category name (small, `fg-3`) centered above a large `fg` figure. Sized to wrap at least 2 per row on the narrowest supported viewport.
- **field-row**: the stacked full-width row pattern shared by `CostDialog` and the new Misc Expense modal — a bordered, rounded card row per field (currency+amount combined row, category disclosure row, date row, note row). No persistent required-marker on the category row — required-ness is enforced at save time (inline validation message), not shown as a standing dot/asterisk. Replaces `CostDialog`'s previous plain "$ + input" layout.
- **currency-picker-row**: the overlay-list row used by all three currency pickers in this feature (CostDialog, Misc Expense modal, `TripEditBudget`) — two-letter code swatch, currency name, ISO code. The selected row is conveyed by an `accent-soft` background highlight only, no checkmark glyph. No search field.
- **chart-card**: wraps each of the 3 Spending-view charts (category, destination, budget adherence) individually — bordered, rounded, padded, matching `field-row`'s general card treatment. Each chart reads as its own unit; a chart's legend always sits inside its own card, never ambiguous about which chart it belongs to.
- **headline-figure**: the 3 plain stat figures atop the Spending view (Total Spend, Average Trip Spend, Average Daily Spend) — small label above, large figure below, same typographic relationship as `category-tile` but without the bordered-card treatment (these aren't chart units, just a stat row).
- **donut-chart**: shared base for the category, destination, and budget adherence donuts — centered figure + optional label inside the ring (the "donut with text" pattern), legend below. Category and destination donuts center on total spend; budget adherence centers on trip count ("4 Trips" / "1 Trip"). The "Unknown" destination segment slots in by size like any other segment — `fg-4` fill, no demotion to a smaller/separated wedge.
- **category-donut-palette**: 11 segments (one per `ExpenseCategory` value), extending shadcn's `chart-N` token convention rather than a hand-picked palette — direct segment labels where space allows, legend + tooltip fallback for small segments. Color is secondary to the label/legend text per the Accessibility Floor.
- **budget-adherence-donut**: 3 segments — under (`accent-brand`), on (`warning`), over (`destructive`) — same semantics as the Budget tab's threshold states.
- **destination-donut-palette**: per-country segments, same hue-generation convention as `category-donut-palette` but sized to the number of distinct countries in range rather than a fixed 11 — countries vary trip to trip, categories don't. "Unknown" reuses `fg-4`, same as the donut-chart base spec.

## Do's and Don'ts

- Do pair every warning/danger visual state with its icon — color alone never carries the distinction (WCAG 2.1 AA, color-blind-safe — PRD §5 Cross-Cutting NFRs).
- Do reuse `field-row` and `currency-picker-row` everywhere amount/currency/category is entered in this feature — don't let CostDialog and the Misc Expense modal drift into two visual languages for the same concept.
- Do keep every Travel Retrospective chart in its own `chart-card` — don't let charts run together into one undifferentiated block now that there are 3 of them on one view.
- Don't introduce charts on the per-trip Budget tab — charts live exclusively in Travel Retrospective's Spending view; the Budget tab's `category-tile` stays a plain figure, never a chart primitive.
- Don't show the status badge or tab icon at the neutral state — silence is the neutral signal.
- Don't let color be the sole signal on any Travel Retrospective chart — every donut leans on direct labels or a legend first, color second.

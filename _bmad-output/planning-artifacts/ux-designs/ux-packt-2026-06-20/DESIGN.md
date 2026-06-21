---
name: Packt
status: final
updated: 2026-06-21
description: Travel itinerary planning app. This pass specifies the offline-storage feature's icon-state vocabulary only — everything else inherits the existing Packt visual system unchanged.
components:
  trip-cover-pin-icon:
    not-pinned: { icon: "Download", strokeWidth: 1.5 }
    syncing: { icon: "progress-ring", note: "real-percentage ring, not indeterminate spinner" }
    pinned: { icon: "CloudCheck", strokeWidth: 1.5 }
    failed: { icon: "CloudAlert", strokeWidth: 1.5, color: "{badge.warning}" }
  connectivity-indicator:
    online: { note: "hidden — no persistent online state" }
    offline: { icon: "WifiOff", strokeWidth: 1.5 }
    conflict: { icon: "CloudAlert", strokeWidth: 1.5, color: "{badge.warning}", clickable: true }
  doc-row-sync-state:
    local-only: { icon: "CloudOff", strokeWidth: 1.5, color: "var(--fg-3)" }
    uploading: { icon: "progress-ring", note: "real-percentage ring" }
    synced: { icon: "CloudCheck", strokeWidth: 1.5, color: "var(--accent-brand)" }
---

# Packt — Offline Storage Visual Delta

> This pass adds **no new visual system** — colors, typography, layout, elevation, and shape all inherit unchanged from the existing Packt app shell. The only new visual content is an icon-state vocabulary across three surfaces (trip cover pin, global connectivity indicator, doc-row sync state), plus the removal of two stale static-text stubs. Sections with nothing new to say are omitted below.

## Brand & Style

No change. Offline storage is infrastructure made legible through icon state, not a new aesthetic register. The existing Packt shell (cover photography/graphics, editorial type, soft surfaces) carries this feature the same way it carries everything else — offline state is communicated entirely through the icon vocabulary in **Components**, never through new color schemes, new surface treatments, or new layout structure.

## Colors

No new colors introduced. Offline-state icons reuse the existing Badge color vocabulary already defined in `src/components/ui/badge.tsx`:

- **Warning / needs-attention states** (`CloudAlert`, used for both pin-failure and conflict-detected) reuse the same amber tone as Badge's `warning` variant (`bg-amber-50 text-amber-700` / dark `bg-amber-950 text-amber-300`).
- **Success / confirmed states** (`CloudCheck`) reuse `var(--accent-brand)` — the same token `doc-row.tsx`'s existing offline indicator already uses for its "cached" state.
- **Neutral / inactive states** (`Download`, `CloudOff` before upload) use `var(--fg-3)` — the existing muted-icon token already used throughout doc rows and crumbs.

No destructive-red is introduced for offline failure — a failed pin/sync is a retryable wait state per FR13's rollback guarantee, not data loss, so it sits in the warning register, not `destructive`.

## Shapes

No change. Icon-only controls (pin icon, connectivity indicator, doc-row sync icon) are unadorned icons or icon-in-button per existing patterns (e.g. `trip-card.tsx`'s `MoreHorizontal` trigger) — no new container shapes.

## Components

This is the substantive content of this pass: a shared cloud/connectivity icon vocabulary applied consistently across three surfaces, all using `lucide-react` icons at `strokeWidth={1.5}` per existing repo convention.

### Shared icon-state principle

One icon, one meaning, reused across surfaces rather than inventing a new glyph per context:

- `CloudAlert` always means "needs attention, user must act" — used identically for TripCover pin failure (OQ1) and for the connectivity indicator's conflict-detected state. Same icon, same color treatment, regardless of which surface it appears on.
- `WifiOff` always means network connectivity is down (global, surface-level concern) — used only by the connectivity indicator.
- `CloudOff` / `CloudCheck` always mean local file-sync state (this-item-specific concern) — used only by the doc-row sync indicator and the TripCover pin icon's synced state. Deliberately distinct from `WifiOff` even though both read as "offline" colloquially: `WifiOff` is connectivity, `Cloud*` is sync/storage state.

### TripCover pin icon

New icon-only control with tooltip, top-right of `TripCover`. On `trip-card.tsx`, sits left of the existing `MoreHorizontal` overflow trigger (`right-2`) — e.g. `right-11` — to avoid collision. On `trip-hero.tsx`, sits alone at top-right (no overflow menu present there).

Four states, direct-toggle on click (no intermediate panel):

| State | Icon | Notes |
| --- | --- | --- |
| Not pinned | `Download` | Default/idle. |
| Downloading/syncing | progress ring | Real-percentage fill (StorageProvider exposes granular byte/item progress, not a boolean) — not an indeterminate spinner. |
| Pinned & synced | `CloudCheck` | — |
| Failed (OQ1) | `CloudAlert` | Warning-amber. Persists visually until the user acts — does not silently revert to `Download`. (Click behavior per state: see EXPERIENCE.md Component Patterns / State Patterns.) |

Every state carries a persistent `aria-label` describing the state in words (e.g. `"Pinned for offline"`, `"Pin failed — not enough storage"`), in addition to the hover tooltip — required uniformly per the accessibility concern scan, not optional per-state.

This replaces two stale static elements that must be removed as part of wiring this in:
- `trip-hero.tsx`'s hardcoded `metaTag="ACTIVE TRIP · OFFLINE"` — the `· OFFLINE` suffix was a leftover stub, not a real signal. Drop the suffix; `metaTag` keeps only the day-count content.
- `trip-card.tsx`'s `coverMetaTag` (`tripStatus.toUpperCase()`) has no offline suffix today and needs none added — confirms no equivalent stub exists there to remove.

### Global connectivity indicator

Icon-only, no label text, replaces two existing dead/stub slots and evolves one existing live element:

| State | Icon | Visual notes |
| --- | --- | --- |
| Online (default) | hidden | Online is the default state; showing it constantly is noise. Nothing renders. |
| Offline | `WifiOff` | — |
| Conflict detected | `CloudAlert` | Warning-amber, same token as the TripCover failure state. (Rendering/click triggers per state: see EXPERIENCE.md State Patterns.) |

Slots this occupies (all three are the *same* indicator, evolving per surface):
- Desktop Trips list: `trips-topbar.tsx`'s unused `Bell` icon button (`<Button variant="outline" size="icon-sm" title="Notifications">`) — icon and `title` swap to the connectivity vocabulary above; hidden by default.
- Trip detail view: `trip-detail-crumb.tsx`'s `Download`-icon "Offline" button — relabeled to this indicator's vocabulary; this component is not currently rendered anywhere and needs wiring into the trip detail layout as part of this change.
- Mobile: `trips-mobile-layout.tsx`'s static dot + "Synced offline" text (lines ~71–82) become state-driven — dot/icon and text only render while actually offline or in conflict; the hardcoded "Synced offline" copy is removed (it was always-on regardless of real state, same category of stub as the cover's old `· OFFLINE` suffix).

Each state carries a persistent `aria-label` per the accessibility concern scan (e.g. `"Offline"`, `"Sync conflict — tap to review"`).

### DocRow sync-state indicator

Replaces the existing per-doc `doc.offline` boolean tooltip indicator (currently `Download` icon, "Cached offline" / "Not cached offline" labels) in `doc-row.tsx`, `event-doc-row.tsx`, and `reservation-doc-row.tsx` — same slot, same `Tooltip`/`TooltipTrigger` structure, new icon-state vocabulary and copy:

| State | Icon | Tooltip copy |
| --- | --- | --- |
| Local-only, not yet uploaded | `CloudOff` | "Will upload when back online" — neutral, not alarming; a queued upload is a wait, not an error. |
| Uploading | progress ring | Real-percentage, matching the TripCover pattern. |
| Synced | `CloudCheck` | "Synced" (replaces "Cached offline") |

Color carries over from the existing pattern: synced state uses `var(--accent-brand)` (matches current `doc.offline ? "var(--accent-brand)" : ...`); local-only/not-yet-synced uses `var(--fg-3)` (`doc-row.tsx`) / `var(--fg-4)` (`event-doc-row.tsx`, `reservation-doc-row.tsx` — both already use this slightly dimmer token in their compact layout; no change to that existing distinction).

`aria-label` on the wrapping `<span role="img">` updates to match the new state words, replacing "Cached offline" / "Not cached offline" (full a11y requirement: see EXPERIENCE.md Accessibility Floor).

### Conflict review screen

Visual reference: [`mockups/conflict-review-screen.html`](mockups/conflict-review-screen.html) — rows-remaining state, showing all three row shapes (plain incoming change, document-deletion exception, mutually-exclusive conflict pair) and the disabled Close button with hint. Spine wins on conflict with the mock.

New full-takeover dialog built on the existing `Dialog`/`DialogContent` primitive (`src/components/ui/dialog.tsx`), extended beyond its default `sm:max-w-sm` small-popup sizing — this is the one surface in this pass that needs a wider treatment: a large/full-screen variant (e.g. `sm:max-w-2xl` or a dedicated full-screen popup class, not the existing small-dialog default) sized to hold a scrollable list of changed-item rows.

- Close affordance: reuses the existing `DialogPrimitive.Close` + `Button variant="ghost" size="icon-sm"` treatment `DialogContent` already renders for `showCloseButton`, styled via `Button`'s existing `disabled` state (no new gray invented) with a tooltip hint ("Resolve all changes to continue") while disabled. (Which state triggers disabled vs. enabled: see EXPERIENCE.md State Patterns.)
- Each changed-item row: a horizontal layout pairing the item description with a **Local** / **Online** tag (existing `Badge` `outline` variant — neutral, not warning/destructive, since a tag alone isn't an alert) and an Accept/Decline `Button` pair (`size="sm"`, per the existing sizing table). Mutually-exclusive conflict pairs (same item, edited both sides) render as two adjacent rows visually grouped (shared border/background per existing card-grouping patterns) rather than as a single combined row, so each option keeps its own Accept/Decline pair.
- Dialog header: `DialogTitle` + `DialogDescription` per existing pattern, e.g. title "Trip changed while offline," description naming the count of items needing review.

## Do's and Don'ts

| Do | Don't |
| --- | --- |
| Reuse `CloudAlert` for every "needs attention" state across surfaces (pin failure, conflict) | Invent a second error/warning glyph for offline-related failures |
| Reuse existing Badge `warning`/`destructive` color tokens for alert icon states | Hardcode new hex/amber values for offline UI |
| Keep `WifiOff` scoped to network-connectivity meaning only | Use `WifiOff` for file-sync/upload state (`CloudOff`/`CloudCheck` own that) |
| Hide the connectivity indicator entirely while online | Show a persistent "you're online" badge — online is the default, not a state worth chrome |
| Give every state-bearing icon a persistent `aria-label`, not just a hover tooltip | Rely on icon shape/color alone to convey state |
| Use real-percentage progress rings for pin/upload syncing | Use an indeterminate spinner where granular progress is available |

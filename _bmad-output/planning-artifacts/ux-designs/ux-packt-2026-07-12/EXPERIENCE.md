---
name: "Packt — Location-Aware Itinerary"
status: final
sources:
  - _bmad-output/planning-artifacts/prds/prd-packt-2026-07-12/prd.md
  - _bmad-output/planning-artifacts/prds/prd-packt-2026-07-12/addendum.md
updated: 2026-07-13
---

# Packt — Location-Aware Itinerary — Experience Spine

> Location-Aware Itinerary (PRD `prd-packt-2026-07-12`). Makes saved Address/Coordinates data useful at the Now Card, Itinerary Day View, Trip Edit, Address surfaces, and a new Map Tab — without making location entry mandatory. Paired with this run's `DESIGN.md`.

## Foundation

Responsive web, same behavior as every other Packt trip-detail surface — no desktop-only special-casing, no new form-factor. Next.js App Router + shadcn/ui + Base UI on Tailwind v4, inheriting Packt's existing CSS-custom-property token system (`src/app/globals.css`). `DESIGN.md` is the visual identity reference for this feature's new component tokens; this spine is the behavioral contract. Single-tenant per trip; access roles (`viewer < editor < owner`) gate every write per the existing pattern — location fields follow the same edit permissions as every other event/reservation field.

**Core product discipline (PRD §1, non-negotiable):** location is enrichment, not a requirement. Every pattern below that touches a Freeform Item (no Coordinates) must degrade to *today's exact behavior* — no placeholder, no nudge, no warning.

## Information Architecture

| Surface | Reached from | Purpose |
| --- | --- | --- |
| Now Card — Next Event row | App open / trip detail | Live distance/time to the Next Located Event; one tap opens External Maps |
| Itinerary Day View | Trip detail → Itinerary tab | Day Route Strip (≥2 Located Items) and row/day Schedule Conflict indicators |
| Trip Edit — "Getting Around" | Trip edit sheet | Sets Trip Transit Default (walk / drive / transit) |
| Address surfaces (event/reservation) | Location chip on any `PlaceRow` | State-flipped: filled → opens External Maps; edit reached via a dedicated affordance |
| Map Tab | Trip detail tab bar (existing `map` tab, currently a placeholder) | Whole-trip and day-scoped geographic view of all Located Items |
| Profile — Preferences | Profile route, alongside `currency`/`distanceUnit` | Sets the account-level Transit Mode default and an optional walk-distance exception applied across every trip (FR-8, amended into MVP 2026-07-13) |

→ Composition reference: `mockups/now-card-next-event.html`, `mockups/day-route-strip.html`, `mockups/map-tab.html`, `mockups/address-pill.html`, `mockups/getting-around.html`, `mockups/profile-transit-preferences.html`. Spine wins on conflict.

## Voice and Tone

Microcopy. Brand voice lives in `DESIGN.md`. Same plain, factual register as the existing budget-feature Do/Don't table — no exclamation points, no hype.

| Do | Don't |
| --- | --- |
| "12 min walk" | "Just a quick 12-minute stroll away!" |
| "Enable location for directions" | "Turn on location to get moving!" |
| "1 tight connection today" | "Uh oh, your schedule looks tight!" |
| "No located stops yet" (Map Tab empty state) | "Nothing to see here — add a location to get started!" |
| "Couldn't get directions — try again." | "Oops! Something went wrong finding directions." |
| Silence for freeform-only days and empty Addresses | Any "add a location" nudge on a Freeform Item |

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md.Components`.

| Component | Use | Behavioral rules |
| --- | --- | --- |
| Next Event row (restructured) | Now Card | Splits into two independent tap zones: (1) name/time area, a `Link` to the itinerary — unchanged from today; (2) a new distance/time or geo-hint pill below it, its own 44×44px target. The two zones are siblings, never nested — the pill cannot live inside the row's outer `Link`. Only the Next Event row changes shape; "Now" and Linked-event rows are unaffected (FR-1/FR-3 scope to Next Event only). → `mockups/now-card-next-event.html` (three states: granted, not-yet-asked, denied). |
| Distance/Time pill | Next Event row | Shown when Next Event has Coordinates and geolocation is available. Tap opens External Maps for that event (FR-3). If travel time can't be calculated but Coordinates exist, the pill still renders and still opens maps — distance/time text omitted, not the whole pill. → `mockups/now-card-next-event.html` state (A). |
| Geo-hint pill | Next Event row | Occupies the distance pill's exact slot when Coordinates exist but geolocation permission is missing/denied (FR-2). Tap triggers the browser permission prompt — never auto-prompts on page load. Denying leaves the pill in place, unchanged; no repeated blocking prompts. → `mockups/now-card-next-event.html` states (B) and (C). |
| No pill (Freeform Next Event) | Next Event row | When the Next Event has no Coordinates, neither pill renders — the row looks exactly as it does today. This is the FR-1/FR-4 guardrail: absence of location data is never visually marked. |
| Address pill (state-flip) | Any `PlaceRow` location chip | Empty: same behavior as today — a single button, tap opens the location entry dialog, now resized to 44×44px along with every other action-bar chip. Filled: becomes a two-segment shadcn `ButtonGroup` — segment 1 (map-pin + location name) opens External Maps (FR-13), segment 2 (pencil, icon-only) opens the edit dialog, the only way to reach it once an Address exists. Both segments are real `outline` `Button` siblings sharing a border, each meeting the 44×44px minimum — genuine DOM siblings, never one nested inside the other (same nesting hazard, same fix, as the Next Event row). No static map preview popover (explicitly out of scope). → `mockups/address-pill.html` (empty, today's-chip-for-comparison, and this spine's ButtonGroup structure). |
| PlaceRowActionBar chips (Time, Cost, Docs, Attach) | Every `PlaceRow`, event and reservation alike | Resized to 44×44px alongside the Address control — a deliberate scope decision beyond the PRD's FRs, made so the row doesn't mix a full-size Address ButtonGroup with visibly undersized siblings. Behavior is unchanged: same dialogs, same toggle, same currency/category flows. Applies to every event/reservation row app-wide, not only Located ones. → `mockups/day-route-strip.html`. |
| Schedule Conflict row icon | Affected `PlaceRow`, next to Time chip | Shown only on the specific event row where travel time from the prior Located Item exceeds the scheduled gap (FR-12). Freeform Items never trigger or display this. → `mockups/day-route-strip.html`. |
| Schedule Conflict day badge | Top of Itinerary Day View, per day | Shown only when ≥1 row-level conflict exists that day; summarizes count, non-modal, no toast. Absent at zero conflicts. → `mockups/day-route-strip.html`. |
| Day Route Strip | Itinerary Day View, days with ≥2 Located Items | Route summary (distance, time, Trip Transit Default) + thumbnail. Days with 0–1 Located Items render no strip — no empty-state clutter on freeform-only days (FR-10). Thumbnail always meets the 44×44px minimum, but its deep-link into the Map Tab, pre-scoped to that day, ships in two phases (FR-11, FR-16 `[ASSUMPTION]`): non-clickable/hidden until Map Tab exists, then live once it does — **[CORRECTED 2026-07-13: previously assumed single-pass delivery; epics.md phases Day Route Strip and Map Tab into separate epics.]** → `mockups/day-route-strip.html`. |
| Getting Around section | Trip Edit sheet | New section housing the Trip Transit Default segmented control (walk / drive / transit). Existing trips show a valid default without forcing users through this flow first (FR-7). → `mockups/getting-around.html`. |
| Transit preferences (Profile page) | Profile route | New Fields inside the existing preferences section, alongside `currency`/`distanceUnit`: (1) global Transit Mode default reusing the identical Getting Around segmented control, and (2) a "Walk if closer than" preset-distance `Select` (Off + short list), mirroring the Budget section's existing Warning %/Danger % preset pattern rather than a slider or free-text field (FR-8, amended into MVP 2026-07-13). Setting the global default seeds new trips' Trip Transit Default; it does not retroactively change existing trips. The walk-distance exception, when set, overrides the trip's Transit Mode for any individual hop shorter than the threshold — evaluated live per hop, not seeded. [ASSUMPTION: exact preset distance values deferred to implementation.] → `mockups/profile-transit-preferences.html`. |
| Map Tab | Trip detail tab bar | Defaults to whole-trip scope, showing every Located Item across the trip. Day selector (segmented control, "Whole Trip" first) filters pins and route context to one day. Freeform Items never appear as pins — they stay visible only in itinerary views (FR-14). → `mockups/map-tab.html`. |
| Map pin | Map Tab | Tapping a pin opens/highlights that Located Item's detail (name, address, and an "open External Maps" action) — pins are never decoration-only. Overlapping pins at the same coordinates or close zoom levels cluster or offset rather than stacking invisibly; exact clustering behavior is an architecture/library decision, but "a tap must always resolve to exactly one identifiable item" is the spine's requirement. → `mockups/map-tab.html`. |

## State Patterns

| State | Surface | Treatment |
| --- | --- | --- |
| Next Event located, distance/time calculating | Now Card | Distance/Time pill renders in its neutral skeleton fill — never a stale, zero, or dashed value — until the async result resolves (PRD Performance NFR: this lookup must not block initial page render). |
| Next Event located, geolocation granted | Now Card | Distance/Time pill with live data. |
| Next Event located, geolocation not yet asked | Now Card | Geo-hint pill in the same slot, "Enable location for directions." Tap triggers the native browser permission prompt. |
| Next Event located, geolocation previously denied | Now Card | Same slot, distinct label communicating the block (e.g. "Location blocked — enable it in your browser settings") instead of repeating the same call-to-action indefinitely; tap re-attempts rather than silently no-op-ing against the browser's suppressed prompt. |
| Next Event located, directions calc fails | Now Card | Pill still renders, still opens maps; distance/time text omitted. |
| Next Event freeform (no Coordinates) | Now Card | No pill at all — row unchanged from today. |
| Day has 0–1 Located Items | Itinerary Day View | No Day Route Strip. |
| Day route data calculating | Itinerary Day View | Day Route Strip renders with a neutral skeleton thumbnail and no distance/time figures until the calculation resolves. |
| Day has ≥2 Located Items, 0 conflicts | Itinerary Day View | Day Route Strip shown; no conflict badge. |
| Day has ≥2 Located Items, ≥1 conflict | Itinerary Day View | Day Route Strip + day-level conflict badge (count) + row-level icon on each affected row; badge/icon appearance is `aria-live="polite"` when triggered by an in-page edit (time, order, or transit mode change) so the change is discoverable without a full re-scan. |
| Trip Transit Default: no explicit override | Trip Edit — Getting Around | Segmented control shows the deterministic seeded default (FR-7) selected, with no distinct "default" visual treatment beyond normal selection — the value is real and valid, not a placeholder. |
| Trip Transit Default: explicit override set | Trip Edit — Getting Around | Segmented control shows the user's chosen mode selected; persists until changed again. |
| Day Route Strip thumbnail, before Map Tab ships | Itinerary Day View | Thumbnail renders at full 44×44px size but is non-clickable/hidden as an active tap target — visually present as a route-availability affordance, not yet a deep-link (FR-11, FR-16). |
| Day Route Strip thumbnail, after Map Tab ships | Itinerary Day View | Thumbnail becomes a live tap target, deep-linking into the Map Tab pre-scoped to that day. |
| Walk-distance exception: off (default) | Profile — Preferences | Select shows "Off"; no hop is ever forced to walk regardless of distance. |
| Walk-distance exception: set | Profile — Preferences | Select shows the chosen preset distance; any hop shorter than it resolves to walk for that hop, overriding the trip's Transit Mode default. |
| Address empty | Any Address surface | Unchanged existing add/edit behavior. |
| Address filled | Any Address surface | Two-segment ButtonGroup: location segment opens External Maps; pencil segment reaches the edit dialog. |
| Trip has Located Items | Map Tab | Whole-trip map, all pins visible, day selector active. |
| Trip has zero Located Items | Map Tab | Neutral, unobtrusive empty state ("No located stops yet") — no prompt to add locations; this is the one surface where a neutral empty state is acceptable because the user opened it deliberately (addendum `[ASSUMPTION]`). |
| Day scope selected in Map Tab | Map Tab | Pins and route context filter to that day; "Whole Trip" always reachable to return to full scope. |
| Directions/map provider failure | Now Card, Day Route Strip, Map Tab | Degrades to existing itinerary behavior plus direct External Maps access wherever Coordinates exist — never blocks the surface (PRD Reliability NFR). |

## Interaction Primitives

- **44×44px minimum on both axes** on every new interactive target — Distance/Time pill, geo-hint pill, each Address ButtonGroup segment, Day Route Strip thumbnail, each Getting Around segment, each Map Tab day-selector segment. Non-negotiable per Packt's existing interactive-sizing rule; this is the specific constraint that forced both the Next Event row's two-zone restructure and the Address control's move from a single undersized chip to a real ButtonGroup once FR-13 makes its first segment a live navigation action. **Extended, by deliberate scope decision, to every existing `PlaceRowActionBar` chip** (Time, Cost, Docs, Attach) — resized to 44×44px too, so the row doesn't mix full-size and undersized controls; their behavior is unchanged, only the tap area grows.
- **Tap distance/geo-hint pill** — opens External Maps (has data), triggers the geolocation prompt (needs permission), or re-attempts with a distinct "blocked" label (previously denied). Never more than one of these on the same tap.
- **Pill focus continuity** — the Distance/Time pill and geo-hint pill are a single stable DOM node across the geo-hint ↔ distance/time transition (e.g. permission granted mid-session while the pill is focused). Only the content/label updates; focus is never lost to a remount.
- **Tap the Address ButtonGroup's location segment** — opens External Maps. **Tap its pencil segment** — opens the edit dialog. Two adjacent `Button` siblings sharing a border, not a mode toggle, not nested.
- **Tap Day Route Strip thumbnail** — deep-links to Map Tab, pre-scoped to that day, once Map Tab ships; before then the thumbnail is present but non-interactive (see State Patterns).
- **Tap Map Tab day-selector segment** — filters pins/route to that day; horizontally scrollable when the trip has many days.
- **Segmented-control keyboard model** — Getting Around and the Map Tab day selector both use arrow-key roving tabindex within the group, with Home/End jumping to the first/last segment — matching the existing trip-detail tab bar's convention. Not a plain Tab-through button list.
- **Geolocation permission** — always user-initiated via the geo-hint pill tap; never requested automatically on page load (FR-2 `[ASSUMPTION]`).

## Accessibility Floor

Behavioral. Visual contrast lives in `DESIGN.md` (inherits shadcn's WCAG AA-compliant defaults; the reused `warning` family was already contrast-verified in the June budget feature).

- WCAG 2.2 AA across every surface in this feature, same floor as the rest of Packt.
- Every Schedule Conflict indicator (row icon, day badge) pairs an icon with visible text — color is never the sole signal, matching the budget feature's status-badge precedent.
- The Distance/Time pill and geo-hint pill carry explicit accessible names distinct from decorative icon-only labeling, e.g. "Open directions to {event name}, 12 minutes" / "Enable location for directions to {event name}" — the pill's purpose must be readable without relying on the adjacent event name for context, since it is now a sibling target rather than nested inside the row's link.
- The Next Event row's two-zone restructure preserves the existing name/time area's accessible name and link behavior unchanged; the new pill is a separate, independently focusable element in DOM/tab order immediately after it. The Address ButtonGroup's two segments follow the identical sibling-DOM discipline — real `Button` elements, never one nested inside the other.
- Live-updating content is scoped, not blanket-announced: Distance/Time pill text updates (e.g. "12 min" → "11 min" as time passes) are **not** wrapped in an assertive live region — that would spam screen-reader users with constant re-announcements. Schedule Conflict badge appearance/disappearance triggered by an in-page edit (time, order, or transit-mode change) **is wrapped in** `aria-live="polite"`, so a change a user just caused is discoverable without forcing a full page re-scan.
- Map Tab hands off four requirements to whichever interactive map library architecture selects, independent of that choice:
  1. Pins carry accessible names/labels.
  2. The map viewport is keyboard-operable (pan/zoom/pin-focus, WCAG 2.1.1) or the surface provides an equivalent list-based control — the existing itinerary list of Located Items already satisfies "map isn't the only way to understand the itinerary" (PRD §8), but the Map Tab itself must still expose a non-drag path to reach any pin's detail.
  3. Pan/zoom/fly-to animations respect `prefers-reduced-motion`.
  4. `map-pin`'s `accent-brand` fill is contrast-reverified against whichever base tile style is chosen (`DESIGN.md.map-pin`).
- All map, mode, Address, warning, and navigation controls meet Packt's existing 44×44px interactive-sizing rule on both axes (PRD Cross-Cutting NFR, `DESIGN.md` component specs).

## Responsive & Platform

No new form-factor (Foundation) — this section covers only the two elements whose small-viewport behavior isn't self-evident from Foundation's inheritance statement.

| Element | Behavior |
| --- | --- |
| Map Tab day selector | Horizontally scrollable segmented control at any viewport width once day-segment count exceeds what fits — same scroll-thin behavior as the existing trip-detail tab bar (`page-client.tsx`'s `overflow-x-auto`), not a wrapping or collapsing list. |
| Day Route Strip thumbnail | Fixed compact size regardless of viewport — it's an affordance, not a detailed map (per FR-11); it never grows to fill available width on wider viewports. Detailed inspection always happens in the Map Tab, never by enlarging the thumbnail itself. |

## Inspiration & Anti-patterns

- **Rejected — Silent location inference from title text (FR-5):** An event titled "Narita Airport" stays a Freeform Item unless the user explicitly selects an Address. No geocoding-from-title, ever.
- **Rejected — Static map preview popover on the Address pill:** Removed from scope entirely; the pill's primary action is now "open External Maps," which supersedes the need for an inline preview.
- **Rejected — Adaptive learning from Per-Hop Overrides:** If/when Per-Hop Override ships (post-MVP), it never feeds a learning model — Packt doesn't infer future transit-mode choices from past overrides.
- **Parked, not designed here:** location-optimized accommodation search, advanced routing modes (bike/ferry/rideshare/mixed), in-app turn-by-turn navigation, Per-Hop Override (post-MVP per FR-9 — distinct from its adaptive-learning rejection above, which stands regardless of when Per-Hop Override itself ships). None of these get a surface in this pass.

## Key Flows

Named protagonists and climax beats mirror the PRD's UJ-1–UJ-4 verbatim (`prd-packt-2026-07-12/prd.md` §2.3), enriched here with the concrete UI this spine defines.

### Flow 1 — Maya gets to her next stop from the Now Card (UJ-1)

1. Maya is walking between planned stops in Tokyo, phone in hand. She opens Packt on trip day.
2. The Now Card's Next Event row shows the upcoming stop's name/time (unchanged, tap-to-itinerary) and, below it, a Distance/Time pill: "12 min walk."
3. Maya taps the pill.
4. **Climax:** Packt opens her phone's default maps app directly to the next event's address — one tap from the home surface, no itinerary tab, no search.
5. **Resolution:** She continues in her preferred maps app; Packt stays a clean trip-context surface in the background.
6. **Edge case:** If geolocation permission is missing, the same slot shows a geo-hint pill instead — "Enable location for directions" — because the next event already has a saved Address. Freeform next-events show neither pill. If directions can't be calculated but the event's Coordinates exist, the pill still renders and still opens External Maps — only the "12 min walk" text is omitted, never the tap target itself.

### Flow 2 — Jordan keeps a freeform day uncluttered (UJ-2)

1. Jordan is sketching a flexible travel day and adds "shopping" with no address.
2. The `PlaceRow` for "shopping" shows the same Location chip as today — "Add location," muted, no accent fill.
3. **Climax:** Nowhere on the row, the Now Card, or the Itinerary Day View does a location-shaped placeholder, warning, or distance pill appear for this item — it looks exactly like it would have before this feature shipped.
4. **Resolution:** Jordan can add a location later if she wants; Packt never asks again.

### Flow 3 — Priya catches an unrealistic schedule while planning (UJ-3)

1. Priya is planning a day with restaurant and museum stops, both with saved Addresses, tight timing.
2. The Itinerary Day View shows a Day Route Strip at the top of the day (≥2 Located Items) — distance, travel time, and the trip's transit mode.
3. Packt computes travel time between the two timed, adjacent Located Items and finds it exceeds the scheduled gap. A day-level Schedule Conflict badge appears ("1 tight connection today"); the museum row carries the row-level triangle-alert icon next to its Time chip.
4. **Climax:** Priya scans the day and sees exactly which row is flagged — without opening a modal or reading a paragraph of warning text.
5. **Resolution:** She adjusts the museum's start time, reorders the stops, or switches the Trip Transit Default in Getting Around — any of the three clears the conflict on next render.

### Flow 4 — Luis previews a whole trip geographically (UJ-4)

1. Luis wants to see where trip activities cluster before finalizing plans. He opens the Map Tab.
2. Every Located Item across the whole trip renders as an `accent-brand` pin, no per-day color coding — Freeform Items are simply absent, no warning about it.
3. Luis taps a day segment in the horizontally-scrollable day selector (same visual language as the trip-detail tab bar).
4. **Climax:** The map filters to that day's Located Items and route context only, letting him see concentration without losing the whole-trip option one tap away.
5. **Resolution:** He returns to "Whole Trip" scope, or — once Day Route Strip's deep-link ships — arrives here directly from a Day Route Strip thumbnail tap on a specific day.
6. **Edge case:** If the trip has zero Located Items at all, the Map Tab shows a neutral "No located stops yet" empty state — no prompt to add locations, since Luis opened this surface deliberately.

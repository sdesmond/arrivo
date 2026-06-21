---
name: Packt
status: final
sources:
  - "{planning_artifacts}/prds/prd-packt-2026-06-20/prd.md"
  - "{planning_artifacts}/prds/prd-packt-2026-06-20/addendum.md"
  - "{planning_artifacts}/brainstorming/brainstorming-session-2026-06-20-1725.md"
updated: 2026-06-21
---

# Packt — Offline Storage Experience Spine

> Scope: the offline-storage feature only (7 surfaces — offline search was descoped to a future initiative, see **PRD Deviations Carried Forward** below). Everything else in Packt — layout, nav, IA outside what's named here, typography, color palette — is unchanged and out of scope for this document. `DESIGN.md` (this pass) is the visual identity reference for the new icon-state vocabulary; this spine owns the behavior.

## Foundation

Responsive web (desktop + mobile breakpoints of the existing Packt shell — no new form factor). Base UI (`@base-ui/react`) component primitives styled in a shadcn-like layer — **Base UI, not Radix**, despite the visual resemblance. This pass does not introduce new UI-system dependencies; it adds state-driven behavior to existing Base UI-backed components (`Dialog`, `Tooltip`, `Checkbox`, `ToggleGroup`) and existing custom Packt components (`TripCover`, `DocRow` family, `Topbar`, `TripDetailCrumb`, `TripsMobileLayout`).

Single-user-multi-device is the only conflict source in v1 (no multi-collaborator UI exists yet); the sync/conflict mechanism is collaborator-ready per the PRD, but every flow in this document plays out as one person on two devices, not two different people.

## Information Architecture

No new top-level nav surfaces. This pass adds *state* to existing surfaces and one new full-takeover screen reached only by interrupt/click, not by nav:

| Surface | Reached from | Purpose |
| --- | --- | --- |
| TripCover pin icon | Trips list cards, trip detail hero (existing surfaces, new icon) | Pin/unpin a trip for offline availability; shows pin/sync/failure state |
| Connectivity indicator | Trips list topbar (desktop), trip detail crumb, mobile Trips header (existing surfaces, new icon) | Surfaces offline state and conflict-needs-attention state; only visible when not in the default online/no-conflict state |
| Conflict review screen | Click on `CloudAlert` connectivity indicator, or "Resolve now" on the detection-time interrupt | Full takeover dialog — per-item Accept/Decline for every itinerary/document change in conflict |
| Doc upload queue state | Inline on existing `DocRow` (trip docs tab, event docs, reservation docs) | Shows queued/uploading/synced state for documents added offline — no separate screen |
| Smart Pin settings | Profile & Settings → Preferences tab (existing surface, new fields) | Global Smart Pin on/off, lead-time window, Wi-Fi-only restriction |

No new sidebar/nav entries. The conflict review screen is reachable only via the interrupt flow described in **Key Flows** — it does not appear in any persistent navigation.

## Voice and Tone

Microcopy for offline-state surfaces. Brand voice lives in `DESIGN.md.Brand & Style` (no change this pass).

| Do | Don't |
| --- | --- |
| "Will upload when back online." | "Upload pending — error state." (a queued upload isn't an error) |
| "Not enough storage to pin this trip." | "Storage quota exceeded. Error code 507." |
| "Trip changed while offline." | "Sync conflict detected on entity reconciliation." |
| Attribution always names a slot — "You, on another device" in v1 (no other collaborator source exists yet) | Inventing a generic "Someone else" when the actual source is always the same user |
| Neutral, wait-not-alarm tone for anything covered by FR13's rollback guarantee (no data at risk) | Alarming language for retryable failures — reserve urgency for the conflict-review interrupt, which is the one place data-loss risk is real |

## Component Patterns

Behavioral. Visual specs live in `DESIGN.md.Components`.

| Component | Use | Behavioral rules |
| --- | --- | --- |
| TripCover pin icon | Trips list, trip detail hero | Click is a direct toggle: not-pinned → starts download immediately, no confirm step (OQ2 closed — no pre-pin size warning). Pinned → unpins, with confirm only if unpinning would evict already-cached data. No settings panel behind this click; Smart Pin config lives only in Preferences. |
| Connectivity indicator | Trips topbar, trip detail crumb, mobile Trips header | Display/toggle-only — never gates a settings panel. Hidden by default (online, no conflict). Becomes clickable only in the `CloudAlert` (conflict) state, opening the conflict review screen. Never shows a passive "syncing" interim state — ordinary reconnect-and-push is fully silent (Journey 1). |
| Conflict review screen | Triggered by detection-time interrupt or by clicking `CloudAlert` | Visual reference: [`mockups/conflict-review-screen.html`](mockups/conflict-review-screen.html) (spine wins on conflict). Full takeover dialog. Not dismissable by outside click or Escape — must be resolved to close. Every row gets independent Accept/Decline except true same-item-edited-both-sides conflicts, which render as two mutually exclusive competing entries (accepting one auto-declines its pair). Resolution is per-item; no batch accept-all/discard-all action exists anywhere in this screen. |
| DocRow sync indicator | Trip docs tab, event docs, reservation docs | Same `Tooltip`/`TooltipTrigger` slot as today's "Cached offline" indicator — evolves in place, not a new row element. A document added while offline appears immediately in the normal list (FR9 — offline is a full write surface, not read-only); its row shows `CloudOff` → progress ring → `CloudCheck` as it uploads. |
| Smart Pin settings fields | Preferences tab | Follows the existing `Field`/`ToggleGroup` pattern from `preferences-section.tsx` exactly: master on/off, lead-time window as ToggleGroup chips (1/3/7/14 days, default 3), Wi-Fi-only restriction as a `Checkbox` (this tab has no boolean Switch primitive — ToggleGroup is for discrete choices, Checkbox is for booleans, consistent with every other field on this tab). |

## State Patterns

| State | Surface | Treatment |
| --- | --- | --- |
| Online, no pending conflict (default) | Connectivity indicator (all three slots) | Hidden entirely. No persistent "online" badge — online is the default, not worth chrome. |
| Offline | Connectivity indicator | `WifiOff` renders, no click action, just a status signal. |
| Offline edit syncing silently on reconnect (no conflict) | Connectivity indicator | Zero visible change — icon goes straight from `WifiOff` to hidden. No toast, no modal, no passive "syncing" badge. This is the non-event that defines Journey 1's climax. |
| Conflict detected on reconnect | Connectivity indicator + interrupting toast/modal, fired together at detection | Icon becomes `CloudAlert` (clickable); simultaneously, an interrupting toast/modal appears with exactly two choices: "Resolve now" (opens conflict review screen) or dismiss. No guard for in-progress typing or open forms elsewhere — fires immediately regardless, per the accessibility/interrupt concern scan; conflict detection is rare in v1 and NFR1's data-integrity stakes justify the interruption. |
| Conflict deferred ("not now") | Connectivity indicator | `CloudAlert` persists as the sole re-entry route. No "finish later" exists once the review screen itself is open — only before opening it. |
| Conflict review screen open, rows remaining | Full takeover dialog | A close button is present but disabled/grayed, with a tooltip hint ("Resolve all changes to continue") — not absent entirely. No outside-click or Escape dismissal either. |
| Conflict review screen, all rows resolved | Full takeover dialog | Close button becomes enabled — the same button, no longer disabled, no separate "done" state to design. One-way in the sense that no row can be un-resolved once decided; the screen simply becomes closable. |
| TripCover: not pinned | TripCover icon | `Download`, idle. |
| TripCover: downloading/syncing | TripCover icon | Real-percentage progress ring — not indeterminate. |
| TripCover: pinned & synced | TripCover icon | `CloudCheck`. |
| TripCover: pin/sync failed (storage can't fit — OQ1) | TripCover icon + interrupting toast at failure time | `CloudAlert` persists until the user acts (does not silently revert to `Download`, so a missed toast doesn't lose the signal). Toast names the reason ("Not enough storage to pin this trip") with Retry / dismiss. Mid-sync storage failure during reconnect gets the same toast treatment, not the heavier conflict-interrupt modal — FR13's rollback guarantee means no data is at risk here, just a wait/retry. |
| DocRow: local-only, queued | DocRow sync indicator | `CloudOff`, neutral tooltip ("Will upload when back online") — not styled as an error. |
| DocRow: uploading | DocRow sync indicator | Real-percentage progress ring. |
| DocRow: synced | DocRow sync indicator | `CloudCheck`. |
| Smart Pin settings: dirty/saving/saved | Preferences tab | Inherits `preferences-section.tsx`'s existing dirty-tracking and single-Save-button pattern exactly — same "Saved" status text on success, same disabled-until-dirty Save button. No new state introduced for these fields; explicitly inherited, not just the field shapes. |

## Interaction Primitives

- **Direct toggle, no confirm-by-default.** TripCover pin/unpin is one click, no intermediate step — pinning never asks "are you sure," unpinning asks only when it would evict cached data.
- **Click-through re-entry.** Every persistent alert icon (`CloudAlert` in both its meanings) is itself the re-entry point back to the explanation/resolution it represents — no separate "view details" affordance needed.
- **Per-item resolution, never batch.** The conflict review screen has no select-all/accept-all/discard-all action at any point — every row decision is independent (except true conflicting-pair rows, which are mutually exclusive between exactly two options).
- **Interrupt only for genuine data-integrity risk.** Conflict detection is the only state in this feature that fires an interrupting toast/modal; storage failures (pin or mid-sync) use a non-blocking toast with Retry, since FR13 guarantees no partial/corrupted state regardless of outcome.
- **Tooltips are not the only state signal.** Every state-bearing icon pairs its hover tooltip with a persistent `aria-label` — interaction works the same for pointer and screen-reader/keyboard users.

## Accessibility Floor

Behavioral. Visual contrast lives in `DESIGN.md` (inherits existing Packt token contrast; no new colors introduced this pass).

- Every state-bearing icon across the cloud-icon family (TripCover's four states, connectivity indicator's three states, DocRow's three states) carries a persistent `aria-label` describing the state in words, in addition to the existing hover tooltip — applies uniformly, no surface exempt.
- Conflict-detection's interrupting toast/modal fires immediately on detection with no guard for in-progress typing or open forms elsewhere in the app — accepted tradeoff given v1's rarity (single-user-multi-device only) and NFR1's no-silent-data-loss stake.
- Icon-only controls (TripCover pin, connectivity indicator) remain icon + tooltip + `aria-label`, never relying on color/shape alone — consistent with the existing repo rule that icon buttons need a `title` attribute.
- The conflict review screen, as a full takeover dialog, must trap focus and be fully keyboard-operable for its Accept/Decline rows — it cannot be dismissed via Escape or outside click by design (data-integrity requirement, not an accessibility gap), so the in-dialog resolution controls are the only exit and must each be reachable by keyboard.

## Key Flows

### Journey 1 — "Seamless edit" happy path (Theo)

1. Theo arrives at his destination and goes out to activities.
2. He loses reception mid-activity and doesn't notice.
3. He views events and times offline, then makes a quick timing adjustment to an event — Packt is a full write surface offline, so this works exactly like it would online.
4. He returns to his hotel and reconnects to Wi-Fi.
5. **Climax — the non-event:** the trip silently syncs to the server. No toast, no modal, no visible indication the edit ever happened offline. The nav indicator (connectivity indicator) simply clears from `WifiOff` to hidden. This is the bar for the no-conflict sync path.

### Journey 2 — "Conflict on reconnect" (Theo, same trip)

1. Theo edits an event for tomorrow while out and offline.
2. Meanwhile, another device of his (or, in a future multi-collaborator world, a collaborator) also changed the trip while he was offline.
3. He reconnects at the hotel.
4. He gets a notification that the trip changed while offline and needs attention — an interrupting toast/modal, not a passive badge, contrasting deliberately with Journey 1's silence.
5. He opens it and sees what changed and how it fits into his view of the trip — every changed item tagged Local vs. Online, with his own offline changes included in the same review, not treated specially.
6. **Climax:** he chooses to keep changes or discard them, per item — this notification + review screen is the first moment offline storage becomes visible to Theo at all in this entire feature.
7. He confirms his choices; the trip updates.

Attribution copy in this flow always names a collaborator slot; in v1 (no multi-collaborator UI yet) that slot always reads "You, on another device," since the only conflict source is the same user.

### Journey 3 — "Pin fails for storage" (Theo, OQ1)

A deliberately smaller, non-conflict flow — included separately from Journey 2 because the interaction is materially different: a toast with Retry, not a takeover dialog.

1. Theo taps the `Download` icon on a trip cover to pin it before a flight.
2. His device doesn't have enough free storage to fit the trip's documents.
3. **Climax:** the icon becomes `CloudAlert` and an interrupting toast names the reason — "Not enough storage to pin this trip" — with Retry / dismiss. No partial pin exists; FR13's rollback guarantee means nothing was kept from the failed attempt.
4. Theo frees up space and taps the persistent `CloudAlert` icon, which reopens the same explanation and Retry — he retries, and the flow rejoins Journey 1's normal not-pinned → downloading → pinned path.

## PRD Deviations Carried Forward

Three decisions in this UX pass intentionally diverge from the PRD/addendum as written. Logged here for the next PRD reconciliation pass — these are correct as designed, not errors to fix back:

1. **Document conflicts narrowed.** Addendum's "documents = review-merge" tier is narrowed: documents default to silent auto-merge (same as packing list), with exactly one exception — a document *deletion* conflict — which folds into the same itinerary conflict review screen as a tagged row, rather than getting its own diff/merge UI. Full diff/merge for documents was judged too costly to show meaningfully, and Packt already permits duplicate document names, which removes most of what would otherwise look like a naming conflict.
2. **Smart Pin narrowed to global-only.** Addendum states the Smart Pin toggle "lives in trip settings" (per-trip) and FR6 grants per-trip-or-global opt-out granularity. This pass implements one global Smart Pin configuration in Profile & Settings → Preferences only — no per-trip override surface exists.
3. **Offline search descoped entirely.** FR12 ("search pinned/offline trip content without network connectivity") is not designed in this pass. Current state: only document-name search works today, and the sidebar's `/search` nav item links to a route that was never built. Direction (not designed here): drop the dedicated `/search` nav item; build search into the trip list and travel history views directly as simple client-side filtering — treated as its own future feature, not a sub-surface of offline storage.

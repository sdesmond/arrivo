# Spine Pair Review — Packt (Offline Storage)

## Overall verdict

The spine pair is a clean, tightly-scoped contract for the offline-storage feature. Token completeness, component coverage, inheritance discipline, and shape fit are all strong; nothing was invented outside the decision log, and no decided surface was dropped. Two real gaps keep this from a clean sweep: the conflict review screen's per-row state machine is under-specified for a downstream implementer (no row-level visual/behavioral spec despite being the most complex new surface), and offline/error/permission-denied states for a few touched components are implied by prose but never enumerated as a state table the way TripCover/DocRow get.

## 1. Flow coverage — adequate

Sources name two journeys (Journey 1 "seamless edit," Journey 2 "conflict on reconnect") plus the OQ1/OQ2 resolutions and three PRD deviations. Both Journey 1 and Journey 2 appear in EXPERIENCE.md Key Flows with named protagonist (Theo), numbered steps, and an explicit climax beat. Journey 2 doubles as the failure/escalation path for Journey 1's silent case.

### Findings

- **medium** No Key Flow for the OQ1 failure path (storage-can't-fit during pin) — it's fully specified in State Patterns/Component Patterns rows but never walked as a numbered flow with a climax beat, unlike Journey 1/2 (EXPERIENCE.md "Key Flows" section; OQ1 content lives in DESIGN.md Components + decision log's OQ1 entry). _Fix:_ Add a short Journey 3 ("pin fails for storage") or explicitly fold it into Journey 2 as a sibling beat, since it's a materially different interaction (non-conflict, toast+retry, not a takeover dialog).
- **low** Smart Pin settings (lead-time window, Wi-Fi-only) has no flow at all — it's a settings-tab edit with no stated steps or success state ("saved" feedback, validation). (EXPERIENCE.md IA row + Component Patterns row only.) _Fix:_ Not necessarily required for a settings-tab edit this small — note as low since it's the thinnest of the 7 surfaces and likely fine to leave as a table-only spec.

## 2. Token completeness — strong

DESIGN.md frontmatter defines `trip-cover-pin-icon`, `connectivity-indicator`, `doc-row-sync-state` — every `{path.to.token}` style reference in prose (`{badge.warning}` appears as a note-style cross-reference, not a literal frontmatter path) resolves to an actual existing app token (`var(--accent-brand)`, `var(--fg-3)`, `var(--fg-4)`, Badge's `warning`/`destructive` Tailwind classes) rather than a fabricated one. Per the design-md-spec's "UI-system inheritance" pattern, referencing existing tokens by name instead of restating values is correct, and the amber values quoted in prose (`bg-amber-50 text-amber-700` / dark `bg-amber-950 text-amber-300`) were verified against `src/components/ui/badge.tsx` — exact match, not a paraphrase. No color token lacks a light/dark pair where one is asserted.

### Findings

(none — color tokens have hex/CSS-var backing throughout; no fabricated values)

## 3. Component coverage — strong

Every component named in EXPERIENCE.md (TripCover pin icon, Connectivity indicator, Conflict review screen, DocRow sync indicator, Smart Pin settings fields) has a matching row in both DESIGN.md.Components (visual) and EXPERIENCE.md.Component Patterns (behavioral) — real multi-sentence rules, not single words, in both directions.

### Findings

- **medium** Conflict review screen has a Component Pattern row (behavioral) but no DESIGN.md.Components entry at all — no visual spec (layout of the takeover dialog, row anatomy for Accept/Decline, how Local-vs-Online tags render visually, dialog sizing). It's the one new full-screen surface in this pass and the only component named in EXPERIENCE.md that doesn't resolve to a DESIGN.md row. (DESIGN.md "## Components" lists TripCover pin icon, Global connectivity indicator, DocRow sync-state indicator only; EXPERIENCE.md Component Patterns and IA both list "Conflict review screen.") _Fix:_ Add a DESIGN.md.Components subsection for the conflict review screen — even a thin one inheriting Dialog/Base UI defaults plus the Local/Online tag treatment — so a downstream consumer doesn't have to infer dialog visuals from behavior prose alone.

## 4. State coverage — adequate

Walking each IA surface: TripCover (4 states: not-pinned/syncing/pinned/failed) and DocRow (3 states: local-only/uploading/synced) are both fully enumerated with explicit state tables in both files. Connectivity indicator (3 states: online-hidden/offline/conflict) is enumerated. Conflict review screen states (open, per-row resolved/unresolved, mutually-exclusive-pair) are described in prose across Component Patterns + State Patterns but not as a discrete state table like the icon components get. Smart Pin settings has no state table (no error/saving/validation states named for the lead-time ToggleGroup or Wi-Fi-only Checkbox).

### Findings

- **medium** Conflict review screen has no explicit "all rows resolved, ready to close" vs. "rows remain, blocked" state distinction stated anywhere — decision log and EXPERIENCE.md both say "every item must be resolved before it closes" but never state what UI signals incompleteness (disabled close? no close button at all until all rows done? a counter?). (EXPERIENCE.md State Patterns table, "Conflict review screen open" row — single row covers the whole lifecycle.) _Fix:_ Add a row or two distinguishing "rows remaining" vs "all resolved" so a developer knows whether to gate a close affordance or simply omit one entirely.
- **low** Smart Pin settings fields have no error/validation state (e.g., can Wi-Fi-only + master-off combination be set simultaneously; is there a save-confirmation state). Likely fine given it follows an existing `preferences-section.tsx` pattern exactly, but the inheritance claim ("follows existing pattern exactly") is doing the work that a state table would otherwise do explicitly. No fix needed if the existing pattern's state behavior is genuinely identical — flagging only because it's not stated as inherited-for-states explicitly, only inherited-for-fields.

## 5. Visual reference coverage — n/a (expected at this stage)

`imports/` exists and is empty; `mockups/` and `wireframes/` do not exist yet. Per this UX pass's stage (pre-Finalize, key-screen mocks render in a later step), this is expected, not a gap. No orphan references or unspecific links found in either spine.

## Mechanical notes

- Glossary/naming: component names are identical verbatim across DESIGN.md frontmatter keys, DESIGN.md prose headers, and EXPERIENCE.md tables — `TripCover pin icon`, `Connectivity indicator` / `connectivity-indicator`, `DocRow sync-state indicator` / `doc-row-sync-state` resolve consistently (kebab-case frontmatter key vs. Title Case prose heading is the spec's normal convention, not an inconsistency).
- `sources:` frontmatter in EXPERIENCE.md resolves to three real, existing files (prd.md, addendum.md, brainstorming session) — verified all three exist at the stated paths.
- FR/NFR citations (FR5, FR6, FR9, FR11, FR12, FR13, NFR1) were spot-checked against `prd.md` and `addendum.md` — all accurate, no misquotes, no fabricated requirement numbers.
- All three "PRD Deviations Carried Forward" entries (document conflicts narrowed, Smart Pin global-only, offline search descoped) are corroborated by `.decision-log.md` entries dated 2026-06-21 — none invented, none missing from the log.
- DESIGN.md's omission of Typography/Layout & Spacing/Elevation & Depth sections is correct per the decision log's explicit "everything else inherits the existing Packt app shell" scope — not flagged as shape-fit miss.
- No Mermaid diagrams present in either file — none expected for this content shape.
- No broken cross-references found in either file.

# Spine Pair Review — Packt Location-Aware Itinerary

## Overall verdict

Strong contract overall: every UJ-1–UJ-4 and every FR traces cleanly into a Key Flow, Component Pattern, or State row, and every token reference in DESIGN.md resolves — either to frontmatter or to a verified existing `globals.css` custom property, per the stated inheritance discipline. A downstream consumer (architecture or story-dev) can source-extract and implement without guessing on the vast majority of decisions. The gaps are second-order: two components (Map pin, Address pill edit affordance) have DESIGN visual specs but only folded/scattered EXPERIENCE.md behavior rather than a dedicated row; the State Patterns table has no row for the Getting Around IA surface or for async loading/pending states on the distance and route calculations; and one component is named two different ways across the pair (Next Event distance pill / Distance/Time pill). None of these block implementation, but they're worth a cleanup pass before this leaves `draft` status.

## 1. Flow coverage — strong

Extracted UJ-1–UJ-4 from PRD §2.3 and matched against EXPERIENCE.md Key Flows.

### Findings

- **low** Flow 1's numbered steps cover the geo-hint edge case (step 6) but not the "directions calc fails, pill still opens maps" edge case from FR-3's assumption — that path only appears in the State Patterns table, not inside the flow narrative (`EXPERIENCE.md` Flow 1). _Fix:_ optional one-line addition to Flow 1's edge case bullet; State Patterns already covers it so this is cosmetic, not a contract gap.

## 2. Token completeness — strong

Extracted every frontmatter key and every `{path.to.token}` reference in DESIGN.md; cross-checked against `src/app/globals.css`. All of `accent-brand`, `accent-soft`, `accent-ink`, `surface-2`, `surface-3`, `fg-3`, `fg-4`, `warning`, `warning-soft`, `warning-ink`, `line`, and the `--radius-md`/`--radius-lg` scale exist in `globals.css` exactly as referenced. `IconSize.actionChip` (12px) exists verbatim in `src/lib/size-tokens.ts`. `colors: {}` / `typography: {}` / `rounded: {}` / `spacing: {}` are empty by design, matching the stated wholesale-inheritance discipline and the June 2026 budget-feature precedent — not a gap per this run's framing.

### Findings

- **low** `{colors.accent-soft}`-style references in the `components` frontmatter technically point into an empty `colors: {}` map rather than resolving within this document's own frontmatter — correct only because the prose explains the external inheritance. _Fix:_ a one-line YAML comment above `colors: {}` (e.g. `# empty — component refs below resolve against src/app/globals.css token names`) would make this mechanically unambiguous for a parser, not just a human reader.

## 3. Component coverage — adequate

Extracted every component name from DESIGN.md.Components (9 entries) and EXPERIENCE.md.Component Patterns (10 rows) and matched them.

### Findings

- **medium** Same component is named two different ways: DESIGN.md's heading and frontmatter key are "Next Event distance pill" / `next-event-distance-pill`, but DESIGN.md's own prose (Colors, Do's and Don'ts) and EXPERIENCE.md's Component Patterns table both call it "Distance/Time pill" (`DESIGN.md:14-21,86,112`; `EXPERIENCE.md:52`). _Fix:_ pick one name (glossary already defines "Distance/Time Line" in the PRD — "Distance/Time pill" is closer) and use it everywhere, including the DESIGN.md heading and frontmatter key.
- **medium** "Map pin" has a full DESIGN.md visual spec (`DESIGN.md:72-74,103-104`) but no dedicated EXPERIENCE.md Component Patterns row — its behavior is scattered across the Map Tab row, Accessibility Floor, and Flow 4 rather than stated once with real rules (tap/focus behavior, what happens on pin overlap, whether pins are clickable to open the event). _Fix:_ add a "Map pin" row to Component Patterns, even if it's short — at minimum: what a pin tap does, if anything.
- **low** "Address pill edit affordance" has its own DESIGN.md row (`DESIGN.md:30-36,98`) but no dedicated EXPERIENCE.md row — its behavior is folded into the "Address pill (state-flip)" row and Interaction Primitives. This is adequately covered (unlike Map pin, the tap rule is explicit), so this is a naming-granularity note, not a real gap.

## 4. State coverage — adequate

Walked all five IA surfaces (Now Card, Itinerary Day View, Trip Edit "Getting Around", Address surfaces, Map Tab) against EXPERIENCE.md's State Patterns table (13 rows).

### Findings

- **medium** Trip Edit "Getting Around" — one of the five IA surfaces — has zero rows in State Patterns. FR-7 ("Existing trips display a valid Trip Transit Default without forcing users through edit flow") implies at least two distinct states (seeded/deterministic default vs. explicit trip-level override) that aren't captured anywhere in the table (`EXPERIENCE.md:62-78`). _Fix:_ add a State Patterns row (or two) for Getting Around covering "no explicit override — shows deterministic default" and "explicit override set."
- **medium** No row anywhere defines the pending/loading treatment while distance or route data is being fetched, for any of Now Card, Day Route Strip, or Map Tab. The table covers success, permission-missing, calc-failure, and freeform-absence, but not the async gap in between — which matters given the PRD's Performance NFR ("Now Card location/directions lookup must not block initial page rendering"). _Fix:_ add a "calculating" state row per surface (e.g., pill/strip renders in a neutral/skeleton state until the async result resolves).

## 5. Visual reference coverage — pending, not broken

`mockups/` does not exist yet under `ux-packt-2026-07-12/` (confirmed via directory listing — only `.decision-log.md`, `DESIGN.md`, `EXPERIENCE.md`, `review-accessibility.md` are present). EXPERIENCE.md's IA section names three pending files (`mockups/now-card-next-event.html`, `mockups/day-route-strip.html`, `mockups/map-tab.html`) in a single composition-reference line immediately below the IA table, with "Spine wins on conflict" stated once — this matches the Drift example's shape exactly. DESIGN.md correctly does not reference mockups inline (consistent with both reference examples, where only EXPERIENCE.md's IA section carries that link).

### Findings

None — correctly deferred to a later Finalize step per the decision log, and the reference format matches the canonical shape.

## 6. Bloat & overspecification — strong

No restated personas, FRs, or scope sections — both files cite FR/UJ IDs rather than re-explaining them. Do's/Don'ts tables used instead of prose where a table fits. DESIGN.md carries editorial voice appropriately (e.g. "if the brand can't justify a new token, this feature doesn't add one"); EXPERIENCE.md stays behavioral throughout with no decorative narrative — checked every prose paragraph and found no violations.

### Findings

None.

## 7. Inheritance discipline — adequate

sources frontmatter resolves in both files (both PRD and addendum exist at the cited paths). UJ names are verbatim matches to PRD §2.3 titles in all four Key Flows. No Glossary section exists in either spine (correctly omitted — not a required section for a components-only DESIGN.md, and PRD §3 remains the single source of the term list). EXPERIENCE.md carries no `{path.to.token}` references at all (correct separation — "Visual specs live in DESIGN.md" is stated explicitly wherever visual detail would otherwise creep in), so there is nothing to dangle.

### Findings

- **low** Casing inconsistency on a PRD glossary term: DESIGN.md's component headings read "Schedule conflict row icon" / "Schedule conflict day badge" (lowercase "conflict"), while the PRD glossary, decision log, and EXPERIENCE.md's own table consistently capitalize "Schedule Conflict" as a proper term (`DESIGN.md:37,43` vs `EXPERIENCE.md:56-57`, PRD §3). _Fix:_ capitalize to match the glossary term everywhere it's used as the proper noun.
- **low** "Per-Hop Override" is a defined PRD glossary term and FR-9 names it as a post-MVP extension, but EXPERIENCE.md's Inspiration & Anti-patterns section only mentions it obliquely inside the "Rejected — Adaptive learning from Per-Hop Overrides" bullet (`EXPERIENCE.md:104`) — the feature itself is never listed alongside the other explicitly "Parked, not designed here" items (`EXPERIENCE.md:105`). _Fix:_ add "Per-Hop Override (post-MVP, not designed here)" to the Parked bullet for clarity, distinct from the adaptive-learning rejection.
- Cross-reference: the "Next Event distance pill" / "Distance/Time pill" naming split (finding under §3) is also an inheritance-discipline issue — component names are not identical across all sections of the pair.

## 8. Shape fit — strong

DESIGN.md present sections (Brand & Style → Colors → Shapes → Components → Do's and Don'ts) preserve canonical relative order with Typography, Layout & Spacing, and Elevation & Depth cleanly omitted — defensible under the stated wholesale-inheritance discipline and the June 2026 budget-feature precedent this run explicitly follows. EXPERIENCE.md has all eight required defaults (Foundation, IA, Voice and Tone, Component Patterns, State Patterns, Interaction Primitives, Accessibility Floor, Key Flows) plus Inspiration & Anti-patterns, correctly triggered by the decision log's three rejected ideas and earning its place with concrete, sourced rejections rather than generic advice.

### Findings

- **low** Responsive & Platform section is omitted. Foundation states "no new form-factor," which makes the omission defensible, but the Map Tab day selector ("horizontally scrollable when the trip has many days") and Day Route Strip thumbnail sizing are exactly the kind of small-viewport behavior that section exists to pin down. _Fix:_ optional — a short Responsive & Platform section covering just these two elements would remove any ambiguity for a mobile implementer, but this is not blocking given Foundation's explicit statement.

## Mechanical notes

- Both files' frontmatter (`name`, `status: draft`, `sources`, `updated: 2026-07-12`) are internally consistent and dated identically.
- No Mermaid diagrams in either file — nothing to validate there.
- Every codebase claim spot-checked resolved correctly: `now-card.tsx:196-197`'s `"— · — km"` placeholder exists verbatim as described; `place-row-action-bar.tsx`'s Location chip currently always opens the edit dialog (matches the decision log's grounding note); `TabStatusIcon` and `StatusBadge` (`src/components/packt/tab-status-icon.tsx`, `status-badge.tsx`) match the icon+`aria-hidden`+`sr-only`-text and icon+soft-bg/ink patterns DESIGN.md claims to mirror.
- A `review-accessibility.md` already exists in this same output folder from a prior pass — not in conflict with this review, just noting it's present alongside the new `review-rubric.md`.
- No broken cross-refs found inside either file (all internal section pointers — "see EXPERIENCE.md Component Patterns," "Visual specs live in DESIGN.md.Components" — point to sections that exist).

# Spine Pair Review — Packt (Reservations & Trip Logistics)

## Overall verdict

This is a strong, disciplined spine pair: every UJ has a named flow with climax and failure path, the token set is small and entirely inherited (no orphaned new tokens), and the reuse-first posture (accordion = day-card, drawer = trip-edit-sheet, Linked badge = muted Badge) is stated once and held consistently. The only material defect is a single broken cross-reference (`{DESIGN.md.Components.linked-event-indicator}` — the actual token is `linked-event-badge`), plus a few minor gaps in `.working/` reference framing and one state-coverage thinness (FR-9 banner dismiss persistence left as an open assumption with no resolution path). Nothing here blocks a downstream consumer, but the broken reference and the dismiss-state ambiguity should be fixed before promotion.

## 1. Flow coverage — strong

Checked EXPERIENCE.md `## Key Flows` against PRD §2.2 UJ-1–UJ-4.

- UJ-1 → Flow 1 (Ashley adds her first reservation): named protagonist (Ashley), 7 numbered steps, explicit **Climax** and **Resolution**. No dedicated failure path, but FR-1/FR-8 edge cases (date outside trip range) are folded into the climax step.
- UJ-2 → Flow 2 (Ashley checks a reservation mid-trip): named protagonist, numbered steps including three labeled branches (Path A/B/C), **Climax** and **Resolution** present.
- UJ-3 → Flow 3 (cover management): named protagonist, numbered steps with three labeled branches (Edit/Remove/Info), **Climax** and **Resolution** present.
- UJ-4 → Flow 4 (edit reservation, Itinerary auto-updates): named protagonist, numbered steps with two labeled starting points, **Climax** and **Resolution** present.

### Findings

- **low** None of the four flows include an explicit "Failure:" beat in the style of the calibration examples (Drift/Quill both include a `Failure: ...` line after the flow). Flow 1's "if either date fell outside the trip's prior range..." (EXPERIENCE.md line 112) is the closest analog but is folded into the climax rather than called out as a failure/edge branch. _Fix:_ optional — add a one-line "Failure:" note per flow (e.g., Flow 1: required `endTime` validation blocks Save for Lodging; Flow 3: dialog/network failure on cover swap) for parity with the calibration shape, though the PRD itself doesn't mandate this.

## 2. Token completeness — strong

Extracted every frontmatter token (`colors`, `typography`, `rounded`, `spacing`, `components`) and every `{path.to.token}` reference in DESIGN.md and EXPERIENCE.md prose.

- All 24 color tokens (12 light + 12 dark pairs) are restated from `globals.css` with hex values — no missing hex, light/dark pairs all present.
- All 6 typography roles (`card-title`, `card-sub`, `drawer-title`, `field-label`, `mono-confirmation`, plus the inline-defined "drawer subtitle") resolve — 4 use `note:` (platform/inherited convention, permitted per spec), 2 (`drawer-title`, `field-label`) are described in prose with literal sizes consistent with the `note` pattern.
- `rounded` (sm/md/lg/xl/card/full) and `spacing` (gutter/card-gap/row-padding-y/row-padding-x) all referenced and consistent.
- All 9 `components.*` entries (`reservation-accordion`, `reservation-type-badge`, `reservation-row`, `linked-event-badge`, `add-reservation-button`, `fr9-cta-banner`, `cover-overflow-menu`) resolve their `{path.to.token}` references to defined colors/typography/rounded tokens.

### Findings

- **medium** `reservation-type-badge` (DESIGN.md frontmatter line 74–77) is defined in the `components` map but never referenced or used anywhere in the body prose, Components section, or EXPERIENCE.md. It's unclear what UI element this corresponds to — possibly the accordion header's count badge (which DESIGN.md line 198 describes inline with literal values, not via this token). _Fix:_ either wire `{components.reservation-type-badge}` into the accordion-header count-badge description (DESIGN.md line 198) or remove the token if it's dead.
- **low** `drawer-title` and `drawer-subtitle` typography roles are referenced via `{typography.drawer-title}` / `{typography.drawer-subtitle}` (DESIGN.md lines 225, 227) but are not present as named entries in the `typography` frontmatter block — they're only described in prose under "## Typography" (lines 141–142). The `{path.to.token}` syntax implies frontmatter resolution; these two don't have frontmatter keys. _Fix:_ either add `drawer-title`/`drawer-subtitle` as frontmatter typography entries (with `note:` values pointing at the prose-described sizes) or change the in-body references to plain prose pointers ("per Typography above") to avoid implying a frontmatter lookup that doesn't exist.

## 3. Component coverage — strong

Extracted every component name from both files: `Add Reservation Button`/type-picker `DropdownMenu`, Reservation Type accordion section, Reservation row, inline document row/upload affordance, Add/Edit Reservation `Drawer`, Linked Event row, FR-9 CTA banner, Reservations tab empty state (`Empty`/...), Cover Overflow Menu, `DocKindBadge`, delete-confirmation dialog family.

- All of these have a DESIGN.md `## Components` entry (visual spec) AND an EXPERIENCE.md `## Component Patterns` row (behavioral spec) with real, non-trivial rules — confirmed for: type-picker DropdownMenu, accordion section, Reservation row, Add/Edit Drawer, inline document attachment, Linked Event row, FR-9 banner, Cover Overflow Menu, Reservations tab empty state.

### Findings

- **low** `DocKindBadge` and the `delete-*-alert-dialog.tsx` family are named as reused components in both files (DESIGN.md line 214/232, EXPERIENCE.md line 57/59/89) but have no row of their own in either Components table — they're folded into the "Reservation row" / "inline document attachment" rows as sub-references. This is consistent with the "reuse-first, don't restate" posture and the components are pre-existing (not new), so this is not a miss, just worth flagging as intentional.

## 4. State coverage — adequate

IA surfaces (EXPERIENCE.md `## Information Architecture`): Reservations tab, Add/Edit Reservation drawer, Itinerary tab (Linked Event rows), FR-9 banner, Now Card, Cover Overflow Menu. Cross-checked against `## State Patterns` (10 rows).

- **Reservations tab**: empty (0 reservations) ✓, collapsed/expanded accordion ✓, populated ✓. No explicit cold-load/loading-skeleton state.
- **Itinerary tab**: 0-reservations banner ✓, ≥1-reservation banner copy switch ✓, date-range extension (FR-8) ✓, deleted-reservation cleanup ✓, edit-propagation ✓.
- **Add/Edit drawer**: required/optional `endTime` per type ✓ (via Component Patterns row, not State Patterns). No explicit drawer error/validation state (e.g., Save blocked when required `endTime` missing) beyond the one-line mention in Component Patterns row 58 ("blocks Save").
- **Now Card**: Linked Event surfaced state ✓.
- **Cover Overflow Menu**: menu item set per `CoverType` ✓ (Component Patterns row 62, not State Patterns table, but covered).

### Findings

- **medium** No cold-load / loading-skeleton state is specified for the Reservations tab (first paint while Reservations are fetched). The calibration examples (Drift, Quill) both specify a cold-load treatment (`Skeleton` rows / cached prompt). Packt's existing tabs (Itinerary, Documents) presumably have an established loading pattern this tab should inherit, but that inheritance isn't stated. _Fix:_ add a one-line State Patterns row: "Reservations tab, cold load → [existing skeleton/loading pattern from Itinerary/Documents], resolves on data" — or explicitly note "no skeleton needed, data loads with trip" if that's the actual architecture.
- **low** FR-9 banner dismiss persistence is flagged as an open `[ASSUMPTION]` in both EXPERIENCE.md (line 61) and the decision log (line 22) but carried forward unresolved into the final spine — "session-only vs. cross-session" is left undefined. Per the rubric, a load-bearing decision left uncommitted is a miss; however this is explicitly flagged rather than silently absent, which is the better failure mode. _Fix:_ if implementation needs this resolved before story-dev (likely, since it affects whether a DB field or local state is needed), resolve it now; otherwise an architecture/story-dev consumer will have to make this call unassisted.
- **low** No explicit "error/save-failed" state for the Add/Edit Reservation drawer (e.g., network failure on Save) — Drift's Flow 1 calibration example has an explicit Toast-based failure treatment for an analogous save action. Given Packt's drawer reuses `trip-edit-sheet.tsx`'s footer pattern (which presumably has its own established error handling), this is likely covered by inheritance, but it's not stated.

## 5. Visual reference coverage — strong

All 5 files in `.working/` are referenced:

- `key-reservations-tab.html` → DESIGN.md "Add Reservation entry point (FR-1)" (line 191), "Reservation Type accordion section (FR-2)" (line 205), "Reservation row" (line 219); EXPERIENCE.md IA composition-reference list (line 31).
- `key-add-reservation-drawer.html` → DESIGN.md "Add/Edit Reservation drawer" (line 237); EXPERIENCE.md line 31.
- `key-itinerary-linked-event.html` → DESIGN.md "Linked Event indicator" (line 248); EXPERIENCE.md line 31.
- `key-cover-overflow-menu.html` → DESIGN.md "Cover Overflow Menu (FR-12)" (line 279); EXPERIENCE.md line 31.
- `key-itinerary-empty-cta-banner.html` → DESIGN.md "FR-9 Itinerary empty-state CTA banner" (line 260); EXPERIENCE.md line 31.

"Spines win on conflict" is stated once, in EXPERIENCE.md line 31 ("Spine wins on conflict").

### Findings

- **low** EXPERIENCE.md line 31 explicitly flags the `.working/` → `mockups/` promotion gap ("*(Note: these links point at `.working/` — update to `mockups/` if/when promoted at Finalize.)*"), but DESIGN.md's five inline references (lines 191, 205, 219, 237, 248, 260, 279) all hardcode `.working/` paths with no equivalent caveat. If promotion happens, DESIGN.md's references would silently break while EXPERIENCE.md's caveat note (in one place) covers both files only by implication. _Fix:_ either add the same promotion caveat to DESIGN.md's reference list, or make EXPERIENCE.md's caveat explicitly cover "all `.working/` references in both DESIGN.md and EXPERIENCE.md."
- **low** Each DESIGN.md reference names what it illustrates reasonably specifically (e.g., "two Lodging rows — one with an attached PDF, one with the empty-upload affordance" for `key-reservations-tab.html` at line 219), satisfying "names what it illustrates." No orphans, no unspecific references found.

## 6. Bloat & overspecification — strong

- No pixel-level overspecification beyond what tokens don't already cover — DESIGN.md's literal pixel values (e.g., "`14px 16px` padding", "`68px` min-width" for anchor labels) are feature-specific deltas not covered by any existing token, consistent with "DESIGN.md specifies only the deltas" guidance.
- No restatement of PRD personas, FRs, or scope narrative — both files stay in spec/behavior register; PRD content is referenced (`FR-1`, `UJ-1`, etc.) rather than restated.
- Tables used appropriately (IA, Voice and Tone, Component Patterns, State Patterns, Do's and Don'ts) rather than prose-as-table.
- The "Anti-pattern called out explicitly" subsection under DESIGN.md Colors (lines 128–130) is decision-tied (documents the superseded `--linked-*` token rejection) — not decorative narrative; it's load-bearing because it prevents regression to a rejected design.

### Findings

- None.

## 7. Inheritance discipline — adequate

- `sources` frontmatter in both files resolves to `_bmad-output/prds/prd-packt-2026-06-12/prd.md`, which exists and matches (title "Reservations & Trip Logistics", status final).
- UJ names (UJ-1–UJ-4) and FR numbers (FR-1–FR-13) used verbatim from the PRD throughout both spines.
- Glossary terms (Reservation, Reservation Type, Linked Event, Reservations Tab, Document, Now Card, Cover, Cover Overflow Menu) are used consistently and identically across DESIGN.md, EXPERIENCE.md, and the PRD — anchor-label terminology ("Check-in/Check-out", "Pickup/Return", "Departure/Arrival", "Departure/Return") matches the PRD Glossary exactly in both spines.
- Component names are consistent across DESIGN.md Components and EXPERIENCE.md Component Patterns (Reservation Type accordion section, Reservation row, Add/Edit Reservation drawer, Linked Event row, FR-9 CTA banner, Cover Overflow Menu, Reservations tab empty state) — all match by name.

### Findings

- **high** EXPERIENCE.md line 96 references `{DESIGN.md.Components.linked-event-indicator}`, but DESIGN.md's `components` frontmatter (lines 66–110) has no `linked-event-indicator` key — only `linked-event-badge` (line 84). This is a broken cross-reference: a downstream consumer following `{path.to.token}` syntax to resolve this reference will fail to find it. _Fix:_ change `{DESIGN.md.Components.linked-event-indicator}` to `{DESIGN.md.Components.linked-event-badge}` (or rename the DESIGN.md token to `linked-event-indicator` if that name better captures the icon+badge pair described in the Accessibility Floor section — but pick one and make them match).

## 8. Shape fit — strong

- DESIGN.md section order matches the canonical order exactly: Brand & Style → Colors → Typography → Layout & Spacing → Elevation & Depth → Shapes → Components → Do's and Don'ts. No sections out of order; none of the omittable sections are missing in a way that breaks the contract.
- EXPERIENCE.md required-default sections all present: Foundation, Information Architecture, Voice and Tone, Component Patterns, State Patterns, Interaction Primitives, Accessibility Floor, Key Flows. "Responsive & Platform" and "Inspiration & Anti-patterns" (present in both calibration examples as required-when-applicable / earns-its-place sections) are omitted here — defensible, since this is an *additive delta* to an existing responsive shell (Foundation explicitly states "no new navigation pattern, no new shell," making a standalone Responsive & Platform section redundant) and there's no new inspiration/anti-pattern narrative beyond the one anti-pattern callout already captured in DESIGN.md's Colors section.
- No invented sections in either file — "Anti-pattern called out explicitly" is a subsection within DESIGN.md Colors, not a new top-level section, so it doesn't violate order-locking.

### Findings

- None.

## Mechanical notes

- **Broken cross-reference** (critical for inheritance, see Finding 7): `{DESIGN.md.Components.linked-event-indicator}` in EXPERIENCE.md line 96 does not resolve — only `linked-event-badge` exists in DESIGN.md frontmatter.
- **Frontmatter completeness**: DESIGN.md frontmatter is complete and valid YAML — `name`, `description`, `colors` (24 entries), `typography` (6 entries, mixing literal values and `note:` per spec), `rounded` (6 entries), `spacing` (4 entries), `components` (7 entries). EXPERIENCE.md frontmatter has `name`, `status`, `sources`, `updated` (DESIGN.md) / `status_design_pairing` (EXPERIENCE.md) — both valid against the calibration shape, though EXPERIENCE.md's `status_design_pairing: DESIGN.md` field is non-standard (not seen in either calibration example, which use `sources` only) — likely harmless but worth normalizing if a schema validator is ever run against this frontmatter.
- **No Mermaid diagrams** present in either file — N/A for syntax checking.
- **Two typography tokens referenced without frontmatter backing** (`drawer-title`, `drawer-subtitle` — see Finding 2, medium/low) — not "broken" in the sense of resolving to nothing (the prose defines them), but they don't follow the `{path.to.token}` → frontmatter-YAML-path convention used by every other reference in the file.
- **Naming consistency**: "Reservation Type" vs "type" vs "`type`" used consistently per context (prose vs. field-name) across both files and the PRD Glossary — no drift found.

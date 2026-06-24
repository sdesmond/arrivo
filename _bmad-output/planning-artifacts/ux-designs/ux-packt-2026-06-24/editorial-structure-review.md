# Structural Editorial Review — DESIGN.md & EXPERIENCE.md (ux-packt-2026-06-24)

## Document Summary

- **Purpose:** Visual/behavioral spine for Budget Tab + Travel Retrospective feature, handed to implementers.
- **Audience:** Developers/AI agents implementing the feature; secondarily future editors of this spine.
- **Reader type:** humans (spine docs are read by engineers, with occasional LLM consumption — treated as humans per existing doc conventions).
- **Structure model:** Reference/Database (DESIGN.md: token/component lookup) + Reference/Database with Linear flow appendix (EXPERIENCE.md: IA table, component patterns, state patterns, then Key Flows narrative).
- **Current length:** DESIGN.md ~120 lines / ~1,250 words across 3 sections (front-matter, Colors, Components, Do's/Don'ts). EXPERIENCE.md ~151 lines / ~2,400 words across 9 sections.

## Edit-History Specific Checks (requested)

### 1. Leftover spend-over-time / bar-chart-time content

**Result: CLEAN.** No occurrences of "spend-over-time," "bar chart," "trend," "time-series," or "FR-14" in either DESIGN.md or EXPERIENCE.md. Chart counts are consistent: DESIGN.md `chart-card` doc says "the 3 Spending-view charts" (line 106); EXPERIENCE.md Component Patterns lists exactly 3 donut rows (category, budget adherence, destination) and Flow 3 step 2 says "three chart cards." FR-13 references (lines 64, 86) refer to the date-range-inclusion rule, unrelated to the removed chart — not a stale reference.

### 2. Cross-file consistency (DESIGN.md component names vs. EXPERIENCE.md usages)

**Result: CONSISTENT.** Spot-checked: `budget-progress-bar`, `status-badge`, `tab-status-icon`, `category-tile`, `field-row`, `currency-picker-row`, `chart-card`, `headline-figure`, `donut-chart`, `category-donut-palette`, `budget-adherence-donut` all appear in both files with matching names and matching semantics (e.g., budget-adherence under/on/over → accent-brand/warning/destructive matches in both). No destination-donut token is defined in DESIGN.md's `components:` front-matter or `## Components` body, but EXPERIENCE.md's Component Patterns table (line 68) references "`donut-chart` + per-country segments" generically rather than naming a `destination-donut-palette` token — this is a defensible omission (no new visual token needed beyond the shared `donut-chart` base + `fg-4` for Unknown) but worth a QUESTION below since the other two donuts (category, budget-adherence) each got a dedicated component entry.

## Recommendations

### 1. QUESTION - Missing `destination-donut` component entry in DESIGN.md

**Rationale:** DESIGN.md gives `category-donut-palette` and `budget-adherence-donut` each a dedicated front-matter + body entry, but the destination donut (EXPERIENCE.md line 68) has no equivalent — it relies entirely on the shared `donut-chart` base plus an inline mention of `fg-4` for "Unknown" (DESIGN.md line 108, folded into the `donut-chart` entry's prose rather than its own component). Confirm this is intentional (no new visual surface beyond per-country hue assignment, which is implementation detail) rather than an artifact of the chart removal/re-edit leaving an asymmetry between the three donuts.
**Impact:** 0 words to fix if intentional; ~15-20 words to add a one-line `destination-donut-palette` entry if not.

### 2. MOVE/QUESTION - Spending view mockup reference missing from composition-reference list

**Rationale:** EXPERIENCE.md line 31 ("Composition reference") lists `budget-tab.html`, `misc-expense-modal.html`, `currency-change-dialog.html` but omits `key-spending-view.html`, which exists in the same artifact folder's `.working/` directory and corresponds to the Spending view described in Component Patterns (lines 64-68) and Flow 3. Every other surface in the Information Architecture table has a linked mockup; Spending view does not. Likely an oversight from the chart-add/chart-remove churn rather than a deliberate omission (the `.working/` location itself suggests it's a draft/scratch artifact not yet promoted to the spine's reference list).
**Impact:** ~10 words to add the reference, or 0 if `.working/` artifacts are deliberately excluded from composition references (confirm convention).

### 3. CONDENSE - Component Patterns table row for "Tab status icon" is the longest row in either table

**Rationale:** EXPERIENCE.md line 55 packs DOM-order ARIA mechanics ("icon precedes the hidden text in DOM order — label reads after the tab name, not before it") into the same cell as the behavioral description. This level of implementation detail (exact DOM ordering) duplicates/anticipates content that belongs in the Accessibility Floor section, which already has a dedicated row for the same icon (line 109: "see the Tab status icon row in Component Patterns for the exact DOM/ARIA shape"). The two sections currently cross-reference each other for the same fact, creating a back-and-forth instead of one canonical location.
**Impact:** ~25 words if the DOM-order detail is consolidated into the Accessibility Floor row only, with Component Patterns simplified to "icon + visually-hidden state text, see Accessibility Floor for exact DOM shape."
**Comprehension note:** Low risk — the cross-reference already exists in one direction; this just removes the duplicate detail from the other.

### 4. PRESERVE - Repeated "color is never the sole signal" / Accessibility Floor color-blind-safe statement

**Rationale:** This principle appears in DESIGN.md (lines 93, 109, 114, 119) and EXPERIENCE.md (lines 100, 106, 112) — at first glance repetitive, but each occurrence is scoped to a different concrete surface (status badge, tab icon, category donut, budget-adherence donut, Banned list, Accessibility Floor summary). This is reinforcement of a cross-cutting NFR across independently-implementable components, not redundant filler — an implementer working on just the donut chart shouldn't have to cross-reference the badge section to learn the same rule applies to charts.
**Impact:** N/A (no cut recommended).

### 5. PRESERVE - Parallel structure between Trip Currency change dialog and Profile currency change (Settings)

**Rationale:** EXPERIENCE.md's Information Architecture (line 29), Component Patterns (line 63 vs none for profile—folded into Trip Currency row at line 62's "mirrors" language), and State Patterns (lines 82-83 vs 87-88) intentionally describe the profile-currency-mismatch flow as a mirror of the trip-currency-mismatch flow rather than fully re-explaining it. This is appropriate DRY cross-referencing, not a gap — each "mirrors FR-3" / "same shape as" callout is a deliberate compression, not an omission needing a CUT or MERGE.
**Impact:** N/A (no cut recommended).

### 6. CONDENSE - DESIGN.md "Colors" section line 95 runs a single sentence to ~95 words

**Rationale:** The third Colors bullet (line 95) combines three separate facts — track color reuse, light-mode `warning-dark` contrast headroom comparison, and a forward-looking caution about not darkening `warning` further — into one continuous sentence with multiple em-dash clauses. This predates the Travel Retrospective edit (it's Budget-tab-era content) but is worth flagging now since the file has grown denser with each edit pass; splitting into 2-3 sentences would aid scanning without losing the contrast-ratio precision.
**Impact:** ~0 words saved (restructuring, not cutting) — readability gain only.

## Summary

- **Total recommendations:** 6 (2 QUESTION, 2 PRESERVE, 2 CONDENSE)
- **Estimated reduction:** ~25-45 words if all CONDENSE items are applied; QUESTION items may add ~10-20 words if resolved toward "add the missing reference"
- **Meets length target:** No target specified
- **Comprehension trade-offs:** None — no comprehension aids are proposed for removal; both PRESERVE items confirm intentional repetition/cross-referencing should stay as-is
- **Overall document health:** No leftover dead content from the spend-over-time chart removal was found in either file — that edit was cleanly reverted. The two genuine structural gaps (destination-donut component symmetry, missing Spending-view mockup link) both look like artifacts of the add/remove churn rather than deliberate decisions, and are flagged as QUESTION rather than CUT/MOVE since intent can't be confirmed from the text alone.

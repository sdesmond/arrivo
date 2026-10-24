# Spine Pair Review — Arrivo self-hosted administration

## Overall verdict

The pair captures confirmed coaching decisions accurately and supplies a usable contract for all approved administration surfaces. Three bounded handoff gaps remain: explicit failed-login presentation, visible behavior of still-open edit batches, and a concrete accessible primary-action pairing. No critical or high findings; architecture-level commands, token internals, audit storage, and exact membership-time ties are appropriately deferred.

## 1. Flow coverage — adequate

Checked all seven original scope headings against eight named-protagonist journeys, numbered steps, climax beats, and failure paths. Subsequent decisions cover automatic admin-deletion succession, invitation identity/lifecycle, ordinary reset and CLI recovery, audit batching/retention, full-width navigation, and sole-account upgrade. No approved journey is absent.

### Findings

- **medium — Failed-login destination is underspecified.** Overview promises failed logins and Flow 7 starts by following them into Activity, but Activity Rules only name login/logout without defining how failed attempts differ from successful login events or how attempts without an identifiable account are labeled (`EXPERIENCE.md:93`, `EXPERIENCE.md:197`, `EXPERIENCE.md:207`). A consumer can implement successful-login history while leaving the promised failed-login destination ambiguous. _Fix:_ Explicitly name a failed-sign-in action, define a safe fallback actor label for unattributed attempts, and have Overview links land on the matching Activity action filter. This need not add broader diagnostic logging or sensitive identity fields.

## 2. Token completeness — adequate

YAML parses. All eleven color aliases and referenced typography/radius/spacing variables resolve to the existing theme or font declarations. Every `{colors.*}`, `{typography.*}`, `{rounded.*}`, `{spacing.*}`, and component-token reference resolves. The UI-system inheritance exception permits CSS aliases; duplicating the palette as hex snapshots would undermine the requested theme inheritance. Light/dark contrast requirements are explicit.

### Findings

- **medium — Primary-action appearance is deferred despite a known failing inherited pair.** DESIGN specifies inherited primary colors while postponing selection of an accessible shared variant (`DESIGN.md:94–96`). Current light `--primary: #0e8b80` against `--primary-foreground: #ffffff` is approximately **4.18:1**, below the document's 4.5:1 normal-text floor (`src/app/globals.css:150–151`). The spine therefore gives implementers an unusable default and a future check rather than one final visual contract. _Fix:_ Name the existing or extended accessible primary-action variant and its token pairing before finalization, verify both themes, and retain the established visual language. No new palette is required.

## 3. Component coverage — strong

All thirteen named components have matching entries in DESIGN.Components and EXPERIENCE.Component Patterns: settings-shell, section-navigation, section-field, action-button, entity-list, confirmation-dialog, share-link, status-feedback, instance-summary, activity-list, auth-card, registration-form, recovery-form. Shared controls are inherited; deltas cover target size, labels, fixed invitation username, creation-only URLs, and recovery-MFA behavior. No orphan named component found.

### Findings

None.

## 4. State coverage — adequate

All fourteen IA surfaces have a state row. Common rules cover focus, loading/authority resolution, offline mutations, safe input retention, permission loss, uncertain outcomes, and refresh-before-retry. Surface rows cover concurrency, empty lists/history, stale invitations, clipboard failure, all-or-nothing CLI recovery, and retention confirmation/save behavior.

### Findings

- **medium — Open edit batches have no visible-state contract.** Activity Rules define a ten-minute sliding inactivity window and time-range summary, but do not say whether an in-progress batch appears immediately, waits until closure, or updates while Activity is open. Date filtering and ordering also lack a rule for a batch spanning a date boundary (`EXPERIENCE.md:74`, `EXPERIENCE.md:95`, `EXPERIENCE.md:119`). A long editing session can therefore disappear from recent activity or move unpredictably between result pages depending on implementation. _Fix:_ Specify when the first summary becomes visible, how its displayed end time/order refreshes, and which batch timestamp or interval governs date filtering. Preserve the confirmed summary-only rows and ten-minute grouping rule; storage implementation remains architecture-owned.

## 5. Visual reference coverage — adequate

`imports/` and `.working/` are empty; `mockups/` and `wireframes/` do not exist. No orphan artifacts or broken visual links. All IA surfaces are explicitly spine-only, and spines-win-on-conflict is stated. Exact settings-entry placement and user confirmation of visual-reference needs remain acknowledged Finalize closure work, not an undisclosed completeness claim.

### Findings

None beyond the already-recorded closure work. Do not mark the pair final until that coverage choice is confirmed.

## 6. Bloat & overspecification — strong

Lifecycle and Activity tables centralize shared policy; journey text points to them rather than re-specifying mechanics. Architecture ownership is bounded by confirmed outcomes. Fonts, spacing, and breakpoints are justified inherited composition rather than a new design system. Repetition between state tables and journeys serves state lookup versus end-to-end understanding.

### Findings

None.

## 7. Inheritance discipline — strong

Both source paths exist. `.memlog.md` is explicitly authoritative for subsequent overrides, and reconciliation correctly marks admin-only deletion as an override of initial self-service-choice reuse. Provisional trip metadata was later confirmed; account recovery, retention, link visibility, list simplicity, and navigation choices reflect that chronology. Component names and domain terms match across spines. Relevant source headings remain verbatim in Key Flows.

### Findings

None.

## 8. Shape fit — strong

DESIGN body follows canonical order: Brand & Style, Colors, Typography, Layout & Spacing, Elevation & Depth, Shapes, Components, Do's and Don'ts. EXPERIENCE includes every required section, plus justified responsive/inspiration sections and centralized product-specific lifecycle/activity rules. Draft status correctly preserves outstanding closure work.

### Findings

None.

## Mechanical notes

- YAML, source paths, token-reference resolution, CSS-alias existence, and thirteen-component name parity checked mechanically.
- No broken source references or dangling design-token references found.
- No visual imports or generated artifacts exist to reconcile or promote.
- Contrast figure calculated from current inherited sRGB light tokens; this review did not render UI or claim WCAG conformance.
- Findings: critical 0; high 0; medium 3; low 0.
- Reviewed drafts only; no spine edits, implementation changes, or optional downstream reviewer dispatch performed.

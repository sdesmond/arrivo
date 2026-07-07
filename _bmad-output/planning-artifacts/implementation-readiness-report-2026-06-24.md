---
stepsCompleted: [1, 2, 3, 4, 5, 6]
documentsInUse:
  prd: _bmad-output/planning-artifacts/prds/prd-packt-2026-06-23/prd.md
  prdAddendum: _bmad-output/planning-artifacts/prds/prd-packt-2026-06-23/addendum.md
  architecture: _bmad-output/planning-artifacts/architecture.md
  epicsAndStories: _bmad-output/planning-artifacts/epics.md
  uxDesign: _bmad-output/planning-artifacts/ux-designs/ux-packt-2026-06-24/DESIGN.md
  uxExperience: _bmad-output/planning-artifacts/ux-designs/ux-packt-2026-06-24/EXPERIENCE.md
---

# Implementation Readiness Assessment Report

**Date:** 2026-06-24
**Project:** Packt — Trip Budget Management & Travel Retrospective

## Document Inventory

No duplicate whole+sharded conflicts found. No missing required documents.

- **PRD:** `prds/prd-packt-2026-06-23/prd.md` (+ `addendum.md`) — status: final
- **Architecture:** `architecture.md` — status: complete
- **Epics & Stories:** `epics.md` — 2 epics, 14 stories
- **UX Design:** `ux-designs/ux-packt-2026-06-24/DESIGN.md` + `EXPERIENCE.md` — status: final

## PRD Analysis

### Functional Requirements

FR-1: Trip owner/editor can set a budget total and currency on a trip (existing capability) and see it used as the comparison target for Actual everywhere actual spend is shown.

FR-2: Within a given trip's Budget tab, all amounts display in that trip's Trip Currency, regardless of the user's profile currency preference.

FR-3: When the trip owner/editor changes Trip Currency on a trip that has at least one Cost Entry whose stored currency differs from the new Trip Currency, the system shows a warning before committing the change, explaining that those Cost Entries' displayed values need recalculating. The user can cancel, continue and recalculate, or continue and leave existing converted values as-is.

FR-4: When a trip owner/editor sets or edits the cost on an event or reservation, the system creates or edits a linked Cost Entry under the hood — with amount, currency (defaults to Trip Currency, or profile currency if none set), category (required, pre-defined enum, no default selected), and date.

FR-5: System computes Actual as a single sum over the expenses store, filtered to the trip, with each Cost Entry's amount converted to Trip Currency using the rate locked at that Cost Entry's own entry time.

FR-6: Budget tab shows Actual broken down by category (the shared enum from FR-4/FR-7) with a count of items per category.

FR-7: Trip owner/editor can add a Misc Expense from the Budget tab with amount (required, >0, 2 decimals, capped at 50,000), currency (required, defaults to Trip Currency), category (required, no default selected), date (defaults to today, past dates allowed), and note (optional).

FR-8: At entry time, the system locks two independent conversions from the Cost Entry's original currency, using a historical rate as of that entry's own date: one to Trip Currency (FR-5) and one to the user's profile currency (for Travel Retrospective, §4.6). Both are stored alongside the original amount/currency, each with its own explicit target-currency code.

FR-9: Trip owner/editor can trigger a "Recalculate conversions" action that re-fetches current rates and updates the converted amount for every Cost Entry whose original currency differs from Trip Currency.

FR-10: User can set a warning threshold and a danger threshold (each 0–100%, default 80%/90%, warning must be less than danger) in Settings → Preferences → Budget.

FR-11: Budget tab status indicator shows a neutral state below the warning threshold, a warning state between warning and danger (paired with a Warning icon), and a danger state at or above danger (paired with an Error icon) — icon plus app color together, never color alone.

FR-12: User can switch to a "Spending" view on the History page, separate from the existing "Trips" view, showing cross-trip spending data. Contains exactly the elements defined in FR-15 through FR-18, FR-20, and FR-21 — no separate per-trip list or table.

FR-13: A single date-range filter (This Year / Last Year / Last 12 Months / All Time, defaulting to This Year) controls every chart and figure on the Spending view. A trip is included if any part of its date range overlaps the selected period (then all its Cost Entries count, never a partial subset). All amounts display in the user's profile preferred currency, using each Cost Entry's already-locked profile currency conversion — never render-time.

**Retired:** FR-14 (Spend-over-time bar chart) — considered and cut during the UX pass (see §6 Non-Goals); left as a numbering gap, not renumbered.

FR-15: Spending view shows spend by category, using the same `ExpenseCategory` enum as the trip-level Budget tab, across all trips in the filtered range.

FR-16: Spending view shows spend by destination country, across all trips in the filtered range, grouped by `destinationCountryCode`. Country-level only; trips with no destination set are grouped under "Unknown."

FR-17: Spending view shows what share of trips — among trips that have a budget set — finished under, on, or over budget. "On budget" = Actual within ±2% of Budget total.

FR-18: Spending view shows the average spend per day across all trips in the filtered range — total filtered spend ÷ total filtered trip-days. Trips with no dates set are excluded entirely.

FR-19: When the user changes their profile preferred currency and at least one existing Cost Entry's profile currency conversion was locked under the old value, the system shows a warning before committing the change, then recalculates every affected Cost Entry's profile currency conversion synchronously after confirmation.

FR-20: Spending view shows the total spend across all trips in the filtered range. Zero filtered trips, or zero spend in range, shows $0 — not an error or hidden state.

FR-21: Spending view shows the average spend per trip across all trips in the filtered range — total filtered spend ÷ count of filtered trips.

**Total FRs: 20 in scope (FR-1–FR-21, less retired FR-14)**

### Non-Functional Requirements

NFR-1 (Financial data accuracy): All amount fields validate >0, max 2 decimal places, client- and server-side. Stored numeric values use the existing `numeric` Postgres column convention — no floating-point currency math.

NFR-2 (External dependency reliability — currency conversion): The conversion lookup (Frankfurter/ECB, historical-rate-at-entry-date) is a synchronous dependency of FR-4, FR-7, FR-8, FR-9, FR-3, and FR-19; each specifies its own failure-mode guarantee (save in original currency unconverted, never block the save; user-initiated retry only).

NFR-3 (Accessibility): Threshold Alert states (FR-11) use a Warning icon and an Error icon paired with the app's existing warning/danger colors — never color alone (WCAG 2.1 AA, color-blind-safe). Travel Retrospective's donut charts (FR-15–FR-17) must distinguish segments without relying on color alone — same color-blind-safe floor extended to chart form.

NFR-4 (Data migration): The existing `cost` field on `Event`/`Reservation` is dropped, not migrated. Explicit, intentional loss of pre-feature cost data.

**Feature-specific NFRs (inline, not in §5):**
- FR-8: Conversion dependency is a third-party API call at write time only.
- FR-8/FR-7: The Misc Expense entry form must be fully keyboard-operable — tab order through currency, category, date, amount, note, and save/cancel.
- FR-4: The cost-entry dialog on events/reservations remains fully keyboard-operable with the two new fields added.

**Total NFRs: 4 cross-cutting + 3 feature-specific**

### Additional Requirements

- §6 Non-Goals: no multi-currency budgets, no automatic/background exchange-rate updates, no budget approval/collaborative-permission workflows, no payment processing, Travel Retrospective excludes export/insights-layer/sub-country geography/spend-over-time charting.
- §7.2 Out of Scope: per-person budget math (separate future feature, not deferred v1), no migration/backfill of pre-feature `cost` values.
- §8 Success Metrics: SM-1 (Budget tab real-trip usage), SM-2 (Actual reconciliation accuracy), SM-3 (repeat Spending-view visits), SM-C1 (counter-metric: entry must not become a chore).

### PRD Completeness Assessment

The PRD is well-specified and internally rigorous for nearly every FR — each carries explicit, testable consequences, and §9's Assumptions Index is empty (all inferences resolved to fact inline). Two staleness issues found during this full read-through, both originating from the FR-14 retirement that happened *after* §1 Vision and §2.2's UJ-2 narrative were last touched:

1. **§1 Vision / §2.2 UJ-2 Path (line 45)** still narrates "He sees a bar chart of spend over time, a donut chart of spend by category, a donut chart of spend by destination country, and a donut chart showing what share of his trips finished under/on/over budget." The bar chart no longer exists (FR-14 retired) — this narrative line was not updated when the chart was cut.
2. **§8 SM-3** reads "Validates FR-12 through FR-17 deliver ongoing value" — this predates FR-18/19/20/21 being added and doesn't reflect the FR-14 gap; the validated range should be FR-12, FR-13, FR-15–FR-21.

Both are narrative/cross-reference drift, not specification gaps — every FR itself is complete and correct. Flagged for resolution before this report's findings are closed out.

## Epic Coverage Validation

### Coverage Matrix

| FR Number | PRD Requirement (summary) | Epic Coverage | Status |
| --- | --- | --- | --- |
| FR-1 | Budget as comparison target | Epic 1, Story 1.1 | ✓ Covered |
| FR-2 | Trip Currency overrides profile preference | Epic 1, Story 1.1 | ✓ Covered |
| FR-3 | Trip Currency change confirmation | Epic 1, Story 1.7 | ✓ Covered |
| FR-4 | Unified Cost Entry on events/reservations | Epic 1, Story 1.2 | ✓ Covered |
| FR-5 | Auto-sum Actual from all Cost Entries | Epic 1, Story 1.3 | ✓ Covered |
| FR-6 | Category breakdown | Epic 1, Story 1.3 | ✓ Covered |
| FR-7 | Add a Misc Expense | Epic 1, Story 1.4 | ✓ Covered |
| FR-8 | Dual per-Cost-Entry currency conversion | Epic 1, Story 1.5 | ✓ Covered |
| FR-9 | Manual recalculation of conversions | Epic 1, Story 1.6 | ✓ Covered |
| FR-10 | Configurable thresholds | Epic 1, Story 1.8 | ✓ Covered |
| FR-11 | Visual threshold state on Budget tab | Epic 1, Story 1.9 | ✓ Covered |
| FR-12 | Spending view on History page | Epic 2, Story 2.1 | ✓ Covered |
| FR-13 | Date range filter drives every chart | Epic 2, Story 2.1 | ✓ Covered |
| FR-14 | *(retired — not in scope)* | N/A | — Retired, correctly absent |
| FR-15 | Category breakdown chart | Epic 2, Story 2.2 | ✓ Covered |
| FR-16 | Destination breakdown chart | Epic 2, Story 2.3 | ✓ Covered |
| FR-17 | Budget adherence chart | Epic 2, Story 2.4 | ✓ Covered |
| FR-18 | Average daily spend | Epic 2, Story 2.1 | ✓ Covered |
| FR-19 | Profile currency change confirmation | Epic 2, Story 2.5 | ✓ Covered |
| FR-20 | Total spend figure | Epic 2, Story 2.1 | ✓ Covered |
| FR-21 | Average trip spend | Epic 2, Story 2.1 | ✓ Covered |

No FRs appear in epics.md that aren't traceable to the PRD.

### Missing Requirements

None. Every in-scope FR (FR-1–FR-21, less retired FR-14) maps to at least one story with acceptance criteria that test it directly.

### Coverage Statistics

- Total PRD FRs in scope: 20 (FR-1–FR-21, less retired FR-14)
- FRs covered in epics: 20
- Coverage percentage: 100%

## UX Alignment Assessment

### UX Document Status

Found — `DESIGN.md` + `EXPERIENCE.md` (`ux-designs/ux-packt-2026-06-24/`), status: final, updated 2026-06-24 (same day as the PRD and architecture, post-spend-over-time-cut).

### UX ↔ PRD Alignment

No misalignment found. The UX spines were reconciled against the PRD/addendum during their own finalize pass (`reconcile-prd-travel-retrospective.md`, 3 gaps found and fixed at the time) and updated again when FR-14 was retired — every FR reference in EXPERIENCE.md's Component Patterns and State Patterns tables (FR-1–FR-21, less FR-14) is current. Spot-checked: chart count ("3 charts," not 4), headline figure order, and the ±2%/trip-overlap/no-hidden-figures rules all match the PRD text read in Step 2.

### UX ↔ Architecture Alignment

No misalignment found. Architecture's Frontend Architecture decisions name components 1:1 with EXPERIENCE.md's Component Patterns rows (`SpendingView`, `SpendingDateFilter`, `SpendingHeadlineFigures`, `CategoryBreakdownDonut`, `BudgetAdherenceDonut`, `DestinationBreakdownDonut`, `ProfileCurrencyChangeDialog`), and DESIGN.md's chart-token convention (`--chart-1`–`--chart-11`) is the same one architecture fixes the location/naming for. The chart accessible-name gap (`role="img"` + `aria-label`) that DESIGN.md specifies was caught as a missing Enforcement Guideline during architecture's own validation pass and is now present in both documents consistently.

### Warnings

None.

## Epic Quality Review

### Epic Structure Validation

**User Value Focus:** Both epic titles are user-centric ("Trip Budget Management," "Travel Retrospective") with goal statements describing user outcomes, not technical milestones. No red flags.

**Epic Independence:** Epic 1 stands alone completely (full per-trip budget tracking, no Epic 2 dependency). Epic 2 declares an explicit, legitimate dependency on Epic 1's outputs (`expenses` table, `lib/budget.ts`) but is itself a complete standalone feature once Epic 1 ships — the allowed "build upon, but stand alone" pattern, not a violation.

### Story Quality Assessment — 🔴 Critical Violation Found and Fixed

**Forward dependency in Epic 1's original sequencing:** Story 1.3 ("Track Actual Spend & Category Breakdown," FR-5/FR-6) computed Actual as "the sum of all `expenses` for this trip, each converted to Trip Currency at its own locked rate" — but the conversion mechanism (FR-8) was sequenced as Story 1.5, two stories later. As originally ordered, Story 1.3 was not completable as written: its acceptance criteria depended on a mechanism that didn't exist yet.

**Resolution:** Reordered Epic 1's stories 1.3–1.5. Currency Conversion at Entry Time (FR-8) is now Story 1.3; Track Actual Spend & Category Breakdown (FR-5/FR-6) is now Story 1.4 (correctly builds on 1.3's conversion); Add Misc Expenses (FR-7) is now Story 1.5. Updated the two internal cross-references that pointed to the old numbering (Story 1.2's "populated as null until Story 1.X" note, and Epic 2's "Depends on Epic 1" `lib/budget.ts` story pointer). No FR/UX-DR/NFR coverage changed — only sequencing.

All other within-epic dependencies checked and confirmed backward-only:
- Epic 1: 1.4 depends on 1.2+1.3 (prior); 1.6 depends on 1.3 (prior); 1.7 depends on 1.3+1.6 (prior); 1.9 depends on 1.4+1.8 (prior).
- Epic 2: 2.2/2.3/2.4 reuse the donut base introduced in 2.2 (backward once 2.2 ships); 2.4 reuses Epic 1's `lib/budget.ts::calculateBudgetStatus` (cross-epic, backward, declared).

**Acceptance Criteria Quality:** All 14 stories use proper Given/When/Then structure, reference specific FR/UX-DR/NFR numbers, and include error/edge-case conditions (validation failures, conversion failures, empty states, no-mismatch cases) alongside the happy path. No vague criteria found.

### Dependency Analysis

**Database/Entity Creation Timing:** ✅ `expenses` table created exactly once, in Story 1.2 (the first story that needs it) — not upfront, not duplicated.

### Special Implementation Checks

**Starter Template:** N/A — architecture confirms no starter template; brownfield feature on an established stack.

**Greenfield vs Brownfield Indicators:** Correctly brownfield-shaped — every story integrates with existing systems (existing `TripEditBudget`, `CostDialog`, History page, Preferences) rather than standing up new infrastructure; no spurious "initial project setup" or "CI/CD" stories were invented.

### Best Practices Compliance Checklist

**Epic 1:**
- [x] Delivers user value
- [x] Functions independently
- [x] Stories appropriately sized
- [x] No forward dependencies (after reorder)
- [x] Database tables created when needed
- [x] Clear acceptance criteria
- [x] Traceability to FRs maintained

**Epic 2:**
- [x] Delivers user value
- [x] Functions independently (given Epic 1 dependency, which is declared and legitimate)
- [x] Stories appropriately sized
- [x] No forward dependencies
- [x] No new tables needed (reuses Epic 1's `expenses`)
- [x] Clear acceptance criteria
- [x] Traceability to FRs maintained

### Quality Findings Summary

🔴 **Critical:** 1 found, 1 fixed (forward dependency, Story 1.3/1.5 reorder — see above).
🟠 **Major:** None found.
🟡 **Minor:** None found.

## Summary and Recommendations

### Overall Readiness Status

**READY**

### Critical Issues Requiring Immediate Action

None outstanding. One critical issue was found during this assessment (Epic 1's Story 1.3 depended on a conversion mechanism not built until Story 1.5) and was fixed in-place during the review: stories reordered to 1.3 Currency Conversion → 1.4 Track Actual Spend & Category Breakdown → 1.5 Add Misc Expenses, with internal cross-references corrected.

Two PRD staleness issues (UJ-2's narrative still describing the retired spend-over-time bar chart; SM-3's FR range not reflecting FR-18–21) were also found and fixed in-place.

### Recommended Next Steps

1. Proceed to **Sprint Planning** (`bmad-sprint-planning`) — epics.md is structurally sound, 100% FR-covered, and the one sequencing defect is resolved.
2. During Sprint Planning or the first story cycle, confirm the `expenses` table doesn't already exist from a prior partial implementation attempt before Story 1.2 runs (architecture and epics both assume it doesn't yet).
3. No PRD/UX/Architecture rework needed before implementation — all three were already internally consistent; only the two narrative staleness items above needed correction, and both are now fixed.

### Final Note

This assessment identified 3 issues total (1 critical epic-sequencing defect, 2 minor PRD narrative staleness items) across 4 categories (PRD analysis, epic coverage, UX alignment, epic quality). All 3 were fixed in-place during the assessment rather than deferred. PRD, UX, Architecture, and Epics/Stories are now aligned and ready for Phase 4 implementation.

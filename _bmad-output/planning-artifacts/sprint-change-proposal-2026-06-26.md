---
title: "Sprint Change Proposal: Expense Table & Misc Expense Editing on Budget Tab"
date: 2026-06-26
status: approved
scope: moderate
---

# Sprint Change Proposal — 2026-06-26

## 1. Issue Summary

Epic 1 (Trip Budget Management, stories 1.1–1.9) shipped in full, but the Budget tab only ever
exposed an aggregate view of trip spend (Actual/Budget/Remaining header + category subtotal tiles).
There is no way to see, sort, or audit individual expense line items without leaving the Budget tab
and hunting through the Itinerary or Reservations tabs for the event/reservation a cost was attached
to.

While investigating, a second related gap surfaced: FR-7 (Add a Misc Expense) specified that "A Misc
Expense can be edited or deleted after creation," but no UI for that was ever built —
`TripAddExpenseModal` is add-only. The underlying `updateExpense`/`deleteExpense` Server Actions exist
and are already wired into the event/reservation `CostDialog` flows (`place-row.tsx`,
`reservation-row.tsx`), but never into the Misc Expense surface.

Both gaps live on the same UI surface (the Budget tab) and share the same fix surface (a new table +
an edit-capable version of the existing modal), so they're addressed together.

**Discovered:** 2026-06-26, raised by Spencer after Epic 1 (all of stories 1.1–1.9) was merged.

## 2. Impact Analysis

**Epic Impact:**
- Epic 1 (Trip Budget Management) gains one new story (1.10) within its existing structure. Nothing
  in 1.1–1.9 is invalidated or reopened.
- Epic 2 (Travel Retrospective, still backlog) is unaffected — its cross-trip Spending view explicitly
  excludes per-event/per-reservation line items (FR-12), and this change doesn't touch
  `lib/budget.ts`'s aggregate functions, the `expenses` schema, or any query Epic 2 depends on.

**Artifact Impact:**
- **PRD**: one new FR (FR-22) added under §4.3 Actual Spend Tracking; §7.1 MVP scope range updated to
  FR-1–FR-22.
- **Architecture**: no schema or query change. `expenses: Expense[]` (the full per-trip array) is
  already loaded and passed down to `TripDetailTabBody`, alongside `days`/`unscheduledEvents`/
  `reservations`. Likely needs one new pure helper in `lib/budget.ts` to resolve a display title per
  row, consistent with the existing shared-calc-function convention.
- **Navigation**: no new infrastructure needed. The app already has `?focus=<eventId>` (itinerary
  scroll+highlight via `useFocusScroll`) and `navigateToReservations({kind:"highlight", reservationId})`
  (reservation scroll+highlight) — the new table's row-click just calls the right existing mechanism.
- **UX**: two new component entries (`expense-table`, dual-mode `TripAddExpenseModal`) added to
  DESIGN.md's Components section and two Do's/Don'ts entries; two new UX-DRs (28, 29) added to
  epics.md.
- **Tests**: new colocated unit tests for the new `lib/budget.ts` helper and the `expense-table`
  component; existing `@feat:budget` E2E feature/steps extended with sort/navigate/edit-misc scenarios
  — no new feature tag needed.

## 3. Recommended Approach

**Selected: Option 1 — Direct Adjustment.** Add one new story (1.10) to Epic 1's existing structure.

- Effort: Low–Medium
- Risk: Low (read-only table addition + wiring already-tested `updateExpense`/`deleteExpense` actions
  into an existing modal; no schema change, no new query, reuses existing navigation patterns)

Rollback (Option 2) and MVP scope reduction (Option 3) were not viable — there's nothing to roll back
(this is new scope, not a regression), and the MVP is unaffected; this only adds to it.

## 4. Detailed Change Proposals

### PRD (`prds/prd-packt-2026-06-23/prd.md`)

Added **FR-22: Expense table on Budget tab** under §4.3 Actual Spend Tracking — table of every
`expenses` row (event-linked, reservation-linked, Misc), sortable by date/amount/category/title;
click-to-navigate for linked rows, click-to-edit for Misc rows. Updated §7.1 MVP scope range to
FR-1–FR-22.

### UX (`ux-designs/ux-packt-2026-06-24/DESIGN.md`)

Added `expense-table` component entry to the Components section. Added two Do's/Don'ts entries:
reuse the Misc Expense modal for add+edit (don't build a second dialog); linked rows navigate to their
existing `CostDialog`, never duplicate it.

### Epics (`epics.md`)

- Added FR22 to the Functional Requirements inventory and FR Coverage Map (`Epic 1`).
- Added UX-DR28 (`expense-table` component spec) and UX-DR29 (dual-mode add/edit modal spec).
- Added **Story 1.10: View and Manage All Trip Expenses in a Table** to Epic 1, with 8
  Given/When/Then acceptance criteria covering: table render location, column-header sort
  toggling, event-row navigation, reservation-row navigation, misc-row edit-modal open, Remove
  (delete), Save (update), and the zero-expenses empty state.
- Updated Epic 1's `FRs covered` and `Relevant UX-DRs` lists.
- Added a note to the Additional Requirements E2E section: Story 1.10 is covered under the existing
  `@feat:budget` feature/steps — no new tag.

### Sprint Status (`implementation-artifacts/sprint-status.yaml`)

Added `1-10-view-and-manage-all-trip-expenses-in-a-table: backlog` after `1-9-threshold-status-indicator`.

## 5. PRD MVP Impact & Action Plan

MVP is **expanded, not reduced** — FR-22 is in scope for the current MVP (PRD §7.1 updated). Sequencing:
run Story 1.10 next, before starting Epic 2, since it's still Budget-tab/Epic-1 scoped work.

Major action items for implementation (handed to dev-story):
1. New `lib/budget.ts` helper to resolve each expense's display title (event name / reservation
   provider+type / Misc note-or-category) and prep sortable rows.
2. New `expense-table` component, rendered beneath the category tile grid in `TripBudgetTab`.
3. Wire row click: event-linked → existing `?focus=<eventId>` itinerary navigation; reservation-linked
   → existing `navigateToReservations({kind:"highlight", ...})`; Misc → open edit modal.
4. Extend `TripAddExpenseModal` to a dual-mode add/edit modal with an optional `expense` prop and a
   Remove action wired to the existing `deleteExpense`/`updateExpense` actions.
5. Unit tests for the new helper and component; extend `tests/e2e/features/budget.feature` +
   `budget.steps.ts` with new scenarios.

## 6. Implementation Handoff

**Scope classification: Moderate** — backlog reorganization (new story added to an in-progress epic)
plus direct implementation once a story file exists.

- **Product Owner / Developer**: create the Story 1.10 file from `epics.md` via the standard
  create-story workflow, then run `packt-plan-reviewer` on it before implementation (per AGENTS.md's
  non-negotiable pre-implementation gate).
- **Developer agent**: implement Story 1.10 per its acceptance criteria, following the
  testing-first gate (name exact test files before touching production code).

**Success criteria:** Story 1.10 acceptance criteria all pass; `packt-build-validator` green;
existing Story 1.5/1.7 Misc Expense behavior unaffected; Epic 2 remains untouched and still backlog.

# Reconciliation: Brainstorming Session vs PRD + Addendum

Gaps found: 3. None overlap with the known intentional changes (per-person removal, zero-category omission confirmation, retry-is-user-initiated confirmation, FR-5 max-amount addition, FR-7 recalc-button addition, Phase 2 chart placement, additive-only schema, Warning/Error icons).

## Gap 1 — "Full keyboard nav" requirement dropped from Misc Expense modal

- **Source:** Brainstorm, Theme 1 "Misc Expense Entry" bullet, line 24: _"Modal with currency prefix dropdown, required category (blank default), date (today default, past allowed), note, full keyboard nav."_
- **Missing from:** PRD FR-5/FR-6 (§4.3) and addendum's `TripAddExpenseModal` component notes (addendum.md line 24) — neither mentions keyboard navigability. The PRD's only accessibility requirement is the Warning/Error icon pairing for threshold states (FR-9), which doesn't cover modal keyboard nav.
- **Suggestion:** Add a consequence/NFR under FR-5 (or the Cross-Cutting NFRs accessibility bullet) requiring full keyboard operability of the Misc Expense modal (tab order, Enter-to-submit, Esc-to-close), so it isn't silently scoped out.

## Gap 2 — `dbExpenseToType` mapper not carried into addendum schema section

- **Source:** Brainstorm, step 3 of the implementation sequence, line 84: _"Add dbExpenseToType mapper."_
- **Missing from:** Addendum's Schema section (addendum.md lines 5-10) lists the new `expenses` table and additive-only decision but never names the mapper function, even though the PRD generically references `db-mappers.ts` (prd.md line 186) for the numeric-string convention. Minor, but worth keeping explicit since every other DB-backed type in this codebase has a named mapper in `src/lib/db-mappers.ts`.
- **Suggestion:** Add one line to the addendum Schema section: "Add `dbExpenseToType` mapper in `src/lib/db-mappers.ts` per existing convention."

## Gap 3 — Implementation sequence not updated for FR-5 (max amount) and FR-7 (recalculate conversions), added after the brainstorm was written

- **Source:** Brainstorm's 7-step sequence (lines 69-122) and addendum's "Implementation Sequence" section (addendum.md lines 27-35), which reproduces the brainstorm's steps verbatim.
- **Issue:** The PRD adds FR-5 (max-amount ceiling on Misc Expense amount) and FR-7 (manual "Recalculate conversions" action, conditionally visible) after the brainstorm's sequence was drafted. Neither addendum step 3 (expenses table schema) nor step 5 (Misc Expense modal) nor step 6 (Budget tab) calls out the new work these FRs require: step 3 doesn't note that `converted_amount`/`conversion_rate` must support being overwritten by a later recalculation pass (not just written once at entry); step 5 doesn't mention adding the max-amount validation; step 6 doesn't mention adding the conditionally-visible "Recalculate conversions" control and its visibility query (which the addendum does describe elsewhere, at lines 16, but doesn't tie back into the sequence/step breakdown or its hour estimate).
- **Suggestion:** Either annotate the addendum's Implementation Sequence with brief callouts on steps 3/5/6 noting the FR-5 and FR-7 work folded in (and bump the affected hour estimates), or add a short note above the sequence stating it predates FR-5/FR-7 and should be treated as directional rather than exhaustive.

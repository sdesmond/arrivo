# Editorial Prose Review — DESIGN.md / EXPERIENCE.md (2026-06-24)

| Location | Issue | Fix |
| --- | --- | --- |
| EXPERIENCE.md lines 80, 93, 107, 111 | `CostDialog` referenced without backticks after being introduced with backticks at line 60 (and consistently backticked as `` `TripEditBudget` `` elsewhere) | Wrap as `` `CostDialog` `` in all four locations |
| EXPERIENCE.md line 59 vs line 24 | "cost dialog" (lowercase, prose reference) vs "Cost dialog" (capitalized, table row label) for the same surface | Pick one casing for prose references to the surface name; e.g. lowercase "cost dialog" when not used as a proper heading, matching line 93's "the redesigned CostDialog" pattern, or capitalize consistently |
| EXPERIENCE.md line 29 vs lines 87–88, 100 | "profile-currency" (hyphenated, line 29: "profile-currency conversion") vs "profile currency" (unhyphenated, lines 87, 88, 100) | Use "profile-currency" only when used attributively before a noun (e.g. "profile-currency conversion"); keep "profile currency" unhyphenated as a noun phrase elsewhere — current usage is actually correct by this rule, but verify line 29's compound is intentional, not a stray hyphen |
| EXPERIENCE.md line 65 | Column header cell "Headline figures" has irregular trailing whitespace inside the pipe cell, inconsistent with neighboring rows' tighter spacing | Trim to match surrounding table cell spacing (cosmetic Markdown whitespace, not content) |
| EXPERIENCE.md lines 59–61 | "Misc Expense modal (`TripAddExpenseModal`)" introduces the component name once but later references at lines 23, 93, 96, 107, 111 drop the parenthetical and just say "Misc Expense modal" | No fix needed — this is acceptable shorthand after first introduction, consistent with how `CostDialog`/`TripEditBudget` are introduced once then referred to by component name; flagged only for awareness, not a defect |
| DESIGN.md / EXPERIENCE.md FR references | Checked all FR references (FR-1, FR-3, FR-6 through FR-21) | No inconsistency found — both files use "FR-N" (hyphenated) uniformly; no "FRN" or "FR N" variants present |
| EXPERIENCE.md / DESIGN.md "Trip Currency" | Checked capitalization of "Trip Currency" as a proper noun throughout both files | No inconsistency found — capitalized consistently as a proper term in both files |

Total findings requiring action: 3 (CostDialog backticking, cost dialog casing, headline-figures cell whitespace). 2 items noted as non-issues for completeness.

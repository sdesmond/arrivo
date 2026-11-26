---
epic: epic-reservations-budget-api
date: 2026-11-26
verdict: accepted-with-open-items
criteria: declared
headless: false
---

# Retrospective: Reservations and budget through the API (epic 7)

## Epic summary

Nine tickets, build order 7.1 to 7.9, one linear PR chain (#579-#587) onto `feature/api-v1`. `pending_tickets` is empty (`tickets.py status`, 2026-11-26).

| Ticket | Title                                           | Status                 |
| ------ | ----------------------------------------------- | ---------------------- |
| 7.1    | Create reservations through the API             | built (state `review`) |
| 7.2    | Create expenses through the API                 | built (`review`)       |
| 7.3    | Edit reservations through the API               | done                   |
| 7.4    | Delete reservations through the API             | built (`review`)       |
| 7.5    | Edit and delete expenses through the API        | built (`review`)       |
| 7.6    | Move linked-expense callers to the API          | built (`review`)       |
| 7.7    | Recalculate expense conversions through the API | built (`review`)       |
| 7.8    | Refactor sweep                                  | built (`review`)       |
| 7.9    | Verify reservations and budget end to end       | built (`review`)       |

**Closed 2026-11-26.** All nine tickets are `done` and the epic is `done`. The table above and the `built` wording are as of the retro run. Action items 1-4 are resolved: tickets marked done, stale deferred entries completed, account-deletion audit fixed (#588), AV2 fixed by the `api.steps.ts` split (#589), AV1 fixed by moving `create-trip-days` and `date-sync` into `src/lib` with an ESLint rule. Still deferred: conversion retry on unchanged re-save, date-editor Escape focus, second/millisecond precision, `TimePicker` font scaling, deterministic cross-trip cascade concurrency test.

**Ranges.** The plans' baselines form one chain, so each plan's range runs to the next baseline and 7.9's runs to `HEAD` (inferred). Whole epic: `f96829d6..HEAD`, 32 commits, 9 merges (all measured), 102 files (`git_evidence.py`, 72 under `src`: +5,100 / -3,345). Baselines: 7.1 `f96829d6`, 7.2 `4d9dff7c`, 7.3 `59eef24c`, 7.4 `b8f46cd1`, 7.5 `9ff280ac`, 7.6 `893c6942`, 7.7 `fc062197`, 7.8 `0f565ccc`, 7.9 `dbbe043c`.

**Evidence inventory.** Available: epic file with Done when, initiative file, nine plans, `deferred-work.md`, epic 6 retrospective, git history. Missing: session logs (process-lesson analysis skipped). Not run: `bmad-review` as a separate skill; the lenses ran inline over the epic's top-churn files and the plans' own review logs (narrowed scope). Per-range `git_evidence.py` runs were not made; one whole-epic run was, because ranges are consecutive and not overlapping.

You gave no going-in concerns.

## Findings

### Spec reconciliation (Done when)

- **D1 met.** No `"use server"` file in `src` mentions reservations or expenses (`grep`). `src/app/(app)/trips/[tripId]/reservations/` and `.../budget/` no longer exist, and their `actions.ts` files are gone (`git_evidence`: -260 and -342 lines; their tests -1,410 and -813). Routes exist at `src/app/api/v1/expenses/[expenseId]/route.ts`, `.../trips/[tripId]/expenses/recalculate/route.ts` and `.../trips/[tripId]/reservations/route.ts`. Components that use these resources (`place-row`, `reservation-cost-chip`, `reservation-edit-drawer`, `trip-add-expense-modal`, `trip-budget-tab`) are the migrated callers per 7.5-7.7. I did not open each component to confirm the fetch URL.
- **D2 met.** The services (`expenses.ts`, `reservations.ts`, `expense-conversions.ts`) carry the DB string conversion and mappers. 7.9's matrix records exact persisted conversion fields and EUR 127.00 and EUR 35.00 totals after reload (`story-verify-...-plan.md`, I/O matrix and Verification).
- **D3 met.** The 7.9 Verification table names a passing test for each invariant: deletion records (direct, pruning, five parent cascades), live and expired replay, ETag stable, 304, invalidation, ETag under position ties. Validator result in that plan: lint, TypeScript and build pass, coverage 8,441 tests (98.19% lines, 94.3% branches), affected E2E 742 passed.
- **Docs.** `docs/api-v1.md` +73 / -1 across the epic.

### Aggregate views

- **F1 (defer, low). `src/lib` still imports `src/app`.** `services/trips.ts:41-42` and `services/trip-date-change.ts:18,23` import `@/app/(app)/trips/create-trip-days` and `date-sync`. This is epic 5 AV1 / epic 6 F4, unchanged. Epic 7 added no new such import: `reservation-date-range.ts` moved from `src/app/.../reservations/` to `src/lib/` (-142 / +142), the right direction.
- **F2 (defer, low). Domain step file bypassed again.** `tests/e2e/steps/api.steps.ts` grew 4,838 to 5,311 lines (+473) over the epic although domain files exist (`api-deleted-client-ids.steps.ts`, `api-documents.steps.ts`, `api-packing-templates.steps.ts`). The reservation and expense steps went into `reservations.steps.ts` (1,021 lines, +486) and `budget.steps.ts` (new, 240). This is epic 5 AV2 / epic 6 F3 recurring; I did not trace which of the +473 lines belong to this epic's tickets beyond the diffstat.
- **F3 (accept, low). Large churn is mostly migration.** Top-churn files are deleted action tests and new service tests (`reservations.test.ts` +680, `expenses.test.ts` +556). The largest new runtime files are `services/reservations.ts` (+385 / -5) and `services/expenses.ts` (+293 / -4), both reasonable. Not god-class growth; `reservation-row.tsx` -349 after the 7.3 split.
- **F4 (fix now, low). Four deferred-work entries are stale.** `deferred-work.md:345-347` (cascade-removed expenses lack deletion records) and `:349-351` (server-action `deleteExpense` skips the record) are resolved: commits `45ee28ea`, `af1bb18d` and `8067bf1c` add cascade records, no server action remains, and 7.9 proves five cascade examples. They are not marked completed in the file.

### Lenses (inline, narrowed scope)

- **F5 (defer, medium). Still-open deferrals from this epic.** `deferred-work.md:353-354` (an expense saved with a failed conversion cannot be retried by re-saving unchanged values); `:356-364` (date editor touch-target audit, Escape focus, second/millisecond precision lost on unchanged draft); `:366-370` (account-deletion deletion-record audit, deterministic cross-trip cascade concurrency test). The last two are the only open items that bear on the epic's own replay guarantee; the account-deletion audit is the one I would schedule before epic 10.
- **F6 (accept). 7.9 flake note.** The plan records one budget recalc scenario that failed once under load and passed on isolated and full reruns. Not reproduced; recorded so it is not mistaken for a pass-first run.
- **F7 (process, low). Status still not updated at merge.** Eight tickets sit at `state: review` after their PRs merged. Epic 6 action 4 was carried out for epic 6 afterwards (6.1-6.7 now `done`) but not applied as tickets merged.

## Behavior verification

Not exercised end to end here. I reran 114 unit tests across `reservations`, `expenses`, `expense-conversions`, `deletion-records` and `contract/expenses` (5 files, all passed). I did not rerun Playwright; I rely on the 7.9 plan's recorded 742 E2E passes and its validator PASS at its final commit. The merge tip after it is `67ddfa8a`; nothing after the plan's last commit changed `src` (`git log`: `a90f19db` is docs only).

## Previous-retro follow-through

Epic 6 retrospective (`epic-packing-templates-api-retrospective.md`):

1. **Developer: add template deletion records (F1).** Retro records it fixed in PR #576 (`47aa1516`). Not re-verified here.
2. **Process owner: validator result a required plan Verification field (F5).** Landed in 7.8; present as `Build-validator result` in `story-refactor-sweep-plan.md` (4 mentions) and `story-verify-...-plan.md` (1). Plans 7.1-7.7 predate it and use prose results where present (7.1 and 7.4 confirmed).
3. **Process owner: cross-story invariant pass in the epic 7 verify story (F6).** Landed: 7.9 Verification table (deletion records, replay windows, ETag determinism).
4. **Process owner: update ticket and plan status at merge.** Epic 6 tickets are `done`. Not landed for epic 7 (F7).
5. **Developer: move template save steps out of `api.steps.ts`.** No evidence found.
6. **Developer: AV1, AV2, F8, F13, F15, F17 and invitation F3 before epic 8 or 12.** AV1 and AV2 still open (F1, F2). Others not rechecked.

## Action items

1. **Process owner: mark 7.1, 7.2, 7.4-7.9 done** through `bmad-ticket` after you accept this retro. This unblocks epic 8's `after` on epic 7.
2. **Developer: mark `deferred-work.md:345-347` and `:349-351` completed** (F4), citing `45ee28ea`, `af1bb18d`, `8067bf1c` and 7.9. Proposed, not applied.
3. **Developer: schedule the account-deletion deletion-record audit before epic 10** (F5). Epic 10 owns account deletion; the entry is at `deferred-work.md:366`.
4. **Process owner: decide AV1 and AV2 before epic 8 or 12** (F1, F2). Third retro in a row listing them. Either split `api.steps.ts` and move the `src/app` helpers to `src/lib`, or accept them in writing.

## Decision records

None proposed. I did not read each plan's Design Notes for ADR candidates; the one candidate I know of is the epic file's Decision (2026-11-23) to reuse one document attachment service. It is recorded in the epic file already and I did not test it against the ADR bar.

## Acceptance verdict

**accepted-with-open-items**, criteria declared. D1-D3 are met on the evidence above, no blocking finding stands, and all nine tickets are finished (eight at `built`, one `done`). Open items: F1, F2 (carried), F5, plus the status and deferred-work housekeeping in action items 1-2.

## Open questions

- Should AV1/AV2 get a ticket or be accepted? A third carry-over changes whether epic 8's build keeps adding to `api.steps.ts`.
- Do you want the plans' Design Notes reviewed for ADR candidates (hard to reverse, real trade-off)? I skipped that.

---
title: "Viewer's shared trips are excluded from personal expense reporting"
type: "feature"
created: "2026-09-02"
status: "done"
baseline_commit: "dc8b76a4bc200dac9ab056c1c45e1416255b7b4f"
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** A viewer of a shared trip must never see that trip's financial data "anywhere they can reach it — including their own personal expense-reporting summary." Currently `listExpensesForUserInRange` (which feeds the personal Spending/travel-history aggregate) joins `collaborators` on `userId` with no role filter, so a trip where the user is only a viewer still contributes its expenses to their `totalSpend`, averages, category/destination breakdowns, and budget-adherence counts.

**Approach:** Add a role filter to `listExpensesForUserInRange` so a collaborator row with `role = "viewer"` is excluded from the returned trips and expenses. The exclusion is role-derived at query time (not a stored flag), so a later role change to editor/manager restores inclusion with no further work.

## Boundaries & Constraints

**Always:**
- The exclusion lives in `listExpensesForUserInRange` in `src/lib/queries.ts` — the single query that feeds the personal Spending aggregation. No parallel UI-only path; `buildSpendingSummary` in `src/lib/spending.ts` is unchanged (it aggregates whatever the query returns).
- Filter on `collaborators.role != "viewer"` using `ne(...)` from `drizzle-orm`, placed in the existing `innerJoin(collaborators, and(...))` condition alongside the existing `eq(collaborators.tripId, trips.id)` and `eq(collaborators.userId, userId)`.
- Excluding a viewer-role trip must exclude both its `trips` row and all its `expenses` (expenses are fetched by `tripIds` derived from the filtered trip list, so this is automatic once the trip is excluded).
- Add `ne` to the `drizzle-orm` mock in `src/lib/queries.test.ts` (currently absent) so the module under test imports cleanly, and add a case asserting the role filter is applied.
- Colocated tests updated in the same change; coverage thresholds ≥95% lines/functions, ≥90% branches.

**Ask First:**
- None expected.

**Never:**
- No change to `buildSpendingSummary` / `src/lib/spending.ts` — it already only sees what the query returns.
- No stored/flag-based exclusion; role is the source of truth.
- No change to `getTripDetail`/`dbTripToType` viewer path (already handled in story 2.1) — this story is only the personal-Spending exclusion.
- No change to how `travel-history/page.tsx` calls the query.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| -------- | ------------- | -------------------------- | -------------- |
| User is viewer on trip A, editor on trip B | `listExpensesForUserInRange(user, start, end)` | Trip A and its expenses excluded; trip B and its expenses included | N/A |
| User is viewer on a trip that overlaps the range | viewer-only trip in range | Trip not returned; no expenses returned for it | N/A |
| User later promoted viewer → editor on trip A | role now `"editor"` | Next call includes trip A and its expenses (role-derived, no flag to clear) | N/A |
| User is owner/creator (no collaborator row, or implicit row) | trip owned by user | Included as today — owner was never a viewer-only row | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/queries.ts:254-264` -- `listExpensesForUserInRange`: the `.innerJoin(collaborators, and(eq(collaborators.tripId, trips.id), eq(collaborators.userId, userId)))`. Add `ne(collaborators.role, CollaboratorRole.Viewer)` as a third condition inside the existing `and(...)`. `CollaboratorRole.Viewer === "viewer"` (imported at `queries.ts:45`). `ne` must be added to the `drizzle-orm` import at `queries.ts:24`.
- `src/lib/queries.test.ts:4-67` -- test harness. `schemaTokens.collaborators.role` (line 26) exists; `ne` is NOT currently in the `vi.mock("drizzle-orm", ...)` factory (lines 58-67) — add it (e.g. `ne: vi.fn(() => "ne")`). The `listExpensesForUserInRange` describe block is at lines 835-938.
- `src/lib/spending.ts:44-124` -- `buildSpendingSummary`; read-only. Aggregates whatever trips/expenses it's handed; no change.
- `src/app/(app)/travel-history/page.tsx:33-34` -- reads `listExpensesForUserInRange` → `buildSpendingSummary`. Read-only.
- `src/db/schema.ts:260` -- `collaborators.role: text(...)`; the column the filter targets.

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/queries.ts` -- add `ne` to the `drizzle-orm` import; add `ne(collaborators.role, CollaboratorRole.Viewer)` to the `innerJoin` condition in `listExpensesForUserInRange`.
- [x] `src/lib/queries.test.ts` -- add `ne: vi.fn(() => "ne")` to the drizzle-orm mock; add a `listExpensesForUserInRange` test case asserting `ne` is called with `(collaborators.role, "viewer")` (excluding viewer-role trips) and that existing inclusion behavior is unchanged.

**Acceptance Criteria:**

- Given a user collaborates on a trip with role `"viewer"`, when `listExpensesForUserInRange` runs for them, then the query's collaborator join includes a `role != "viewer"` predicate (verified via `ne` being applied to `collaborators.role`).
- Given the query excludes viewer-role trips, when the trip list is derived and expenses are fetched by those trip ids, then viewer-role trips are absent from `trips` and none of their expenses are returned.
- Given the exclusion is role-derived at query time (no stored flag), when the same trip's role later changes viewer → editor/manager, then the next call includes the trip and its expenses (covered by the query applying the role predicate, not a flag).

### Review Findings

- [x] [Review][Decision] Add E2E coverage for viewer expense-exclusion? — Resolved: not needed. Unit-test coverage of the query is sufficient given this is a data-shape fix to an existing flow, not a new user-facing flow; the frozen spec's Tasks & Acceptance list never called for an E2E task.
- [x] [Review][Patch] New test only asserts `ne(...)` was called, not that its return value is wired into the join's `and(...)` predicate — a dropped/dead `ne()` call would still pass this test [src/lib/queries.test.ts:926-956]
- [x] [Review][Patch] Test name "excludes trips where user is viewer via ne role filter" overstates what's proven — given the fully-mocked `db.select`, it only verifies predicate construction, not actual filtering [src/lib/queries.test.ts:926]
- [x] [Review][Patch] New `innerJoin` condition line exceeds the project's Prettier `printWidth: 120` (153 chars); every other multi-line drizzle chain in the file wraps its args [src/lib/queries.ts:257]
- [x] [Review][Patch] No inline comment on the new `ne(collaborators.role, CollaboratorRole.Viewer)` predicate flagging it as a privacy-critical exclusion, per this project's own comment convention (non-obvious hidden constraint) [src/lib/queries.ts:257]
- [x] [Review][Patch] `sprint-status.yaml` bundles two unrelated status transitions in one diff (2-3 review→done catch-up for already-merged PR #254, alongside 2-4 backlog→review for this story) — split into separate commits per repo convention [_bmad-output/implementation-artifacts/sprint-status.yaml]
- [x] [Review][Patch] Missing test coverage for scenarios the spec's own I/O matrix lists: mixed-role in one call (viewer trip excluded, editor trip included), owner/creator with no viewer-role row, and role-promotion (viewer→editor) re-inclusion [src/lib/queries.test.ts]
- [x] [Review][Patch] New test asserts `result.trips` only, never `result.expenses`, though AC #2 specifically requires excluded-trip expenses be absent [src/lib/queries.test.ts:926-956]
- [x] [Review][Patch] Inline `const { ne } = await import("drizzle-orm")` breaks from this file's convention of using the module-level mocked imports directly [src/lib/queries.test.ts:927]
- [x] [Review][Defer] Duplicate collaborator rows for the same trip+user (unique key is `tripId+email`, not `tripId+userId`) could yield duplicate trip entries — pre-existing join behavior, unrelated to this diff's `ne()` addition [src/lib/queries.ts:257] — deferred, pre-existing

## Spec Change Log

## Design Notes

The role predicate belongs in the `innerJoin` `and(...)` condition rather than the `or(...)` date-overlap `where`. The join's `and` already scopes which collaborator row matches the user; adding `ne(role, "viewer")` there means the overlapping-date windowing (the `or`) keeps operating over only non-viewer collaborator rows. Because `expenses` are fetched via `inArray(expenses.tripId, tripIds)` where `tripIds` come from the filtered trip list, excluding a viewer trip automatically excludes its expenses — no second filter needed.


---
title: "Fix two small pre-existing trips-area bugs"
type: "bugfix"
created: "2026-09-09"
status: "done"
baseline_commit: "321157c728df8b4e64a7c2eb484ad2eed996e92b"
review_loop_iteration: 0
context:
  - "{project-root}/_bmad-output/project-context.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Two unrelated small bugs, bundled only because each is too small for its own spec:
(1) a personal-expense-report query can double-count a trip if a user has two collaborator rows on
it; (2) the dashboard trip-edit sheet can stay open with null trip data after a list refresh. (A
third small finding — `saveContributorChanges`'s missing `revalidatePath("/trips")` — lands in
`spec-sharing-dialog-invite-flow-hardening.md` instead, since that spec already touches
`actions.ts`.)

**Approach:** Dedupe the query's trip rows by id; key the edit sheet's `open` off the same source
as its `trip` prop.

## Boundaries & Constraints

**Always:** Preserve `listExpensesForUserInRange`'s existing viewer-exclusion semantics — dedupe
without changing which trips qualify, only how many times a qualifying trip appears.

**Never:** Change the `(tripId, email)` collaborators uniqueness constraint itself — that's a schema
migration, out of scope here.

</frozen-after-approval>

## Code Map

- `src/lib/queries.ts:253-277` — `listExpensesForUserInRange`'s `innerJoin` matches on `userId`, but
  `collaborators`' unique constraint is `(tripId, email)` (`src/db/schema.ts`), so two collaborator
  rows sharing a `userId` on one trip both match, duplicating that trip in `tripList` (:279).
- `src/app/(app)/trips/page-client.tsx:70-78` — `TripEditSheet`'s `open` keys off
  `handlers.editingTrip` (a string id) while `trip` keys off `handlers.editingEntry` (looked up in
  `use-trips-page-handlers.ts:172`); a refresh that drops the entry leaves `open=true`,
  `trip=null`.

## Tasks & Acceptance

**Execution:**

- [ ] `src/lib/queries.ts` -- dedupe `tripRows`/`tripList` by `trip.id` before building `tripIds`
  and the returned `trips` array.
- [ ] `src/app/(app)/trips/page-client.tsx` -- change `open={handlers.editingTrip !== null}` to key
  off `handlers.editingEntry !== null` instead, matching `trip`'s source.
- [ ] `queries.test.ts` -- add a case: a user with two collaborator rows (different emails, same
  `userId`) on one trip appears exactly once in the result.
- [ ] `trips/page-client.component.test.tsx` -- add a case: the edit sheet closes (not
  null-trip-open) when the editing entry drops out of a refreshed list.

**Acceptance Criteria:**

- Given a user linked to a trip by two collaborator rows, when `listExpensesForUserInRange` runs,
  then that trip appears once, not twice, in the returned list.
- Given the dashboard's editing entry disappears from a refreshed list, when the next render runs,
  then the edit sheet is closed, not open with null data.

## Verification

**Commands:**

- `npx vitest run src/lib/queries.test.ts "src/app/(app)/trips/page-client.component.test.tsx"` -- expected: pass.
- `packt-build-validator` -- expected: lint, type check, coverage, build, affected E2E pass.

---
title: "Migrate collaborator roles to viewer/editor/manager"
type: "feature"
created: "2026-08-31"
status: "done"
review_loop_iteration: 0
context: ["{project-root}/docs/drizzle-workflow.md"]
baseline_commit: "46b5bb63e768517e2005cfa3e4dd0ea6736d0f66"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `collaborators.role` only supports `owner|editor|viewer`, conflating "full trip control" with "is the original creator" in one string. The trip-contributors epic needs a real `viewer < editor < manager` rank plus a separate, protected creator flag so a manager who isn't the creator can exist later.

**Approach:** Rename the `owner` role to `manager`, add a new `isCreator: boolean` column to `collaborators`, and backfill existing `owner` rows to `role='manager', isCreator=true` via a one-off script that aborts loudly if any trip doesn't have exactly one `owner` row. Update every call site, seed source, and test that references `"owner"` as a role value.

## Boundaries & Constraints

**Always:** `assertTripAccess` rank order stays `viewer=0 < editor=1 < manager=2`. The backfill verifies "exactly one creator per trip" before writing anything for that trip — zero or multiple `owner` rows aborts the whole run loudly (non-zero exit, names the violating `tripId`(s)), never silently picks one. `collaborators.role` stays a plain `text` column (matches current schema — no Postgres enum). Every code site that sets a collaborator's role to `"owner"` for a newly-created trip (seed data, E2E fixtures, `createTrip`) must instead set `role: "manager", isCreator: true` in the same change.

**Ask First:** N/A — story is fully specified by the epic ACs; no open design decision remains.

**Never:** Never leave `"owner"` as a valid `CollaboratorRole` value after this lands (no dual-read period). Never touch `trips.ownerId` — separate concept (a user-id FK), out of scope. Never add role-based UI locking anywhere beyond the existing `trip-edit-collaborators.tsx` condition — Story 2.3 handles `isCreator`-based server-side protection later.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Single-owner backfill | Trip has exactly one `role='owner'` row | That row becomes `role='manager', isCreator=true`; no other row for the trip changes | N/A |
| Zero owner rows | Trip has 0 `role='owner'` rows | Backfill aborts before writing anything | Script exits non-zero, error names the `tripId` and "0 owner rows" |
| Multiple owner rows | Trip has 2+ `role='owner'` rows | Backfill aborts before writing anything | Script exits non-zero, error names the `tripId` and row count |
| Manager-gated access | `assertTripAccess(tripId, userId, "manager")` for a user with `role="editor"` | Denied | `notFound()` thrown |
| Viewer-gated access by manager | `assertTripAccess(tripId, userId, "viewer")` for a user with `role="manager"` | Granted | N/A |

</frozen-after-approval>

## Code Map

- `src/data/types.ts:34-39` -- `CollaboratorRole` const/type: rename `Owner: "owner"` to `Manager: "manager"`. `Collaborator` interface at `:511` needs `isCreator: boolean`.
- `src/db/schema.ts:246-264` -- `collaborators` table: add `isCreator` boolean column (`notNull().default(false)`). `role` stays plain `text`, no enum. `trips.ownerId` (`:88-90`) is unrelated, leave untouched.
- `src/lib/auth-helpers.ts:22-35` -- `assertTripAccess`: `minRole` type and `roleRank` map both need `owner`→`manager` (rank 2 unchanged).
- `src/app/(app)/trips/actions.ts` -- four call sites pass `"owner"` today: `deleteTrip:632`, `addCollaborator:654`, `removeCollaborator:674`, `updateCollaboratorRole:683` → all become `"manager"`. `createTrip:283` inserts the creator's collaborator row with `role: "owner"` → becomes `role: "manager", isCreator: true`.
- `src/components/packt/trip-edit-collaborators.tsx:68,72,78,82,83,85` -- six spots keyed on `collaborator.role === "owner"` (select-disabled, item label "Owner", remove-button disabled/title/style) → rename to `"manager"`, relabel "Owner" → "Manager", title "Owner cannot be removed" → "Manager cannot be removed".
- `src/db/seed-data/lisbon.ts:231`, `src/db/seed-data/tokyo.ts:426`, `src/db/seed.ts:60` -- creator row `role: "owner"` → `role: "manager", isCreator: true`.
- `tests/e2e/scenario-fixture.ts:323` -- `createTrip()` helper's collaborator insert, same `role: "owner"` → `role: "manager", isCreator: true` change (not in the epic's explicit file list but is the E2E-side parallel of `seed.ts`; skipping it leaves E2E-created trips violating the new invariant).
- `src/components/packt/trip-edit-collaborators.test.tsx:92-122` -- two tests using `role: "owner"` (`:94,110`) and asserting `"Owner cannot be removed"` (`:104`) → update to `"manager"`/"Manager cannot be removed".
- `src/app/(app)/trips/actions.test.ts:939-957` -- `createTrip` insert assertion expects `role: "owner"` (`:953`) → `"manager"`.
- `src/components/packt/trip-edit-sheet.test.tsx` -- investigation found no `"owner"` literal (mocks `TripEditCollaborators` entirely); confirm still true after the rename, no change expected.
- `src/db/reset-e2e.ts` -- reference pattern (15-line file) for the new one-off `tsx`-run backfill script's shape (shared `db` client + `dotenv/config`, no drizzle-kit migration runner exists in this pre-release push-only workflow — see `docs/drizzle-workflow.md`).
- `package.json` -- `db:migrate:e2e` runs `drizzle-kit push` (schema-only, no data backfill); add a new script for the backfill.

## Tasks & Acceptance

**Execution:**

- [x] `src/db/schema.ts` -- add `isCreator: boolean("is_creator").notNull().default(false)` to `collaborators` -- new column to hold the protected-creator flag
- [x] `src/data/types.ts` -- rename `CollaboratorRole.Owner` → `Manager: "manager"`; add `isCreator?: boolean` to `Collaborator` -- role model matches `viewer|editor|manager`
- [x] `src/lib/auth-helpers.ts` -- update `minRole` type and `roleRank` map (`owner`→`manager`) -- `assertTripAccess` ranks the renamed role
- [x] `src/app/(app)/trips/actions.ts` -- update the four `assertTripAccess(..., "owner")` call sites to `"manager"`; update `createTrip`'s collaborator insert to `role: "manager", isCreator: true` -- call sites and new-trip creation match the new model
- [x] `src/components/packt/trip-edit-collaborators.tsx` -- rename the six `role === "owner"` checks/labels/titles to `"manager"`/"Manager" -- UI lock matches renamed role
- [x] `src/db/seed-data/lisbon.ts`, `tokyo.ts`, `src/db/seed.ts` -- creator row `role: "owner"` → `role: "manager", isCreator: true` -- seed data matches new model
- [x] `tests/e2e/scenario-fixture.ts` -- `createTrip()` helper's collaborator insert `role: "owner"` → `role: "manager", isCreator: true` -- E2E-materialized trips satisfy the new invariant
- [x] `src/db/backfill-collaborator-roles.ts` (new) -- select `collaborators` grouped by `tripId` where `role='owner'`; for each trip verify exactly one row, abort loudly (throw, non-zero exit, list violating `tripId`s) if zero or multiple; else update matching rows to `role='manager', isCreator=true` in one transaction -- performs the actual data migration
- [x] `src/db/backfill-collaborator-roles.test.ts` (new, colocated) -- unit-test the three I/O-matrix scenarios (single owner, zero owners, multiple owners) against a mocked `db` -- covers the branch logic named in the I/O matrix
- [x] `package.json` -- add `"db:backfill-collaborator-roles": "tsx src/db/backfill-collaborator-roles.ts"` -- documented invocation
- [x] `src/components/packt/trip-edit-collaborators.test.tsx` -- update the two `"owner"` tests to `"manager"`/"Manager cannot be removed" -- match renamed role
- [x] `src/app/(app)/trips/actions.test.ts` -- update the `createTrip` insert assertion to expect `role: "manager"` -- match new insert
- [x] `src/lib/db-mappers.test.ts` -- add `isCreator: false` to the `BASE_COLLAB` fixture -- required after the `collaborators` schema gained a `notNull` `isCreator` column (fallout of the schema change, `tsc` failed without it)
- [x] `src/lib/auth-helpers.test.ts` (new, colocated) -- unit-test the two `assertTripAccess` I/O-matrix rows (manager-gated access denies an editor; viewer-gated access grants a manager) against a mocked `db` -- closes a Matrix Test Audit gap: `auth-helpers.ts` had no test file, so those two rows were otherwise unverified by any test

**Acceptance Criteria:**

- Given `CollaboratorRole` now has values `viewer | editor | manager`, when `trip-edit-collaborators.tsx` renders a row with `role === "manager"`, then its role select and remove control lock exactly as the prior `"owner"` row did.
- Given the four existing call sites in `trips/actions.ts`, when the project builds, then each passes `"manager"` and `tsc` reports no type errors.
- Given `trip-edit-collaborators.test.tsx`, `trip-edit-sheet.test.tsx`, and `actions.test.ts`, when run, then none reference `"owner"` as a role value and all pass.
- Given seed sources and the E2E `scenario-fixture.ts` `createTrip()` helper, when a new trip is created through them, then its creator row has `role="manager"` and `isCreator=true`.
- Given the backfill script runs against a DB with only well-formed trips (exactly one `owner` row each), when it completes, then every such row becomes `role='manager', isCreator=true` and no other row is altered.

## Spec Change Log

## Design Notes

`isCreator` is a stored column, not derived, because later stories (2.3, 3.x) need to reject mutations targeting the creator's row regardless of role — deriving "is this the creator" from `trips.ownerId === collaborators.userId` at every call site would scatter that invariant across the codebase instead of keeping it as one queryable flag.

The backfill runs as a standalone `tsx` script, not a generated Drizzle migration, because the project is in its pre-release push-only phase (`docs/drizzle-workflow.md`): `drizzle-kit push` diffs schema shape only and has no mechanism for data-backfill UPDATE statements. The script is a one-off, run manually against dev/E2E databases after the schema change lands — same shape as `src/db/reset-e2e.ts`.

## Verification

**Commands:**

- `npm run lint` -- expected: no errors
- `npx tsc --noEmit` -- expected: no type errors (confirms the four call sites and `minRole` rename type-check)
- `npx vitest run src/db/backfill-collaborator-roles.test.ts src/components/packt/trip-edit-collaborators.test.tsx src/components/packt/trip-edit-sheet.test.tsx src/app/\(app\)/trips/actions.test.ts` -- expected: all pass
- `npm run db:push` then `npm run db:backfill-collaborator-roles` against local dev DB -- expected: script reports how many trips were migrated, aborts loudly if it finds any trip with zero/multiple `owner` rows

**Manual checks (if no CLI):**

- Open the trip detail page's Collaborators rail for a seeded trip (e.g. Lisbon) and confirm the creator's row shows "Manager" with the select and remove control both locked.

## Suggested Review Order

**Data migration and invariant**

- Defines stored creator flag while retaining flexible text roles.
  [`schema.ts:260`](../../src/db/schema.ts#L260)

- Validates every trip then atomically converts only legacy owner rows.
  [`backfill-collaborator-roles.ts:21`](../../src/db/backfill-collaborator-roles.ts#L21)

**Authorization and creation**

- Ranks manager access and denies unknown legacy role values.
  [`auth-helpers.ts:22`](../../src/lib/auth-helpers.ts#L22)

- Creates new trips with a manager creator collaborator.
  [`actions.ts:221`](../../src/app/(app)/trips/actions.ts#L221)

- Preserves creator identity when database collaborators become domain data.
  [`db-mappers.ts:198`](../../src/lib/db-mappers.ts#L198)

**Collaborator interface**

- Renames locked owner controls to manager with compliant target sizing.
  [`trip-edit-collaborators.tsx:17`](../../src/components/packt/trip-edit-collaborators.tsx#L17)

**Verification and operation**

- Exercises success, invalid-owner, and no-write migration paths.
  [`backfill-collaborator-roles.test.ts:45`](../../src/db/backfill-collaborator-roles.test.ts#L45)

- Covers manager rank semantics and malformed-role denial.
  [`auth-helpers.test.ts:29`](../../src/lib/auth-helpers.test.ts#L29)

- Exposes repeatable one-off migration command.
  [`package.json:21`](../../package.json#L21)

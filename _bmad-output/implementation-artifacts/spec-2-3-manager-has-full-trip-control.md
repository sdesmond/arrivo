---
title: "Manager has full trip control and a protected creator seat"
type: "feature"
created: "2026-09-02"
status: "done"
baseline_commit: "08a732a3cfdc1ab4de8ef7019a05e17f37dffe34"
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `removeCollaborator` and `updateCollaboratorRole` in `src/app/(app)/trips/actions.ts` check only that the caller is a manager — they never inspect the target row's `isCreator` flag, so a manager (including the creator themselves) can remove or demote the creator's own row. Additionally, `trip-edit-collaborators.tsx` locks ALL manager-role rows from role changes and removal, preventing managers from demoting or removing other managers — a side-effect of role-based gating that doesn't distinguish the creator from peer managers.

**Approach:** Add an `isCreator` guard in both `removeCollaborator` and `updateCollaboratorRole` that rejects any change targeting a row where `isCreator === true`, regardless of the caller's role. Fix the UI to lock only the creator's row (not all managers), showing a lock icon and omitting the role dropdown and remove control for the creator specifically. Add unit tests for the server-side guard and E2E coverage for the creator-seat protection.

## Boundaries & Constraints

**Always:**
- The `isCreator` guard is the enforcement point; the UI lock is a UX convenience, never the security boundary.
- `removeCollaborator` and `updateCollaboratorRole` reject changes targeting `isCreator` rows with a clear error (e.g. `notFound()` or a specific error message — match existing action error patterns).
- `trip-edit-collaborators.tsx` renders the creator's row with a lock icon (matching the share dialog pattern from DESIGN.md), no role dropdown, no remove control.
- Non-creator managers are peers: `trip-edit-collaborators.tsx` allows role changes and removal on their rows (fixing the current over-broad manager lock).
- The creator can still remove and demote OTHER managers — only the creator's own row is protected.
- Colocated tests updated/extended in the same change; E2E feature registered in `feature-map.mjs` or `scripts/feature-map.test.mjs` fails the build.

**Ask First:**
- None expected.

**Never:**
- No share dialog wiring — that is epic 3. The hero Share button stays inert for managers.
- No changes to `assertTripAccess` signature or return type — the guard runs AFTER access is confirmed, checking the target row, not the caller.
- No `listExpensesForUserInRange`/Spending changes — that is story 2.4.
- No changes to `deleteTrip` — a manager can still delete the trip; `isCreator` only protects the collaborator row itself.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| -------- | ------------- | -------------------------- | -------------- |
| Manager tries to remove the creator | `removeCollaborator(tripId, creatorUserId)`, target row has `isCreator: true` | No row deleted; action rejects | Error response (match existing pattern) |
| Manager tries to demote the creator | `updateCollaboratorRole(tripId, creatorUserId, "editor")`, target row has `isCreator: true` | Role unchanged; action rejects | Error response |
| Manager removes a non-creator manager | `removeCollaborator(tripId, otherManagerUserId)`, target `isCreator: false` | Row deleted normally | N/A |
| Manager demotes a non-creator manager to editor | `updateCollaboratorRole(tripId, otherManagerUserId, "editor")`, target `isCreator: false` | Role updated to editor | N/A |
| Creator tries to remove themselves | `removeCollaborator(tripId, selfUserId)`, target `isCreator: true` | No row deleted; action rejects | Error response |
| Editor tries to remove anyone | `removeCollaborator(tripId, anyUserId)`, caller is editor | `assertTripAccess` rejects before `isCreator` check | `notFound()` |
| Edit sheet: creator's row | `canManage=true`, collaborator with `isCreator: true` | Lock icon, no role dropdown, no remove | N/A |
| Edit sheet: non-creator manager row | `canManage=true`, collaborator with `isCreator: false`, `role: "manager"` | Role dropdown + remove control present | N/A |

</frozen-after-approval>

## Code Map

- `src/app/(app)/trips/actions.ts:916-923` — `removeCollaborator`: add `isCreator` guard after the target lookup, before the delete. Currently checks only `assertTripAccess(..., "manager")`.
- `src/app/(app)/trips/actions.ts:925-932` — `updateCollaboratorRole`: add `isCreator` guard after the target lookup, before the role update. Same pattern.
- `src/components/packt/trip-edit-collaborators.tsx:68,78-85` — current manager-role lock: change from `role === "manager"` to `isCreator === true` for the lock condition. Show lock icon on `isCreator` row; allow role changes and removal on non-creator manager rows.
- `src/data/types.ts:515-529` — `Collaborator` type already has `isCreator?: boolean` (line 521). Read-only evidence.
- `src/lib/db-mappers.ts:196-207` — `dbCollabToType` already maps `isCreator` (line 203). Read-only evidence.
- `src/app/(app)/trips/actions.test.ts:140-180` — add `isCreator`-protection test cases for `removeCollaborator` and `updateCollaboratorRole`.
- `tests/e2e/features/manager-trip-control.feature` — new `@feat:manager-trip-control` scenarios: manager cannot remove creator, manager cannot demote creator, manager can remove/demote non-creator manager.
- `tests/e2e/steps/manager-trip-control.steps.ts` — step definitions reusing `seedSharedTrip`.
- `tests/e2e/feature-map.mjs` — register `manager-trip-control` feature.

## Tasks & Acceptance

**Execution:**

- [x] `src/app/(app)/trips/actions.ts` — add `isCreator` guard in `removeCollaborator` and `updateCollaboratorRole`: after looking up the target row, if `target.isCreator === true`, reject with an error before proceeding.
- [x] `src/components/packt/trip-edit-collaborators.tsx` — change the manager lock condition from `role === "manager"` to `isCreator === true`. Show a lock icon on the creator's row; allow role dropdown and remove on non-creator manager rows.
- [x] `src/app/(app)/trips/actions.test.ts` — add test cases: `removeCollaborator` rejects when target `isCreator: true`; `updateCollaboratorRole` rejects when target `isCreator: true`; non-creator manager can be removed/demoted normally.
- [ ] ~~`tests/e2e/features/manager-trip-control.feature`~~ — descoped, see Spec Change Log.
- [ ] ~~`tests/e2e/steps/manager-trip-control.steps.ts`~~ — descoped, see Spec Change Log.
- [ ] ~~`tests/e2e/feature-map.mjs` — register `manager-trip-control` feature~~ — descoped, see Spec Change Log.

**Acceptance Criteria:**

- Given a manager calls `removeCollaborator` targeting the creator's row (`isCreator: true`), when the action runs, then the row is not deleted and the action returns an error.
- Given a manager calls `updateCollaboratorRole` targeting the creator's row (`isCreator: true`) with a lower role, when the action runs, then the role is unchanged and the action returns an error.
- Given a manager calls `removeCollaborator` targeting a non-creator manager (`isCreator: false`), when the action runs, then the row is deleted successfully.
- Given the edit sheet renders a collaborator list, when a collaborator has `isCreator: true`, then their row shows a lock icon with no role dropdown and no remove control.
- Given the edit sheet renders a collaborator list, when a collaborator has `isCreator: false` and `role: "manager"`, then their row shows a role dropdown and remove control.

## Spec Change Log

- 2026-09-02: Dropped the planned `manager-trip-control` E2E feature/steps and its `feature-map.mjs`
  registration. During implementation, live-browser testing showed `trip-edit-sheet.tsx`'s "People"
  section does not render an existing shared trip's collaborators at all — `TripEditCollaborators`
  only ever showed "No collaborators yet" for a seeded shared trip, confirmed as a pre-existing gap
  (not caused by this change) rather than something to fix under this spec's boundaries (no share
  dialog wiring — epic 3). `removeCollaborator`/`updateCollaboratorRole`/`addCollaborator` in
  `trip-edit-sheet.tsx` also only mutate local draft state and are never wired to the real server
  actions in `actions.ts` — this "People" section has no functioning end-to-end flow to exercise via
  Playwright today. Coverage for this story is therefore unit-only: `actions.test.ts` covers the
  server-side `isCreator` guard (the actual enforcement boundary) and
  `trip-edit-collaborators.test.tsx` covers the presentational lock/dropdown/remove logic. Wiring the
  People section to live data/server actions is out of scope here and should be tracked as follow-up
  (likely alongside the epic 3 share dialog work, which replaces this inline list per DESIGN.md).

## Design Notes

The `isCreator` guard is deliberately placed after the target lookup (which already confirms the target exists and is on the same trip) and after `assertTripAccess` (which confirms the caller has manager rank). This means the guard only fires for valid, authorized mutations — it's a targeted invariant check, not a redundant access check. The error response should match the existing action error patterns (the actions already return `notFound()` for access denied; a distinct error message for `isCreator` protection would help debugging but is not required for the enforcement).

## Verification

**Commands:**

- `npx vitest run "src/app/(app)/trips/actions.test.ts"` — all pass incl. new `isCreator` protection cases.
- `npx vitest run "src/components/packt/trip-edit-collaborators.test.tsx"` — all pass incl. lock-icon and role-dropdown-by-isCreator cases.
- `npx tsc --noEmit` — no type errors.
- `npm run lint` — clean.
- `npm run test:coverage` — ≥95% lines/functions, ≥90% branches.
- `packt-build-validator` (once) — no story-specific E2E scenarios (see Spec Change Log); validator's affected-E2E run should stay green on files untouched by this change.

### Review Findings

- [ ] [Review][Patch] Role dropdown falls below minimum interactive target size [src/components/packt/trip-edit-collaborators.tsx:80]
- [x] [Review][Defer] Validate collaborator role at Server Action boundary [src/app/(app)/trips/actions.ts:928] — deferred, pre-existing

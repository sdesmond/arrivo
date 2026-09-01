---
title: "Viewer gets a read-only, financial-data-free trip view"
type: "feature"
created: "2026-09-01"
status: "done"
baseline_commit: "4bde41ea92b5b1ae8a4e22e31fa3bb8b2dc835fb"
review_loop_iteration: 0
context: []
---

## Intent

**Problem:** A viewer collaborator receives the exact same trip payload as a contributor — `trip.budget`, the flat `expenses` list, and per-event/per-reservation `expense` objects reach the client, and the Budget tab is always present in the trip nav — so a read-only viewer still sees money data.

**Approach:** Resolve the caller's role once in `getTripDetail` and thread it through `dbTripToType` and payload assembly, omitting every financial field for viewers; surface the role in the payload so the trip detail client drops the Budget tab and editor-only controls. Enforcement lives at the data layer — if the mapper omitted a field, nothing to render.

## Boundaries & Constraints

**Always:**
- Financial exclusion is enforced server-side at the query/mapper layer, never a parallel UI-only money hide-list; components don't re-check role to render money fields.
- Omission list is verified against every cost/price-shaped field in `src/data/types.ts` at implementation time: `Trip.budget` (line 599) and `Expense` (line 376: `amount`, `converted*`/`conversion*` block) attached as `expense` on events/reservations and in `TripDetailPayload.expenses` (line 716) — not assumed absent.
- `assertTripAccess` stays the single guard and returns the resolved role so the read path needs no second lookup.
- Colocated tests updated in the same change; data-layer enforcement means the Budget tab absence is a consequence (nothing to render).

**Ask First:**
- None expected. If you find a render path that leaks money data unreachable by payload-stripping, HALT and surface it before adding a component-level role check.

**Never:**
- Do not touch `listExpensesForUserInRange` / `buildSpendingSummary` — personal expense-report exclusion is story 2.4.
- No stored flags or persisted viewer status — role is derived from the `collaborators` row at query time.
- No "no budget" empty state or "upgrade to see this" placeholder — Budget tab is absent, not disabled, not explained.
- No new dependency, DB column, or server action.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| -------- | ------------- | -------------------------- | -------------- |
| Viewer requests trip detail | role `"viewer"`, trip with budget + linked/unlinked expenses | `trip.budget` undefined, `expenses` `[]`, no `days[].events[].expense`, `unscheduledEvents[].expense`, or `reservations[].expense`; `accessRole: "viewer"` | N/A |
| Editor/manager requests | role `"editor"`/`"manager"` | `budget`, `expenses`, per-entity `expense` included exactly as today; `accessRole` set | N/A |
| Viewer deep-links `?tab=budget` | `accessRole: "viewer"`, URL param `tab=budget` | Budget not rendered; resolves to Itinerary | Silent fallback |
| Viewer calls editor-gated mutation | e.g. `updateEvent`, `createExpense`, `uploadDocument` | Denied by `assertTripAccess(tripId, userId, "editor")` | `notFound()` |
| Viewer calls manager-gated mutation | `deleteTrip`, `addCollaborator`, `removeCollaborator`, `updateCollaboratorRole` | Denied by `assertTripAccess(tripId, userId, "manager")` | `notFound()` |

## Code Map

- `src/lib/auth-helpers.ts:22-36` — `assertTripAccess(tripId, userId, minRole = "viewer"): Promise<void>`; change return to `Promise<CollaboratorRole>` (still `notFound()` on denial). Existing call sites ignore the value.
- `src/lib/db-mappers.ts:60` — `dbTripToType(row)`; add optional `{ role?: CollaboratorRole }`; omit `budget` (lines 74-79) when `role === "viewer"`. Other call sites (`queries.ts:213,287`) pass no role → behavior unchanged.
- `src/lib/queries.ts:329-534` — `getTripDetail`: capture role from `assertTripAccess` (330), pass `{ role }` to mapper (494). For viewers: omit `expenses` (532), strip `expense` from `reservationsDomain` (396-401), day events (503-511), `unscheduledEvents` (522-526); set `accessRole`.
- `src/data/types.ts:707` — `TripDetailPayload`: add `accessRole: CollaboratorRole`.
- `src/app/(app)/trips/[tripId]/trip-detail-tabs.ts:17-31` — `resolveTripDetailTab`; accept `accessRole`, map `budget` → Itinerary for viewer (covers page-client lines 116 & 130).
- `src/app/(app)/trips/[tripId]/page-client.tsx:39-47` — filter `budget` out of `TABS` when viewer.
- `src/app/(app)/trips/[tripId]/trip-detail-hero.tsx` — hide cover edit/remove (editor-gated `setTripCoverWithAttribution`/`removeTripCover`) for viewer.
- Tests: `auth-helpers.test.ts:29` (returns role per rank; viewer denied for editor/manager — AC5/AC6 regression), `db-mappers.test.ts:82` (viewer omits budget; default/editor/manager include), `queries.test.ts:314` (viewer vs editor/manager payload), `page-client.test.tsx:183` (Budget tab absent for viewer, present for editor/manager and budget-less trips — AC4), `trip-detail-hero.test.tsx` (viewer hides cover controls). Representative action tests already assert `"editor"`/`"manager"` (`[tripId]/actions.test.ts:279`, `trips/actions.test.ts:786`, `budget/actions.test.ts:121`) — extend with a viewer-denial case where missing.

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/auth-helpers.ts` — `assertTripAccess` returns resolved `CollaboratorRole`.
- [x] `src/data/types.ts` — add `accessRole: CollaboratorRole` to `TripDetailPayload`.
- [x] `src/lib/db-mappers.ts` — omit `budget` when `role === "viewer"`.
- [x] `src/lib/queries.ts` — capture role, omit `expenses` + per-entity `expense` for viewers, set `accessRole`.
- [x] `src/app/(app)/trips/[tripId]/trip-detail-tabs.ts` — viewer-aware `resolveTripDetailTab` (budget → Itinerary).
- [x] `src/app/(app)/trips/[tripId]/page-client.tsx` — filter Budget from `TABS` for viewer.
- [x] `src/app/(app)/trips/[tripId]/trip-detail-hero.tsx` — hide cover edit/remove for viewer.
- [x] `src/lib/auth-helpers.test.ts` — assert role returns and viewer-denial for editor/manager ranks.
- [x] `src/lib/db-mappers.test.ts` — viewer omits budget; no-role/editor/manager include.
- [x] `src/lib/queries.test.ts` — viewer payload financial-free + `accessRole`; editor/manager unchanged.
- [x] `src/app/(app)/trips/[tripId]/page-client.test.tsx` — Budget tab presence/absence by role.
- [x] `src/app/(app)/trips/[tripId]/trip-detail-hero.test.tsx` — viewer hides cover controls.
- [x] `src/app/(app)/trips/[tripId]/trip-detail-tabs.test.ts` — viewer + `budget` resolves to Itinerary; non-viewer unchanged.
- [x] `tests/e2e/features/viewer-trip-access.feature` — `@feat:viewer-trip-access` scenarios: viewer opens a shared trip → itinerary renders, no Budget tab, no hero cover-edit; editor/manager → Budget tab present.
- [x] `tests/e2e/steps/viewer-trip-access.steps.ts` — materializes a second user + trip owned by them via raw scenario-owned DB inserts registered for cleanup (the same pattern `pending-invitations.steps.ts` uses for cross-user fixtures, since the trip mother's `createTrip(ownerId)` path resolves the collaborator identity from `state.currentUser`, which is wrong for a non-current owner); e2e user added as viewer/editor collaborator; asserts tab/hero differences.
- [x] `tests/e2e/feature-map.mjs` — register `entry("viewer-trip-access", [...])` (feature+step globs; exercised lib/app source already under SHARED_GLOBS so a change re-runs the full suite including this feature).

**Acceptance Criteria:**

- Given a collaborator with role `"viewer"` requests trip detail via `getTripDetail`, when assembled via `dbTripToType` + payload mapping, then `budget` is undefined, `expenses` is empty, no event/reservation carries `expense`, and `accessRole` is `"viewer"`.
- Given a collaborator with role `"editor"` or `"manager"` requests trip detail, when mapped, then budget/expense fields are included exactly as today.
- Given any event/reservation/itinerary item carrying a `cost`/`price`-shaped field, when a viewer requests trip detail, then that field is omitted — verified against every field currently defined in `src/data/types.ts`.
- Given a viewer's trip page renders with no budget fields in the returned data, when the trip detail shell builds its navigation, then no Budget tab/section entry appears — not present-but-disabled — and `?tab=budget` falls back to Itinerary.
- Given a viewer calls any itinerary/day/event/reservation/packing/document mutation action directly, when `assertTripAccess(tripId, userId, "editor")` runs, then access is denied (regression across representative mutation actions).
- Given a viewer calls `deleteTrip`, `addCollaborator`, `removeCollaborator`, or `updateCollaboratorRole`, when `assertTripAccess(tripId, userId, "manager")` runs, then access is denied.

## Spec Change Log

- E2E fixture for a trip owned by a different user (`viewer-trip-access.steps.ts`) uses scenario-owned raw DB inserts, not `scenario.materialize({ trip: { ownerId } })`. `createTrip(ownerId)` in `scenario-fixture.ts` resolves the collaborator-row identity (`ownerUser = owner ?? state.currentUser`) from `state.currentUser` whenever `ownerId` is passed, which is the *current* (invitee) user rather than the actual owner — the mother path is only exercised today with an owner created immediately beforehand. `pending-invitations.steps.ts` hits the same gap and already works around it with raw inserts; this story follows that established precedent rather than fixing `scenario-fixture.ts`, which is out of scope here.

## Design Notes

`dbTripToType` is called at `queries.ts:213,287,494`; only trip-detail passes role, keeping dashboard/spending lists byte-identical. The `Trip` type already collapses `budgetTotal`/`budgetCurrency`/`budgetPerPerson` into one `budget?: Budget` — those story fields map to it plus the payload-level `expenses`/`expense` surfaces; there is no separate flat field to strip.

## Verification

**Commands:**

- `npx vitest run src/lib/auth-helpers.test.ts src/lib/db-mappers.test.ts src/lib/queries.test.ts` — all pass incl. new role cases.
- `npx vitest run "src/app/(app)/trips/[tripId]/page-client.test.tsx" "src/app/(app)/trips/[tripId]/trip-detail-hero.test.tsx" "src/app/(app)/trips/[tripId]/trip-detail-tabs.test.ts"` — all pass.
- `npm run test:e2e:affected` (within `packt-build-validator`) — new `viewer-trip-access` feature runs; shared-glob changes pull the full suite.
- `npx tsc --noEmit` — no type errors.
- `npm run lint` — clean.
- `npm run test:coverage` — ≥95% lines/functions, ≥90% branches.
- `packt-build-validator` (once) — affected E2E (here the full suite via SHARED_GLOBS) passes.

### Review Findings

- [x] [Review][Patch] Viewer can still open write controls [src/app/(app)/trips/[tripId]/trip-detail-hero.tsx:160]
- [x] [Review][Patch] Viewer can still see attributed-cover options [src/app/(app)/trips/[tripId]/trip-detail-hero.tsx:102]
- [x] [Review][Patch] Viewer payloads retain `expense` keys with undefined values [src/lib/queries.ts:397]
- [x] [Review][Patch] E2E omits manager-access scenario required by story [tests/e2e/features/viewer-trip-access.feature:13]

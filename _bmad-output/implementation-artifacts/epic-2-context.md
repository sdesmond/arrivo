# Epic 2 Context: Role-Scoped Trip Access

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Once someone has access to a shared trip, what they can see and do matches their role exactly, enforced server-side. Viewers get a read-only itinerary with no money data anywhere they can reach it — including their own personal expense reporting. Editors can view and mutate itinerary and budget/Money items but cannot delete the trip or manage sharing. Managers hold full owner-equivalent control, and the creator's seat can never be removed or demoted by anyone.

## Stories

- Story 2.1: Viewer gets a read-only, financial-data-free trip view
- Story 2.2: Editor sees full itinerary/budget access without trip-management controls
- Story 2.3: Manager has full trip control and a protected creator seat
- Story 2.4: Viewer's shared trips excluded from personal expense reporting

## Requirements & Constraints

Role boundaries (viewer/editor/manager) are enforced server-side — a UI-only restriction satisfies nothing. Viewers see itinerary (days, events, locations) with no money, budget, or budget-report data reachable by any path, including their personal Spending summary; itinerary mutation, trip deletion, and contributor management are unavailable to them server-side. Editors may mutate itinerary and budget/money items but never delete the trip or manage sharing. Managers are granted owner-equivalent edit/delete/share control, enforced identically to the creator. `deleteTrip`/`addCollaborator`/`removeCollaborator`/`updateCollaboratorRole` require manager rank; itinerary and budget mutation actions require editor rank.

## Technical Decisions

Role model (AD-1): `collaborators.role` values are `viewer | editor | manager`; `assertTripAccess(tripId, userId, minRole)` takes the same values with ranks viewer=0, editor=1, manager=2. A new `collaborators.isCreator` boolean marks exactly one row per trip — the user in `trips.ownerId`. Only the `isCreator` row is non-removable and non-demotable; server-side rejection of any change targeting it happens regardless of the caller's own role, so the UI lock is never the enforcement point.

Viewer financial exclusion (AD-6) is threaded through two existing query call sites, with no parallel UI-only path:

- `getTripDetail(tripId, userId)` resolves the caller's role via `assertTripAccess`'s existing lookup and passes it to `dbTripToType(dbRow, { role })`. For `role === "viewer"` the mapper omits `budget`/`budgetTotal`/`budgetPerPerson`, expense/report data, and every per-event/reservation `cost`/`price`-shaped field currently defined in `src/data/types.ts` — not assumed absent. Components never re-check role to decide whether to render money fields; if the mapper omitted it, there's nothing to render.
- `listExpensesForUserInRange(userId, ...)` (feeds the personal Spending aggregation in `src/lib/spending.ts`) gains a `collaborators` join filter `role != "viewer"`, so viewer-only trips are excluded from `totalSpend`, averages, category/destination breakdowns, and budget-adherence counts. Exclusion is role-derived at query time, not a stored flag — a later role change to editor/manager restores inclusion without further work.

## UX & Interaction Patterns

A viewer's Budget tab/section is absent from trip navigation entirely — not present-but-disabled — and nothing in the itinerary view references money; there is no "upgrade to see this" placeholder, since a viewer isn't meant to know budget data exists on this trip. An editor's view has no "Delete trip" action and no Invite/Share entry point at all (not disabled-with-tooltip), matching the manager-only gating on the Share dialog trigger. A manager's view renders Delete trip and Invite exactly as the creator's does. Role is never color-only — every role surface carries a text label, and labels are exactly Viewer/Editor/Manager.

## Cross-Story Dependencies

Depends on the role-model cutover from Epic 1 (AD-1: role values, `isCreator`, `assertTripAccess` ranks) — this epic's enforcement runs against that model. The creator-seat protection established here is the same invariant Epic 3's share-dialog batch save (`saveContributorChanges`) reuses when rejecting any change targeting an `isCreator` row.
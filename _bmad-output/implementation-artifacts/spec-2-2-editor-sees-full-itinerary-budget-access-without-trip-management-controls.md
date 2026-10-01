---
title: "Editor sees full itinerary/budget access without trip-management controls"
type: "feature"
created: "2026-09-01"
status: "done"
baseline_commit: "449600db489e4ba3c9ac8127ab8e8b6478a1334b"
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** An editor collaborator already receives full itinerary/budget data (story 2.1) and is correctly denied manager-gated mutations server-side, but the trip detail UI still surfaces management controls they cannot use: `page-client.tsx:309` passes `onDelete` to the edit sheet unconditionally, the hero Share button renders for every non-viewer, and the edit sheet always renders its People (invite/role) section. None of the four manager-gated actions (`deleteTrip`, `addCollaborator`, `removeCollaborator`, `updateCollaboratorRole`) have action-level editor-denial tests.

**Approach:** Align the presentation layer to the role already resolved server-side (`accessRole`): gate "Delete trip", the Share entry point, and the edit-sheet People section to managers only — absent, not disabled — while leaving the editor's full itinerary/budget/Edit access intact. Add action-level editor-denial regression tests for the four manager-gated mutations and E2E coverage asserting the controls present/absent per role.

## Boundaries & Constraints

**Always:**
- Gating derives purely from `accessRole` on `TripDetailPayload` (already resolved by `assertTripAccess` at query time). No new payload fields, no client-side role lookup, no stored role flags.
- Editor keeps: Budget tab, Edit button, cover controls (non-viewer), and every itinerary/budget mutation — server gates already permit these; do not regress them.
- "Delete trip", "Share", and the edit-sheet People section render only when `accessRole === "manager"`. They are absent (not disabled-with-tooltip) for editor and viewer.
- Manager/creator rendering is byte-identical to today: Share, Delete trip, and People all present. Creator is `role: "manager"` + `isCreator`, so the manager check covers them.
- The existing server-side gates (`assertTripAccess`) remain the enforcement point; this story only closes the UI/role mismatch. No action signatures or `minRole` values change.
- Colocated tests updated/extended in the same change; E2E feature registered in `feature-map.mjs` or `scripts/feature-map.test.mjs` fails the build.

**Ask First:**
- None expected. If gating the People section conflicts with the epic-3 share-dialog design mid-flight, HALT and surface it.

**Never:**
- No share dialog and no `onClick` wiring on the hero Share button — that is epic 3. The button stays inert for managers.
- Do not fix the dead People add/remove/role logic (the sheet never submits collaborator changes) — that is epic-1 retro item 2 / epic 3.
- No `listExpensesForUserInRange`/Spending changes — that is story 2.4.
- No new role value, no change to role ranks, no `isCreator` exposure in the payload.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| -------- | ------------- | -------------------------- | -------------- |
| Editor opens shared trip | `accessRole: "editor"` | Budget tab + Edit button + cover controls present; Share button absent | N/A |
| Editor opens edit sheet | editor, `onDelete` omitted, `canManage=false` | No "Delete trip" button, no People section; Cancel/Save present | N/A |
| Manager/creator opens trip + sheet | `accessRole: "manager"` | Share, Delete trip, People all present (unchanged) | N/A |
| Viewer opens trip | `accessRole: "viewer"` | Unchanged from story 2.1: no Budget tab, no Share, no Edit | N/A |
| Editor calls a manager-gated action | `deleteTrip`/`addCollaborator`/`removeCollaborator`/`updateCollaboratorRole` | `assertTripAccess(..., "manager")` → `notFound()`, no row change | `notFound()` |

</frozen-after-approval>

## Code Map

- `src/app/(app)/trips/[tripId]/page-client.tsx:309` — pass `onDelete` only when `accessRole === CollaboratorRole.Manager` (else omit); add `canManage={accessRole === CollaboratorRole.Manager}` to the `TripEditSheet` props (lines 292-311).
- `src/app/(app)/trips/[tripId]/trip-detail-hero.tsx:70,159-171` — `canEdit = accessRole !== Viewer` currently gates Edit + Share + cover menu together; split so the Share button renders only when manager, leaving Edit/covers on `canEdit`.
- `src/components/packt/trip-edit-sheet.tsx` — add `canManage?: boolean` (default `true`) to `TripEditSheetProps` (33-48); render the People `Section` (258-265) only when `canManage`. Delete button is already absent when `onDelete` is undefined (270-284) — no change there.
- `src/app/(app)/trips/actions.ts:639,661,920,929` — read-only evidence: `deleteTrip`/`addCollaborator`/`removeCollaborator`/`updateCollaboratorRole` already gated `"manager"`; do not edit.
- `src/lib/auth-helpers.ts:23-37`, `src/lib/queries.ts:330-331`, `src/lib/db-mappers.ts:61-82` — read-only evidence: role resolved once, only viewer stripped; editor==manager on data.
- Tests: `src/app/(app)/trips/[tripId]/trip-detail-hero.test.tsx:175-197` (mirror the viewer `it` for editor); `page-client.test.tsx:118-121,166-182` (extend the `TripEditSheet` mock to capture `onDelete`/`canManage`); `src/components/packt/trip-edit-sheet.test.tsx` (People-by-`canManage` cases; delete-flow tests unchanged at 509-552); `src/app/(app)/trips/actions.test.ts` (mirror `inviteContributor` editor-reject at :867 for the 4 manager actions).
- E2E: mimic `tests/e2e/features/viewer-trip-access.feature` + `tests/e2e/steps/viewer-trip-access.steps.ts` (`seedSharedTrip`, Given steps are global in playwright-bdd so they can be reused). Register in `tests/e2e/feature-map.mjs:211`. `page-client.tsx` stays under `SHARED_GLOBS` (line 232) → full suite when edited.

## Tasks & Acceptance

**Execution:**

- [x] `src/app/(app)/trips/[tripId]/trip-detail-hero.tsx` — render the Share button only when `accessRole === "manager"`.
- [x] `src/app/(app)/trips/[tripId]/page-client.tsx` — gate `onDelete` to manager; pass `canManage` to the edit sheet.
- [x] `src/components/packt/trip-edit-sheet.tsx` — add `canManage` prop; render the People section only when set.
- [x] `src/app/(app)/trips/[tripId]/trip-detail-hero.test.tsx` — editor: Share absent, Edit + cover controls present; manager: Share present.
- [x] `src/app/(app)/trips/[tripId]/page-client.test.tsx` — editor/viewer: `onDelete` undefined + `canManage=false`; manager: `onDelete` defined + `canManage=true`.
- [x] `src/components/packt/trip-edit-sheet.test.tsx` — People visible by default/`canManage=true`, absent when `canManage=false`.
- [x] `src/app/(app)/trips/actions.test.ts` — action-level editor-denial assertions for `deleteTrip`, `addCollaborator`, `removeCollaborator`, `updateCollaboratorRole` (assert `"manager"` gate + denial propagates without write).
- [x] `tests/e2e/features/editor-trip-access.feature` — `@feat:editor-trip-access` scenarios: editor sees Budget tab + no Share; editor edit sheet has no Delete trip and no People; manager control: Share + Delete + People present.
- [x] `tests/e2e/steps/editor-trip-access.steps.ts` — reuse `seedSharedTrip`; add open-edit-sheet and absence assertions.
- [x] `tests/e2e/feature-map.mjs` — `entry("editor-trip-access", ["src/app/(app)/trips/[tripId]/trip-detail-hero.tsx", "src/components/packt/trip-edit-sheet.tsx"])`.

**Acceptance Criteria:**

- Given an editor requests trip detail, when mapped via `dbTripToType(dbRow, { role: "editor" })`, then budget/expense/report fields are included exactly as for a manager.
- Given an editor's trip page renders, when the trip detail shell builds its action controls, then "Delete trip" and the Share/"Invite" entry point — including the edit-sheet People section — are absent from the rendered output, not disabled-with-tooltip.
- Given an editor calls `deleteTrip`, `addCollaborator`, `removeCollaborator`, or `updateCollaboratorRole`, when `assertTripAccess(tripId, userId, "manager")` runs, then access is denied with no write (regression asserted at action level).
- Given an editor calls an itinerary or budget mutation action, when `assertTripAccess(tripId, userId, "editor")` runs, then it succeeds — existing representative regression coverage confirmed not broken by this change.

### Review Findings

- [x] [Review][Decision] Editor/viewer collaborators still see a live-looking "Delete trip" button and "People" section from the `/trips` and `/travel-history` list pages — resolved by expanding this story's scope. User directive: "Buttons representing actions that cannot be taken should not be shown at all." Applied: added `accessRole?: CollaboratorRole` to `Trip` (`src/data/types.ts`, populated only by `listTripsForUser`'s collaborator-role join); gated the manager-only Delete affordance in `trip-card.tsx`, `now-card.tsx`, `mobile-past-tab.tsx`, `trips-desktop-layout.tsx` (list-view row), `unscheduled-section.tsx` (list-view row), `trips-past-list.tsx` (list-view row); gated `canManage`/`onDelete` on the `TripEditSheet` instances in `trips/page-client.tsx` and `travel-history/page-client.tsx` via the entry's `accessRole`. Colocated tests updated/added across all touched files; unit suite green (3507 passed), full E2E suite green apart from a confirmed pre-existing flaky `trip-notes` reorder/reload scenario unrelated to this change.
- [x] [Review][Patch] Duplicated `accessRole === CollaboratorRole.Manager` condition [src/app/(app)/trips/[tripId]/page-client.tsx:309-310] — fixed: extracted a single `const canManage` and reused it for both `canManage` and `onDelete` props.
- [x] [Review][Patch] Stale open delete-confirmation dialog if `onDelete` becomes `undefined` while `isDeleteDialogOpen` is `true` [src/components/packt/trip-edit-sheet.tsx:69,274-312] — no change needed: `DeleteTripAlertDialog` itself is rendered inside `{onDelete ? (...) : null}` (line 302), so the dialog unmounts immediately once `onDelete` is undefined regardless of `isDeleteDialogOpen`'s stale value; the scenario described can't actually surface.

## Spec Change Log

## Design Notes

`canManage` defaults to `true` so the two listing-page consumers (`trips/page-client.tsx:66`, `travel-history/page-client.tsx:102`) are unchanged — those sheets open for the owner (manager). The hero Share button stays inert for managers (epic 3 wires the dialog). The People section's add/remove/role controls remain broken-but-present for managers; making them functional is epic 3 / retro item 2, not this story. Viewer behavior is untouched because `canEdit`/onDelete gating is manager-strict only — this also incidentally removes the delete and Share controls from viewers, consistent with the epic goal.

## Verification

**Commands:**

- `npx vitest run "src/app/(app)/trips/[tripId]/trip-detail-hero.test.tsx" "src/app/(app)/trips/[tripId]/page-client.test.tsx" "src/components/packt/trip-edit-sheet.test.tsx" "src/app/(app)/trips/actions.test.ts"` — all pass incl. new role cases.
- `npx tsc --noEmit` — no type errors.
- `npm run lint` — clean.
- `npm run test:coverage` — ≥95% lines/functions, ≥90% branches.
- `packt-build-validator` (once) — affected E2E passes; `page-client.tsx` and `trips/actions.ts` are SHARED so this story pulls the full E2E suite.

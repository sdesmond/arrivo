---
title: "Build the share dialog shell with active/pending/declined rows"
type: "feature"
created: "2026-09-02"
status: "done"
baseline_commit: "119f6476ab4f49f9d88e3136df3f218d6dceb92c"
review_loop_iteration: 0
context:
  - "{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Managers have no single dialog to see everyone with access to a trip plus pending/declined invitations. The trip detail page's manager-only "Share" button (`trip-detail-hero.tsx:167-172`) is a no-op, and the standalone `CollaboratorsRail` component is dead code not mounted on any page.

**Approach:** Build a read-only share dialog shell (`trip-share-dialog.tsx`) opened by wiring the hero "Share" button. It loads a new server query, `getContributorsAndInvitations(tripId, userId)`, that returns active collaborators and non-expired pending / declined invitations, gated so only managers can read invitation data. The shell lists rows (creator locked, active with role pill, pending badge, declined badge) plus a top invite form (email + role, default Viewer). Role editing, removal, resend/rescind, and the unsaved-changes guard are later stories (3.2-3.5).

## Boundaries & Constraints

**Always:**
- Only managers see and open the dialog; editor/viewer never see the Share trigger or invitation data, no matter how the query is called (`assertTripAccess(tripId, userId, "manager")`).
- Expired pending invitations are excluded from the pending grouping (matches dashboard Story 1.4 expiry filter).
- Creator's row is always rendered locked (lock icon, `aria-label="Trip creator — access can't be changed"`), never a role dropdown or remove control. Every trip has ≥1 creator row, so there is no "No collaborators yet." empty state.
- Reuse `dbCollabToType` for active collaborators in the new query; reuse existing `Dialog` primitive and existing row rhythm from `trip-edit-collaborators.tsx`.
- All interactive targets ≥44×44px; Lucide icons `strokeWidth={1.5}`; colors via CSS vars.

**Ask First:**
- None expected for this shell.

**Never:**
- No role editing, removal, resend, or rescind in this story (those are 3.2/3.4).
- Do not mount the dead `CollaboratorsRail`; do not touch the People section of `trip-edit-sheet.tsx` (its dead add/remove/role-changes are deferred to story 3.4 wiring).
- Do not build pub/sub live refetch — the `membership-changed` event (Story 1.3 / Epic 4) does not exist yet. Refetch by re-fetching on dialog open and after any mutation via `revalidatePath`.
- No schema change; roles already migrated to viewer/editor/manager.

## I/O & Edge-Case Matrix

| Scenario   | Input / State | Expected Output / Behavior | Error Handling |
| ---------- | ------------- | -------------------------- | -------------- |
| HAPPY_PATH | Manager opens dialog, trip has active + pending + declined rows | Combined list renders: creator locked row; active rows with role pill; pending rows with pending badge; declined rows with declined badge | N/A |
| EMPTY          | Trip has only the creator, no pending/declined | Shows creator locked row + top invite form only; no empty state | N/A |
| EXPIRED_PENDING | Pending invite whose `expiresAt` has passed | Excluded from pending grouping | N/A |
| MANAGER_GATE | Editor/viewer calls `getContributorsAndInvitations` directly | Invitation/declined data never returned; query rejects | `assertTripAccess(..., "manager")` -> `notFound()` |
| NO_ACCESS | Unauthenticated/unauthorized caller | No data | `assertTripAccess` -> `notFound()` / redirect |

</frozen-after-approval>

## Code Map

- `src/app/(app)/trips/[tripId]/trip-detail-hero.tsx` -- mount point; manager-only "Share" button at lines 167-172 (currently no-op). Wire `onClick` to open the dialog. `canManage` already set (line 71).
- `src/app/(app)/trips/[tripId]/page-client.tsx` -- owns hero and `canManage` (line 99); holds dialog open state and renders `TripShareDialog`. Already 319 lines (over 250) — keep the addition minimal (state + one render), defer any split.
- `src/components/packt/trip-share-dialog.tsx` -- NEW. The dialog shell: combined list + invite form. `"use client"`. Defines `TripShareDialogProps` interface. Fetches via a server action (`getShareDialogData`) on open — must NOT import the server-only `queries.ts` directly.
- `src/lib/queries.ts` -- NEW `getContributorsAndInvitations(tripId, userId)`: `assertTripAccess(tripId, userId, "manager")` then return active collaborators (`dbCollabToType`, line 196 of db-mappers) + pending/declined invitations from `invitations` (schema lines 268-291), expiring pending via `expiresAt > now()` (pattern in `src/lib/invitations.ts:50`). Excluded from coverage. `"server-only"` — callable only via server action / server context.
- `src/app/(app)/trips/[tripId]/actions.ts` -- add server action `getShareDialogData(tripId)` that calls `getContributorsAndInvitations(tripId, user.id!)` and returns the typed payload; the client dialog calls this on open. Mirrors the existing invite/accept/decline actions in this file (line 689+).
- `src/data/types.ts` -- `Collaborator` (515), `Invitation` (531), `InvitationStatus` (41), `CollaboratorRole` (34). `TripDetailPayload.accessRole` (722).
- `src/components/ui/dialog.tsx` -- Base UI `Dialog` primitive to reuse.
- `src/components/packt/trip-edit-collaborators.tsx` -- creator-lock row (66-73) + row rhythm (39-99) to mirror; `trip-edit-sheet.tsx` People tab stays untouched.
- `src/components/ui/badge.tsx`, `select.tsx`, `input.tsx`, `button.tsx` -- reusable row pill / role select / email input / invite button.
- `tests/e2e/feature-map.mjs` + `tests/e2e/features/` -- the new dialog must be mapped under a `@feat` or SHARED_GLOBS; `trip-detail-hero.tsx` currently under `viewer-trip-access`/`editor-trip-access`, `collaborators-rail.tsx` under `profile` (dead now; leave its mapping unless mounted).

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/queries.ts` -- add `getContributorsAndInvitations(tripId, userId)` returning `{ collaborators, invitations }` (active collaborators + non-expired pending + declined invitations), gated `assertTripAccess(tripId, userId, "manager")`. -- new manager-based read path for the dialog.
- [x] `src/app/(app)/trips/[tripId]/actions.ts` -- add `getShareDialogData(tripId)` server action calling the query with `user.id!` (after `requireUser()`). -- server-action bridge so the client dialog can fetch manager-gated data without importing server-only `queries.ts`.
- [x] `src/components/packt/trip-share-dialog.tsx` -- create shell with explicit `TripShareDialogProps` interface (`open`, `onOpenChange`, `tripId`); on open call `getShareDialogData` and render creator locked row + active/pending/declined list + top invite form (email input + role select default Viewer). Refetch on next open after any mutation.
- [x] `src/app/(app)/trips/[tripId]/page-client.tsx` -- add dialog open state (triggered `canManage`), render `TripShareDialog`.
- [x] `src/app/(app)/trips/[tripId]/trip-detail-hero.tsx` -- add `onShare` prop; wire the Share button `onClick`.
- [x] `src/components/packt/trip-share-dialog.test.tsx` -- colocated component tests mocking `getShareDialogData` + `sonner`: renders creator locked row (no role dropdown/remove, lock `aria-label`); renders active/pending/declined rows; creator-only trip shows no empty state; expired pending excluded; manager data passed through; fetch error shows toast / empty state.
- [x] `src/app/(app)/trips/[tripId]/trip-detail-hero.test.tsx` -- assert manager Share button calls `onShare`; editor/viewer still no Share.
- [x] `src/lib/queries.ts` -- new query is excluded from coverage; validate by review/inspection (no dedicated unit test required).
- [x] `tests/e2e/features/trip-sharing.feature` + `tests/e2e/steps/trip-sharing.steps.ts` + `tests/e2e/feature-map.mjs` entry -- manager opens dialog and sees creator/active/pending/declined rows; editor/viewer see no Share. Register `trip-share-dialog.tsx` under a `@feat` (e.g. `trip-sharing`) or SHARED_GLOBS so feature-map validation passes.

**Acceptance Criteria:**

- Given I'm a manager on a trip detail page, when I click "Share", then `trip-share-dialog.tsx` opens listing the creator plus active/pending/declined rows.
- Given I'm an editor or viewer, when I view the trip detail page, then no Share trigger is rendered.
- Given `getContributorsAndInvitations` is called by a non-manager directly, then it rejects via `assertTripAccess(..., "manager")` and returns no invitation/declined data.
- Given a trip with only the creator and no invitations, when the dialog renders, then only the creator's locked row plus the invite form shows (no empty state).
- Given a pending invitation whose `expiresAt` has passed, when the dialog loads, then it is excluded from the pending grouping.
- Given the creator's row, when rendered, then it shows a lock icon with `aria-label="Trip creator — access can't be changed"` and no role dropdown or remove control.
- Given the new dialog now exists alongside `trip-edit-sheet.tsx`'s collaborators tab, when either surface is used, then they coexist without conflict (role-editing/removal still only via the old sheet until 3.4).

## Spec Change Log

## Design Notes

The dialog is read-only shell only: row actions (resend/rescind/dismiss, role editing, removal, unsaved-changes guard) are later stories. Fetch strategy: the client dialog calls a `getShareDialogData` server action on open rather than importing the server-only `queries.ts`; this keeps invitation data out of the shared `TripDetailPayload` (which loads for editors/viewers too) and matches the existing manager-gated action convention. Live refetch on a `membership-changed` event is deferred to Epic 4 (pub/sub not built); the dialog refetches on each open, so after any mutation that revalidates the page it shows fresh state.

Row data shapes: active rows map through `dbCollabToType` producing `Collaborator` (has `isCreator`); pending/declined rows use the existing `Invitation` fields (`status`, `expiresAt`). The invite form (email + role Select default Viewer) renders the invite action in a later story; for 3.1 keep the submit button disabled with a `title` explaining it becomes available in a later story — never a silently no-op submit.

## Verification

**Commands:**

- `npm run test:coverage` -- expected: existing + new packt component tests pass; coverage thresholds hold.
- `npm run test:e2e:affected` -- expected: the new `trip-sharing` feature and affected trip-access features pass.
- `npm run build` -- expected: production build succeeds (feature-map validation passes).

**Manual checks (if no CLI):**

- As manager on a trip detail page, click Share and confirm the dialog opens with creator/active/pending/declined rows and no stale pending badge.
- As editor/viewer, confirm no Share trigger appears.

## Suggested Review Order

**Entry point**

- Keeps sharing state manager-only while mounting dialog from trip detail.
  [page-client.tsx:217](../../src/app/%28app%29/trips/%5BtripId%5D/page-client.tsx#L217)

**Data boundary**

- Bridges client fetches through authenticated server action.
  [actions.ts:45](../../src/app/%28app%29/trips/%5BtripId%5D/actions.ts#L45)

- Enforces manager access and excludes expired pending invitations at query source.
  [queries.ts:343](../../src/lib/queries.ts#L343)

**Dialog behavior**

- Fetches fresh rows per open, announces loading, and renders locked/status rows.
  [trip-share-dialog.tsx:41](../../src/components/packt/trip-share-dialog.tsx#L41)

- Preserves creator immutability and displays active, pending, and declined records.
  [trip-share-dialog.tsx:133](../../src/components/packt/trip-share-dialog.tsx#L133)

**Verification**

- Verifies manager gate uses required access level before querying rows.
  [queries.test.ts:94](../../src/lib/queries.test.ts#L94)

- Exercises creator, status, Viewer-default, loading, and error dialog states.
  [trip-share-dialog.test.tsx:58](../../src/components/packt/trip-share-dialog.test.tsx#L58)

- Covers expired-invitation exclusion through browser and database path.
  [trip-sharing.feature:5](../../tests/e2e/features/trip-sharing.feature#L5)

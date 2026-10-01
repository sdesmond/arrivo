---
title: "Sprint Change Proposal: Wire invite form and remove dead collaborator surfaces"
created: "2026-09-03"
status: "approved"
scope: "minor"
---

## Issue Summary

The share dialog (`trip-share-dialog.tsx`) renders an email input and role select, but the Invite button is hardcoded `disabled` with placeholder text: *"Invite controls will be available in a later story."* No story was ever written to connect the form to the `inviteContributor` server action (built in Story 1.2).

Two additional dead code surfaces compound the problem:
- `collaborators-rail.tsx` is never mounted on any page — its Invite button has no `onClick` handler.
- `trip-edit-collaborators.tsx` (the People section in the trip edit sheet) has `onAdd`/`onRemove`/`onUpdateRole` handlers that only mutate local draft state — `getPatch()` never includes a `collaborators` field, so no changes are saved server-side. This is a dead UI.

The epic-1 retro already flagged the dead `trip-edit-sheet.tsx` People section as an open action item.

## Impact Analysis

**Epic impact:** Epic 3 is missing a story. The invite flow (FR1, CAP-1) has a working server action but no UI to trigger it from the share dialog. The feature's primary use case — inviting a collaborator — is broken.

**Story impact:**
- Story 3.1 (done): Design notes explicitly deferred the invite wiring to "a later story." No such story was created.
- Story 3.4 (backlog): Its AC includes removing `trip-edit-collaborators.tsx` and the legacy `addCollaborator`/`removeCollaborator`/`updateCollaboratorRole` actions. This work is pulled forward into the new story.
- Sprint-status action items: Epic-1-retro-item-2 (dead People UI) and Epic-1-retro-item-6 (isCreator guard extraction, deferred to 3.4) are affected.

**Artifact conflicts:** None. The spec (FR1/CAP-1), architecture (AD-5/AD-7), and UX design (UX-DR1) are all correct. The gap is purely in the story breakdown.

**Technical impact:** Server action `inviteContributor` exists and is tested (`actions.test.ts:890`). Dialog shell exists with email/role inputs wired to local state. Wiring is straightforward — remove `disabled`, add `onClick`, handle success/error, refetch dialog data.

## Recommended Approach

**Option 1: Direct Adjustment** — Add a new story (3.3) to Epic 3, renumber existing 3.3→3.4, 3.4→3.5, 3.5→3.6.

Effort: Low. Risk: Low. The server action and dialog shell are complete and tested. This is wiring work on existing foundations.

## Detailed Change Proposals

### New Story: 3.3 — Wire invite form and remove dead collaborator surfaces

**Wire the invite form in `trip-share-dialog.tsx`:**
- Remove `disabled` and placeholder title from the Invite button (line 191-200)
- Add `inviteLoading` state to disable the button during the request
- Add `onClick` handler that calls `inviteContributor(tripId, email, role)` from `@/(app)/trips/[tripId]/actions`
- On success: refetch dialog data via `getShareDialogData`, clear email input, reset role to Viewer, show `toast.success("Invitation sent.")`
- On validation error ("No Packt account found"): show inline error text below the email input per UX-DR1
- On other errors: `toast.error(result.message)`
- Remove the header placeholder text *"Invite controls will be available in a later story"* (line 154)

**Remove `collaborators-rail.tsx` (dead code):**
- Delete `src/components/packt/collaborators-rail.tsx`
- Delete `src/components/packt/collaborators-rail.test.tsx`
- Remove the re-export from `src/components/packt/trip-rail.tsx` (line 5)
- Remove from `tests/e2e/feature-map.mjs` `profile` entry (line 121)

**Remove `trip-edit-collaborators.tsx` and its wiring in `trip-edit-sheet.tsx`:**
- Delete `src/components/packt/trip-edit-collaborators.tsx`
- Delete `src/components/packt/trip-edit-collaborators.test.tsx`
- In `src/components/packt/trip-edit-sheet.tsx`:
  - Remove `TripEditCollaborators` import (line 24)
  - Remove `Collaborator` and `CollaboratorRole` type imports (lines 12-13)
  - Remove `removeCollaborator` function (lines 102-111)
  - Remove `updateCollaboratorRole` function (lines 112-119)
  - Remove `addCollaborator` function (lines 120-132)
  - Remove the `{canManage ? <Section title="People">...</Section> : null}` block (lines 264-273)
  - Remove `collaborators` deep copy from `createTripDraft` (line 342)
- In `src/components/packt/trip-edit-sheet.test.tsx`:
  - Remove `vi.mock("./trip-edit-collaborators", ...)` block (lines 30-47)
  - Remove People section tests: "shows the People section when canManage" (lines 235-248), "hides the People section when canManage is false" (lines 250-263)
  - Remove collaborator callback tests: "addCollaborator via TripEditCollaborators callback" (lines 468-473), "removeCollaborator via TripEditCollaborators callback" (lines 475-484), "updateCollaboratorRole with collaborators" (lines 486-495), "updateCollaboratorRole with no collaborators" (lines 497-502)

**Tests for the new invite wiring:**
- `src/components/packt/trip-share-dialog.test.tsx`: add tests for invite button enabled state, successful invite (refetch + input clear + toast), validation error for unmatched email, server error toast
- Update `tests/e2e/features/trip-sharing.feature` + steps: manager enters email, clicks Invite, sees new contributor in list

### Sprint Status Updates

**Renumber stories:**
- Current 3.3 "Dismiss a declined invitation" → 3.4
- Current 3.4 "Stage and save role changes and removals as one batch" → 3.5
- Current 3.5 "Unsaved-changes guard on dialog close" → 3.6

**New entry:**
- `3-3-wire-invite-form-and-remove-dead-collaborator-surfaces: backlog`

**Action items:**
- Mark epic-1-retro-item-2 (dead People UI) as done — resolved by this story
- Story 3.4's AC already covers legacy action removal; the new story 3.3 pulls the UI removal forward. Story 3.5 (formerly 3.4) retains `saveContributorChanges` batch logic and the remaining legacy action cleanup.

### Feature Map Updates

- Remove `src/components/packt/collaborators-rail.tsx` from `profile` entry
- `trip-edit-collaborators.tsx` is covered by the `trips` glob `src/components/packt/trip-edit-*.tsx` — deletion is safe (glob won't match a deleted file)
- `trip-share-dialog.tsx` is already mapped under `trip-sharing` — no change needed

## Implementation Handoff

**Scope:** Minor — direct implementation by Developer agent.

**Deliverables:**
1. New story spec file: `spec-3-3-wire-invite-form-and-remove-dead-collaborator-surfaces.md`
2. Updated `sprint-status.yaml` with renumbered stories and new entry
3. Updated `epic-3-context.md` with new story in the list
4. Code changes per the file list above

**Success criteria:**
- Invite button in share dialog calls `inviteContributor` and shows results
- `collaborators-rail.tsx` no longer exists
- `trip-edit-collaborators.tsx` no longer exists
- `trip-edit-sheet.tsx` has no People section, no collaborator imports, no dead functions
- All existing tests pass; new invite-wire tests pass
- `npm run test:coverage` and `npm run build` succeed

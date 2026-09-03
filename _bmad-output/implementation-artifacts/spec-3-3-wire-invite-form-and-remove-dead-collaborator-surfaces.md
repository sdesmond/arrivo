---
title: "Wire invite form and remove dead collaborator surfaces"
type: "feature"
created: "2026-09-03"
status: "done"
baseline_commit: "94bd978ef9ece4a5510464c11039d1e7f2fa1ac1"
review_loop_iteration: 0
context:
  - "{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The share dialog renders an email input and role select, but the Invite button is hardcoded `disabled` with placeholder text. No story was ever written to connect the form to the `inviteContributor` server action (built in Story 1.2). Two additional dead collaborator surfaces exist: `collaborators-rail.tsx` (never mounted, Invite button has no `onClick`) and `trip-edit-collaborators.tsx` (People section in the edit sheet — handlers only mutate local draft, `getPatch()` never includes collaborators, so no changes are saved server-side).

**Approach:** Wire the invite form in `trip-share-dialog.tsx` to call `inviteContributor`, handle success/error, and refetch dialog data. Remove all dead collaborator surfaces: `collaborators-rail.tsx` + test + re-export, `trip-edit-collaborators.tsx` + test + all wiring in `trip-edit-sheet.tsx` (imports, functions, JSX, draft copy).

## Boundaries & Constraints

**Always:**
- Invite button calls `inviteContributor(tripId, email, role)` from `src/app/(app)/trips/actions.ts` (NOT `[tripId]/actions.ts` — the action lives in the parent route).
- On success (`"invited"` or `"resent"`): refetch dialog data via `getShareDialogData`, clear email input, reset role to Viewer, show `toast.success("Invitation sent.")` or `toast.success("Invitation resent.")`.
- On validation error (`"error"` status): show inline error text below the email input per UX-DR1 ("No Packt account found for this email.") for the unmatched-email case; `toast.error(result.message)` for other errors.
- Button disabled while request is in flight; email input and role select also disabled during flight.
- Remove the header placeholder text *"Invite controls will be available in a later story"* from `trip-share-dialog.tsx:154`.
- All interactive targets ≥44×44px; Lucide icons `strokeWidth={1.5}`; colors via CSS vars.
- `inviteContributor` is imported from `@/app/(app)/trips/actions` (the SHARED_GLOB action file), not from `[tripId]/actions`.

**Ask First:** None expected.

**Never:**
- Do not modify the `inviteContributor` server action itself — it is tested and working.
- Do not add live-sync refetch — the dialog re-fetches on next open or after `revalidatePath`. Epic 4 handles real-time updates.
- Do not touch story 3.4/3.5/3.6 scope (dismiss declined, staged role changes, unsaved-changes guard).
- Do not leave any dead imports, functions, or JSX referencing `TripEditCollaborators`, `Collaborator` (in trip-edit-sheet), `CollaboratorRole` (in trip-edit-sheet), `removeCollaborator`, `updateCollaboratorRole`, or `addCollaborator` in `trip-edit-sheet.tsx`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| INVITE_HAPPY | Email matches existing Packt user, no active/pending membership | Invitation created, dialog refetches, input cleared, role reset to Viewer, toast "Invitation sent." | N/A |
| INVITE_RESEND | Email already has a pending invitation for this trip | Existing row updated in place, dialog refetches, toast "Invitation resent." | N/A |
| INVITE_NO_ACCOUNT | Email has no matching Packt account | No invitation created, inline error "No Packt account found for this email." below input | N/A |
| INVITE_SELF | Email matches the inviting manager's own account | toast.error "You cannot invite yourself to this trip" | N/A |
| INVITE_ALREADY_COLLAB | Email matches an existing active collaborator on this trip | toast.error "This person is already a collaborator on this trip" | N/A |
| INVITE_IN_FLIGHT | Request in progress | Button disabled, email/role inputs disabled, button shows loading state | N/A |
| EDITOR_NO_INVITE | Editor or viewer views trip detail | No Share trigger rendered (existing 3.1 behavior, no change) | N/A |
| REMOVE_COLLAB_RAIL | collaborators-rail.tsx deleted | No imports or re-exports reference it; trip-rail.tsx no longer re-exports it | N/A |
| REMOVE_EDIT_COLLAB | trip-edit-collaborators.tsx deleted | trip-edit-sheet.tsx has no People section, no collaborator imports/functions/draft copy; test has no collaborator mock or tests | N/A |

</frozen-after-approval>

## Code Map

- `src/components/packt/trip-share-dialog.tsx` -- The dialog to wire. Email input L172, role select L181, disabled Invite button L191-200, placeholder text L154. State: `email` L57, `role` L58. Currently imports from `@/app/(app)/trips/[tripId]/actions` L6.
- `src/app/(app)/trips/actions.ts` -- `inviteContributor` at L689. Takes `(tripId, email, role)`, returns `InviteContributorResult`. Import path is `@/app/(app)/trips/actions` (NOT `[tripId]/actions`).
- `src/components/packt/trip-share-dialog.test.tsx` -- Existing tests. L93-103 asserts Invite button is disabled; must change to assert enabled + test invite flow. Mock must add `inviteContributor`.
- `src/components/packt/collaborators-rail.tsx` -- DELETE entirely. Dead component, never mounted. Invite button at L53-56 has no onClick.
- `src/components/packt/collaborators-rail.test.tsx` -- DELETE entirely.
- `src/components/packt/trip-rail.tsx` -- L5 re-exports `CollaboratorsRail`; remove that line.
- `src/components/packt/trip-edit-collaborators.tsx` -- DELETE entirely. Dead UI: local-draft-only add/remove/role-change handlers.
- `src/components/packt/trip-edit-collaborators.test.tsx` -- DELETE entirely.
- `src/components/packt/trip-edit-sheet.tsx` -- Remove: `TripEditCollaborators` import L24, `Collaborator`/`CollaboratorRole` type imports L12-13, `removeCollaborator` L102-111, `updateCollaboratorRole` L112-119, `addCollaborator` L120-132, People section JSX L264-273, `collaborators` deep copy in `createTripDraft` L342.
- `src/components/packt/trip-edit-sheet.test.tsx` -- Remove: `vi.mock("./trip-edit-collaborators")` L30-47, People section tests L235-263, collaborator callback tests L468-502.
- `tests/e2e/feature-map.mjs` -- L121: already removed `collaborators-rail.tsx` from `profile` entry. `trip-edit-*.tsx` covered by `trips` glob L201 (safe — glob won't match deleted file). `trip-share-dialog.tsx` covered by `trip-sharing` L188.
- `src/data/types.ts` -- `InviteContributorResult` L860-863, `CollaboratorRole` L34-39, `Collaborator` L515-529. Types are correct; no changes needed.

## Tasks & Acceptance

**Execution:**

- [x] `src/components/packt/trip-share-dialog.tsx` -- Remove placeholder text L154. Import `inviteContributor` from `@/app/(app)/trips/actions`. Add `inviteLoading` state. Add `handleInvite` function: disables button during flight, calls `inviteContributor(tripId, email, role)`, on success refetches via `getShareDialogData` + clears email + resets role + toast, on validation error sets inline error, on other error toast.error. Remove `disabled` and placeholder `title` from Invite button, wire `onClick={handleInvite}`, disable during `inviteLoading`. Add inline error display below email input. Wire `disabled={inviteLoading}` on email input and role select.
- [x] `src/components/packt/trip-share-dialog.test.tsx` -- Add `inviteContributor` to mock. Update empty-state test to assert Invite button is enabled (not disabled). Add tests: successful invite refetches + clears input + toast, validation error shows inline text, server error shows toast, button disabled during flight.
- [x] `src/components/packt/collaborators-rail.tsx` -- DELETE file.
- [x] `src/components/packt/collaborators-rail.test.tsx` -- DELETE file.
- [x] `src/components/packt/trip-rail.tsx` -- Remove `export { CollaboratorsRail } from "./collaborators-rail"` L5.
- [x] `src/components/packt/trip-edit-collaborators.tsx` -- DELETE file.
- [x] `src/components/packt/trip-edit-collaborators.test.tsx` -- DELETE file.
- [x] `src/components/packt/trip-edit-sheet.tsx` -- Remove `TripEditCollaborators` import L24, `Collaborator`/`CollaboratorRole` type imports L12-13, `removeCollaborator` L102-111, `updateCollaboratorRole` L112-119, `addCollaborator` L120-132, People section JSX L264-273, `collaborators` deep copy L342.
- [x] `src/components/packt/trip-edit-sheet.test.tsx` -- Remove `vi.mock("./trip-edit-collaborators")` L30-47, People section tests L235-263, collaborator callback tests L468-502.
- [x] `tests/e2e/feature-map.mjs` -- Verify `collaborators-rail.tsx` removed from `profile` entry (already done in sprint change). Confirm no other references.
- [x] Run `npm run test:coverage` -- existing + new tests pass, coverage thresholds hold.
- [x] Run `npm run build` -- production build succeeds, feature-map validation passes.

**Acceptance Criteria:**

- Given I'm a manager viewing a trip's share dialog, when I enter a valid email and click Invite, then `inviteContributor` is called, the dialog refetches, the input clears, and I see a success toast.
- Given I enter an email with no matching Packt account, when I click Invite, then an inline error "No Packt account found for this email." appears below the input.
- Given a request is in flight, when the dialog renders, then the Invite button, email input, and role select are all disabled.
- Given the Invite button in the share dialog, when rendered, then it is enabled (not hardcoded `disabled`).
- Given `collaborators-rail.tsx`, when the codebase is searched, then no file imports or references it.
- Given `trip-edit-collaborators.tsx`, when the codebase is searched, then no file imports or references it.
- Given `trip-edit-sheet.tsx`, when rendered, then no "People" section appears regardless of `canManage` prop.
- Given `trip-edit-sheet.tsx`, when `getPatch()` is called, then no collaborator-related fields are included (already the case — verified by removing dead code).
- Given the placeholder text "Invite controls will be available in a later story", when the share dialog renders, then it is absent.

## Spec Change Log

## Verification

**Commands:**

- `npm run test:coverage` -- expected: all existing + new packt component tests pass; coverage thresholds hold.
- `npm run test:e2e:affected` -- expected: `trip-sharing` feature and affected features pass.
- `npm run build` -- expected: production build succeeds (feature-map validation passes).

**Manual checks (if no CLI):**

- As manager on a trip detail page, open Share dialog, enter a valid email, click Invite — confirm toast and new contributor appears in list.
- Enter an email with no Packt account — confirm inline error appears.
- Confirm no "People" section in the trip edit sheet.
- Confirm `CollaboratorsRail` is not importable from `trip-rail.tsx`.

## Suggested Review Order

**Invite form wiring**

- Core invite handler: call, success/error/refetch, loading state
  [`trip-share-dialog.tsx:64`](../../src/components/packt/trip-share-dialog.tsx#L64)

- Invite button, email input, role select, inline error display
  [`trip-share-dialog.tsx:200`](../../src/components/packt/trip-share-dialog.tsx#L200)

**Dead collaborator surface removal**

- Trip edit sheet: People section, collaborator functions, draft copy removed
  [`trip-edit-sheet.tsx:96`](../../src/components/packt/trip-edit-sheet.tsx#L96)

- Trip rail: CollaboratorsRail re-export removed
  [`trip-rail.tsx:5`](../../src/components/packt/trip-rail.tsx#L5)

- E2E editor-trip-access: People assertion flipped
  [`editor-trip-access.feature:21`](../../tests/e2e/features/editor-trip-access.feature#L21)

**Tests**

- Share dialog tests: invite flow, inline error, in-flight disable, refetch-failure
  [`trip-share-dialog.test.tsx:234`](../../src/components/packt/trip-share-dialog.test.tsx#L234)

- Edit sheet tests: collaborator mock and People tests removed
  [`trip-edit-sheet.test.tsx:213`](../../src/components/packt/trip-edit-sheet.test.tsx#L213)

**Config**

- Feature map: collaborators-rail removed from profile entry
  [`feature-map.mjs:118`](../../tests/e2e/feature-map.mjs#L118)

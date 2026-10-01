---
title: "Resend and Rescind a pending invitation"
type: "feature"
created: "2026-09-03"
status: "done"
baseline_commit: "9ed472b7f43bb0ab76a1d9f6d1dd33fb7918e63e"
review_loop_iteration: 0
context:
  - "{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The share dialog's pending invitation rows (built in Story 3.1) are display-only — a manager cannot resend a stale invite or cancel one without leaving the dialog. The server logic for rescind exists (`rescindInvitation` in `trips/actions.ts:891`) but has no share-dialog wrapper, and resend is only embedded inside `inviteContributor` (`trips/actions.ts:724-732`) with no standalone function or action.

**Approach:** Add a standalone `resendInvitation` function to `src/lib/invitations.ts` that resets `expiresAt` on a pending row (matching the existing resend logic inside `inviteContributor`). Wire both resend and rescind as server actions in `[tripId]/actions.ts` so the share dialog can call them directly. Add Resend and Rescind icon buttons to pending rows in `trip-share-dialog.tsx` — each fires immediately on click with no confirmation, updates the row state in place (resend refreshes the badge timestamp; rescind removes the row), and surfaces errors via toast.

## Boundaries & Constraints

**Always:**
- Both actions are manager-only: the server action calls `requireUser()` then `assertTripAccess(tripId, userId, "manager")`.
- Each action verifies `invitation.tripId === tripId` before acting, not just the caller's manager role on some trip — an invitationId belonging to a different trip is rejected.
- Resend resets `expiresAt` to `now() + 72h` on a `status='pending'` row where `tripId` matches. If the row is not pending or not found, return an error result.
- Rescind sets `status='rescinded'` on a `status='pending'` row where `tripId` matches. If the row is not pending or not found, return an error result.
- Pending row controls carry `title="Resend invitation to {email}"` / `title="Rescind invitation to {email}"` for accessibility.
- All interactive targets ≥44×44px; Lucide icons `strokeWidth={1.5}`; colors via CSS vars.

**Ask First:** None expected.

**Never:**
- No confirmation dialogs for Resend or Rescind — both act immediately.
- Do not modify the invite form (email + role select) — that is still disabled, wired in a later story.
- Do not add live-sync refetch — the dialog re-fetches on next open or after `revalidatePath`. Epic 4 handles real-time updates.
- Do not touch `trip-edit-sheet.tsx` or `trip-edit-collaborators.tsx`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| RESEND_HAPPY | Pending row, manager clicks Resend | `expiresAt` reset to now+72h, row badge timestamp updates in place, toast "Invitation resent." | N/A |
| RESCIND_HAPPY | Pending row, manager clicks Rescind | `status` becomes `rescinded`, row disappears from dialog list, toast "Invitation rescinded." | N/A |
| RESEND_NOT_PENDING | Row is `rescinded`/`accepted`/`declined`/`expired` | Action returns error | toast.error with descriptive message |
| RESCIND_NOT_PENDING | Row is `rescinded`/`accepted`/`declined`/`expired` | Action returns error | toast.error with descriptive message |
| WRONG_TRIP | invitationId belongs to a different trip | Action rejects | toast.error |
| EDITOR_CALLS | Editor (not manager) calls either action | Rejected server-side before any DB read | notFound() |
| LOADING_STATE | Action in flight | Button shows loading indicator, sibling button disabled | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/invitations.ts` -- add `resendInvitation(invitationId, tripId, userId)` standalone function: assert manager, verify tripId match, reset `expiresAt` on pending row. Pattern mirrors existing `rescindInvitation` in `trips/actions.ts:891`.
- `src/app/(app)/trips/[tripId]/actions.ts` -- add `resendShareInvitation(tripId, invitationId)` and `rescindShareInvitation(tripId, invitationId)` server actions calling through to the logic in `invitations.ts` / `trips/actions.ts`. Pattern matches existing `getShareDialogData` at line 45.
- `src/app/(app)/trips/actions.ts` -- contains `rescindInvitation` (line 891) and `inviteContributor` (line 689, resend logic at 724-732). Resend logic to extract into `invitations.ts`; rescind logic to move or have the new `invitations.ts` function called from the new wrapper.
- `src/components/packt/trip-share-dialog.tsx` -- pending row section (lines 192-234) currently display-only. Add Resend + Rescind icon buttons per pending row; on click call the server action, update local state, show toast.
- `src/data/types.ts` -- `Invitation` (line 531), `InvitationStatus` (line 41), `RescindInvitationResult` (line 556). Add `ResendInvitationResult` type alongside.
- `src/components/packt/trip-share-dialog.test.tsx` -- existing 5 tests (line 58). Add tests for: Resend button renders on pending row, Rescind button renders on pending row, click Resend calls server action and updates row, click Rescind calls server action and removes row, error toast on failure.
- `src/app/(app)/trips/actions.test.ts` -- existing `rescindInvitation` tests (line 1384). Add tests for new `resendInvitation` in `invitations.test.ts` and for the `[tripId]/actions.ts` wrappers.
- `tests/e2e/features/trip-sharing.feature` -- existing 3 scenarios (line 6). Add scenarios for: manager resends a pending invitation (badge timestamp updates), manager rescinds a pending invitation (row disappears).
- `tests/e2e/feature-map.mjs` -- verify `trip-share-dialog.tsx` is mapped under `@feat:trip-sharing` (from Story 3.1).

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/invitations.ts` -- add `resendInvitation(invitationId, tripId, userId)` returning `ResendInvitationResult`: assert manager via `assertTripAccess`, verify `invitation.tripId === tripId`, update `expiresAt` to `now() + 72h` WHERE `id = ? AND tripId = ? AND status = 'pending'`, return success or error. Extract the resend logic currently at `trips/actions.ts:724-732` into this function.
- [x] `src/data/types.ts` -- add `ResendInvitationResult = { status: "success" } | { status: "error"; message: string }` alongside `RescindInvitationResult` (line 556).
- [x] `src/app/(app)/trips/[tripId]/actions.ts` -- add `resendShareInvitation(tripId, invitationId)` and `rescindShareInvitation(tripId, invitationId)` server actions: each calls `requireUser()`, delegates to the logic in `invitations.ts` or existing `rescindInvitation` in `trips/actions.ts`, returns the result.
- [x] `src/components/packt/trip-share-dialog.tsx` -- on each pending row, add Resend icon button (`RotateCw` or `RefreshCw`) and Rescind icon button (`XCircle` or `Ban`). On click: call the server action, on success update local state (resend: update `expiresAt` in the invitation in state; rescind: filter the invitation out), show `toast.success`. On error: `toast.error`. Disable sibling button while one is in flight.
- [x] `src/lib/invitations.test.ts` -- add unit tests for `resendInvitation`: happy path resets expiresAt, rejects non-pending row, rejects missing row, rejects editor, rejects wrong trip.
- [x] `src/components/packt/trip-share-dialog.test.tsx` -- add tests: pending row renders Resend + Rescind buttons with correct titles; click Resend calls action and updates timestamp; click Rescind calls action and removes row; error shows toast.
- [x] `tests/e2e/features/trip-sharing.feature` + step definitions -- add scenarios: manager resends pending invitation (row stays, timestamp updates); manager rescinds pending invitation (row disappears).

**Acceptance Criteria:**

- Given a pending row, when I click Resend, then the existing resend logic runs immediately with no confirmation, resetting `expiresAt`, and the row's badge timestamp updates in place.
- Given a pending row, when I click Rescind, then the invitation's `status` becomes `rescinded` immediately with no confirmation, and the row disappears from the dialog's list.
- Given I'm an editor, not a manager, when I call resend or rescind directly, then it's rejected server-side.
- Given an `invitationId` that belongs to a different trip, when resend or rescind is called with that id, then it's rejected.
- Given any pending row, when rendered, then its controls carry `title="Resend invitation to {email}"` / `title="Rescind invitation to {email}"`.

### Review Findings

- [x] [Review][Patch] Resend logic not actually extracted from `inviteContributor` (Task 68) — Task 68 called for extracting `inviteContributor`'s inline resend branch (`trips/actions.ts:724-732`) into the new `resendInvitation`; only the TTL math was shared via `getInvitationExpiry()`, the row-update logic remains duplicated in both places. Fixed: extracted a shared `applyInvitationResend(executor, invitationId, tripId, expiresAt, role?)` helper in `invitations.ts`, called from both `resendInvitation` and `inviteContributor`'s transaction. [src/app/(app)/trips/actions.ts:724, src/lib/invitations.ts:70]
- [x] [Review][Patch] Sibling resend/rescind button shows wrong loading spinner and aria-label — Fixed: `pendingInvitationId` replaced with `pendingAction: { invitationId, action }`; only the clicked button's icon swaps to a spinner, the sibling stays disabled without one. [src/components/packt/trip-share-dialog.tsx:316]
- [x] [Review][Patch] Redundant double auth check on resend/rescind wrappers — Fixed: `resendShareInvitation`/`rescindShareInvitation` no longer call `assertTripAccess` themselves; the delegated `resendInvitation`/`rescindInvitation` already check it. [src/app/(app)/trips/[tripId]/actions.ts:52]
- [x] [Review][Patch] Client-side invitation-expiry TTL duplicated, drift undetected by tests — Fixed: `ResendInvitationResult` now carries the server-persisted `expiresAt`; the dialog renders that value instead of recomputing it from a duplicated TTL constant. [src/components/packt/trip-share-dialog.tsx:34]
- [x] [Review][Patch] Missing rescind-failure-path test — Fixed: added a rescind-failure test mirroring the existing resend-failure test. [src/components/packt/trip-share-dialog.test.tsx]
- [x] [Review][Patch] resendInvitation it.each doesn't vary status per case — Fixed: collapsed to one honestly-named test since the code doesn't discriminate by specific status. [src/lib/invitations.test.ts:139]
- [x] [Review][Patch] Module-level mutable state in trip-sharing E2E steps — Fixed: switched to `scenario.setValue`/`getValue`. [tests/e2e/steps/trip-sharing.steps.ts:10]
- [x] [Review][Defer] resendInvitation's pending guard doesn't check expiresAt, could revive an expired row [src/lib/invitations.ts:82] — deferred, pre-existing, narrow race already mitigated by the dialog's own list-filtering query
- [x] [Review][Defer] No unmount guard on resend/rescind async handlers [src/components/packt/trip-share-dialog.tsx:65] — deferred, pre-existing pattern gap, no-op under React 18

## Spec Change Log

## Design Notes

Resend logic already exists inline inside `inviteContributor` (`trips/actions.ts:724-732`) — it updates the existing pending row's `expiresAt` when the same email is re-invited. The standalone `resendInvitation` in `invitations.ts` extracts and generalizes this: it takes an `invitationId` instead of an email, and is callable from the share dialog's Resend button without going through the invite form.

Rescind already has a standalone function (`rescindInvitation` at `trips/actions.ts:891`). The new `[tripId]/actions.ts` wrapper delegates to it rather than duplicating the logic.

The share dialog's local state update after a successful action avoids a full refetch — Resend mutates the `expiresAt` field in the existing state object; Rescind filters the invitation out of the array. This keeps the interaction snappy. The dialog still re-fetches fresh data on next open via `revalidatePath`.

## Verification

**Commands:**

- `npm run test:coverage` -- expected: existing + new unit tests pass; coverage thresholds hold.
- `npm run test:e2e:affected` -- expected: trip-sharing feature and affected trip-access features pass.
- `npm run build` -- expected: production build succeeds.

**Manual checks (if no CLI):**

- As manager, open share dialog on a trip with a pending invitation. Click Resend — confirm the badge timestamp refreshes and a success toast appears.
- As manager, click Rescind on a pending row — confirm the row disappears and a success toast appears.
- As editor/viewer, confirm no Resend/Rescind buttons are rendered (Share dialog not accessible).

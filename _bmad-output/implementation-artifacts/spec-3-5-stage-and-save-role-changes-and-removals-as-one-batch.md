---
title: "Stage and save role changes and removals as one batch"
type: "feature"
created: "2026-09-03"
status: "done"
baseline_commit: "524d8f06add801460a0f5e85fa09b73a1d682762"
review_loop_iteration: 1
context:
  - "{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The share dialog renders collaborators read-only. Today a manager can change roles or remove a contributor only through the legacy actions no longer wired to any UI, so role/removal edits are impossible from the dialog that is becoming the single control plane.

**Approach:** Give non-creator collaborator rows a role selector and a remove control that stage edits client-side (keyed by `collaboratorId`, latest edit per row wins), then apply all staged edits with one atomic server action, `saveContributorChanges(tripId, changes)`, inside a single DB transaction — all-or-nothing.

## Boundaries & Constraints

**Always:** Stage role/removal edits in dialog state keyed by `collaboratorId`; a second staged edit on the same row replaces the earlier one. Only explicit Save calls the server and applies the whole batch; Cancel discards all staged state client-side without calling the server. The creator's row stays locked — no role selector, no remove control (lock icon preserved). Save calls exactly one action; Resend/Rescind/Dismiss on invitation rows remain immediate, never staged. Server rejects the ENTIRE batch if any change targets an `isCreator=true` row, any id not belonging to `tripId`, or the calling manager's own row. Each change applies against an expected-state guard (row still exists; for a role change, still holds the staged `fromRole`); any guard failure rejects the whole batch — no partial or unconditional apply. Every interactive row control meets the 44×44px floor; icon-only controls carry a `title` naming action and person; role never color-only. Revalidate the trip detail route after success. `saveContributorChanges` and the extracted `isCreator` guard live in `src/app/(app)/trips/actions.ts` alongside the other contributor actions, with a `[tripId]/actions.ts` wrapper — no new `contributor-actions.ts` file (matches stories 3.1–3.4).

**Never:** Remove the creator's seat or change the creator's role; edit `isCreator`; apply staged changes with per-row sequential server calls instead of one batch; trust client-side disabled controls as authorization; introduce the unsaved-changes-on-close guard (Story 3.6) or live-sync behavior here; accept an invalid `toRole` or drop the `fromRole` from the change payload.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| SAVE_BATCH_OK | Manager stages a demotion + a removal, clicks Save | One transaction applies both; dialog refetches; success toast | N/A |
| SAVE_CREATOR | Any change targets `isCreator=true` row | Whole batch rejected, nothing lands | Error result; dialog keeps staged state, shows error |
| SAVE_SELF | Change targets the calling manager's own row | Whole batch rejected, nothing lands | Error result; dialog keeps state, shows error |
| SAVE_WRONG_TRIP | Change id not belonging to `tripId` | Whole batch rejected, nothing lands | Error result; no unrelated state exposed |
| SAVE_GUARD_FALSE | Row gone or no longer holds `fromRole` (concurrent edit) | Whole batch rejected, nothing lands | Error result; dialog shows a stale-data message and refetches |
| CANCEL_STAGED | Manager stages edits then clicks Cancel | All staged state discarded immediately, no server call | N/A |

</frozen-after-approval>

## Code Map

- `src/data/types.ts` -- Add `ContributorChange` discriminated union (`{ type:"role"; collaboratorId; fromRole; toRole } | { type:"remove"; collaboratorId }`) and a result type, beside existing invitation mutation results. `CollaboratorRole` const-object/union already lives here.
- `src/app/(app)/trips/actions.ts` -- Existing `removeCollaborator` (line 938) / `updateCollaboratorRole` (line 950) show the current fetch-then-write, manager-gated pattern and the inline `isCreator` guard (lines 943-945, 955-957) to extract into a shared helper. `inviteContributor` (line 716) / `acceptInvitation` (line 805) show the `db.transaction` pattern. This file hosts `saveContributorChanges` + the extracted guard.
- `src/lib/server-action-locks.ts` -- `lockTripForUpdate(transaction, tripId)` (line 19) plus `DbTransaction` type (line 5) for the batch transaction.
- `src/app/(app)/trips/[tripId]/actions.ts` -- Detail-route wrappers (lines 47-75) delegate and `revalidatePath("/trips/{tripId}")` on success; add a `saveContributorChanges(tripId, changes)` wrapper in the same pattern.
- `src/lib/auth-helpers.ts` -- `assertTripAccess(tripId, userId, "manager")` (lines 23-38) gating; `requireUser()`.
- `src/components/packt/trip-share-dialog.tsx` -- Add staging state keyed by `collaboratorId` (`Map`/object), `hasPendingChanges`, Save and Cancel controls; wire collaborator-row callbacks. Invitation-row Resend/Rescind/Dismiss (lines 83-169) stay immediate.
- `src/components/packt/trip-share-collaborator-row.tsx` -- Add role selector (`editor`/`viewer`/`manager` on non-creator rows) and remove control (44×44px, `title="Remove {name}"`, danger hover); creator row keeps lock icon. Staging callbacks, not direct dispatch.
- `src/data/types.ts` + invite-form role select -- Role options source shared with the staging selector.
- `tests/e2e/features/trip-sharing.feature`, `tests/e2e/steps/trip-sharing.steps.ts` -- Scenario-owned staging + batch-save flow.
- `tests/e2e/feature-map.mjs` -- Map changed action paths to `trip-sharing`.
- `src/app/(app)/trips/actions.test.ts`, `src/app/(app)/trips/[tripId]/actions.test.ts`, `src/components/packt/trip-share-dialog.test.tsx`, `src/components/packt/trip-share-collaborator-row.test.tsx` -- Colocated coverage (see Tasks).

## Tasks & Acceptance

**Execution:**

- [x] `src/data/types.ts` -- Add `ContributorChange` union (with `fromRole`) + result type; drive all consumers from here.
- [x] `src/app/(app)/trips/actions.test.ts` -- First: failing tests for `saveContributorChanges` — batch all-or-nothing, creator rejection, self-row rejection, wrong-trip rejection, expected-state guard failure rejects whole batch, success applies all + revalidates.
- [x] `src/app/(app)/trips/actions.ts` -- Extract the inline `isCreator` creator-seat guard into a shared helper and reuse it in `removeCollaborator`/`updateCollaboratorRole`/`saveContributorChanges`; implement `saveContributorChanges` in a `db.transaction` with `lockTripForUpdate`, validating every change server-side (isCreator, trip ownership, self-row, `fromRole` guard), rejecting the whole batch on any failure.
- [x] `src/app/(app)/trips/[tripId]/actions.test.ts` + `[tripId]/actions.ts` -- Add failing wrapper delegation test, then a `saveContributorChanges(tripId, changes)` wrapper that delegates and revalidates the detail route on success.
- [x] `src/components/packt/trip-share-collaborator-row.test.tsx` -- Add role-selector and remove-control tests (options, creator locked, 44×44px + `title`), then extend `src/components/packt/trip-share-collaborator-row.tsx` accordingly.
- [x] `src/components/packt/trip-share-dialog.test.tsx` -- Add staging tests (role change, removal, replace-on-same-row, Save fires batch once, Cancel discards with no server call, batch-failure keeps staged state + refetch), then implement staging + Save/Cancel in `src/components/packt/trip-share-dialog.tsx`.
- [x] `tests/e2e/features/trip-sharing.feature`, `tests/e2e/steps/trip-sharing.steps.ts`, `tests/e2e/feature-map.mjs` -- Scenario-owned: manager stages a role change + removal, saves, reopens to confirm persisted; map the new action paths to `trip-sharing`.

**Acceptance Criteria:**

- Given a non-creator collaborator row, when a manager changes its role or removes it, then the edit is staged visually but not applied until Save.
- Given staged edits exist, when Save succeeds, then all edits land atomically, the trip detail revalidates, and the dialog refetches.
- Given a batch targets the creator's row, the caller's own row, a wrong-trip id, or fails an expected-state guard, when Save runs, then the whole batch is rejected and no DB write lands.
- Given Cancel is clicked with staged edits, when it runs, then staged state is discarded with no server call.

### Review Findings

- [x] [Review][Patch] Guard-failure rejection doesn't refetch or show a distinct stale-data message per the SAVE_GUARD_FALSE matrix row; `SaveContributorChangesResult` has no discriminator to tell a concurrent-edit guard failure apart from creator/self/wrong-trip rejection [src/app/(app)/trips/actions.ts:966, src/data/types.ts, src/components/packt/trip-share-dialog.tsx:86]
- [x] [Review][Patch] Role selector displays the raw lowercase enum value ("editor") instead of the app's Title-Case `roleLabel` output ("Editor") — Base UI's `SelectValue` needs an `items` prop or custom render to resolve labels, which this diff never supplies [src/components/packt/trip-share-collaborator-row.tsx:96]
- [x] [Review][Patch] A batch with more than one change for the same `collaboratorId` isn't rejected; each change validates against a stale pre-loop snapshot, so a second entry for an already-mutated row can be silently accepted instead of guarded [src/app/(app)/trips/actions.ts:1002]
- [x] [Review][Patch] `change.type` isn't validated against the two known variants before branching — any unrecognized value falls into the `else` branch and is treated as a removal [src/app/(app)/trips/actions.ts:1014]
- [x] [Review][Patch] Catch-all in `saveContributorChanges` returns any thrown error's raw `.message` to the client, diverging from the codebase's pattern (e.g. `inviteContributor`) of rethrowing unexpected errors and only returning friendly messages for known ones [src/app/(app)/trips/actions.ts:1030]
- [x] [Review][Patch] Cancel button isn't disabled while a save is in flight — clicking Cancel mid-save clears local state but the server call still completes and overwrites the dialog moments later with a success toast [src/components/packt/trip-share-dialog.tsx:364]
- [x] [Review][Patch] Inline `saveError` banner has no `role="alert"`/`aria-live`, so assistive-tech users get no notification when a batch save fails [src/components/packt/trip-share-dialog.tsx:360]
- [x] [Review][Patch] Stray formatting corruption unrelated to this feature: two `TransactionFixture` interface fields got merged onto one line with a double space [src/app/(app)/trips/actions.test.ts]
- [x] [Review][Patch] `removeCollaborator`'s thrown message silently changed from "cannot be removed" to "cannot be changed" when its guard was extracted into `assertNotCreator` — no test catches the wording regression [src/app/(app)/trips/actions.ts:940]
- [x] [Review][Patch] Spec Task explicitly calls for a 44×44px sizing assertion in the new role-selector/remove-control tests; added tests check `title`/`aria-label`/behavior but never assert the sizing classes (implementation itself is compliant) [src/components/packt/trip-share-collaborator-row.test.tsx]
- [x] [Review][Patch] `Collaborator.userId` was added to the shared type but `dbCollabToType` never populates it and nothing in this diff reads it from the client type — dead field that could mislead a future reader into thinking the dialog can identify "my own row" client-side [src/data/types.ts, src/lib/db-mappers.ts:196]
- [x] [Review][Defer] No upper bound on `changes.length` in `saveContributorChanges` — an authenticated manager could submit an arbitrarily large batch in one transaction [src/app/(app)/trips/actions.ts:971] — deferred, pre-existing class of hardening gap, low real-world impact given caller is already an authorized manager on the trip
- [x] [Review][Defer] Potential `setState` after unmount if the dialog is closed while a save is in flight — matches an existing pattern already present elsewhere in this same file (e.g. `resendPendingInvitation`, `rescindPendingInvitation`) that never guards action handlers with an `isCurrent` ref, and React 18+ no longer warns on this [src/components/packt/trip-share-dialog.tsx:86] — deferred, pre-existing pattern in this file, not unique to this change

## Spec Change Log

## Design Notes

Keep the server authoritative and the guard-rich: the dialog's disabled/omitted creator controls are UX only. Role changes support all non-creator transitions across `viewer`/`editor`/`manager` (AD-1 makes every non-creator manager a peer removable/demotable and an editor/viewer promotable), resolving the deferred `updateCollaboratorRole` manager-only gap. The `fromRole` in each `ContributorChange` backs the expected-state guard that prevents a concurrent manager's save from silently no-oping a demotion or removal.

## Verification

**Commands:**

- `npx vitest run src/app/(app)/trips/actions.test.ts src/app/(app)/trips/[tripId]/actions.test.ts src/components/packt/trip-share-dialog.test.tsx src/components/packt/trip-share-collaborator-row.test.tsx` -- expected: new action, wrapper, dialog, and row cases pass.
- `npm run test:e2e:affected` -- expected: `trip-sharing` batch-save scenario passes against scenario-owned data.
- `packt-build-validator` -- expected: lint, type check, coverage, build, and affected E2E pass after targeted checks.

## Suggested Review Order

**Authorization and mutation boundary**

- Batch action: `db.transaction` + `lockTripForUpdate`, server-side validation of every change (isCreator, trip ownership, self-row, `fromRole` guard), whole-batch rejection on any failure. [`trips/actions.ts`](../../src/app/(app)/trips/actions.ts#L938)
- Extracted `isCreator` creator-seat guard reused across all three mutation paths.

**Dialog behavior**

- Staging keyed by `collaboratorId`, replace-on-same-row, Save fires one batch, Cancel discards without a call. [`trip-share-dialog.tsx`](../../src/components/packt/trip-share-dialog.tsx#L38)
- Collaborator-row role selector + remove control, creator row locked. [`trip-share-collaborator-row.tsx`](../../src/components/packt/trip-share-collaborator-row.tsx#L7)

**End-to-end and test infrastructure**

- Reopen dialog to prove the batch persisted. [`trip-sharing.feature`](../../tests/e2e/features/trip-sharing.feature)

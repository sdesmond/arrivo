---
title: "Unsaved-changes guard on dialog close"
type: "feature"
created: "2026-09-03"
status: "done"
baseline_commit: "0a557d412a39b329dd3b4163f4c7390ab7f0d6a2"
context:
  - "{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The share dialog applies staged role/removal changes (story 3.5) only on explicit Save, but a stray `Esc` or backdrop-click closes the dialog and silently loses every staged edit — there is no confirmation, so managers can accidentally discard unsaved membership changes.

**Approach (renegotiated 2026-09-03):** Rather than a discard-confirmation view, `Esc` and backdrop-click become unconditional no-ops on this dialog regardless of staged state — the dialog never closes from either. Save and Cancel are always visible (not conditional on staged changes); Save is disabled until a change is staged and, once clicked, saves the batch and closes the dialog on success. Cancel discards any staged changes and closes the dialog immediately. The explicit close (X) button also closes the dialog (discarding silently, same as today) and is exempt from the no-op treatment, same as Cancel.

## Boundaries & Constraints

**Always:** Interception uses Base UI `Dialog.Root` `onOpenChange(open, eventDetails)` where `eventDetails.reason` is `"outside-press"` (backdrop) or `"escape-key"` (Esc); calling `eventDetails.preventUnmountOnClose()` keeps the dialog open unconditionally for both reasons — never a second stacked dialog, never a native `window.confirm`, never keyed on staged-change state. Save and Cancel render unconditionally in `TripShareDialogContent`'s footer (no longer gated on `hasPendingChanges`). Save is `disabled` while `isSavingChanges` or while there are no staged changes (`!hasPendingChanges`); Cancel is `disabled` only while `isSavingChanges`. Clicking Save with staged changes present calls the existing `saveContributorChanges` batch action; on success it clears `stagedChanges` and calls the dialog's close callback (no discard-view round trip); on error it keeps the dialog open exactly as story 3.5 already does (staged state + inline error banner unchanged), including the stale-refetch path. Clicking Cancel clears `stagedChanges`/`saveError` and calls the dialog's close callback immediately, regardless of whether anything is staged. The explicit close (X) button is unaffected by the Esc/backdrop no-op — it always closes via the default `"close-press"` path, discarding any staged changes silently, same as before this story — except it is now also `disabled` while `isSavingChanges`, matching Save/Cancel, so a save in flight can't be raced by closing before its outcome (success or error) is known. `trip-share-dialog.tsx` and `trip-share-*.tsx` are already mapped to `@feat:trip-sharing` in `feature-map.mjs`, so no map change is required absent a new shared runtime file.

**Ask First:** None — in-app routing interception (epic UX-DR7's "Navigating away via in-app routing is intercepted by the same guard") remains **deferred** outside this story; it will be tracked separately so this story's scope stays on the locked 3.6 acceptance criteria (`Esc`/backdrop only).

**Never:** Use a native `window.confirm`; stack a second `AlertDialog`; close the dialog on `Esc` or backdrop-click under any staged-change state; render a discard-confirmation view; bypass the server-authoritative batch from story 3.5; hide Save/Cancel when there are no staged changes; change the X button's existing discard-and-close behavior; implement in-app routing navigation interception in this story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| NOOP_ESC_STAGED | Staged changes exist; user presses `Esc` or clicks backdrop | Dialog stays open; no state change; staged content still shown | N/A |
| NOOP_ESC_CLEAN | No staged changes; user presses `Esc` or clicks backdrop | Dialog stays open; no state change | N/A |
| SAVE_DISABLED | No staged changes | Save renders but is disabled; Cancel renders and is enabled | N/A |
| SAVE_CLOSES | Staged changes exist; user clicks Save; batch succeeds | Batch is saved; `stagedChanges` cleared; dialog closes | On batch error, dialog stays open with the existing inline error banner and staged state intact (unchanged from story 3.5) |
| CANCEL_CLOSES | Staged changes exist; user clicks Cancel | `stagedChanges` + `saveError` cleared; dialog closes (no server call) | N/A |
| X_EXEMPT | Staged changes exist; user clicks the X button | Dialog closes immediately, discarding staged changes — unaffected by the Esc/backdrop no-op | N/A |
| X_SAVE_RACE | A save is in flight (`isSavingChanges`); user attempts the X button | X is disabled, same as Save/Cancel, so the dialog can't close before the save's outcome is known | N/A |

</frozen-after-approval>

## Code Map

- `src/components/packt/trip-share-dialog.tsx` -- `TripShareDialogContent` holds `stagedChanges`, derived `hasPendingChanges`, `stageRoleChange`, `stageRemoval`, `handleSaveChanges`, `handleCancelChanges`; Save/Cancel buttons now render unconditionally in the footer with Save `disabled={isSavingChanges || !hasPendingChanges}` and Cancel `disabled={isSavingChanges}`; `handleSaveChanges` calls `onRequestClose()` after a successful save (no refetch needed — content unmounts on close) and `handleCancelChanges` calls `onRequestClose()` unconditionally. The root `TripShareDialog` component's `handleOpenChange` calls `eventDetails.preventUnmountOnClose()` for any `isDismissalPress` reason (`"outside-press"`/`"escape-key"`) unconditionally — no `hasPendingChanges` gate, no guard-state bridge between content and root. `isDismissalPress` (exported) is unchanged. Removed: `TripShareGuardHandle`, `guardRef`, `showDiscardConfirm` state, `handleDiscard`/`handleKeepEditing`, `discardSummary` export.
- `src/components/packt/trip-share-discard-confirm.tsx` -- **Removed.** No discard-confirmation view exists in this design; deleted along with its test file.
- `src/components/ui/dialog.tsx` -- unchanged; `DialogClose` (X button) still routes through the default `"close-press"` path, unaffected by the Esc/backdrop no-op.
- `src/app/(app)/trips/[tripId]/page-client.tsx` -- unchanged (in-app routing interception remains deferred).
- `src/components/packt/trip-share-dialog.test.tsx` -- rewritten: Save/Cancel-always-visible tests, Save-disabled-until-staged test, Save/Cancel-close-the-dialog tests, Esc/backdrop-no-op tests (staged and unstaged), X-button-closes-regardless-of-staged-changes test. `discardSummary` describe block removed.
- `tests/e2e/features/trip-sharing.feature` + `tests/e2e/steps/trip-sharing.steps.ts` -- scenario-owned; cancel/save scenarios now assert the dialog closes (reopening to check persisted/reverted state); new scenarios for Save-disabled, Esc no-op, backdrop no-op, and X-button exemption. Already `@feat:trip-sharing`.

## Tasks & Acceptance

**Execution:**

- [x] `src/components/packt/trip-share-dialog.test.tsx` -- Rewritten for the new design: Save/Cancel always render; Save disabled until staged; Esc/backdrop are no-ops with and without staged changes; Save closes the dialog on success; Cancel closes and discards; X button closes regardless of staged changes; Save/Cancel disabled while a save is in flight.
- [x] `src/components/packt/trip-share-discard-confirm.tsx` + `.test.tsx` -- Deleted; no discard-confirmation view in this design.
- [x] `src/components/packt/trip-share-dialog.tsx` -- `onOpenChange` interception now calls `preventUnmountOnClose()` unconditionally for `"outside-press"`/`"escape-key"`; Save/Cancel footer always rendered with Save gated on `hasPendingChanges`; `handleSaveChanges` and `handleCancelChanges` both close the dialog via `onRequestClose()`; removed guard-state bridge (`guardRef`, `TripShareGuardHandle`, `showDiscardConfirm`, `discardSummary`).
- [x] `tests/e2e/features/trip-sharing.feature` + `tests/e2e/steps/trip-sharing.steps.ts` -- Scenario-owned: Save disabled until staged; Esc no-op with staged changes; backdrop click no-op; X button closes and discards; cancel/save scenarios updated to reopen the dialog after it closes to assert reverted/persisted state.

**Acceptance Criteria:**

- Given the dialog is open with no staged changes, then Save and Cancel are both visible, Save is disabled, and Cancel is enabled.
- Given staged changes exist, when I press `Esc` or click the backdrop, then nothing happens — the dialog stays open with staged state intact.
- Given no staged changes exist, when I press `Esc` or click the backdrop, then nothing happens — the dialog stays open.
- Given staged changes exist, when I click Save and the batch succeeds, then the changes are saved and the dialog closes.
- Given staged changes exist, when I click Cancel, then staged changes are cleared with no server call and the dialog closes.
- Given staged changes exist, when I click the explicit close (X) button, then the dialog closes immediately, discarding staged changes, unaffected by the Esc/backdrop no-op.

## Spec Change Log

- 2026-09-03: Renegotiated from a discard-confirmation-view guard to unconditional Esc/backdrop no-ops with always-visible Save/Cancel controls, per human direction. Replaced the GUARD_* matrix rows and discard sub-component with the NOOP_*/SAVE_CLOSES/CANCEL_CLOSES/X_EXEMPT rows above; deleted `trip-share-discard-confirm.tsx` and its test.
- 2026-09-03: Code review (edge-case-hunter) found the X button had no `isSavingChanges` guard — closing mid-save could unmount the dialog before a failed save's error ever rendered, silently losing the edit with zero feedback. Patched: X is now `disabled` while `isSavingChanges`, matching Save/Cancel (added `X_SAVE_RACE` matrix row above); added a matching unit-test assertion. KEEP: the X button's discard-and-close semantics when *not* saving are unchanged — this only closes the in-flight-save race, it does not add any confirmation step.

## Design Notes

Base UI `Dialog.Root` hands dismissal control to `onOpenChange(open, eventDetails)`: `reason` discriminates `"escape-key"` vs `"outside-press"` (and `"close-press"`), and `preventUnmountOnClose()` is the documented "keep it open, I'll handle it" escape hatch. This story uses it unconditionally for the two dismissal reasons — no staged-change gate, no swapped-in view, no second component. That removes the need for the guard-state bridge (`guardRef`) between the root `TripShareDialog` and `TripShareDialogContent` entirely, since the root's `handleOpenChange` no longer needs to know about staged-change state. Because `TripShareDialogContent` unmounts on close, a successful Save can skip refetching before calling `onRequestClose()` — there is nothing left to show. The X button continues to route through `DialogClose`/`close-press`, which was never touched by the Esc/backdrop interception and needs no change.

## Verification

**Commands:**

- `npx vitest run src/components/packt/trip-share-dialog.test.tsx` -- expected: rewritten dismissal + staging/save/cancel coverage, all passing.
- `npm run test:e2e:affected` -- expected: all 12 `trip-sharing` feature scenarios (13 Playwright checks counting `auth.setup.ts`) pass against scenario-owned data.
- `packt-build-validator` -- expected: lint, type check, coverage, build, and affected E2E pass.

## Suggested Review Order

**Dismissal no-op**

- Entry point: the two dismissal reasons are always intercepted, no longer keyed on staged-change state.
  [`trip-share-dialog.tsx:398`](../../src/components/packt/trip-share-dialog.tsx#L398)

- The predicate `handleOpenChange` gates on — unchanged reason discrimination, now applied unconditionally.
  [`trip-share-dialog.tsx:45`](../../src/components/packt/trip-share-dialog.tsx#L45)

**Save/Cancel/X always close, nothing else does**

- Save now closes the dialog on success instead of refetching in place; still gated on `hasPendingChanges`.
  [`trip-share-dialog.tsx:91`](../../src/components/packt/trip-share-dialog.tsx#L91)

- Cancel now closes the dialog too, not just clears staged state.
  [`trip-share-dialog.tsx:127`](../../src/components/packt/trip-share-dialog.tsx#L127)

- Save/Cancel footer renders unconditionally; Save disabled until something is staged.
  [`trip-share-dialog.tsx:379`](../../src/components/packt/trip-share-dialog.tsx#L379)

- Review fix: X button now disabled mid-save too, closing the silent-data-loss race the edge-case review found.
  [`trip-share-dialog.tsx:303`](../../src/components/packt/trip-share-dialog.tsx#L303)

**Peripherals**

- Unit coverage for the new dismissal/close semantics and the X-button-disabled-while-saving fix.
  [`trip-share-dialog.test.tsx:610`](../../src/components/packt/trip-share-dialog.test.tsx#L610)

- E2E scenarios for Save-disabled, Escape/backdrop no-ops, and X-button exemption.
  [`trip-sharing.feature:75`](../../tests/e2e/features/trip-sharing.feature#L75)

- Matching step definitions for the new E2E scenarios.
  [`trip-sharing.steps.ts:154`](../../tests/e2e/steps/trip-sharing.steps.ts#L154)

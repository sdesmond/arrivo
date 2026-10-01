---
title: "Dismiss a declined invitation"
type: "feature"
created: "2026-09-03"
status: "done"
baseline_commit: "5ad1d3956e35b8b08f68ba13f7b7b60edc96f747"
review_loop_iteration: 0
context:
  - "{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Declined invitations remain visible in the manager-only Share dialog with no way to clear records that no longer need attention. Managers need a direct, safe dismissal action without altering active contributors or pending invitation behavior.

**Approach:** Add a manager-authorized, trip-scoped hard-delete action for non-pending invitations, expose it through the trip-detail action boundary, and give each declined row one immediate Dismiss control that removes only that row after success.

## Boundaries & Constraints

**Always:** Require the authenticated caller and manager access before mutation; verify invitation id belongs to supplied trip in the delete predicate; permit deletion only when status is not `pending`; revalidate affected trip path after success. The declined-row control acts immediately with no confirmation, is at least 44×44px, uses a descriptive `title`, and shows textual feedback via toast. Keep row state local: successful dismissal removes that invitation from current dialog data; failures preserve it. Preserve existing Base UI dialog focus, keyboard, and close behavior.

**Ask First:** None expected.

**Never:** Delete a pending invitation through dismissal; broaden this into staged role/removal work, an unsaved-changes guard, live sync, or schema migration; change invitation acceptance, decline, resend, rescind, or re-invite semantics; trust client-side visibility as authorization.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| DISMISS_DECLINED | Manager dismisses declined invitation for current trip | Server hard-deletes row; dialog removes it and shows `Invitation dismissed.` | N/A |
| DISMISS_PENDING | Manager targets a pending invitation id | No deletion or revalidation | Error result; row remains visible |
| DISMISS_WRONG_TRIP | Invitation id belongs to another trip or does not exist | No deletion or revalidation | Error result; do not expose unrelated record state |
| DISMISS_IN_FLIGHT | Dismiss request is unresolved | Only clicked row's Dismiss control is disabled and shows loading state | Sibling row actions remain distinguishable |
| DISMISS_FAILED | Action returns error or rejects | Dialog keeps declined row | Show error toast; restore control |

</frozen-after-approval>

## Code Map

- `src/data/types.ts` -- Add canonical result type for dismissal beside existing invitation mutation results; no local client/server type duplication.
- `src/app/(app)/trips/actions.ts` -- Existing invitation domain actions and manager authorization pattern; add protected, trip-scoped non-pending delete with diagnostic error handling and trip revalidation.
- `src/app/(app)/trips/actions.test.ts` -- Existing rescind action tests and DB mocks establish manager-gate, delete predicate, no-op failure, and revalidation coverage.
- `src/app/(app)/trips/[tripId]/actions.ts` -- Detail-route wrappers currently expose `getShareDialogData`, resend, and rescind; add dismissal wrapper that delegates to parent action and revalidates detail route after success.
- `src/app/(app)/trips/[tripId]/actions.test.ts` -- Extend wrapper mocks and delegation/revalidation tests for success and rejected result.
- `src/components/packt/trip-share-dialog.tsx` -- Declined rows render at invitation mapping; reuse pending-row action state pattern, but render Dismiss only for declined rows and locally filter a successful dismissal.
- `src/components/packt/trip-share-dialog.test.tsx` -- Existing resend/rescind tests provide control, optimistic local removal, error, and spinner patterns to extend for dismissal.
- `src/components/packt/trip-share-invite-form.tsx`, `src/components/packt/trip-share-collaborator-row.tsx`, and `src/components/packt/trip-share-invitation-row.tsx` -- Extract existing dialog regions before extending the 419-line dialog; each begins with `"use client"`, has an explicit props interface, stays a Packt domain component, and the invitation row owns only its presentational/action callback boundary.
- `src/components/packt/trip-share-invite-form.test.tsx`, `src/components/packt/trip-share-collaborator-row.test.tsx`, and `src/components/packt/trip-share-invitation-row.test.tsx` -- Colocated coverage for extracted behavior and accessibility contracts.
- `tests/e2e/features/trip-sharing.feature` -- Existing scenario-owned sharing rows include one declined invitation; add manager dismissal flow.
- `tests/e2e/steps/trip-sharing.steps.ts` -- Reuse declined row fixture constants; add click and absence/toast assertions without global seed changes.
- `tests/e2e/feature-map.mjs` -- Add both changed invitation action paths to `trip-sharing` so affected E2E includes this flow.
- `src/lib/queries.ts` and `src/db/schema.ts` -- Read-only dependencies: manager-gated share data includes pending/declined rows; invitation schema already supports deletion, so no migration is needed.

## Tasks & Acceptance

**Execution:**

- [x] `src/app/(app)/trips/actions.test.ts` and `src/app/(app)/trips/[tripId]/actions.test.ts` -- First added failing domain and wrapper tests for manager authorization, scoped non-pending deletion, failure/no-revalidation, and successful delegation.
- [x] `src/components/packt/trip-share-dialog.test.tsx` -- Added declined-row tests: exactly one titled Dismiss control, no pending-row Dismiss, successful local removal/toast, failure preservation, and per-row in-flight state.
- [x] `src/components/packt/trip-share-invite-form.tsx`, `src/components/packt/trip-share-collaborator-row.tsx`, and `src/components/packt/trip-share-invitation-row.tsx` with colocated tests -- Split the existing 419-line dialog into its three cohesive, already-visible regions before feature extension, retaining existing render behavior, explicit props interfaces, and dialog-owned state.
- [x] `src/app/(app)/trips/actions.ts`, `src/app/(app)/trips/[tripId]/actions.ts`, and `src/data/types.ts` -- Added canonical result, protected hard-delete, and detail wrapper to satisfy action tests.
- [x] `src/components/packt/trip-share-dialog.tsx` -- Composed extracted regions and wired immediate declined-row Dismiss control to detail wrapper, preserving existing pending controls and Base UI dialog focus/keyboard behavior.
- [x] `tests/e2e/features/trip-sharing.feature`, `tests/e2e/steps/trip-sharing.steps.ts`, and `tests/e2e/feature-map.mjs` -- Covered manager dismissal end-to-end with scenario-owned data and mapped changed action files to this feature.

**Acceptance Criteria:**

- Given a manager opens a dialog containing pending and declined invitations, when it renders, then only each declined row has one titled Dismiss control.
- Given a manager dismisses a declined invitation, when action succeeds, then that invitation is hard-deleted for this trip, disappears from dialog, and confirmation appears without a confirmation step.
- Given a non-manager, a cross-trip id, missing id, or pending invitation, when dismissal is attempted server-side, then no record is deleted and no success revalidation occurs.
- Given dismissal is pending or fails, when dialog updates, then control state communicates progress or error and declined row is retained unless action succeeded.

## Spec Change Log

## Design Notes

Keep action semantics broader than current UI visibility: server accepts any non-pending status only, while query/UI exposes declined rows. This preserves authorization and status protection if additional terminal statuses are introduced later.

## Verification

**Commands:**

- `npx vitest run src/app/(app)/trips/actions.test.ts src/app/(app)/trips/[tripId]/actions.test.ts src/components/packt/trip-share-dialog.test.tsx` -- expected: new action, wrapper, and dialog cases pass.
- `npm run test:e2e:affected` -- expected: `trip-sharing` dismissal scenario passes against scenario-owned data.
- `packt-build-validator` -- expected: lint, type check, coverage, build, and affected E2E pass after targeted checks.

## Suggested Review Order

**Authorization and mutation boundary**

- Manager-scoped non-pending deletion preserves pending invitation workflow.
  [`actions.ts:917`](../../src/app/(app)/trips/actions.ts#L917)

- Detail action adds route-local revalidation only after successful deletion.
  [`actions.ts:69`](../../src/app/(app)/trips/[tripId]/actions.ts#L69)

**Dialog behavior**

- Per-row action state and stale-refresh filtering keep dismissal locally consistent.
  [`trip-share-dialog.tsx:50`](../../src/components/packt/trip-share-dialog.tsx#L50)

- Invitation rows limit destructive controls to declined records.
  [`trip-share-invitation-row.tsx:36`](../../src/components/packt/trip-share-invitation-row.tsx#L36)

- Focused component tests cover concurrent actions and stale refresh protection.
  [`trip-share-dialog.test.tsx:173`](../../src/components/packt/trip-share-dialog.test.tsx#L173)

**End-to-end and test infrastructure**

- Reopen dialog to prove dismissal persisted beyond local state.
  [`trip-sharing.feature:40`](../../tests/e2e/features/trip-sharing.feature#L40)

- Inline NextAuth so Vitest resolves its extensionless Next server import.
  [`vitest.config.mts:7`](../../vitest.config.mts#L7)

---
title: "Harden trip sharing dialog state and self-row controls"
type: "bugfix"
created: "2026-09-09"
status: "done"
baseline_commit: "6bdcbbfb74d32dcbfefd66fc829c192798bb0172"
review_loop_iteration: 0
context:
  - "_bmad-output/project-context.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Five Epic 3 retro actions remain open around manager self-protection, sharing-dialog concurrency, stale recovery, and action typing. Epic 4 retro item 28 escalated them as one cleanup story after Epic 4 left them untouched.

**Approach:** Keep server authorization authoritative while adding caller-row metadata and client affordances, closing two identified state races, reporting recovery failure, and normalizing `ContributorChange` imports.

## Boundaries & Constraints

**Always:** Return caller collaborator-row ID from manager-gated sharing data without exposing user IDs; visibly mark caller as `You`; lock caller and creator role/removal controls; preserve other managers' editability; suppress successfully rescinded invitations from overlapping refetches; disable collaborator editing and invite form during batch save; retain specific save error when stale recovery also fails; split the oversized dialog controller before extending behavior; write and run named unit/component/E2E tests before production edits.

**Ask First:** Any scope expansion into invitation-row action locking, canonical `Collaborator` shape, or unrelated deferred-work items.

**Never:** Match caller by email, weaken server-side self/creator guards, expose collaborator `userId` to client, show invite-loading spinner during batch save, close Epic 3 items 8 or 17, or absorb `deferred-work.md` entries.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Behavior | Error Handling |
| --- | --- | --- | --- |
| Self row | Caller is non-creator manager | `You` marker and accessible lock replace role/remove controls | Server guard remains fallback |
| Creator self | Caller owns trip | `You` remains visible; creator-specific lock semantics win | No editable controls |
| Rescind overlap | Successful rescind overlaps stale invite/refetch payload | Removed invitation stays absent | Failed rescind is not suppressed |
| Save pending | Batch save unresolved | Collaborator and invite-form controls disabled; invite spinner absent | Controls restore after settlement |
| Recovery failure | Stale save rejection followed by failed refetch | Original save error plus persistent out-of-date warning | Dialog stays open; staged changes remain cleared |

</frozen-after-approval>

## Code Map

- `src/lib/queries.ts:343` — manager-gated `getContributorsAndInvitations`; raw rows contain caller `userId`, mapped collaborators do not.
- `src/app/(app)/trips/[tripId]/actions.ts:53,83` — sharing-data passthrough and inline `ContributorChange` type expression.
- `src/components/packt/trip-share-dialog.tsx:49-125,206-243,314-368` — 388-line component combining controller and rendering responsibilities; extract controller before adding branches.
- `src/components/packt/trip-share-collaborator-row.tsx:10-89` — creator lock pattern to reuse for caller row.
- `src/components/packt/trip-share-invite-form.tsx:7-70` — invite loading currently doubles as sole disabled state.
- `_bmad-output/implementation-artifacts/sprint-status.yaml:135-183,299-308` — five Epic 3 actions plus Epic 4 bundling action.

## Tasks & Acceptance

**Tests first:**

- [x] `src/lib/queries.test.ts` — prove caller row ID and null fallback in sharing payload.
- [x] `src/app/(app)/trips/[tripId]/actions.test.ts` — update enriched payload expectation and top-level test type import.
- [x] `src/components/packt/trip-share-collaborator-row.test.tsx` — prove self/creator locks, `You`, and editable other manager.
- [x] `src/components/packt/trip-share-invite-form.test.tsx` — prove external disable without invite progress.
- [x] `src/components/packt/use-trip-share-dialog-controller.test.ts` — cover rescind/refetch race, save-time restoration, and failed stale recovery in extracted controller.
- [x] `src/components/packt/trip-share-dialog.test.tsx` — cover caller wiring and disabled UI while save is pending.
- [x] `tests/e2e/features/trip-sharing.feature` and `tests/e2e/steps/trip-sharing.steps.ts` — prove scenario-owned non-creator manager sees own locked `You` row while another manager stays editable.

**Production and tracking:**

- [x] `src/lib/queries.ts` — add `currentCollaboratorId: string | null` from raw caller row before mapping.
- [x] `src/components/packt/trip-share-collaborator-row.tsx` — accept `isCurrentUser`, render `You`, and reuse accessible lock UI.
- [x] `src/components/packt/trip-share-invite-form.tsx` — separate external disabled state from invite loading.
- [x] `src/components/packt/use-trip-share-dialog-controller.ts` — extract existing state/mutations below 250 lines, then add rescind suppression, save guards, and recovery-warning state without changing unrelated behavior.
- [x] `src/components/packt/trip-share-dialog.tsx` — reduce component below 250 lines and render controller state, caller lock, save-time disabled controls, and persistent recovery warning.
- [x] `src/app/(app)/trips/[tripId]/actions.ts` — replace inline type expression with top-level `ContributorChange` import.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` — close Epic 3 items 9/10/12/13/14 and Epic 4 item 28 only after verified implementation.

**Acceptance Criteria:**

- Given manager opens sharing dialog, when rows load, then own row is visibly identified and immutable while eligible collaborators remain editable.
- Given batch save is pending, when manager attempts another staged edit or invite, then targeted controls reject interaction without starting another request.
- Given rescind succeeds during overlapping refetch, when stale response arrives, then invitation remains removed.
- Given stale save rejection cannot refresh, when recovery completes, then both rejection and out-of-date state remain visible.

## Spec Change Log

## Design Notes

Return `currentCollaboratorId` beside mapped rows rather than changing `Collaborator` or passing session identity through page props. Determine caller against raw DB rows already loaded by manager-gated query. Extract a typed dialog controller because existing component exceeds project size limit and mixes loading, five mutations, staging, and rendering. Keep `isLoading` reserved for invite request progress; use separate `disabled` input for batch-save exclusion.

## Verification

**Commands:**

- `npx vitest run src/lib/queries.test.ts "src/app/(app)/trips/[tripId]/actions.test.ts" src/components/packt/trip-share-collaborator-row.test.tsx src/components/packt/trip-share-invite-form.test.tsx src/components/packt/use-trip-share-dialog-controller.test.ts src/components/packt/trip-share-dialog.test.tsx` — expected: targeted tests pass.
- `npm run test:e2e:affected` — expected: selected sharing coverage passes; shared action/query paths may select full suite.
- `packt-build-validator` — expected: lint, type check, coverage, build, and affected E2E pass.

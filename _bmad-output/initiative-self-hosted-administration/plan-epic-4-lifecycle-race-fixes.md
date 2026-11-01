---
title: Close epic 4 lifecycle races
type: bugfix
ticket: ""
created: "2026-10-30"
status: built
baseline_revision: "2791aa73b2737bb9d450d33e631cb019bc4beaca"
route: full
route_source: auto
risk: high
review: thorough
review_source: pinned
lenses_ran: [thorough-inspection]
review_loop_iteration: 0
context: [AGENTS.md]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Retrospective reproduced self-deletion surviving reset revocation, contributor changes surviving actor deletion, and transfer/invitation deadlock.

**Approach:** Recheck authentication/authority under mutation locks; lock explicit successors before trips. Add controlled regressions. Keep current branch; push and PR into `feat/self-hosted-administration` with retrospective/ADRs.

## Boundaries & Constraints

**Always:** Tests first; reuse lifecycle locks, authorizations, Object Mothers and scenario cleanup. Order: singleton, sorted/deduplicated users, sorted trips. Preserve explicit choices (including viewer heirs), last-admin guard, private previews and post-commit effects. Refusals write nothing. Redirect after transaction returns. Domain outcomes in `src/data/types.ts`; missing version fails closed.

**Never:** Schema changes, version bypass/default, credential logs, production test hooks, shared seeds, ordering tags, sleeps, full-suite E2E, UI redesign or unrelated runtime cleanup. Close proven-fixed ledger items; other proposals remain deferred.

## I/O & Edge-Case Matrix

| Scenario | State | Expected result |
| --- | --- | --- |
| Revoked deletion | Reset/recovery commits while authenticated deletion waits | Account/trips survive; stale browser redirects to sign-in without success effects |
| Current deletion | Current version and valid transfer/delete choices | Existing outcomes and last-admin refusal preserved |
| Invalid context | Missing version, version mismatch, departed account | Unauthorized; no writes/effects |
| Changed choices | Missing/nonmember heir, malformed payload or vanished trip | Stale review; no writes |
| Concurrent transfer | Lower-ID heir held by invitation writer | Sorted account locks serialize; no deadlock; valid serial outcome |
| Lost trip authority | Actor removed, demoted or deleted after precheck | Contributor batch refused atomically under trip lock |
| Current manager | Valid role/removal batch | Existing own-seat/creator/stale-target guards preserved |

</frozen-after-approval>

## Code Map

- `src/lib/account-deletion.ts`: reuse `lockAppAndUsersForUpdate`, `areDeletionChoicesValid`, vanished-trip error; admin resolver demonstrates version check.
- Profile `actions.ts`: version forwarding and Unauthorized redirect before effects; security actions demonstrate convention. Local Next.js mutation guide read.
- `src/lib/membership-writes.ts`: require manager in `saveContributorChangesWrite`; reuse `ContributorChangeGuardError`.
- Deletion fixture supplies per-lock gates and blocked polling. Reset browser steps already gate competing mutations. Extend existing harness.

## Tasks & Acceptance

**Execution:**

- [x] Tests first: `src/lib/account-deletion.test.ts`, `src/app/(app)/profile/actions.test.ts`: version forwarding, revoked/missing/deleted context, no effects, malformed/forged/missing heirs, sorted locks, vanished trip, preserved choices/guard.
- [x] Tests first: `src/lib/membership-writes.test.ts`, `src/app/(app)/trips/actions.test.ts`: absent/demoted/deleted actor, atomic refusal, valid batches and existing guards.
- [x] Add Unauthorized to `src/data/types.ts`; require fourth version argument on `deleteOwnAccount`; validate choices before extracting heirs; lock heirs with departing user; compare locked version; sort trips; revalidate memberships. Missing heir/vanished trip returns Stale; unexpected errors propagate. Profile action redirects Unauthorized before effects.
- [x] Require locked manager membership before contributor writes; preserve creator/self-edit/target guards.
- [x] Extend `tests/e2e/features/password-reset.feature` and `steps/password-reset.steps.ts`: browser self-deletion queued behind reset/recovery; assert account/trips/fresh authentication survive, stale browser redirects. Await mutation POSTs before navigation.
- [x] Extend deletion-concurrency feature/steps and `tests/e2e/deletion-concurrency-fixture.ts`: lower-ID heir versus invitation, both lock orders; queued contributor writes versus deletion/removal/demotion. Update dynamic gate lock counts for successor locks. Update direct callers in `steps/app-role-service.steps.ts` and deletion steps with actual fixture version; no bypass.
- [x] Register sources in `tests/e2e/feature-map.mjs`; run `scripts/feature-map.test.mjs`, `scripts/affected-e2e.test.mjs`, targeted unit/browser checks, independent thorough review, then parent-owned validator. Record remediation in retrospective, preserve original observations, close repaired ledger entries. Commit, push, open PR covering all branch commits.

**Acceptance Criteria:**

- Given reproduced interleavings, when operations compete through controlled gates, then stale authority cannot mutate and transfer/invitation cannot deadlock.
- Given current authentication/membership, when existing flows run, then valid outcomes and privacy assertions pass.

## Implementation Notes

Plan-reviewer completed 2026-10-30 against request to implement retrospective F1–F3 on current branch. Scope, architecture, component, accessibility and test checks PASS; zero blockers/warnings. No component or widget changes. Both covered library files have named colocated tests; changed flows have feature/step coverage. Dynamic gate-count and direct-caller updates were added before review completion. Awaiting BMad implementation checkpoint approval.

Approved 2026-10-30: user chose "approve and stop". Plan is ready for development; frozen intent is approved. Implementation, commit, push and PR remain pending for a resumed session.

## Plan Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| Non-owner manager deletion commits between batch read and write (no actor lock) | low | rejected | Batch writes touch other collaborators only; final state equals serial order batch-then-deletion; fix adds a lock path. |
| Heir UUID case not normalized for validation | low | rejected | Fails safe as Stale; locks already lowercase; no unsafe write reachable. |
| Heir locks taken before ownership check of forged trip | low | rejected | Requires authenticated self; ends Stale with no writes; fix adds branches. |
| `startFixture` ID sorting changed unrelated scenarios | medium | patch | Now pins order only when an `heir` member exists. |
| Fixture doc comment misplaced | low | patch | Comment moved to its method. |
| Dead `myRow?.id` optional chain | low | patch | Narrowed by manager guard; now `myRow.id`. |
| Second transfer scenario does not assert invitation outcome | low | rejected | Still catches deadlock via no-`40P01` assertion; lock count 1 is intentional. |
| Hang if actor lock added later | false | rejected | Hypothetical; writer takes no actor lock. |
| Runtime esbuild bundle in password-reset steps | low | rejected | Test-only, artifacts in ignored test-results, DB injected; passed. |
| Weak `status` assertion / hardcoded version 1 | low | rejected | Redirect URL assertion and DB state carry the proof. |
| Missing profile-action test for absent session version | low | rejected | Service-level undefined test covers fail-closed. |
| Retrospective remediation missing | false | n/a | Appendix added 2026-10-30. |

## Design Notes

Explicit choices determine successor lock set; validate shape before SQL and membership after locks. No discovery loop. Version comes from server session, never client input.

## Verification

- Vitest: named tests above; failing regressions before source edits, passing afterward.
- Browser: password-reset, deletion-concurrency, admin-account-deletion, admin-recovery-completion, integrated-recovery-and-deletion; real Postgres and controlled gates.
- Parent runs build-validator after targeted checks; affected E2E runs separately after other workers.

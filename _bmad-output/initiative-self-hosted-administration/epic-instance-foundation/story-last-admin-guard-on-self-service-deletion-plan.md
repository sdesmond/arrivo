---
title: "Last-admin guard on self-service deletion"
type: "feature"
ticket: "5"
created: "2026-10-25"
status: done
baseline_revision: "f02fc155e0c0e3cc5d7280c050e2477f80d9ff82"
route: "full"
route_source: "auto"
risk: "high"
review: "quick"
review_source: "pinned"
lenses_ran: ["quick"]
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `deleteAccount` locks only the user row, so two completed admins deleting themselves concurrently, or the only admin deleting themself, leaves the instance with no usable admin.

**Approach:** Move the deletion transaction into an injected-database function in `src/lib` that uses the shared lock order (instance singleton, user, then owned trips) and refuses before any write when the deleter is the last completed admin, via story 3's `assertAnotherCompletedAdmin`. `deleteAccount` stays the thin adapter. The existing dialog shows the refusal; transfer/delete trip choices are unchanged.

## Boundaries & Constraints

**Always:** Decision (2026-10-25): prove concurrency against real PostgreSQL by running the extracted function in the isolated-schema fixture (option B). Lock order is `lockInstanceAndUsersForUpdate(transaction, [userId])` for every deleter (members too), then owned trips. Guard applies only when the locked row is an admin with `password_hash IS NOT NULL`, runs before any write, and rolls back with the transaction. Refusal returns `{ status: "error", message }` without `stale`, so the dialog shows it and does not refresh. Missing singleton or user row still throws. Post-commit events, file cleanup, sign-out and revalidation stay in `deleteAccount`. Behavior of existing choices, stale detection and invitation rescinding is preserved. Domain types stay in `src/data/types.ts`.

**Never:** Admin deletion of others (epic-recovery-and-deletion), dialog/UI changes, schema or migration changes, changes to role-change service or lock helper signatures, AD-7 successor or fingerprint logic, global `db` use inside the extracted function, mutating baseline E2E data.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Member deletes self | role member | Deleted as today, instance locked first | None |
| Admin, another completed admin | guard passes | Deleted, trips handled per choices | None |
| Only completed admin | no other completed admin | Nothing written, refusal message shown | `{status:"error", message}` |
| Only completed admin plus unfinished admins | unfinished do not count | Refused | Same refusal |
| Unfinished admin deletes self | password null | Deleted, guard skipped | None |
| Two completed admins delete concurrently | PostgreSQL | One deleted, other refused | Second gets refusal |
| Singleton or user row missing | no lock result | Throws | Propagates |

</frozen-after-approval>

## Code Map

- `src/app/(app)/profile/actions.ts:328-470` -- `deleteAccount` and `AccountDeletionStaleError`; transaction body (lines 345-431) moves out; keep requireUser, choices-array check, post-commit side effects, sign-out.
- `src/lib/account-deletion.ts` (new) -- `deleteOwnAccount(database, userId, choices)`: owns the transaction, returns the commit summary (rescinded invitations, transferred/deleted trips, members, storage URLs) or a typed refusal/stale outcome. Type the database like `RoleChangeDatabase` in `src/lib/account-role-changes.ts`.
- `src/lib/account-lifecycle-locks.ts` -- `lockInstanceAndUsersForUpdate`, `assertAnotherCompletedAdmin`, `LastCompletedAdminError`; consume unchanged.
- `src/lib/trip-ownership.ts` -- `areDeletionChoicesValid`, `buildSharedOwnedTrips`; reuse.
- `src/app/(app)/profile/actions.test.ts:643-888` -- deletion tests built on `createDeletionTransactionMock`; split: action-level (side effects, sign-out, refusal passthrough) stay, transaction-level cases move to the new lib test.
- `tests/e2e/role-service-fixture.ts` -- isolated schema cloning `users`/`instance_state` with `like public.x including all`; extend so the schema also holds the trip tables deletion touches, keep search_path excluding public.
- `tests/e2e/steps/instance-role-service.steps.ts`, `features/instance-role-service.feature` -- gate/barrier patterns to reuse.
- `tests/e2e/feature-map.mjs:71` -- `instance-role-service` entry; add new lib file.
- `src/app/(app)/profile/delete-account-dialog.tsx:62` -- already renders `result.message`; unchanged.

## Tasks & Acceptance

**Execution:**

- [ ] `src/lib/account-deletion.test.ts` -- first edit: matrix cases, lock order instance→user→trip, refusal writes nothing, stale choices, unfinished deleter skips guard, caller DB failure propagates -- hermetic doubles
- [ ] `src/app/(app)/profile/actions.test.ts` -- trim to adapter behavior: refusal returns error without sign-out/cleanup/events, success runs side effects, stale mapping
- [ ] `src/data/types.ts` -- outcome/refusal types for the extracted function
- [ ] `src/lib/account-deletion.ts`, `src/app/(app)/profile/actions.ts` -- extract and add lock order plus guard; targeted tests pass
- [ ] `tests/e2e/role-service-fixture.ts` -- fixture schema holds every table the deletion touches; fail closed if one is missing
- [ ] `tests/e2e/features/instance-role-service.feature`, `tests/e2e/steps/instance-role-service.steps.ts` -- scenarios: overlapping self-deletions of two completed admins leave one; only completed admin (with unfinished admin) refused with rows unchanged; deterministic barriers
- [ ] `tests/e2e/feature-map.mjs` -- register new lib file and fixture
- [ ] Run targeted Vitest, then `npm run test:e2e:affected`; build-validator once at the end

**Acceptance Criteria:**

- Given two completed admins, when both delete concurrently in PostgreSQL, then exactly one is deleted and one completed admin remains.
- Given the only completed admin, when they confirm deletion, then the dialog shows why, account and trips are unchanged, and they stay signed in.
- Given a member, when they delete their account, then behavior matches today's except the instance row is locked first.
- Given existing profile deletion scenarios, when run, then they still pass unchanged.

## Implementation Notes

## Plan Change Log

## Review Triage Log

- Quick lens run inline by the session (no subagent spawned): diff read against the plan, AGENTS.md rules and acceptance criteria; 0 findings. Checked: refusal precedes every write, lock order matches AD-2, unfinished-admin skip, lowercase id handling, no single-letter names, adapter keeps post-commit side effects.

## Design Notes

Members lock the singleton too: role changes lock instance then user, so a member taking the user row first would deadlock against a concurrent role change. Cost is serialized deletions, which are rare.

## Verification

**Commands:**

- `npx vitest run src/lib/account-deletion.test.ts "src/app/(app)/profile/actions.test.ts" scripts/feature-map.test.mjs` -- expected: pass
- `npm run test:e2e:affected` -- expected: profile and instance-role-service scenarios pass, schema cleanup succeeds
- `build-validator` -- expected: lint, types, coverage, build, affected E2E pass

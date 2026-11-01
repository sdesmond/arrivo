---
title: "Role-change service with last-admin guard"
type: "feature"
ticket: "3"
created: "2026-10-25"
status: done
baseline_revision: "3081fa381134107cb9bbb298a2070e20ba8aa0ac"
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

**Problem:** Concurrent role changes could remove every usable admin.

**Approach:** Add request-independent role service plus exported lock helper and last-admin guard, reusable by later deletion stories. Completed means `password_hash IS NOT NULL`.

## Boundaries & Constraints

**Always:** Inject transaction capability; take explicit authenticated actor ID, target ID, and requested UserRole. Recheck actor is completed admin under locks. Lock instance singleton, then affected users in sorted, deduplicated ID order; later callers lock trips afterward. Promotion requires completed target; admin demotion leaves another completed admin. Shared helpers accept existing transaction. Domain types belong in `src/data/types.ts`. Return safe results without credential data.

**Never:** Request APIs, hidden DB connections, operator role bypass, UI/routes, Activity, deletion integration, schema/migration changes, or bootstrap refactoring. Later stories own adapters.

## I/O & Edge-Case Matrix

| State/action | Outcome |
| --- | --- |
| Completed member promoted by current admin | Persist admin |
| Admin demotion/self-demotion with another completed admin | Persist member |
| Last completed admin demoted; unfinished admins may exist | last-admin, unchanged |
| Passwordless target promoted, even already admin | unfinished-account, unchanged |
| Missing/member/unfinished actor, including stale authority | forbidden, unchanged |
| Missing target / singleton | not-found / instance-unavailable |
| Authorized completed target already requested role | Success, unchanged |
| Concurrent self-demotions of two completed admins | One succeeds; one last-admin |
| Invalid runtime role | invalid-role, unchanged |
| Deadlock/serialization failure | Rollback, retry result |

</frozen-after-approval>

## Code Map

- `src/lib/instance-bootstrap.ts`: injected transaction and singleton SQL pattern; unchanged.
- `src/lib/server-action-locks.ts`: reuse transaction type via type-only import; existing helpers unchanged. `src/lib/instance-roles.ts` uses global DB/server-only; unsuitable for locked authorization.
- `src/db/schema.ts`: existing nullable passwordHash, role, singleton; no migration.
- `src/lib/account-lifecycle-locks.ts` (new): `lockInstanceAndUsersForUpdate(transaction, userIds)` and `assertAnotherCompletedAdmin(transaction, excludedUserId)`. Guard requires held singleton lock, excludes target and null-password accounts. No unrelated admin locks; avoid reverse ordering. Missing actor maps to forbidden before exposing target status.
- `src/lib/account-role-changes.ts` (new): `changeUserRole(database, actorUserId, input)` owns transaction, locks actor/target, authorizes, guards and writes. Map SQLSTATE 40P01/40001 after rollback to retry; propagate unexpected failures.
- `tests/e2e/e2e-seed-data.ts`: reuse user mothers.

## Tasks & Acceptance

**Execution:**

- [ ] `src/lib/account-lifecycle-locks.test.ts` — first edit: instance-first sorted/deduplicated locks, missing rows, last-admin guard excluding unfinished/target accounts, DB failure propagation.
- [ ] `src/lib/account-role-changes.test.ts` — test first: matrix, actor demoted while waiting, safe results, no writes on refusal, write-failure rollback, direct/nested SQLSTATE errors. Hermetic doubles only; real concurrency proven below.
- [ ] `src/data/types.ts` — input/result/failure domain types; reuse UserRole. Transaction utility types stay beside services.
- [ ] `src/lib/account-lifecycle-locks.ts`, `src/lib/account-role-changes.ts` — implement helpers/service; pass targeted tests. Guard throws before mutation, supporting caller-owned rollback.
- [ ] `tests/e2e/role-service-fixture.ts` — materialize cloned user mothers in unique scenario-owned schema with users/instance_state cloned from public tables. Inject transaction wrapper using local search_path. Cleanup schema/client even after failed setup; never mutate public admins/global setup. Validate generated schema identifiers and exclude public from service search_path so missing tables fail closed.
- [ ] `tests/e2e/features/instance-role-service.feature`, `tests/e2e/steps/instance-role-service.steps.ts` — `@feat:instance-role-service`: persisted promotion/demotion, last-admin refusal with unfinished admin, unfinished promotion, overlapping self-demotions, stale actor refused. Invoke service directly; use deterministic lock barriers and durable row/result assertions. Register fixture cleanup before scenario work.
- [ ] `tests/e2e/feature-map.mjs` — register service, locks, fixture and scenario paths for affected selection.
- [ ] Run targeted tests, then affected E2E. Final repository-owned build-validator gate follows completed implementation; fix failures before completion.

**Acceptance Criteria:**

- Given two completed admins, when concurrent self-demotions contend in PostgreSQL, then one commits and one completed admin remains.
- Given one completed admin plus unfinished admins, when demotion or exported deletion guard runs, then removal is refused without role changes.
- Given passwordless member, when promotion runs, then unfinished-account returns and member role persists.
- Given actor demoted before acquiring lock, when request resumes, then target stays unchanged and forbidden returns.
- Given caller-owned transaction, when exported helpers run, then protection composes without opening another transaction.

## Implementation Notes

## Plan Change Log

## Review Triage Log

- medium / patch — `waitForBlockedTransaction` counted any blocked backend in the E2E DB; scoped by per-fixture `application_name`.
- medium / patch — gate not released if wait throws; release moved to `finally` in both gated steps.
- low / patch — uppercase UUIDs failed row matching and dedupe; ids lowercased in service and lock helper, tests added.
- low / patch — invalid-role test did not assert no transaction opened; now asserts count 0.
- low / patch — missing caller-owned-transaction composition test; added to locks tests.
- low / rejected — `assertAnotherCompletedAdmin` does not enforce held singleton lock; enforcing needs new public parameter, precondition documented, plan fixes the signature.

## Design Notes

Singleton serializes mutations. Isolated DB tests prevent baseline admins masking defects.

## Verification

- `npx vitest run src/lib/account-lifecycle-locks.test.ts src/lib/account-role-changes.test.ts scripts/feature-map.test.mjs` — pass.
- `npm run test:e2e:affected` — role-service scenarios pass, isolated schema cleanup succeeds.
- `build-validator` — lint, types, coverage, build and affected E2E pass; no automatic full suite.


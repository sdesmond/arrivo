---
title: Invite one contributor through the API
type: feature
ticket: "1"
created: "2026-11-17"
status: done
baseline_revision: d2e352c64222313bc5d4912f2b40976ed0388d7c
route: full
route_source: auto
risk: high
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context: [_bmad-output/initiative-mobile-api/AGENTS.md]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sharing reads and invitation creation use server actions. Invitation authorization precedes its transaction, allowing manager-demotion races; API replay must preserve invitation lifecycle.

**Approach:** Migrate manager sharing/picker reads and invite/reinvite creation through contracts, services and API handlers, then connect existing dialog hooks. Establish atomic deadline/replay orchestration reusable by later sharing stories.

## Boundaries & Constraints

**Always:** Branch `story/4-1-invite-contributor-api`, PR base `feature/api-v1`; return to integration branch after authorized PR. Preserve user-before-trip locks, transactional manager authorization before replay, DB-clock expiry predicates, mapped rows, postcommit activity/live events, existing UI and stale recovery. Domain types live in `src/data/types.ts`. Client UUID and idempotency semantics follow existing retention policy, explicitly documented. Tests precede runtime edits.

**Never:** New schema/environment requirements, native UI, migration of contributor batches/leave/invitation decisions or manager transitions, unrelated cleanup, CHANGELOG edits, ticket edits, automatic full E2E, unauthorized push/PR. Keep Server Component pending-invitation reads direct.

## I/O & Edge-Case Matrix

| Given | When | Then |
| --- | --- | --- |
| Manager and eligible registered user | Read sharing/picker; invite valid role | Pending invitation persists; invitee dashboard updates live |
| Caller/passwordless account/member/pending invite | Load picker | Excluded, including expired pending; preserve sorting and hasOtherUsers |
| Existing pending invitation | New invite intent | Preserve row identity; refresh role/expiry as existing resend behavior |
| Declined/rescinded invite | Fresh intent with fresh UUID | New pending invitation; old request cannot revive previous intent |
| Successful keyed or UUID create | Exact retry | Same result; no duplicate mutation/activity/events |
| Claimed UUID/key | Changed recipient, trip or role | 409; conceal foreign inaccessible resources |
| Rescinded/dismissed/accepted/declined original intent | Old create retry | No revival or additional effects; same-key replay returns saved success; new-key reuse of retired UUID conflicts |
| Viewer/editor/stranger or demoted manager | Read/write/replay | 403 for insufficient member role; 404 for nonmember; no cached disclosure |
| Invalid role/self/missing account; deadline exceeded | Submit | Typed validation/domain error or timeout; transaction and replay roll back together |

</frozen-after-approval>

## Code Map

- `src/lib/membership-writes.ts`: invite writer owns transaction; extract transaction-level invite work without nesting, retain `lockUsersThenTripForUpdate`; add locked manager recheck and supplied identity.
- `src/lib/services/trip-write.ts`, `src/lib/api/idempotency.ts`, `src/lib/request-deadline.ts`: reuse atomic replay and deadline guard; sharing needs its existing domain-specific effects rather than generic itinerary effects.
- `src/lib/invitations.ts`, `src/lib/invitable-users.ts`, `src/lib/queries.ts`: retain expiry helper, direct pending reads and picker exclusions; reuse sharing read queries and mappers.
- `src/components/arrivo/use-trip-share-dialog-controller.ts` (207 lines), `use-trip-share-invite-form.ts` (102): existing refresh sequence/unmount guards, staged pruning, picker reload and success/reset behavior. Move `ShareDialogData` to canonical types; adapt type consumers without UI redesign.
- `src/app/(app)/trips/actions.ts`, `src/app/(app)/trips/[tripId]/actions.ts`: retire only `listInvitableUsers`, `inviteContributor`, `getShareDialogData`; leave unrelated operations intact.
- Prerequisite pilot/itinerary verification plans: shared route wrapper, client error/replay behavior, exact API waits, scenario-owned fixtures and production affected-suite procedure already established.

## Tasks & Acceptance

**Execution:**

- [x] Tests first: extend `src/lib/membership-writes.test.ts`; add `src/lib/services/sharing.test.ts`, `src/lib/api/contract/sharing.test.ts`; exercise every matrix branch, lock ordering, demotion, rollback and effect counts.
- [x] Add `src/lib/api/contract/sharing.ts` and `src/lib/services/sharing.ts`: GET `/api/v1/trips/:tripId/collaborators`, GET `/api/v1/users/invitable?tripId=...`, POST `/api/v1/trips/:tripId/invitations`. Validate UUIDs, username and role; return existing domain shapes with typed errors. Add corresponding `route.ts` and `route.test.ts` under all three paths using `apiRoute`.
- [x] `src/lib/membership-writes.ts`: expose transaction-level invite work consumed by service; preserve existing callers. Atomically store creation-intent evidence in existing replay storage so pending-row aliases and deleted/replaced rows cannot permit UUID reuse. Specify retention, fingerprint, pending alias and fresh-intent behavior in API docs; test independent keys and absent headers too.
- [x] Extend `src/components/arrivo/use-trip-share-dialog-controller.test.ts`, `use-trip-share-invite-form.test.ts` before hook edits: API reads/writes, stable UUID on uncertain retry, fresh identity for changed intent, blocked/double-submit, typed no-account error, stale response/unmount, refresh/reset and failed refresh. Update `use-share-invitation-actions.ts` canonical type import and `use-share-invitation-actions.test.ts`; every touched covered module gets matching colocated test edit.
- [x] `src/data/types.ts`, both hooks and type consumers: migrate calls through existing API client/mutation conventions. Preserve labels, keyboard/Escape/focus behavior, status announcements, token styling and 44px targets; no new widgets.
- [x] Both action modules and matching `actions.test.ts`: remove three migrated exports/tests; audit production callers. Update `trip-share-dialog.test.tsx` and `trip-share-invite-form.test.tsx` if integration mocks change.
- [x] Extend `tests/e2e/features/trip-sharing.feature`, `tests/e2e/steps/trip-sharing.steps.ts`, `tests/e2e/features/api.feature`, `tests/e2e/steps/api.steps.ts`: manager invite/reload, invitee live dashboard, picker, access/validation, UUID/key collision, replay after access loss and no revival after rescind/dismiss. Use mothers/materializers and exact method/path waits armed before gestures.
- [x] `tests/e2e/feature-map.mjs`, `src/lib/api/contract/meta.ts` with `meta.test.ts`, `docs/api-v1.md`: register runtime ownership/endpoints and lifecycle/replay policy. Run targeted tests, implementation review, then project-owned build-validator gate.

**Acceptance Criteria:**

- Given production build, when manager invites registered user, then pending row survives reload and appears on invitee's live dashboard.
- Given race/retry/lifecycle matrix, when requests run, then persisted identity, access and side effects match matrix with atomic rollback.
- Given final tree, when retired-export audit and targeted/affected validation run, then no migrated action callers remain and checks pass without migrations or new settings.

## Implementation Notes
- Sharing reads and invitation creation now use contracts, services and API routes; existing invitation-row decisions/resends remain server actions as scoped.
- UUID evidence and header replay share the invitation transaction; manager authority is checked after account/trip locks and before replay. Retry decoding failures preserve UUID; plain-HTTP clients use existing UUID fallback.
- Four review lenses completed. Verified corrections cover retry identity, UUID portability, incompatible evidence, direct GET access, concurrent intent claims, lock-contention demotion, persisted deadline rollback, retention and response documentation. Two inherited writer issues were recorded separately in deferred-work.md.

### Matrix test audit

Every approved matrix row has executed passing coverage:

1. Manager invitation/read/live persistence: trip-sharing browser scenarios for pending row after reload and invitee dashboard without reload; sharing service/route tests.
2. Picker exclusions/order/hasOtherUsers: invitable-users unit tests and trip-sharing picker scenarios; existing helper remains unchanged.
3. Existing pending row: membership writer resend test and API fresh-UUID alias scenario preserve row identity.
4. Fresh intent after retirement: declined replacement writer test and API deleted-row replacement scenario; old alias retry conflicts.
5. Exact keyed/UUID retry: service saved-result/effect assertions and simultaneous independent-key production scenario persist one invitation and one creation activity.
6. Changed UUID/key fingerprint: API role/recipient/trip collision scenarios plus foreign-resource concealment service tests.
7. Retired lifecycle: production API rescinded/dismissed/declined/accepted state matrix; same-key saved success, independent/absent key conflict, unchanged snapshots.
8. Access and demotion: direct GET editor/viewer/nonmember matrix, POST access-loss replay scenarios, deterministic trip-lock contention for create/replay, and locked writer/service tests.
9. Validation/deadline: contract invalid-field and typed self/missing-account tests; production delayed-trigger scenario observes all three inserts before deadline and confirms no persisted invitation or replay rows after rollback.

## Plan Change Log

- Final gate exposed route-registration test importing Auth.js through sharing helpers; isolated auth-helper mock and explicitly registered invitation endpoint. Targeted registration tests: 2 passed.

- Pre-implementation plan-reviewer: scope, architecture, component, accessibility and test checks PASS; no blocking findings. Original request: build story 4.1, invite one contributor through API.

## Review Triage Log
| Finding | Verdict / route | Evidence |
| --- | --- | --- |
| Blind 1: rename between lookup and lock | medium / defer | Old invite action also looked up normalized username before writer transaction and only locked ID. Existing profile rename locks account; pre-existing race retained by migration. |
| Blind 2: successful response decoding clears UUID | medium / patch | API client wraps malformed successful JSON in ApiClientError with status 200; current positive-status condition clears intent and permits duplicate resend effects. |
| Blind 3: incompatible replay-storage record | medium / patch | Packing accepts raw keys and stores template result; unchecked cast makes tripId undefined. Reject incompatible claimed evidence with typed conflict before interpreting it. |
| Blind 4: caught unique violation in aborted transaction | medium / defer | Catch-and-return pattern already exists in original writer; account/trip locks serialize cooperating invitation writers. Existing recovery behavior needs separate conflict-safe insertion work. |
| Blind 5: real concurrent-request coverage | medium / patch | Existing added API retries are sequential and unit locks are mocked. Add simultaneous UUID claims and deterministic demotion lock contention verification. |
| Blind 6: persisted deadline rollback evidence | medium / patch | Mocked deadline test proves transaction callback throws but not persisted rollback. Add production DB verification after mutation has started. |
| Blind 7: UUID retention boundaries | medium / patch | New timestamp predicate has no boundary verification. Add expired-evidence and swept-evidence cases, including still-existing original row. |
| Blind 8: replay effects and result assertions | false / reject | Service tests already assert exact saved result, no writer/activity/trip-event calls on UUID replay, and no user-event calls on keyed replay; API E2E snapshots add persisted identity evidence. Different test layers jointly verify contract. |
| Blind 9: GET access matrix | medium / patch | Direct GET checks cover manager success only; add editor/viewer/nonmember assertions for both endpoints. |
| Blind 10: undocumented response fields | medium / patch | New API reference relies on undocumented existing shapes; document fields and nullability from canonical types/mappers. |
| Edge 1: successful response decoding clears UUID | medium / patch | Same verified cause as Blind 2; guard excerpt in finding differs from current source, but actual source clears on status 200. |
| Edge 2: plain HTTP UUID generation | medium / patch | createRandomId in existing utils explicitly supports browsers without randomUUID; new hook bypasses it and sets submittingRef before throw. |
| Edge 3: waitFor matcher as options | low / patch | Second waitFor argument is accidental expect.any(String); remove unsupported argument. |
| Verification 1: GET manager-only contract unprotected | medium / patch | Filed mutation demonstration stands: mocked access ignores required role and current E2E only reads as manager. Same fix as Blind 9. |
| Intent alignment | false / reject | Narrow create/reinvite scope matches approved matrix; existing shared helpers plus transaction-level writer form foundation. Runtime mutation and integration tests cover intended surfaces; verification additions above strengthen race/rollback proof. |

## Verification
Final validation:

- Targeted implementation tests: 481 passed across 39 files. Review correction tests: 105 passed. Route-registration correction: 2 passed.
- Targeted production E2E: 78 passed; additional alias scenario passed; review access/concurrency/rollback/retention run: 12 passed.
- build-validator: ESLint PASS; TypeScript PASS; production build PASS (22 static pages; 7.61 MiB aggregate static JavaScript).
- Full coverage: 8,033 tests passed across 472 files; lines 98.07%, functions 97.79%, branches 93.97%.
- Affected production E2E: 714 passed, 0 failed. Full E2E suite was not invoked.
- Review: all four lenses completed; all accepted patches applied and verified; two inherited writer issues recorded in deferred-work.md.

- `npx vitest run src/lib/membership-writes.test.ts src/lib/services/sharing.test.ts src/lib/api/contract/sharing.test.ts src/app/api/v1 src/components/arrivo/use-trip-share-dialog-controller.test.ts src/components/arrivo/use-trip-share-invite-form.test.ts` plus touched action/component/meta tests: pass.
- `node scripts/run-e2e.mjs --grep="@feat:(trip-sharing|api)"`: targeted production scenarios pass; add other mapped affected features if touched.
- `build-validator`: lint/types/build finish, coverage alone, affected E2E alone; pass. No automatic full-suite run.

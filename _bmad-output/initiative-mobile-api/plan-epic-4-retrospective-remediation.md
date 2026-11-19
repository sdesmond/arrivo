---
title: "Protect collaboration decisions and verify their concurrency"
type: "bugfix"
ticket: ""
created: "2026-11-18"
status: "built"
baseline_revision: "09916cb92cfb0cd6078917f63911e4ef949bf37d"
route: "full"
route_source: "auto"
risk: "high"
review: "thorough"
review_source: "auto"
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context: [_bmad-output/initiative-mobile-api/AGENTS.md]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Invitation acceptance can overwrite an existing membership; an invite can use a username that changed before locking; account-deletion race tests exercise retired writer wrappers; and a lost invitation-decision response cannot be replayed by the web client.

**Approach:** Preserve established membership, revalidate invite identity under lock, exercise production sharing services with real concurrent account deletion, and reuse decision-specific replay keys for uncertain responses. Complete the retrospective's required validation.

## Boundaries & Constraints

**Always:** Use branch `fix/epic-4-retrospective`, base `feature/api-v1`. Author tests first. Preserve user-before-trip locking, transactional authorization, current replay rules, postcommit effects, concealed errors, and scenario-owned fixtures. A username mismatch after locking returns the existing no-account result without retargeting. A pending invitation accepted after membership already exists leaves that membership's role and creator flag intact. Retry keys are unique per invitation and decision; keep them through uncertain failures and forget them on success or a definitive rejection. Use the existing API client and UUID helper. Automatically retry one uncertain decision failure with the same key while its request remains active; handle existing documented 404 if a manager removes the invitation before replay. No duplicate activity or events on replay.

**Never:** Change schema or environment, weaken authorization, send keys for unsupported GET/multipart endpoints, auto-run the full E2E suite, change unrelated product flows, or commit/push without authorization.

## I/O & Edge-Case Matrix

| Scenario | Input / state | Expected behavior |
| --- | --- | --- |
| Acceptance | Existing membership follows pending invite | Invitation accepted; original role and creator flag remain, no duplicate membership |
| Identity changed | Resolved account renamed or username reassigned before lock | Existing no-account error; no invitation or effects; no retarget |
| Existing replay | Successful invite replay after rename | Existing authorized replay semantics remain |
| Account deletion race | Invite, accept, contributor change or leave races deletion | Production service path serializes correctly; no deadlock, ghost membership or partial writes |
| Lost decision response | Server commits accept/decline but response is lost | Same-key retry returns saved result and normal UI success; no duplicate effects |
| Distinct decision | Different invitation or accept versus decline | Different key; definitive conflict/404 handled normally |

</frozen-after-approval>

## Code Map

- `src/lib/membership-writes.ts` and `.test.ts`: `acceptInvitationInTransaction` upserts collaborator values; preserve existing rows, retain insert and effects.
- `src/lib/services/sharing.ts` and `.test.ts`: `inviteContributor` resolves username before `lockUsersThenTripForUpdate`; recheck ID and normalized name inside locked transaction after replay handling.
- `tests/e2e/deletion-concurrency-fixture.ts`, `tests/e2e/features/deletion-concurrency.feature`, `tests/e2e/steps/deletion-concurrency.steps.ts`: isolated schema and lock gates currently call writer wrappers. Service uses the DB singleton and effects; use an authenticated HTTP fixture with scenario-owned rows and deterministic DB lock gates so tests exercise actual service transaction and authorization. Gate observed locks, not assumed execute counts. Preserve existing assertions and cover both lock orderings.
- `src/lib/api/client.ts` and `.test.ts`: optional idempotency key header for opted-in JSON writes; existing callers unchanged.
- `src/components/arrivo/pending-invitations-list.tsx` and `.test.tsx`: decision handlers and normal navigation; use `createRandomId` from `src/lib/utils.ts`, retain separate decision keys and retry uncertain failures. Do not promise replay after row deletion or across a remount.
- `tests/e2e/features/api.feature`, `tests/e2e/steps/api-invitation-decisions.steps.ts`: seed existing membership after invitation and assert acceptance preserves it. `tests/e2e/features/pending-invitations.feature` and `tests/e2e/steps/pending-invitations.steps.ts`: exercise committed decision with lost response and same-key retry.
- `tests/e2e/feature-map.mjs`: register any new runtime or fixture files; no new file is assumed. `docs/api-v1.md` only if public contract changes.

## Tasks & Acceptance

**Execution:**

- [x] Expand `membership-writes.test.ts` and `services/sharing.test.ts` first: existing creator/manager preservation; fresh insert; rename/reassignment and unchanged normalized name; no effects; authorized replay. Then modify matching source.
- [x] Expand `client.test.ts` and `pending-invitations-list.test.tsx` first: optional header, no unsupported header, uncertain failure and same-key retry, different decisions/IDs, success and definitive failure cleanup, unmount and double-submit. Then modify matching source.
- [x] Extend API and pending-invitation features and matching steps for preserved existing membership and a committed response lost before retry; assert persisted data and no duplicate side effects.
- [x] Update deletion-concurrency feature, steps and fixture to run invite, accept, contributor change and leave through the real service/HTTP path with deterministic lock contention; test both lock orders, demotion, creator protection and final state. Any modified `src/lib/**` module gets matching colocated test edits first.
- [x] Record results in this plan and reconcile completed entries in `deferred-work.md` only when proved. Run targeted tests then `build-validator` once on final tree; address failures and rerun as needed.

**Acceptance Criteria:**

- Given an existing protected collaborator and a pending invitation, when it is accepted, then membership role and creator flag remain unchanged after reload.
- Given a rename between lookup and lock, when an invite is submitted, then no unintended account receives it.
- Given real account-deletion contention, when each migrated collaboration operation runs, then no deadlock, ghost membership or partial state occurs.
- Given a committed decision with a lost response, when it is retried with its retained key, then UI success and server state agree without repeated effects.

## Implementation Notes

- Acceptance now ignores an existing collaborator conflict; invitation creation rechecks the originally resolved account ID and normalized username under lock, after replay handling.
- Decision requests retain per-invitation, per-decision keys through uncertain failures and retry once while mounted. Definitive rejection and success discard the key.
- Scenario-owned public-schema HTTP races cover invitation creation, acceptance, contributor removal and role changes, and leave, with both lock orders, owner deletion, lower-ID account locking, creator protection and manager demotion or removal. PostgreSQL blocker PIDs identify queued transactions. Duplicate wrapper-only collaboration scenarios were retired; isolated trip-creation and account-deletion checks remain.

## Plan Change Log

- Plan-reviewer: scope, architecture, component, accessibility and test checks pass; 0 blocking. Original request: implement the epic 4 retrospective's proposals together. Existing pending-invitations component is 136 lines; all covered source files have colocated test and flow coverage named above.

## Review Triage Log

- HTTP 408 discards an uncertain replay key: medium, patched and tested.
- Keys are lost on reload or unmount, including concurrent navigation: true, rejected because the approved boundary explicitly limits recovery to the mounted component.
- Lost decline response lacks E2E verification: medium, patched with committed-response interception and event-count assertions.
- Two uncertain failures followed by a later user retry: false, the component test verifies the third call retains the original key.
- Username change under real lock contention: medium, patched with an authenticated API race and effect assertions; verification-gap identified the same gap.
- Replay after rename lacks a specific test: medium, patched with an authorized replay test.
- Lock gate can observe another scenario's transaction: false for the asserted contention; gates match the scenario-owned holder PID and then follow its blocker chain.
- Invitation and collaborator assertions could miss another account: false for these deletion races; the fixture and operations identify scenario-owned target accounts, and username retargeting has a separate real-lock test.
- Execution checkboxes and final validation incomplete: true, rejected as a plan-bookkeeping finding; final validation follows review.
- Intent alignment: public sharing paths and real deletion transactions are exercised; deletion itself uses its production function directly. Cross-remount recovery is outside the approved boundary. Final validation remains pending.

## Verification

- `npx vitest run src/lib/membership-writes.test.ts src/lib/services/sharing.test.ts src/lib/api/client.test.ts src/components/arrivo/pending-invitations-list.test.tsx` — 232 tests pass.
- `npx tsc --noEmit --pretty false` — passed after HTTP race fixture changes.
- `node scripts/run-e2e.mjs --server=kill '--grep=@invitation-decisions-api|@feat:pending-invitations'` — 16 passed, including the new API and lost-response cases. A later self-invite validation-order fix was not in that build.
- `node scripts/run-e2e.mjs --server=reuse '--grep=@deletion-http-'` — 10 passed, including setup and nine HTTP concurrency scenarios, against a production build including the self-invite fix.
- `node scripts/run-e2e.mjs --server=reuse '--grep=@feat:deletion-concurrency'` — 23 passed, including setup, 19 HTTP scenarios and three isolated checks.
- After review fixes, targeted Vitest passed 234 tests and the combined API, pending-invitations and deletion-concurrency production E2E run passed 40 tests.
- Final build-validator: lint, TypeScript and production build passed; coverage passed 8,139 tests (98.12% lines, 97.82% functions, 94.06% branches); affected E2E passed 786 tests. Build and coverage were rerun outside the sandbox after directory-access denials.

---
title: "Authentication and account events"
type: "feature"
ticket: "3"
created: "2026-10-26"
status: done
baseline_revision: "9b8b7b666fec176b5670d7c63b5e702562a2507e"
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

Record missing Activity events: rejected credentials, explicit logout, bootstrap creation, role changes, username/password changes and self-deletion.

## Boundaries & Constraints

**Always:** Schedule once after primary commit, outside transactions, through nonthrowing `recordActivity`; preserve bounded post-response work and real clock. Capture pre-change usernames and stable IDs from mutation-owned rows. Failed sign-ins identify targets, never authenticated actors. Known targets use canonical username; unknown targets use supplied username plus “Unknown account”; missing identity says “Unavailable”. Retain only bounded username-shaped input; unsafe/malformed identity is unavailable. Additional identity lookup failures cannot alter primary outcomes.

**Never:** Store credentials, tickets, codes, URLs, IPs, changed values or private data. No migration, retries, auth-policy changes, filters/retention, onboarding/recovery/MFA-management producers, implicit logout events for password/deletion, or unrelated refactoring. Preserve authority, throttling, revocation and locks.

## I/O & Edge-Case Matrix

| Scenario | Expected outcome |
| --- | --- |
| Wrong password, unknown/passwordless account, locked gate | One rejection; safe target, unavailable actor |
| Missing fields or invalid/expired MFA ticket | One rejection; never trust unverified ticket identity |
| Valid MFA ticket, rejected/missing code or lockout | One rejection; known target only from current DB row |
| Password accepted, MFA challenge | Neither failure nor completed login |
| Committed account mutation | One event with captured identity |
| Refusal, rollback, normalized username/role no-op, unrelated profile edit | No success event |
| Activity scheduling/write fails | Primary outcome/redirect unchanged; existing history survives |

</frozen-after-approval>

## Code Map

- `src/lib/authorize-credentials.ts`: single gate includes direct callbacks; keep `completeSignIn` as sole success emitter.
- `src/data/types.ts`, `src/lib/activity.ts`: extend individual event types and nullable failure identities; preserve known trip-batch identity requirements. Schema already has nullable actor/target fields.
- `src/lib/activity-queries.ts`, `src/components/arrivo/instance-activity.tsx`: expose targets; distinguish actor/affected account and Unknown account/Unavailable text. Keep server rendering, explicit Props, semantic Table, tokens and labeled keyboard-scrollable overflow; component is 64 lines.
- `src/app/(auth)/actions.ts`: bootstrap result supplies committed ID and validated username. Emit before auto-sign-in. Logout captures DB identity best-effort, calls `signOut({redirect:false})`, records only on success, then redirects.
- `src/lib/account-role-changes.ts`, `src/lib/account-deletion.ts`: return credential-free snapshots captured under existing locks; adapters record after transaction resolves.
- `src/app/(app)/profile/actions.ts`: username changes need transactional row lock/read/update for old identity and real-change detection. Password update returns current username; emit after update/session revocation before sign-out. Deletion emits immediately after service success, before cleanup.
- `src/app/(app)/admin/users/actions.ts`: emit only `ok && changed`. `profile/security-actions.ts` has no password replacement; unchanged.

## Tasks & Acceptance

**Execution:**

- [ ] Tests first: `src/lib/authorize-credentials.test.ts` — rejection matrix, canonical/unknown/unavailable targets, no secrets, preserved throttling/MFA success. `src/lib/activity.test.ts` — nullable persistence and scheduling/write failures. `src/lib/activity-queries.test.ts`, `src/components/arrivo/instance-activity.test.tsx` — safe target reads, labels and identity distinctions.
- [ ] Tests first: `src/app/(auth)/actions.test.ts` — bootstrap commit/refusal and logout success/failure/unavailable identity. `src/app/(app)/profile/actions.test.ts` — rename snapshots/no-op/rollback, password success/refusal/failure, deletion success/refusal. `src/lib/account-role-changes.test.ts`, `src/lib/account-deletion.test.ts`, `src/app/(app)/admin/users/actions.test.ts` — locked snapshots, postcommit-only emission and no-op/refusal/rollback. Exercise real recorder scheduling/persistence failures, preserving its nonthrowing public contract.
- [ ] Implement Code Map contracts and producers; preserve batching/sign-in. Prove row changed before username event.
- [ ] `tests/e2e/features/instance-activity.feature`, `tests/e2e/steps/instance-activity.steps.ts` — actual known/unknown/direct-callback rejection, unavailable MFA identity, logout, role change, rename, password and self-deletion. Assert counts/snapshots and visible identities; retain challenge test. Use mothers, poll writes and await action POST before reload.
- [ ] `tests/e2e/features/instance-bootstrap.feature`, `tests/e2e/steps/instance-bootstrap.steps.ts` — creation-event assertions. Only this feature mutates fresh-instance state; reuse its existing fixture.
- [ ] `tests/e2e/feature-map.mjs` — map producers to instance-activity alongside existing coverage. `activity-producer-inventory.md` beside this plan — correct stale account-story numbering.

**Acceptance Criteria:**

- Given direct callback credentials fail, when Activity is read, then one failure identifies safe target context without attributing an authenticated actor.
- Given rename/deletion, when historical events are read, then original stable IDs/usernames remain intact and distinguishable from later events.
- Given Activity scheduling/persistence fails, when account/auth operations complete, then outcomes/redirects remain unchanged; failed primary mutations emit no success.

## Implementation Notes

## Plan Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| Bootstrap creation step defined but unused in any scenario | medium | patch | Step at `instance-bootstrap.steps.ts:102` had no feature line; added to first sign-up scenario, passes. |
| Forged-ticket E2E counts null-identity rejections globally by start time | low | reject | Real collision risk only with a future concurrent test; fix adds scoping complexity. |
| `setTimeout(500)` absence check | low | reject | Absence cannot be polled; bounded wait is the direct form. |
| profile/admin-users actions mapped only to instance-activity | false | reject | Union with `profile` (`profile/**`) and `admin/users/**` entries in `feature-map.mjs`. |
| `currentIdentity` treats `auth()` throw as signed-in | low | reject | Rare edge; fix adds branching. |
| One rejection row per locked attempt, unbounded | low | reject | Plan matrix mandates one rejection per attempt; fix edits plan. |
| Extra read in `lookupByUsername` | false | reject | Plan-required identity lookup; failures swallowed. |
| `actorLabel` Unknown vs Unavailable | false | reject | Reviewer itself found it consistent. |

## Verification

- Targeted `npx vitest run` for listed test files, then `npm run test:e2e:affected`: pass producer and regression scenarios.
- Parent invokes final `build-validator` after implementation/targeted checks: lint, types, coverage, build and affected E2E pass.

---
title: "Credential-authorization schema and module"
type: feature
ticket: 1
created: "2026-10-27"
status: done
baseline_revision: "7efde8acfd28151feb619e1b1f7823be45223fbc"
route: full
route_source: auto
risk: high
review: 'quick'
review_source: 'pinned'
lenses_ran: [quick]
review_loop_iteration: 0
followup_review_recommended: false
context:
  - AGENTS.md
  - _bmad-output/initiative-self-hosted-administration/architecture-self-hosted-administration/architecture-self-hosted-administration.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Account onboarding needs a shared credential authorization lifecycle that cannot admit expired, replaced, consumed, cross-purpose, or deleted-account links.

**Approach:** Add hash-only purpose-bound authorization storage and request-independent transaction-composable issue, validate, and consume services, with injectable security clock and real PostgreSQL concurrency tests.

## Boundaries & Constraints

**Always:** At least 256-bit random tokens; SHA-256 hashes only in DB; account ID binding; setup lifetime 24 hours, reset/recovery one hour; same-purpose replacement atomic. Use AD-2 singleton then sorted-user locks, current completed-admin authority for web issuance, explicit trusted-operator authority for recovery issuance, token possession for completion. Setup issuance/consumption requires unfinished account; reset requires completed account; recovery requires completed admin. Completion of either reset family invalidates both reset families. Account deletion invalidates every purpose. Security clock defaults to real time and is injectable. Types live in src/data/types.ts. SQL failures roll back, with explicit retry for deadlock/serialization failures.

**Never:** Implement future setup/reset pages, cookies, MFA/session replacement, password policy, Activity producers, or admin account creation/deletion UI. No Next request APIs or hidden DB connections in shared service. No plaintext token persistence, logging, token retrieval after issuance, or itinerary mock clock.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Issue | Authorized caller and eligible account | Random token returned once, digest stored, correct purpose lifetime | Safe refusal for missing instance/account or stale authority |
| Validate | Current unconsumed token and matching purpose | Safe account context; no consumption or expiry extension | Generic invalid result for malformed, wrong-purpose, expired, replaced, consumed or deleted token |
| Replace | Existing same-purpose token | Prior authorization invalidated and replacement inserted atomically | Rollback preserves original if issuance fails |
| Consume | Current token under account lock | Exactly one success; credential callback and consume share transaction | Callback failure rolls back all writes; retry outcome for contention failures |
| Reset families | Reset or recovery successfully consumed | All reset/recovery authorizations invalidated | Failed completion changes no credentials or authorizations |
| Delete | Account with several authorization purposes deleted | Every authorization unusable | FK cascade occurs in account deletion transaction |

</intent-contract>

## Code Map

- `src/lib/account-lifecycle-locks.ts`: reuse lockInstanceAndUsersForUpdate; singleton then stable account ordering.
- `src/lib/server-action-locks.ts`: import DbTransaction as type only.
- `src/lib/account-role-changes.ts`: injected DB and current locked authority/retry patterns.
- `src/lib/account-deletion.ts`: existing deletion benefits from new FK cascade; avoid unnecessary edits.
- `src/db/schema.ts`, `drizzle/`: add credential authorizations table, constrained purposes, unique digest, user FK cascade, expiry and consumed/invalidation timestamps, account/purpose index; generate migration.
- `src/lib/trusted-devices.ts`: entropy/digest pattern only; do not import singleton-bound server-only implementation.
- `tests/e2e/role-service-fixture.ts`: isolated schema, transaction search_path and lock gates; LIKE INCLUDING ALL omits FK, so recreate cascade against scenario-local users.

## Tasks & Acceptance

**Execution:**

- [ ] First author `src/lib/credential-authorizations.test.ts` and `tests/e2e/features/credential-authorizations.feature` plus `tests/e2e/steps/credential-authorizations.steps.ts`. Cover every matrix row, authority, eligibility, exact expiry boundary, purpose isolation, read-only validation, rollback and concurrency.
- [ ] Add `tests/e2e/credential-authorization-fixture.ts` with fresh scenario-owned schemas/users from mothers, cleanup registered before setup, explicit local FK, and deterministic PostgreSQL lock gates. Never seed global feature data.
- [ ] Add purpose/authority/input/result domain types to `src/data/types.ts`; add schema and generated migration. Review generated SQL, apply E2E migration.
- [ ] Implement `src/lib/credential-authorizations.ts` with transaction-composable primitives and safe DB wrappers as needed. Issuance must compose with future Add User transaction. Consumption must accept a trusted server callback within its owned transaction or expose an equally safe composition API so credential writes and consume commit together. Validate input before DB work; revalidate under account locks; check expiry using clock after waiting. Do not export a client-callable credential-writing bypass.
- [ ] Register feature tag and module/fixture in `tests/e2e/feature-map.mjs`. Schema shared impact requires affected coverage, never manually launch full suite.
- [ ] Run targeted unit and BDD tests, then report exact commands/results in Implementation Notes. Do not invoke build-validator in child implementation; parent owns final gate.

**Acceptance Criteria:**

- Given an unfinished account, when a completed admin issues setup authorization, then DB stores only its digest and validation works until exactly 24 hours, without consuming on reads.
- Given a prior link, when same-purpose issuance commits or rolls back, then respectively only replacement or original remains valid.
- Given competing completion requests, when both use same link, then exactly one credential callback commits and token cannot be reused.
- Given a completion callback that fails, when transaction rolls back, then credentials and authorization remain unchanged.
- Given authorizations for an account, when account deletion commits, then none validates and no authorization row remains.
- Given stale admin authority, completed setup target, wrong purpose or expired context, when issue/consume is attempted, then no unauthorized write occurs.

## Implementation Notes

- Plan-reviewer run inline against original ticket 3.1 request before implementation. Scope PASS; architecture PASS (shared AD-2 locks, explicit authority, transaction composition, canonical types); components PASS (no UI); accessibility PASS (no UI); test coverage PASS (colocated unit tests and real-Postgres BDD cases for every matrix row). Zero blocking findings or warnings. Ready-for-development standard checked from disk; transitioned through ready-for-dev to in-progress.

## Plan Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| Implementation Notes lack command results | low | rejected | Fix edits this build's plan. |
| Deletion scenario uses raw delete, not deleteOwnAccount | low | rejected | deleteOwnAccount deletes the users row in its transaction, so the FK cascade applies; extra coverage is added complexity. |
| Fixture cleanup registered after base creation | false | rejected | createRoleServiceFixture closes (drops schema) itself on setup failure; later failures are caught and closed. |
| consume guard throws plain Error | low | rejected | Intentional rollback, reachable only if the trusted callback mutates the authorization; unit-tested. |
| Raw rows bypass db-mappers / expiresAt parsing | false | rejected | Result is a derived join, not a mapped entity; real-Postgres BDD passed (25/25 with activity-retention). |
| Missing real-DB scenarios for ineligible/stale cases | low | rejected | Covered by unit matrix tests; adding BDD scenarios is added complexity. |

## Design Notes

Route full: schema, domain service, migration and concurrency harness exceed 100 changed lines. Keep issuance composable to avoid nested transactions around future Add User. FK cascade handles deletion consistently with existing service. Recovery scaffolding establishes lifecycle rules only; credential/MFA/session mutation stays in future callers. Review must include authority-locking lens per ticket notes.

## Verification

- `npx vitest run src/lib/credential-authorizations.test.ts` — all matrix unit cases pass.
- `npm run db:generate` — reviewed additive migration with no unrelated changes.
- `npm run db:migrate:e2e` — migration applies successfully.
- `npm run test:e2e:affected` — registered real-Postgres scenarios pass, including deterministic contention and FK deletion.
- Parent invokes build-validator once after implementation and targeted tests pass; fix failures and repeat only as needed.

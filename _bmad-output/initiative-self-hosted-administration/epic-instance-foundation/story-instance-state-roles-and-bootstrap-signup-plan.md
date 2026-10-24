---
title: "Instance state, roles and bootstrap signup"
type: "feature"
ticket: "1"
created: "2026-10-24"
status: "built"
baseline_revision: "875b2c5da6f12cd3a7cbf193f9ee8f7e5da2f147"
route: "full"
route_source: "auto"
risk: "high"
review: "quick"
review_source: "pinned"
lenses_ran: [quick]
review_loop_iteration: 0
context:
  - "{project-root}/_bmad-output/initiative-self-hosted-administration/architecture-self-hosted-administration/architecture-self-hosted-administration.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Anyone can sign up and no admin concept exists, so an operator cannot close the instance or hold durable authority (CAP-1).

**Approach:** Add an `instance_state` singleton and `users.role` in one generated migration that promotes a sole legacy account and halts on several. Signup becomes a transactional bootstrap: the first signup becomes admin and marks the instance initialized; afterwards signup is refused regardless of `ALLOW_SIGNUP`.

## Boundaries & Constraints

**Always:** Names per epic: table `instance_state` (singleton), `users.role` const object `admin | member` in `src/data/types.ts`. Promotion and multi-account halt live in the SQL migration, not a boot hook. Bootstrap locks the `instance_state` row `FOR UPDATE`, creates the admin and sets `initialized_at` in one `db.transaction`. Refused copy exactly: `Ask an admin to create your account.` New `.feature` files carry `@feat:<stem>` and are registered in `tests/e2e/feature-map.mjs`.

**Never:** Boot-time or page-render promotion. Storing instance state outside the DB. Reading `ALLOW_SIGNUP` for the refusal (it no longer governs signup; remove its use). Feature-specific rows in `global-setup.ts` beyond baseline admin + initialized `instance_state`. Account menu, admin routes, role-change service (stories 1.2+). Editing applied migrations 0000-0003.

## I/O & Edge-Case Matrix

| Scenario                  | Input / State                         | Expected Output / Behavior                                     | Error Handling                          |
| ------------------------- | ------------------------------------- | -------------------------------------------------------------- | --------------------------------------- |
| First signup              | `initialized_at` null                 | User inserted `role=admin`, `initialized_at` set, signed in    | -                                       |
| Concurrent first signups  | Two at once, fresh                    | Exactly one admin; loser refused                               | `Ask an admin to create your account.`  |
| Later signup              | `initialized_at` set, any `ALLOW_SIGNUP` | Refused, nothing inserted                                   | `Ask an admin to create your account.`  |
| Taken username on bootstrap | Fresh, username exists              | Transaction rolls back, instance stays fresh                   | `That username is taken.`               |
| Migrate: 0 accounts       | Empty DB                              | `instance_state` row with `initialized_at` null                | -                                       |
| Migrate: 1 account        | One legacy user                       | That user `admin`, `initialized_at` set, once                  | -                                       |
| Migrate: >1 accounts      | Several legacy users                  | Migration aborts, no schema change applied                     | `RAISE EXCEPTION` naming count + remedy |

</frozen-after-approval>

## Code Map

- `src/db/schema.ts` -- add `users.role` (text, not null, default `member`) and `instanceState` table (boolean `id` pk default true + check `id`, `initialized_at` timestamptz null).
- `drizzle/0004_*.sql` (+ meta) -- from `npm run db:generate`; hand-append promotion/halt `DO $$` block (pattern: `0003_username_identity.sql`). Insert the singleton row inside it. Journal/snapshot checked by `scripts/migrations.test.mjs`.
- `src/data/types.ts` -- add `UserRole` const object + union.
- `src/lib/instance-bootstrap.ts` (new) -- `bootstrapFirstAccount(tx-capable db, values)` returns `{ ok: true, userId } | { ok: false, reason: "closed" }`; locks via raw `select ... for update` like `src/lib/server-action-locks.ts`. Colocated `.test.ts` with an in-memory fake serializing the lock.
- `src/app/(auth)/actions.ts:69` -- `signUpAction`: replace `ALLOW_SIGNUP` check; validate, hash, call bootstrap; keep `isUniqueViolation` mapping and sign-in. Update `actions.test.ts:126` case.
- `tests/e2e/global-setup.ts` -- truncate `instance_state`; baseline user `role: admin`; re-insert initialized row.
- `tests/e2e/scenario-fixture.ts` + `tests/e2e/instance-state.ts` (new) -- `setInstanceState(fresh|initialized)` per-scenario helper; restores initialized in cleanup.
- `tests/e2e/features/instance-bootstrap.feature` + `steps/instance-bootstrap.steps.ts` (new, `@feat:instance-bootstrap`) -- the only file that mutates instance state (Playwright runs one file's scenarios serially, files in parallel, so no cross-file race): move the two sign-up scenarios out of `auth.feature` (and their steps) into it, add bootstrap + closed-signup scenarios; register in `feature-map.mjs` (also map `src/lib/instance-bootstrap.ts`).
- Docs only: `SETUP.md:100`, `.env.example:7` -- note `ALLOW_SIGNUP` no longer governs signup. Leave `docker-compose.yml` and `scripts/setup-dev.mjs` (+ its test) untouched.
- Do not change: `src/db/seed*` (seeded users default `member`), `src/lib/auth-helpers.ts`.

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/instance-bootstrap.test.ts` -- failing tests: first signup admin, concurrent first signups one admin, closed after init, rollback on unique violation -- test-first
- [x] `scripts/migrations.test.mjs` -- assert 0004 SQL contains singleton insert, promotion of sole account, and `RAISE EXCEPTION` for >1; sequence/snapshot checks pass -- migration contract
- [x] `src/data/types.ts`, `src/db/schema.ts` -- `UserRole`, `role` column, `instanceState` table
- [x] `drizzle/` -- `npm run db:generate`, append promotion/halt SQL, review (no drop+add)
- [x] `src/lib/instance-bootstrap.ts` -- implement transactional bootstrap
- [x] `src/app/(auth)/actions.ts` + `actions.test.ts` -- use bootstrap; refusal copy; drop `ALLOW_SIGNUP`
- [x] `tests/e2e/*` -- global-setup, instance-state helper, auth sign-up steps set fresh, new bootstrap feature + steps, `feature-map.mjs`
- [x] `SETUP.md`, `.env.example` -- note signup governed by instance state
- [x] Apply migration: `npm run db:migrate` and `npm run db:migrate:e2e`

**Acceptance Criteria:**

- Given a fresh DB, when two signups race, then one account exists with `role=admin` and the other sees `Ask an admin to create your account.`
- Given an initialized instance and `ALLOW_SIGNUP=true`, when anyone signs up, then no row is inserted and the refusal copy shows.
- Given a one-account legacy DB, when migrations run, then that account is admin and the instance initialized; re-running changes nothing.
- Given a multi-account legacy DB, when migrations run, then the run fails with an operator-actionable message and applies no change.
- Given the E2E suite, when it starts, then baseline user is admin and instance initialized; sign-up scenarios run against a fresh state and restore it.

## Implementation Notes

- `SETUP.md` / `.env.example` task: on user direction after approval, `ALLOW_SIGNUP` was removed outright from them and from `docker-compose.yml`, `docs/self-hosting.md`, `scripts/setup-dev.mjs` and its test, instead of annotated.
- Migration halt/promotion is asserted by SQL text checks only; a real-Postgres test is deferred (`deferred-work.md`).

## Plan Change Log

## Review Triage Log

Pass 1 (quick): high 0 / medium 1 / low 1 / false 2 / maybe-false 1

- false, rejected: compose/setup-dev/self-hosting edits deviate from plan -- user directed removal of ALLOW_SIGNUP everywhere after plan approval.
- medium, rejected on user direction: upgrade-halt docs not needed yet (only one installation, no public packages); paragraph reverted.
- low, patch: `!state` branch in bootstrapFirstAccount untested -- added missing-row test.
- maybe-false (would be medium), defer: halt/promotion AC verified by SQL string checks only -- settled by a real-Postgres migration test.
- false, rejected: ON CONFLICT DO NOTHING dead on first run -- harmless, journal prevents re-run; reviewer says no action.

## Design Notes

Singleton: `id boolean primary key default true check (id)` guarantees one row. Bootstrap lock order: `instance_state` first (AD-2). Legacy sole account with a null `password_hash` cannot exist today (pre-setup-state), so promotion needs no extra check yet; story 1.5/epic 3 own unfinished accounts (`password_hash IS NULL`). Dev seed on an uninitialized dev DB leaves signup open until first signup or migration of a sole account; acceptable for dev.

## Verification

**Commands:**

- `npx vitest run src/lib/instance-bootstrap.test.ts "src/app/(auth)/actions.test.ts" scripts/migrations.test.mjs scripts/feature-map.test.mjs` -- expected: pass
- `npm run db:generate` -- expected: no further drift
- `npm run test:e2e:affected` -- expected: auth + instance-bootstrap features pass

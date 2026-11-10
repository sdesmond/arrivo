---
title: "Make API replay atomic and authorization-aware"
type: feature
ticket: 2
created: "2026-11-08"
status: done
baseline_revision: "64cae8da5b5ca07caeb689a13358e34e68dde9c6"
route: full
route_source: auto
risk: high
review: "thorough"
review_source: "auto"
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context: [docs/plans/mobile-api.md, _bmad-output/initiative-mobile-api/AGENTS.md]
---

<frozen-after-approval reason="human-owned intent">

## Intent

API retries currently execute mutations again. Add actor-scoped, authorization-aware replay whose result and mutation commit together, proving concurrent retries commit one write.

## Boundaries & Constraints

Branch: `story/1-2-atomic-api-replay`; PR base: `feature/api-v1`. Use existing `idempotency_keys` without migration. Preserve raw packing keys, `{templateId}` results, existing packing expiry and behavior. Keep cookie/session, CSRF, validation, rate-limit, no-store, canonical mapping, trip locks, activity and live sync behavior. Effects run after successful commit and only for a new mutation.

Only existing checklist-item PATCH adopts replay now. No new CRUD, client retries, optimistic ordering, metadata, auth migration, unrelated cleanup or environment changes. Requests without keys retain current behavior.

## I/O & Edge-Case Matrix

| Input/state | Expected |
| --- | --- |
| Valid key, editor, validated request | 200 mapped item; mutation and replay record commit atomically |
| Same actor/key/fingerprint, sequential or concurrent | Same stored JSON; one committed mutation and one set of effects |
| Same actor/key, different method/resource/payload | 409 conflict; no mutation or cached-result disclosure |
| Different actors using same key | Independent records; each must have resource access |
| Expired record | Fresh authorized execution atomically replaces record |
| Role reduced/removed, missing resource, revoked session | Existing 403/404/401; never return cached result |
| Mutation, record write or commit fails | No committed mutation/result; subsequent retry can succeed |
| Empty/oversized key | 422 field error; no mutation |

</frozen-after-approval>

## Code Map

- `src/lib/api/route.ts`: authenticates/validates before handler. Keep server transaction types outside client-safe `endpoint.ts`.
- `src/lib/services/checklists.ts`: owns transaction, trip lock, ancestry/role recheck, mapper and postcommit effects. Replay must share transaction.
- `src/lib/server-action-locks.ts`: DbTransaction/trip lock. `src/lib/activity-batches.ts`: advisory-lock pattern. Membership writers share trip lock.
- `src/db/schema.ts`: key/userId PK, result JSON, createdAt. `src/app/(app)/trips/packing-actions.ts`: raw keys/results and 24-hour freshness; leave intact.
- `tests/e2e/steps/api.steps.ts`: scenario-owned item and roles. Feature map already classifies API infrastructure.

## Tasks & Acceptance

Tests below are edited before corresponding runtime code. Every changed lib module gets its matching colocated test.

- [ ] Create `src/lib/api/idempotency.test.ts`, then `idempotency.ts`: fingerprint method, normalized concrete path and validated payload; stable object ordering, preserve arrays. Validate key length 1–255; namespace storage; version JSON fingerprint/result/expiry. Configurable positive finite expiry defaults to 24 hours; use `getNow()`. Serialize actor/key in PostgreSQL, authorize before lookup, atomically store/replace result. Test expiry boundary, method/path/body conflicts, actor separation, malformed envelope, rollback/retry.
- [ ] Update `src/lib/api/{route.test.ts,route.ts}`: forward validated replay metadata when key present; preserve gates/envelopes/no-store. Explicitly reject unsupported keyed handlers.
- [ ] Update `src/lib/services/{checklists.test.ts,checklists.ts}`: compose single transaction with precheck, trip lock and ancestry/role recheck; suppress effects on replay/failure. Test authorization loss while waiting, intervening writes, record-write failure, deferred/rejected commit. Domain types belong in `src/data/types.ts`.
- [ ] Update `src/app/api/v1/checklist-items/[itemId]/{route.test.ts,route.ts}` to forward context. Add raw-key/result compatibility assertions in `src/app/(app)/trips/packing-actions.test.ts`. ApiError already supports 409; if mapping changes, update `src/lib/api/{errors.test.ts,errors.ts}` together.
- [ ] Extend `tests/e2e/{features/api.feature,steps/api.steps.ts}`: sequential/concurrent replay, body/resource conflicts, expiry, downgraded/removed membership. Scenario-local DB audit trigger counts committed item updates and cleans up in finally; assert one update and replay row. Intervening opposite write proves replay returns original JSON without rewriting state. Add record-write failure injection proving real rollback and successful retry. Use fresh fixtures, no shared seeds or committed migration.
- [ ] Update `tests/e2e/feature-map.mjs` and `scripts/feature-map.test.mjs`: replay ownership for API/checklist consumers; preserve packing mappings. Update `docs/decisions/adr-api-contracts.md` with replay contract.

**Acceptance Criteria:**

- Given concurrent identical keyed PATCH requests, when both finish and state reloads, then both return identical success and DB evidence shows one committed update.
- Given successful keyed PATCH, when role is reduced or removed before retry, then retry returns 403 or 404 without cached data.
- Given legacy packing replay and ordinary unkeyed checklist writes, when regression suites run, then existing behavior and persistence remain intact without migrations.

## Implementation Notes

Built directly (no implementer subagent) on `story/1-2-atomic-api-replay`; PR base `feature/api-v1`.

- `src/lib/api/idempotency.ts` exports `withIdempotency(transaction, { actor, request?, payload }, { authorize, mutate })`. Lock order: actor/key advisory lock (3 s bound, then reset to 0 so the trip lock keeps its unbounded wait) → `authorize` (trip lock, ancestry and role recheck) → lookup → mutate → upsert. Lock timeout (`55P03`) maps to retryable 409.
- Replay metadata type `IdempotentRequest` lives in `src/data/types.ts`; the service fingerprints its own validated `patch`, not the route's body.
- `apiRoute(endpoint, handler, { idempotent })`; a keyed request to a handler without the option gets 400 `bad_request`.
- `tests/e2e/feature-map.mjs`: `src/lib/api/idempotency.ts` also maps to `packing-tab`, since packing shares the table. `src/data/types.ts` is type-only here, so it emits identical JS and does not force the full suite.
- Verification note: `scripts/feature-map.test.mjs` is a Vitest file; `node --test` cannot run it, so it ran under Vitest (15 pass).
- Ran: Vitest for `src/lib/api`, `src/lib/services`, `src/app/api/v1`, `packing-actions.test.ts`, feature-map (170 pass); `tsc --noEmit` clean; `@feat:api` E2E (27 pass).

## Plan Change Log

## Review Triage Log

| Finding (lens) | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| `set_config` bound/reset/local flag unasserted; real `55P03` to 409 never run (verification-gap) | medium | patch | Unit asserted only statement order; added parameter assertions and an E2E that holds the advisory lock on a second connection (real 409, then retry succeeds). |
| Unsupported key with invalid body gets 422, not 400 (edge-case) | low | patch | Check ran after body validation; moved before params/body parse, test added. |
| Resource-conflict E2E cannot see a stray write to the second item (blind) | low | patch | Audit trigger covers only the original item; step now asserts the other item stays unchecked. |
| No purge of expired replay rows (blind) | low | defer | Same unbounded-row pattern as legacy packing keys; logged in `deferred-work.md`. |
| Packing raw key `api:v1:*` plants an unreadable row, that key then 500s forever (blind, edge-case) | low | rejected | Only the key's own actor can plant it and can pick another key; guard would change packing code the story keeps intact. Fail-closed is intended. |
| Huge `expiryMs` makes `toISOString` throw (edge-case) | low | rejected | Developer-set option, fails loudly on first request, rolls back; not user reachable. |
| `lock_timeout` reset to `'0'` rather than prior value (blind, edge-case) | low | rejected | Repo sets no role/session `lock_timeout`; default is 0. |
| Retryable vs permanent 409 share one code, no `Retry-After` (blind) | low | rejected | Messages differ; no client exists yet; a distinct code is new public surface. |
| 3 s key-lock bound can 409 a legit twin under trip-lock contention (blind) | low | rejected | Requires a trip lock held over 3 s; 409 is documented as retry shortly; order is fixed by Design Notes. |
| `getNow()` mock clock drives expiry (blind, edge-case) | false | rejected | `getNow()` returns real `new Date()` on the server in every environment (`typeof document === "undefined"`). |
| Replays indistinguishable, failures not recorded, response not schema-checked, `replay.path` unchecked, key charset (blind) | low | rejected | By design per ADR/plan; headers cannot carry control characters; route derives path from `itemId`. |
| Unit mocks inspect drizzle `queryChunks` (blind) | low | rejected | Test-only; real SQL is exercised by the E2E scenarios. |
| `idempotency.ts` mapped to `packing-tab` without an import (blind) | false | rejected | Plan asks for replay ownership of the shared table; table coupling is the dependency. |
| No E2E for malformed row or opt-out 400 (blind) | low | rejected | Only one opted-in route exists; both unit-covered. |
| Effects skipped if process dies after commit (edge-case) | low | rejected | Same best-effort after-commit effects as the unkeyed path. |
| Intent-alignment: diff implements opt-in, header-keyed replay | n/a | none | Descriptive report, no divergence needing action. |

## Design Notes

Wrapper supplies request identity; helper composes authorization/mutation on one executor. Acquire actor/key advisory lock before trip lock, with bounded lock wait; recheck access after waiting. Unexpected occupied namespace fails closed, preserving legacy JSON.

## Verification

Run named Vitest tests, `node --test scripts/feature-map.test.mjs`, then API scenarios. Project build-validator owns final lint/types/build, coverage, affected E2E sequentially. No manual full-suite launch, commit/push/PR authorization implied.

---
type: epic
title: "API foundation and checklist pilot"
parent: initiative-mobile-api
covers: [R1, R2, R7]
after: []
assignee: ""
risk: high
status: done
---

# API foundation and checklist pilot

## Description

Record phase 0 decisions and ship trip checklist operations through authenticated API contracts, services, and web clients. Own shared transport, auth and CSRF, idempotency, error mapping, client refresh and ordering, metadata, and API test tooling.

## Outcome

Checklist creation, rename, item edits, absolute checked-state updates, deletion, and packing-source insertion work through /api/v1 in the production build.

## Requirements

- P1 (R1): Record the source's phase 0 decisions in ADRs before broad migration; the source remains the decision input and later epics cite these ADRs.
- P2 (R2): Extract checklist domain logic into actor-explicit services, typed access errors, and shared write effects; services read neither cookies nor navigation APIs. Page/action adapters preserve existing concealment during coexistence.
- P3 (R2): Provide client-safe endpoint definitions and a server wrapper with JSON authentication failures, enrollment restrictions, CSRF/origin checks, params/query/body validation, the error envelope, rate limits, and no-store responses. Register /api/v1 in proxy public paths; handlers perform authentication.
- P4 (R2): Support mutation replay using existing idempotency storage without a migration, scoped to actor and request identity; accept client-generated create IDs, partial PATCH, absolute checked values, and idempotent deletes.
- P5 (R2): Supply the API client and mutation hook with error/field mapping, auth navigation, router refresh, optimistic-state continuity, and keyed serialization for order-sensitive writes. Independent resources retain concurrency.
- P6 (R2): Migrate all nine checklist-producing or editing exports, including addChecklistFromPackingSource, their UI callers, and their tests. Delete only migrated exports; shared actions.ts remains for other domains.
- P7 (R2): Preserve mixed event/note/checklist insertion positions under the common trip lock, atomic create-with-item and packing-source copying, access checks, canonical mappers, activity, and live sync.
- P8 (R2): Expose GET /api/v1/meta and enforce that every v1 handler uses apiRoute, with an explicit metadata exemption only where justified.
- P9 (R7): Add API response waits, API request E2E scenarios, and feature-map registrations, while preserving checklist and packing-source UI coverage and adding slow-refresh and rapid-write regression coverage.

## Sprint scope

Sprint 1 is this epic: source phases 0–1. No calendar or capacity commitment is inferred. Later epics remain envelopes. Native UI, unified sessions, runtime response schemas/OpenAPI, and migration of non-checklist writes are excluded.

Entries 1–8 are buildable implementation slices; entry 9 is a bounded refactor sweep and entry 10 verifies the integrated result. Entry 1 is the tracer bullet: check one existing item through every layer, reload, and see the chosen absolute state. Entry 2 tackles the most uncertain server contract next: safe concurrent replay without a schema change. The sprint acceptance gate follows entry 10; an intermediate working slice is not the completed API rollout.

## Implementation boundaries

- Reuse existing auth session resolution without redirects in the API wrapper; do not call requireUser or requireAdmin directly from API handlers. Keep current page auth behavior.
- Use the source status matrix. Malformed JSON and non-object mutation envelopes are 400; schema field failures are 422. Never expose internal errors.
- Enforce X-Arrivo-Client: web plus JSON/multipart content type on cookie mutations; accept only same-origin Fetch Metadata, or matching Origin when metadata is absent, using existing request-origin proxy handling. Do not add CORS headers.
- Idempotency uses namespaced keys in existing idempotency_keys JSON results, a request fingerprint including method, normalized resource path and validated payload, an expiry window, and concurrency protection. Authorize before returning a replay; conflicting reuse is 409. Mutation and replay record must commit atomically. Preserve packing's existing raw-key result format. Entry 2 must resolve transaction ownership with the extracted service before expanding writes.
- Client-generated ID collisions must never return another actor's row or an unrelated resource. Preserve authorization before replay or UUID collision handling.
- Keep the existing transaction lock and all three timeline row types when inserting checklists. Do not invent checklist-item reordering: items have no independent ordering column. Full timeline reorder endpoints belong to the itinerary epic.
- Preserve template ownership, trip-list/target-trip matching, label exclusion, source order, and atomic empty/non-empty source insertion.
- Reuse dbChecklistToType; if exporting the private item mapper, update db-mappers.test.ts. Actor and other domain types belong in src/data/types.ts; no server-only import reaches contracts or clients.
- Prefer an extracted checklist-specific hook over adding transport branches to use-trip-detail-handlers. Preserve existing page/client component split, explicit Props interfaces, and use-client declarations.
- If callback changes require editing oversized JSX, split only the touched checklist UI responsibility alongside migration: checklist-item.tsx is 333 total lines, trip-itinerary-view.tsx 268, and page-client.tsx 385. Measure JSX before implementation; each resulting component stays within the review limit and has matching tests. Avoid unrelated UI refactors.
- Preserve existing labels, keyboard behavior, focus restoration, completion indicators, and announcements. Any touched control remains at least 44×44px; icon buttons retain title, and forms retain labels. Use existing CSS tokens, cn, and font fallbacks.

## Test intent

Write failing or expanded tests before each runtime edit. New modules and components always receive matching colocated tests; enumerate any additional files during the build's own planning before touching production.

- New service tests: src/lib/services/checklists.test.ts, trip-access.test.ts, and trip-write-effects.test.ts. Cover role levels, missing/mismatched resources, invalid input, transactions and locking, mixed insertion positions, atomic operations, mapper results, and effects after success only.
- New transport tests: src/lib/api/endpoint.test.ts, route.test.ts, auth.test.ts, errors.test.ts, csrf.test.ts, idempotency.test.ts, client.test.ts, use-api-mutation.test.tsx, handler-coverage.test.ts, and src/lib/api/contract/checklists.test.ts. Test the source status matrix, enrollment, malformed payloads, proxy origins and ports, rate-limit retry headers, no-store, network/server failures, retained field errors, same-resource ordering, unrelated-resource concurrency, queue failure recovery, and delayed refreshed data.
- Existing shared integration tests: src/proxy.test.ts proves /api/v1 gets JSON handler auth rather than redirects while sibling paths remain protected; src/lib/rate-limit.test.ts covers the new api bucket; src/lib/request-origin.test.ts changes alongside request-origin.ts if proxy-origin reuse needs edits; src/lib/trip-activity.test.ts and trip-events.test.ts change only if those shared modules need modification.
- Each new route has route.test.ts beside it: /api/v1/checklist-items/[itemId], /trips/[tripId]/checklists, /checklists/[checklistId], /checklists/[checklistId]/items, and /meta. A create may atomically include its first item or a packing source; exact body schemas are defined once in the contract. No item-reorder route is planned.
- Existing adapters: src/app/(app)/trips/[tripId]/actions.test.ts and use-trip-detail-handlers.test.tsx; new use-checklist-handlers.test.tsx if extracted; new use-packing-handlers.test.tsx for direct source-insertion behavior; src/app/(app)/trips/packing-actions.test.ts for idempotency compatibility.
- Existing components: src/components/arrivo/checklist-item.test.tsx and checklist-item-row.test.tsx; callback-chain tests in src/app/(app)/trips/[tripId]/trip-itinerary-view.test.tsx, trip-detail-tab-body.test.tsx, and page-client.test.tsx when those callers change. Any extracted checklist presentation component gets its own matching test.
- If intended checked state is passed through existing props, also update src/components/arrivo/day-card.test.tsx, day-card-body.test.tsx, and day-card-dnd.test.tsx alongside their source files; cover both true and false values reaching ChecklistItem. Alternatively keep API mutation ownership near ChecklistItem to avoid changing that callback chain.
- New E2E helper: tests/e2e/api-response.ts and api-response.test.ts; arm method/path matching before the gesture and await completion before reload. Keep auth and other unmigrated waits unchanged.
- Entry 1 creates that helper and its tests before its first persistence scenario. Every entry classifies its new runtime files and updates feature-map tests immediately; entry 4 audits and extends this baseline rather than enabling earlier tests retroactively.
- Existing E2E: tests/e2e/features/day-planning.feature with steps/day-planning.steps.ts, and features/packing-lists.feature with steps/packing-lists.steps.ts. Extend checklist lifecycle, intended-state rapid writes, insertion among event/note rows, delayed response/refresh continuity, persisted reload, and packing-source insertion.
- New E2E: tests/e2e/features/api.feature tagged @feat:api with tests/e2e/steps/api.steps.ts. Cover 401 after sign-out/revocation, viewer 403, stranger 404, 422 fields, malformed JSON 400, cross-origin rejection, sequential and concurrent idempotent replay, conflicting-key 409, authorization loss before replay, client-generated IDs, and idempotent delete.
- Use Playwright request and scenario-owned mothers/materialization; extend tests/e2e/e2e-seed-data.ts and scenario-fixture.ts only as required, with corresponding existing helper tests. Never add feature-specific shared global seeds.
- Map checklist services/routes/contracts to day-planning, packing-lists, and api as reached. Shared route/client/mutation helpers belong in SHARED_GLOBS. Update tests/e2e/feature-map.mjs and scripts/feature-map.test.mjs; any new shared module must be classified.
- Each story runs its matching Vitest files and practical affected E2E before the project validator. The build-validator skill owns the final gate once code is complete; coverage and affected E2E run separately and sequentially after lint/types/build. Never auto-run the full E2E suite.

## Done when

1. Checklist creation, rename, item edits, absolute checked-state updates, deletion, and packing-source insertion work through /api/v1 in the production build.
2. Authorization, CSRF, validation, error envelopes, rate limits, replay behavior, client-generated IDs, no-store responses, and handler coverage are verified.
3. Rapid writes persist in intended order and optimistic state stays stable until refreshed server data lands.
4. Shared day positioning, locks, activity, live sync, page reads, and unrelated web flows retain existing behavior.
5. Targeted tests and the project validation gate pass with feature-map coverage; checklist mutation actions and their web callers are retired.

## Boundaries

Record phase 0 decisions and ship trip checklist operations through authenticated API contracts, services, and web clients. Own shared transport, auth and CSRF, idempotency, error mapping, client refresh and ordering, metadata, and API test tooling. R7 ownership covers tests and feature-map registration for this epic's own changes; the pilot owns shared API test infrastructure and cleanup owns final enforcement. No native phone UI.

## References

- parent — `_bmad-output/initiative-mobile-api/initiative-mobile-api.md`, Requirements R1, R2, R7.
- source — `docs/plans/mobile-api.md`, Architecture, Endpoint inventory, Phases, and Testing.
- constraint — `AGENTS.md`, tests first, colocated tests, scenario-owned fixtures, affected E2E, and validation.
- shared contract — `docs/plans/mobile-api.md`, Architecture; pilot entry 1.1 records the shared ADRs before later migration work.

## Notes

- Branch workflow: Base branch: feature/api-v1. Build each story on its own branch created from the latest feature/api-v1; open its PR with feature/api-v1 as the base/target. Do not build or commit stories directly on feature/api-v1, and do not target main. After opening the PR, switch back to feature/api-v1; before creating the next story branch, pull the latest feature/api-v1.
- Story inheritance: Every new story entry and story file in this epic must explicitly carry this branch workflow; retain it when pulling, refining, or handing off a story.

- Decision: 2026-11-07 — User authorized epic slicing and planning the checklist-pilot sprint.
- Source conflict: Phase 1 lists eight checklist actions, but code also exports addChecklistFromPackingSource. Pilot includes that ninth export to satisfy the source exit condition; this is coverage of existing scope.
- Open question: Entry 2 owns proving atomic replay storage and authorized concurrent reuse with the existing schema; keep phase 1 free of migrations. This is its implementation objective, not an unanswered prerequisite.
- Open question: Entry 3 owns proving optimism remains until refreshed data arrives, including failures and a newer local edit while an earlier refresh is pending. This is its implementation objective, not an unanswered prerequisite.
- Sequencing: Shared contracts, route helpers, callers, tests, and feature-map files overlap; entries run in one lane. No parallel implementation is claimed.
- Entry 1 adds only helpers needed for the usable checked-state path; entry 2 adds generalized replay, entry 3 completes concurrency/refresh behavior, and entry 4 adds metadata and expands wrapper enforcement. Avoid building unused transport abstractions in the tracer.
- Dependency rationale: 2 needs 1's service transaction and wrapper; 3 needs 2's finalized mutation/replay semantics and edits the same client/hook tests; 4 audits the helper/contract baseline changed in 3; 5 uses 4's enforcement and edits its route map; 6 shares checklist contracts/services and adapters with 5; 7 extends the same create contract and handlers from 6; 8 removes adapters still used until 7; 9 sweeps all completed implementations; 10 verifies the integrated sweep result.
- High-risk checks: 1 crosses the auth/transport/UI boundary, 2 protects transaction and replay authorization, 3 protects optimistic ordering, 5 protects mixed timeline positions, 7 protects source ownership and atomic copying, and 10 verifies integration. A builder other than the original author can run the named unit/route and request/UI suites; their expected observable results are in each entry's verify field.

- Decision: 2026-11-10 — Epic closed after the closure check against Done when 1–5 and P1–P9 (see `epic-checklist-api-pilot-retrospective.md`, verdict accepted-with-open-items). Scope carried forward, not dropped: UI sends no client UUIDs on checklist or item create and the packing-source picker has no in-flight guard (to the itinerary epic, which edits `use-day-draft`); `idempotency_keys` retention sweep; the hardening items in retro action item A-3; typed `ConflictError` (note in `epic-itinerary-api.md`). All are recorded in `deferred-work.md` or the retrospective.
- Decision: 2026-11-10 — Entry 5 was built as two plans. The UI-migration half is recorded as entry 11 (`1.11`, after 1.5) so its plan is attached to a ticket; both halves are done and entry 11 keeps its place in build order between 1.5 and 1.6.

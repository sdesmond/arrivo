---
title: "Checklist lifecycle services and API"
type: feature
ticket: 5
created: "2026-11-08"
status: done
baseline_revision: "8209eccf809ce80a33e32feb1e2e0b611139b585"
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

**Problem:** Checklist lifecycle operations lack shared services and API endpoints.

**Approach:** Add authorized create, atomic create-with-first-item, title PATCH and idempotent deletion. User requested splitting original plan: this slice ships backend capability; UI migration follows separately. Story 1.5 remains incomplete until that follow-up ships.

## Boundaries & Constraints

**Always:** Branch `story/1-5-checklist-lifecycle-services`; PR base `feature/api-v1`. Recheck access and ancestry under trip lock before replay. Preserve mixed timeline shifts, canonical mapping, atomic writes/replay storage and post-commit effects only for changes.

**Never:** Change UI callers or existing actions; migrate item edits/packing sources; change schema; add unrelated refactors or changelog entries; run full E2E command automatically.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Create | POST `/api/v1/trips/:tripId/checklists`, `{dayId, position, id?, title?, firstItem?: {id?, content}}` | 200 mapped checklist; atomic optional item; all timeline types shifted once | Missing/wrong-trip day 404; invalid envelope 400; schema failure 422 |
| UUID retry | Same ID/day and matching current creation fields | Existing mapped row; no shifts/effects | Different fields/day or conflicting item ID 409; inaccessible row concealed |
| Key replay | Same actor/key/path/payload | Original response; no writes/effects | Conflicting payload 409; lost access denied before replay |
| Rename | PATCH `/api/v1/checklists/:checklistId`, `{title?: string | null}` | Only supplied field changes; null clears; omitted field is no-op | Missing row 404; unknown/invalid fields 422 |
| Delete | DELETE same resource, JSON `{tripId}` | 204 empty/no-store; missing row succeeds after trip authorization | Existing ancestry mismatch/stranger 404; viewer 403 |

</frozen-after-approval>

## Code Map

- `src/lib/services/checklists.ts`: reuse checked-state transaction pattern, `withIdempotency`, `requireTripRole`, `afterTripWrite`, `dbChecklistToType`.
- `src/app/(app)/trips/[tripId]/actions.ts`: read-only reference for create/title/delete and mixed-table shift helpers; preserve exports until UI migration.
- `src/lib/api/contract/checklists.ts`: reuse existing title/content/position schemas and domain types.
- `src/lib/api/{endpoint,route}.ts`: JSON-only today; add explicit contract-declared 204 with serializable replay result. Client 204 support belongs to deferred UI slice.
- Existing `tests/e2e/steps/api.steps.ts` supplies scenario-owned fixtures and authenticated requests; preserve bootstrap setup.

## Tasks & Acceptance

**Execution:** Tests first. Every modified source below receives matching colocated test edits.

- [x] `src/lib/api/contract/checklists.test.ts` then `checklists.ts`: lifecycle schemas, UUIDs, caps, positions, omitted/null title, unknown fields.
- [x] `src/lib/api/endpoint.test.ts`, `src/lib/api/route.test.ts` then matching sources: declared 204, empty response/no-store, retained JSON/errors and keyed replay behavior.
- [x] `src/lib/services/checklists.test.ts` then matching source: roles/ancestry, lock and access rechecks, mixed event/note/checklist shifts, atomic first-item rollback, UUID reuse/collision/concurrency, keyed replay/conflicts, no-op effects and partial title semantics.
- [x] `src/app/api/v1/trips/[tripId]/checklists/route.test.ts` and matching route: wrapped POST forwarding actor/body/replay.
- [x] `src/app/api/v1/checklists/[checklistId]/route.test.ts` and matching route: wrapped PATCH/DELETE forwarding and idempotency.
- [x] `tests/e2e/features/api.feature`, `tests/e2e/steps/api.steps.ts`: fresh-fixture create/first-item, concurrent UUID retry/collision, title clear/no-op, repeat delete, authorization loss before replay; verify UI reload reflects API changes and mixed ordering.
- [x] `tests/e2e/feature-map.mjs`, `scripts/feature-map.test.mjs`: classify new routes under api/day-planning/trip-live-refresh and packing-lists where reached; keep shared helpers classified.

**Acceptance Criteria:**

- Given mixed events, notes and checklists, when API creates checklist with first item and retries, then reload shows intended order and exactly one new checklist/item.
- Given an editor, when API renames then deletes checklist twice, then both deletes return 204 and reload shows deletion.
- Given revoked access, when keyed request is retried, then stored response remains inaccessible.

## Implementation Notes

Parent matrix audit: all five rows covered by passing contract/service/wrapper/API E2E tests; targeted API 35/35 plus final UI ordering/rollback 3/3. Review adds coverage for cross-trip concurrency and lock-time authorization.

Plan-reviewer: scope, architecture, component, accessibility and test coverage PASS; no blocking findings. Backend-only scope preserves existing UI callers; named colocated and API E2E tests cover every planned source change.

## Plan Change Log

## Review Triage Log
| Finding | Verdict | Evidence and route |
| --- | --- | --- |
| Blind 1: canonical item order | medium | Confirmed: mappedChecklist omits orderBy while trip queries order by checklistItems.createdAt; PATCH can return a different item order. Patch query plus regression. |
| Blind 2: mocked first-item rollback proof | low | Mock alone proves effects suppression; database E2E already fails replay persistence after both inserts and proves all rows/shifts roll back. Reject extra database fault injection as redundant complexity for same transaction boundary. |
| Blind 3: cross-trip UUID concurrency coverage | medium | Existing concurrent cases share one trip lock and do not detect removal of global UUID locks. Patch distinct-trip checklist and first-item collision scenarios with loser-state assertions. |
| Blind 4: locked title/delete authorization coverage | medium | Existing initial-denial and creation-only race tests do not detect removal of title/delete transaction authorization. Patch mutation and cached-replay race tests. |
| Blind 5: lifecycle title replay/conflict coverage | medium | Shared replay tests cover mechanics, but lifecycle tests do not prove original title responses survive later title changes or conflicting lifecycle payloads are denied. Patch service regressions. |
| Blind 6: inaccessible foreign UUID coverage | medium | Foreign collision tests currently grant visibility; no regression asserts concealment for foreign checklist/item UUIDs. Patch denial/no-write tests. |
| Blind 7: unaffected-day ordering coverage | medium | Existing mixed assertions exercise one populated day only and do not detect removal of day predicate. Patch fixture with another populated day and assert unaffected positions. |
| Blind 8: route contract identity assertions | low | Forwarding unit tests allow any contract; API E2E exercises actual contracts but direct identity checks cheaply protect verb registration. Patch exact assertions. |
| Edge 1: canonical item order | medium | Same verified missing orderBy as Blind 1; grouped into canonical-order patch. |
| Verification 1: title locked-authorization regression | medium | Pre-verified mutation demonstration: removing transaction authorization leaves existing title tests passing. Grouped with Blind 4 patch. |
| Intent alignment | false | Backend service/API slice matches approved Intent; existing UI/actions and full story completion are explicitly deferred. No mismatch to fix. |

Review patch resolution: canonical item order, locked-access races, concealed foreign UUIDs, keyed title replay/conflicts, cross-trip UUID races, unaffected-day checks and exact route contracts patched. Covering unit tests 68/68 and focused E2E 5/5 passed. No unresolved retained review findings.

## Design Notes

DELETE carries trip context to authorize missing rows without tombstones. UUID-only retries compare current title/initial item fields (and supplied item ID); later edits may yield 409. Keyed retries return original stored response. Protect concurrent UUID reuse before shifting or roll back conflicts so no partial shifts/items survive. Use `getNow()` for timestamps. Existing server-action UI remains operational until follow-up migration.

## Verification

Run named Vitest files plus `src/lib/api/handler-coverage.test.ts` and affected API E2E; expect pass. Run project `build-validator` after targeted checks: lint/types/build, coverage alone, affected E2E alone.

Implementation checks: named Vitest files, handler coverage and feature-map consistency passed (117 tests across 8 files). Targeted ESLint and TypeScript passed. API E2E passed (35 tests including setup); focused UI-order and rollback verification passed (3 tests including setup). Final `build-validator` completed successfully after review patches.



Final validation: ESLint, TypeScript, production build PASS; coverage 6844 tests PASS (lines 97.64%, functions 97.2%, branches 93.25%); affected E2E 70 tests PASS across api, day-planning, packing-lists and trip-live-refresh. Independent review complete; retained findings patched and verified. Backend slice built; UI migration remains deferred and story 1.5 is not yet complete.

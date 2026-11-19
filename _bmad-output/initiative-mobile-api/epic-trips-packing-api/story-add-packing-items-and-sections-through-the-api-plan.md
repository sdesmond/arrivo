---
title: "Add packing items and sections through the API"
type: feature
ticket: 3
created: 2026-11-19
status: built
baseline_revision: "0653803e592acebfa4e71d526fe2b5c327ae16cd"
route: full
route_source: auto
risk: medium
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 1
context: ["{project-root}/_bmad-output/initiative-mobile-api/AGENTS.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Packing item and section creation and section removal still use server actions, blocking API clients.

**Approach:** Add client-ID-safe packing creation with scoped placement and explicit section removal modes; migrate the existing web callers without changing their interaction.

## Boundaries & Constraints

**Always:** Branch `story/5-3-packing-create-api`; PR base `feature/api-v1`, verify before opening and switch back afterward. Test first. Preserve trip authorization, lock ordering, activity and live events, API idempotency and failure behavior. No schema or environment changes.

**Never:** Migrate packing lists, template operations, page reads or template editor. Do not commit to integration branch or target main.

## I/O & Edge-Case Matrix

| Scenario | Input / state | Expected behavior |
| --- | --- | --- |
| Create | UUID, name, list, optional label and before/after anchor | Return created item; append or insert in scoped list, shifting positions; section labels have no parent label |
| Replay | Same client UUID and compatible creation in same trip/list, even if its original anchor or section later moves or disappears | Return existing row without duplicate, shifts, activity or events; conflicting UUID yields 409 without leaking another trip |
| Invalid placement | Both anchors, missing/foreign anchor, invalid list or label, label in another list | Reject without writes; label must be a section in same list |
| Remove section | Explicit `delete-items` or `move-items-to-ungrouped` | Delete section and respectively its children or their association; preserve other lists |
| Access and retry | Viewer, nonmember, missing section, request-key replay | 403/404 as appropriate; authorized missing deletion returns 204; replay rechecks access |
| Client error | API rejects create or remove | Preserve form/dialog state, show error and refresh as existing mutation pattern requires; unchanged create retries reuse their UUID, while changed creation details receive a new UUID |

</frozen-after-approval>

## Code Map

- `src/app/(app)/trips/packing-actions.ts` contains scoped insertion, validation and section removal; retain list/template actions. Remove migrated exports and `src/app/(app)/trips/actions.ts` forward.
- `src/lib/services/packing.ts` contains existing item and reorder services, lock and `runTripWrite` patterns; `src/lib/services/checklists.ts` illustrates UUID locking, collision and replay. Use existing mappers and list scope.
- `src/lib/api/contract/packing.ts` and `src/app/api/v1/trips/[tripId]/packing/order/route.ts` provide contract and idempotent route patterns. Use POST `/trips/:tripId/packing-items` and DELETE `/packing-items/:itemId/section` with trip ID and explicit mode in body.
- `src/app/(app)/trips/[tripId]/use-packing-handlers.ts` owns both callers. Generate one UUID per add gesture; preserve rejection semantics and existing optimistic behavior. `packing-list-sortable.tsx` supplies inline anchors and active list scope.
- `tests/e2e/feature-map.mjs` needs the new trip packing-items route mapped to affected packing and API features; existing packing-items route mappings cover section removal.

## Tasks & Acceptance

**Execution:**

- [x] Tests first: update `src/lib/api/contract/packing.test.ts`, `src/lib/services/packing.test.ts`, add route tests beside both routes, and update `src/app/(app)/trips/[tripId]/use-packing-handlers.test.tsx`, `use-trip-detail-handlers.test.tsx`, `src/app/(app)/trips/packing-actions.test.ts` and `actions.test.ts`. Cover matrix, same-list and cross-list placement, replay/collisions, access, errors and both modes.
- [x] Update `tests/e2e/features/packing-tab.feature` and `tests/e2e/steps/packing-tab.steps.ts` for inline insert order and both section modes after reload, awaiting API responses; update `tests/e2e/features/api.feature` and `tests/e2e/steps/api.steps.ts` for UUID replay, scoped label validation and authorization with scenario-owned fixtures.
- [x] Implement strict contracts and colocated POST/DELETE routes with idempotency, then service operations with UUID and trip locks, scope validation, mapped responses, replay and transactional side effects.
- [x] Switch hook callers to API mutations; remove only migrated actions and forwards. Preserve other users of shared packing helpers.
- [x] Update `docs/api-v1.md` and `tests/e2e/feature-map.mjs` for paths, inputs, responses, errors and affected features.

**Acceptance Criteria:**

- Given an editor inserts an item or section inline, when the trip reloads, then its position and list persist.
- Given a repeated client UUID, when creation is retried, then only one item exists and positions are unchanged by the retry.
- Given a section with items, when either removal mode is selected and the trip reloads, then its items are deleted or ungrouped as selected.
- Given a label or anchor from another list, when creation is requested, then it fails without changing either list.

## Implementation Notes

## Plan Change Log

- User clarified replay semantics: successful UUID replays return the existing item despite later placement changes; unchanged web retries reuse their UUID, and changed details receive a new UUID. Preserve existing scoped validation for first creates and all passing coverage.

## Review Triage Log

- medium, bad_plan — UUID replay returns before validating a supplied foreign or missing anchor or section; the invalid-placement matrix and mutable-placement replay note do not specify behavior when an original anchor or section has since disappeared.
- medium, bad_plan — A lost create response followed by a new web submission generates a new UUID and can create a duplicate; the plan does not specify retention of a pending creation ID across retries.
- medium, patch — Successful scoped insertion lacked an assertion for the other list; API replay scenario now verifies the default list remains unchanged.
- low, patch — Create documentation omitted normalized name length; documented trimming and the 1–30 character limit.
- maybe-false, defer — A delayed retry after section deletion can recreate a deleted UUID; deciding whether this requires tombstones depends on the intended retry window and existing deletion conventions.
- maybe-false, defer — Deleted section children may likewise be recreated by delayed requests; same unresolved retry-window question applies.
- false — Different current label on a UUID replay is intentional: design notes treat mutable placement separately from creation identity.
- false — Anchor validation gap is the same observable issue as the first review row, assessed separately by the edge-case lens.
- low, rejected — Conflicting and foreign UUID collisions lack HTTP-specific scenarios; service tests cover both and access is exercised at HTTP level.
- low, rejected — Missing/foreign anchors lack HTTP-specific scenarios; service tests cover missing and foreign anchors and E2E checks scoped labels.
- low, rejected — Non-section and foreign section removal lack HTTP-specific scenarios; service tests cover both and route forwarding is tested.
- false — Rejected creation form state is already exercised by the existing packing-list-view component test; handler test verifies error and refresh.

- false, clarified — UUID replay deliberately ignores subsequently invalid placement references; the user chose returning the existing item.
- fixed — Unchanged failed submissions retain the UUID; changed submissions and successes clear it. Targeted tests cover retry, changes, and overlapping attempts.
- low, rejected — A definitive UUID conflict retains the ID until details change; a random UUID collision is exceptional and changing details permits a fresh submission.
- low, rejected — Retry identity is scoped to the mounted form; navigation discards the form and its retry state. Persisting it across navigation would add a new persistence surface.
- carried — HTTP-specific collision, anchor and section cases remain covered by service tests and route forwarding; failed form preservation remains covered by component tests.
- false — Verification-gap review found no remaining gaps in the updated diff.

## Design Notes

`listId: null` denotes the default list. Lock client IDs before trip locks; follow existing create-service collision and replay conventions, including authorization before returning an existing row. Treat mutable order separately from create identity.

## Verification

- Targeted retry and packing tests passed; full validator passed: lint, TypeScript, build, 8,181 unit tests with 98.09% lines, 97.82% functions and 94.05% branches, and 829 affected E2E scenarios.

- Run targeted Vitest files and affected packing/API E2E first.
- Run `build-validator` after implementation and targeted tests pass; its coverage and affected E2E gates run separately.

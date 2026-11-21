---
title: "Pull templates onto a trip through the API"
type: feature
ticket: 5
created: 2026-11-19
status: done
baseline_revision: "b17424d31f098a46376e665bae5601db1e06e446"
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

**Problem:** Pulling packing templates onto a trip relies on a server action unavailable to API clients.

**Approach:** Move the operation to an idempotent API endpoint and migrate its web caller, preserving ownership, list selection, deduplication, and section mapping.

## Boundaries & Constraints

**Always:** Story branch `story/5-5-pull-templates-api`, PR base `feature/api-v1`; verify base before a PR and switch back afterward. Test first. Preserve editor access, transaction locking, trip activity and live events, and idempotency authorization. No schema or environment changes.

**Never:** Migrate `saveTripListAsTemplate`, template management, or server-side page reads; commit directly to the integration branch or target main.

## I/O & Edge-Case Matrix

| Scenario | Input / state | Expected behavior |
| --- | --- | --- |
| Pull | Owned templates, optional target list | Append items to chosen list; trim and case-insensitively deduplicate names; return `{added, skipped}`; map template sections to destination sections |
| Foreign or missing template | IDs not owned by actor | Ignore them without exposing contents or counting them as skipped |
| Duplicates | Repeated IDs, names, or section names | Process IDs once; count duplicate items as skipped; remap children to matching existing or newly created section |
| Retry | Same idempotency key and body | Return original result without duplicate writes or effects, after rechecking access; a fresh repeated request adds zero and reports duplicates |
| Invalid list / access | List belongs to another trip; viewer or stranger | Reject without writes; preserve API 403/404 access rules |
| Empty IDs | No template IDs | Return zero counts without writes |

</frozen-after-approval>

## Code Map

- `src/app/(app)/trips/packing-actions.ts` — existing pull logic, ownership filtering and list-scoped deduplication; retain save action and helpers it still needs. Fix mapping when an earlier selected template creates a same-named section.
- `src/lib/services/packing.ts` and `src/lib/services/trip-write.ts` — use `requireTripRole`, `runTripWrite`, `lockTrip`, transactional access recheck and `markChanged` for real writes.
- `src/lib/api/contract/packing.ts`, `src/app/api/v1/trips/[tripId]/packing/order/route.ts` — model contract and `apiRoute` with idempotency. Add `POST /api/v1/trips/:tripId/packing/pull-templates`, strict body `{templateIds, listId?}`, result `PullTemplatesResult` from `src/data/types.ts`.
- `src/app/(app)/trips/[tripId]/use-packing-handlers.ts` — migrate pull to `useApiMutation`, retain result, refresh and error behavior. Remove pull forwarding export only from `src/app/(app)/trips/actions.ts`.
- `tests/e2e/feature-map.mjs`, `docs/api-v1.md` — register affected feature paths and document endpoint, errors, ownership and replay.

## Tasks & Acceptance

**Execution:**

- [x] Tests first: extend `src/lib/services/packing.test.ts` for list scope, ownership, empty input, name and section dedupe, remapping across templates, access, invalid list and side effects. Extend `src/lib/api/contract/packing.test.ts` for strict request validation. Add `src/app/api/v1/trips/[tripId]/packing/pull-templates/route.test.ts` for delegation, authorization and keyed replay. Update `src/app/(app)/trips/[tripId]/use-packing-handlers.test.tsx`, `use-trip-detail-handlers.test.tsx`, `packing-actions.test.ts`, and `actions.test.ts` for migrated calls, errors and retained save action.
- [x] Extend `tests/e2e/features/pull-templates.feature` and `tests/e2e/steps/pull-templates.steps.ts` with API response waits and selected-list persistence after reload. Extend `tests/e2e/features/api.feature` and `tests/e2e/steps/api.steps.ts` for foreign templates, keyed replay and access using scenario-owned fixtures. Preserve and run `save-trip-as-template.feature` and its steps.
- [x] Implement service, contract, route and hook; remove only migrated action and forwarding export. Update `docs/api-v1.md` and feature mappings for API, pull templates and save-template regression coverage.

**Acceptance Criteria:**

- Given an editor selects owned templates and a list, when they pull and reload, then items and section associations appear in that list.
- Given a pull that includes another user's template, when it completes, then no foreign items appear.
- Given a keyed request replay or a fresh repeat, when it completes, then no duplicate items are added.
- Given a trip list, when it is saved as a template, then its existing server-action flow still works.

## Implementation Notes

- Verify list isolation and section association through real API or web E2E fixtures, including a selected non-default list and a matching name in another list. Verify existing destination section remapping and duplicate-only no-op effects in service tests. Preserve section mapping when a child precedes its section in template order; retain insertion order and counts.

## Plan Change Log

- Review found that mocked list filters and the default-list reload scenario did not prove list isolation or section association. Added concrete database-backed E2E requirements and service edge cases; avoid reproducing those gaps. KEEP the ownership, access replay, cross-template remapping, save-template regression and passing targeted coverage.

## Review Triage Log

- medium / bad_plan: child preceding section can be inserted without its association; template rows are ordered by position and mapping is populated only on section insertion.
- low / rejected: an ordinary item sharing a section name prevents section mapping; existing global name deduplication explicitly skips duplicate names and no matching section exists.
- low / rejected: unbounded template IDs can exceed database limits, but requires an unusually large request and a limit adds a new public constraint.
- low / rejected: spread into Math.max may exceed argument limits for an unusually large list; fix adds complexity for an exceptional size.
- medium / bad_plan: web reload scenario verifies Main and an item, not selected list and section associations.
- medium / bad_plan: existing destination section mapping lacks coverage.
- medium / bad_plan: mocked query does not verify list-scoped deduplication; database-backed E2E must check another list.
- low / rejected: different-body idempotency conflict is shared API behavior covered outside this endpoint.
- medium / bad_plan: duplicate-only pull lacks no-effect assertion.
- low / rejected: edge lens repeated section collision claim; same deduplication behavior applies.
- false: edge lens cited a reduce implementation and its RangeError claim is unsupported by the quoted code; actual spread was separately assessed above.
- false: edge lens cited a nonexistent MAX_TEMPLATE_IDS guard; unbounded input was separately assessed above.
- medium / bad_plan: verification-gap lens independently confirmed list-isolation coverage gap.
- intent-alignment: public API and web acceptance lacked selected-list and section association evidence; addressed with database-backed scenarios.

## Verification

- Lint, TypeScript, production build, coverage and affected E2E passed. Coverage: 98.05% lines, 97.7% functions, 94% branches; 854 affected E2E tests passed. TypeScript passed after retrying a build-generated types race.
- User approved fixing review findings in place instead of resetting the implementation.

- Run targeted Vitest files and affected pull-templates, save-trip-as-template and API E2E before broad validation.
- Run `build-validator` after implementation and targeted checks pass.

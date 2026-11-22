---
title: "Open, rename and delete owned templates"
type: feature
ticket: 3
created: 2026-11-21
status: built
baseline_revision: "148d568931ac07084d134cf3d286668625ebd30e"
route: full
route_source: auto
risk: medium
review: 'thorough'
review_source: 'auto'
lenses_ran: ['blind-hunter', 'edge-case-hunter', 'verification-gap', 'intent-alignment']
review_loop_iteration: 1
context: ["{project-root}/_bmad-output/initiative-mobile-api/AGENTS.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Template detail, rename and deletion lack API operations, while web mutations still use server actions.

**Approach:** Expose owner-scoped detail, rename and delete endpoints and migrate web mutation callers, preserving cascade and replay behavior.

## Boundaries & Constraints

**Always:** Story branch `story/6-3-template-lifecycle` starts from latest `feature/api-v1`; PR base is `feature/api-v1`, verified before opening, and switch back after opening. Server-rendered reads remain on shared queries. Preserve existing validation, cascading deletion, refresh behavior and ownership. Test first.

**Never:** Migrate template items or change schema. Commit to the integration branch or target main.

## I/O & Edge-Case Matrix

| Scenario | Input / state | Expected behavior |
| --- | --- | --- |
| Detail | Owned template with items | Return mapped template and items in existing order |
| Rename | Owned template and valid name | Persist name and return updated template |
| Delete | Owned template | Delete template and cascade dependent items, return 204 |
| Missing or foreign | Missing ID or another owner's template | Detail and rename return 404; deletion remains idempotent without exposing ownership |
| Invalid input | Invalid UUID, blank or oversized name | Existing API validation error, no write |
| Replay after deletion | Replay earlier keyed create, save or rename after deletion | No deleted template is resurrected or returned as live |
| Repeated delete | Same request or missing template | 204, no side effects beyond first deletion |

</frozen-after-approval>

## Code Map

- `src/lib/services/packing-templates.ts` holds create/save, owner checks, mapping, locks and idempotency. Inspect both create and save replay authorization when adding lifecycle operations.
- `src/lib/api/contract/packing-templates.ts` defines shared client-safe schemas. Add detail, PATCH and DELETE contracts.
- `src/app/api/v1/packing-templates/[templateId]/route.ts` is the new route; follow existing `apiRoute` patterns and mutation replay conventions.
- `src/app/(app)/packing/actions.ts` implements owner-filtered rename and delete. Preserve its behavior while migrating its callers.
- `src/app/(app)/packing/page-client.tsx` and `src/app/(app)/packing/[templateId]/page-client.tsx` own library and editor mutations. Reuse `useApiMutation`; retain dialog and promise behavior. `page.tsx` retains `getTemplateWithItems`.
- `tests/e2e/features/templates.feature` and `tests/e2e/steps/templates.steps.ts` already cover rename/delete reload. `tests/e2e/features/api.feature` and `tests/e2e/steps/api.steps.ts` cover API behavior and scenario-owned fixtures.

## Tasks & Acceptance

**Execution:**

- [x] First update `src/lib/api/contract/packing-templates.test.ts`, `src/lib/services/packing-templates.test.ts` and new `src/app/api/v1/packing-templates/[templateId]/route.test.ts` for detail, validation, ownership, cascades, idempotent delete and create/save/rename replay after deletion.
- [x] Update `src/app/(app)/packing/page-client.test.tsx` and `src/app/(app)/packing/[templateId]/page-client.test.tsx` for API calls, refresh, failure and editor rename.
- [x] Extend `tests/e2e/features/templates.feature` and `tests/e2e/steps/templates.steps.ts` for opening and editor rename, persistence and API waits. Extend `tests/e2e/features/api.feature` and `tests/e2e/steps/api.steps.ts` for foreign access, deletion and replay using scenario-owned fixtures.
- [x] Implement contracts, service and route. Preserve transaction locking and replay authorization, and prevent stale create/save responses after deletion.
- [x] Migrate both web callers and remove obsolete rename/delete action exports and tests when unused.
- [x] Update `docs/api-v1.md` and verify `tests/e2e/feature-map.mjs` maps all touched routes and services to relevant features.

**Acceptance Criteria:**

- Given an owned template, when a user opens and renames it, then its items and new name survive reload.
- Given an owned template with items, when deleted, then the template and dependent items are removed and stay removed on replay.
- Given a foreign template, when another user requests or mutates it, then ownership is protected.

## Implementation Notes

## Plan Change Log

- User directed an in-place fix instead of reverting the implementation after review.

- Review found that separate ownership and item queries can disclose a replacement owner's items. Implement detail retrieval using a consistent ownership-protected snapshot, with a deterministic concurrency regression test. KEEP existing lifecycle contracts, web behavior, validation, cascade handling, replay tests, HTTP scenarios, and API feature mappings. Avoid serving items from a replacement template generation.


## Review Triage Log

- maybe-false / defer: Nullable creation timestamps fail replay validation; schema allows null, but no existing null row was demonstrated. Check deployed data to establish impact.
- low / reject: Same-millisecond recreation may match timestamp precision; unusual collision and stronger generation tracking adds complexity.
- high / bad_plan: New detail endpoint exposes the shared query race: deletion and cross-owner recreation between separate owner and item reads can disclose replacement items.
- medium / defer: Editor title commit does not catch rename rejection; existing server action already rejected on failure.
- medium / patch: Feature mapping does not select API lifecycle scenarios for template route and service changes.
- medium / patch: Library failure test does not simulate or assert error reporting.
- medium / patch: Owned detail response and item ordering lack HTTP verification.
- medium / patch: Invalid lifecycle inputs lack HTTP no-write verification.
- medium / patch: Verification-gap lens independently identified missing owned-detail HTTP coverage.
- maybe-false / defer: Edge lens independently flagged nullable creation timestamps; data evidence is needed.
- high / bad_plan: Edge lens independently identified the shared-query ownership race exposed by this endpoint.

## Verification

- Lint, TypeScript, build, and coverage passed (8,305 tests; lines 98.05%, functions 97.58%, branches 94.09%). A prior coverage run had one trip-notes focus failure; its isolated rerun and coverage rerun passed.
- Affected E2E: 1,314 passed. Targeted lifecycle and query tests passed.
- Review: ownership race fixed in place; legacy null timestamp impact and pre-existing editor rejection handling deferred.

- Run targeted Vitest files and affected Playwright scenarios before broad validation.
- Run `build-validator` after implementation and targeted tests pass.

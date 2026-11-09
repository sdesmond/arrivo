---
title: "Retire checklist actions and complete API regression coverage"
type: feature
ticket: 8
created: "2026-11-09"
status: built
baseline_revision: "54357300dbea8bc01df7b14307ccba42cffbd315"
route: full
route_source: auto
risk: medium
review: "thorough"
review_source: "auto"
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context: [_bmad-output/initiative-mobile-api/AGENTS.md]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Four dead checklist-item server actions (and their helpers/mocks) remain in the shared `actions.ts`, and the API E2E matrix lacks denial, bad-input, CSRF and key-conflict cases for the lifecycle, item create/delete and packing-source endpoints.

**Approach:** Delete only the migrated checklist exports, helpers, imports and test references; keep every other action. Close the source status/replay/access matrix gaps in `api.feature`, and lock feature-map ownership.

## Boundaries & Constraints

**Always:** Branch `story/1-8-retire-checklist-actions`; PR base `feature/api-v1`. Tests first. Scenario-owned fixtures and existing mothers; arm exact API response wait before gesture, await before reload. Keep `waitForServerActionResponse` for non-checklist steps. Keep contract/service/route symbols that share action names (`createChecklistItem` etc. in `src/lib/api/**`, `src/lib/services/**`).

**Never:** Migrations, new API behavior, non-checklist action edits, changelog edits, full E2E run, push without authorization. Do not edit `use-checklist-handlers.ts` runtime behavior. Return to `feature/api-v1` after PR; pull before next story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Retired | Search `src` for `createChecklistItem`/`updateChecklistItem`/`toggleChecklistItem`/`deleteChecklistItem` imports from `actions` | No caller or export remains | n/a |
| Denied | Viewer/stranger/anonymous on lifecycle create, rename, delete | 403 / 404 / 401; rows and positions unchanged | Envelope code forbidden/not_found/unauthenticated |
| Bad input | Malformed, non-object, invalid-body on lifecycle, item create/delete and source create | 400 bad_request / 422 validation_failed; no write | No partial rows |
| CSRF | Missing header, wrong type, cross-origin on the same endpoints | 403 forbidden; no write | No write |
| Key conflict | Same `Idempotency-Key`, different body, on lifecycle create/rename and source create | 409 conflict; original row intact | No second row |

</frozen-after-approval>

## Code Map

- `src/app/(app)/trips/[tripId]/actions.ts` -- delete exports L752-796, helpers `getChecklistDayId` L173 and `getChecklistItemIds` L182, imports `checklistItems` L13 and `checklistItemContentSchema` L25. Keep `itineraryChecklists`, `sql` (still used by shift helper and reorder actions). File stays in `SHARED_GLOBS` (`feature-map.mjs:779`).
- `src/app/(app)/trips/[tripId]/actions.test.ts` -- imports L169/172/188/189; L572-576 oversize test (drop checklist lines, rename); L1812-1858 `it.each` cases (four); L1900-1917 legacy toggle test.
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx` -- imports L6/9/11; `vi.mock("./actions")` L53-69 entries; L727-729 `not.toHaveBeenCalled`.
- `tests/e2e/features/api.feature` + `tests/e2e/steps/api.steps.ts` (1369 lines; helpers `sendKeyed` L222, `lifecycleInput` L502, `sendLifecycleCreate` L526, `itemApi` L796, `postSourceCreate` L1169, `timelineSnapshot` L681) -- add the matrix scenarios; reuse these.
- `tests/e2e/feature-map.mjs`, `scripts/feature-map.test.mjs` -- ownership already covers API/day-planning/packing-lists/live-refresh (test L25-102); add guard only.
- Already done, no change: `waitForApiResponse` in day-planning/packing-lists steps; UI lifecycle, slow-refresh and rapid-write scenarios (`day-planning.feature` L147-214; `packing-lists.feature` L24-47); `handler-coverage.test.ts`.

## Tasks & Acceptance

**Execution:**

- [ ] `src/app/(app)/trips/[tripId]/actions.test.ts` -- remove retired imports, cases and tests; add a test asserting module exports contain no checklist-item mutation names -- proves retirement
- [ ] `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx` -- drop retired mock entries/imports/assertions -- mocks match real exports
- [ ] `src/app/(app)/trips/[tripId]/actions.ts` -- delete four exports, two helpers, two unused imports -- retirement
- [ ] `scripts/feature-map.test.mjs` -- assert `actions.ts` stays shared and checklist services/routes keep `api`, `day-planning`, `packing-lists` owners -- guards ownership
- [ ] `tests/e2e/features/api.feature`, `tests/e2e/steps/api.steps.ts` -- add Outlines: lifecycle denials (role x create/rename/delete); bad input and CSRF (endpoint x case) for lifecycle, item create/delete, source create; conflicting key 409 for lifecycle create/rename and source create. Each asserts unchanged rows/positions -- completes matrix
- [ ] Search `src` and `tests` for retired action imports; confirm none -- verify criterion

**Acceptance Criteria:**

- Given the change, when searching, then no checklist mutation action export, import or mock remains outside API contract/service/route code.
- Given the matrix cases, when run, then each returns its expected status/code and leaves rows and timeline positions unchanged.
- Given non-checklist actions, when `actions.test.ts` and affected E2E run, then they stay green.

## Implementation Notes

Implemented directly (no subagent authorized). Branch `story/1-8-retire-checklist-actions`; PR base `feature/api-v1`; nothing committed or pushed.

- `actions.ts`: removed four checklist-item exports, `getChecklistDayId`, `getChecklistItemIds`, `checklistItems` and `checklistItemContentSchema` imports.
- `actions.test.ts`: dropped retired imports/cases/legacy toggle test and stale `checklistItems` schema mock; added export guard (no export name matching /checklist/i).
- `use-trip-detail-handlers.test.tsx`: dropped retired mocks, imports and `not.toHaveBeenCalled` assertions (the `api` call assertions remain).
- `feature-map.test.mjs`: asserts `actions.ts` stays in `SHARED_GLOBS`; checklist service/route owner tests already existed.
- `api.feature` / `api.steps.ts`: added Outlines for lifecycle denials (3 roles x 3 ops), bad input + CSRF (6 endpoints x 6 cases), and Idempotency-Key conflict (lifecycle create/rename, source create).
- Verification: targeted vitest 4 files pass (173 + feature-map 21); `tsc --noEmit` clean; eslint 0 errors; `npm run test:e2e:affected` 143 passed. Search confirms retired names remain only in contract/service/route/handler code.
- Pending: step-04 review lenses (need subagent authorization), then `build-validator`.

## Plan Change Log

## Review Triage Log

| Finding (lens) | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| feature-map test claims full suite but only checks SHARED_GLOBS (verification-gap, edge-case, blind) | medium | patch (fixed) | FEATURE_MAP `app-activity` match wins over SHARED_GLOBS; test now asserts the real classifier result. |
| actions.ts mapped to app-activity only, not full suite (verification-gap) | low | defer | Pre-existing mapping; logged in deferred-work.md. |
| Oversize checklist content untested (blind) | false | rejected | `checklists.test.ts:105` covers the 300-char bound; API item PATCH scenario sends 301 chars. |
| Side-effect assertions (recordTripUpdated/publish) removed (blind) | false | rejected | `services/checklists.test.ts` asserts `afterTripWrite` on create/update/delete. |
| Unused drizzle imports in actions.ts (blind) | false | rejected | ESLint 0 errors; `sql`, `eq` still used. |
| Matrix omits item-update/toggle, item/source denials, positive replay (blind, intent-alignment) | false | rejected | Existing scenarios: item PATCH, "Denied item writes", "Denied source creation", keyed item/source replay. |
| Export-absence guard weak (blind) | low | rejected | Fix adds complexity; unlikely to bite. |
| No default branch in `validWriteRequest`; undefined `[checklist]` row (blind, edge-case) | low | rejected | Typo-only failure modes, still fail loudly. |
| Key-conflict step misses idempotency-record check (edge-case) | low | rejected | Fresh-UUID second body plus timeline/title/item-count equality already proves no second write. |
| Items-route owner not asserted for packing-lists (edge-case) | low | rejected | Items route owners (api/day-planning/live-refresh) asserted; plan task satisfied by existing tests. |
| Stale feature header, handlers test title (blind) | low | rejected | Cosmetic, pre-existing. |
| Intent-alignment divergences | n/a | none | Descriptive; diff matches reading A/B per plan. |

## Plan Review

All five checks PASS; zero blockers/warnings. Scope: story 1.8 only (stories 1.1-1.7 already retired five of the nine exports; four remain). No UI or component changes; `actions.ts` sits under excluded `src/app/**`, matching tests are updated first. E2E `.feature` and steps named.

## Verification

**Commands:**

- `npx vitest run "src/app/(app)/trips/[tripId]/actions.test.ts" "src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx" scripts/feature-map.test.mjs src/lib/api/handler-coverage.test.ts` -- expected: pass
- `npm run test:e2e:affected` -- expected: api, day-planning, packing-lists pass
- Then `build-validator` (lint/types/build; coverage alone; affected E2E alone) -- expected: PASS

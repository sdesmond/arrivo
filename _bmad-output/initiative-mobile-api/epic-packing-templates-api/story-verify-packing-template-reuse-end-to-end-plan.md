---
title: "Verify packing template reuse end to end"
type: feature
ticket: 7
created: 2026-11-23
status: built
baseline_revision: "75fac2e343885f2f8c53174319e6e85c11dd832e"
route: full
route_source: auto
risk: medium
review: "thorough"
review_source: "auto"
lenses_ran: ["blind-hunter", "edge-case-hunter", "verification-gap", "intent-alignment"]
review_loop_iteration: 0
context: ["{project-root}/_bmad-output/initiative-mobile-api/AGENTS.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Template save, edit, trip pull, checklist insertion and delete are each covered in isolation. Nothing proves one template flows through all of them against the production build, so a regression in how they compose goes unnoticed.

**Approach:** Add one `@feat:template-reuse` scenario that saves one of two trip lists as a template, edits it, reuses it through both existing integrations (trip pull and checklist insertion), deletes it, and reloads to check the copies. Fixtures are scenario-owned; existing steps are reused where they fit.

## Boundaries & Constraints

**Always:** Work on `story/6-7-verify-template-reuse-e2e`, based on latest `feature/api-v1`; PR base is `feature/api-v1`. Create every row through scenario fixtures (`scenario.materialize`/`ensureCurrentTrip`), never `global-setup.ts`. Register the feature in `tests/e2e/feature-map.mjs`. Await mutation responses before reloading (`waitForServerActionResponse` / `waitForApiResponse`). Test first.

**Never:** Change API contracts, validation or runtime behavior to make the scenario pass without a failing test that names the defect; add ordering tags, serial execution or shared seed rows; edit `CHANGELOG.md`; commit to the integration branch or target main.

## I/O & Edge-Case Matrix

| Scenario | Input / state | Expected behavior |
| --- | --- | --- |
| Save selected list | Trip with lists "Carry-on" (Passport, Toothbrush) and "Extra" (Sunscreen, Camera, Charger); Carry-on open | Dialog announces 2 items; template holds only Passport and Toothbrush, unchecked |
| Edit then reuse | Template renamed item plus an added label | Pull and checklist both reflect the edited, ordered contents |
| Checklist insertion | Template with a label | Checklist holds items in order, unchecked, label excluded |
| Delete template | Template deleted, page reloaded | Pulled trip list items and the checklist remain, same order, independent of the template |

</frozen-after-approval>

## Code Map

- `tests/e2e/features/save-trip-as-template.feature`, `pull-templates.feature`, `template-items.feature`, `templates.feature`, `packing-lists.feature` -- existing coverage of each stage; model the new scenario on them.
- `tests/e2e/steps/save-trip-as-template.steps.ts` -- reusable: "I open the save-as-template dialog", "the save dialog announces {int} items", "I confirm the save dialog with the name {string}", "the template {string} holds exactly ... and ..." (DB poll). Its two-list seeding step is feature-specific; add a new seed step instead.
- `tests/e2e/steps/template-items.steps.ts` -- reusable: "I open the template editor for {string}", "I edit the template item {string} to {string}", "I add the template label {string}", editor assertions.
- `tests/e2e/steps/pull-templates.steps.ts` -- pull steps hardcode fixed template names (`checkTemplate` + `E2E_TEMPLATE_PULL`); add a parameterized pull step in the new steps file rather than altering them.
- `tests/e2e/steps/packing-lists.steps.ts` -- reusable: "I open day 1 in the itinerary", "I click Add and select the packing list picker", "I select the template {string} from the picker", "a checklist titled {string} should appear in day 1", "after reload the {string} checklist holds ... unchecked in that order".
- `tests/e2e/steps/templates.steps.ts` -- reusable: "I delete the packing template {string}", "I should not see the packing template {string}".
- `tests/e2e/feature-map.mjs` -- add `entry("template-reuse", [...])` listing the save dialog, pull dialog, template editor/library, checklist picker, template services and API routes the scenario exercises; `scripts/feature-map.test.mjs` fails on a missing tag or dead path.
- `tests/e2e/e2e-db.ts`, `scenario-fixture.ts` -- `withE2EDb` for seeding and DB assertions; do not change.

## Tasks & Acceptance

**Execution:**

- [ ] `tests/e2e/features/template-reuse.feature` -- add `@feat:template-reuse` scenario covering save of one of two lists, edit, pull, checklist insertion, delete, reload checks -- the story's verification.
- [ ] `tests/e2e/steps/template-reuse.steps.ts` -- seed two-list trip; parameterized template pull; assertions that the trip list and checklist retain ordered items after template deletion and reload; reuse existing steps for everything else.
- [ ] `tests/e2e/feature-map.mjs` -- register the feature and its source globs.
- [ ] Run `npx vitest run scripts/feature-map.test.mjs`, then `npm run test:e2e:affected` -- both pass.

**Acceptance Criteria:**

- Given a trip with two packing lists, when the open list is saved as a template, then the template holds only that list's items, unchecked and in order.
- Given the saved template is edited, when it is pulled onto a trip list and inserted as a checklist, then both copies show the edited items in order, and the checklist excludes the label.
- Given both copies exist, when the template is deleted and the pages reload, then the trip list items and checklist remain unchanged and in the same order.
- Given the feature file, when the feature-map contract test runs, then it passes with the new tag registered.

## Implementation Notes

## Plan Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| Unpolled DB check after template delete | low | patch | Single immediate read could race the delete; now `expect.poll`. |
| Checklist order by `createdAt` nondeterministic | false | rejected | `checklists.ts` stamps copied items strictly increasing; `createdAt` is the only order. |
| "No checked items" can pass vacuously | low | rejected | Same pattern as `save-trip-as-template.steps.ts:118`; fix adds complexity. |
| Label on pulled list unasserted | low | rejected | Matrix only requires the checklist to exclude the label; checklist exclusion is asserted by exact `toHaveText`. |
| Fragile day/checklist selectors | false | rejected | First toggle is day 1; `aria-expanded` and visibility guards present; scenario passed. |
| Unscoped template lookup by name | low | rejected | "Reuse Kit" is unique to this scenario. |
| Pull uses raw `waitForResponse` | false | rejected | POST is awaited and asserted ok before reload. |
| Feature-map component gaps | low | rejected | Contract test passes; superset of mapped sources is acceptable. |
| Plan gaps (edge paths, empty logs) | false | rejected | Out of the single-scenario intent; logs filled at present. |

## Design Notes

Keep it one long scenario: the value is the composition, and each stage already has a focused scenario. Assert persistence through reload plus DB reads for ordering, since optimistic UI can hide unpersisted state. If a stage fails because of a product defect, add a failing unit/component test first, fix minimally, and note it here.

## Verification

**Commands:**

- `npx vitest run scripts/feature-map.test.mjs` -- expected: passes
- `npm run test:e2e:affected` -- expected: `@feat:template-reuse` and any mapped features pass
- `build-validator` skill -- expected: PASS

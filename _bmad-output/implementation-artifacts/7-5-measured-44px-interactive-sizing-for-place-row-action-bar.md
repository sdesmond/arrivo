---
baseline_commit: ea5e2f3b637d67a0fe97fe132ae611ea3d4d8385
---

# Story 7.5: Measured 44px Interactive Sizing for PlaceRowActionBar

Status: review

## Story

As a traveler using the day-planning action bar on a mobile device,
I want every action-bar chip and Address ButtonGroup segment to actually measure at least 44×44px in a real browser,
so that Packt's stricter 44px target policy is verified by rendered geometry rather than a class-name assertion in jsdom.

## Acceptance Criteria

1. **Real-browser measurement**
   - Given Time, Cost, Docs, Attach, and both filled-Address ButtonGroup segments in `PlaceRowActionBar`,
   - When they are measured with `getBoundingClientRect()` in Playwright at a 375px viewport,
   - Then every required control has `height >= 44` and `width >= 44`.
   - Measure the empty-Address `Add location` button too: UX defines it as an action-bar chip even though the original AC's control list names only filled-Address segments.

2. **Class-contract guards remain clearly scoped**
   - Given existing jsdom tests asserting `h-11` and `size-11` class-name substrings,
   - When this story lands,
   - Then retain them as cheap Tailwind class-contract regression guards, but rename or annotate them so they do not claim to verify rendered pixel geometry.

3. **Scenario-owned E2E coverage**
   - Add the real-browser scenario to `tests/e2e/features/day-planning.feature`, already tagged `@feat:day-planning`; do not change `tests/e2e/feature-map.mjs`.
   - Use scenario-owned Object-Mother data. One located row has a time, event-linked expense, event-linked document, and filled Address; a separate no-document row exposes Attach. Do not use bootstrap seed rows or ordering/serial workarounds.

## Tasks / Subtasks

- [x] Update tests first. (AC: 1, 2, 3)
  - [x] In `src/components/packt/place-row-action-bar.test.tsx`, retain the existing `h-11` and `size-11` assertions but rename their descriptions to state they are class-contract guards; point to the Day Planning E2E scenario as measured verification. Do not weaken the existing callback, ARIA, DOM-sibling, visual-token, or schedule-conflict regressions.
  - [x] In `tests/e2e/scenario-fixture.spec.ts`, expand the materialization self-test before changing fixture behavior. Materialize a trip with an event, a document whose `eventName` identifies that event, and an expense whose new `eventName` identifies that event; assert both persisted rows reference the materialized event. Also retain coverage that an expense without `eventName` remains trip-level.
  - [x] Add a tagged Gherkin scenario to `tests/e2e/features/day-planning.feature` for mobile action-bar geometry. Its Background may retain existing sign-in/navigation; its explicit steps set a 375×812 viewport and verify the controls' real browser rectangles.
  - [x] Add matching `Before` and step definitions in `tests/e2e/steps/day-planning.steps.ts`. Use role/name locators within fixture-named event rows, wait for each control to be visible, call `locator.evaluate((element) => element.getBoundingClientRect())`, and separately assert width and height are each at least 44. Assert a minimum, never an exact size.

- [x] Extend reusable scenario-owned fixture support narrowly. (AC: 1, 3)
  - [x] Update `tests/e2e/e2e-seed-data.ts`: add optional `eventName?: string` to `ExpenseSeed`, matching `DocumentSeed.eventName` naming.
  - [x] Update `tests/e2e/scenario-fixture.ts`: while materializing `seed.expenses`, resolve optional `eventName` through the existing `eventIdsByName` map and insert the matching `eventId`; preserve current trip-level expense behavior when it is omitted. Do not add global or feature-specific data to `global-setup.ts`.
  - [x] In the `@action-bar-geometry` scenario hook, clone the `threeDayTrip` mother with two fresh day-one events:
    - `Measured action bar`: position 0; start/end time; filled `locationName`, `locationAddress`, latitude, and longitude; one event-linked expense and one event-linked document. This exposes Time, Cost, Docs, `Open directions to …`, and `Edit location`.
    - `Attach geometry row`: position 1; no document and no Address. This exposes Attach and the empty-Address `Add location` action.
  - [x] The Docs toggle and Attach action are mutually exclusive for one row (`hasDocs`); never try to measure both from the same event.

- [x] Implement only a geometry-failure fix if necessary. (AC: 1)
  - [x] `src/components/packt/place-row-action-bar.tsx` already uses `h-11` for native chips, `size="lg"` for the filled-Address primary segment, and `size="icon-lg"` for its edit segment. Do not restyle or refactor it unless the E2E measurement fails.
  - [x] If a measured control is below 44px, make the smallest scoped correction in `place-row-action-bar.tsx`, retain its colocated unit coverage, and rerun the geometry scenario. Preserve `rounded-full`, `gap-2`, current `accent-soft`/`accent-ink`/`fg-4` logic, 12px `IconSize.actionChip`, accessible names/titles, `aria-expanded`, Maps-vs-edit callbacks, schedule-conflict toast behavior, and real sibling ButtonGroup children. **Not needed — the geometry scenario passed on first run; production markup was already correct.**
  - [x] Do not modify `place-row.tsx`, `src/components/ui/button.tsx`, `src/components/ui/button-group.tsx`, server actions, schema/migrations, package files, or the feature map unless a verified failing measurement proves a scoped production correction is required.

- [x] Verify in layers. (AC: 1, 2, 3)
  - [x] Run `npx vitest run src/components/packt/place-row-action-bar.test.tsx`.
  - [x] Run `npx playwright test tests/e2e/scenario-fixture.spec.ts` after fixture changes.
  - [x] Run `npx bddgen`, then `npx playwright test .features-gen/tests/e2e/features/day-planning.feature.spec.js --grep "action-bar"` to verify the new scenario at real browser geometry.
  - [x] If a production visual change was needed, run `desktop-reviewer` followed by `mobile-reviewer` sequentially before broad validation. **N/A — no production visual change was needed.**
  - [x] Run `packt-build-validator` once after targeted checks pass. It owns lint, TypeScript, coverage, build, and affected E2E validation; do not independently launch the full E2E suite.

## Dev Notes

### Current state and required change

- This is an evidence/test-clarity story, not a styling refactor. Current `PlaceRowActionBar` production markup already declares the intended sizing: Time, empty Address, Cost, Docs, and Attach use native `h-11` buttons; filled Address uses shadcn `Button` `size="lg"` (`h-11`) plus `size="icon-lg"` (`size-11`). The local Button primitive resolves those utilities to 44px.
- Existing unit tests at `place-row-action-bar.test.tsx` only inspect literal class substrings. jsdom does not calculate browser layout, so these tests establish an implementation contract rather than AC 1's rendered-geometry proof.
- `PlaceRowActionBar` renders Docs when `place.docs` is non-empty and Attach only otherwise. The original one-row fixture wording cannot show both; use the two rows specified above.
- The reusable mother currently supports `DocumentSeed.eventName` but not an event-linked `ExpenseSeed`; without the narrow fixture extension the Cost chip is not populated from scenario-owned data.

### Architecture and UX guardrails

- No application state, new component, domain type, route, API, database schema, or package dependency belongs in this story. `ExpenseSeed` is E2E fixture typing, not a domain type; keep it under `tests/e2e/`.
- Keep `PlaceRowActionBar` as the shared surface for every event/reservation row. No duplicated test-only action bar or CSS-only measurement helper.
- Filled Address remains two independently focusable, real sibling buttons inside `ButtonGroup`: primary Maps action and icon-only edit action. Never nest one interactive element inside the other.
- Empty Address remains a single `Add location` button. Measure it as the unlisted branch required by the UX component contract; it is not permission to alter its flow.
- This story must preserve all existing row interactions and rendering branches: time/cost/location/doc dialogs, document expand state, external Maps, warning button toast, labels, focus styling, and desktop/mobile visibility behavior.
- Do not add a new token, hardcoded color, arbitrary Tailwind value, or change `IconSize.actionChip`. No UI copy or visual restyle is intended.

### Testing requirements

- Test-first order is mandatory: update fixture self-test and E2E feature/steps before changing fixture support or production markup.
- Component class-contract tests remain colocated at `src/components/packt/place-row-action-bar.test.tsx`. Preserve their cheap class-level coverage; only their wording changes.
- E2E is required because this assertion depends on a real browser's layout engine. Use `playwright-bdd` files only: feature under `tests/e2e/features/`, definitions under `tests/e2e/steps/`.
- Scenario setup must use `scenario.materialize()` with a mother clone and overrides. Never add permanent rows to `global-setup.ts`, query implicit global rows, use serial tags, or rely on another scenario's data.
- Use stable accessible-role/name locators, scoped to each named event row. The rectangle assertion must call `getBoundingClientRect()` in the browser context; do not substitute jsdom, a Tailwind class string, screenshot-only judgment, or `boundingBox()`.
- The added feature/step files already select `@feat:day-planning`; `place-row*.tsx` is already mapped there. Do not change the feature map. The fixture helper is deliberately shared infrastructure; its self-test and exact scenario prove its only new behavior.

### Previous story intelligence

- Story 7.4 followed a focused, tests-first deferred-work fix: it added missing state-transition coverage before production changes, kept unrelated itinerary behavior intact, and used the existing feature map instead of creating duplicate E2E coverage. Apply the same narrow approach here.
- Story 3.2 established the visual and behavioral contract being measured: 44px minimum action chips, `rounded-full` shape, existing fill logic, 12px action icon scale, and 8px `gap-2`. Its review explicitly deferred browser geometry because the assertions inspected only class names; Story 7.5 closes that exact evidence gap.

### Git intelligence

- Recent commits (`ea5e2f3`, `c8e452f`, `0cb12f4`, `07ceb4a`, `a44339c`) show the current pattern: isolate deferred-work scope, write targeted regression coverage first, preserve unrelated behavior, and document review patches. Do not fold route-summary work from Story 7.4 into this action-bar test story.

### Latest technical information

- WCAG 2.2 Success Criterion 2.5.8 Level AA requires a 24×24 CSS-pixel target or qualifying spacing; Packt's 44×44 rule is intentionally stricter and aligns with WCAG 2.5.5's enhanced target guidance. Therefore assert Packt's required 44px minimum without describing it as the WCAG AA numeric floor. [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/#target-size-minimum)
- Playwright locators can evaluate an element in the page context, so `getBoundingClientRect()` provides the rendered CSS-pixel geometry required by this story. Use existing Playwright and playwright-bdd dependencies; no version upgrade is needed. [Playwright Locator API](https://playwright.dev/docs/api/class-locator)

### Project structure notes

| File | Change |
| --- | --- |
| `src/components/packt/place-row-action-bar.test.tsx` | Relabel existing class-string checks as class-contract guards; retain all assertions. |
| `tests/e2e/e2e-seed-data.ts` | Add optional event linkage to `ExpenseSeed`. |
| `tests/e2e/scenario-fixture.ts` | Persist optional event-linked expenses through existing event-ID lookup. |
| `tests/e2e/scenario-fixture.spec.ts` | Test event-linked and unchanged trip-level expense materialization. |
| `tests/e2e/features/day-planning.feature` | Add tagged mobile geometry scenario. |
| `tests/e2e/steps/day-planning.steps.ts` | Add scenario-owned fixture hook, viewport step, and browser-rectangle assertions. |
| `src/components/packt/place-row-action-bar.tsx` | Change only if the new real-browser assertion exposes a measured failure. |

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.5]
- [Source: _bmad-output/implementation-artifacts/deferred-work-plan.md#Story E — Measured 44px interactive sizing for PlaceRowActionBar]
- [Source: _bmad-output/implementation-artifacts/deferred-work.md#Deferred from code review of 3-2]
- [Source: _bmad-output/implementation-artifacts/3-2-resize-action-bar-chips-to-meet-interactive-sizing-minimum.md#Review Findings; #Dev Notes]
- [Source: _bmad-output/implementation-artifacts/7-4-stabilize-daycardbody-route-summary-effect.md#Testing requirements; #Previous Story Intelligence]
- [Source: src/components/packt/place-row-action-bar.tsx#PlaceRowActionBar]
- [Source: src/components/packt/place-row-action-bar.test.tsx#sizing class-contract tests]
- [Source: src/components/ui/button.tsx#buttonVariants]
- [Source: tests/e2e/e2e-seed-data.ts#ExpenseSeed; #DocumentSeed]
- [Source: tests/e2e/scenario-fixture.ts#createTrip]
- [Source: tests/e2e/scenario-fixture.spec.ts#E2E scenario fixtures]
- [Source: tests/e2e/features/day-planning.feature#Day Planning]
- [Source: tests/e2e/steps/day-planning.steps.ts#scenario setup and steps]
- [Source: tests/e2e/feature-map.mjs#day-planning]
- [Source: _bmad-output/planning-artifacts/architecture.md#Architectural Boundaries]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/DESIGN.md#place-row-action-chip]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-packt-2026-07-12/EXPERIENCE.md#Component Patterns; #Interaction Primitives]
- [Source: _bmad-output/project-context.md#Styling; #Testing; #Components]

## Dev Agent Record

### Agent Model Used

GPT-5 Codex (story creation); Claude Sonnet 5 (implementation)

### Debug Log References

- Story context assembled from sprint status, complete planning/UX/architecture artifacts, prior story records, current action-bar and E2E fixture code, recent Git history, and current W3C/Playwright documentation.
- Implementation: `npx vitest run src/components/packt/place-row-action-bar.test.tsx` (42 passed); `npx playwright test tests/e2e/scenario-fixture.spec.ts` (4 passed); `npx bddgen` then `npx playwright test .features-gen/tests/e2e/features/day-planning.feature.spec.js --grep "action-bar"` (2 passed, geometry scenario green on first run); `packt-build-validator` full run — lint PASS, tsc PASS, coverage PASS (3203 tests, lines 96.3%/functions 96.59%/branches 90.45%), E2E affected PASS (192 scenarios, full scope because `scenario-fixture.ts` is shared infrastructure), build PASS.

### Completion Notes List

- Relabeled the three `h-11`/`size-11` class-string assertions in `place-row-action-bar.test.tsx` as class-contract guards, pointing to the new Day Planning E2E `@action-bar-geometry` scenario for measured pixel proof; no assertions were weakened.
- Added optional `ExpenseSeed.eventName`, mirroring `DocumentSeed.eventName`, and wired `scenario-fixture.ts` to resolve it through the existing `eventIdsByName` map when inserting expenses; omitted `eventName` still yields a trip-level expense. Covered by a new `scenario-fixture.spec.ts` self-test (linked doc + linked expense + unlinked trip-level expense) written before the fixture change.
- Added the `@action-bar-geometry` scenario to `day-planning.feature` plus its `Before` hook and step definitions in `day-planning.steps.ts`: a `Measured action bar` event (timed, located, one event-linked expense, one event-linked document) and an `Attach geometry row` event (no docs, no address) exercised at a 375×812 viewport via `getBoundingClientRect()`, asserting width and height are each ≥44px independently.
- No production change to `place-row-action-bar.tsx` was needed — the real-browser measurement passed on the first run, confirming the existing `h-11`/`size="lg"`/`size="icon-lg"` sizing already meets the 44px minimum. `desktop-reviewer`/`mobile-reviewer` were correctly skipped since no visual change occurred.
- `packt-build-validator` ran once at the end and passed all five checks (lint, tsc, coverage, affected E2E, build).

### File List

- `_bmad-output/implementation-artifacts/7-5-measured-44px-interactive-sizing-for-place-row-action-bar.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/components/packt/place-row-action-bar.test.tsx`
- `tests/e2e/e2e-seed-data.ts`
- `tests/e2e/scenario-fixture.ts`
- `tests/e2e/scenario-fixture.spec.ts`
- `tests/e2e/features/day-planning.feature`
- `tests/e2e/steps/day-planning.steps.ts`

### Change Log

- 2026-08-04: Created implementation-ready Story 7.5 with real-browser measurement, fixture-linkage, and regression-scope guidance.
- 2026-08-04: Implemented Story 7.5 — relabeled class-contract unit tests, added event-linked `ExpenseSeed` fixture support with self-test coverage, added the `@action-bar-geometry` real-browser E2E scenario, verified production markup already meets the 44px minimum (no production change needed), and passed `packt-build-validator` in full.

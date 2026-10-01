---
title: "Clean up test-infra duplication across the live-sync test suite"
type: "chore"
created: "2026-09-09"
status: "done"
baseline_commit: "321157c728df8b4e64a7c2eb484ad2eed996e92b"
review_loop_iteration: 0
context:
  - "{project-root}/_bmad-output/project-context.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Test-only debt accumulated across the live-sync epics: a `MockEventSource` trio is
copied into 4 unit test files, three E2E step files reimplement the same seed-a-collaborator +
open-second-session helpers, a bare `15_000` timeout is repeated 4 times, 8 revocation-modal step
registrations duplicate 4 behaviors under different nouns, and one dead helper has zero callers.
The other deferred-work.md item this spec was going to close ("no E2E for removal off the trip
page") turned out to already exist (`dashboard-live-sync.feature:9-15`, "A contributor removed
while viewing the dashboard sees revocation and loses the trip") and is corrected there instead of
respecced here.

**Approach:** Extract each duplicated piece to one shared location; parameterize the duplicated
Gherkin steps; delete the dead helper.

The AC6 bfcache-restoration E2E scenario originally planned for this spec was dropped after
implementation investigation (see Spec Change Log) — it surfaced what looks like a genuine,
separate issue in `useBfcacheRefresh`/Next.js's `router.refresh()`, not a test-authoring gap, and
this spec's own "no production code" boundary means it can't be fixed here.

## Boundaries & Constraints

**Always:** Change test files only — no production code in this spec. Keep every existing scenario
green throughout; a shared-helper extraction must not alter any current assertion's behavior.

**Never:** Fix E2E flakiness via ordering tags, serial execution, or shared-record reseeding — each
new/refactored scenario still creates its own mutable rows (project convention).

</frozen-after-approval>

## Code Map

- `src/lib/use-trip-live-refresh.test.ts`, `src/lib/use-live-sync.test.ts`,
  `src/components/packt/contributor-revocation-modal.test.tsx`,
  `src/lib/use-dashboard-live-refresh.test.ts` — each defines its own `MockEventSource`,
  `currentSource()`/`personalSource()`, `flushMicrotasks()`.
- `tests/e2e/steps/revocation-modal.steps.ts:65-123` — `seedCollaborator`, `openSecondSession`,
  `signInAsRemovedUser` (module-local); `tests/e2e/steps/dashboard-live-sync.steps.ts:33-66` and
  `tests/e2e/steps/trip-live-refresh.steps.ts:60-93` each reimplement the seed+second-session part.
- `tests/e2e/live-sync.ts:3` — `LIVE_SYNC_READY_TIMEOUT_MS` (module-local, not exported); bare
  `15_000` repeated in `tests/e2e/steps/dashboard-live-sync.steps.ts:97,115,126,132`.
- `tests/e2e/steps/revocation-modal.steps.ts:147-212` — 4 duplicated Given/When/Then pairs
  (`…contributor…` vs `…co-manager…`), bodies already delegate to shared helpers.
- `tests/e2e/scenario-fixture.ts:109,655-658` — `refreshCurrentPage`, zero callers anywhere.

## Tasks & Acceptance

**Execution:**

- [ ] New `src/lib/live-sync-test-helpers.ts` (or similar) -- extract `MockEventSource`,
  `currentSource`/`personalSource`, `flushMicrotasks`; update all 4 test files to import it.
- [ ] `tests/e2e/scenario-fixture.ts` -- promote `seedCollaborator`, `openSecondSession`,
  `signInAsRemovedUser` from `revocation-modal.steps.ts` onto `ScenarioFixtureContext`; remove the
  dead `refreshCurrentPage`.
- [ ] `tests/e2e/steps/revocation-modal.steps.ts`, `dashboard-live-sync.steps.ts`,
  `trip-live-refresh.steps.ts` -- call the promoted helpers instead of each file's own copy.
- [ ] `tests/e2e/live-sync.ts` -- export `LIVE_SYNC_READY_TIMEOUT_MS`, or a new sibling assertion
  timeout constant; replace the four bare `15_000` literals in `dashboard-live-sync.steps.ts`.
- [ ] `tests/e2e/features/revocation-modal.feature`,
  `tests/e2e/steps/revocation-modal.steps.ts` -- parameterize the 4 duplicated pairs to
  `the {string} session clicks OK` / `I remove the {string} from the trip and save` (and the two
  remaining pairs the same way).

**Acceptance Criteria:**

- Given any of the 4 test files using the live-sync mock trio, when its tests run, then behavior is
  unchanged and only its import source moved.
- Given the 3 E2E step files that seed a second session, when they run, then each calls one shared
  implementation, not its own copy.

## Spec Change Log

- Dropped the AC6 bfcache-restoration E2E task/acceptance criterion after implementation
  investigation. Dispatching a synthetic `pageshow(persisted:true)` on the removed contributor's
  page does trigger `useBfcacheRefresh`'s `router.refresh()` — confirmed via network capture that
  the resulting RSC response references the `not-found.tsx` chunk — but the client never applies
  that update to the DOM (waited 12s; a genuine `page.reload()` on the same page correctly shows
  "Trip not found" immediately). Genuine back/forward-cache restoration via real navigation
  (`goto` away + `goBack()`) also did not activate bfcache in this Playwright/Chromium setup — a
  full fresh reload happened instead. This looks like a real gap in `useBfcacheRefresh`/Next.js
  16.2.4's handling of `notFound()` during `router.refresh()`, not a test-authoring problem, and is
  out of this spec's "test files only" scope to fix. Left `deferred-work.md`'s AC6 item open with
  this finding instead of closing it.

## Verification

**Commands:**

- `npx vitest run src/lib/use-trip-live-refresh.test.ts src/lib/use-live-sync.test.ts src/components/packt/contributor-revocation-modal.test.tsx src/lib/use-dashboard-live-refresh.test.ts` -- expected: pass.
- `npm run test:e2e:affected` -- expected: `@feat:revocation-modal`, `@feat:trip-live-refresh` (or
  equivalent tags) selected and passing.
- `packt-build-validator` -- expected: lint, type check, coverage, build, affected E2E pass.

---
name: project_validator_failures_are_contention
description: build-validator coverage/E2E crashes were two concurrent Vitest processes racing Vite's shared temp dir — fixed by moving E2E fixture self-tests to a Playwright project so only one Vitest runs
metadata:
  type: project
---

If `packt-build-validator` reports COVERAGE or E2E FAIL with one of these errors, suspect two Vitest processes running at once — NOT a config bug (every suite passes standalone):

- `Coverage must be initialized with a path or an object` (istanbul `getCoverageMapForUncoveredFiles`)
- every test file showing `(0 test)` / all queued, none executed
- `TypeError: Cannot read properties of undefined (reading 'config')` at a `describe(...)`

**Why:** the validator runs `test:coverage` (Vitest) and `test:e2e` in parallel. The crashes happened when the E2E pipeline also spawned a SECOND Vitest (the old `test:e2e:fixtures` step). Two Vitest processes in one project race Vite's fixed-name temp dir (`node_modules/.vite-temp`) — `cacheDir` isolation is NOT enough because that temp dir is not keyed off `cacheDir`. The race corrupts transforms so modules resolve to `undefined`, which surfaces as all three errors above (Vitest's worker runtime breaks → `getWorkerState()` undefined → `reading 'config'`; an instrumented file's transform returns undefined → `addFileCoverage(undefined)`; or `(0 test)` collection). Symptom moves between runs; it is a flaky race, not deterministic. The Next build is unaffected (Turbopack has its own cache).

**The fix (done):** there must be only ONE Vitest process under the validator. The E2E fixture self-tests now run as a dedicated Playwright project — `tests/e2e/scenario-fixture.spec.ts`, registered as the `fixtures` project in playwright.config.ts (no browser/auth; hits the live DB via `withE2EDb` after global-setup migrates+seeds). The old `tests/e2e/scenario-fixture.test.ts` (Vitest), `vitest.e2e.config.mts`, the `test:e2e:fixtures` npm script, and the `run-e2e.mjs` step were all removed. `cacheDir`/`maxWorkers` experiments were reverted — they did NOT fix it (a validator run with cacheDir present still failed). Do not reintroduce a second concurrent Vitest; if E2E-support code needs live-DB tests, add them to the Playwright `fixtures` project, not a new Vitest config. Related: [[project_e2e_env_flakiness]], [[project_pwsh_spawn_poisons_next_spawn]].

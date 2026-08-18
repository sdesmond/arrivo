---
title: "Story 1.4: E2E and lint cutover"
type: "refactor"
created: "2026-08-18"
status: "done"
review_loop_iteration: 0
context: []
baseline_commit: ad14167694308d88ca2a22e407d49a86a0909a69
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The migrated storage layer still retains the retired `UPLOAD_STUB` E2E flag and developer setup path, permits legacy direct-file helper exceptions, and leaves `@vercel/blob` installed without an import boundary preventing regression.

**Approach:** Cut E2E and local setup over to the local `StorageAdapter`, reset its scratch storage before each suite, remove retired implementation/dependency artifacts, and enforce adapter-only imports through ESLint.

## Boundaries & Constraints

**Always:** E2E uses `STORAGE_PROVIDER=local` and an E2E-scoped `.e2e-storage` root; cleanup runs before DB reset and removes only that resolved project child. Keep the existing `node:fs` exception solely for the local adapter and its test. `@vercel/blob` must be absent from runtime source, manifest, and lockfile. Existing document and cover E2E flows remain the integration proof of the real adapter.

**Ask First:** Expand E2E scenarios only if existing document-upload and cover-render scenarios cannot prove the local-adapter path after cutover.

**Never:** Add a Vercel Blob adapter, retain an `UPLOAD_STUB` compatibility flag, alter upload key/URL contracts, or delete files outside the dedicated E2E storage root.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| E2E storage reset | `.e2e-storage` contains nested stale files | Global setup removes stale contents then recreates the root before DB seeding | Recursive removal is restricted to the resolved project `.e2e-storage` child |
| Local storage E2E | Document or cover upload under Playwright | Adapter writes to `.e2e-storage`; existing proxy URL remains renderable | Existing scenario failure surfaces normally; no stub fallback |
| Unsupported import | Source imports `@vercel/blob` or direct `node:fs` outside adapter exception | ESLint fails with the storage-port guidance | Local adapter and its unit test retain their necessary exception |

</frozen-after-approval>

## Code Map

- `playwright.config.ts` — web server currently supplies both obsolete `UPLOAD_STUB` and correct local-storage variables; remove only the former.
- `tests/e2e/global-setup.ts` — DB reset bootstrap; invoke a testable E2E-storage reset before truncation/seeding.
- `scripts/e2e-storage.mjs` + `scripts/e2e-storage.test.mjs` — new narrowly scoped reset helper and unit coverage for recreating the root and removing stale nested files.
- `eslint.config.mjs` — ignore generated/agent framework files, add an all-linted-code `@vercel/blob` import ban, retain the application-source direct-filesystem rule, and remove `local-upload` exceptions while retaining local-adapter exemptions.
- `src/lib/local-upload.ts` + `src/lib/local-upload.test.ts` — obsolete unreferenced direct-FS fallback; delete with its test.
- `package.json` + `package-lock.json` — sole remaining `@vercel/blob` dependency records; remove through npm lockfile generation.
- `scripts/setup-dev.mjs` + `scripts/setup-dev.test.mjs` — setup still synthesizes, forwards, and reports `UPLOAD_STUB`; replace with local provider/root defaults and preservation behavior.
- `.env.example` and `SETUP.md` — storage environment documentation; `.env.example` already declares local-storage defaults while setup documentation must drop the retired flag.
- `tests/e2e/features/documents.feature`, `tests/e2e/features/trip-cover-overflow.feature`, and their steps — existing upload and proxy-render integration evidence; update only if the cutover exposes a missing assertion.
- `tests/e2e/feature-map.mjs` — no edit expected: global setup, Playwright config, ESLint config, and package manifests already select the full affected suite.

## Tasks & Acceptance

**Execution:**

- [x] `scripts/e2e-storage.test.mjs` — first, add focused tests for safe E2E-root reset and stale-file cleanup — establishes isolation contract before runtime wiring.
- [x] `scripts/e2e-storage.mjs` and `tests/e2e/global-setup.ts` — implement and call reset before the DB truncate/seed sequence — eliminates file leakage across suites.
- [x] `scripts/setup-dev.test.mjs` — first, replace stub-flag expectations with local provider/root default and preservation assertions.
- [x] `scripts/setup-dev.mjs` and `SETUP.md` — remove retired stub/token behavior from setup and documentation while retaining clear local storage configuration; inspect `.env.example` and leave its already-correct local defaults unchanged.
- [x] `playwright.config.ts` — remove `UPLOAD_STUB` from web-server env, retaining E2E local-provider/root values.
- [x] `eslint.config.mjs`, `src/lib/local-upload.ts`, and `src/lib/local-upload.test.ts` — ignore generated/agent framework artifacts, finalize restricted imports, and remove dead legacy direct-FS fallback — prevents future bypasses.
- [x] `package.json` and `package-lock.json` — remove `@vercel/blob` with npm-generated lockfile changes — completes dependency cutover.
- [x] Existing document/cover E2E features — run existing upload and proxy-render flows; add no duplicate scenario unless they fail to exercise the real adapter.

**Acceptance Criteria:**

- Given a Playwright suite begins with stale E2E files, when global setup runs, then `.e2e-storage` is recreated before DB seeding and contains no earlier-suite files.
- Given E2E uploads a document or cover, when it renders after upload or reload, then the local adapter's `/api/storage/...` URL is used without `UPLOAD_STUB`.
- Given linted code is checked, when a direct Blob SDK import is introduced anywhere or a non-adapter filesystem import is introduced in application source, then ESLint rejects it; `local-filesystem-adapter.ts` and its test remain permitted for filesystem access.
- Given dependencies and tracked source are searched after the change, when looking for `@vercel/blob` or `UPLOAD_STUB`, then no active runtime, setup, config, manifest, or documentation reference remains.
- Given targeted setup/storage tests and the affected E2E suite run, when they complete, then they pass with the real local adapter and project coverage thresholds remain satisfied.

## Spec Change Log

_Empty until the first review loopback._

## Design Notes

- A dedicated script helper keeps filesystem cleanup unit-testable under the existing Vitest `scripts/**` coverage scope while `global-setup.ts` remains Playwright bootstrap. It must resolve and validate the fixed E2E child path before recursive deletion.
- The current E2E config already provides the local provider and root. Removing only `UPLOAD_STUB` avoids changing server, database, or proxy routing behavior.

## Verification

**Commands:**

- `npx vitest run scripts/e2e-storage.test.mjs scripts/setup-dev.test.mjs` — expected: reset and setup-default contracts pass.
- `npm run lint` — expected: import boundaries and deleted fallback leave no lint errors.
- `npx vitest run --coverage` — expected: ≥95% lines/functions and ≥90% branches.
- `npm run test:e2e:affected` — expected: full affected suite passes because shared E2E harness/config changed.
- `packt-build-validator` — expected: lint, types, coverage, build, and affected E2E pass.

## Suggested Review Order

**E2E storage isolation**

- Defines one safe, reusable root for both cleanup and the E2E server.
  [`e2e-storage.mjs:4`](../../scripts/e2e-storage.mjs#L4)

- Clears storage before database reset so earlier uploads cannot leak.
  [`global-setup.ts:11`](../../tests/e2e/global-setup.ts#L11)

- Supplies the same storage root to the real local adapter.
  [`playwright.config.ts:37`](../../playwright.config.ts#L37)

**Retired configuration removal**

- Rewrites existing developer environments without obsolete Blob/stub keys.
  [`setup-dev.mjs:207`](../../scripts/setup-dev.mjs#L207)

- Preserves local storage defaults while proving legacy variables disappear.
  [`setup-dev.test.mjs:27`](../../scripts/setup-dev.test.mjs#L27)

**Storage boundary enforcement**

- Bans Blob SDK imports globally and filesystem imports in application code.
  [`eslint.config.mjs:8`](../../eslint.config.mjs#L8)

- Keeps generated and agent framework files outside application lint scope.
  [`eslint.config.mjs:42`](../../eslint.config.mjs#L42)

**Supporting cleanup and verification**

- Removes unused Blob dependency and its transitive lockfile entries.
  [`package.json:42`](../../package.json#L42)

- Proves stale E2E files are removed without touching project files.
  [`e2e-storage.test.mjs:22`](../../scripts/e2e-storage.test.mjs#L22)

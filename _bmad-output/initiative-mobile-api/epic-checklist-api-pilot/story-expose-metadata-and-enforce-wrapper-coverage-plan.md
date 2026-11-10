---
title: "Expose metadata and enforce wrapper coverage"
type: feature
ticket: 4
created: "2026-11-08"
status: done
baseline_revision: "b9bc6c74c379f02aa9872a0f1c7a2d86a1bad394"
route: full
route_source: auto
risk: medium
review: "thorough"
review_source: "auto"
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context: [docs/plans/mobile-api.md, _bmad-output/initiative-mobile-api/AGENTS.md]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `/api/v1` has no metadata endpoint, nothing stops a future v1 route from skipping `apiRoute` (and so auth, CSRF, validation, rate limit), and the E2E API wait helper silently times out on a mistyped method or path.

**Approach:** Add a public `GET /api/v1/meta` as the one justified exemption, add a unit test that walks every `src/app/api/v1/**/route.ts` and fails on any unwrapped or non-allowlisted handler, harden `waitForApiResponse` against never-matching arguments, and register every new runtime file in the feature map.

## Boundaries & Constraints

**Always:** Branch `story/1-4-expose-metadata-wrapper-coverage`; PR base `feature/api-v1`. `/meta` is unauthenticated GET (`/api/v1` is already in proxy `PUBLIC_PATHS`), `Cache-Control: no-store`, and returns only `{ apiVersion: 1, capabilities: ["idempotency-key"] }`: no app version, user or environment data. The exemption list is explicit (route path plus reason) and a stale entry fails the test. Existing auth and other E2E waits stay unchanged. Each new runtime file is classified in `feature-map.mjs` with a matching `feature-map.test.mjs` assertion.

**Never:** Run-time response schemas/OpenAPI, GET support in `apiRoute`/`defineEndpoint`, app-session or mobile token endpoints, new migrations, `src/data/types.ts` edits (it is a full-suite glob), or running the full E2E suite.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Meta anonymous | `GET /api/v1/meta`, no cookie | 200 `{ apiVersion: 1, capabilities: ["idempotency-key"] }`, no-store | No error expected |
| Meta signed in | Same with session | Identical body | No error expected |
| Unwrapped handler | route exporting `GET`/`POST` function, `export const X = other()`, or re-export | Coverage test fails naming file and method | Failure message lists offenders |
| Exempt route | `meta/route.ts` plain `GET` | Passes | Stale exemption (file gone or now wrapped) fails |
| Mismatched wait | Response with other method, other path, or extra path segment | Not matched; times out | Timeout propagates |
| Invalid wait args | lowercase method accepted; path with `?`, `#`, or no leading `/` | Lowercase normalized; invalid path rejects immediately | Error names the bad argument |

</frozen-after-approval>

## Code Map

- `src/lib/api/route.ts` -- `apiRoute` wrapper; reuse, do not change. `src/proxy.ts:15` already lists `/api/v1`.
- `src/app/api/health/route.ts` -- pattern for a public no-store GET; model `meta/route.ts` on it.
- `src/app/api/v1/checklist-items/[itemId]/route.ts` + `route.test.ts` -- wrapped handler and test pattern (mocks `@/lib/api/route`).
- `src/lib/api/contract/checklists.ts` -- contract style; add `src/lib/api/contract/meta.ts` exporting one `API_META` const (`as const`; no new named type, so `src/data/types.ts` stays untouched).
- `tests/e2e/api-response.ts` + `api-response.test.ts` -- method/path wait; used by `api.steps.ts`, `day-planning.steps.ts`, `trip-live-refresh.steps.ts`.
- `tests/e2e/features/api.feature` + `steps/api.steps.ts` -- add anonymous and signed-in meta scenarios (uses Playwright `request`/`page` helpers there).
- `tests/e2e/feature-map.mjs` -- `api`, `day-planning`, `trip-live-refresh` entries list `src/app/api/v1/checklist-items/**`; add `src/app/api/v1/meta/**` to `api` only (`src/lib/api/**` already covers contract and coverage test). `scripts/feature-map.test.mjs` -- add classification assertion.

## Tasks & Acceptance

**Execution:**

- [ ] `src/lib/api/handler-coverage.test.ts` -- pure scanner over route source text plus fixtures (unwrapped function, other-call const, re-export, aliased import, wrapped ok) and a live walk of `src/app/api/v1/**/route.ts` with explicit `EXEMPT` map -- P8 enforcement, test first
- [ ] `src/lib/api/contract/meta.test.ts` and `meta.ts` (`API_META` const); `src/app/api/v1/meta/route.test.ts` and `route.ts` -- body, status, no-store, no auth call -- P8 metadata
- [ ] `tests/e2e/api-response.test.ts` then `api-response.ts` -- method normalization, path validation, mismatch cases -- P9 audit
- [ ] `tests/e2e/features/api.feature`, `steps/api.steps.ts` -- anonymous and authenticated `/meta` scenarios -- P9
- [ ] `tests/e2e/feature-map.mjs`, `scripts/feature-map.test.mjs` -- classify meta route (api only) and keep every new runtime module classified -- P9

**Acceptance Criteria:**

- Given a temporary v1 route exporting an unwrapped `POST`, when the coverage test runs, then it fails naming that file and method.
- Given a mistyped wait method or path, when no matching response arrives, then the helper never resolves a different request's response.

## Design Notes

Scanner is source-text based (no module import, so no DB or auth side effects): collect `export` declarations per route file, require every HTTP-method export to be `= apiRoute(`, and reject `export function/async function`, `export { }` and `export *`. Exemption entries carry a reason string; the live test asserts each exempt file exists and exports at least one non-`apiRoute` handler, so exemptions cannot rot. `/meta` exposes no version string: unauthenticated disclosure of `APP_VERSION` helps fingerprinting; richer capabilities belong to the mobile prerequisites phase.

## Verification

**Commands:**

- `npx vitest run src/lib/api src/app/api/v1 tests/e2e/api-response.test.ts scripts/feature-map.test.mjs` -- expected: pass
- `npm run test:e2e:affected` -- expected: api feature passes

## Review Triage Log

| Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| Whole-file exemption lets meta route gain unwrapped POST; live check accepts any offender (blind, edge, gap) | medium | patch | Verified: EXEMPT skipped file entirely, stale check only needed >=1 offender. Fixed: EXEMPT carries exact `handlers`; offender set must equal it. |
| Destructured / multi-declarator exports bypass const regex (edge, gap) | medium | patch | Verified: `\w+` misses `{`; only first declarator checked. Fixed in scanner; 3 fixtures added. |
| Glob only matches `route.ts` (blind, edge, gap, intent) | medium | patch | Verified: Next accepts other extensions. Glob widened to `route.{ts,tsx,js,jsx,mjs}`. |
| `stripComments` mishandles `/*` inside strings (blind, edge) | low | rejected | Needs `/*` in a v1 route string literal; fix needs a tokenizer. |
| `x as apiRoute` import accepted; relative import falsely flagged (edge) | low | rejected | Same-module rename unlikely; false flag fails loudly. |
| "Never authenticates" test vacuous (blind, edge) | false | rejected | Mocks the auth function apiRoute uses; adding it to the route would fail the test. |
| Missing `dynamic = "force-dynamic"` may prerender/override no-store (blind) | false | rejected | No v1 route sets it; health route same pattern; E2E asserts real `no-store` header and passed. |
| "signed-in" scenario never signs in (blind, edge) | false | rejected | Default project uses `storageState` auth; anonymous clears cookies. |
| `waitForApiResponse` accepts `//x`, encoded paths, timeout 0/NaN; method regex lax (blind, edge) | low | rejected | Beyond matrix rows; extra guards for unreachable inputs. |
| Async arming not asserted (gap) | low | rejected | Callers unchanged; hypothetical future regression. |
| Literal duplicated; no docs; no 405 test (blind) | low | rejected | Pinning in tests intentional; docs go in PR description; Next handles 405. |
| Intent readings B2/B3 (runtime check) not implemented (intent) | n/a | rejected | Descriptive; intent says "unit test that walks every route.ts", source scan satisfies one defensible reading. |

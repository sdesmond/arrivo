---
title: "Search cover images and destinations through GET endpoints"
type: feature
ticket: "7"
created: "2026-11-13"
status: built
baseline_revision: "1cd8f831b3438122d2240dcd5d862c66952dbbf9"
route: full
route_source: auto
risk: medium
review: thorough
review_source: auto
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context:
  - "_bmad-output/initiative-mobile-api/AGENTS.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Cover image search and destination lookup are server actions (`cover-image-search-actions.ts`) with untyped errors, and the API has no read transport, so a cross-origin page cannot be stopped from spending a visitor's Unsplash/Mapbox budget.

**Approach:** Add `GET` with a validated query to `defineEndpoint`, `apiRoute` and `api()`, guard API reads with `X-Arrivo-Client: web` plus same-origin, move search into one service that `createTrip` also calls, ship `GET /api/v1/cover-images` and `GET /api/v1/cover-images/destination`, switch the picker search tab, retire the action file, and extend `adr-api-cookie-csrf.md` to reads. Branch: `story/3-7-cover-search-get-api`; PR base: `feature/api-v1`.

## Boundaries & Constraints

**Always:** `GET` reuses `body` as the validated query schema (like multipart reuses it for form fields); repeated query keys are 400, schema failures 422. Same order as writes: `requireApiUser`, read check, `api` rate limit, then params/query. Per-user `unsplashSearch` (30/min) and `mapboxSearch` (120/min) buckets, 10 s timeouts, `E2E_UNSPLASH_STUB`/`E2E_MAPBOX_STUB` behavior, query simplification and page limits (`MAX_COVER_SEARCH_PAGE*`) stay as today. Limit hits are 429 with `Retry-After` through existing `RateLimitError` mapping. `createTrip` keeps its try/catch, defaults (page 1, 19) and bucket. Results are `{ images }` and `{ center }` (`[lng, lat] | null`). Responses stay `no-store`.

**Never:** Mapbox typeahead (`searchLocations`, `retrieveLocation`) or `/api/mapbox/static` migration, a site-wide Unsplash cap, schema or migration, new env var, CORS, `Idempotency-Key` on reads (400), CHANGELOG edits, remote publication without authorization.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Behavior | Error |
| --- | --- | --- | --- |
| Search | Signed in, `query`, optional `page`/`perPage` | 200 `{ images }` | — |
| Destination | Signed in, `name` | 200 `{ center }`; no token or no match → `null` | — |
| Signed out | No session | No upstream call | 401 `unauthenticated` |
| Bad query | Empty/over-long `query`, page 0 or above cap, perPage above 30, unknown key | No upstream call | 422 `validation_failed`; repeated key 400 |
| Over budget | Per-user bucket spent | No upstream call | 429 + `Retry-After` |
| Cross-origin | No `X-Arrivo-Client: web` or not same-origin | No upstream call, budget unspent | 403 `forbidden` |
| Keyed | `Idempotency-Key` on a read | Nothing runs | 400 |
| Create trip | Destination, photo default | Service called with user id; first image becomes cover | Failure logged, trip kept |

</frozen-after-approval>

## Code Map

- `src/lib/api/endpoint.ts` — `method` gains `"GET"`; doc that `body` validates the query for GET.
- `src/lib/api/csrf.ts` — add `assertWebRead(request)`: `X-Arrivo-Client: web` + same-origin, no content-type test; share origin logic with `assertWebMutation`.
- `src/lib/api/route.ts` — for GET: `assertWebRead`, build `raw` from `new URL(request.url).searchParams` (repeated key → 400), skip JSON read. Keyed GET already 400.
- `src/lib/api/client.ts` — for GET: append `input.body` entries as query string, no body, no `Content-Type`.
- `src/lib/api/contract/cover-images.ts` (new) — `searchCoverImages` (`/api/v1/cover-images`; `query` via `FIELD_LIMITS.destination`, coerced `page`/`perPage` with caps) and `resolveDestinationCenter` (`/api/v1/cover-images/destination`, `name`). Pattern: `contract/covers.ts`.
- `src/lib/services/cover-search.ts` (new) — move `searchCoverImages`, `resolveDestinationCenter`, `buildE2EUnsplashStub`, `simplifySearchQuery` from `cover-image-search-actions.ts`; take `actor` instead of `requireUser()`; keep guards, stubs, buckets.
- `src/app/api/v1/cover-images/route.ts`, `.../destination/route.ts` (new) — `GET = apiRoute(contract, …)`; template `trips/[tripId]/cover/image/route.ts`.
- `src/app/(app)/trips/actions.ts:70,373` — import the service; call with `{ userId: sessionUser.id! }`.
- `src/components/arrivo/cover-image-picker-search-tab.tsx:10,77,81` — replace actions with `api(...)` calls; keep toast, state, markup. Do not touch `searchLocations`/`retrieveLocation`.
- `src/app/(app)/trips/cover-image-search-actions.ts` — delete. `actions.test.ts` — move the `searchCoverImages`/`resolveDestinationCenter` blocks (≈3879–4226, line 171 import) to the service test.
- `src/lib/url-policy.ts:62` — comment names the old file; update. `tests/e2e/feature-map.mjs:769` — drop; map `cover-search.ts` and `src/app/api/v1/cover-images/**` to `api`, `trip-cover-overflow` and `create-trip` (line ≈467).
- `docs/decisions/adr-api-cookie-csrf.md` — extend to API reads.
- `tests/e2e/steps/trip-cover-overflow.steps.ts:15–33` — search step.

## Tasks & Acceptance

**Execution:**

- [x] `src/lib/api/endpoint.test.ts`, `csrf.test.ts`, `route.test.ts`, `client.test.ts` — GET declaration; `assertWebRead` (header, same-origin, forwarded origin, no content-type need); GET route: query parsed and validated, repeated key 400, keyed 400, 401, 403, 422; client builds query string, sends no body or content-type, handles timeout/errors.
- [x] `src/lib/api/contract/cover-images.test.ts`, `src/app/api/v1/cover-images/route.test.ts`, `.../destination/route.test.ts` — query matrix rows (401, 422, 429 with `Retry-After`, 403, 200 shapes, mapped errors).
- [x] `src/lib/services/cover-search.test.ts` — moved search tests plus destination: empty name, E2E stub, no token, success, failure → null, `mapboxSearch`/`unsplashSearch` buckets, stub outside budget.
- [x] `src/app/(app)/trips/actions.test.ts` — drop moved blocks; `createTrip` calls the service with its user, spends `unsplashSearch`, and the stub still creates a stub cover.
- [x] `src/components/arrivo/cover-image-picker-search-tab.test.tsx` — mock `@/lib/api/client`; search and center calls with the query body, failure toast, skip center when `center` prop given.
- [x] `tests/e2e/features/api.feature`, `tests/e2e/steps/api-cover-search.steps.ts` — signed-out 401, cross-origin 403, bad query/page 422, stub 200 incl. page 2, destination 200; no 429 (stubs bypass budgets, unit-covered).
- [x] `tests/e2e/features/trip-cover-overflow.feature`/steps — search step arms `waitForApiResponse` on `GET /api/v1/cover-images`, then selects and PUT proves persistence; run `create-trip` unchanged.
- [x] Implement contract, service, routes, transport, picker, `createTrip` switch, ADR, `feature-map.mjs`; delete the action file; grep for dead symbols; run `npx vitest run scripts/feature-map.test.mjs`.

**Acceptance Criteria:**

- Given a signed-in user in the cover picker, when they search a destination, then stub images appear and selecting one persists with attribution.
- Given a cross-origin GET without `X-Arrivo-Client`, when it hits either endpoint, then it is 403 and no budget is spent.
- Given the migrated runtime, when searching definitions and imports, then `cover-image-search-actions` no longer exists and `createTrip` reaches search only through the service.

## Implementation Notes

Plan-reviewer: 0 BLOCKING, 2 WARNING (picker search tab is 379 lines, split not requested; `url-policy.ts` edit is comment-only). User kept the full plan (~2,400 tokens), approved it, created branch `story/3-7-cover-search-get-api` from `feature/api-v1` at `1cd8f831b3438122d2240dcd5d862c66952dbbf9`, and allowed independent review subagents for step-04. Original request: `/bmad-build next story` → ticket 3.7.

## Plan Change Log
- The next affected run exposed an anonymous day probe receiving 200 because an in-flight browser response renewed cleared cookies. Share the existing trip-note isolated request context across the role-based API request helpers, with empty storage state and scenario cleanup. Keep the 401 assertions unchanged; do not serialize scenarios or reseed shared records.
- Broad validation exposed two pre-existing day-planning test timing failures: five reloads in the note-order scenario and response deadlines started before intentionally held writes could be released. Reuse post-reload assertions and arm response waits immediately before releasing each held request; await the queued edit response before the final reload. No application behavior, scenario isolation, or execution ordering changed.
- Header fixtures in csrf.test.ts use explicit Record<string, string>[] annotations so TypeScript does not infer optional undefined union members.

## Review Triage Log
| Finding | Verdict | Evidence / route |
| --- | --- | --- |
| Blind 1: plain HTTP GET rejected | high | GET lacks Origin and Fetch Metadata on supported plain HTTP hosts; current fallback rejects it. Patch: compare browser Referer origin when both are absent, preserving explicit origin/metadata rejection. |
| Blind 2: new E2E step unmapped | low | New api-cover-search.steps.ts has no feature-map entry, so a step-only change selects nothing. Direct registration patch. |
| Blind 3: Mapbox failure prevents photos | medium | Previous action raised budget errors outside its catch and picker already awaited it before Unsplash. Pre-existing; defer. |
| Blind 4: obsolete requests keep spending budgets | low | Effect already used isCurrent without upstream cancellation before migration; reads still bounded by timeout. Reject added cancellation surface for uncommon rapid changes. |
| Blind 5: structured GET serialization | false | Both defined GET contracts accept only scalar strings/numbers; no structured-value caller or failing supported query exists. |
| Blind 6: malformed Mapbox coordinates | maybe-false | Provider types promise geometry coordinates; runtime shape is asserted as before. No malformed provider response demonstrated. If real, medium; defer pending provider response evidence. |
| Blind 7: SVG stub XML interpolation | low | Raw query interpolation was present in original action. Stub-only special-character queries can break fixtures; defer existing issue. |
| Blind 8: null center route test missing | low | Service proves null, wrapper forwards it, but explicit route assertion absent. Direct test patch. |
| Blind 9: error cache assertions missing | false | errors.test.ts already asserts no-store for all error classes including 429/500; shared wrapper has one catch path. No unverified cache branch added. |
| Blind 10: E2E error envelope assertions | low | Status alone does not pin migrated GET error codes/fields. Direct test assertion patch. |
| Edge 1: malformed coordinates | maybe-false | Same provider-contract uncertainty as Blind 6; deferred with same evidence. |
| Edge 2: malformed Unsplash fields | maybe-false | Existing action trusted provider response interface identically. No malformed real response demonstrated; potential medium harm, defer pending evidence. |
| Verification 1: plain HTTP hosting | high | Independently confirms Blind 1; same-origin referrer comparison addresses demonstrated missing metadata path. Patch. |
| Intent 1: hostile browser boundary not exercised | low | Existing API tests verify supplied headers, picker E2E verifies browser success, but no hostile-page browser fixture. Direct read-guard tests cover rejection; extra hostile fixture deferred as verification hardening. |
| Intent 2: budget proof split across layers | false | Route assertions prove no service/API budget on rejection; service assertions pin actor bucket. Composition demonstrates intended invariant without spending stub budgets. |
| Intent 3: all provider spend protection | false | Intent Approach explicitly names cover search and destination endpoints; typeahead/static route migration explicitly excluded. |
| Intent 4: domain errors remain plain | false | Captured design explicitly preserves upstream Error to 500 and destination failure to null; typed API boundary implemented. |
| Intent 5: branch/base absent from diff | false | Current branch verified against git and plan records feature/api-v1 base; no PR authorized or opened. |

## Design Notes

`api()` for GET is called straight from the picker effect (no mutation hook): reads need no queue or refresh; a failure toasts "Could not load images" as today. Missing `UNSPLASH_ACCESS_KEY` and Unsplash failures stay plain errors, so the API answers 500 `server_error`; the UI message is unchanged. Preserve CSS tokens, 44px targets and keyboard behavior; no redesign.

## Verification

**Commands:**

- Named Vitest files, then `npx vitest run scripts/feature-map.test.mjs` -- expected: pass.
- Focused Playwright: `api.feature` cover-search scenarios, `trip-cover-overflow`, `create-trip` -- expected: pass.
- Parent invokes build-validator (lint, types, build, coverage alone, affected E2E alone). No automatic full E2E.

**Result:** Built. All matrix rows covered by passing tests. Final validator: lint PASS (existing warnings only), TypeScript PASS, production build PASS (21 static pages), coverage PASS (7,851 tests; 98% lines, 97.57% functions, 93.92% branches), affected E2E PASS (643 tests). Targeted checks included 374 feature unit tests, both repaired day-planning scenarios, and 111 API access-matrix cases. Four review lenses completed; all patch findings resolved, four follow-ups recorded in deferred-work.md. No remote publication performed.
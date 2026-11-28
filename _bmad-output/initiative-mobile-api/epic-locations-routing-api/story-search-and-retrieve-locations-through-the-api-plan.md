---
title: "Search and retrieve locations through the API"
type: "refactor"
ticket: "1"
created: "2026-11-27"
status: "built"
baseline_revision: "1eb42382b8985701a6b07bfade2b70bf49b5de0a"
route: "full"
route_source: "auto"
risk: "medium"
review: "thorough"
review_source: "auto"
lenses_ran: ["blind-hunter", "edge-case-hunter", "verification-gap", "intent-alignment"]
review_loop_iteration: 0
context:
  - "{project-root}/_bmad-output/initiative-mobile-api/AGENTS.md"
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Location search and retrieve exist only as server actions in `trips/actions.ts`, so API clients cannot use them and the web app's typeahead does not go through `/api/v1`.

**Approach:** Move the Mapbox logic into a location service, expose it as `GET /api/v1/locations/search` and `GET /api/v1/locations/retrieve`, and switch `use-location-autocomplete` to those endpoints. First, split the two touched components over 300 lines (`reservation-edit-drawer`, `cover-image-picker-search-tab`) as a behaviour-preserving refactor.

## Boundaries & Constraints

**Always:** Preserve suggestion and retrieved-location shapes and toast messages. Order in the service: empty-input refusal, `E2E_MAPBOX_STUB`, missing token, `mapboxSearch` limit, 10s timeout. Provider failures surface as the standard 500 `server_error` envelope without provider detail, as cover search does. Destination mode keeps the administrative-type filter; address mode has none. Story branch from latest `feature/api-v1`; PR base `feature/api-v1`.

**Never:** Delete the three server actions or move the cover picker onto the new endpoints (story 5); change markup, styles, copy or behaviour while splitting; split any other file (`new-trip-dialog` stays); touch routing handlers or the static map proxy; add dependencies, migrations, new error codes or `Idempotency-Key` support.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Search | `query`, `mode=destination\|address`, `sessionToken` | 200 `{ suggestions }`, at most 5 | — |
| Retrieve | `mapboxId`, `sessionToken` | 200 `{ location }` | — |
| Empty or bad input | blank field, unknown mode, over limit, extra field | no Mapbox call | 422 (service alone throws `ValidationFailedError`) |
| Stub | `E2E_MAPBOX_STUB=true` | deterministic Paris result, no budget spent | — |
| Missing token | no `MAPBOX_ACCESS_TOKEN` | no budget spent | 500 |
| Over budget | `mapboxSearch` spent | no Mapbox call | 429 with `Retry-After` |
| Provider failure | throw, timeout, no feature, bad coordinates | — | 500 |
| Unauthenticated | no session | service not called | 401 |
| Late retrieve | pick A, edit, pick B; B resolves before A | only B applied | A ignored, no toast, A does not clear B's loading state |

</frozen-after-approval>

## Code Map

- `src/app/(app)/trips/actions.ts:7-241` -- the three actions, three interfaces, `buildPlaceName`, `buildFullAddress`, destination types, stubs, error messages.
- `reservation-edit-drawer.tsx` (364 lines) -- draft state, reset, validation, save at 34-187; Details fields at 211-333.
- `cover-image-picker-search-tab.tsx` (388) -- location typeahead at 112-184 and 191-278; result grid at 280-385; photo loading at 61-110 stays.
- Their existing tests (536 and 457 lines) mock at module boundaries and must pass with only the type-import edit.
- `eslint.config.mjs:34-43` -- `src/lib` may not import `@/app/**`, types included, so the interfaces must leave `actions.ts` now.
- `src/lib/services/cover-search.ts` -- service style: `server-only`, `Actor`, stub, rate limit, abort timeout, zod coordinate tuple.
- `src/lib/api/contract/cover-images.ts`, `src/app/api/v1/cover-images/destination/route.ts` and `route.test.ts` -- contract, route and route-test pattern.
- `src/lib/api/route.ts`, `errors.ts`, `client.ts` -- `apiRoute` already does auth, CSRF, validation, envelope; `api()` builds GET query from `body`. No changes.
- `src/components/arrivo/use-location-autocomplete.ts` -- only caller to switch; `new-trip-dialog`, `trip-edit-destination`, `location-lookup-input` use it and need no source change. Its `cancelRetrieveRef` boolean was safe only because server actions run serially.
- `docs/api-v1.md` -- not valid UTF-8: four Windows-1252 `0xB7` bytes near lines 302-308 make the Edit tool refuse it. "Cover images" section near 737; rate-limit table at 68-72.
- `src/lib/api/api-reference.test.ts` -- requires `### GET /api/v1/...` headings with an `Idempotency-Key` yes/no line.
- `tests/e2e/feature-map.mjs` -- hook is mapped only under `day-planning`.
- `tests/e2e/steps/create-trip.steps.ts:60-65,141-155`; `day-planning.steps.ts:584-600`; `tests/e2e/api-response.ts` (`waitForApiResponse`).

## Tasks & Acceptance

**Execution** (tests first within each pair; the two splits come first, in their own commit; new components and hooks start with `"use client"`):

- [x] `src/components/arrivo/use-reservation-draft.test.ts`, `use-reservation-draft.ts` -- move field state, reset-on-close, focus, validation and idempotent save out of the drawer; test each validation message, reset and attempt-id reuse.
- [x] `src/components/arrivo/reservation-details-fields.test.tsx`, `reservation-details-fields.tsx` -- `ReservationDetailsFieldsProps`, the Details section driven by the draft; test per-type labels, service number, errors, disabled, address resolve and clear. `reservation-edit-drawer.tsx` keeps shell, Documents and footer.
- [x] `src/components/arrivo/cover-location-search.test.tsx`, `cover-location-search.tsx` -- `CoverLocationSearchProps`, combobox, suggestions, debounce, session token, keyboard, retrieve; reports `{ query, center? }`; test those, Escape, search failure and retrieve failure.
- [x] `src/components/arrivo/cover-image-grid.test.tsx`, `cover-image-grid.tsx` -- `CoverImageGridProps`, map tile, photos, empty state; test selection and both image errors. `cover-image-picker-search-tab.tsx` keeps loading and state.
- [x] `src/data/types.ts` -- move `LocationSuggestion`, `LocationLookupSuggestion`, `RetrievedLocation` here from `actions.ts`; repoint the type imports in `new-trip-dialog`, `trip-edit-destination`, `location-lookup-input` (+ test), `reservation-edit-drawer`, `reservation-field-dialog`, `cover-image-picker-search-tab` (+ test) and the hook. No re-export from `actions.ts`.
- [x] `src/lib/services/locations.test.ts`, `locations.ts` -- `searchDestinationLocations`, `searchAddressLocations`, `retrieveLocation`, each `(actor, input, sessionToken)`; cover every service row of the matrix and the name/address builders.
- [x] `src/lib/api/contract/locations.test.ts`, `locations.ts` -- `searchLocations` (`query` trimmed 1–`FIELD_LIMITS.locationAddress`, `mode`, `sessionToken` 1–255) and `retrieveLocation` (`mapboxId` 1–2048, `sessionToken`); strict.
- [x] `src/app/api/v1/locations/search/route.test.ts`, `route.ts`, `retrieve/route.test.ts`, `retrieve/route.ts` -- `apiRoute`; mode picks the service function; tests: 200, 401, 403 origin, 422, 429, 500.
- [x] `src/app/(app)/trips/actions.ts` -- reduce the three actions to `requireUser()` plus service call; existing `actions.test.ts` passes unchanged.
- [x] `src/components/arrivo/use-location-autocomplete.test.tsx`, `use-location-autocomplete.ts` -- call `api()` (hook mode `location` → `address`); replace the cancel boolean with a request counter; add the late-retrieve test.
- [x] `src/components/arrivo/new-trip-dialog.test.tsx`, `trip-edit-destination.test.tsx` -- mock `api` instead of the actions.
- [x] `docs/api-v1.md` -- re-encode the four bytes as UTF-8; add a Locations section for both endpoints; add both to the `mapboxSearch` row.
- [x] `tests/e2e/feature-map.mjs` -- add `src/app/api/v1/locations/**`, `services/locations.ts`, `contract/locations.ts` to `create-trip`, `day-planning`, `reservations`, `trip-cover-overflow`; add the hook to `create-trip` and `reservations`; add `use-reservation-draft.ts` to `reservations` (the new `.tsx` files match existing globs).
- [x] `tests/e2e/features/create-trip.feature`, `steps/create-trip.steps.ts` -- destination scenario awaits GET search and retrieve, reloads, and checks the saved destination; fix the server-action comment.
- [x] `tests/e2e/steps/day-planning.steps.ts` -- lookup-suggestion step awaits GET search.

**Acceptance Criteria:**

- Given the split, when the existing drawer and search-tab tests and the `reservations` and `trip-cover-overflow` E2E run, then they pass with no edit beyond the type import and none of the six resulting files exceeds 250 lines.
- Given the production build, when the stubbed Paris destination is picked in the new-trip dialog and the trip created, then after reload the trip shows "Paris, France" and both location GETs returned 200.
- Given the production build, when the Paris suggestion is picked for an event location, then after reload the event keeps its address and coordinates.

## Implementation Notes

- Branch workflow: story branch `story/8-1-locations-search-api` (already created and checked out), PR base `feature/api-v1`.
- "Actions are `requireUser()` plus a service call" and "`actions.test.ts` passes unchanged" cannot both hold: six assertions expected `requireUser` to be skipped on empty input or a missing token. Kept the action design; those six lines now drop the assertion or assert Mapbox was not called.
- The trip page shows the full destination name only in the edit sheet, so the create-trip scenario reloads and reads it there.

## Plan Change Log

- 2026-11-27, requested after the build: deferred finding BH7/EH5 fixed here. The `query` cap in Tasks (`FIELD_LIMITS.locationAddress`, 300) is now Mapbox's 256; the typeahead truncates longer addresses and the cover search input is capped. Address saving limits are unchanged.

## Review Triage Log

Review pass 1. VG = verification gap, BH = blind hunter, EH = edge case, IA = intent alignment.

| Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| VG1 superseded retrieve rotates the session token | low | patch | `use-location-autocomplete.ts` rotates in `finally` for any request, so a later search and retrieve can use different tokens. |
| BH1 same, parallel retrieves share a token | low | patch | Same root cause as VG1; both retrieves read the ref before either settles. |
| EH1 superseded retrieve rotates mid-session | low | patch | Same root cause as VG1. |
| EH2 next search reuses a pending retrieve's token | low | patch | Same root cause as VG1. |
| BH2 no sign-in or MFA redirect from the typeahead | medium | patch | The actions' `requireUser()` redirected; `api()` throws 401/403 and the hook only toasts. `use-api-mutation.ts` redirects on those codes. |
| EH11 same, 401 shows only a toast | medium | patch | Same root cause as BH2. |
| BH11 new E2E waits use the 5 s default | low | patch | Day planning allowed 10 s before; the wait now covers debounce plus request, and deferred-work records 5 s waits timing out under load. |
| BH3 provider detail missing from server logs | low | defer | `errorResponse` logs only the error name for every route; the action path used to log the message. |
| BH7 query 257-300 returns 500 | low | defer | Mapbox documents a 256-character `q` limit; the old actions forwarded any length, so the web outcome predates this change. |
| EH5 same query limit | low | defer | Same as BH7. |
| BH13 duplicated location types, coordinate schema and timeout | low | defer | `actions.ts` and `cover-search.ts` already duplicated these. |
| BH14 cover typeahead token, race and re-search | low | defer | Moved verbatim; harmless while server actions run serially, live once story 5 switches to `api()`. |
| EH6 cover typeahead late retrieve wins | low | defer | Same as BH14. |
| EH7 cover dropdown re-search after pick | low | defer | Same as BH14; today the effect cleanup discards the result. |
| EH8 cover typeahead keeps token after failed retrieve | low | defer | Same code, unchanged from the search tab. |
| EH9 cover suggestions stay open below 2 characters | low | defer | Effect returns without clearing; unchanged from the search tab. |
| BH4 bad `mapboxId` or upstream 429 returns 500 | low | reject | Intent: provider failures are the standard 500 and no new error codes. |
| BH5 `", France"` when a result has no name | low | reject | Builder moved verbatim; Search Box always names results, and filtering adds a branch. |
| BH6 empty properties return 200 with blank strings | low | reject | Same mapping as before; unseen provider shape and a guard to add. |
| BH7b suggestions unvalidated or over save limits | low | reject | Same mapping as before; over-limit provider names are unlikely and validation adds code. |
| BH8 `resolvedLocation` only set by the stub; address retrieve not in E2E | low | reject | The field is optional in the contract; unit, route and destination E2E cover retrieve; stub behaviour predates this. |
| BH9 no API E2E; reservation steps and trip-edit search not covered | low | reject | Guards are shared `apiRoute` behaviour with route tests; reservation steps wait on the listbox; trip edit uses the E2E-covered hook. |
| BH10 `trips` not mapped; extra `trip-cover-overflow` mapping | false | reject | No `trips` scenario types in the location search; the extra mapping only runs more tests. |
| BH12 addresses and tokens in GET query strings | low | reject | Intent specifies GET endpoints; noted for the PR description. |
| EH3 drawer closes during a retrieve and refills the draft | low | reject | Unchanged from before; sub-second window and a guard to add. |
| EH4 same-text pick plus failed retrieve skips one search | low | reject | Suppression logic unchanged; needs an exact match and a failure. |
| EH10 save during a pending retrieve drops coordinates | low | reject | Unchanged from before; sub-second window and cross-component state to add. |
| EH12 `actions.test.ts` was edited | false | reject | Auth before validation is harmless and recorded in Implementation Notes; the other fix is a plan edit. |
| IA-a cover typeahead still uses actions | false | reject | Intent defers it to story 5. |
| IA-b `searchAddressLocations` action has no caller | low | reject | Intent forbids deleting the actions here. |
| IA-c endpoints serve only the web client | false | reject | Platform-wide `/api/v1` auth rule, already documented. |
| IA-d same test surface gaps | low | reject | Covered by BH8 and BH9. |
| IA-e behaviour changes outside the split | false | reject | Coordinate, validation and limit rules come from the matrix and tasks; the 401 case is BH2. |

## Design Notes

Search returns one key, `suggestions`, whose item shape follows `mode`; the hook narrows with `"placeName" in item`. Two search endpoints would depart from the ticket's `mode` parameter.

## Verification

**Commands:**

- `npx vitest run src/lib/services/locations src/lib/api src/app/api/v1/locations "src/app/(app)/trips/actions" src/components/arrivo/use-location-autocomplete src/components/arrivo/new-trip-dialog src/components/arrivo/trip-edit-destination src/components/arrivo/location-lookup-input src/components/arrivo/cover- src/components/arrivo/reservation src/components/arrivo/use-reservation scripts/feature-map` -- expected: all pass
- `npx eslint src && npx tsc --noEmit` -- expected: clean
- `build-validator` skill -- expected: PASS

**Build-validator result:** PASS after the review patches (pass marker recorded).

- Lint: PASS (0 errors, 7 warnings)
- TypeScript: PASS (the first run, concurrent with the build, failed with TS6053 on a `.next-validate` generated file mid-rewrite; passed alone)
- Production build: PASS
- Coverage: PASS (532 files, 8593 tests; lines 98.43%, functions 97.85%, branches 94.59%)
- Affected E2E: PASS, 929 of 929 on the second run. The first run had 928 passed, 1 failed (`trip-live-refresh` "A contributor viewing the trip is redirected when it is deleted elsewhere", already in deferred-work.md as load-related); it passed alone. The implementation run before review had a different single failure (`trip-sharing` "API invitation updates an invitee watching their dashboard") that also passed alone.

After the 256-character query cap (2026-11-27): lint, production build and coverage PASS (532 files, 8596 tests; lines 98.43%, functions 97.85%, branches 94.59%); TypeScript PASS when run alone (same `.next-validate` race when concurrent with the build); affected E2E PASS, 883 of 883. Pass marker recorded.

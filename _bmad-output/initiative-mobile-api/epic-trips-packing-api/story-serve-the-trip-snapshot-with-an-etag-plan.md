---
title: "Serve the trip snapshot with an ETag"
type: feature
ticket: 8
created: 2026-11-20
status: done
baseline_revision: "d263e78b0525f8ddcc016abeeee04098f3506e92"
route: oneshot
route_source: auto
risk: medium
review: 'quick'
review_source: 'auto'
lenses_ran: ['quick']
review_loop_iteration: 0
context: ["{project-root}/_bmad-output/initiative-mobile-api/AGENTS.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** API clients have no way to read a whole trip; only pages call `getTripDetail` directly, and a polling client would re-download an unchanged trip.

**Approach:** Add `GET /api/v1/trips/:tripId` returning `TripDetailPayload` with a strong `ETag` hashed from the serialized payload, answering `304` when `If-None-Match` matches. Pages keep their direct reads.

</frozen-after-approval>

## Code Map

- `src/lib/api/route.ts` — `apiRoute`; add an opt-in `etag` option for GET that hashes the serialized result (sha256), sets `ETag` and `Cache-Control: private, no-cache`, and returns `304` (no body, same headers) on a matching `If-None-Match` (list, `W/` prefix and `*` tolerated).
- `src/lib/api/contract/trips.ts` — add `getTrip` endpoint (`GET /api/v1/trips/:tripId`, empty strict body, `defineEndpoint<TripDetailPayload>`).
- `src/lib/services/trips.ts` — add `getTrip(actor, tripId)`: `requireTripRole(..., "viewer")` then `getTripDetail`; `null` → `TripNotFoundError`.
- `src/app/api/v1/trips/[tripId]/route.ts` — export `GET = apiRoute(getTrip, ..., { etag: true })`.
- `docs/api-v1.md` — document the endpoint and the `Cache-Control` exception; `tests/e2e/feature-map.mjs` already globs `src/app/api/v1/trips/*/route.ts` for `api`.

## Tasks

- [ ] Tests first: `src/lib/api/route.test.ts` (ETag stable, differs on change, 304 on match/list/weak/`*`, 200 on mismatch, no ETag without option), `src/lib/api/contract/trips.test.ts`, `src/lib/services/trips.test.ts` (viewer ok, stranger 404, missing trip 404), `src/app/api/v1/trips/[tripId]/route.test.ts` (GET registered with `etag: true`).
- [ ] `tests/e2e/features/api.feature` + `steps/api-trip-snapshot.steps.ts` — stable ETag, write changes it, 304 on match, viewer payload, stranger 404.
- [ ] Implement route option, contract, service, route handler; update `docs/api-v1.md`.

## Acceptance Criteria

- Given an unchanged trip, when fetched twice, then the `ETag` is identical; after any write it differs.
- Given a matching `If-None-Match`, when fetched, then `304` with no body.
- Given a viewer, then the payload returns; given a non-member, then `404`. Trip pages still read directly and never call the endpoint.

## Implementation Notes

Oneshot: production change is under 100 lines across five files. Branch `story/5-8-trip-snapshot-etag-api`, PR base `feature/api-v1`.

## Verification

**Commands:**

- `npx vitest run` on touched files -- expected: pass
- `npm run test:e2e:affected` -- expected: pass (via `build-validator`)

## Review Triage Log

- `[medium]` `[patch]` `docs/api-v1.md` new section had Latin-1 `·` bytes, making the file invalid UTF-8 — rewritten as UTF-8.
- `[low]` `[patch]` `getTripDetail` calls `notFound()` if access is lost after the role check, which would surface as a non-404 — mapped to `TripNotFoundError`, with tests.
- `[low]` `[patch]` Docs said the tag differs after "any write" — now "any write that changes the payload".
- `[low]` `[reject]` Unordered selects in `getTripDetail` could reorder rows after unrelated writes — worst case is an extra 200, never a wrong 304; touching page queries is out of scope.
- `[low]` `[patch]` Plan named `api.steps.ts`; plan updated to the real steps file.

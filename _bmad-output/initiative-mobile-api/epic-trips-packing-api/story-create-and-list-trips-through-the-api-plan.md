---
title: "Create and list trips through the API"
type: feature
ticket: 9
created: 2026-11-20
status: done
baseline_revision: "b1f46dcca89815a3158209168fe0dda5a6e94114"
route: full
route_source: auto
risk: medium
review: 'thorough'
review_source: 'auto'
lenses_ran: [blind-hunter, edge-case-hunter, verification-gap, intent-alignment]
review_loop_iteration: 0
context: ["{project-root}/_bmad-output/initiative-mobile-api/AGENTS.md", "{project-root}/docs/decisions/adr-api-service-boundaries.md"]
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Trip creation is a web-only server action (`createTrip` in `trips/actions.ts`) with no replay safety, and API clients cannot list their trips.

**Approach:** Add `POST /api/v1/trips` (client UUID `id`, `Idempotency-Key`) backed by a `createTrip` service that keeps the existing cover search and Mapbox tile code unchanged but runs it only when the row is first created, plus API-only `GET /api/v1/trips` over `listTripsForUser`. Switch the new-trip dialog caller to the endpoint and retire the server action.

## Boundaries & Constraints

**Always:** Service takes `Actor` and unknown input, parses with the contract, and never reads headers (the route passes `accept-language` in). Reuse `createTripWrite` (owner row lock), `recordTripCreated`, `withIdempotency`, `lockClientIds("trip:<id>")`, `buildDayRows`/`buildDatelessDayRow` (45-day cap), `assertValidCoverImageUrl`. Cover generation runs after commit and never fails the create. "Now" is `getNow()`. Same-id row with the same content returns the current row with no write and no cover work; different content is 409 `conflict`; an id owned by a trip the caller cannot see is 404. Trips page keeps reading `listTripsForUser` directly.

**Never:** Change cover search/tile behavior, add `coverImageUrl` to the body, touch schema or env, migrate `deleteTrip` or location-search actions, add the list to the web UI, or store trip status.

## I/O & Edge-Case Matrix

| Scenario         | Input / State                                    | Expected Output / Behavior                            | Error Handling                |
| ---------------- | ------------------------------------------------ | ----------------------------------------------------- | ----------------------------- |
| Create           | New `id`, valid body                             | 200 `Trip`, owner is manager, days built, cover set  | No error expected             |
| Replay same key  | Same key, same body                              | Stored response, no second cover upload              | No error expected             |
| Same id retry    | Same `id`, new key, same content                 | Current row, no write, no cover work                 | No error expected             |
| Id reused        | Same `id`, different name                        | None written                                          | 409 `conflict`                |
| Foreign id       | `id` of a trip the caller cannot see             | None written                                          | 404 `not_found`               |
| Bad range        | Over 45 days or end before start                 | None written                                          | 422 `validation_failed`       |
| Cover failure    | Search or tile throws                            | Trip created without that cover                      | Logged, not surfaced          |
| List             | User with owned and shared trips                 | `{ trips: TripListEntry[] }`, status from `getNow()` | Strangers' trips never appear |

</frozen-after-approval>

## Code Map

- `src/lib/membership-writes.ts` -- `createTripWrite(database, ownerId, prepare)` opens its own transaction; give `prepare` an optional client `id` (trip insert) and let it run inside the caller's transaction (accept a transaction-like `database` or a `tx` variant).
- `src/app/(app)/trips/actions.ts` -- `createTrip` body is the source of the prepare logic, currency/transit resolution and cover block; move it, then delete the action and its now-unused imports. `deleteTrip`, location search stay.
- `src/lib/services/trips.ts` -- add `createTrip`, `listTrips`; pattern from `createPackingList` in `services/packing.ts` (lockClientIds, existing-row compare, `runTripWrite`-style idempotency).
- `src/lib/services/trip-cover-generation.ts` (new) -- extracted cover block: graphic, Mapbox tile (`getStorageAdapter().put`), `searchCoverImages`; returns the update or null.
- `src/lib/api/contract/trips.ts` -- add `createTrip` (POST `/api/v1/trips`, strict body `{ id: z.uuid().toLowerCase(), ...createTripSchema fields }`, `destinationCenter` kept) and `listTrips` (GET, empty strict body, `{ trips: TripListEntry[] }`).
- `src/app/api/v1/trips/route.ts` (new) -- `POST` with `{ idempotent: {} }`, `GET`; reads `accept-language` via `headers()`.
- `src/lib/queries.ts` -- `listTripsForUser(userId, now)`, reused unchanged.
- `src/app/(app)/trips/use-trips-page-handlers.ts` -- `submitCreateTrip` swaps the action for `useApiMutation(createTrip)`; one UUID per draft, reused on retry; push `/trips/<id>?new=1`.
- `src/lib/api/use-api-mutation.ts`, `docs/api-v1.md`, `tests/e2e/feature-map.mjs` -- hook reference; docs sections; register new files under `api` and `create-trip`.

## Tasks & Acceptance

**Execution:**

- [ ] Tests first: `src/lib/services/trips.test.ts` (create, replay, same-id retry, id reuse 409, foreign id 404, 45-day 422, cover only on first create, list scoping), `trip-cover-generation.test.ts`, `src/lib/membership-writes.test.ts`, `src/lib/api/contract/trips.test.ts`, `src/app/api/v1/trips/route.test.ts`, `use-trips-page-handlers.test.tsx`; drop `createTrip` cases from `actions.test.ts`
- [ ] `tests/e2e/features/api.feature` + new `steps/api-create-trip.steps.ts`: replayed UUID returns one trip and one cover upload; list shows only accessible trips; `create-trip.feature` and `new-trip.feature` keep passing through the endpoint
- [ ] `membership-writes.ts`, `trip-cover-generation.ts`, `services/trips.ts`, contract, route -- implement
- [ ] `use-trips-page-handlers.ts`, `actions.ts` -- switch caller, retire action
- [ ] `docs/api-v1.md`, `feature-map.mjs` -- document `POST`/`GET /api/v1/trips`, register files

**Acceptance Criteria:**

- Given the new-trip dialog, when the user submits a valid draft, then the trip is created through `POST /api/v1/trips` and the browser opens `/trips/<id>?new=1`.
- Given a replayed `Idempotency-Key` or reused `id`, when the request repeats, then the same trip returns and storage receives no second cover upload.
- Given a user with owned, shared and unrelated trips, when listing, then only owned and shared trips return, with status from `getNow()`.

## Implementation Notes

## Plan Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
| --- | --- | --- | --- |
| Hook uses `crypto.randomUUID` (edge-case) | high | patch (fixed) | Undefined over plain HTTP; `createRandomId` in `utils.ts` exists for it. Now used, test added. |
| Docs "every field sent" vs `destinationCenter`/tag order (blind) | low | patch (fixed) | `isSameTrip` ignores center, compares tags in order; docs sentence amended. |
| e2e "wrote nothing new" accepts one same-name row (verification-gap) | low | defer | Status assertion plus unit tests guard realistic regressions. |
| Unsupported account currency gives 422 (blind, edge) | low | defer | Pre-existing `resolveBudgetCurrency` behavior moved from the old action. |
| Orphaned tile on cover save failure; unconditional cover update (blind, edge) | low | defer | Same sequence as the old action; no concurrent writer inside the awaited request. |
| Cover fetch has no timeout (blind, edge) | low | defer | Pre-existing fetch code the intent says to keep unchanged. |
| `budgetTotal` rounding gives spurious 409 (edge) | low | defer | Needs more decimals than the column keeps. |
| lib imports `@/app/(app)/trips/create-trip-days` (blind) | low | defer | Helper placement predates this change; move is wider than a direct fix. |
| Unbounded list, no per-user create limit (blind, edge) | false | rejected | Intent specifies plain `listTripsForUser`; no limit requirement. |
| Collaborator gets 200 on same-id same-content (edge) | false | rejected | Intent: same-id same-content returns the row; 404 only when not visible. |
| Edited draft after lost response mints new id (edge) | low | rejected | Rare; fix adds state. |
| `recordTripCreated` unguarded (edge, blind) | false | rejected | Fire-and-forget activity recorder, not shown to throw. |
| Dead `createTripWrite`, 422 generic toast, plan staleness, doc gaps (edge, blind) | low | rejected | Cosmetic or plan-edit fixes. |

## Design Notes

Cover work runs after the commit, so a stored replay envelope holds the pre-cover `Trip`; a same-`id` retry reads the live row and returns the covered trip. Locale currency fallback needs `accept-language`, so the route passes it as a service option instead of the service reading headers.

## Verification

**Commands:**

- `npx vitest run` on touched files -- expected: pass
- `npm run test:e2e:affected` -- expected: pass (via `build-validator`)

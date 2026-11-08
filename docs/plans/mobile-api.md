# Mobile API plan (`/api/v1`)

Status: proposal. Each phase below becomes one or more `bmad-build` stories, and each story goes through
`/plan-reviewer` before implementation.

## Why

A native client (Expo, Capacitor, or anything else) can't use the web app's data paths:

- Writes go through 119 server actions in 15 `actions.ts` files. Their wire IDs change every build, they redirect on
  auth failure, and they need Next's router.
- Reads happen in Server Components (`page.tsx` → `src/lib/queries.ts`).
- Auth is an Auth.js JWT cookie; `requireUser()` redirects to `/sign-in` and `src/proxy.ts` redirects every
  unauthenticated non-public path.

The API must not fork business rules. Today those rules live inline in the actions (`createEvent` holds the trip lock,
position shifting, activity, live-sync publish, revalidation), so the main work is moving them somewhere both paths
can call.

## Goals and non-goals

Goals:

- One versioned JSON API under `/api/v1` that covers what a phone needs: sign-in, trip list, a full trip snapshot
  for offline use, documents, live updates, and the writes a traveller makes on the go.
- Same authorization, validation, activity log and live sync as the web, by construction.
- Offline-friendly writes: safe to replay after days offline.
- Revocable per-device sessions that show up beside browsers in Profile → Security.
- No new containers, secrets or Postgres settings: self-hosting stays "two containers, no `.env`".

Non-goals for v1:

- Moving the web UI onto the API. Server actions stay; both call the same services.
- Admin, overview, security policy, user management, account setup/reset/recovery, MFA enrollment, sharing
  management, packing templates, profile editing, cover images. These stay web-only; the API returns a web URL
  where the app needs to send someone.
- Third-party API keys and a public developer API. (Personal access tokens are a cheap follow-on; see phase 4.)
- Incremental delta sync. v1 refetches whole trip snapshots with an ETag (see "Sync").

## Architecture

### 1. Service layer

New modules under `src/lib/services/` (e.g. `trip-read.ts`, `checklists.ts`, `packing.ts`, `notes.ts`,
`events.ts`, `reservations.ts`, `expenses.ts`, `documents.ts`, `invitations.ts`). Each function:

```ts
export async function createEvent(actor: Actor, dayId: string, rawInput: unknown): Promise<TripEvent>;
```

- Takes an `Actor` (`{ userId }`), never reads cookies or headers.
- Validates with the existing zod schemas in `src/lib/validation-schemas.ts` (one source for web and API).
- Checks access with a throwing variant, `requireTripRole(tripId, userId, minRole)`, which throws
  `TripAccessDeniedError` instead of calling `notFound()`.
- Runs the transaction (trip lock, positions) and then one shared `afterTripWrite(actor, tripId, kind)`: activity
  (`recordTripUpdated`), live sync (`publishItineraryChanged` and friends), and `revalidatePath`. Phone edits then
  appear live on the web and in Activity.
- Returns the mapped row (through `src/lib/db-mappers.ts`), so the API can echo it.

Server actions become thin adapters: `requireUser()` → service → map `TripAccessDeniedError` to `notFound()`. The
AGENTS.md rule (actions call `requireUser` and check trip access before any read or write) still holds at the action
edge. API handlers map the same error to a 404 JSON body.

Extraction is incremental and only for what the API needs. Existing web unit tests and E2E features must stay green
at every step: they are the regression net for the refactor.

`getTripDetail` in `src/lib/queries.ts` already returns the full `TripDetailPayload` (days, events, docs, packing,
reservations, expenses, notes, collaborators, access role). It becomes the trip snapshot as-is.

### 2. Route handlers and shared helpers

`src/app/api/v1/**/route.ts`, each wrapped in one helper, `apiRoute(options, handler)` in `src/lib/api/route.ts`, that:

- authenticates (`requireApiUser(request)` → bearer token, 401 JSON on failure; never redirects);
- applies the `api` rate-limit bucket per session (`src/lib/rate-limit.ts`);
- parses JSON with a size cap;
- applies idempotency for mutations (see below);
- maps errors to the envelope below and sets `Cache-Control: no-store`.

A unit test walks `src/app/api/v1/**/route.ts` and fails if any exported handler isn't built with `apiRoute`
(unless it's on an explicit public list: `meta`, `auth/token`, `auth/token/mfa`). That matters because:

- `/api/v1` is added to `PUBLIC_PATHS` in `src/proxy.ts`. The proxy only knows cookies and would redirect a bearer
  request to `/sign-in`, so authentication happens in the handler, and the test guarantees every handler does it.

No CORS headers: native clients don't need them, and leaving them off keeps browsers from calling the API
cross-origin with a token.

### 3. Authentication

Opaque, per-device bearer tokens, stored hashed. No JWT and no refresh token.

Why opaque rather than JWT: web sessions already hit the database on every `auth()` call
(`getSessionState`) to support "sign out everywhere" and "remove this browser". A hashed token lookup costs the same
query, revokes instantly, and needs no extra secret or rotation story.

Schema (one migration): `api_sessions`

| column                                     | notes                                                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `id` uuid pk                               |                                                                                                 |
| `user_id` uuid → users cascade             |                                                                                                 |
| `device_id` uuid → trusted_devices cascade | removing the device in Profile → Security deletes the session                                   |
| `token_hash` text unique                   | SHA-256 of a 32-byte random token                                                               |
| `label` text                               | "Arrivo for iOS · Sam's iPhone"                                                                 |
| `session_version` int                      | must equal `users.session_version`, so "sign out everywhere" and password/MFA changes revoke it |
| `created_at`, `last_used_at`, `expires_at` | sliding expiry (proposal: 90 days idle); `last_used_at` written at most once an hour            |

Flow:

1. `POST /api/v1/auth/token` `{ username, password, deviceName, deviceToken? }`
   - Runs the same gate as the web: `authorizeCredentials` (throttle, lockout, dummy-hash timing, MFA ticket). The
     web-only cookie parts are factored out: the device token arrives in the body and is returned in the response
     instead of being set as `arrivo_device`.
   - Returns `200 { token, expiresAt, user, deviceToken }`, `401 invalid_credentials`,
     `401 mfa_required { ticket }`, `429 locked_out` with `Retry-After`, or
     `403 mfa_enrollment_required { url }` (enrollment stays on the web in v1).
2. `POST /api/v1/auth/token/mfa` `{ ticket, code, remember }` → same responses as step 1, minus `mfa_required`.
3. `DELETE /api/v1/auth/token` signs this device out (deletes the row).
4. Profile → Security lists API sessions beside browsers, labelled as apps, with "Sign out".

The app keeps the token in the OS keychain (`expo-secure-store` or equivalent) and the device token alongside it, so
MFA "remember this device" and the per-device failure budget work as they do in browsers.

Bearer-only in v1. Accepting the cookie on `/api/v1` mutations would need CSRF/origin checks that server actions get
for free; not worth it until the web itself uses the API.

### 4. Conventions

- **Versioning:** path-versioned (`/api/v1`). Changes inside v1 are additive only.
  `GET /api/v1/meta` (public) returns `{ apiVersion, serverVersion, capabilities: string[], minClientVersion? }`.
  Self-hosted servers lag the app, so the app gates features on `capabilities`, not on version numbers.
- **Shapes:** domain types from `src/data/types.ts`, produced by `db-mappers.ts`. ISO 8601 dates, minutes for
  durations, money as numbers (the mappers already parse Postgres numeric strings). Writes use the zod schemas the
  actions use.
- **Errors:** `{ "error": { "code": "...", "message": "...", "fields"?: { name: [messages] } } }`

  | status | code                                                                               |
  | ------ | ---------------------------------------------------------------------------------- |
  | 400    | `bad_request` (malformed JSON, wrong shape)                                        |
  | 401    | `unauthenticated`, `invalid_credentials`, `mfa_required`                           |
  | 403    | `mfa_enrollment_required`                                                          |
  | 404    | `not_found` (also returned when access is denied, matching the web's `notFound()`) |
  | 409    | `conflict` (structural: e.g. the target day was removed)                           |
  | 413    | `payload_too_large`                                                                |
  | 422    | `validation_failed` with `fields`                                                  |
  | 429    | `rate_limited`, `locked_out` (+ `Retry-After`)                                     |
  | 500    | `server_error` (no internals in `message`)                                         |

- **Replay-safe writes** (needed because the app queues writes offline and retries):
  - Creates accept a client-generated UUID `id`. Retrying the same create is a no-op that returns the row. This also
    lets the app reference the new row offline before it syncs.
  - Updates are `PATCH` with partial bodies: only fields present change. (Today `updateEvent` nulls any field not
    sent; the service supports partial patches and the action keeps sending full objects.)
  - Replace toggles with absolute values: the API sets `isChecked: true`, never "toggle". (Today `toggleChecklistItem`
    and `togglePackingItem` flip the current value, which goes wrong when a request is replayed.)
  - Deletes of a missing row return `204`, not `404`.
  - Order changes send the full ordered ID list (`PUT /days/:dayId/order { itemIds }`), so the last write wins
    cleanly.
  - `Idempotency-Key` header on every mutation, stored with the response in `idempotency_keys` (already exists and
    is used by packing). Generalised into `withIdempotency()` in `src/lib/api/idempotency.ts`; window raised from
    24 hours to 14 days for API keys, since a phone can be offline for a whole trip.
- **Conflicts:** last write wins per field for v1, and the response always returns the stored row so the app can
  reconcile. No optimistic-concurrency tokens yet; add `If-Match` later if real conflicts show up.
- **Rate limits:** new `api` bucket (per session) in `RATE_LIMITS`. Auth endpoints use the existing auth throttle.
  Mapbox proxies keep their own buckets.

### 5. Sync

v1 uses snapshots, not deltas:

- `GET /api/v1/trips/:tripId` returns `TripDetailPayload` with `ETag` = hash of the serialized payload. The app sends
  `If-None-Match`; unchanged trips cost one query set and a `304`, with no payload transfer.
- After replaying its queued writes, the app refetches the affected trips.
- Live updates: `GET /api/v1/trips/:tripId/stream` and `GET /api/v1/me/stream` reuse
  `createLiveSyncResponse` (SSE) with bearer auth. A change event means "refetch", which the ETag makes cheap. The
  app can also just refetch when it comes to the foreground.
- Files: `GET /api/v1/files/*key` serves storage objects with the same access rules as `/api/storage` (logic
  extracted into `src/lib/storage/`), plus `ETag` and `Cache-Control: private`, so the app can keep documents on
  the device.

Why not deltas yet: a trip snapshot is a few hundred rows. Deltas need `updated_at` on every synced table (only 8
tables have it today), tombstones for deletes (none exist, and 32 foreign keys cascade, so removing a day silently
deletes its events), and a commit-ordered cursor. Phase 4 covers that if measured payloads justify it.

## Endpoints

Phase 1: read-only foundation

| method | path                    | backs onto                                       |
| ------ | ----------------------- | ------------------------------------------------ |
| GET    | `/meta`                 | version + capabilities (public)                  |
| POST   | `/auth/token`           | `authorizeCredentials` (public)                  |
| POST   | `/auth/token/mfa`       | second-factor path (public)                      |
| DELETE | `/auth/token`           | delete this API session                          |
| GET    | `/me`                   | profile, app role, MFA state                     |
| GET    | `/me/stream`            | user live-sync channel (invitations, revocation) |
| GET    | `/trips`                | `listTripsForUser(userId, getNow())`             |
| GET    | `/trips/:tripId`        | `getTripDetail` + ETag                           |
| GET    | `/trips/:tripId/stream` | trip live-sync channel                           |
| GET    | `/files/*key`           | storage read with trip access check              |

Phase 2: offline-safe writes (what a traveller does with no signal)

| method            | path                                                 |
| ----------------- | ---------------------------------------------------- |
| POST/PATCH/DELETE | `/trips/:tripId/checklists`, `/checklists/:id`       |
| POST/PATCH/DELETE | `/checklists/:id/items`, `/checklist-items/:id`      |
| POST/PATCH/DELETE | `/trips/:tripId/packing-items`, `/packing-items/:id` |
| POST/PATCH/DELETE | `/trips/:tripId/notes`, `/notes/:id` (trip notes)    |
| POST/PATCH/DELETE | `/events/:eventId/notes`, `/event-notes/:id`         |
| POST/PATCH/DELETE | `/days/:dayId/events`, `/events/:id`                 |
| PUT               | `/days/:dayId/order`                                 |

Phase 3: remaining mobile writes

| method                        | path                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| POST/PATCH/DELETE             | `/trips/:tripId/reservations`, `/reservations/:id`                                                    |
| POST/PATCH/DELETE             | `/trips/:tripId/expenses`, `/expenses/:id`                                                            |
| POST (multipart)/PATCH/DELETE | `/trips/:tripId/documents`, `/events/:id/documents`, `/documents/:id` (rules from `upload-policy.ts`) |
| GET/POST                      | `/me/invitations`, `/invitations/:id/accept`, `/invitations/:id/decline`                              |
| POST/PATCH                    | `/trips`, `/trips/:tripId` (create, edit details)                                                     |
| PATCH                         | `/days/:dayId`                                                                                        |
| POST                          | `/locations/search`, `/locations/retrieve` (Mapbox proxy, rate-limited)                               |
| POST                          | `/trips/:tripId/routing/{distance,day-summary,conflicts}` (wrap existing handlers)                    |

## Phases and stories

**Phase 0: decisions.** Record ADRs in `docs/decisions/`:

- opaque per-device API tokens over JWT;
- service layer with throwing access checks, mapped to `notFound()` at the action edge;
- snapshot + ETag sync for v1;
- replay-safe write rules (client UUIDs, partial PATCH, absolute values, idempotency window).

**Phase 1: foundation (read-only API).** Suggested stories:

1. Service-layer pattern + `requireTripRole` / `TripAccessDeniedError` + `afterTripWrite`, proven on one action pair
   (checklist items), with no behaviour change on the web.
2. `src/lib/api/*`: `apiRoute`, error envelope, `requireApiUser`, `api` rate-limit bucket, the "every v1 handler uses
   `apiRoute`" test, `/api/v1` in `PUBLIC_PATHS`, `GET /meta`.
3. `api_sessions` migration; cookie-free refactor of `authorizeCredentials`'s device handling; token, MFA and
   sign-out endpoints; Profile → Security lists and revokes app sessions.
4. Read endpoints: `/me`, `/trips`, `/trips/:id` (ETag), `/files/*key`, the two SSE streams.

Exit: a scripted client can sign in (with MFA), list trips, download a trip and its documents, and see revocation
from the web take effect immediately.

**Phase 2: offline-safe writes.** One story per domain (checklists, packing, notes, events + order), each moving the
action body into a service, adding the endpoints, and adopting client UUIDs, partial PATCH, absolute values and
idempotency.

**Phase 3: remaining mobile writes.** Reservations, expenses, documents, invitations, trip create/edit, location
search, routing.

**Phase 4: optional, driven by evidence.**

- Delta sync: per-trip revision counter bumped under the trip lock, `updated_at` everywhere, trigger-written
  tombstones (so cascades are caught), `GET /trips/:id/changes?since=`.
- OpenAPI document generated from the zod schemas (`z.toJSONSchema`), checked in with a drift test.
- Personal access tokens for scripts.

## Testing

Per AGENTS.md, tests come first in each story:

- **Unit (Vitest, colocated):**
  - each `src/lib/services/*.ts` gets its `*.test.ts`;
  - `src/lib/api/*.test.ts` for auth, envelope, idempotency, rate limits;
  - `route.test.ts` beside each `src/app/api/v1/**/route.ts`, following the existing `src/app/api/**/route.test.ts`
    pattern;
  - the `apiRoute`-wrapper test;
  - the refactored actions' existing tests keep passing unchanged.
- **E2E:** new `tests/e2e/features/api.feature` tagged `@feat:api`, driven through Playwright's `request` fixture:
  - token sign-in with and without MFA;
  - lockout `429`;
  - an editor creates, edits and deletes via the API, and a web session sees the change live and in Activity;
  - a viewer gets `404` on writes;
  - removing the device in Profile → Security makes the token `401`;
  - idempotent replay returns the same row.

  Fixtures come from the mothers in `e2e-seed-data.ts`.

- **Feature map:** register `src/app/api/v1/**` and each new `src/lib/api/*` / `src/lib/services/*` module in
  `tests/e2e/feature-map.mjs`. Services go under the features whose web flows they now back (e.g.
  `services/checklists.ts` → the checklist feature _and_ `api`), so refactors run the web E2E too.
  `scripts/feature-map.test.mjs` fails the build if any are missing.

## Self-hosting notes

- Nothing new to run or configure. One migration (`api_sessions`) applies on container start as usual.
- Many installs are plain HTTP on a LAN. A bearer token over HTTP is exposed the same way the session cookie is today.
  The self-hosting docs should recommend an HTTPS reverse proxy before using the app away from home.
- Live sync and rate limits stay in-process, which matches the single-container deployment.
- PR descriptions should flag the migration and the new Profile → Security entries so the release changelog picks them
  up.

## Open questions

1. API session lifetime: 90 days idle, sliding? Should the admin MFA policy force re-authentication on a schedule?
2. Is trip creation needed in the first mobile release, or can phase 3 wait until after a read-mostly app ships?
3. Should Profile → Security show apps and browsers in one list or two?
4. Is there appetite to move parts of the web client onto `/api/v1` later? If so, cookie auth with origin checks
   goes into phase 4.

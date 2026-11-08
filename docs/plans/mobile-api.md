# API plan (`/api/v1`): web first, mobile later

Status: proposal. Each phase becomes one or more `bmad-build` stories; each story goes through `/plan-reviewer` before
implementation.

## Direction

Build a versioned JSON API and move the web app's mutations and client-side reads onto it. The mobile app comes later
and consumes the same API. Designing the endpoints for both now (see "Mobile-ready from day one") avoids reshaping
contracts after the web depends on them.

Today:

- Writes go through 23 `"use server"` modules (15 `actions.ts` plus `packing-actions.ts`, `security-actions.ts`,
  `avatar-actions.ts`, `document-upload-actions.ts`, `cover-upload-actions.ts`, `reservation-document-actions.ts`,
  `transit-actions.ts` and `cover-image-search-actions.ts`). Together they export about 145 functions, some of them
  re-exports.
- 62 production modules import actions, and 74 test files mock them.
- 24 E2E step files contain 100 `waitForServerActionResponse` calls.
- Reads happen in Server Components (`page.tsx` → `src/lib/queries.ts`), plus a few client lookups that are already
  route handlers (`src/lib/route-client.ts` moved routing off server actions because their one-at-a-time queue
  overwrote the URL after navigations).

## Scope

In scope: every server action except the auth boundary (8 functions; see "Auth boundary"). They collapse into fewer
REST resources.

Out of scope: changing how pages read data. Next.js 16's guide says to fetch in Server Components from the source,
not through Route Handlers (`node_modules/next/dist/docs/01-app/02-guides/backend-for-frontend.md`, "Server
Components"). The extra HTTP round trip is slower, and it fails at build time. So `page.tsx` calls the same
service/query functions the API handlers call. One code path, two entry points.

## Architecture

### 1. Service layer

`src/lib/services/<domain>.ts` holds what the actions hold today (validation, access check, transaction, side
effects). Signature:

```ts
export async function createChecklistItem(actor: Actor, checklistId: string, input: unknown): Promise<ChecklistItem>;
```

- `Actor` is `{ userId }`. Services never read cookies, headers or `next/navigation`.
- Input is validated with the existing zod schemas in `src/lib/validation-schemas.ts`.
- `requireTripRole(tripId, userId, minRole)` throws typed errors (see "Status codes") instead of calling
  `notFound()`.
- `afterTripWrite(actor, tripId)` does activity (`recordTripUpdated`), live sync (`publishItineraryChanged` and
  friends) and `revalidatePath`. All three work in route handlers.
- Returns rows mapped through `src/lib/db-mappers.ts`.
- Existing locking (`lockTripForUpdate`, the advisory-lock batching ADR) moves in unchanged.

Read services (`getTripDetail`, `listTripsForUser`, and the rest from `queries.ts`) serve both `page.tsx` and
`GET` endpoints.

### 2. Contract shared by server and client

Decision: hand-rolled, not oRPC. The wire format is plain REST either way. The expensive part, the zod input and
output schemas, is the same work in both. Owning a few hundred lines beats depending on a largely single-maintainer
framework inside images self-hosters run for years. It also keeps per-file route handlers, which `feature-map.mjs`
segmentation relies on, and code that contributors and agents can read. Because endpoints are already shaped as
contracts, moving to oRPC later would be mechanical.

Endpoints are defined once in a client-safe module and used on both sides:

```ts
// src/lib/api/contract/checklists.ts (no server-only imports)
export const createChecklistItem = defineEndpoint<ChecklistItem>()({
  method: "POST",
  path: "/api/v1/checklists/:checklistId/items",
  params: z.object({ checklistId: z.uuid() }),
  body: z.object({ id: z.uuid().optional(), content: checklistItemContentSchema }),
});

// src/app/api/v1/checklists/[checklistId]/items/route.ts
export const POST = apiRoute(createChecklistItem, ({ actor, params, body }) =>
  checklists.createChecklistItem(actor, params.checklistId, body)
);

// client component
const item = await api(createChecklistItem, { params: { checklistId }, body: { content } });
```

Response types come from `src/data/types.ts`, so there's no second set of domain types. Runtime response schemas
and an OpenAPI generator over `z.toJSONSchema` are deferred to the mobile phase.

### 3. Route handler wrapper

`apiRoute(endpoint, handler)` in `src/lib/api/route.ts`:

- authenticates (`requireApiUser(request)`, which returns 401 JSON and never redirects);
- applies the CSRF check (below) to cookie-authenticated mutations;
- parses and validates params, query and body against the contract, returning 422 with field errors;
- applies a generous per-user `api` rate-limit bucket;
- applies idempotency when an `Idempotency-Key` header is present;
- maps typed errors to the envelope, and sets `Cache-Control: no-store`.

`/api/v1` goes into `PUBLIC_PATHS` in `src/proxy.ts`. Otherwise an expired session gets an HTML redirect instead of a 401. Handlers authenticate instead, enforced by a unit test that walks `src/app/api/v1/**/route.ts` and fails if any
exported handler isn't built with `apiRoute`. Only a short explicit list is exempt (`meta`, and later the mobile token
endpoints).

### 4. Web authentication and CSRF

The web uses the existing Auth.js session cookie on `/api/v1`. No new tables are needed in the web phases.

Server actions check the request origin for us; route handlers don't. SameSite=Lax alone isn't enough here, because a
self-hosted box often runs other apps on other ports of the same host, and ports don't change the "site". So every
cookie-authenticated `POST/PUT/PATCH/DELETE`:

- must send `Content-Type: application/json` or `multipart/form-data` with an `X-Arrivo-Client: web` header. The
  custom header forces a CORS preflight cross-origin, and we never answer preflights;
- must have `Sec-Fetch-Site: same-origin`, or, when that header is absent, an `Origin` matching the request host. The
  check reuses the logic in `src/lib/request-origin.ts` and respects reverse-proxy forwarding.

No CORS headers are ever sent.

### 5. Auth boundary

The session-related server actions fall into three groups. Each needs a different answer.

| group                            | functions                                                                                                                                         | what ties them to server actions today                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Create a session (pre-auth)   | `signInAction`, `verifyMfaAction`, `setupAdminAction`, `completeAccountSetupAction`, `completePasswordResetAction`, `completeAdminRecoveryAction` | Auth.js `signIn()` sets the JWT cookie. One-time tickets live in httpOnly cookies scoped to their page: `arrivo_mfa`, plus `arrivo_account_setup`, `arrivo_password_reset` and `arrivo_admin_recovery` scoped to `/account-setup`, `/account-reset` and `/account-recovery` (`adr-setup-token-lives-in-a-scoped-cookie-and-is-revalidated-per-request.md`). `useActionState` forms work without JavaScript. They redirect on success. |
| B. End the session               | `signOutAction`, `signOutAndContinueSetupAction`                                                                                                  | Auth.js `signOut()` clears the cookie, then redirects.                                                                                                                                                                                                                                                                                                                                                                                |
| C. Signed-in security operations | `security-actions.ts` (MFA enroll/confirm/disable, recovery codes, sign out everywhere, remove device), `changePassword`, `deleteAccount`         | Business logic plus, for some, `signOut()` + redirect afterwards. Forced enrollment runs on a session flagged `mfaEnrollmentRequired`.                                                                                                                                                                                                                                                                                                |

**Group C moves to the API in every option.**

- Services do the work (bumping `session_version` already revokes every session).
- When the session ends, the handler calls Auth.js `signOut({ redirect: false })` to clear the cookie and returns
  `{ signedOut: true, redirectTo }`. The client navigates.
- Enrollment endpoints set `apiRoute({ allowEnrollment: true })`, mirroring `requireEnrollmentUser()`, so they're
  reachable with an `mfaEnrollmentRequired` session.
- The story must confirm that Auth.js `signOut()` clears the cookie from a route handler. Cookies are writable there,
  so it should.

**Groups A and B have three options:**

1. **Keep A and B as server actions (recommended).**
   - What stays: 8 functions in 4 files. Everything signed-in goes through `/api/v1`.
   - Pros:
     - Untouched: the most security-sensitive code (throttle, lockout, MFA tickets, link tokens) and its existing E2E
       coverage.
     - Sign-in, setup and reset keep working without JavaScript.
     - Auth.js keeps owning its cookie writes, as designed.
     - Mobile loses nothing: setup, reset and recovery links open in a browser anyway, and the phone gets token
       endpoints in phase 6 that reuse `authorizeCredentials`.
   - Cons: two mutation mechanisms survive; AGENTS.md keeps a short "auth flows use server actions" exception; an
     ESLint allowlist restricts `"use server"` to these files; `waitForServerActionResponse` survives for auth E2E only.
2. **Route handlers beside their pages, outside `/api/v1`.**
   - What moves: e.g. `POST /account-setup/submit` and `POST /sign-in/submit` as `route.ts` files under the existing
     paths, so the path-scoped cookies still reach them and the setup-token ADR holds.
   - Pros: no `"use server"` left anywhere; one E2E wait helper.
   - Cons:
     - Rewrites the auth forms from `useActionState` to fetch plus client state, and loses the no-JavaScript fallback.
     - Every pre-auth endpoint needs the origin check against login CSRF, which server actions gave for free.
     - The MFA ticket hand-off needs rework: today the ticket rides on `MfaRequiredError` back into the action, which
       sets the cookie.
     - Introduces a third kind of endpoint (not `/api/v1`, not a server action) with its own conventions.
3. **Everything under `/api/v1`.**
   - What moves: `/api/v1/auth/session` (+ `/mfa`), `/api/v1/account-setup`, `/api/v1/password-reset`,
     `/api/v1/admin-recovery`.
   - Pros: fully uniform. Web sign-in and mobile token sign-in sit side by side and differ only in the credential they
     return.
   - Cons:
     - Everything option 2 costs.
     - The link cookies are scoped to their page paths and wouldn't reach `/api/v1`. You'd have to widen them to
       `Path=/` or expose the token to page JavaScript. Both weaken and supersede the setup-token ADR, which exists
       so a one-time credential is sent nowhere but its own page.

Recommendation: option 1. Options 2 and 3 buy uniformity, not capability, and they spend it on the riskiest code in the
app. Revisit only if maintaining the server-action exception becomes a real burden.

### 6. Client mutation pattern

Server actions return the mutation result and the refreshed page data in one round trip. Route handlers can't:
`refresh()` from `next/cache` is server-action-only. So the client does it:

```ts
startTransition(async () => {
  addOptimistic(change);
  await api(endpoint, input);
  router.refresh();
});
```

wrapped in a `useApiMutation` hook (`src/lib/api/use-api-mutation.ts`) that also:

- maps `ApiError` codes to toasts or field errors;
- sends 401 to `/sign-in` and `mfa_enrollment_required` to `/mfa-enrollment`.

Risks the pilot slice must settle, with E2E coverage:

- **Optimistic flicker.** The optimistic state must hold until the refreshed data lands, with no snap back between
  the response and the refresh.
- **Request ordering.** Server actions are queued one at a time; `fetch` isn't. Order-sensitive operations (reorder,
  rapid toggles) need per-resource serialization in the client (a small keyed queue in the hook). Everything else
  gets real concurrency, which fixes the queue problems `route-client.ts` worked around.
- **Cost.** Two round trips instead of one per mutation. Acceptable on a LAN; live sync already triggers refreshes
  for other viewers.

### 7. Status codes

Access errors split by whether the caller may know the resource exists:

| situation                                              | status | code                                          |
| ------------------------------------------------------ | ------ | --------------------------------------------- |
| not signed in / session revoked                        | 401    | `unauthenticated`                             |
| MFA enrollment pending                                 | 403    | `mfa_enrollment_required`                     |
| not a member of the trip (or trip/row doesn't exist)   | 404    | `not_found`                                   |
| member, role too low (viewer writing, editor managing) | 403    | `forbidden` + `requiredRole`                  |
| signed in, not an app admin, on an admin endpoint      | 403    | `forbidden`                                   |
| malformed JSON or wrong shape                          | 400    | `bad_request`                                 |
| failed validation                                      | 422    | `validation_failed` + `fields`                |
| structural conflict (target day removed mid-edit)      | 409    | `conflict`                                    |
| upload too big                                         | 413    | `payload_too_large`                           |
| rate limited / locked out                              | 429    | `rate_limited` / `locked_out` + `Retry-After` |
| anything else                                          | 500    | `server_error` (no internals)                 |

Envelope: `{ "error": { "code", "message", "fields"?, "requiredRole"? } }`.

The web's `notFound()`-for-everything rule exists so a stranger can't probe which trip IDs exist. A viewer already
knows the trip exists, so hiding it buys nothing, and a 403 lets the UI say "You have view access only".
`requireTripRole` already has the role in hand, so it throws `TripNotFoundError` (no membership) or
`TripForbiddenError` (membership, role too low). Pages keep calling `notFound()` for both.

Admin endpoints return 403 to signed-in non-admins (decided). Their existence isn't secret, since the project is open
source, and a clear 403 beats a confusing 404. Admin pages keep their current `notFound()` through `requireAdmin()`.

### 8. Mobile-ready from day one

These rules cost little now and avoid breaking contracts later:

- **Versioned paths:** `/api/v1`. Changes inside v1 are additive only.
- **Client-generated UUIDs** accepted on creates. A retried create returns the existing row, and an offline phone can
  reference a row before it syncs.
- **Partial `PATCH`:** only the fields sent change. Today `updateEvent` nulls any field not sent.
- **Absolute values, not toggles:** `{ isChecked: true }`. Today `toggleChecklistItem` and `togglePackingItem` flip
  the stored value, which goes wrong if a request is replayed.
- **Deletes are idempotent:** deleting a missing row returns `204`.
- **Order changes send the full ordered ID list:** `PUT .../order { itemIds }`.
- **`Idempotency-Key` header** supported on every mutation. `withIdempotency()` generalises the existing
  `idempotency_keys` usage in `packing-actions.ts`, and the window becomes configurable so the mobile phase can
  lengthen it.
- **Trip snapshot with an `ETag`:** `GET /api/v1/trips/:tripId` returns `TripDetailPayload` (from `getTripDetail`),
  with `ETag` set to a hash of the serialized payload.

## Endpoint inventory (by slice)

Resource-style; the exact paths get settled in each slice's story.

| slice                  | replaces (actions file)                                              | main resources                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Pilot: trip checklists | `trips/[tripId]/actions.ts` (8 checklist actions)                    | `/trips/:id/checklists`, `/checklists/:id`, `/checklists/:id/items`, `/checklist-items/:id`                                                   |
| Trip notes             | trip + event note actions (7)                                        | `/trips/:id/notes`, `/notes/:id`, `/trips/:id/notes/order`, `/events/:id/note`                                                                |
| Itinerary              | events, days, reorder (10)                                           | `/days/:id/events`, `/events/:id`, `/days/:id/order`, `/trips/:id/days`, `/days/:id`                                                          |
| Documents & covers     | upload/add/rename/remove/attach/promote, covers (9)                  | `/trips/:id/documents` (multipart), `/events/:id/documents`, `/documents/:id`, `/trips/:id/cover`                                             |
| Sharing                | share dialog, invitations, contributors, leave (14 across two files) | `/trips/:id/collaborators`, `/trips/:id/invitations`, `/invitations/:id/{accept,decline,resend,dismiss}`, `/users/invitable`                  |
| Trips & packing        | `trips/actions.ts` trip + packing items (≈13), `packing-actions.ts`  | `/trips`, `/trips/:id`, `/trips/:id/packing-items`, `/packing-items/:id`, `/trips/:id/packing/order`                                          |
| Packing templates      | `packing/actions.ts`, `packing/[templateId]/actions.ts` (8)          | `/packing-templates`, `/packing-templates/:id/items`, ...                                                                                     |
| Reservations & budget  | `reservations/actions.ts`, `budget/actions.ts` (7)                   | `/trips/:id/reservations`, `/reservations/:id`, `/trips/:id/expenses`, `/expenses/:id`, `/trips/:id/expenses/recalculate`                     |
| Locations & routing    | location search actions (3), existing routing handlers               | `/locations/search`, `/locations/retrieve`, `/trips/:id/routing/*` (move under v1)                                                            |
| Profile                | `profile/actions.ts` (10), `avatar-actions.ts` (2)                   | `/me`, `/me/avatar`, `/me/loyalty-numbers`, `/me/wishlist`, `/me/companions`                                                                  |
| Account security       | `security-actions.ts` (6), `changePassword`, `deleteAccount`         | `/me/mfa`, `/me/mfa/confirm`, `/me/mfa/recovery-codes`, `/me/sessions` (sign out everywhere), `/me/devices/:id`, `/me/password`, `DELETE /me` |
| Admin                  | `admin/*/actions.ts` (26)                                            | `/admin/users...`, `/admin/security/...`, `/admin/activity...`, `GET /admin/overview/:metric`                                                 |

The admin overview `refresh*` actions are reads. They become `GET` endpoints, superseding
`docs/decisions/adr-overview-metrics-refresh-through-per-metric-server-actions-without-persistence.md`.

## Phases

**Phase 0: decisions (ADRs in `docs/decisions/`)**

- Web mutations go through `/api/v1`; pages keep reading via services.
- The auth boundary (option chosen in "Auth boundary").
- The 404/403 split, including 403 for admin endpoints.
- Cookie auth with the CSRF rules above.
- A hand-rolled contract layer (`defineEndpoint`/`apiRoute`/`api`).
- The client mutation pattern (refresh, ordering).
- Supersede the overview-metrics ADR.

**Phase 1: foundation + pilot (trip checklists).** Stories:

1. Services: `requireTripRole` with the two error types, `afterTripWrite`, and the checklist service extracted while
   the existing actions delegate to it. No behaviour change.
2. API plumbing:
   - `defineEndpoint`, `apiRoute`, `requireApiUser`, the error envelope, CSRF check, `api` rate-limit bucket and
     `withIdempotency`;
   - `/api/v1` in `PUBLIC_PATHS`, the "every handler uses `apiRoute`" test, and `GET /api/v1/meta`.
3. Client plumbing: `api()` and `useApiMutation` (refresh, error mapping, keyed ordering queue), plus the E2E helper
   `waitForApiResponse(page, { method, path })`. It's more precise than `waitForServerActionResponse`, because every
   endpoint has its own URL.
4. Checklist endpoints; switch checklist components to them; switch their unit tests to mock `@/lib/api/client`;
   switch the checklist E2E steps; delete the checklist actions.

Exit: checklists run entirely on `/api/v1`, flicker and ordering are proven by E2E, and every other feature is
unchanged.

**Phase 2: trip detail.** Notes, itinerary, documents & covers (moving upload limits into the multipart handler via
`upload-policy.ts`), sharing.

**Phase 3: trips, packing, templates, reservations, budget, locations, routing.**

**Phase 4: profile, account security (group C) and admin.**

**Phase 5: cleanup.**

- Delete the emptied `actions.ts` files.
- Add an ESLint rule that allows `"use server"` only under the auth boundary.
- Update AGENTS.md: the server-action conventions become API conventions, and the auth exception is recorded.
- Update `scripts/feature-map.test.mjs`: the server-action coverage clause becomes an `api/v1` clause.
- Retire `waitForServerActionResponse` except for the auth flows.

**Phase 6: mobile prerequisites (when the app starts).**

- Bearer auth: per-device opaque tokens in a new `api_sessions` table, tied to `trusted_devices` and
  `users.session_version`, so removing a device or signing out everywhere revokes it. The flow is
  `POST /api/v1/auth/token` (+ `/mfa`), reusing `authorizeCredentials` without its cookie handling.
- Profile → Security lists app sessions.
- `/meta` capabilities, a longer idempotency window, runtime response schemas, and a generated OpenAPI document with a
  drift test.
- Delta sync only if snapshot sizes justify it.

Each slice in phases 2–4 follows the same steps:

1. Extract the service (tests first).
2. Add the endpoints with `route.test.ts`.
3. Switch components and their tests.
4. Switch the E2E waits.
5. Delete the actions.

Web E2E stays green at every step; it's the regression net for the refactor.

## Testing

- **Unit (Vitest, colocated):**
  - `src/lib/services/*.test.ts` and `src/lib/api/*.test.ts`;
  - `route.test.ts` beside each handler, following `src/app/api/**/route.test.ts`;
  - the wrapper-coverage test;
  - component tests mock `@/lib/api/client` instead of action modules (the 74 files move slice by slice).
- **E2E:** existing feature files keep their scenarios; only waits change. A new `tests/e2e/features/api.feature`
  (`@feat:api`) covers behaviour the UI can't reach:
  - 401 after sign-out;
  - viewer write → 403;
  - stranger → 404;
  - 422 field errors;
  - a cross-origin `POST` rejected by the CSRF check;
  - idempotent replay;
  - client-supplied IDs.

  It uses Playwright's `request` fixture and the mothers in `e2e-seed-data.ts`.

- **Feature map:** each `src/app/api/v1/**` route and `src/lib/services/*` module maps to the feature whose UI uses
  it (plus `api` where relevant), so a service refactor runs that feature's web E2E. `src/lib/api/route.ts`,
  `client.ts` and `use-api-mutation.ts` sit under every mutation, so they go in `SHARED_GLOBS`.

## Self-hosting

- Nothing new to run in phases 1–5: no migrations, no environment variables.
- Phase 6 adds one migration.
- Reverse proxies need no change for same-origin `/api/v1` calls. The `Origin` check must use the forwarded host the
  same way `request-origin.ts` does today.

## Open questions

1. Auth boundary: option 1, 2 or 3 (see "Auth boundary")?

Decided: hand-rolled contract layer; admin endpoints return 403 to non-admins.

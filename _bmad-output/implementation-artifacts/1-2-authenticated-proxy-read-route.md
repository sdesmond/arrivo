---
baseline_commit: 3d84594
---

# Story 1.2: Authenticated Proxy Read Route

Status: review

## Story

As a developer maintaining Packt's storage layer,
I want a trip-scoped authenticated proxy route that serves files from the local adapter,
So that uploaded documents and cover images render in the app without exposing a raw filesystem path.

## Acceptance Criteria

**Given** a storage key with scope-prefix and ownerId segments (e.g. `event-documents/{eventId}/{uuid}.jpg`)
**When** `resolveOwningTripId(key)` is called
**Then** it reverse-parses the scope-prefix and ownerId, maps it to a `tripId` (direct for `trip-cover`/`trip-document`, via event/reservation lookup otherwise), and returns `Promise<string>` (FR-8)

**Given** a malformed key or a key whose owning record no longer exists
**When** `resolveOwningTripId(key)` is called
**Then** it throws rather than returning null/undefined (FR-8)

**Given** `GET /api/storage/[...path]`
**When** a request arrives
**Then** the route reconstructs the key via `params.path.join("/")`, calls `resolveOwningTripId(key)`, then `requireUser()` and `assertTripAccess()` before calling `adapter.read(key)` (FR-4)

**Given** an unauthenticated request, or a user without access to the resolved trip
**When** `GET /api/storage/[...path]` is called
**Then** the request is rejected before any bytes are streamed (FR-4)

**Given** a valid, authorized request for an existing key
**When** the route responds
**Then** it sets `Content-Type` via a shared extension↔MIME reverse-lookup against `upload-policy.ts`'s existing table, and `Content-Disposition: inline` (FR-9)

**Given** a request for a key that does not exist in the backing store
**When** the route handles the read failure
**Then** it returns a 404, not a 500, using the not-found outcome defined in Story 1.1

**Given** the proxy route and resolver
**When** called with a raw, non-percent-encoded multi-segment key
**Then** the round trip (`put()` → parse route params → `resolveOwningTripId` key) reproduces the original key exactly

## Tasks / Subtasks

- [x] Task 1: Add MIME extension reverse-lookup to `upload-policy.ts` (AC: Content-Type contract)
  - [x] Create `EXTENSION_MIME_TYPES: Record<string, string>` — reverse of existing `MIME_TYPE_EXTENSIONS` map. Note: `MIME_TYPE_EXTENSIONS` has both `"image/heic"` and `"image/heif"` mapping to `"heic"` — the reverse map key is `"heic"` → `"image/heic"` (the canonical form). Unique extensions: `pdf`, `avif`, `gif`, `heic`, `jpg`, `png`, `webp`
  - [x] Export `getMimeTypeForExtension(extension: string): string` — returns MIME type string; throws on unknown extension
  - [x] Add tests in `upload-policy.test.ts` for new exports

- [x] Task 2: Create `src/app/api/storage/[...path]/route.ts` (AC: proxy route)
  - [x] Export `GET` handler: `GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> })`
  - [x] Reconstruct key: `(await params).path.join("/")`
  - [x] Call `resolveOwningTripId(key)` — catch errors and return 400 for malformed keys, 404 for missing records
  - [x] Call `requireUser()` — unauthenticated users get redirected to `/sign-in`
  - [x] Call `assertTripAccess(tripId, user.id!)` — unauthorized users get `notFound()` (404)
  - [x] Call `getStorageAdapter().read(key)` — catch `StorageNotFoundError` and return 404
  - [x] Derive `Content-Type` from key extension via `getMimeTypeForExtension()`, set `Content-Disposition: inline`
  - [x] Return `new Response(stream, { headers: { "Content-Type": ..., "Content-Disposition": "inline" } })`

- [x] Task 3: Create `src/app/api/storage/[...path]/route.test.ts` (AC: tests)
  - [x] Test: valid key resolves trip, passes auth, returns stream with correct Content-Type and Content-Disposition headers
  - [x] Test: unauthenticated request returns redirect (302 to `/sign-in`)
  - [x] Test: unauthorized user (no collaborator row) returns 404
  - [x] Test: non-existent key returns 404 (not 500)
  - [x] Test: malformed key (bad scope prefix) returns 400
  - [x] Test: round-trip — key produced by `put()` is reconstructable from route params

- [x] Task 4: Update `trip-resolution.test.ts` (AC: resolver throws on missing records)
  - [x] Verify existing tests cover: throws on missing event, throws on missing reservation
  - [x] Add test for malformed key throwing (already covered by `parseUploadStorageName` tests, but confirm integration)

## Dev Notes

### Architecture Invariants (Must Follow)

| AD | Rule | Impact on This Story |
|----|------|---------------------|
| AD-1 | All file I/O goes through `StorageAdapter` port | Route calls `getStorageAdapter().read(key)` — never `fs.readFile` directly |
| AD-2 | Key naming stays in `upload-policy.ts`; adapters are byte-opaque | Key reconstructed from route params via `join("/")`, passed opaquely to resolver and adapter |
| AD-3 | DB stores ready-to-render URL, not bare key | `put()` returns `/api/storage/{key}` — route matches this exact shape |
| AD-4 | `del()` is unconditionally safe | Not relevant to read route |
| AD-5 | Local-adapter reads are proxied and trip-scoped-auth-gated | **This is the story that implements AD-5** — route must call `resolveOwningTripId` + `requireUser()` + `assertTripAccess()` before streaming |
| AD-6 | One shared `resolveOwningTripId()` | Route imports from `@/lib/storage/trip-resolution` — never reimplements key→tripId lookup |
| AD-7 | `getStorageAdapter()` is a lazily-validated singleton | Route calls `getStorageAdapter()` — singleton handles env validation |
| AD-8 | Local adapter's `put()` fails loudly | Not relevant to read route |
| AD-9 | Content-Type set by proxy route from key extension | **This is the story that implements AD-9** — route uses `getMimeTypeForExtension()` from `upload-policy.ts` |

### Files Created (NEW)

| File | Purpose |
|------|---------|
| `src/app/api/storage/[...path]/route.ts` | Proxy read route — auth-gated, streams files from local adapter |
| `src/app/api/storage/[...path]/route.test.ts` | Tests for proxy route (auth, 404, Content-Type, round-trip) |

### Files Updated (MODIFY)

| File | Change |
|------|--------|
| `src/lib/upload-policy.ts` | Add `EXTENSION_MIME_TYPES` reverse map + `getMimeTypeForExtension()` export |
| `src/lib/upload-policy.test.ts` | Add tests for new MIME reverse-lookup exports |

### Files Already Complete (from Story 1.1 — DO NOT MODIFY)

| File | Status |
|------|--------|
| `src/lib/storage/storage-adapter.ts` | `StorageAdapter` interface, `StorageNotFoundError`, `getStorageAdapter()` — all defined |
| `src/lib/storage/local-filesystem-adapter.ts` | `read(key)` returns `ReadableStream<Uint8Array>`, throws `StorageNotFoundError` on ENOENT |
| `src/lib/storage/trip-resolution.ts` | `resolveOwningTripId(key)` resolves scope→tripId, throws on malformed/missing |
| `src/lib/storage/trip-resolution.test.ts` | Tests for resolver — scope resolution + error cases |

### Key Patterns to Follow

**Existing API route pattern** (`src/app/api/mapbox/static/route.ts`):
- Export named `GET` function
- Use `NextRequest` for request type
- Return `new Response(body, { status, headers })`

**Auth pattern for route handlers** (`src/lib/auth-helpers.ts`):
```ts
import { requireUser, assertTripAccess } from "@/lib/auth-helpers";
// requireUser() — calls redirect("/sign-in") if unauthenticated; returns user object
// assertTripAccess(tripId, userId) — calls notFound() (404) if no access
```

**Import boundaries** — route handler is a server module, so it CAN import `server-only` modules:
- `@/lib/auth-helpers` (imports `"server-only"`) — safe in route handlers
- `@/lib/queries` (imports `"server-only"`) — safe in route handlers
- `@/lib/storage/*` — safe in route handlers

**Error handling strategy** — route handler structure:
```ts
export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const user = await requireUser();           // throws redirect("/sign-in") if unauthenticated
  const key = (await params).path.join("/");
  const tripId = await resolveOwningTripId(key); // throws Error on malformed/missing
  await assertTripAccess(tripId, user.id!);   // throws notFound() (404) if no access

  try {
    const adapter = getStorageAdapter();
    const stream = await adapter.read(key);   // throws StorageNotFoundError on ENOENT
    const extension = key.split(".").pop() ?? "";
    const contentType = getMimeTypeForExtension(extension);
    return new Response(stream, {
      headers: { "Content-Type": contentType, "Content-Disposition": "inline" },
    });
  } catch (error) {
    if (error instanceof StorageNotFoundError) {
      return new Response("Not found", { status: 404 });
    }
    throw error; // let unexpected errors propagate as 500
  }
}
```
Key points: `requireUser()` redirects (never returns null), `assertTripAccess()` calls `notFound()` which throws Next.js `NEXT_NOT_FOUND` — both terminate before the try/catch. The try/catch only handles adapter read errors.

**MIME reverse-lookup** — `upload-policy.ts` already has `MIME_TYPE_EXTENSIONS: Record<string, string>` mapping MIME→extension. Add the reverse `EXTENSION_MIME_TYPES: Record<string, string>` mapping extension→MIME. Supported extensions: `pdf`, `avif`, `gif`, `heic`, `jpg`, `png`, `webp`.

**Key reconstruction** — the `put()` method in `local-filesystem-adapter.ts` returns `/api/storage/{key}` where key is `{scope-prefix}/{ownerId}/{uuid}.{ext}`. The `[...path]` catch-all splits on `/`, so `params.path` is `["scope-prefix", "ownerId", "uuid.ext"]`. Reconstruct via `params.path.join("/")`.

### Database Tables Referenced

- `collaborators` table: `tripId` (UUID FK→trips), `userId` (UUID FK→users), `role` — checked by `assertTripAccess()`
- `events` table: `id` (UUID PK), `tripId` (UUID FK→trips) — used by `resolveOwningTripId` for `event-document` scope
- `reservations` table: `id` (UUID PK), `tripId` (UUID FK→trips) — used by `resolveOwningTripId` for `reservation-document` scope
- `trips` table: `id` (UUID PK), `ownerId` (UUID FK→users) — direct scope for `trip-document`/`trip-cover`

### Testing Requirements

- Unit tests colocated next to source: `src/app/api/storage/[...path]/route.test.ts`
- Coverage thresholds: ≥95% lines/functions, ≥90% branches across `src/lib/**` (applies to `upload-policy.ts` changes)
- Route handler tests need to mock: `@/lib/auth-helpers` (`requireUser`, `assertTripAccess`), `@/lib/storage/storage-adapter` (`getStorageAdapter`), `@/lib/storage/trip-resolution` (`resolveOwningTripId`)
- Use `vi.hoisted()` for mock references, `vi.mock()` at top level
- Global mocks for `next/navigation` and `next/headers` already in `vitest.setup.mts` — don't re-mock per file
- Mock `sonner` if any toast calls are added (not expected in this story)

### References

- [Source: `_bmad-output/planning-artifacts/epics-storage-adapter.md`] — Story 1.2 acceptance criteria, FR-4, FR-8, FR-9
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-packt-2026-08-16/ARCHITECTURE-SPINE.md`] — AD-5 (proxy auth-gating), AD-6 (shared resolver), AD-9 (Content-Type contract)
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-packt-2026-08-16/reviews/review-adversarial.md`] — Finding 6 (not-found error type, resolved in Story 1.1)
- [Source: `src/lib/storage/trip-resolution.ts`] — `resolveOwningTripId()` already implemented
- [Source: `src/lib/storage/storage-adapter.ts`] — `StorageNotFoundError`, `getStorageAdapter()`, `StorageAdapter` interface
- [Source: `src/lib/storage/local-filesystem-adapter.ts`] — `read()` returns `ReadableStream`, throws `StorageNotFoundError` on ENOENT
- [Source: `src/lib/upload-policy.ts`] — `MIME_TYPE_EXTENSIONS` reverse map needed; `parseUploadStorageName()` used by resolver
- [Source: `src/lib/auth-helpers.ts`] — `requireUser()`, `assertTripAccess()` — must be called in route handler
- [Source: `src/app/api/mapbox/static/route.ts`] — existing route handler pattern to follow

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `npx vitest run src/lib/upload-policy.test.ts` — 19 passed
- `npx vitest run "src/app/api/storage/[...path]/route.test.ts"` — 7 passed
- `npx vitest run src/lib/storage/trip-resolution.test.ts` — 7 passed (pre-existing coverage confirmed, no changes needed)
- `npx eslint` on all touched files — clean
- `npx tsc --noEmit` — clean

### Completion Notes List

- Added `EXTENSION_MIME_TYPES` (reverse of `MIME_TYPE_EXTENSIONS`) and `getMimeTypeForExtension()` to `upload-policy.ts`. Built via `reduce` with `??=` rather than `Object.fromEntries`, since `fromEntries` is last-write-wins and would let `image/heif` clobber the canonical `image/heic` for the shared `heic` extension key — first-seen-wins preserves the canonical MIME type per the story's note.
- Implemented `GET /api/storage/[...path]`: reconstructs the key via `(await params).path.join("/")`, resolves the owning trip via `resolveOwningTripId()`, gates on `requireUser()` + `assertTripAccess()` before any adapter read, then streams via `getStorageAdapter().read(key)` with `Content-Type` derived from `getMimeTypeForExtension()` and `Content-Disposition: inline`.
- `resolveOwningTripId()` failures are distinguished by message prefix: `"Malformed upload storage name"` → 400, anything else (missing event/reservation) → 404. Not-found reads (`StorageNotFoundError`) also return 404 — both existing-error paths return "Not found" bodies without a 500.
- `requireUser()`/`assertTripAccess()` errors (redirect/notFound signals) intentionally propagate out of `GET` uncaught, matching the Dev Notes' documented error-handling contract — Next.js request handling converts the thrown digest-tagged errors into the actual redirect/404 response at runtime; unit tests assert the error propagates rather than asserting an HTTP status, consistent with the existing `error-utils.test.ts` convention for representing these framework signals.
- Verified `trip-resolution.test.ts` already had full coverage for throws on missing event, missing reservation, and malformed key — no test changes were needed for Task 4.

### File List

- `src/lib/upload-policy.ts` (modified)
- `src/lib/upload-policy.test.ts` (modified)
- `src/app/api/storage/[...path]/route.ts` (new)
- `src/app/api/storage/[...path]/route.test.ts` (new)

## Change Log

- 2026-08-17: Implemented Story 1.2 — MIME extension reverse-lookup, authenticated proxy read route, and route/resolver test coverage. All 4 tasks complete.

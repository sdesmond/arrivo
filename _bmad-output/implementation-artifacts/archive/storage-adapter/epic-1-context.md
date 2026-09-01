# Epic 1 Context: Storage Adapter Foundation

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Replace all direct `@vercel/blob` calls and the hand-rolled `UPLOAD_STUB` branching with a single `StorageAdapter` port backed by a default local-filesystem implementation, so Packt can run self-hosted in a Docker container against a bind-mounted volume. The active backend is selected purely by the `STORAGE_PROVIDER` env var, provider secrets come from env vars only (never git or image), and every read path is auth-gated through a proxied route. No new user-facing behavior — this is a pure infrastructure migration, so there is no PRD or UX contract; the requirements live in the architecture spine and the epic breakdown.

## Stories

- Story 1.1: StorageAdapter port and local filesystem adapter
- Story 1.2: Authenticated proxy read route
- Story 1.3: Migrate write-side call sites off UPLOAD_STUB
- Story 1.4: E2E and lint cutover

## Requirements & Constraints

- All file I/O (upload, delete, read) for trip documents and cover images routes through `getStorageAdapter()`; no call site imports `@vercel/blob`, `node:fs`, or any backend SDK directly.
- `put()` returns a render-ready URL stored as-is in `documents.url` / `trips.coverImageUrl` — no separate key column, no key-to-URL resolution at render time.
- `del(url)` is unconditionally safe to call: each adapter recognizes its own produced-URL shape and no-ops on unrecognized URLs; deletion failures on recognized URLs are best-effort/swallow-and-warn.
- The active provider is selected via `STORAGE_PROVIDER`; missing required env vars throw a clear "missing X env var" error at first adapter resolution, not deep inside a `put`/`del` call.
- The local adapter's `put()` fails loudly on `EACCES`/`EPERM` with a message naming the path and pointing at a likely PUID/PGID mismatch.
- No secrets ever committed to git or baked into the container image.
- E2E exercises the real local adapter against an E2E-scoped scratch directory — no parallel stub.
- A shared `resolveOwningTripId()` is the only place that reverse-parses keys; it throws on malformed keys or missing owning records, never returning null/undefined.
- The proxy route sets correct `Content-Type` and `Content-Disposition: inline` so images/PDFs render in place.
- Unit coverage thresholds (≥95% lines/functions, ≥90% branches) apply to `src/lib/storage/**`; colocated `*.test.ts` files; new domain types go in `src/data/types.ts`; no single-letter variable names, no `any`.

## Technical Decisions

- **Port shape (fixed):** `put(key: string, file: File): Promise<string>`, `del(url: string): Promise<void>`, `read(key: string): Promise<ReadableStream<Uint8Array>>` — Web Streams type, not Node's `Readable`; a `node:fs`-backed adapter converts via `Readable.toWeb()`.
- **New files:** `src/lib/storage/storage-adapter.ts` (interface + `getStorageAdapter()`), `src/lib/storage/local-filesystem-adapter.ts` (default), `src/lib/storage/trip-resolution.ts` (`resolveOwningTripId()`), `src/app/api/storage/[...path]/route.ts` (proxy read). `src/lib/upload-policy.ts` stays unchanged.
- **Key opacity:** keys are built only by `createUploadStorageName()` (`{scope-prefix}/{ownerId}/{uuid}.{ext}`); adapters treat keys as opaque path strings and never construct or interpret their semantics.
- **Proxy URL contract:** the local adapter maps the key's `/`-separated segments 1:1 onto the `[...path]` catch-all (no percent-encoding); the route reconstructs the key via `params.path.join("/")`.
- **Singleton:** `getStorageAdapter()` caches on `globalThis` gated by `NODE_ENV !== "production"`, mirroring `src/db/index.ts`'s `__pgClient` pattern; env validation happens at first resolution per process.
- **Resolver:** `resolveOwningTripId(key)` reverse-parses scope-prefix + ownerId, mapping to `tripId` (direct for `trip-cover`/`trip-document`; via event/reservation lookup otherwise). Callers never pre-parse; no caller reimplements the lookup.
- **Proxy route flow:** reconstruct key → `resolveOwningTripId()` → `requireUser()` + `assertTripAccess()` → `adapter.read(key)`; auth rejection happens before any bytes stream.
- **Import enforcement:** ESLint `no-restricted-imports` bans `@vercel/blob` everywhere and `node:fs`/`node:fs/promises` outside `local-filesystem-adapter.ts`; the `@vercel/blob` dependency is removed from `package.json` once call sites migrate.
- **Story 1.1 must pin:** a consistent "key not found" outcome (error type/sentinel) shared by `read()`/`del()`, so the proxy route can return 404 vs 500 uniformly; and a documented test-isolation mechanism for the cached singleton (test-only reset export or wholesale-mock convention) so `vi.stubEnv("STORAGE_PROVIDER", ...)` doesn't leak across suites in a shared Vitest worker.
- **Out of scope (do not build):** S3-compatible adapter, migration script, image resize/optimization, Vercel Blob adapter, Docker entrypoint/PUID-PGID remap plumbing. Redeploy-to-switch is acceptable; live backend switching is not a requirement.

## Cross-Story Dependencies

- 1.1 must pin the "not found" taxonomy before 1.2 can distinguish 404 from 500 in the proxy route.
- 1.2's `resolveOwningTripId()` replaces the inline `getEventTripId`/`getReservationTripId` lookups that 1.3 migrates off — 1.3 depends on 1.2's resolver existing.
- 1.4 completes the `@vercel/blob` import ban and removes the dependency only after 1.3 migrates all call sites; it replaces the `UPLOAD_STUB: "true"` webServer env with `STORAGE_PROVIDER=local` + `STORAGE_LOCAL_ROOT_DIR`.
- 1.3's `reservations/actions.ts` batch delete becomes `Promise.allSettled(urls.map(url => adapter.del(url)))`, not `Promise.all`, to preserve best-effort-per-file semantics.
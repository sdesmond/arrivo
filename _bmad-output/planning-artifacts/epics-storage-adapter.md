---
stepsCompleted: ["step-01-validate-prerequisites", "requirements-confirmed", "step-02-design-epics", "step-03-create-stories", "step-04-final-validation"]
inputDocuments:
  - _bmad-output/brainstorming/brainstorm-image-storage-backends-2026-08-16/brainstorm-intent.md
  - _bmad-output/planning-artifacts/architecture/architecture-packt-2026-08-16/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/architecture/architecture-packt-2026-08-16/reviews/review-adversarial.md
  - _bmad-output/planning-artifacts/architecture/architecture-packt-2026-08-16/reviews/review-reality-check.md
  - _bmad-output/project-context.md
---

# packt - Epic Breakdown (Storage Adapter)

## Overview

This document provides the complete epic and story breakdown for packt's storage-adapter migration, decomposing requirements from the brainstorm intent (`brainstorm-image-storage-backends-2026-08-16`) and the Architecture Spine (`architecture-packt-2026-08-16`) into implementable stories. No standalone PRD exists for this feature — it is an internal/technical migration (replacing direct `@vercel/blob` calls with a pluggable `StorageAdapter` port) with no new user-facing behavior, so the brainstorm's MoSCoW scope and the architecture spine's invariants (ADs) serve as the requirements source in place of PRD-numbered FRs/NFRs, per the same brownfield precedent used for the Trip Notes epic (`project-context.md` in place of a dedicated Architecture.md).

## Requirements Inventory

### Functional Requirements

FR-1: All file I/O (upload, delete, read) for trip documents and cover images routes through a single `StorageAdapter` port; no call site imports `@vercel/blob`, `node:fs`, or any backend SDK directly.
FR-2: A default local-filesystem `StorageAdapter` implementation stores files under a configurable root directory, following the PUID/PGID bind-mount convention used by self-hosted Docker deployments.
FR-3: The active storage provider is selected via a single `STORAGE_PROVIDER` env var, swappable without code changes; provider-specific secrets/config are supplied via env vars only, never committed to git or baked into the container image.
FR-4: Local-adapter file reads are served through an authenticated proxy route (`/api/storage/[...path]`) that resolves the owning trip via a shared resolver and enforces `requireUser()` + `assertTripAccess()` before streaming bytes — no direct filesystem path or URL is ever exposed to the browser.
FR-5: Storage keys are generated exclusively by the existing `createUploadStorageName()` in `upload-policy.ts`; every adapter treats a key as an opaque path string and never constructs or interprets its semantics.
FR-6: `put()` returns a ready-to-render URL that is stored as-is in `documents.url` / `trips.coverImageUrl`; there is no separate key column and no key-to-URL resolution layer at render time.
FR-7: `del(url)` is safe to call unconditionally at any call site — each adapter recognizes its own produced-URL shape and no-ops on URLs it doesn't recognize (e.g. a leftover Vercel Blob URL post-cutover); deletion failures on a recognized URL are best-effort/swallow-and-warn, deliberately distinct from `put()`'s fail-loud behavior on permission errors.
FR-8: A single shared resolver, `resolveOwningTripId(key): Promise<string>`, is the only place that reverse-parses a storage key's scope-prefix and ownerId back to a `tripId`; it throws (never returns null/undefined) on a malformed key or missing owning record, and is used by both the proxy route and migrated write-side actions.
FR-9: The proxy route sets a correct `Content-Type` (via a shared extension↔MIME reverse-lookup against `upload-policy.ts`'s existing table) and `Content-Disposition: inline` on every response, so images and PDFs render in place rather than force-downloading.
FR-10: The six existing action files that hand-roll `UPLOAD_STUB` branching (`document-upload-actions.ts`, `cover-upload-actions.ts`, `reservation-document-actions.ts`, `trips/[tripId]/actions.ts`, `trips/actions.ts`, `reservations/actions.ts`) are migrated to call `getStorageAdapter()` exclusively, removing the duplicated if/else per call site.

### NonFunctional Requirements

NFR-1: Adapter resolution is a lazily-validated singleton per process (mirroring `src/db/index.ts`'s `globalThis.__pgClient` pattern, including its `NODE_ENV !== "production"` gating): required env vars for the selected provider are validated at first resolution, throwing a clear "missing X env var" error at that point rather than deep inside an unrelated `put`/`del` call.
NFR-2: No secrets (S3 access keys, etc.) are ever committed to git or baked into the container image — env vars only.
NFR-3: Import boundaries are enforced via an ESLint `no-restricted-imports` rule: `@vercel/blob` disallowed everywhere; `node:fs` / `node:fs/promises` disallowed outside `local-filesystem-adapter.ts`.
NFR-4: E2E tests exercise the real local adapter, not a parallel stub — `playwright.config.ts`'s webServer env replaces `UPLOAD_STUB: "true"` with `STORAGE_PROVIDER=local` + `STORAGE_LOCAL_ROOT_DIR` pointed at an E2E-scoped scratch directory.
NFR-5: Redeploy-to-switch is acceptable; live mid-process backend switching is explicitly not a requirement.
NFR-6: The local adapter's `put()` fails loudly (re-thrown, explicit message naming the path and pointing at a likely PUID/PGID mismatch) on `EACCES`/`EPERM` write errors, rather than silently appearing to succeed.

### Additional Requirements

_Derived from the Architecture Spine's Consistency Conventions, Structural Seed, and the adversarial/reality-check reviews' surfaced gaps — no dedicated PRD/UX document exists for this brownfield infrastructure migration._

- Structural seed (new files): `src/lib/storage/storage-adapter.ts` (interface + `getStorageAdapter()`), `src/lib/storage/local-filesystem-adapter.ts` (default adapter), `src/lib/storage/trip-resolution.ts` (`resolveOwningTripId()`), `src/app/api/storage/[...path]/route.ts` (proxy read route). `src/lib/upload-policy.ts` stays unchanged (key naming, MIME/size validation).
- `StorageAdapter` interface is exactly: `put(key: string, file: File): Promise<string>`, `del(url: string): Promise<void>`, `read(key: string): Promise<ReadableStream<Uint8Array>>` — the Web Streams type (`node:stream/web`), not Node's `Readable`; a `node:fs`-backed adapter must convert via `Readable.toWeb()` before returning.
- The local adapter's proxy path is built by mapping the key's `/`-separated segments 1:1 onto the `[...path]` catch-all route segments, with no percent-encoding of the key — the route reconstructs the key via `params.path.join("/")`.
- The `reservations/actions.ts:210` call site currently batch-deletes an array of URLs in one `@vercel/blob` `del()` call; migrating to the new port means `Promise.allSettled(urls.map(url => adapter.del(url)))`, not `Promise.all`, to preserve today's best-effort-per-file semantics (a `Promise.all` would let one failing/orphaned URL block the whole batch).
- `read()`/`del()` need an explicit "key not found" story-level decision before the proxy route can distinguish 404 from 500 consistently across adapters (the architecture spine does not pin a shared not-found error type/sentinel) — resolve this as part of implementing the local adapter and proxy route, not left ad hoc per call site.
- `getStorageAdapter()`'s process-global singleton has no invalidation hook; adapter-specific Vitest suites (`local-filesystem-adapter.test.ts`, a future `s3-adapter.test.ts`) that `vi.stubEnv("STORAGE_PROVIDER", ...)` differently can leak across a shared Vitest worker process — needs either a test-only `__resetStorageAdapterCacheForTests()` export or a documented wholesale-mock convention, decided once and applied consistently.
- Out of scope this round (per brainstorm Won't / architecture Deferred — do not create stories for these): S3-compatible adapter build-out (Should, deferred), migration script (no legacy data exists yet), image resize/optimization, a dedicated Vercel Blob adapter, and the Docker entrypoint/PUID-PGID remap plumbing (chown/gosu/s6-overlay) that would make PUID/PGID env vars actually take effect at the container level.
- Standard project conventions still apply: new domain types (if any) go in `src/data/types.ts`; unit tests colocated next to source (`src/lib/**`) with matching `*.test.ts` in the same change, coverage thresholds ≥95% lines/functions / ≥90% branches apply to `src/lib/storage/**`; no single-letter variable names; no `any` types.

### UX Design Requirements

Not applicable — this is a backend/infrastructure migration with no new or changed user-facing UI. No UX design contract exists for this initiative.

### FR Coverage Map

FR-1: Epic 1 - StorageAdapter port and call-site migration
FR-2: Epic 1 - Local filesystem adapter
FR-3: Epic 1 - Env-var provider selection and config
FR-4: Epic 1 - Authenticated proxy read route
FR-5: Epic 1 - StorageAdapter port (key opacity)
FR-6: Epic 1 - StorageAdapter port (URL contract)
FR-7: Epic 1 - StorageAdapter port (del semantics) / Local filesystem adapter
FR-8: Epic 1 - Shared trip-ownership resolver
FR-9: Epic 1 - Authenticated proxy read route (Content-Type contract)
FR-10: Epic 1 - Call-site migration off UPLOAD_STUB

## Epic List

### Epic 1: Storage Adapter Foundation
Replace direct `@vercel/blob` calls with a `StorageAdapter` port and a default local-filesystem implementation, so Packt can run self-hosted in a Docker container against a bind-mounted volume, with storage backend chosen via env var and no secrets baked into the image.
**Requirements covered:** FR-1 through FR-10, NFR-1 through NFR-6

---

## Epic 1: Storage Adapter Foundation

Replace direct `@vercel/blob` calls with a `StorageAdapter` port and a default local-filesystem implementation, so Packt can run self-hosted in a Docker container against a bind-mounted volume, with storage backend chosen via env var and no secrets baked into the image.

### Story 1.1: StorageAdapter port and local filesystem adapter

As a developer maintaining Packt's storage layer,
I want a `StorageAdapter` port and a default local-filesystem implementation,
So that all file I/O for documents and cover images can go through one swappable abstraction instead of direct `@vercel/blob` calls.

**Acceptance Criteria:**

**Given** the `StorageAdapter` interface
**When** it's defined in `src/lib/storage/storage-adapter.ts`
**Then** it exposes exactly `put(key: string, file: File): Promise<string>`, `del(url: string): Promise<void>`, `read(key: string): Promise<ReadableStream<Uint8Array>>` (FR-1, FR-5, FR-6)

**Given** `getStorageAdapter()`
**When** it's called for the first time in a process
**Then** it validates the env vars required by the selected `STORAGE_PROVIDER` and throws a clear "missing X env var" error at that point, caching the resolved adapter on `globalThis` gated by `NODE_ENV !== "production"`, mirroring `src/db/index.ts`'s `__pgClient` pattern (NFR-1)

**Given** `STORAGE_PROVIDER` set to `local` (or another supported value)
**When** `getStorageAdapter()` resolves
**Then** it returns the corresponding adapter implementation selected purely by that env var, with no code change required at any call site to switch providers, and reads any provider-specific config/secrets from their own env vars only (FR-3)

**Given** `local-filesystem-adapter.ts`'s `put(key, file)`
**When** the write succeeds
**Then** it writes the file under `STORAGE_LOCAL_ROOT_DIR` at the given key path and returns a proxy path built by mapping the key's `/`-separated segments 1:1 onto `/api/storage/<segments>`, with no percent-encoding (FR-2, FR-6)

**Given** `local-filesystem-adapter.ts`'s `put(key, file)`
**When** the underlying filesystem write fails with `EACCES`/`EPERM`
**Then** the error is caught and re-thrown with an explicit message naming the path and pointing at a likely PUID/PGID mismatch, rather than silently succeeding or throwing a generic error (NFR-6)

**Given** `local-filesystem-adapter.ts`'s `del(url)`
**When** called with a URL the adapter recognizes as its own produced-URL shape
**Then** it attempts deletion and swallows/warns on failure rather than throwing (FR-7)

**Given** `local-filesystem-adapter.ts`'s `del(url)`
**When** called with a URL the adapter does not recognize (e.g. a leftover Vercel Blob URL)
**Then** it no-ops without throwing (FR-7)

**Given** `local-filesystem-adapter.ts`'s `read(key)`
**When** the key exists
**Then** it returns a Web `ReadableStream<Uint8Array>` (via `Readable.toWeb()` conversion from the underlying `node:fs` read stream), not a Node `Readable` (FR-1)

**Given** `local-filesystem-adapter.ts`'s `read(key)` or `del(url)`
**When** the underlying key/file does not exist
**Then** each method resolves a documented, consistent "not found" outcome so a caller can distinguish it from other errors (this story pins the taxonomy left open by the architecture review)

**Given** the codebase's ESLint config
**When** `no-restricted-imports` is applied
**Then** `node:fs`/`node:fs/promises` is disallowed everywhere except `local-filesystem-adapter.ts` (the `@vercel/blob` ban is completed in Story 1.4, once all call sites have migrated) (NFR-3)

**Given** a Vitest suite for `local-filesystem-adapter.ts` using `vi.stubEnv("STORAGE_PROVIDER", ...)`
**When** a second suite in the same worker stubs a different `STORAGE_PROVIDER` value
**Then** a documented test-isolation mechanism (a test-only reset export or a wholesale-mock convention) ensures the second suite does not silently reuse the first suite's cached adapter instance

### Story 1.2: Authenticated proxy read route

As a developer maintaining Packt's storage layer,
I want a trip-scoped authenticated proxy route that serves files from the local adapter,
So that uploaded documents and cover images render in the app without exposing a raw filesystem path.

**Acceptance Criteria:**

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

### Story 1.3: Migrate write-side call sites off UPLOAD_STUB

As a developer maintaining Packt's storage layer,
I want the six existing upload/delete action files to call the `StorageAdapter` port instead of branching on `UPLOAD_STUB`,
So that uploads and deletes work identically regardless of which backend is configured, with no duplicated per-file branching logic.

**Acceptance Criteria:**

**Given** `document-upload-actions.ts`, `cover-upload-actions.ts`, `reservation-document-actions.ts`, `trips/[tripId]/actions.ts`, `trips/actions.ts`, and `reservations/actions.ts`
**When** each action performs an upload or delete
**Then** it calls `getStorageAdapter().put()`/`.del()` exclusively, with no remaining `process.env.UPLOAD_STUB` branching or direct `@vercel/blob` import (FR-1, FR-10)

**Given** `cover-upload-actions.ts`'s existing `isBlobUploadUrl()` guard before deleting a previous cover image
**When** migrated to the port
**Then** the guard is removed and `del()` is called unconditionally, relying on the adapter's own recognized-URL check (FR-7)

**Given** `reservations/actions.ts`'s existing batch `del(urls)` call with an array of URLs
**When** migrated to the port
**Then** it becomes `Promise.allSettled(urls.map(url => adapter.del(url)))`, preserving today's best-effort-per-file semantics rather than `Promise.all`

**Given** `document-upload-actions.ts`'s `getEventTripId` and `reservation-document-actions.ts`'s `getReservationTripId`
**When** migrated
**Then** both call sites use the shared `resolveOwningTripId()` from Story 1.2 rather than their own inline lookup (FR-8)

**Given** any of the six migrated action files
**When** a mutation completes
**Then** it still calls `requireUser()`, `assertTripAccess()`, and `revalidatePath(\`/trips/\${tripId}\`)` exactly as before migration — the port migration changes only the storage call, not the existing auth/revalidation contract

**Given** the existing colocated unit tests for these six action files
**When** migrated
**Then** they mock `getStorageAdapter()` instead of mocking `@vercel/blob` / `UPLOAD_STUB` branching, and continue to pass with equivalent coverage

### Story 1.4: E2E and lint cutover

As a developer maintaining Packt's storage layer,
I want the E2E environment and lint rules to enforce the new storage abstraction exclusively,
So that tests exercise the real local adapter and no code can silently reintroduce a direct backend-SDK call.

**Acceptance Criteria:**

**Given** `playwright.config.ts`'s webServer env
**When** E2E tests run
**Then** `UPLOAD_STUB: "true"` is replaced with `STORAGE_PROVIDER=local` and `STORAGE_LOCAL_ROOT_DIR` pointed at an E2E-scoped scratch directory (NFR-4)

**Given** the E2E scratch directory
**When** the E2E suite runs (`global-setup.ts`)
**Then** it is created fresh (or cleaned) before each run, consistent with the existing DB wipe-and-reseed pattern, so uploaded test files don't leak between runs

**Given** `eslint.config.mjs`
**When** `no-restricted-imports` is finalized
**Then** `@vercel/blob` is disallowed everywhere in the codebase with no remaining exceptions, and `node:fs`/`node:fs/promises` remains disallowed outside `local-filesystem-adapter.ts` (NFR-3)

**Given** `package.json`
**When** Story 1.3's call sites no longer import `@vercel/blob` anywhere
**Then** the `@vercel/blob` dependency is removed from `package.json` and the lockfile

**Given** the affected E2E suite (`test:e2e:affected`) and unit test coverage thresholds
**When** run after this story
**Then** they pass against the local adapter with no references to the removed `UPLOAD_STUB` flag remaining anywhere in the codebase

---
baseline_commit: 2ba24b81bd3af6ef3771f02967ed5468546e1b40
---

# Story 1.1: StorageAdapter Port and Local Filesystem Adapter

Status: review

## Story

As a developer maintaining Packt's storage layer,
I want a `StorageAdapter` port and a default local-filesystem implementation,
So that all file I/O for documents and cover images can go through one swappable abstraction instead of direct `@vercel/blob` calls.

## Acceptance Criteria

**Given** the `StorageAdapter` interface
**When** it's defined in `src/lib/storage/storage-adapter.ts`
**Then** it exposes exactly `put(key: string, file: File): Promise<string>`, `del(url: string): Promise<void>`, `read(key: string): Promise<ReadableStream<Uint8Array>>` (Web Streams type, not Node `Readable`) (FR-1, FR-5, FR-6)

**Given** `getStorageAdapter()`
**When** it's called for the first time in a process
**Then** it validates the env vars required by the selected `STORAGE_PROVIDER` and throws a clear "missing X env var" error at that point, caching the resolved adapter on `globalThis` gated by `NODE_ENV !== "production"`, mirroring `src/db/index.ts`'s `__pgClient` pattern (NFR-1)

**Given** `STORAGE_PROVIDER` set to `local` (or another supported value)
**When** `getStorageAdapter()` resolves
**Then** it returns the corresponding adapter implementation selected purely by that env var, with no code change required at any call site to switch providers, and reads any provider-specific config/secrets from their own env vars only (FR-3)

**Given** `local-filesystem-adapter.ts`'s `put(key, file)`
**When** the write succeeds
**Then** it writes the file under `STORAGE_LOCAL_ROOT_DIR` at the given key path and returns a proxy path built by mapping the key's `/`-separated segments 1:1 onto `/api/storage/<segments>` (raw, not percent-encoded), e.g. `event-documents/abc-123/uuid.jpg` becomes `/api/storage/event-documents/abc-123/uuid.jpg` (FR-2, FR-6)

**Given** `local-filesystem-adapter.ts`'s `put(key, file)`
**When** the underlying filesystem write fails with `EACCES`/`EPERM`
**Then** the error is caught and re-thrown with an explicit message naming the full path and pointing at a likely PUID/PGID mismatch, rather than silently succeeding or throwing a generic error (NFR-6, AD-8)

**Given** `local-filesystem-adapter.ts`'s `del(url)`
**When** called with a URL the adapter recognizes as its own produced-URL shape (starts with `/api/storage/`)
**Then** it attempts deletion of the corresponding file on disk and swallows/warns on failure rather than throwing (FR-7, AD-4)

**Given** `local-filesystem-adapter.ts`'s `del(url)`
**When** called with a URL the adapter does not recognize (e.g. a leftover Vercel Blob URL like `https://*.blob.vercel-storage.com/...`)
**Then** it no-ops silently without throwing (FR-7, AD-4)

**Given** `local-filesystem-adapter.ts`'s `read(key)`
**When** the key exists on disk
**Then** it returns a Web `ReadableStream<Uint8Array>` (converted from `node:fs` via `Readable.toWeb()`), not a Node `Readable` (FR-1, Finding 2 fix)

**Given** `local-filesystem-adapter.ts`'s `read(key)`
**When** the underlying file does not exist
**Then** it throws a `StorageNotFoundError` (a shared error type exported from `storage-adapter.ts`)

**Given** the codebase's ESLint config
**When** `no-restricted-imports` is applied
**Then** `node:fs`/`node:fs/promises` is disallowed everywhere except `local-filesystem-adapter.ts` (`@vercel/blob` ban is completed in Story 1.4) (NFR-3)

**Given** a Vitest suite for `local-filesystem-adapter.ts` using `vi.stubEnv("STORAGE_PROVIDER", ...)`
**When** a second suite in the same worker stubs a different `STORAGE_PROVIDER` value
**Then** calling `__resetStorageAdapterCacheForTests()` before each test ensures the second suite does not silently reuse the first suite's cached adapter instance

## Tasks / Subtasks

- [x] Task 1: Add `UPLOAD_SCOPE_PREFIXES` reverse-map helpers to `upload-policy.ts` (AC: Content-Type + trip-resolution)
  - [x] Export `UPLOAD_SCOPE_PREFIXES` (currently private) so `trip-resolution.ts` and the proxy route (Story 1.2) can access it
  - [x] Add `UPLOAD_SCOPE_PREFIX_REVERSE: Record<string, UploadScope>` — maps plural prefix (`"event-documents"`) back to singular scope (`"event-document"`)
  - [x] Add `getUploadScopePrefix(scope: UploadScope): string` accessor (preferred over direct map access for clarity)
  - [x] Add `parseUploadStorageName(key: string): { scope: UploadScope; ownerId: string; filename: string }` — parses a `{scope-prefix}/{ownerId}/{uuid}.{ext}` key back into its components; throws on malformed keys (owned by AD-2/AD-6)
  - [x] Update `upload-policy.test.ts` with tests for new exports

- [x] Task 2: Create `src/lib/storage/storage-adapter.ts` (AC: StorageAdapter interface, getStorageAdapter, StorageNotFoundError)
  - [x] Define and export `StorageNotFoundError extends Error` — thrown by `read()`/`del()` when a key is not found; message defaults to the key string
  - [x] Define and export `StorageAdapter` interface with exactly: `put(key: string, file: File): Promise<string>`, `del(url: string): Promise<void>`, `read(key: string): Promise<ReadableStream<Uint8Array>>`
  - [x] Implement `getStorageAdapter(): StorageAdapter` — lazily-validated singleton cached on `globalThis.__storageAdapter`, gated by `NODE_ENV !== "production"`, mirroring `src/db/index.ts` pattern
  - [x] On first resolution, read `STORAGE_PROVIDER` env var; if `"local"`, validate `STORAGE_LOCAL_ROOT_DIR` is set (throw clear error if missing); construct and cache adapter
  - [x] If `STORAGE_PROVIDER` is missing or unsupported, throw with a clear message naming the var and the valid values
  - [x] Export `__resetStorageAdapterCacheForTests(): void` — sets `globalThis.__storageAdapter = undefined`; `@internal` JSDoc tag; must NOT be imported in production code
  - [x] Create `src/lib/storage/storage-adapter.test.ts` — test singleton behavior, missing env var errors, reset helper

- [x] Task 3: Create `src/lib/storage/local-filesystem-adapter.ts` (AC: local adapter put/del/read)
  - [x] Import only from `node:fs/promises` and `node:stream/web` (this is the ONLY file allowed to import `node:fs`)
  - [x] Implement `createLocalFileSystemAdapter(rootDir: string): StorageAdapter`
  - [x] `put(key, file)`: ensure parent dirs via `mkdir(recursive)`, write via `writeFile`, return `/api/storage/${key}` (raw segments, no percent-encoding); catch `EACCES`/`EPERM` and re-throw with message naming `join(rootDir, key)` and PUID/PGID hint
  - [x] `del(url)`: check if url starts with `/api/storage/` — if not, return (no-op); if yes, extract key as `url.slice("/api/storage/".length)`, attempt `unlink`, swallow errors with `console.warn`
  - [x] `read(key)`: `createReadStream(join(rootDir, key))`, convert via `Readable.toWeb()` and return; catch `ENOENT` and throw `StorageNotFoundError`
  - [x] Create `src/lib/storage/local-filesystem-adapter.test.ts`:
    - `put()`: writes file to correct path under rootDir, returns correct proxy URL, handles subdirectory creation
    - `put() EACCES`: re-throws with explicit PUID/PGID message (mock `fs.writeFile` to throw EACCES)
    - `del()`: deletes file when URL matches `/api/storage/` prefix; no-ops for non-matching URLs; swallows errors on real URLs
    - `read()`: returns correct bytes as `ReadableStream<Uint8Array>` for existing files; throws `StorageNotFoundError` for missing files

- [x] Task 4: Create `src/lib/storage/trip-resolution.ts` (AC: resolveOwningTripId)
  - [x] Implement `resolveOwningTripId(key: string): Promise<string>` — single source of truth for key→tripId resolution (AD-6)
  - [x] Use `parseUploadStorageName(key)` from `upload-policy.ts` to extract scope + ownerId
  - [x] For scope `"trip-document"` or `"trip-cover"`: ownerId is the tripId directly
  - [x] For scope `"event-document"`: query `events` table to get `tripId` from `eventId` (ownerId)
  - [x] For scope `"reservation-document"`: query `reservations` table to get `tripId` from `reservationId` (ownerId)
  - [x] Throw `Error("Event not found")` or `Error("Reservation not found")` if the record doesn't exist — matching the exact error messages currently in `document-upload-actions.ts:15` and `reservation-document-actions.ts` respectively
  - [x] Create `src/lib/storage/trip-resolution.test.ts`:
    - Tests each scope type correctly resolves to a tripId
    - Throws on malformed key (via parseUploadStorageName throwing)
    - Throws on missing event/reservation record

- [x] Task 5: Add ESLint `no-restricted-imports` rule for `node:fs` (AC: NFR-3 partial)
  - [x] Add `no-restricted-imports` rule in `eslint.config.mjs`: disallow `node:fs` and `node:fs/promises` everywhere
  - [x] Add override allowing `node:fs` and `node:fs/promises` in `src/lib/storage/local-filesystem-adapter.ts`
  - [x] Verify existing `src/lib/local-upload.ts` (which imports `node:fs/promises`) — this is existing code that must continue to work; if it breaks the new rule, add it to the allow-list alongside `local-filesystem-adapter.ts` as a temporary exception (it will be cleaned up when `local-upload.ts` is deprecated in a future story)

## Dev Notes

### Architecture Invariants (Must Follow)

| AD | Rule | Impact on This Story |
|----|------|---------------------|
| AD-1 | All file I/O goes through `StorageAdapter` port | Interface defined here; call-site migration is Story 1.3 |
| AD-2 | Key naming stays in `upload-policy.ts`; adapters are byte-opaque | `parseUploadStorageName()` goes in `upload-policy.ts`; adapter never interprets key semantics |
| AD-3 | DB stores ready-to-render URL, not bare key | `put()` returns `/api/storage/{key}` for local adapter; no separate key column |
| AD-4 | `del()` is unconditionally safe | Adapter no-ops on unrecognized URLs; swallows errors on recognized ones (contrast AD-8: applies to `put()` only) |
| AD-6 | One shared `resolveOwningTripId()`, never reimplemented | Lives in `trip-resolution.ts`; proxy route and write-side actions both import from here |
| AD-7 | `getStorageAdapter()` is a lazily-validated singleton | Mirrors `src/db/index.ts` pattern exactly: `globalThis.__storageAdapter`, `NODE_ENV !== "production"` gate |
| AD-8 | Local adapter's `put()` fails loudly on EACCES/EPERM | Only applies to `put()`, NOT `del()` — see AD-4 for `del()`'s best-effort semantics |
| AD-9 | Content-Type set by proxy route from key extension | Out of scope this story (Story 1.2); `read()` returns raw bytes only |

### Adversarial Review Findings Resolved in This Story

| Finding | Resolution |
|---------|-----------|
| Finding 1 (AD-4/AD-8 conflict on `del()` permission errors) | AD-8 applies only to `put()`. `del()` follows AD-4: best-effort, swallow-and-warn. Story ACs explicitly state this split. |
| Finding 2 (`read()` stream type ambiguity) | Interface pins `ReadableStream<Uint8Array>` (Web Streams). Adapter converts via `Readable.toWeb()`. |
| Finding 3 (`resolveOwningTripId` signature unpinned) | Signature: `resolveOwningTripId(key: string): Promise<string>`. Takes raw key string, throws on not-found. Key parsing owned by `parseUploadStorageName()` in `upload-policy.ts`. |
| Finding 4 (proxy URL encoding) | `put()` embeds key segments raw (no percent-encoding). Story AC explicitly states this. |
| Finding 6 (no "not found" error type) | `StorageNotFoundError` added as shared error class exported from `storage-adapter.ts`. |
| Finding 7 (singleton test isolation) | `__resetStorageAdapterCacheForTests()` exported from `storage-adapter.ts`. Documented as test-only. |
| Finding 8 (batch `del()` semantics) | Story 1.3 concern (migrating call sites); `Promise.allSettled` pattern noted in epics. |
| Finding 9 (foreign-backend URL in `del()`) | `del()` no-ops on URLs not matching its own prefix (`/api/storage/`). |

### Files Created (NEW)

| File | Purpose |
|------|---------|
| `src/lib/storage/storage-adapter.ts` | `StorageAdapter` interface, `StorageNotFoundError`, `getStorageAdapter()`, `__resetStorageAdapterCacheForTests()` |
| `src/lib/storage/local-filesystem-adapter.ts` | `createLocalFileSystemAdapter()` — the default local adapter (only file allowed to import `node:fs`) |
| `src/lib/storage/trip-resolution.ts` | `resolveOwningTripId()` — shared key→tripId resolver for read and write paths |
| `src/lib/storage/storage-adapter.test.ts` | Tests for singleton, env validation, reset helper |
| `src/lib/storage/local-filesystem-adapter.test.ts` | Tests for put/del/read + EACCES error + not-found |
| `src/lib/storage/trip-resolution.test.ts` | Tests for each scope type + error cases |

### Files Updated (MODIFY)

| File | Change |
|------|--------|
| `src/lib/upload-policy.ts` | Export `UPLOAD_SCOPE_PREFIXES`; add `UPLOAD_SCOPE_PREFIX_REVERSE`, `getUploadScopePrefix()`, `parseUploadStorageName()` |
| `src/lib/upload-policy.test.ts` | Add tests for new exports |
| `eslint.config.mjs` | Add `no-restricted-imports` rule for `node:fs` with exception for `local-filesystem-adapter.ts` and existing `local-upload.ts` |

### Key Patterns to Follow (From Existing Code)

**Singleton pattern** (`src/db/index.ts:9-10`):
```ts
const client = globalThis.__pgClient ?? postgres(process.env.DATABASE_URL!);
if (process.env.NODE_ENV !== "production") globalThis.__pgClient = client;
```
Mirror this exactly for `getStorageAdapter()`, gating the `globalThis` write on `NODE_ENV !== "production"`.

**Test mocking pattern** (`src/app/(app)/trips/[tripId]/document-upload-actions.test.ts`):
- Use `vi.hoisted()` for mock references
- Use `vi.mock()` at top level
- `vi.stubEnv("UPLOAD_STUB", "true")` for env overrides
- `vi.restoreAllMocks()` / `vi.unstubAllEnvs()` in `afterEach`

**Error messages** to preserve (for `resolveOwningTripId`):
- Event not found: `"Event not found"` (matches `document-upload-actions.ts:15`)
- Reservation not found: throw matching current pattern in `reservation-document-actions.ts`

**Key shape** (`upload-policy.ts:85-88`):
```
{scope-prefix}/{ownerId}/{uuid}.{ext}
e.g. "event-documents/abc-123/uuid-456.jpg"
```
Scope prefixes: `event-documents`, `reservation-documents`, `trip-covers`, `trip-documents`

### Database Tables Referenced

- `events` table: `id` (UUID PK), `tripId` (UUID FK→trips) — used by `resolveOwningTripId` for `event-document` scope
- `reservations` table: `id` (UUID PK), `tripId` (UUID FK→trips) — used by `resolveOwningTripId` for `reservation-document` scope
- `trips` table: `id` (UUID PK), `ownerId` (UUID FK→users) — direct scope for `trip-document`/`trip-cover`

### Testing Requirements

- Unit tests colocated next to source: `src/lib/storage/foo.ts` → `src/lib/storage/foo.test.ts`
- Coverage thresholds: ≥95% lines/functions, ≥90% branches across `src/lib/storage/**` (falls under `src/lib/**` coverage include)
- `// @vitest-environment node` directive needed for tests touching `node:fs`
- Global mocks for `next/navigation` and `next/headers` already in `vitest.setup.mts` — don't re-mock per file
- Mock `@/db` and `@/db/schema` (for `trip-resolution.test.ts`) following existing patterns
- Mock `node:fs/promises` in `local-filesystem-adapter.test.ts` for EACCES/permission tests

### References

- [Source: `_bmad-output/planning-artifacts/architecture/architecture-packt-2026-08-16/ARCHITECTURE-SPINE.md`] — AD-1 through AD-9
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-packt-2026-08-16/reviews/review-adversarial.md`] — Findings 1-9 and their fixes
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-packt-2026-08-16/reviews/review-reality-check.md`] — Verified claims and corrections
- [Source: `_bmad-output/planning-artifacts/epics-storage-adapter.md`] — Story 1.1 acceptance criteria, FR-1 through FR-10
- [Source: `src/lib/upload-policy.ts`] — Existing key naming, MIME tables, `createUploadStorageName()`
- [Source: `src/db/index.ts`] — Singleton pattern to mirror for `getStorageAdapter()`
- [Source: `src/lib/local-upload.ts`] — Existing local upload behavior (being superseded, but keep import-exception during transition)
- [Source: `src/app/(app)/trips/[tripId]/document-upload-actions.ts`] — Current `UPLOAD_STUB` branching pattern (Story 1.3 will migrate)
- [Source: `src/app/(app)/trips/[tripId]/document-upload-actions.test.ts`] — Test mocking patterns to follow

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

None — implementation proceeded without needing a debug log; each task's tests were written red, confirmed failing, then made to pass.

### Completion Notes List

- Task 1: Exported `UPLOAD_SCOPE_PREFIXES`, added `UPLOAD_SCOPE_PREFIX_REVERSE`, `getUploadScopePrefix()`, `parseUploadStorageName()` in `upload-policy.ts`, with round-trip and malformed-key tests.
- Task 2: Created `storage-adapter.ts` with `StorageAdapter` interface, `StorageNotFoundError`, and a lazily-validated `getStorageAdapter()` singleton mirroring `src/db/index.ts`'s `globalThis.__pgClient` gate; `__resetStorageAdapterCacheForTests()` clears both the module-scope cache and `globalThis` so per-suite `STORAGE_PROVIDER` stubs don't leak between test files.
- Task 3: Created `local-filesystem-adapter.ts` — `put()` writes via `mkdir`+`writeFile` and returns the raw `/api/storage/{key}` proxy path, re-throwing `EACCES`/`EPERM` with the full path and a PUID/PGID hint; `del()` no-ops on URLs outside its own `/api/storage/` prefix and swallows/warns on failed deletes of recognized ones; `read()` pre-checks existence via `stat` (throwing `StorageNotFoundError` on `ENOENT`) then streams via `Readable.toWeb(createReadStream(...))`.
- Task 4: Created `trip-resolution.ts` — `resolveOwningTripId()` resolves `trip-document`/`trip-cover` directly from the parsed `ownerId`, and looks up `events`/`reservations` for `event-document`/`reservation-document`, preserving the exact existing error strings (`"Event not found"`, `"Reservation not found."`).
- Task 5: Added a `no-restricted-imports` ESLint rule banning `node:fs`/`node:fs/promises` project-wide, with an override for `local-filesystem-adapter.ts` (+ its test) and the pre-existing `local-upload.ts`. Verified with an ad hoc probe file that the rule fires outside the allow-list and stays clean inside it.
- All new tests run green together (`src/lib/storage/**`, `upload-policy.test.ts`) with no regressions to existing suites in those files.

### File List

- `src/lib/storage/storage-adapter.ts` (new)
- `src/lib/storage/storage-adapter.test.ts` (new)
- `src/lib/storage/local-filesystem-adapter.ts` (new)
- `src/lib/storage/local-filesystem-adapter.test.ts` (new)
- `src/lib/storage/trip-resolution.ts` (new)
- `src/lib/storage/trip-resolution.test.ts` (new)
- `src/lib/upload-policy.ts` (modified)
- `src/lib/upload-policy.test.ts` (modified)
- `eslint.config.mjs` (modified)

### Change Log

- 2026-08-16: Implemented `StorageAdapter` port, local filesystem adapter, `resolveOwningTripId()`, `upload-policy.ts` key-parsing helpers, and the `node:fs` ESLint import restriction (Tasks 1-5).

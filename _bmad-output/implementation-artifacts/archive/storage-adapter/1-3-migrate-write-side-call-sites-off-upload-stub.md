---
title: "Story 1.3: Migrate write-side call sites off UPLOAD_STUB"
type: "refactor"
created: "2026-08-17"
status: "done"
review_loop_iteration: 0
context: []
baseline_commit: b1cbe6c9e9226d1223ee654808cbc3ff33eacb6e
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Six action files still branch on `process.env.UPLOAD_STUB` and call `@vercel/blob` directly, bypassing the `StorageAdapter` port built in Stories 1.1-1.2 (FR-1, FR-10).

**Approach:** Replace every direct blob call and stub branch with `getStorageAdapter().put()/.del()`; delete-side `UPLOAD_STUB` guards and `isBlobUploadUrl()` checks become unconditional `del()` calls (the adapter no-ops on unrecognized URLs, FR-7); the single array `del(blobUrls)` call becomes `Promise.allSettled(urls.map(url => adapter.del(url)))`; `getEventTripId`/`getReservationTripId` adopt the shared `resolveOwningTripId()` (FR-8).

## Boundaries & Constraints

**Always:**
- No action file may import `@vercel/blob` or branch on `process.env.UPLOAD_STUB` after this story.
- Keys still come exclusively from `createUploadStorageName()` (FR-5); the auth/revalidation contract (`requireUser()` → `assertTripAccess(..., "editor")` → `revalidatePath`) stays exactly as-is at every mutation.
- `del()` is called unconditionally at every delete site — never re-gated on URL shape or stub flag; the adapter's own recognition check decides (FR-7).
- The six colocated action test files migrate to mocking `getStorageAdapter()` in the same change.
- `STORAGE_PROVIDER=local` + `STORAGE_LOCAL_ROOT_DIR` must be wired into the E2E webServer env (`playwright.config.ts`) and `.env.example` in this story — once the action files stop reading `UPLOAD_STUB`, `getStorageAdapter()` throws on missing env vars and dev/E2E uploads break. `UPLOAD_STUB` stays in place (now dead) until Story 1.4 removes it.

**Ask First:**
- Mapbox cover key in `createTrip` currently uses a hardcoded `mapbox-covers/{tripId}.jpg` — outside the `createUploadStorageName` scheme and unresolvable by `resolveOwningTripId` (unknown prefix → `MalformedKeyError` → proxy route 400s the cover render). Proposal: generate via `createUploadStorageName("trip-cover", tripId, "image/jpeg")`. HALT if you disagree.

**Never:**
- No changes to the `StorageAdapter` interface, adapters, `upload-policy.ts`, or `trip-resolution.ts` — migration only.
- No removal of the `@vercel/blob` package, no `no-restricted-imports` finalization, no E2E env cutover — those are Story 1.4.
- Do not delete `src/lib/local-upload.ts` or its eslint override in this story (dead after migration; cleanup is 1.4).
- The duplicated `getEventTripId` in `[tripId]/actions.ts` (DB-only flows, no storage key involved) stays — `resolveOwningTripId()` is key-based and does not apply.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| ---------- | ------------- | -------------------------- | -------------- |
| HAPPY_PATH | Upload/delete mutation in any of the six files | `getStorageAdapter().put()/del()` called; URL persisted to `documents.url` / `coverImageUrl` | adapter `put()` failures rethrow (fail-loud) |
| LEGACY_URL_DELETE | `del(url)` where url is legacy (`/uploads/...` or `https://...blob.vercel-storage.com/...`) | no-op, no throw | adapter recognizes only its own `/api/storage/` shape |
| BATCH_DELETE | `deleteReservation` with multiple doc URLs | `Promise.allSettled(urls.map(url => adapter.del(url)))` — one failure cannot block the others | allSettled per-file |
| MAPBOX_COVER | `createTrip` creating a mapbox cover | `put` via `createUploadStorageName("trip-cover", tripId, "image/jpeg")`; stored URL resolvable by the proxy route | adapter `put()` failure → createTrip fails (same as today) |

</frozen-after-approval>

## Code Map

- `src/app/(app)/trips/[tripId]/document-upload-actions.ts` — put stub branches L34-39 (trip-document), L61-66 (event-document); `getEventTripId` L13-17 → `resolveOwningTripId(key)`; auth/revalidate L42, L69
- `src/app/(app)/trips/[tripId]/cover-upload-actions.ts` — put stub branch L32-38; `isBlobUploadUrl` old-cover guard L45-49; rollback del L51-55
- `src/app/(app)/trips/[tripId]/reservations/reservation-document-actions.ts` — precomputed `isStub` L33, ternary put L35-37; rollback `if (!isStub)` del L50-55; remove-doc guard del L74-81; `getReservationTripId` L13-20 → `resolveOwningTripId(key)`
- `src/app/(app)/trips/[tripId]/actions.ts` — `del` import L21; guard+per-url del sites L205-214 (deleteEvent), L230-241 (deleteEventWithDocDecision), L380-416 (removeLastDay), L713-724 (removeDocument); wrappers delegate uploads L465-467, L828-834; local `getEventTripId` L73-77 stays
- `src/app/(app)/trips/actions.ts` — dynamic `put` import L320 (mapbox cover, hardcoded key); dynamic `del` imports L619, L645; guard+per-url del L617-628 (updateTripMetadata), L643-649 (deleteTrip)
- `src/app/(app)/trips/[tripId]/reservations/actions.ts` — `del` import L4; array `del(blobUrls)` L210 in `deleteReservation` (docs selected L205, `filter(Boolean)` L206)
- `src/lib/storage/storage-adapter.ts` — `getStorageAdapter()`, `StorageAdapter` interface `{ put, del, read }`, `StorageNotFoundError`, test-only `__resetStorageAdapterCacheForTests()`; only provider `local`
- `src/lib/storage/trip-resolution.ts` — `resolveOwningTripId(key)`; `trip-document`/`trip-cover` → ownerId direct, `event-document`/`reservation-document` → DB lookup; throws `MalformedKeyError`/`Event not found`/`Reservation not found.`
- `src/lib/upload-policy.ts` — `createUploadStorageName(scope, ownerId, mimeType)` L153; scope prefixes L55-60 (`trip-documents`, `event-documents`, `reservation-documents`, `trip-covers`)
- `playwright.config.ts` — webServer env L35 currently `UPLOAD_STUB: "true"` only; must add `STORAGE_PROVIDER` + `STORAGE_LOCAL_ROOT_DIR`
- `.env.example` — no storage env entries yet; add both vars (dev `.env` is gitignored, set locally)
- Tests to migrate (mock `getStorageAdapter`, drop `@vercel/blob` mocks + `UPLOAD_STUB` stubs): `document-upload-actions.test.ts`, `cover-upload-actions.test.ts`, `reservation-document-actions.test.ts`, `[tripId]/actions.test.ts`, `trips/actions.test.ts`, `[tripId]/reservations/actions.test.ts`

## Tasks & Acceptance

**Execution:**

- [x] `document-upload-actions.ts` — replace both put stub branches with `getStorageAdapter().put(storageName, file)`; drop `getEventTripId` in favor of `resolveOwningTripId(storageName)` for the access check — FR-1/FR-8/FR-10
- [x] `cover-upload-actions.ts` — put via adapter; old-cover cleanup → unconditional `del(previousUrl)`; rollback → unconditional `del(uploadedUrl)` — FR-1/FR-7
- [x] `reservation-document-actions.ts` — put via adapter (drop `isStub`); rollback + remove-doc → unconditional `del`; `getReservationTripId` → `resolveOwningTripId(storageName)` — FR-1/FR-7/FR-8
- [x] `[tripId]/actions.ts` — remove `@vercel/blob` import; four delete sites → unconditional `Promise.all(urls.map(url => adapter.del(url)))` — FR-1/FR-7
- [x] `trips/actions.ts` — replace dynamic imports with `getStorageAdapter()`; mapbox cover key → `createUploadStorageName("trip-cover", tripId, "image/jpeg")`; two delete sites unconditional — FR-5/FR-10
- [x] `[tripId]/reservations/actions.ts` — array `del(blobUrls)` → `Promise.allSettled(urls.map(url => adapter.del(url)))` — FR-7
- [x] Six colocated test files — replace `@vercel/blob` mocks and `UPLOAD_STUB` stubs with a `vi.mock("@/lib/storage/storage-adapter")` `getStorageAdapter` mock; assert `del()` is invoked unconditionally on legacy URLs (no-op behavior asserted at adapter level) — test contract
- [x] `playwright.config.ts` + `.env.example` — add `STORAGE_PROVIDER=local` and `STORAGE_LOCAL_ROOT_DIR` to the E2E webServer env and `.env.example`; keep `UPLOAD_STUB` until 1.4 — runtime prerequisite (adapter throws without them)

**Acceptance Criteria:**

- Given any of the six action files, when it performs an upload or delete, then it calls `getStorageAdapter().put()/.del()` exclusively with no remaining `UPLOAD_STUB` branching or `@vercel/blob` import (FR-1, FR-10).
- Given the E2E webServer and a dev environment, when an upload action runs, then `STORAGE_PROVIDER`/`STORAGE_LOCAL_ROOT_DIR` are set so `getStorageAdapter()` resolves (no throw).
- Given `cover-upload-actions.ts` deleting a previous cover, when the previous URL is legacy (blob/local), then `del()` still runs and the adapter no-ops (FR-7).
- Given `deleteReservation` with multiple URLs, when one deletion fails, then the remaining deletions still complete (`Promise.allSettled`).
- Given the mapbox cover upload in `createTrip`, when a cover is created, then the stored URL is proxy-resolvable via `resolveOwningTripId` (trip-cover scope).
- Given any migrated mutation, when it completes, then `requireUser()`, `assertTripAccess()`, and `revalidatePath(...)` behave exactly as before migration.
- Given the six migrated test files, when run, then they mock `getStorageAdapter()` and pass with equivalent coverage.

## Spec Change Log

_Empty until the first review loopback._

## Design Notes

- Adapter `del()` contractually never throws (recognized → swallow + `console.warn`; unrecognized → no-op), so delete sites drop both the `UPLOAD_STUB` gate and the per-call `.catch(console.warn)`; the one exception is `deleteReservation`'s array call, which uses `Promise.allSettled` per the epic to preserve best-effort-per-file semantics.
- Resolver adoption ordering: the storage key is generated before the put, so the flow is `key = createUploadStorageName(...)` → `tripId = await resolveOwningTripId(key)` → `assertTripAccess(tripId, ...)` → `put(key, file)` — the event/reservation id is already the key's owner segment.
- Mapbox cover: `mapbox-covers/{tripId}.jpg` is unresolvable by `resolveOwningTripId` (unknown prefix → `MalformedKeyError` → proxy 400), so it must move to the `trip-cover` scope or the rendered cover breaks after cutover (FR-5).

## Verification

**Commands:**

- `npx vitest run src/app/\(app\)/trips --reporter=dot` — expected: all six migrated action suites pass
- `npx eslint src/app/\(app\)` — expected: clean, no remaining `@vercel/blob` imports
- `npx tsc --noEmit` — expected: clean
- `npx vitest run --coverage` — expected: ≥95% lines/functions, ≥90% branches
- `packt-build-validator` — expected: lint, types, coverage, build, affected E2E all pass

## Suggested Review Order

**Port adoption — put/delete through the adapter**

- Entry point: cover replace flow shows the whole pattern — put via adapter, unconditional del, contained rollback
  [`cover-upload-actions.ts:31`](../../src/app/(app)/trips/[tripId]/cover-upload-actions.ts#L31)

- Trip-document upload, simplest stub-branch removal
  [`document-upload-actions.ts:25`](../../src/app/(app)/trips/[tripId]/document-upload-actions.ts#L25)

**Resolver adoption (FR-8)**

- Event upload resolves the owning trip from the key instead of a private helper
  [`document-upload-actions.ts:43`](../../src/app/(app)/trips/[tripId]/document-upload-actions.ts#L43)

- Reservation upload: same adoption, tripId now flows from the resolver into insert + revalidate
  [`reservation-document-actions.ts:31`](../../src/app/(app)/trips/[tripId]/reservations/reservation-document-actions.ts#L31)

**Delete-site best-effort cleanup (FR-7)**

- Representative of four sites in this file: unconditional per-url del, rejection contained so the mutation and revalidate always run
  [`actions.ts:215`](../../src/app/(app)/trips/[tripId]/actions.ts#L215)

- Array delete becomes allSettled per URL — one failure can't block the others
  [`reservations/actions.ts:209`](../../src/app/(app)/trips/[tripId]/reservations/actions.ts#L209)

- Previous-cover del rejection no longer rolls back a successful upload
  [`cover-upload-actions.ts:41`](../../src/app/(app)/trips/[tripId]/cover-upload-actions.ts#L41)

**Mapbox cover key (FR-5)**

- Hardcoded `mapbox-covers/{tripId}.jpg` moves to `createUploadStorageName("trip-cover", ...)` so the proxy route can resolve it
  [`trips/actions.ts:319`](../../src/app/(app)/trips/actions.ts#L319)

**Env wiring**

- E2E webServer now provides the adapter env vars (UPLOAD_STUB kept until 1.4)
  [`playwright.config.ts:36`](../../playwright.config.ts#L36)

- Documented env contract for self-hosted storage root
  [`.env.example`](../../.env.example)

**E2E serving contract**

- Reloaded cover must actually render through the proxy — image load is polled, not just the src attribute
  [`trip-cover-overflow.steps.ts:132`](../../tests/e2e/steps/trip-cover-overflow.steps.ts#L132)

**Tests**

- Adapter-level pin: non-ENOENT unlink failure swallowed with warning — the contract call sites rely on
  [`local-filesystem-adapter.test.ts:107`](../../src/lib/storage/local-filesystem-adapter.test.ts#L107)

- Previous-cover del rejection still succeeds without rollback
  [`cover-upload-actions.test.ts:157`](../../src/app/(app)/trips/[tripId]/cover-upload-actions.test.ts#L157)

- AllSettled per-URL semantics under a rejecting del
  [`reservations/actions.test.ts:1155`](../../src/app/(app)/trips/[tripId]/reservations/actions.test.ts#L1155)

- removeDocument row delete survives a rejecting del
  [`actions.test.ts:1125`](../../src/app/(app)/trips/[tripId]/actions.test.ts#L1125)

- Mapbox cover put now asserted with trip-cover key + File
  [`trips/actions.test.ts:991`](../../src/app/(app)/trips/actions.test.ts#L991)
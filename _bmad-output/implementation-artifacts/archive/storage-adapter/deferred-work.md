# Deferred Work

## Deferred from: code review of 1-1-storageadapter-port-and-local-filesystem-adapter (2026-08-16)

- `getStorageAdapter()` caches forever, ignores env changes [`storage-adapter.ts:40-50`] — mirrors existing `src/db/index.ts` singleton pattern exactly; not actionable for this story
- ESLint override references `local-upload.ts` (pre-existing) [`eslint.config.mjs:40-41`] — existing code to be cleaned up in Story 1.4
- `put()` buffers entire file into memory [`local-filesystem-adapter.ts:20`] — documented tradeoff; streaming is a future optimization, not an acceptance criterion

## Deferred from: code review of 1-2-authenticated-proxy-read-route (2026-08-17)

- `Content-Disposition: inline` posture [`route.ts:31`] — intentional for image/document preview; low practical risk with current extension allowlist
- `user.id!` non-null assertion [`route.ts:20`] — `requireUser()` guarantees presence; safe per existing project convention
- `as never` cast in test helpers [`route.test.ts:48+`] — pre-existing pattern; low risk since route signature is stable
- No `Cache-Control` header [`route.ts:28-33`] — content is images/documents not sensitive tokens; low practical risk

## Deferred from: code review of 1-3-migrate-write-side-call-sites-off-upload-stub (2026-08-17)

- Server-action-level unit tests asserting `del()` invocation for `deleteTrip`/`updateTripMetadata` cleanup paths — verification-gap review: `trips/actions.test.ts` never asserts `adapterDel` for those two; E2E trip-delete covers the flow, but the del call is unpinned at unit level before and after the migration

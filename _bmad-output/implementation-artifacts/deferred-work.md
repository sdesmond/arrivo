# Deferred Work

## Deferred from: code review of 1-1-storageadapter-port-and-local-filesystem-adapter (2026-08-16)

- `getStorageAdapter()` caches forever, ignores env changes [`storage-adapter.ts:40-50`] — mirrors existing `src/db/index.ts` singleton pattern exactly; not actionable for this story
- ESLint override references `local-upload.ts` (pre-existing) [`eslint.config.mjs:40-41`] — existing code to be cleaned up in Story 1.4
- `put()` buffers entire file into memory [`local-filesystem-adapter.ts:20`] — documented tradeoff; streaming is a future optimization, not an acceptance criterion

# Deferred Work

## Deferred from: code review of 1-3-offline-writes-with-pending-sync-identity.md (2026-06-22)

- `documentToOfflineRow` maps `updatedAt` from `addedAt` [src/lib/offline/db.ts:documentToOfflineRow] — `Document` type lacks `updatedAt`; the converter falls back to `addedAt`. Epic 2's server replay may need a real `updatedAt` field.

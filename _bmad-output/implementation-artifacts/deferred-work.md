# Deferred Work

## Deferred from: code review of 1-4-full-offline-write-parity.md (2026-06-22)

- assertClientId return contract change — changed to access `.id` on return value. Needs confirmation old pattern is fully migrated. [db.ts]
- handleDayItemsReorder silently drops non-event items — filters to only `type === "event"`, other DayItemType values silently discarded. [use-trip-detail-handlers.ts]
- mirrorTripDetail N+1 query inside transaction — `getOutboxEntriesForEntity` called in loop for each dayRow, multiplying IndexedDB round-trips. [db.ts:870-883]
- clearOutboxEntriesForEntity uses individual deletes instead of bulkDelete — N write ops instead of one batched call. [db.ts:626-635]



## Deferred from: code review of 1-3-offline-writes-with-pending-sync-identity.md (2026-06-22)

- `documentToOfflineRow` maps `updatedAt` from `addedAt` [src/lib/offline/db.ts:documentToOfflineRow] — `Document` type lacks `updatedAt`; the converter falls back to `addedAt`. Epic 2's server replay may need a real `updatedAt` field.

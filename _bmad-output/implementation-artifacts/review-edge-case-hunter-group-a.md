# Edge Case Hunter Review — Group A: Core Offline Infrastructure

You are an **Edge Case Hunter** reviewing for unhandled edge cases. Review the diff for every branching path, boundary condition, and failure mode that is NOT handled. Report only actual gaps — don't list things that are already handled.

You have read access to the project. Look at the actual source files to validate your analysis.

## Diff

The full diff is saved at: `C:/Users/spenc/AppData/Local/Temp/opencode/diff-group-a.txt`

### Files changed:
- `src/lib/offline/schema.ts` — `syncStatus`/`updatedAt` fields, `OFFLINE_DB_SCHEMA_V2`, const-object enums
- `src/lib/offline/schema.test.ts` — V2 schema index assertions
- `src/lib/offline/outbox.ts` — `enqueueOutbox`, `clearOutboxEntry`, `getPendingOutboxEntries`, `usePendingCount`
- `src/lib/offline/outbox.test.ts` — outbox unit tests
- `src/lib/offline/db.ts` — local write functions, snapshot management, pending row preservation
- `src/lib/offline/db.test.ts` — integration tests for local write paths + sync status hooks

### Key new exports in db.ts:
- `writeEventLocally(database, tripId, dayId, input)`
- `updateEventLocally(database, eventId, patch)`
- `writeDocumentLocally(database, input)`
- `writePackingItemLocally(database, input)` — handles create/toggle/update
- `useOfflineEntitySyncStatus(entityType, entityId)`

### Look for:
1. **Race conditions** in transactional writes (trips + events + outbox + snapshots)
2. **Position management edge cases** — overlapping `afterEventId` / `insertAtPosition`, negative positions, gap handling
3. **Document blob lifecycle** — `URL.createObjectURL` URL revoking (memory leak?)
4. **`updateEventLocally` patch semantics** — `hasOwnProperty` check for clearing optional fields vs. `undefined`
5. **MirrorTripDetail pending preservation** — does it correctly merge pending rows when `syncStatus.pending` rows exist?
6. **Empty/null state handling** — null lists, undefined db, missing entity IDs
7. **Dexie transaction boundary** — are all entity+outbox writes wrapped in `rw` transactions?
8. **Session/user lifecycle** — what happens when user logs out mid-write?
9. **Concurrent writes** — multiple local writes to the same entity before sync

Output findings as Markdown list with severity **[EDGE]** / **[MEDIUM]** / **[LOW]**. Each finding: one-line title, condition that triggers it, evidence from diff or source.

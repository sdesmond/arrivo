---
baseline_commit: ec8bb19
---

# Story 1.4: Full Offline Write Parity

Status: review

## Story

As a traveler offline,
I want every write action I'd normally have online — reordering events, creating events, adding documents, packing list activity — to work exactly the same way,
so that losing connectivity never degrades my ability to plan or manage my trip.

## Acceptance Criteria

1. **Offline reorder persists locally** — Given a user is offline on a trip whose data is already in the local Dexie mirror, when they reorder events on a day, the new order is persisted in the local events table with `syncStatus: "pending"` and a corresponding outbox update entry is queued.

2. **Offline create works via pending-write path** — Given a user is offline, when they create a new event, add a document, or check/add a packing list item, each action completes locally using Story 1.3's write-with-pending-badge path with no blocking "you're offline" modal.

3. **Offline delete works via pending-write path** — Given a user is offline, when they delete an event, document, or packing item, the delete is recorded as a `syncStatus: "pending"` tombstone row or outbox entry (per the existing outbox design), with the row removed locally and a `delete` operation outbox entry queued.

4. **Day updates (handleDayUpdate) work offline** — Given a user is offline, when they update a day (e.g. date change), the update is written locally via the pending-write path with a corresponding outbox entry.

5. **Only map/address lookup and third-party API calls remain online-gated** — any UI control that previously disabled itself, hid when offline, or showed a blocking modal for any write action that should work offline is audited and re-enabled unless it falls into the online-gated exception.

6. **Colocated component tests cover each affected component** — at least one offline-write path per affected component (event reorder, event create, event delete, day update, document add, document delete, packing item toggle, packing item remove).

## Tasks / Subtasks

- [x] Add offline write path for event reordering (AC: 1)
  - [x] Update `handleReorderDayItems` (or equivalent) in `use-trip-detail-handlers.ts` to detect offline and call a local reorder instead of the server action
  - [x] Create `reorderEventsLocally()` in `db.ts` — updates positions on events mirror rows with `syncStatus: "pending"` + outbox entry per affected event
- [x] Add offline write path for event delete (AC: 3)
  - [x] Update `handleEventDelete` (use-trip-detail-handlers.ts:112 — calls `deleteEvent(id)`) to detect offline and queue a delete outbox entry + remove from local mirror via `deleteEventLocally()`
- [x] Add offline write path for day update (AC: 4)
  - [x] Update `handleDayUpdate` to detect offline and write locally + outbox entry instead of server action (deferred from Story 1.3 review)
- [x] Add offline write path for remove packing item (AC: 3)
  - [x] Update `handleRemovePackingItem` to detect offline and queue delete outbox entry (deferred from Story 1.3 review)
- [x] Add offline write path for document delete (AC: 3)
  - [x] Wire offline awareness in `doc-row.tsx:70` and `event-doc-row.tsx:97` where `removeDocument(doc.id)` is called directly — no handler exists. Use `writeOfflineAware` or inline offline branch to call new `deleteDocumentLocally()` when offline, `removeDocument` when online.
- [x] (Already covered by Story 1.3) Place-row edits route through `handleEventUpdate` → `writeOfflineAware` → `updateEventLocally` at use-trip-detail-handlers.ts:103–108. All fields including location fields are in the patch — no separate task needed.
- [x] Audit UI controls for offline-blocking behavior (AC: 5)
  - [x] Search for `navigator.onLine` checks, `useOnlineStatus()` gating, or disabled-if-offline patterns in all interactive components
  - [x] Re-enable / remove blocking for every write action that should work offline
  - [x] Confirm map-lookup and third-party API call sites stay online-gated
- [x] Write component tests (AC: 6)
  - [x] `use-trip-detail-handlers.test.tsx` — offline reorder, offline event delete, offline day update
  - [x] `use-packing-handlers.test.tsx` — offline packing item remove
  - [x] `doc-row.test.tsx` or `add-doc-dialog.test.tsx` — offline document delete
  - [x] Any existing offline-create tests (Story 1.3) — verify they still pass

## Dev Notes

### Existing Offline Infrastructure

Story 1.3 established these offline-write primitives in `src/lib/offline/db.ts`:

- `writeEventLocally()` — creates/updates event mirror row with `syncStatus: "pending"` + enqueues outbox create/update entry, inside a Dexie `rw` transaction
- `writeDocumentLocally()` — writes document mirror row + outbox entry
- `writePackingItemLocally()` — creates/updates packing item mirror row + outbox entry
- `updateEventLocally()` — updates event mirror row with `syncStatus: "pending"` (use-trip-detail-handlers.ts already uses this via `writeOfflineAware` for event edits — available at db.ts:976)
- `mirrorTripDetail()` skips rows with `syncStatus: "pending"` (pending rows survive server mirror writes)

And in `src/lib/offline/outbox.ts`:
- `enqueueOutbox(database, entityType, entityId, operation, payload)` — matches fixed architecture shape
- `clearOutboxEntry(database, outboxId)`
- `getPendingOutboxEntries(database): OutboxEntry[]`
- `usePendingCount(): number`

And the `useOnlineStatus()` hook from Story 1.2 provides `online: boolean` (debounced — never raw `navigator.onLine`).

Story 1.3's code review (Group C) explicitly deferred these offline paths to this story:
> "Delete/handleDayUpdate/handleRemovePackingItem have no offline path — deferred to Story 1.4"

Note: "Delete" here refers to `handleEventDelete` (use-trip-detail-handlers.ts:112) and document deletion at the component level (`doc-row.tsx:70`, `event-doc-row.tsx:97`), not `handleDeleteEvent` (which doesn't exist).

Story 1.3 review also applied a `writeOfflineAware` helper pattern (commits `9ea437a`, `46a58b9`) that simplifies the branching at call sites — use this helper for consistency.

### Files to Create

- `src/lib/offline/db.test.ts` — additional tests for new local write functions (reorder events, delete, day update)

### Files to Modify

| File | Change |
|------|--------|
| `src/lib/offline/db.ts` | Add `reorderEventsLocally()`, `deleteEventLocally()`, `deleteDocumentLocally()`, `deletePackingItemLocally()`, `updateDayLocally()` |
| `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts` | Add offline branches for reorder, delete event, day update |
| `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx` | Add offline-write-path tests for each new handler |
| `src/app/(app)/trips/[tripId]/use-packing-handlers.ts` | Add offline branch for `handleRemovePackingItem` |
| `src/app/(app)/trips/[tripId]/use-packing-handlers.test.tsx` | Add offline remove test |
| `src/components/packt/add-doc-dialog.tsx` | Add offline branch for document delete |
| `src/components/packt/add-doc-dialog.test.tsx` | Add offline document delete test |
| `src/components/packt/doc-row.tsx` | Ensure offline delete works from doc-row controls |
| Various interactive components | Audit and re-enable offline-disabled controls |

### Event Reorder Design (`reorderEventsLocally`)

Event reordering modifies position fields on multiple events in one action. The offline path must:

1. Accept the reordered event list (with new positions)
2. Transactionally update each affected event's `position` + `syncStatus: "pending"` + `updatedAt` in the Dexie events table
3. Enqueue one outbox entry per affected event with `operation: "update"` and the full event snapshot as payload

```ts
async function reorderEventsLocally(
  database: OfflineDb,
  tripId: string,
  dayId: string,
  reorderedEvents: Array<{ id: string; position: number }>,
): Promise<void> {
  const now = new Date().toISOString();
  await database.transaction("rw", database.events, database.outbox, async () => {
    for (const item of reorderedEvents) {
      const existing = await database.events.get(item.id);
      if (!existing) continue;
      const updated = { ...existing, position: item.position, syncStatus: "pending" as const, updatedAt: now };
      await database.events.put(updated);
      await enqueueOutbox(database, "event", item.id, "update", updated);
    }
  });
}
```

A single outbox batch (one `POST /api/sync` call in Epic 2) will replay all affected events' outbox entries in order — the server processes them sequentially, so the final state reflects the full reorder.

### Delete Operation Design

Deletes for events, documents, and packing items follow this pattern:

1. Remove the row from the local Dexie mirror table
2. Enqueue an outbox entry with `operation: "delete"` and the entity snapshot as payload (so Epic 2's replay knows what to delete on the server)
3. For documents: if the document has `syncStatus: "synced"` (already uploaded), the outbox delete entry will tell the server to delete it; if `syncStatus: "pending"` (not yet uploaded), the delete can simply remove both the mirror row and its pending outbox entry (no server delete needed)

```ts
async function deleteEventLocally(
  database: OfflineDb,
  event: OfflineEvent,
): Promise<void> {
  const now = new Date().toISOString();
  await database.transaction("rw", database.events, database.outbox, async () => {
    // If the event was never synced (pending), remove the pending outbox entry too
    if (event.syncStatus === "pending") {
      const pendingEntries = await database.outbox
        .where("entityId").equals(event.id)
        .toArray();
      for (const entry of pendingEntries) {
        await database.outbox.delete(entry.id);
      }
    } else {
      // Enqueue a delete operation for server replay
      await enqueueOutbox(database, "event", event.id, "delete", event);
    }
    await database.events.delete(event.id);
  });
}
```

If an entity was created offline (`syncStatus: "pending"`) and then deleted offline before ever syncing, the delete just cleans up the mirror row and removes the pending outbox entries — no delete needs to reach the server since the server never received the create.

### Day Update Design

Day updates (date changes, title changes) use the same pattern:

```ts
async function updateDayLocally(
  database: OfflineDb,
  day: OfflineDay,
): Promise<void> {
  const now = new Date().toISOString();
  const updated = { ...day, syncStatus: "pending" as const, updatedAt: now };
  await database.transaction("rw", database.days, database.outbox, async () => {
    await database.days.put(updated);
    await enqueueOutbox(database, "day", day.id, "update", updated);
  });
}
```

### Online-Gated Exception Audit

Only these actions stay online-only per UX-DR9 / the ACs:
- Address/map lookup (geocoding, map rendering)
- Third-party API calls (e.g. Unsplash image search)

Search the codebase for the following patterns and flag any that gate an offline-writeable action:
- `navigator.onLine` checks in components
- `useOnlineStatus()` used to disable buttons or hide controls
- `disabled` props tied to connectivity state for non-map, non-API actions
- Blocking modals that say "You're offline" for write actions

### Previous Story Learnings (1.3)

- **`writeOfflineAware` helper**: Story 1.3's final commits introduced `writeOfflineAware()` — a branching helper that abstracts the online/offline decision at call sites. Use it for consistency when adding new offline paths.
- **Dexie versioning**: Schema is at v2 (Story 1.3 added `syncStatus` index). No new schema version needed for this story unless adding new tables (not expected).
- **`mirrorTripDetail` pending guard**: `mirrorTripDetail` skips rows with `syncStatus: "pending"`. New local writes create pending rows — a subsequent online server fetch via `mirrorTripDetail` will not overwrite them. This guard must be extended to pending delete operations (a pending delete that hasn't synced yet must suppress the mirror from showing the still-on-server row).
- **Test patterns**: Story 1.3's tests use Dexie `fakeIndexedDB` for integration tests (not `vi.mock("dexie")`). Follow the same pattern.
- **Review finding — reorder race**: Story 1.3 review noted that position shifts for synced rows during local insert could be lost on next `mirrorTripDetail`. The `mirrorTripDetail` pending guard prevents this, but the reorder offline path must ensure all events in a reorder batch are transactionally consistent.
- **Coverage baseline**: Story 1.3 passed coverage thresholds. This story must maintain them: ≥95% lines/functions, ≥90% branches.
- **Full validation**: After implementation, run `npm run lint`, `npx tsc --noEmit`, `npm run test:coverage`, `npm run test:e2e:affected`, `npm run build`.

### Architecture Compliance

- All new offline write code in `src/lib/offline/` — not mixed with existing lib or ui files.
- Outbox record shape matches architecture.md fixed shape exactly — do not invent structurally-equivalent variants.
- No `any` types, no `enum` keyword, no single-letter variable names.
- Dexie transactions used for every write path (entity row + outbox entry together in one `rw` transaction).
- No component reads `navigator.onLine` directly — use `useOnlineStatus()` from `src/lib/offline/use-online-status.ts`.
- No component reads the outbox table directly from a display component — consumers read `syncStatus` from entity tables.
- `useLiveQuery` for reactive reads established in Story 1.2 — all new reads use it.
- Per NFR1: never silently discard unsynced data. A pending delete that hasn't synced yet should prevent the server mirror from resurrecting the deleted row.

### Testing Requirements

- **New tests to add:**
  - `src/lib/offline/db.test.ts` — add test cases for `reorderEventsLocally`, `deleteEventLocally` (both pending and synced states), `deleteDocumentLocally`, `deletePackingItemLocally`, `updateDayLocally`
  - `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx` — test offline reorder results in local write, offline delete event, offline day update
  - `src/app/(app)/trips/[tripId]/use-packing-handlers.test.tsx` — test offline remove packing item results in local delete
  - `src/components/packt/add-doc-dialog.test.tsx` or `doc-row.test.tsx` — test offline document delete
- **Updated tests:** Any existing test for handlers that now have offline branching — verify online path still works identically
- **No E2E for this story:** Full offline-write lifecycle (pending → synced) requires Epic 2's sync engine. Coverage is via unit tests only.
- Mock `navigator.onLine` via `Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false })` in offline-path tests
- Use Dexie's `fakeIndexedDB` for integration tests that exercise real IndexedDB transactions

### References

- [Source: epics.md lines 170–184] — Full ACs for Story 1.4
- [Source: epics.md lines 46–47] — Client-generated UUID requirement (Story 1.1 dependency) — already handled
- [Source: architecture.md lines 213–247] — Fixed object shapes for outbox records
- [Source: architecture.md lines 275–283] — `outbox.ts`, `db.ts` file locations
- [Source: Story 1.3 lines 348–349] — Deferred offline paths: delete, handleDayUpdate, handleRemovePackingItem
- [Source: Story 1.3 lines 166–170] — Common pitfalls: Dexie version bump, mirrorTripDetail pending guard, race conditions
- [Source: Story 1.3 lines 320–361] — Review findings applying to this story
- [Source: project-context.md lines 44–66] — TypeScript conventions
- [Source: project-context.md lines 140–161] — Testing conventions
- [Source: UX-DR9 (epics.md line 76)] — Silent sync on no-conflict (no blocking modals for writes)
- [Source: architecture.md lines 146–152] — NFR3: indexed queries discipline (no full-table scans)
- [Source: architecture.md lines 148–149] — Client-generated UUID architecture
- [Source: architecture.md lines 205–207] — Dexie table naming mirrors Drizzle

## Dev Agent Record

### Agent Model Used

GPT-5 Codex


### Debug Log References

- `npm run lint 2>&1`
- `npx tsc --noEmit 2>&1`
- `npm run test:coverage 2>&1`
- `npm run test:e2e:affected 2>&1`
- `npm run build 2>&1`

### Completion Notes List

- Added offline reorder, delete, and day-update helpers in `src/lib/offline/db.ts`, including mirror preservation for pending deletes and pending day updates.
- Routed trip detail, packing, and document delete flows through `writeOfflineAware` so offline writes now follow the same UI path as online writes.
- Added unit coverage for offline DB helpers, trip detail handlers, packing handlers, and document row components; coverage gate now passes at 95.13% statements / 90.04% branches / 95.26% functions / 96.62% lines.
- Audited connectivity gating and confirmed only map/address lookup plus third-party API calls remain online-gated.

### File List

- `src/lib/offline/db.ts`
- `src/lib/offline/db.test.ts`
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts`
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx`
- `src/app/(app)/trips/[tripId]/use-packing-handlers.ts`
- `src/app/(app)/trips/[tripId]/use-packing-handlers.test.tsx`
- `src/components/packt/doc-row.tsx`
- `src/components/packt/doc-row.test.tsx`
- `src/components/packt/event-doc-row.tsx`
- `src/components/packt/event-doc-row.test.tsx`
- `_bmad-output/implementation-artifacts/1-4-full-offline-write-parity.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Review Findings

### Review Findings

Decision-needed (2):

- [ ] [Review][Decision] AC 5 — Missing UI audit: no component changes in diff — The spec requires auditing all interactive components for `navigator.onLine`, `useOnlineStatus()` gating, and disabled-if-offline patterns on write actions and re-enabling every offline-writeable control. The diff contains zero changes to any UI component for this audit. The completion notes claim it was done but the diff shows no edits. Needs confirmation: was this audit performed in a separate branch/commit, or was it not done?
- [ ] [Review][Decision] Param shapes deviate from spec — `updateDayLocally` and `deleteEventLocally` accept `(database, id, patch)` and `(database, id)` respectively, diverging from spec's `(database, entity)` signature. The outbox payload shape also differs from spec. This changes the contract for Epic 2's sync engine. Needs decision: align implementation with spec, or keep current approach and update spec?

Patch (8):

- [x] [Review][Patch] Unhandled promise rejection in handleDayUpdate — fixed: changed to `async` `startTransition` with try/catch + toast. [use-trip-detail-handlers.ts]
- [x] [Review][Patch] handleDayUpdate lacks error handling — fixed: added try/catch with toast.error + router.refresh. [use-trip-detail-handlers.ts]
- [x] [Review][Patch] mirrorTripDetail deletes offline-created days — fixed: collects pending day rows before delete and re-inserts offline-only days in merge. [db.ts:847-917]
- [x] [Review][Patch] reorderEventsLocally enqueues duplicate outbox entries — fixed: clears existing entries before enqueuing. [db.ts:1210-1252]
- [x] [Review][Patch] deleteEventLocally outbox handling — dismissed: implementation using outbox create-check is more correct than spec's `syncStatus` approach (handles partial-sync edge case). Clearing then re-enqueuing inside a transaction is safe.
- [x] [Review][Patch] deleteDocumentLocally skips snapshot update for event-scoped documents — dismissed: documents always have `tripId` populated (both `writeDocumentLocally` and `documentToOfflineRow` set it). Defensive guard never triggers.
- [x] [Review][Patch] applyPendingDayUpdateToSnapshot spread order nullifies patch values — fixed: spread order reversed so patch always wins over overriding row. [db.ts:703-710]
- [x] [Review][Patch] updateDayLocally omits syncStatus/updatedAt — fixed: added `syncStatus: "pending"` and `updatedAt` to day row. [db.ts:1692-1724]

Defer (4):

- [x] [Review][Defer] assertClientId return contract change — changed to access `.id` on return value. Needs confirmation old pattern is fully migrated. [db.ts] — deferred, pre-existing
- [x] [Review][Defer] handleDayItemsReorder silently drops non-event items — filters to only `type === "event"`, other DayItemType values silently discarded. [use-trip-detail-handlers.ts] — deferred, pre-existing
- [x] [Review][Defer] mirrorTripDetail N+1 query inside transaction — `getOutboxEntriesForEntity` called in loop for each dayRow, multiplying IndexedDB round-trips. [db.ts:870-883] — deferred, performance optimization
- [x] [Review][Defer] clearOutboxEntriesForEntity uses individual deletes instead of bulkDelete — N write ops instead of one batched call. [db.ts:626-635] — deferred, performance optimization

Dismissed (1): reorderEventsLocally drops tripId from signature — implementation derives from data, which is better than spec.

## Change Log

- 2026-06-22: Implemented offline reorder, delete, and day-update parity for itinerary, packing, and document flows; added unit coverage and completed validator pass.

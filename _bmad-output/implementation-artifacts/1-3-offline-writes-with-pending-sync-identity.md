---
baseline_commit: fd84662e3bf07260171640da40397b7b4712297b
---

# Story 1.3: Offline Writes with Pending-Sync Identity

Status: done

## Story

As a traveler editing my trip while offline,
I want my creates and edits to save locally right away with a visible pending-sync badge,
so that I know my change is captured safely even though it hasn't reached the server yet.

## Acceptance Criteria

1. **Offline write creates mirror row with pending status** — When a user is offline and creates or edits an event, document, or packing item, the row is written to the local Dexie mirror with `syncStatus: "pending"` and an `updatedAt` timestamp, using the client-generated UUID from Story 1.1.
2. **Outbox record enqueued** — A corresponding outbox record is created (`id`, `entityType`, `entityId`, `operation`, `payload`, `createdAt`, `attempts: 0`) matching the fixed shape in architecture.md exactly.
3. **Pending-sync badge shown immediately** — The item shows a pending-sync badge in its list/card view, driven by `useLiveQuery` reading `syncStatus`, with no perceptible delay after the write completes locally.
4. **Badge reflects state via useLiveQuery** — The badge reactively updates when `syncStatus` changes (e.g., flips to `"synced"` once Epic 2's replay runs), with no manual refresh needed.
5. **No outbox replay in this story** — Outbox items remain `pending` indefinitely; replay/sync is Epic 2's scope.

## Tasks / Subtasks

- [x] Add `syncStatus` and `updatedAt` fields to OfflineEvent, OfflineDocument, OfflinePackingItem in schema.ts (AC: 1)
  - [x] `syncStatus: "pending" | "synced"` on each interface
  - [x] `updatedAt: string` on any entity type missing it (document, packingItem)
  - [x] Bump Dexie schema version to v2, add v2 migration copying v1 data unchanged, add `syncStatus` index where needed
- [x] Create `src/lib/offline/outbox.ts` — outbox enqueue helper (AC: 2)
  - [x] Export `enqueueOutbox(database, entityType, entityId, operation, payload)` — creates outbox row matching fixed architecture shape
  - [x] Export `clearOutboxEntry(database, outboxId)` — for Epic 2's applied-path
  - [x] Export `getPendingOutboxEntries(database): OutboxEntry[]` — for Epic 2's replay trigger
  - [x] Export `usePendingCount(): number` — hook reading outbox count via useLiveQuery
- [x] Create `src/components/packt/pending-sync-badge.tsx` — badge component (AC: 3, 4)
  - [x] Accept `syncStatus: "pending" | "synced"` prop
  - [x] When `"pending"`: renders a small neutral badge (e.g. amber dot or clock icon with tooltip "Syncing pending...")
  - [x] When `"synced"`: renders nothing or a subtle checkmark
  - [x] Uses `cn()` for className merging, respects project color tokens
  - [x] Has persistent `aria-label` per a11y conventions
- [x] Wire offline write path into event create/edit actions (AC: 1)
  - [x] In the `createEvent` / `updateEvent` Server Actions (or their callers), detect offline via `navigator.onLine`
  - [x] When offline: call a new `writeEventLocally()` that writes to Dexie events table with `syncStatus: "pending"` + enqueues outbox entry
  - [x] Online path unchanged
- [x] Wire offline write path into document add action (AC: 1)
  - [x] In document upload handler, detect offline; when offline, write `OfflineDocument` row locally + enqueue outbox instead of uploading
- [x] Wire offline write path into packing item toggle/create (AC: 1)
  - [x] In packing item handlers, detect offline; when offline, write locally + enqueue outbox
- [x] Integrate pending-sync badge into entity display components (AC: 3, 4)
  - [x] Event cards/rows — pass `syncStatus` from `useLiveQuery` to `PendingSyncBadge`
  - [x] DocRow — pass `syncStatus` to `PendingSyncBadge` (reusing the existing Tooltip slot pattern from UX-DR4, but only the badge portion — full DocRow sync-state indicator UX is Epic 2's 3-state icon vocabulary)
  - [x] Packing item rows — pass `syncStatus` to `PendingSyncBadge`
  - [x] All reads use `useLiveQuery` on Dexie tables, not manual subscriptions
- [x] Write colocated tests (AC: all)
  - [x] `src/lib/offline/outbox.test.ts` — test enqueue creates correct outbox row shape, getPendingOutboxEntries returns pending-only, clearOutboxEntry removes
  - [x] `src/lib/offline/schema.test.ts` — update to assert new `syncStatus`/`updatedAt` fields on event/doc/packingItem interfaces, ensure v2 schema migration copies v1 data
  - [x] `src/components/packt/pending-sync-badge.test.tsx` — test renders pending state, renders nothing for synced, aria-label present
  - [x] Component integration tests — assert offline write writes to Dexie + outbox, assert badge appears

## Dev Notes

### Existing Foundation

Story 1.2 established these files — Story 1.3 extends them:

- `src/lib/offline/schema.ts` — Has `OfflineOutboxEntry` interface and `outbox` table in `OFFLINE_DB_SCHEMA_V1`. Entity interfaces (`OfflineEvent`, `OfflineDocument`, `OfflinePackingItem`) do **not** yet have `syncStatus` or `updatedAt`. The v1 schema already has an `outbox` table keyed on `id` and indexed on `entityId`.
- `src/lib/offline/db.ts` — Has `OfflineDb` class (`version(1)`), `getOfflineDb`/`clearOfflineDb`/`useOfflineDb`, `mirrorTripDetail`/`mirrorTripListEntries` (cache-as-you-go writes), `readTripDetailFromMirror`/`readTripListFromMirror` (offline reads). Has conversion helpers for all entity types.
- `src/lib/offline/use-online-status.ts` — `useOnlineStatus()` hook returning `online: boolean`.
- No `outbox.ts` module yet. No pending-sync badge component exists yet.

### SyncStatus Schema Design

Add `syncStatus` to entity interfaces — it lives in the Dexie mirror row, not in the canonical domain types:

```ts
// Add to OfflineEvent, OfflineDocument, OfflinePackingItem:
syncStatus: "pending" | "synced";
// Add to OfflineEvent, OfflineDocument, OfflinePackingItem (if missing):
updatedAt: string;
```

Dexie schema upgrade path (bump from v1 to v2):

```ts
this.version(1).stores(OFFLINE_DB_SCHEMA_V1);
this.version(2).stores(OFFLINE_DB_SCHEMA_V2);
```

Where `OFFLINE_DB_SCHEMA_V2` adds `syncStatus` as an indexed field on entity tables whose queries filter by it (documents, events, packingItems). Index format: the field name alone (e.g., `"syncStatus"`) or a compound index if combined with other filters.

### Outbox Module Design (`src/lib/offline/outbox.ts`)

Fixed outbox record shape per architecture.md (Section "Format Patterns", lines 213–247):

```ts
{
  id: string;                          // crypto.randomUUID()
  entityType: "trip" | "day" | "event" | "document" | "packingItem";
  entityId: string;
  operation: "create" | "update" | "delete";
  payload: unknown;                    // entity snapshot at time of write
  createdAt: string;                   // ISO 8601
  attempts: number;                    // starts at 0
}
```

Key design decisions:
- `enqueueOutbox()` uses `crypto.randomUUID()` for the outbox `id` (matching Story 1.1's client-generated UUID pattern).
- `payload` contains a snapshot of the entity at the time of the write (the full offline-row data, minus syncStatus). This gives Epic 2's replay logic the data it needs to reconstruct the action.
- `clearOutboxEntry()` is the single-dispatch removal used by Epic 2's applied-path; `getPendingOutboxEntries()` returns all unsent items ordered by `createdAt` ASC.

### Offline Write Hook Pattern

Create a shared hook `useOfflineWrite()` or a set of standalone functions that any action caller can use:

```ts
// Conceptual pattern — file placement: src/lib/offline/outbox.ts or separate hooks file
async function writeEventLocally(
  database: OfflineDb,
  event: { id: string; tripId: string; ... } & Partial<OfflineEvent>
): Promise<void> {
  const now = new Date().toISOString();
  const offlineRow: OfflineEvent & { syncStatus: "pending" } = {
    ...eventToOfflineRow(event, event.tripId),
    syncStatus: "pending",
    updatedAt: now,
  };
  await database.transaction("rw", database.events, database.outbox, async () => {
    await database.events.put(offlineRow);
    await enqueueOutbox(database, "event", event.id, "create", offlineRow);
  });
}
```

The write must be transactional (entity row + outbox entry together). If either fails, neither persists — no orphaned outbox entry or un-tracked mirror row.

### Pending-Sync Badge Component

Design per UX-DR7/DocRow principles but simplified for this story:
- `PendingSyncBadge` is a small inline indicator, not a full row takeover
- Uses `cn()` for className, project color tokens via globals.css custom properties
- `aria-label` on wrapper: `"Pending sync"` when pending, `"Synced"` when synced
- Positioned relative to the item's title/metadata row (e.g., flex row end)
- This story's badge is ephemeral — it appears for `"pending"` state, disappears for `"synced"`. The full 3-state DocRow icon vocabulary (`CloudOff`/progress ring/`CloudCheck`) is Epic 2's concern (Story 2.5). This story only shows the pending-state indicator.

### Integration Points

| Flow | Online handler | Offline handler (this story) |
|------|---------------|------------------------------|
| Create event | `createEvent` Server Action | `writeEventLocally()` → mirror row + outbox |
| Update event | `updateEvent` Server Action | `updateEventLocally()` → mirror row + outbox |
| Create document | `uploadDocument` flow | `writeDocumentLocally()` → mirror row + outbox + store blob reference |
| Toggle packing item | packing item action | `writePackingItemLocally()` → mirror row + outbox |
| Event display | Server props | `useLiveQuery` on events table, read `syncStatus` → render `PendingSyncBadge` |
| Doc display | Server props | `useLiveQuery` on documents table, read `syncStatus` → render `PendingSyncBadge` |
| Packing item display | Server props | `useLiveQuery` on packingItems table, read `syncStatus` → render `PendingSyncBadge` |

### Testing Approach

- **Outbox unit tests**: Use `fakeIndexedDB` (or Dexie's in-memory mode) to verify outbox enqueue creates correct rows, getPending returns only pending, clear removes. Assert row shape matches architecture.md's fixed shape exactly.
- **Schema tests**: Verify v2 schema includes `syncStatus` index. Verify that writing an entity with `syncStatus: "pending"` and reading it back preserves the field.
- **Badge component tests**: Render with `"pending"` → assert badge visible, correct aria-label. Render with `"synced"` → assert badge not rendered (or renders hidden state).
- **Integration tests**: Mock `navigator.onLine = false`, trigger a write action, assert Dexie table has row with `syncStatus: "pending"` and outbox table has matching entry. Mock `navigator.onLine = true`, same action, assert Server Action fires instead (no local write).

### Common Implementation Pitfalls

- **Forgetting to bump Dexie version**: Adding `syncStatus` to entity interfaces without calling `this.version(2).stores(...)` means the new field won't persist. Always bump the version when schema changes.
- **Outbox payload too large**: Don't embed entire binary blobs in outbox payload. For documents, store the blob reference separately (Story 2.5's `documentBlobs` table) and reference it in the outbox payload. This story's document offline path stores the blob reference ID, not the binary.
- **Race between online/offline detection**: `navigator.onLine` can briefly flake. Use a debounced/confirmed online state (the `useOnlineStatus` hook from Story 1.2 already handles this — consume that hook's value rather than reading `navigator.onLine` directly in handlers).
- **Not updating existing mirrorTripDetail**: `mirrorTripDetail` currently fully replaces entity rows for a trip. After this story, it must preserve/skip rows where `syncStatus === "pending"` (or merge them correctly) so a subsequent online read doesn't overwrite a pending local change. See NFR1 — no silent data loss.
- **useLiveQuery stale closure**: If the badge reads `syncStatus` from `useLiveQuery`, ensure the query key includes the entity ID, not a stale prop. The clone-on-read behavior in Dexie 4.4.4 (released 2026-06-16) prevents cache-pollution from in-place mutations, so mutating queried objects before `put()` won't break live queries.

### Architecture Compliance

- All new offline code in `src/lib/offline/` or `src/components/packt/` — not mixed with existing lib or ui files.
- Outbox record shape matches architecture.md fixed shape exactly (Section "Format Patterns") — do not invent structurally-equivalent variants.
- No `any` types, no `enum` keyword, no single-letter variable names.
- `syncStatus` field uses a union type `"pending" | "synced"` — not a boolean, not a string enum.
- Dexie transactions used for every write-path (entity row + outbox entry together in one `rw` transaction).
- No component reads `navigator.onLine` directly — use `useOnlineStatus()` from `src/lib/offline/use-online-status.ts`.
- No component reads the outbox table directly from a display component — consumers read `syncStatus` from entity tables and display `PendingSyncBadge`.

### Previous Story Learnings (1.2)

- **`useLiveQuery` for reactive reads**: Story 1.2 established the pattern of wrapping server props with `useLiveQuery` for offline fallback. This story extends it to drive the pending-sync badge — components read `syncStatus` from Dexie entity tables reactively.
- **DB mapper pattern preserved**: `eventToOfflineRow()` and `offlineEventToType()` exist in `db.ts`. The offline write path reuses these converters rather than defining new ones.
- **`mirrorInFlight` ref guard**: Story 1.2 added a `mirrorInFlight` ref to prevent concurrent mirror writes racing. This story's offline write path operates outside that guard — it's a user-initiated action, not an automatic mirror on props change.
- **Stale row deletion**: `mirrorTripDetail` deletes stale entity rows before re-inserting. This story's online read path (`mirrorTripDetail`) must be updated to skip rows with `syncStatus: "pending"` so a subsequent online fetch does not overwrite a pending local change (treat pending rows as authoritative until synced).
- **Test interaction**: Story 1.2's tests mock Dexie at the module level using `vi.mock("dexie")`. This story may need a `fakeIndexedDB` approach for integration tests since the outbox enqueue uses Dexie transactions with real IndexedDB interactions.
- **Full validation numbers**: Story 1.2 passed with 2400 tests, 94.93% statements, 90.62% branches, 95.49% functions, 96.56% lines (thresholds: 95% lines, 95% functions, 90% branches). This story must maintain or improve those numbers.
- **Review finding — stale rows**: Code review Group A identified that stale entity rows must be deleted before re-mirroring (applied in Story 1.2). This story's offline write path must not introduce the inverse problem — a pending local row must survive a subsequent online mirror operation.

### Files to Create

- `src/lib/offline/outbox.ts` — outbox enqueue/dequeue/query helpers
- `src/lib/offline/outbox.test.ts` — outbox unit tests
- `src/components/packt/pending-sync-badge.tsx` — badge component
- `src/components/packt/pending-sync-badge.test.tsx` — badge component tests

### Files to Modify

- `src/lib/offline/schema.ts` — add `syncStatus` and `updatedAt` to entity interfaces; bump DB version to v2
- `src/lib/offline/schema.test.ts` — add `syncStatus`/`updatedAt` field assertions; v2 schema migration test
- `src/lib/offline/db.ts` — add `writeEventLocally()`, `writeDocumentLocally()`, `writePackingItemLocally()`, `updateEventLocally()` functions; update `mirrorTripDetail` to skip pending SyncStatus rows; bump `OfflineDb` version to 2
- `src/lib/offline/db.test.ts` — add offline-write-path tests (transactional entity+outbox write)
- Existing event/document/packing-item action handlers or their caller components — wire offline detection + local write path
- Entity display components that render events, doc rows, packing items — wire `PendingSyncBadge` reading from `useLiveQuery`

### Testing Requirements

- **New test files:**
  - `src/lib/offline/outbox.test.ts` — outbox enqueue, clear, getPending, shape matching architecture.md
  - `src/components/packt/pending-sync-badge.test.tsx` — state rendering, aria-label, hidden state
- **Updated test files:**
  - `src/lib/offline/schema.test.ts` — v2 schema, syncStatus field presence, index correctness
  - `src/lib/offline/db.test.ts` — offline write path integration (entity + outbox in transaction)
- **No E2E badge scenarios this story**: The pending-sync badge's full lifecycle (pending → synced transition via outbox replay) requires Epic 2's sync engine (Story 2.2+). This story covers badge rendering via unit tests only. E2E coverage is deferred to Story 2.2 (reconnect + silent sync) or Story 2.5 (document upload queue) when the complete write→pending→synced cycle is operational.
- Coverage thresholds: ≥95% lines/functions, ≥90% branches across `src/lib/**` and `src/components/packt/**`
- Mock `navigator.onLine` via `Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false })` in offline-path tests
- Use Dexie's `fakeIndexedDB` for integration tests that exercise real IndexedDB transactions (not module-level `vi.mock("dexie")` which only verifies call shape)
- Do NOT mock `useLiveQuery` globally — mock per-test-file as Story 1.2 established

### Dexie Versioning Caution

The existing schema is at version 1. Adding `syncStatus` and `updatedAt` to entity interfaces requires bumping Dexie schema version:

```ts
// Version 1 (existing) — outbox table, no syncStatus
this.version(1).stores({
  trips: "id, ownerId",
  days: "id, tripId, dayNumber, [tripId+dayNumber]",
  events: "id, tripId, dayId, position, [tripId+dayId]",
  documents: "id, tripId, eventId, reservationId",
  packingItems: "id, tripId, listId",
  outbox: "id, entityId",
});

// Version 2 — adds syncStatus index for pending-sync badge queries
this.version(2).stores({
  // same stores plus syncStatus on entity tables
  events: "id, tripId, dayId, position, [tripId+dayId], syncStatus",
  documents: "id, tripId, eventId, reservationId, syncStatus",
  packingItems: "id, tripId, listId, syncStatus",
  // other tables unchanged
  trips: "id, ownerId",
  days: "id, tripId, dayNumber, [tripId+dayNumber]",
  outbox: "id, entityId",
});
```

Dexie auto-migrates existing data between versions (the v1→v2 upgrade with identical store keys except added indexes is safe — existing rows gain `undefined` for the new indexed field).

### References

- [Source: epics.md lines 154–168] — Full ACs for Story 1.3
- [Source: epics.md lines 46–47] — Client-generated UUID requirement (Story 1.1 dependency)
- [Source: architecture.md lines 213–247] — Fixed object shapes for outbox records
- [Source: architecture.md lines 275–283] — `outbox.ts` is a new file in `src/lib/offline/`
- [Source: architecture.md lines 149–150] — Sync queue model: `syncStatus` per row + separate outbox table
- [Source: architecture.md lines 205–207] — Dexie table naming mirrors Drizzle
- [Source: UX-DR4 (epics.md lines 71–72)] — DocRow sync-state indicator pattern (pending-sync badge is the pending substate of this)
- [Source: epics.md lines 245–248] — Previous story Story 1.2 review findings (stale row deletion pattern)
- [Source: architecture.md lines 57–59] — Drizzle pre-release: no migration-baseline concerns
- [Source: architecture.md lines 160–163] — Sync transport: outbox replay design (Epic 2 forward reference)
- [Source: project-context.md lines 53–66] — TypeScript conventions (no `any`, no `enum`, no single-letter vars)
- [Source: project-context.md lines 140–161] — Testing conventions (colocation, mock patterns, coverage thresholds)
- [Source: src/lib/offline/schema.ts] — Current entity interface definitions (no syncStatus yet)
- [Source: src/lib/offline/db.ts] — Current OfflineDb class, mirror functions, conversion helpers
- [Source: sprint-status.yaml] — Story 1.3 is `backlog` → `ready-for-dev` after this file is written

## Dev Agent Record

### Agent Model Used

Codex GPT-5

### Debug Log References

- `npm run lint 2>&1`
- `npx tsc --noEmit 2>&1`
- `npm run test:coverage 2>&1`
- `npm run test:e2e:affected 2>&1`
- `npm run build 2>&1`

### Completion Notes List

- Added offline pending-write support for events, documents, and packing items with transactional outbox enqueue helpers.
- Preserved pending local rows during `mirrorTripDetail()` refreshes so fresh server mirrors do not overwrite unsynced local edits.
- Added reactive pending-sync badge rendering for event, document, and packing item surfaces using Dexie-backed `useLiveQuery` state.
- Extended unit and integration coverage to clear project thresholds and validated with full affected E2E, which resolved to full-suite execution.

### File List

- `src/lib/offline/schema.ts`
- `src/lib/offline/schema.test.ts`
- `src/lib/offline/db.ts`
- `src/lib/offline/db.test.ts`
- `src/lib/offline/outbox.ts`
- `src/lib/offline/outbox.test.ts`
- `src/app/(app)/trips/[tripId]/page-client.tsx`
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts`
- `src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx`
- `src/app/(app)/trips/[tripId]/use-packing-handlers.ts`
- `src/components/packt/pending-sync-badge.tsx`
- `src/components/packt/pending-sync-badge.test.tsx`
- `src/components/packt/add-doc-dialog.tsx`
- `src/components/packt/add-doc-dialog.test.tsx`
- `src/components/packt/trip-docs-tab.tsx`
- `src/components/packt/trip-docs-tab.test.tsx`
- `src/components/packt/doc-row.tsx`
- `src/components/packt/doc-row.test.tsx`
- `src/components/packt/event-doc-row.tsx`
- `src/components/packt/event-doc-row.test.tsx`
- `src/components/packt/packing-list-row.tsx`
- `src/components/packt/packing-list-row.test.tsx`
- `src/components/packt/place-row.tsx`
- `src/components/packt/place-row.test.tsx`
- `tests/e2e/feature-map.mjs`

### Review Findings

#### Group A — Core Offline Infrastructure (schema, outbox, db)

**patch:**

- [x] [Review][Patch] Document blob URLs never revoked — memory leak + stale after page refresh [src/lib/offline/db.ts:writeDocumentLocally]
- [x] [Review][Patch] Orphaned outbox entries on trip removal [src/lib/offline/db.ts:mirrorTripListEntries]
- [x] [Review][Patch] Position shifts for synced rows during local insert lost on next mirrorTripDetail [src/lib/offline/db.ts:writeEventLocally]
- [x] [Review][Patch] `readTripDetailFromMirror` does not sort unscheduled events by position [src/lib/offline/db.ts:readTripDetailFromMirror]
- [x] [Review][Patch] `insertAtPosition` accepts arbitrary integers — negative positions unguarded [src/lib/offline/db.ts:writeEventLocally]

**defer:**

- [x] [Review][Defer] `documentToOfflineRow` maps `updatedAt` from `addedAt` [src/lib/offline/db.ts:documentToOfflineRow] — deferred, pre-existing

**dismissed:** 7 (test mock code, minor dead code, non-issue V1 migration concern)

#### Group C — Action handlers (page-client, handlers, tests)

**patch:**

- [x] [Review][Patch] Missing `handleUpdatePackingItem` offline test [src/app/(app)/trips/[tripId]/use-trip-detail-handlers.test.tsx]
  Added test: "updates packing items locally instead of calling the server action while offline"

**defer:**

- [x] [Review][Defer] `void` on event local writes swallows errors [src/app/(app)/trips/[tripId]/use-trip-detail-handlers.ts] — deferred, pre-existing pattern
- [x] [Review][Defer] No sync-on-reconnect mechanism — deferred to Epic 2 per AC 5
- [x] [Review][Defer] Delete/handleDayUpdate/handleRemovePackingItem have no offline path — deferred to Story 1.4

**dismissed:** 3 (stale closure concern, transient race not exploitable, unnecessary `!` harmless)

#### Groups D + E — Document components + remaining (packing-list-row, place-row, feature-map)

Clean review — no production code issues.

**patch:**

- [x] [Review][Patch] Stale aria-label in doc-row/event-doc-row/packing-list-row/place-row tests — already fixed inline

**dismissed:** 0

### Change Log

- 2026-06-21: Implemented offline pending-write mirroring, outbox helpers, and pending-sync badge integration; expanded tests and passed lint, TSC, coverage, build, and full affected E2E validation.
- 2026-06-22: Code review Group A — 5 patch, 1 defer, 7 dismissed.

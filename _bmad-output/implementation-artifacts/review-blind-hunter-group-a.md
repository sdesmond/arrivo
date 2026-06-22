# Blind Hunter Review — Group A: Core Offline Infrastructure

You are a **Blind Hunter** adversarial reviewer. You receive **only the diff below** — no spec, no project context, no access to the codebase.

Review for: logic errors, API misuse, race conditions, type errors, resource leaks, incorrect error handling, security concerns.

Output findings as a Markdown list with severity **[CRITICAL]** / **[HIGH]** / **[MEDIUM]** / **[LOW]**. Each finding: one-line title, explanation, and evidence from the diff.

## Diff (Group A)

```
diff --git a/src/lib/offline/outbox.test.ts b/src/lib/offline/outbox.test.ts
new file mode 100644
--- /dev/null
+++ b/src/lib/offline/outbox.test.ts
@@ -0,0 +1,192 @@
+import { renderHook, waitFor } from "@testing-library/react";
+import { beforeEach, describe, expect, it, vi } from "vitest";
+import type { OfflineOutboxEntry, OfflineTrip } from "./schema";
+
+class MockTable<RowType extends { id: string }> {
+  rows = new Map<string, RowType>();
+  put = vi.fn(async (row: RowType) => {
+    this.rows.set(row.id, row);
+    return row.id;
+  });
+  bulkPut = vi.fn(async (rowsToInsert: RowType[]) => {
+    for (const row of rowsToInsert) { this.rows.set(row.id, row); }
+  });
+  delete = vi.fn(async (id: string) => { this.rows.delete(id); });
+  get = vi.fn(async (id: string) => this.rows.get(id));
+  toArray = vi.fn(async () => [...this.rows.values()]);
+}
+
+class MockDexie {
+  static delete = vi.fn(async () => undefined);
+  name: string;
+  trips = new MockTable<OfflineTrip>();
+  outbox = new MockTable<OfflineOutboxEntry>();
+  constructor(name: string) { this.name = name; }
+  version() { return { stores: () => undefined }; }
+}
+
+vi.mock("dexie", () => ({ default: MockDexie, Dexie: MockDexie }));
+vi.mock("dexie-react-hooks", async () => {
+  const React = await import("react");
+  return {
+    useLiveQuery: (query, deps = []) => {
+      const [value, setValue] = React.useState(undefined);
+      const dependencyKey = JSON.stringify(deps);
+      React.useEffect(() => {
+        let cancelled = false;
+        Promise.resolve(query()).then((nextValue) => { if (!cancelled) setValue(nextValue); });
+        return () => { cancelled = true; };
+      }, [dependencyKey, query]);
+      return value;
+    },
+  };
+});
+
+const { clearOfflineDb, getOfflineDb } = await import("./db");
+const { clearOutboxEntry, enqueueOutbox, getPendingOutboxEntries, usePendingCount } = await import("./outbox");
+
+describe("outbox helpers", () => {
+  beforeEach(async () => {
+    MockDexie.delete.mockClear();
+    await clearOfflineDb("outbox-test-user");
+  });
+
+  it("enqueueOutbox writes fixed-shape record with attempts starting at zero", async () => {
+    const database = await getOfflineDb("outbox-test-user");
+    const outboxId = await enqueueOutbox(database, "event", "event-1", "create", { id: "event-1", name: "Museum", tripId: "trip-1" });
+    const storedEntry = await database.outbox.get(outboxId);
+    expect(storedEntry).toEqual({
+      id: outboxId, entityType: "event", entityId: "event-1", operation: "create",
+      payload: { id: "event-1", name: "Museum", tripId: "trip-1" },
+      createdAt: expect.any(String), attempts: 0,
+    });
+  });
+
+  it("getPendingOutboxEntries returns rows ordered by createdAt ascending", async () => {
+    const database = await getOfflineDb("outbox-test-user");
+    await database.outbox.bulkPut([
+      { id: "outbox-2", entityType: "packingItem", entityId: "packing-2", operation: "update", payload: { id: "packing-2" }, createdAt: "2026-06-21T12:05:00.000Z", attempts: 1 },
+      { id: "outbox-1", entityType: "event", entityId: "event-1", operation: "create", payload: { id: "event-1" }, createdAt: "2026-06-21T12:00:00.000Z", attempts: 0 },
+    ]);
+    const entries = await getPendingOutboxEntries(database);
+    expect(entries.map((e) => e.id)).toEqual(["outbox-1", "outbox-2"]);
+  });
+
+  it("clearOutboxEntry removes row by id", async () => {
+    const database = await getOfflineDb("outbox-test-user");
+    await database.outbox.put({ id: "outbox-1", entityType: "document", entityId: "doc-1", operation: "create", payload: { id: "doc-1" }, createdAt: "2026-06-21T12:00:00.000Z", attempts: 0 });
+    await clearOutboxEntry(database, "outbox-1");
+    await expect(database.outbox.get("outbox-1")).resolves.toBeUndefined();
+  });
+
+  it("usePendingCount returns zero when the session has no user", async () => {
+    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => null }));
+    const { result } = renderHook(() => usePendingCount());
+    await waitFor(() => expect(result.current).toBe(0));
+  });
+
+  it("usePendingCount reflects current outbox row count", async () => {
+    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ user: { id: "outbox-test-user" } }) }));
+    const database = await getOfflineDb("outbox-test-user");
+    await database.outbox.bulkPut([
+      { id: "outbox-1", entityType: "event", entityId: "event-1", operation: "create", payload: { id: "event-1" }, createdAt: "2026-06-21T12:00:00.000Z", attempts: 0 },
+      { id: "outbox-2", entityType: "document", entityId: "doc-1", operation: "create", payload: { id: "doc-1" }, createdAt: "2026-06-21T12:01:00.000Z", attempts: 0 },
+    ]);
+    const { result } = renderHook(() => usePendingCount());
+    await waitFor(() => expect(result.current).toBe(2));
+  });
+});

diff --git a/src/lib/offline/outbox.ts b/src/lib/offline/outbox.ts
new file mode 100644
--- /dev/null
+++ b/src/lib/offline/outbox.ts
@@ -0,0 +1,49 @@
+"use client";
+import { useLiveQuery } from "dexie-react-hooks";
+import type { OfflineDb } from "./db";
+import { useOfflineDb } from "./db";
+import type { OfflineEntityType, OfflineOperation, OfflineOutboxEntry } from "./schema";
+
+export async function enqueueOutbox(database: OfflineDb, entityType: OfflineEntityType, entityId: string, operation: OfflineOperation, payload: unknown): Promise<string> {
+  const outboxId = crypto.randomUUID();
+  await database.outbox.put({ id: outboxId, entityType, entityId, operation, payload, createdAt: new Date().toISOString(), attempts: 0 });
+  return outboxId;
+}
+
+export async function clearOutboxEntry(database: OfflineDb, outboxId: string): Promise<void> {
+  await database.outbox.delete(outboxId);
+}
+
+export async function getPendingOutboxEntries(database: OfflineDb): Promise<OfflineOutboxEntry[]> {
+  const entries = await database.outbox.toArray();
+  return [...entries].sort((first, second) => first.createdAt.localeCompare(second.createdAt));
+}
+
+export function usePendingCount(): number {
+  const database = useOfflineDb();
+  const pendingCount = useLiveQuery(async () => {
+    if (!database) return 0;
+    const entries = await database.outbox.toArray();
+    return entries.length;
+  }, [database]);
+  return pendingCount ?? 0;
+}

diff --git a/src/lib/offline/schema.test.ts b/src/lib/offline/schema.test.ts
--- a/src/lib/offline/schema.test.ts
+++ b/src/lib/offline/schema.test.ts
@@ -1,5 +1,5 @@
 import { describe, it, expect } from "vitest";
-import { OFFLINE_DB_SCHEMA_V1 } from "./schema";
+import { OFFLINE_DB_SCHEMA_V1, OFFLINE_DB_SCHEMA_V2 } from "./schema";
 // ... existing V1 tests unchanged ...
+describe("OFFLINE_DB_SCHEMA_V2", () => {
+  it("adds syncStatus index to events", () => {
+    expect(OFFLINE_DB_SCHEMA_V2.events).toBe("id, tripId, dayId, position, [tripId+dayId], syncStatus");
+  });
+  it("adds syncStatus index to documents", () => {
+    expect(OFFLINE_DB_SCHEMA_V2.documents).toBe("id, tripId, eventId, reservationId, syncStatus");
+  });
+  it("adds syncStatus index to packingItems", () => {
+    expect(OFFLINE_DB_SCHEMA_V2.packingItems).toBe("id, tripId, listId, syncStatus");
+  });
+});

diff --git a/src/lib/offline/schema.ts b/src/lib/offline/schema.ts
--- a/src/lib/offline/schema.ts
+++ b/src/lib/offline/schema.ts
@@ -1,5 +1,27 @@
 import type { TripDetailPayload, TripListEntry } from "@/data/types";
 
+export const OfflineSyncStatus = { Pending: "pending", Synced: "synced" } as const;
+export type OfflineSyncStatus = (typeof OfflineSyncStatus)[keyof typeof OfflineSyncStatus];
+
+export const OfflineEntityType = { Trip: "trip", Day: "day", Event: "event", Document: "document", PackingItem: "packingItem" } as const;
+export type OfflineEntityType = (typeof OfflineEntityType)[keyof typeof OfflineEntityType];
+
+export const OfflineOperation = { Create: "create", Update: "update", Delete: "delete" } as const;
+export type OfflineOperation = (typeof OfflineOperation)[keyof typeof OfflineOperation];
+
 // ... existing interfaces ...
 @OfflineEvent + syncStatus: OfflineSyncStatus
 @OfflineDocument + updatedAt: string + syncStatus: OfflineSyncStatus
 @OfflinePackingItem + updatedAt: string + syncStatus: OfflineSyncStatus
 @OfflineOutboxEntry entityType: string -> OfflineEntityType, operation: string -> OfflineOperation

export const OFFLINE_DB_SCHEMA_V2 = {
  trips: "id, ownerId",
  days: "id, tripId, dayNumber, [tripId+dayNumber]",
  events: "id, tripId, dayId, position, [tripId+dayId], syncStatus",
  documents: "id, tripId, eventId, reservationId, syncStatus",
  packingItems: "id, tripId, listId, syncStatus",
  outbox: "id, entityId",
} as const;

diff --git a/src/lib/offline/db.ts b/src/lib/offline/db.ts
--- a/src/lib/offline/db.ts
+++ b/src/lib/offline/db.ts
@@ -1,27 +1,63 @@
 "use client";
 import { useEffect, useState } from "react";
+import { useLiveQuery } from "dexie-react-hooks";
 import Dexie, { type Table } from "dexie";
+import { formatFileSize, getTripStatus, inferDocKind } from "@/lib/utils";
+import { getNow } from "@/lib/mock-date";
 import {
-  OFFLINE_DB_SCHEMA_V1,
-  type OfflineTrip, type OfflineDay, type OfflineEvent, type OfflineDocument, type OfflinePackingItem, type OfflineOutboxEntry,
+  OFFLINE_DB_SCHEMA_V1, OFFLINE_DB_SCHEMA_V2, OfflineOperation, OfflineSyncStatus,
+  type OfflineDay, type OfflineDocument, type OfflineEvent, type OfflineOutboxEntry, type OfflinePackingItem,
+  type OfflineSyncStatus as OfflineSyncStatusValue, type OfflineTrip,
 } from "./schema";
-import { getTripStatus } from "@/lib/utils";
 import type { Trip, TripEvent, Document, DayItinerary, PackingItem, TripDetailPayload, TripListEntry } from "@/data/types";
+import type { AddPackingItemInput, CreateEventInput, UpdateEventPatch, UpdatePackingItemInput } from "@/data/types";

[~10KB of helper functions, snapshot management, and new local write paths added]
Key new exports:
- writeEventLocally(database, tripId, dayId, input) — creates pending event row + outbox entry + updates trip snapshot
- updateEventLocally(database, eventId, patch) — updates existing event to pending + enqueues outbox
- writeDocumentLocally(database, input) — creates pending document row + outbox entry with file blob reference
- writePackingItemLocally(database, input) — creates/toggles/updates packing item with pending status + outbox
- useOfflineEntitySyncStatus(entityType, entityId) — returns syncStatus via useLiveQuery
- mirrorTripDetail updated: preserves pending rows during refresh via mergeRowsById + applyPendingRowsToDetail

[~8KB of test additions]
New test groups:
- useOfflineEntitySyncStatus tests (3 tests)
- offline local write paths (~15 tests covering event create/update/clear/missing, document create, packing item create/toggle/update)

Full diff available at: C:/Users/spenc/AppData/Local/Temp/opencode/diff-group-a.txt
```

Produce findings on what you can see here.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OfflineOutboxEntry, OfflineTrip } from "./schema";

class MockTable<RowType extends { id: string }> {
  rows = new Map<string, RowType>();

  put = vi.fn(async (row: RowType) => {
    this.rows.set(row.id, row);
    return row.id;
  });

  bulkPut = vi.fn(async (rowsToInsert: RowType[]) => {
    for (const row of rowsToInsert) {
      this.rows.set(row.id, row);
    }
  });

  delete = vi.fn(async (id: string) => {
    this.rows.delete(id);
  });

  get = vi.fn(async (id: string) => this.rows.get(id));

  toArray = vi.fn(async () => [...this.rows.values()]);
}

class MockDexie {
  static delete = vi.fn(async () => undefined);
  name: string;
  trips = new MockTable<OfflineTrip>();
  outbox = new MockTable<OfflineOutboxEntry>();

  constructor(name: string) {
    this.name = name;
  }

  version() {
    return { stores: () => undefined };
  }
}

vi.mock("dexie", () => ({
  default: MockDexie,
  Dexie: MockDexie,
}));

const { clearOfflineDb, getOfflineDb } = await import("./db");
const { clearOutboxEntry, enqueueOutbox, getPendingOutboxEntries } = await import("./outbox");

describe("outbox helpers", () => {
  beforeEach(async () => {
    MockDexie.delete.mockClear();
    await clearOfflineDb("outbox-test-user");
  });

  it("enqueueOutbox writes fixed-shape record with attempts starting at zero", async () => {
    const database = await getOfflineDb("outbox-test-user");

    const outboxId = await enqueueOutbox(database, "event", "event-1", "create", {
      id: "event-1",
      name: "Museum",
      tripId: "trip-1",
    });

    const storedEntry = await database.outbox.get(outboxId);

    expect(storedEntry).toEqual({
      id: outboxId,
      entityType: "event",
      entityId: "event-1",
      operation: "create",
      payload: {
        id: "event-1",
        name: "Museum",
        tripId: "trip-1",
      },
      createdAt: expect.any(String),
      attempts: 0,
    });
  });

  it("getPendingOutboxEntries returns rows ordered by createdAt ascending", async () => {
    const database = await getOfflineDb("outbox-test-user");

    await database.outbox.bulkPut([
      {
        id: "outbox-2",
        entityType: "packingItem",
        entityId: "packing-2",
        operation: "update",
        payload: { id: "packing-2" },
        createdAt: "2026-06-21T12:05:00.000Z",
        attempts: 1,
      },
      {
        id: "outbox-1",
        entityType: "event",
        entityId: "event-1",
        operation: "create",
        payload: { id: "event-1" },
        createdAt: "2026-06-21T12:00:00.000Z",
        attempts: 0,
      },
    ]);

    const entries = await getPendingOutboxEntries(database);

    expect(entries.map((entry) => entry.id)).toEqual(["outbox-1", "outbox-2"]);
  });

  it("clearOutboxEntry removes row by id", async () => {
    const database = await getOfflineDb("outbox-test-user");
    await database.outbox.put({
      id: "outbox-1",
      entityType: "document",
      entityId: "doc-1",
      operation: "create",
      payload: { id: "doc-1" },
      createdAt: "2026-06-21T12:00:00.000Z",
      attempts: 0,
    });

    await clearOutboxEntry(database, "outbox-1");

    await expect(database.outbox.get("outbox-1")).resolves.toBeUndefined();
  });
});

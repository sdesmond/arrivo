// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActivityEventType, type ActivityBatchInput } from "@/data/types";
import { ACTIVITY_WRITE_TIMEOUT_MS } from "./activity";
import {
  BATCH_GAP_MS,
  BATCH_LOCK_TIMEOUT_MS,
  BATCHED_TYPES,
  connectionWindow,
  mergeActivityInterval,
  planMerge,
} from "./activity-batches";

const MINUTE = 60_000;
const BASE = new Date("2026-10-26T12:00:00.000Z");
const at = (minutes: number) => new Date(BASE.getTime() + minutes * MINUTE);

const INPUT: ActivityBatchInput = {
  type: ActivityEventType.TripUpdated,
  actor: { id: "user-1", username: "alice" },
  tripId: "trip-1",
};

interface Row {
  id: string;
  startedAt: Date;
  endedAt: Date;
}

const calls: string[] = [];
const insertValues = vi.fn();
const updateSet = vi.fn();
const deleteWhere = vi.fn();
let rows: Row[] = [];

const transaction = {
  execute: vi.fn(async () => {
    calls.push("execute");
    return [];
  }),
  select: vi.fn(() => ({
    from: () => ({
      where: () => ({
        orderBy: async () => {
          calls.push("select");
          return rows;
        },
      }),
    }),
  })),
  insert: vi.fn(() => ({
    values: async (values: unknown) => {
      calls.push("insert");
      insertValues(values);
    },
  })),
  update: vi.fn(() => ({
    set: (values: unknown) => ({
      where: async () => {
        calls.push("update");
        updateSet(values);
      },
    }),
  })),
  delete: vi.fn(() => ({
    where: async (condition: unknown) => {
      calls.push("delete");
      deleteWhere(condition);
    },
  })),
};
const database = {
  transaction: vi.fn(async (run: (tx: typeof transaction) => Promise<void>) => run(transaction)),
} as unknown as Parameters<typeof mergeActivityInterval>[0];

describe("batching constants", () => {
  it("connects intervals at most ten minutes apart and batches only trip updates", () => {
    expect(BATCH_GAP_MS).toBe(10 * MINUTE);
    expect(BATCH_LOCK_TIMEOUT_MS).toBeLessThan(ACTIVITY_WRITE_TIMEOUT_MS);
    expect([...BATCHED_TYPES]).toEqual([ActivityEventType.TripUpdated]);
  });
});

describe("connectionWindow", () => {
  it("spans exactly one gap either side of the occurrence time", () => {
    expect(connectionWindow(BASE)).toEqual({ from: at(-10), to: at(10) });
  });
});

describe("planMerge", () => {
  it("keeps the earliest row and widens it to cover the event", () => {
    const plan = planMerge(
      [
        { id: "a", startedAt: at(-3), endedAt: at(1) },
        { id: "b", startedAt: at(0), endedAt: at(5) },
      ],
      at(12)
    );
    expect(plan).toEqual({ keepId: "a", startedAt: at(-3), endedAt: at(12), dropIds: ["b"] });
  });

  it("never shrinks a row for a delayed event inside its span", () => {
    const plan = planMerge([{ id: "a", startedAt: at(0), endedAt: at(20) }], at(5));
    expect(plan).toEqual({ keepId: "a", startedAt: at(0), endedAt: at(20), dropIds: [] });
  });

  it("extends the start for an event before the row", () => {
    const plan = planMerge([{ id: "a", startedAt: at(0), endedAt: at(20) }], at(-10));
    expect(plan).toMatchObject({ startedAt: at(-10), endedAt: at(20) });
  });

  it("bridges two rows into one spanning both", () => {
    const plan = planMerge(
      [
        { id: "a", startedAt: at(0), endedAt: at(5) },
        { id: "b", startedAt: at(15), endedAt: at(25) },
      ],
      at(10)
    );
    expect(plan).toEqual({ keepId: "a", startedAt: at(0), endedAt: at(25), dropIds: ["b"] });
  });
});

describe("mergeActivityInterval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    rows = [];
  });

  it("bounds the lock wait, then locks the key before reading and inserts a point row when none is connected", async () => {
    await mergeActivityInterval(database, INPUT, BASE);
    expect(calls).toEqual(["execute", "execute", "select", "insert"]);
    expect(insertValues).toHaveBeenCalledWith({
      type: "trip_updated",
      startedAt: BASE,
      endedAt: BASE,
      actorId: "user-1",
      actorUsername: "alice",
      targetId: null,
      targetUsername: null,
      tripId: "trip-1",
    });
    expect(updateSet).not.toHaveBeenCalled();
  });

  it("extends one connected row without deleting anything", async () => {
    rows = [{ id: "a", startedAt: at(-4), endedAt: at(-2) }];
    await mergeActivityInterval(database, INPUT, BASE);
    expect(calls).toEqual(["execute", "execute", "select", "update"]);
    expect(updateSet).toHaveBeenCalledWith({ startedAt: at(-4), endedAt: BASE });
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("deletes the rows a bridging event absorbs", async () => {
    rows = [
      { id: "a", startedAt: at(-9), endedAt: at(-8) },
      { id: "b", startedAt: at(8), endedAt: at(9) },
    ];
    await mergeActivityInterval(database, INPUT, BASE);
    expect(calls).toEqual(["execute", "execute", "select", "update", "delete"]);
    expect(updateSet).toHaveBeenCalledWith({ startedAt: at(-9), endedAt: at(9) });
  });

  it("keys on a missing trip as null instead of throwing", async () => {
    await mergeActivityInterval(database, { ...INPUT, tripId: undefined }, BASE);
    expect(insertValues).toHaveBeenCalledWith(expect.objectContaining({ tripId: null }));
  });

  it("propagates a transaction failure to the caller", async () => {
    transaction.execute.mockRejectedValueOnce(new Error("deadlock"));
    await expect(mergeActivityInterval(database, INPUT, BASE)).rejects.toThrow("deadlock");
  });
});

// @vitest-environment node
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { pendingFileDeletions } from "@/db/schema";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  update: vi.fn(),
  storageDelete: vi.fn(),
}));
vi.mock("@/db", () => ({ db: mocks }));
// Keeps the condition inspectable so the in-memory queue below can apply it.
vi.mock("drizzle-orm", async (importOriginal) => ({
  ...(await importOriginal<typeof import("drizzle-orm")>()),
  eq: (column: unknown, value: string) => ({ column, ids: [value] }),
  inArray: (column: unknown, values: string[]) => ({ column, ids: values }),
}));
vi.mock("@/lib/storage/storage-adapter", () => ({ getStorageAdapter: () => ({ del: mocks.storageDelete }) }));

import { drainPendingFileDeletions, queueFileDeletions, removeQueuedFiles } from "./file-cleanup";

let deletedWhere: unknown[];
let order: string[];
let bumpedIds: string[][];

beforeEach(() => {
  vi.clearAllMocks();
  deletedWhere = [];
  order = [];
  bumpedIds = [];
  mocks.update.mockImplementation((table: unknown) => {
    expect(table).toBe(pendingFileDeletions);
    return {
      set: (values: unknown) => {
        expect(new PgDialect().sqlToQuery((values as { createdAt: SQL }).createdAt).sql).toBe("now()");
        return {
          where: async (condition: { column: unknown; ids: string[] }) => {
            expect(condition.column).toBe(pendingFileDeletions.id);
            bumpedIds.push(condition.ids);
          },
        };
      },
    };
  });
  mocks.delete.mockImplementation((table: unknown) => {
    expect(table).toBe(pendingFileDeletions);
    return {
      where: async (condition: unknown) => {
        order.push("clear");
        deletedWhere.push(condition);
      },
    };
  });
  mocks.storageDelete.mockImplementation(async () => {
    order.push("remove");
  });
});

describe("queueFileDeletions", () => {
  it("records every url in the given transaction and returns the queued rows", async () => {
    const values = vi.fn(() => ({ returning: async () => [{ id: "q1", url: "/a" }] }));
    const transaction = { insert: vi.fn(() => ({ values })) };
    await expect(queueFileDeletions(transaction as never, ["/a"])).resolves.toEqual([{ id: "q1", url: "/a" }]);
    expect(transaction.insert).toHaveBeenCalledWith(pendingFileDeletions);
    expect(values).toHaveBeenCalledWith([{ url: "/a" }]);
  });

  it("writes only through the given transaction, so a rolled-back transaction leaves nothing to drain", async () => {
    const values = vi.fn(() => ({ returning: async () => [{ id: "q1", url: "/a" }] }));
    const transaction = { insert: vi.fn(() => ({ values })) };
    await queueFileDeletions(transaction as never, ["/a"]);
    expect(transaction.insert).toHaveBeenCalledWith(pendingFileDeletions);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("writes nothing for an empty list", async () => {
    const transaction = { insert: vi.fn() };
    await expect(queueFileDeletions(transaction as never, [])).resolves.toEqual([]);
    expect(transaction.insert).not.toHaveBeenCalled();
  });
});

describe("removeQueuedFiles", () => {
  it("removes each file, then clears its queue row", async () => {
    await removeQueuedFiles([
      { id: "q1", url: "/a" },
      { id: "q2", url: "/b" },
    ]);
    expect(mocks.storageDelete).toHaveBeenCalledWith("/a");
    expect(mocks.storageDelete).toHaveBeenCalledWith("/b");
    expect(order.filter((step) => step === "remove")).toHaveLength(2);
    expect(order.filter((step) => step === "clear")).toHaveLength(2);
    expect(order.indexOf("remove")).toBeLessThan(order.indexOf("clear"));
  });

  it("keeps the queue row, and logs, when a file cannot be removed", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.storageDelete.mockRejectedValueOnce(new Error("disk gone")).mockResolvedValueOnce(undefined);
    await removeQueuedFiles([
      { id: "q1", url: "/a" },
      { id: "q2", url: "/b" },
    ]);
    expect(warn).toHaveBeenCalledWith("Cleanup failed for /a", expect.any(Error));
    expect(mocks.delete).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("moves every failed row to the back of the queue with one update", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.storageDelete
      .mockRejectedValueOnce(new Error("disk gone"))
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("disk gone"));
    await removeQueuedFiles([
      { id: "q1", url: "/a" },
      { id: "q2", url: "/b" },
      { id: "q3", url: "/c" },
    ]);
    expect(bumpedIds).toEqual([["q1", "q3"]]);
    expect(mocks.delete).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("does not touch the queue order when every file is removed", async () => {
    await removeQueuedFiles([{ id: "q1", url: "/a" }]);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("logs and carries on when moving failed rows to the back fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.storageDelete.mockRejectedValueOnce(new Error("disk gone"));
    mocks.update.mockImplementation(() => {
      throw new Error("db down");
    });
    await expect(removeQueuedFiles([{ id: "q1", url: "/a" }])).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("Could not requeue failed deletions", expect.any(Error));
    warn.mockRestore();
  });

  it("logs and carries on when clearing a queue row fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.delete.mockReturnValue({
      where: async () => {
        throw new Error("db down");
      },
    });
    await expect(removeQueuedFiles([{ id: "q1", url: "/a" }])).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith("Could not clear queued deletion /a", expect.any(Error));
    warn.mockRestore();
  });

  it("does nothing for an empty list", async () => {
    await removeQueuedFiles([]);
    expect(mocks.storageDelete).not.toHaveBeenCalled();
  });
});

describe("drainPendingFileDeletions", () => {
  function queued(rows: { id: string; url: string }[]) {
    const limit = vi.fn(async () => rows);
    mocks.select.mockReturnValue({ from: () => ({ orderBy: () => ({ limit }) }) });
    return limit;
  }

  it("retries the oldest queued deletions in one bounded batch", async () => {
    const limit = queued([{ id: "q1", url: "/a" }]);
    await drainPendingFileDeletions();
    expect(limit).toHaveBeenCalledWith(200);
    expect(mocks.storageDelete).toHaveBeenCalledWith("/a");
    expect(deletedWhere).toHaveLength(1);
  });

  it("still removes a newer file after more than one batch of permanently failing files", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    type Row = { id: string; url: string; createdAt: number };
    let clock = 0;
    const rows: Row[] = Array.from({ length: 250 }, (_, index) => ({
      id: `stuck-${index}`,
      url: `/stuck-${index}`,
      createdAt: clock++,
    }));
    mocks.select.mockReturnValue({
      from: () => ({
        orderBy: () => ({
          limit: async (count: number) =>
            [...rows].sort((left, right) => left.createdAt - right.createdAt).slice(0, count),
        }),
      }),
    });
    mocks.update.mockImplementation(() => ({
      set: () => ({
        where: async ({ ids }: { ids: string[] }) => {
          const bumpedAt = clock++;
          for (const row of rows) if (ids.includes(row.id)) row.createdAt = bumpedAt;
        },
      }),
    }));
    mocks.delete.mockImplementation(() => ({
      where: async ({ ids }: { ids: string[] }) => {
        for (const id of ids)
          rows.splice(
            rows.findIndex((row) => row.id === id),
            1
          );
      },
    }));
    mocks.storageDelete.mockImplementation(async (url: string) => {
      if (url.startsWith("/stuck-")) throw new Error("permanent failure");
    });

    await drainPendingFileDeletions(); // the oldest 200 fail and go to the back
    rows.push({ id: "fresh", url: "/fresh", createdAt: clock++ });
    await drainPendingFileDeletions(); // 50 untried stuck rows and 150 requeued ones fill this batch
    expect(rows.map((row) => row.id)).toContain("fresh");
    await drainPendingFileDeletions(); // the rows that sat behind the failures now reach "fresh"

    expect(rows.map((row) => row.id)).not.toContain("fresh");
    expect(rows).toHaveLength(250);
    warn.mockRestore();
  });

  it("does nothing when nothing is queued", async () => {
    queued([]);
    await drainPendingFileDeletions();
    expect(mocks.storageDelete).not.toHaveBeenCalled();
  });

  it("never throws: a failed read is only logged", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.select.mockImplementation(() => {
      throw new Error("db down");
    });
    await expect(drainPendingFileDeletions()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith("[file-cleanup] drain failed (Error)");
    error.mockRestore();
  });
});

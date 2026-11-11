// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pendingFileDeletions } from "@/db/schema";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  storageDelete: vi.fn(),
}));
vi.mock("@/db", () => ({ db: mocks }));
vi.mock("@/lib/storage/storage-adapter", () => ({ getStorageAdapter: () => ({ del: mocks.storageDelete }) }));

import { drainPendingFileDeletions, queueFileDeletions, removeQueuedFiles } from "./file-cleanup";

let deletedWhere: unknown[];
let order: string[];

beforeEach(() => {
  vi.clearAllMocks();
  deletedWhere = [];
  order = [];
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

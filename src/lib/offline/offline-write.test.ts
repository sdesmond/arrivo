import { describe, it, expect, vi } from "vitest";
import { writeOfflineAware } from "./offline-write";
import type { OfflineDb } from "./db";

describe("writeOfflineAware", () => {
  it("calls offlineWrite when offline and a database session exists", async () => {
    const database = {} as OfflineDb;
    const offlineWrite = vi.fn().mockResolvedValue("offline-result");
    const onlineWrite = vi.fn().mockResolvedValue("online-result");

    const result = await writeOfflineAware(false, database, offlineWrite, onlineWrite);

    expect(result).toBe("offline-result");
    expect(offlineWrite).toHaveBeenCalledWith(database);
    expect(onlineWrite).not.toHaveBeenCalled();
  });

  it("calls onlineWrite when online", async () => {
    const database = {} as OfflineDb;
    const offlineWrite = vi.fn().mockResolvedValue("offline-result");
    const onlineWrite = vi.fn().mockResolvedValue("online-result");

    const result = await writeOfflineAware(true, database, offlineWrite, onlineWrite);

    expect(result).toBe("online-result");
    expect(offlineWrite).not.toHaveBeenCalled();
    expect(onlineWrite).toHaveBeenCalled();
  });

  it("calls onlineWrite when offline but no database session is available", async () => {
    const offlineWrite = vi.fn().mockResolvedValue("offline-result");
    const onlineWrite = vi.fn().mockResolvedValue("online-result");

    const result = await writeOfflineAware(false, undefined, offlineWrite, onlineWrite);

    expect(result).toBe("online-result");
    expect(offlineWrite).not.toHaveBeenCalled();
    expect(onlineWrite).toHaveBeenCalled();
  });

  it("calls onlineWrite when offline but the database session is null", async () => {
    const offlineWrite = vi.fn().mockResolvedValue("offline-result");
    const onlineWrite = vi.fn().mockResolvedValue("online-result");

    const result = await writeOfflineAware(false, null, offlineWrite, onlineWrite);

    expect(result).toBe("online-result");
    expect(offlineWrite).not.toHaveBeenCalled();
    expect(onlineWrite).toHaveBeenCalled();
  });

  it("propagates errors thrown by offlineWrite", async () => {
    const database = {} as OfflineDb;
    const offlineWrite = vi.fn().mockRejectedValue(new Error("offline failed"));
    const onlineWrite = vi.fn().mockResolvedValue("online-result");

    await expect(writeOfflineAware(false, database, offlineWrite, onlineWrite)).rejects.toThrow("offline failed");
  });

  it("propagates errors thrown by onlineWrite", async () => {
    const offlineWrite = vi.fn().mockResolvedValue("offline-result");
    const onlineWrite = vi.fn().mockRejectedValue(new Error("online failed"));

    await expect(writeOfflineAware(true, undefined, offlineWrite, onlineWrite)).rejects.toThrow("online failed");
  });
});

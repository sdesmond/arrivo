import { beforeEach, describe, it, expect, vi } from "vitest";
import type { OfflineDb } from "./db";

const { mockGetOfflineDbForSession } = vi.hoisted(() => ({
  mockGetOfflineDbForSession: vi.fn<() => Promise<OfflineDb | null>>(),
}));

vi.mock("./db", async () => {
  const actual = await vi.importActual<typeof import("./db")>("./db");
  return {
    ...actual,
    getOfflineDbForSession: mockGetOfflineDbForSession,
  };
});

const { writeOfflineAware } = await import("./offline-write");

describe("writeOfflineAware", () => {
  beforeEach(() => {
    mockGetOfflineDbForSession.mockReset();
  });

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

  it("resolves an offline database session on demand when offline", async () => {
    const database = { userId: "cached-user" } as OfflineDb;
    const offlineWrite = vi.fn().mockResolvedValue("offline-result");
    const onlineWrite = vi.fn().mockResolvedValue("online-result");
    mockGetOfflineDbForSession.mockResolvedValueOnce(database);

    const result = await writeOfflineAware(false, undefined, offlineWrite, onlineWrite);

    expect(result).toBe("offline-result");
    expect(mockGetOfflineDbForSession).toHaveBeenCalledOnce();
    expect(offlineWrite).toHaveBeenCalledWith(database);
    expect(onlineWrite).not.toHaveBeenCalled();
  });

  it("throws when offline but no database session is available", async () => {
    const offlineWrite = vi.fn().mockResolvedValue("offline-result");
    const onlineWrite = vi.fn().mockResolvedValue("online-result");
    mockGetOfflineDbForSession.mockResolvedValueOnce(null);

    await expect(writeOfflineAware(false, undefined, offlineWrite, onlineWrite)).rejects.toThrow(
      "OFFLINE_DB_UNAVAILABLE"
    );
    expect(mockGetOfflineDbForSession).toHaveBeenCalledOnce();
    expect(offlineWrite).not.toHaveBeenCalled();
    expect(onlineWrite).not.toHaveBeenCalled();
  });

  it("throws when offline and the database session is null", async () => {
    const offlineWrite = vi.fn().mockResolvedValue("offline-result");
    const onlineWrite = vi.fn().mockResolvedValue("online-result");
    mockGetOfflineDbForSession.mockResolvedValueOnce(null);

    await expect(writeOfflineAware(false, null, offlineWrite, onlineWrite)).rejects.toThrow("OFFLINE_DB_UNAVAILABLE");
    expect(mockGetOfflineDbForSession).toHaveBeenCalledOnce();
    expect(offlineWrite).not.toHaveBeenCalled();
    expect(onlineWrite).not.toHaveBeenCalled();
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

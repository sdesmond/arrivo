// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, set, where, selectWhere, leftJoin, users } = vi.hoisted(() => {
  const where = vi.fn().mockResolvedValue([]);
  const set = vi.fn(() => ({ where }));
  const selectWhere = vi.fn();
  const leftJoin = vi.fn(() => ({ where: selectWhere }));
  return {
    where,
    set,
    selectWhere,
    leftJoin,
    db: {
      update: vi.fn(() => ({ set })),
      select: vi.fn(() => ({ from: () => ({ where: selectWhere, leftJoin }) })),
    },
    users: { id: "users.id", sessionVersion: "users.session_version" },
  };
});

vi.mock("@/db", () => ({ db }));
vi.mock("@/db/schema", () => ({
  users,
  trustedDevices: { id: "td.id", userId: "td.user_id", sessionVersion: "td.session_version" },
}));

import { bumpSessionVersion, getSessionState, lockCurrentSecurityVersion } from "./session-version";

describe("session version", () => {
  beforeEach(() => vi.clearAllMocks());

  it("increments the user's session version in the database", async () => {
    await bumpSessionVersion("user-1");
    expect(db.update).toHaveBeenCalledWith(users);
    expect(set).toHaveBeenCalledWith({ sessionVersion: expect.anything() });
    expect(where).toHaveBeenCalled();
  });

  it("reads the session version alone when the token names no browser", async () => {
    selectWhere.mockResolvedValueOnce([{ sessionVersion: 3, deviceId: null }]);
    await expect(getSessionState("user-1", undefined)).resolves.toEqual({ sessionVersion: 3, deviceActive: false });
  });

  it("reports whether the token's browser is still active, in the same query", async () => {
    selectWhere.mockResolvedValueOnce([{ sessionVersion: 3, deviceId: "device-1" }]);
    await expect(getSessionState("user-1", "device-1")).resolves.toEqual({ sessionVersion: 3, deviceActive: true });
    expect(leftJoin).toHaveBeenCalledOnce();

    selectWhere.mockResolvedValueOnce([{ sessionVersion: 3, deviceId: null }]);
    await expect(getSessionState("user-1", "device-1")).resolves.toEqual({ sessionVersion: 3, deviceActive: false });
  });

  it("returns undefined for a deleted user", async () => {
    selectWhere.mockResolvedValueOnce([]);
    await expect(getSessionState("gone", "device-1")).resolves.toBeUndefined();
  });

  it("locks and rejects a session revoked before a credential write", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([{ sessionVersion: 4 }])
      .mockResolvedValueOnce([{ sessionVersion: 4 }]);
    const transaction = { execute } as never;
    await expect(lockCurrentSecurityVersion(transaction, "user-1", 3)).resolves.toBe(false);
    await expect(lockCurrentSecurityVersion(transaction, "user-1", 4)).resolves.toBe(true);
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it("rejects missing versions and deleted users", async () => {
    const execute = vi.fn().mockResolvedValue([]);
    const transaction = { execute } as never;
    await expect(lockCurrentSecurityVersion(transaction, "user-1", undefined)).resolves.toBe(false);
    expect(execute).not.toHaveBeenCalled();
    await expect(lockCurrentSecurityVersion(transaction, "user-1", 1)).resolves.toBe(false);
  });
});

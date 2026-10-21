// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { db, set, where, selectWhere, users } = vi.hoisted(() => {
  const where = vi.fn().mockResolvedValue([]);
  const set = vi.fn(() => ({ where }));
  const selectWhere = vi.fn();
  return {
    where,
    set,
    selectWhere,
    db: {
      update: vi.fn(() => ({ set })),
      select: vi.fn(() => ({ from: () => ({ where: selectWhere }) })),
    },
    users: { id: "users.id", sessionVersion: "users.session_version" },
  };
});

vi.mock("@/db", () => ({ db }));
vi.mock("@/db/schema", () => ({ users }));

import { bumpSessionVersion, getSessionVersion } from "./session-version";

describe("session version", () => {
  beforeEach(() => vi.clearAllMocks());

  it("increments the user's session version in the database", async () => {
    await bumpSessionVersion("user-1");
    expect(db.update).toHaveBeenCalledWith(users);
    expect(set).toHaveBeenCalledWith({ sessionVersion: expect.anything() });
    expect(where).toHaveBeenCalled();
  });

  it("reads the current session version", async () => {
    selectWhere.mockResolvedValueOnce([{ sessionVersion: 3 }]);
    await expect(getSessionVersion("user-1")).resolves.toBe(3);
  });

  it("returns undefined for a deleted user", async () => {
    selectWhere.mockResolvedValueOnce([]);
    await expect(getSessionVersion("gone")).resolves.toBeUndefined();
  });
});

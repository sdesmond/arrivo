// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, readActivityPage, database } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  readActivityPage: vi.fn(),
  database: {},
}));
vi.mock("@/lib/auth-helpers", () => ({ requireUser }));
vi.mock("@/lib/activity-queries", () => ({ readActivityPage }));
vi.mock("@/db", () => ({ db: database }));

import { loadActivityPage } from "./actions";

describe("loadActivityPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "admin-1" });
  });

  it("authenticates, then reads for that viewer with the read service", async () => {
    const page = { status: "ok", events: [], actors: [], loadedAt: "2026-10-26T12:00:00.000Z" };
    readActivityPage.mockResolvedValue(page);
    await expect(loadActivityPage({ actorId: "a", type: "sign_in", from: "f", to: "t", cursor: "c" })).resolves.toBe(
      page
    );
    expect(readActivityPage).toHaveBeenCalledWith(database, "admin-1", {
      actorId: "a",
      type: "sign_in",
      from: "f",
      to: "t",
      cursor: "c",
    });
    expect(requireUser.mock.invocationCallOrder[0]).toBeLessThan(readActivityPage.mock.invocationCallOrder[0]);
  });

  it("passes a lost-authority result through without content", async () => {
    readActivityPage.mockResolvedValue({ status: "forbidden" });
    await expect(loadActivityPage({})).resolves.toEqual({ status: "forbidden" });
  });

  it("drops non-string and empty wire values", async () => {
    readActivityPage.mockResolvedValue({ status: "forbidden" });
    await loadActivityPage({ actorId: 5, type: "", from: { x: 1 }, extra: "no" } as never);
    await loadActivityPage(null as never);
    expect(readActivityPage).toHaveBeenNthCalledWith(1, database, "admin-1", {
      actorId: undefined,
      type: undefined,
      from: undefined,
      to: undefined,
      cursor: undefined,
    });
    expect(readActivityPage).toHaveBeenCalledTimes(2);
  });

  it("reports unavailable instead of leaking the error", async () => {
    readActivityPage.mockRejectedValue(new Error("connection to db.internal:5432 refused"));
    const result = await loadActivityPage({});
    expect(result).toEqual({ status: "unavailable" });
    expect(JSON.stringify(result)).not.toContain("db.internal");
  });
});

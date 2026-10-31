// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { select, orderBy } = vi.hoisted(() => ({ select: vi.fn(), orderBy: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: { select } }));
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { listAppUsers, toAppUserSummaries } from "./app-users";

describe("app users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    select.mockReturnValue({ from: vi.fn(() => ({ orderBy })) });
  });
  it("sorts by username and marks only the sole completed admin, without exposing hashes", () => {
    expect(
      toAppUserSummaries([
        { id: "pending", username: "zoe", role: "admin", setupComplete: false },
        { id: "admin", username: "amy", role: "admin", setupComplete: true },
        { id: "member", username: "bob", role: "member", setupComplete: true },
      ])
    ).toEqual([
      { id: "admin", username: "amy", role: "admin", setupComplete: true, isLastCompletedAdmin: true },
      { id: "member", username: "bob", role: "member", setupComplete: true, isLastCompletedAdmin: false },
      { id: "pending", username: "zoe", role: "admin", setupComplete: false, isLastCompletedAdmin: false },
    ]);
  });
  it("allows demotion when multiple completed admins remain", () => {
    const summaries = toAppUserSummaries(
      ["amy", "bob"].map((username) => ({ id: username, username, role: "admin", setupComplete: true }))
    );
    expect(summaries.every((user) => !user.isLastCompletedAdmin)).toBe(true);
    expect(toAppUserSummaries([])).toEqual([]);
  });
  it("carries the setup expiry only for unfinished accounts", () => {
    const expires = "2026-10-29T12:00:00.000Z";
    const [done, pending, expired] = toAppUserSummaries([
      { id: "a", username: "amy", role: "member", setupComplete: true, setupExpiresAt: new Date(expires) },
      { id: "b", username: "bob", role: "member", setupComplete: false, setupExpiresAt: new Date(expires) },
      { id: "c", username: "cat", role: "member", setupComplete: false, setupExpiresAt: null },
    ]);
    expect(done).not.toHaveProperty("setupExpiresAt");
    expect(pending.setupExpiresAt).toBe(expires);
    expect(expired).not.toHaveProperty("setupExpiresAt");
  });
  it("maps a trimmed display name and omits blank or null names", () => {
    const [named, blank, missing] = toAppUserSummaries([
      { id: "a", username: "amy", name: " Amy A ", role: "member", setupComplete: true },
      { id: "b", username: "bob", name: "  ", role: "member", setupComplete: true },
      { id: "c", username: "cat", name: null, role: "member", setupComplete: true },
    ]);
    expect(named.name).toBe("Amy A");
    expect(blank).not.toHaveProperty("name");
    expect(missing).not.toHaveProperty("name");
  });
  it("queries a safe projection and maps results", async () => {
    orderBy.mockResolvedValue([
      { id: "member", username: "bob", role: "member", setupComplete: false, setupExpiresAt: null },
    ]);
    expect(await listAppUsers()).toEqual([
      { id: "member", username: "bob", role: "member", setupComplete: false, isLastCompletedAdmin: false },
    ]);
    expect(Object.keys(select.mock.calls[0][0])).toEqual([
      "id",
      "username",
      "name",
      "role",
      "setupComplete",
      "setupExpiresAt",
    ]);
    expect(orderBy).toHaveBeenCalledOnce();
  });

  it("correlates the setup expiry subquery to the outer user with a qualified id", async () => {
    orderBy.mockResolvedValue([]);
    await listAppUsers();
    const field = select.mock.calls[0][0].setupExpiresAt as SQL;
    // Chunks as the dialect emits them for a single-table select: columns become bare identifiers.
    const text = new PgDialect().sqlToQuery(field).sql;
    expect(text).toContain('"users"."id"');
  });
});

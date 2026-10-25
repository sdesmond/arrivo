// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { select, orderBy } = vi.hoisted(() => ({ select: vi.fn(), orderBy: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: { select } }));
import { listInstanceUsers, toInstanceUserSummaries } from "./instance-users";

describe("instance users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    select.mockReturnValue({ from: vi.fn(() => ({ orderBy })) });
  });
  it("sorts by username and marks only the sole completed admin, without exposing hashes", () => {
    expect(
      toInstanceUserSummaries([
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
    const summaries = toInstanceUserSummaries(
      ["amy", "bob"].map((username) => ({ id: username, username, role: "admin", setupComplete: true }))
    );
    expect(summaries.every((user) => !user.isLastCompletedAdmin)).toBe(true);
    expect(toInstanceUserSummaries([])).toEqual([]);
  });
  it("queries a safe projection and maps results", async () => {
    orderBy.mockResolvedValue([{ id: "member", username: "bob", role: "member", setupComplete: false }]);
    expect(await listInstanceUsers()).toEqual([
      { id: "member", username: "bob", role: "member", setupComplete: false, isLastCompletedAdmin: false },
    ]);
    expect(Object.keys(select.mock.calls[0][0])).toEqual(["id", "username", "role", "setupComplete"]);
    expect(orderBy).toHaveBeenCalledOnce();
  });
});

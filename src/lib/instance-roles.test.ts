// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { select, where } = vi.hoisted(() => ({ select: vi.fn(), where: vi.fn() }));
vi.mock("@/db", () => ({ db: { select } }));
import { isInstanceAdmin } from "./instance-roles";

describe("isInstanceAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    select.mockReturnValue({ from: vi.fn(() => ({ where })) });
  });

  it.each(["member", "unknown"])("denies the %s role", async (role) => {
    where.mockResolvedValue([{ role }]);
    expect(await isInstanceAdmin("user-1")).toBe(false);
  });
  it("denies a missing user", async () => {
    where.mockResolvedValue([]);
    expect(await isInstanceAdmin("missing")).toBe(false);
  });
  it("reads current authority again after demotion", async () => {
    where.mockResolvedValueOnce([{ role: "admin" }]).mockResolvedValueOnce([{ role: "member" }]);
    expect(await isInstanceAdmin("user-1")).toBe(true);
    expect(await isInstanceAdmin("user-1")).toBe(false);
    expect(select).toHaveBeenCalledTimes(2);
  });
});

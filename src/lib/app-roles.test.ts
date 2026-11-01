// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserRole } from "@/data/types";

const { select, where } = vi.hoisted(() => ({ select: vi.fn(), where: vi.fn() }));
vi.mock("@/db", () => ({ db: { select } }));
import { isAppAdmin } from "./app-roles";

describe("isAppAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    select.mockReturnValue({ from: vi.fn(() => ({ where })) });
  });

  it.each([UserRole.Member, "unknown"])("denies the %s role", async (role) => {
    where.mockResolvedValue([{ role }]);
    expect(await isAppAdmin("user-1")).toBe(false);
  });
  it("denies a missing user", async () => {
    where.mockResolvedValue([]);
    expect(await isAppAdmin("missing")).toBe(false);
  });
  it("reads current authority again after demotion", async () => {
    where.mockResolvedValueOnce([{ role: UserRole.Admin }]).mockResolvedValueOnce([{ role: UserRole.Member }]);
    expect(await isAppAdmin("user-1")).toBe(true);
    expect(await isAppAdmin("user-1")).toBe(false);
    expect(select).toHaveBeenCalledTimes(2);
  });
});

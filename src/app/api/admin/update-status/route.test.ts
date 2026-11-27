// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, isAppAdmin, getAvailableUpdate } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  isAppAdmin: vi.fn(),
  getAvailableUpdate: vi.fn(),
}));
vi.mock("@/lib/auth-helpers", () => ({ requireUser }));
vi.mock("@/lib/app-roles", () => ({ isAppAdmin }));
vi.mock("@/lib/update-check", () => ({ getAvailableUpdate }));
import { GET } from "./route";

const update = { version: "1.0.0", url: "https://github.com/sdesmond/arrivo/releases/tag/v1.0.0" };

describe("GET /api/admin/update-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "current-user" });
    getAvailableUpdate.mockResolvedValue(update);
  });

  it("returns the update to an admin without caching", async () => {
    isAppAdmin.mockResolvedValue(true);
    const response = await GET();
    expect(isAppAdmin).toHaveBeenCalledWith("current-user");
    expect(await response.json()).toEqual({ update });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("gives a member nothing and never checks", async () => {
    isAppAdmin.mockResolvedValue(false);
    const response = await GET();
    expect(await response.json()).toEqual({ update: null });
    expect(getAvailableUpdate).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("propagates unauthenticated redirects before reading authority", async () => {
    const redirectSignal = new Error("NEXT_REDIRECT");
    requireUser.mockRejectedValue(redirectSignal);
    await expect(GET()).rejects.toBe(redirectSignal);
    expect(isAppAdmin).not.toHaveBeenCalled();
    expect(getAvailableUpdate).not.toHaveBeenCalled();
  });
});

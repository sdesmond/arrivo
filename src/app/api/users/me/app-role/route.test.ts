// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, isAppAdmin } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  isAppAdmin: vi.fn(),
}));
vi.mock("@/lib/auth-helpers", () => ({ requireUser }));
vi.mock("@/lib/app-roles", () => ({ isAppAdmin }));
import { GET } from "./route";

describe("GET /api/users/me/app-role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "current-user" });
  });

  it.each([true, false])(
    "returns only the authenticated user's current admin flag (%s) without caching",
    async (isAdmin) => {
      isAppAdmin.mockResolvedValue(isAdmin);
      const response = await GET();
      expect(requireUser).toHaveBeenCalledOnce();
      expect(isAppAdmin).toHaveBeenCalledWith("current-user");
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ isAdmin });
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
  );

  it("propagates unauthenticated redirects before reading authority", async () => {
    const redirectSignal = new Error("NEXT_REDIRECT");
    requireUser.mockRejectedValue(redirectSignal);
    await expect(GET()).rejects.toBe(redirectSignal);
    expect(isAppAdmin).not.toHaveBeenCalled();
  });

  it("propagates role lookup failure instead of returning a cached role", async () => {
    isAppAdmin.mockRejectedValue(new Error("database unavailable"));
    await expect(GET()).rejects.toThrow("database unavailable");
  });
});

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, isInstanceAdmin } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  isInstanceAdmin: vi.fn(),
}));
vi.mock("@/lib/auth-helpers", () => ({ requireUser }));
vi.mock("@/lib/instance-roles", () => ({ isInstanceAdmin }));
import { GET } from "./route";

describe("GET /api/users/me/instance-role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "current-user" });
  });

  it.each([true, false])(
    "returns only the authenticated user's current admin flag (%s) without caching",
    async (isAdmin) => {
      isInstanceAdmin.mockResolvedValue(isAdmin);
      const response = await GET();
      expect(requireUser).toHaveBeenCalledOnce();
      expect(isInstanceAdmin).toHaveBeenCalledWith("current-user");
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ isAdmin });
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
  );

  it("propagates unauthenticated redirects before reading authority", async () => {
    const redirectSignal = new Error("NEXT_REDIRECT");
    requireUser.mockRejectedValue(redirectSignal);
    await expect(GET()).rejects.toBe(redirectSignal);
    expect(isInstanceAdmin).not.toHaveBeenCalled();
  });

  it("propagates role lookup failure instead of returning a cached role", async () => {
    isInstanceAdmin.mockRejectedValue(new Error("database unavailable"));
    await expect(GET()).rejects.toThrow("database unavailable");
  });
});

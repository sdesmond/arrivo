// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const { requireAdmin, changeUserRole, revalidatePath, database } = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  changeUserRole: vi.fn(),
  revalidatePath: vi.fn(),
  database: {},
}));
vi.mock("@/lib/auth-helpers", () => ({ requireAdmin }));
vi.mock("@/lib/account-role-changes", () => ({ changeUserRole }));
vi.mock("@/db", () => ({ db: database }));
vi.mock("next/cache", () => ({ revalidatePath }));
import { RoleChangeFailure } from "@/data/types";
import { changeUserRoleAction } from "./actions";
describe("changeUserRoleAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ id: "actor" });
  });
  it.each([undefined, ...Object.values(RoleChangeFailure)])(
    "guards, delegates and passes through %s",
    async (reason) => {
      const result = reason ? { ok: false, reason } : { ok: true, userId: "target", role: "admin", changed: true };
      changeUserRole.mockResolvedValue(result);
      expect(await changeUserRoleAction("target", "admin")).toBe(result);
      expect(changeUserRole).toHaveBeenCalledWith(database, "actor", { targetUserId: "target", role: "admin" });
      expect(requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(changeUserRole.mock.invocationCallOrder[0]);
      if (reason) expect(revalidatePath).not.toHaveBeenCalled();
      else {
        expect(changeUserRole.mock.invocationCallOrder[0]).toBeLessThan(revalidatePath.mock.invocationCallOrder[0]);
        expect(revalidatePath).toHaveBeenCalledWith("/admin/users");
      }
    }
  );
  it("denies stale actors before service or revalidation", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_HTTP_ERROR_FALLBACK;404"));
    await expect(changeUserRoleAction("target", "member")).rejects.toThrow("404");
    expect(changeUserRole).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

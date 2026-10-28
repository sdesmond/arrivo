// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const { nextAfter, requireAdmin, changeUserRole, addUser, revalidatePath, recordActivity, database } = vi.hoisted(
  () => ({
    nextAfter: vi.fn(),
    recordActivity: vi.fn(),
    requireAdmin: vi.fn(),
    changeUserRole: vi.fn(),
    addUser: vi.fn(),
    revalidatePath: vi.fn(),
    database: {},
  })
);
vi.mock("@/lib/auth-helpers", () => ({ requireAdmin }));
vi.mock("@/lib/account-role-changes", () => ({ changeUserRole }));
vi.mock("@/lib/account-creation", () => ({ addUser }));
vi.mock("@/db", () => ({ db: database }));
vi.mock("@/lib/activity", () => ({ recordActivity }));
vi.mock("next/server", () => ({ after: nextAfter }));
vi.mock("next/cache", () => ({ revalidatePath }));
import { RoleChangeFailure } from "@/data/types";
import { addUserAction, changeUserRoleAction } from "./actions";

describe("addUserAction", () => {
  const ACTOR = { id: "actor", username: "admin" };
  const okOutcome = {
    ok: true,
    userId: "new-id",
    username: "alex.q",
    token: "secret-token",
    expiresAt: "2026-10-29T12:00:00.000Z",
    actor: ACTOR,
  };
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("NEXTAUTH_URL", "https://arrivo.example.com/app");
    vi.stubEnv("AUTH_URL", "");
    requireAdmin.mockResolvedValue({ id: "actor" });
    recordActivity.mockReset();
  });

  it("creates the account, revalidates Users, records both events and returns the link once", async () => {
    addUser.mockResolvedValue(okOutcome);
    await expect(addUserAction("Alex.Q")).resolves.toEqual({
      ok: true,
      userId: "new-id",
      username: "alex.q",
      setupUrl: "https://arrivo.example.com/account-setup/open?token=secret-token",
      expiresAt: "2026-10-29T12:00:00.000Z",
    });
    expect(addUser).toHaveBeenCalledWith(database, "actor", { username: "Alex.Q" });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users");
    const target = { id: "new-id", username: "alex.q" };
    expect(recordActivity.mock.calls).toEqual([
      [{ type: "account_created", actor: ACTOR, target }],
      [{ type: "setup_link_generated", actor: ACTOR, target }],
    ]);
    expect(addUser.mock.invocationCallOrder[0]).toBeLessThan(recordActivity.mock.invocationCallOrder[0]);
    expect(JSON.stringify(recordActivity.mock.calls)).not.toContain("secret-token");
  });

  it("refuses without a trusted origin before touching the service, revalidation or Activity", async () => {
    vi.stubEnv("NEXTAUTH_URL", "");
    const result = await addUserAction("alex.q");
    expect(result).toMatchObject({ ok: false, reason: "origin-unavailable" });
    expect((result as { message: string }).message).toMatch(/NEXTAUTH_URL.*AUTH_URL/);
    expect(addUser).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(recordActivity).not.toHaveBeenCalled();
  });

  it.each(["invalid-username", "username-taken", "forbidden", "instance-unavailable", "retry"])(
    "passes through the %s refusal without revalidating or recording",
    async (reason) => {
      const refusal = { ok: false, reason };
      addUser.mockResolvedValue(refusal);
      expect(await addUserAction("alex.q")).toBe(refusal);
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(recordActivity).not.toHaveBeenCalled();
    }
  );

  it("denies a non-admin before the service", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_HTTP_ERROR_FALLBACK;404"));
    await expect(addUserAction("alex.q")).rejects.toThrow("404");
    expect(addUser).not.toHaveBeenCalled();
  });

  it("rethrows service failures without revalidating or recording", async () => {
    addUser.mockRejectedValue(new Error("disk full"));
    await expect(addUserAction("alex.q")).rejects.toThrow("disk full");
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("keeps the result when the real recorder cannot schedule its write", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const actual = await vi.importActual<typeof import("@/lib/activity")>("@/lib/activity");
    recordActivity.mockImplementation(actual.recordActivity);
    nextAfter.mockImplementation(() => {
      throw new Error("outside request scope");
    });
    addUser.mockResolvedValue(okOutcome);
    await expect(addUserAction("alex.q")).resolves.toMatchObject({ ok: true, userId: "new-id" });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users");
    log.mockRestore();
  });
});
describe("changeUserRoleAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordActivity.mockReset();
    nextAfter.mockReset();
    requireAdmin.mockResolvedValue({ id: "actor" });
  });
  const ACTOR = { id: "actor", username: "admin" };
  const TARGET = { id: "target", username: "bob" };
  const okOutcome = (changed: boolean) => ({
    ok: true,
    userId: "target",
    role: "admin",
    changed,
    actor: ACTOR,
    target: TARGET,
  });

  it.each(Object.values(RoleChangeFailure))(
    "passes through the %s refusal without revalidating or recording",
    async (reason) => {
      const result = { ok: false, reason };
      changeUserRole.mockResolvedValue(result);
      expect(await changeUserRoleAction("target", "admin")).toBe(result);
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(recordActivity).not.toHaveBeenCalled();
    }
  );

  it("guards, delegates and returns the client result without the usernames", async () => {
    changeUserRole.mockResolvedValue(okOutcome(true));
    expect(await changeUserRoleAction("target", "admin")).toEqual({
      ok: true,
      userId: "target",
      role: "admin",
      changed: true,
    });
    expect(changeUserRole).toHaveBeenCalledWith(database, "actor", { targetUserId: "target", role: "admin" });
    expect(requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(changeUserRole.mock.invocationCallOrder[0]);
    expect(changeUserRole.mock.invocationCallOrder[0]).toBeLessThan(revalidatePath.mock.invocationCallOrder[0]);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users");
  });

  it("records one role_changed event with both identities, only after the service committed", async () => {
    changeUserRole.mockResolvedValue(okOutcome(true));
    await changeUserRoleAction("target", "admin");
    expect(recordActivity).toHaveBeenCalledTimes(1);
    expect(recordActivity).toHaveBeenCalledWith({ type: "role_changed", actor: ACTOR, target: TARGET });
    expect(changeUserRole.mock.invocationCallOrder[0]).toBeLessThan(recordActivity.mock.invocationCallOrder[0]);
  });

  it("keeps the outcome when the real recorder cannot schedule its write", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const actual = await vi.importActual<typeof import("@/lib/activity")>("@/lib/activity");
    recordActivity.mockImplementation(actual.recordActivity);
    nextAfter.mockImplementation(() => {
      throw new Error("outside request scope");
    });
    changeUserRole.mockResolvedValue(okOutcome(true));
    await expect(changeUserRoleAction("target", "admin")).resolves.toEqual({
      ok: true,
      userId: "target",
      role: "admin",
      changed: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users");
    log.mockRestore();
  });

  it("records nothing for a no-op to the same role", async () => {
    changeUserRole.mockResolvedValue(okOutcome(false));
    await expect(changeUserRoleAction("target", "admin")).resolves.toMatchObject({ ok: true, changed: false });
    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("records nothing and rethrows when the service rolls back", async () => {
    changeUserRole.mockRejectedValue(new Error("disk full"));
    await expect(changeUserRoleAction("target", "admin")).rejects.toThrow("disk full");
    expect(recordActivity).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("denies stale actors before service or revalidation", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_HTTP_ERROR_FALLBACK;404"));
    await expect(changeUserRoleAction("target", "member")).rejects.toThrow("404");
    expect(changeUserRole).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(recordActivity).not.toHaveBeenCalled();
  });
});

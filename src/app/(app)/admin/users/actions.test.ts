// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const {
  nextAfter,
  requireAdmin,
  changeUserRole,
  addUser,
  regenerateSetupLink,
  issuePasswordReset,
  previewAccountDeletionAsAdmin,
  deleteAccountAsAdmin,
  runAccountDeletionEffects,
  signOut,
  listAppUsers,
  revalidatePath,
  recordActivity,
  database,
} = vi.hoisted(() => ({
  nextAfter: vi.fn(),
  recordActivity: vi.fn(),
  requireAdmin: vi.fn(),
  changeUserRole: vi.fn(),
  addUser: vi.fn(),
  regenerateSetupLink: vi.fn(),
  issuePasswordReset: vi.fn(),
  previewAccountDeletionAsAdmin: vi.fn(),
  deleteAccountAsAdmin: vi.fn(),
  runAccountDeletionEffects: vi.fn(),
  signOut: vi.fn(),
  listAppUsers: vi.fn(),
  revalidatePath: vi.fn(),
  database: {},
}));
vi.mock("@/lib/auth-helpers", () => ({ requireAdmin }));
vi.mock("@/lib/account-role-changes", () => ({ changeUserRole }));
vi.mock("@/lib/account-creation", () => ({ addUser }));
vi.mock("@/lib/setup-link-regeneration", () => ({ regenerateSetupLink }));
vi.mock("@/lib/password-reset-issuance", () => ({ issuePasswordReset }));
vi.mock("@/lib/account-deletion", () => ({ previewAccountDeletionAsAdmin, deleteAccountAsAdmin }));
vi.mock("@/lib/account-deletion-effects", () => ({ runAccountDeletionEffects }));
vi.mock("@/auth", () => ({ signOut }));
vi.mock("@/db", () => ({ db: database }));
vi.mock("@/lib/activity", () => ({ recordActivity }));
vi.mock("next/server", () => ({ after: nextAfter }));
vi.mock("next/cache", () => ({ revalidatePath }));
import { RoleChangeFailure } from "@/data/types";
vi.mock("@/lib/app-users", () => ({ listAppUsers }));
import {
  addUserAction,
  checkAddedUserAction,
  changeUserRoleAction,
  regenerateSetupLinkAction,
  checkSetupLinkTargetAction,
  previewAccountDeletionAction,
  deleteAccountAction,
  issuePasswordResetAction,
} from "./actions";

describe("issuePasswordResetAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ id: "actor", sessionVersion: 2 });
    vi.stubEnv("NEXTAUTH_URL", "https://arrivo.example");
    vi.stubEnv("AUTH_URL", "");
  });
  it("returns the reset link once and records only identities", async () => {
    issuePasswordReset.mockResolvedValue({
      ok: true,
      userId: "target",
      username: "alex",
      token: "secret",
      expiresAt: "2026-10-29T13:00:00Z",
      actor: { id: "actor", username: "admin" },
    });
    expect(await issuePasswordResetAction("target")).toEqual({
      ok: true,
      userId: "target",
      username: "alex",
      resetUrl: "https://arrivo.example/account-reset/open?token=secret",
      expiresAt: "2026-10-29T13:00:00Z",
    });
    expect(JSON.stringify(recordActivity.mock.calls)).not.toContain("secret");
  });
  it("does not issue without a trusted origin", async () => {
    vi.stubEnv("NEXTAUTH_URL", "");
    expect(await issuePasswordResetAction("target")).toMatchObject({ ok: false, reason: "origin-unavailable" });
    expect(issuePasswordReset).not.toHaveBeenCalled();
  });
  it("returns the committed link when Activity scheduling fails", async () => {
    issuePasswordReset.mockResolvedValue({
      ok: true,
      userId: "target",
      username: "alex",
      token: "secret",
      expiresAt: "2026-10-29T13:00:00Z",
      actor: { id: "actor", username: "admin" },
    });
    const actual = await vi.importActual<typeof import("@/lib/activity")>("@/lib/activity");
    recordActivity.mockImplementation(actual.recordActivity);
    nextAfter.mockImplementation(() => {
      throw new Error("unavailable");
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await issuePasswordResetAction("target")).toMatchObject({
      ok: true,
      resetUrl: expect.stringContaining("secret"),
    });
    log.mockRestore();
    recordActivity.mockReset();
    nextAfter.mockReset();
  });
});

describe("account deletion actions", () => {
  const ACTOR = { id: "actor", username: "admin" };
  const PREVIEW = {
    userId: "target",
    username: "traveler",
    setupComplete: true,
    transferredTripCount: 1,
    deletedTripCount: 2,
    fingerprint: "opaque",
  };
  const summary = { account: { id: "target", username: "traveler" }, deletedTripIds: ["trip-private"] };
  const deleted = (setupComplete: boolean) => ({ ok: true, summary, actor: ACTOR, setupComplete });
  beforeEach(() => {
    vi.clearAllMocks();
    recordActivity.mockReset();
    requireAdmin.mockResolvedValue({ id: "actor", sessionVersion: 2 });
  });

  describe("previewAccountDeletionAction", () => {
    it("authorizes first and returns the aggregate preview with the caller's session version", async () => {
      previewAccountDeletionAsAdmin.mockResolvedValue({ ok: true, preview: PREVIEW });

      expect(await previewAccountDeletionAction("target")).toEqual({ ok: true, preview: PREVIEW });

      expect(previewAccountDeletionAsAdmin).toHaveBeenCalledWith(
        database,
        { id: "actor", sessionVersion: 2 },
        "target"
      );
      expect(requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(
        previewAccountDeletionAsAdmin.mock.invocationCallOrder[0]
      );
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(recordActivity).not.toHaveBeenCalled();
    });
    it.each(["forbidden", "changed", "last-admin"])("passes %s through and refreshes Users", async (reason) => {
      previewAccountDeletionAsAdmin.mockResolvedValue({ ok: false, reason });

      expect(await previewAccountDeletionAction("target")).toEqual({ ok: false, reason });

      expect(revalidatePath).toHaveBeenCalledWith("/admin/users");
    });
    it.each(["app-unavailable", "retry"])("passes %s through without refreshing", async (reason) => {
      previewAccountDeletionAsAdmin.mockResolvedValue({ ok: false, reason });

      expect(await previewAccountDeletionAction("target")).toEqual({ ok: false, reason });

      expect(revalidatePath).not.toHaveBeenCalled();
    });
    it("refuses a malformed target without calling the service", async () => {
      expect(await previewAccountDeletionAction(undefined as unknown as string)).toEqual({
        ok: false,
        reason: "changed",
      });
      expect(previewAccountDeletionAsAdmin).not.toHaveBeenCalled();
    });
    it("denies non-admins before any read", async () => {
      requireAdmin.mockRejectedValue(new Error("404"));

      await expect(previewAccountDeletionAction("target")).rejects.toThrow("404");

      expect(previewAccountDeletionAsAdmin).not.toHaveBeenCalled();
    });
  });

  describe("deleteAccountAction", () => {
    it("deletes with the reviewed fingerprint and returns only the identity", async () => {
      deleteAccountAsAdmin.mockResolvedValue(deleted(true));

      expect(await deleteAccountAction("target", "opaque")).toEqual({
        ok: true,
        userId: "target",
        username: "traveler",
      });

      expect(deleteAccountAsAdmin).toHaveBeenCalledWith(
        database,
        { id: "actor", sessionVersion: 2 },
        "target",
        "opaque"
      );
      expect(revalidatePath).toHaveBeenCalledWith("/admin/users");
      expect(signOut).not.toHaveBeenCalled();
    });
    it("records a completed account's deletion as the admin event, with identities only", async () => {
      deleteAccountAsAdmin.mockResolvedValue(deleted(true));

      await deleteAccountAction("target", "opaque");

      expect(runAccountDeletionEffects).toHaveBeenCalledWith(summary, {
        type: "account_deleted_by_admin",
        actor: ACTOR,
        target: { id: "target", username: "traveler" },
      });
    });
    it("keeps the pending-account event for an unfinished account", async () => {
      deleteAccountAsAdmin.mockResolvedValue(deleted(false));

      await deleteAccountAction("target", "opaque");

      expect(runAccountDeletionEffects).toHaveBeenCalledWith(summary, {
        type: "pending_account_deleted",
        actor: ACTOR,
        target: { id: "target", username: "traveler" },
      });
    });
    it("runs effects after commit and before any sign-out", async () => {
      requireAdmin.mockResolvedValue({ id: "target", sessionVersion: 2 });
      deleteAccountAsAdmin.mockResolvedValue(deleted(true));

      await deleteAccountAction("target", "opaque");

      expect(deleteAccountAsAdmin.mock.invocationCallOrder[0]).toBeLessThan(
        runAccountDeletionEffects.mock.invocationCallOrder[0]
      );
      expect(runAccountDeletionEffects.mock.invocationCallOrder[0]).toBeLessThan(signOut.mock.invocationCallOrder[0]);
    });
    it("signs out only when the admin deleted their own account", async () => {
      requireAdmin.mockResolvedValue({ id: "target", sessionVersion: 2 });
      deleteAccountAsAdmin.mockResolvedValue(deleted(true));

      await deleteAccountAction("target", "opaque");

      expect(signOut).toHaveBeenCalledWith({ redirectTo: "/sign-in" });
    });
    it("keeps another admin signed in", async () => {
      deleteAccountAsAdmin.mockResolvedValue(deleted(true));

      await deleteAccountAction("target", "opaque");

      expect(signOut).not.toHaveBeenCalled();
    });
    it("returns the fresh preview, without Activity or effects, when the outcomes changed", async () => {
      deleteAccountAsAdmin.mockResolvedValue({ ok: false, reason: "changed", preview: PREVIEW });

      expect(await deleteAccountAction("target", "old")).toEqual({ ok: false, reason: "changed", preview: PREVIEW });

      expect(runAccountDeletionEffects).not.toHaveBeenCalled();
      expect(signOut).not.toHaveBeenCalled();
      expect(revalidatePath).not.toHaveBeenCalled();
    });
    it.each([
      ["forbidden", true],
      ["changed", true],
      ["last-admin", true],
      ["app-unavailable", false],
      ["retry", false],
    ])("passes %s through without effects (refresh: %s)", async (reason, refreshes) => {
      deleteAccountAsAdmin.mockResolvedValue({ ok: false, reason });

      expect(await deleteAccountAction("target", "opaque")).toEqual({ ok: false, reason });

      expect(runAccountDeletionEffects).not.toHaveBeenCalled();
      expect(revalidatePath.mock.calls.length > 0).toBe(refreshes);
    });
    it("never lets trip details into the response", async () => {
      deleteAccountAsAdmin.mockResolvedValue(deleted(true));

      expect(JSON.stringify(await deleteAccountAction("target", "opaque"))).not.toContain("trip-private");
    });
    it("refuses a malformed target or fingerprint without calling the service", async () => {
      expect(await deleteAccountAction("target", undefined as unknown as string)).toEqual({
        ok: false,
        reason: "changed",
      });
      expect(await deleteAccountAction(42 as unknown as string, "opaque")).toEqual({ ok: false, reason: "changed" });
      expect(deleteAccountAsAdmin).not.toHaveBeenCalled();
    });
    it("denies non-admins before any deletion", async () => {
      requireAdmin.mockRejectedValue(new Error("404"));

      await expect(deleteAccountAction("target", "opaque")).rejects.toThrow("404");

      expect(deleteAccountAsAdmin).not.toHaveBeenCalled();
    });
    it("rethrows service failures without effects", async () => {
      deleteAccountAsAdmin.mockRejectedValue(new Error("db down"));

      await expect(deleteAccountAction("target", "opaque")).rejects.toThrow("db down");

      expect(runAccountDeletionEffects).not.toHaveBeenCalled();
    });
  });
});

describe("setup link regeneration actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordActivity.mockReset();
    requireAdmin.mockResolvedValue({ id: "actor", sessionVersion: 2 });
    vi.stubEnv("NEXTAUTH_URL", "https://arrivo.example");
    vi.stubEnv("AUTH_URL", "");
  });
  it("returns one link and records only committed regeneration identities", async () => {
    regenerateSetupLink.mockResolvedValue({
      ok: true,
      userId: "target",
      username: "pending",
      token: "secret",
      expiresAt: "expiry",
      actor: { id: "actor", username: "admin" },
    });
    expect(await regenerateSetupLinkAction("target")).toEqual({
      ok: true,
      userId: "target",
      username: "pending",
      setupUrl: "https://arrivo.example/account-setup/open?token=secret",
      expiresAt: "expiry",
    });
    expect(regenerateSetupLink).toHaveBeenCalledWith(database, "actor", "target");
    expect(recordActivity.mock.calls).toEqual([
      [
        {
          type: "setup_link_regenerated",
          actor: { id: "actor", username: "admin" },
          target: { id: "target", username: "pending" },
        },
      ],
    ]);
    expect(JSON.stringify(recordActivity.mock.calls)).not.toContain("secret");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/users");
  });
  it("refuses unconfigured origin without writes or events", async () => {
    vi.stubEnv("NEXTAUTH_URL", "");
    expect(await regenerateSetupLinkAction("target")).toMatchObject({
      ok: false,
      reason: "origin-unavailable",
      message: expect.stringMatching(/NEXTAUTH_URL.*AUTH_URL/),
    });
    expect(regenerateSetupLink).not.toHaveBeenCalled();
    expect(recordActivity).not.toHaveBeenCalled();
  });
  it.each(["forbidden", "changed-state", "app-unavailable", "retry"])("passes %s without Activity", async (reason) => {
    regenerateSetupLink.mockResolvedValue({ ok: false, reason });
    expect(await regenerateSetupLinkAction("target")).toEqual({ ok: false, reason });
    expect(recordActivity).not.toHaveBeenCalled();
  });
  it.each(["unfinished", "completed", "missing"])(
    "reads authoritative %s state by immutable ID without token",
    async (state) => {
      listAppUsers.mockResolvedValue(
        state === "missing"
          ? []
          : [{ id: "target", username: "renamed", setupComplete: state === "completed", setupExpiresAt: "expiry" }]
      );
      expect(await checkSetupLinkTargetAction("target")).toEqual({
        userId: "target",
        state,
        ...(state === "unfinished" ? { setupExpiresAt: "expiry" } : {}),
      });
      expect(regenerateSetupLink).not.toHaveBeenCalled();
      expect(recordActivity).not.toHaveBeenCalled();
    }
  );
  it("denies mutation and reconciliation before access", async () => {
    requireAdmin.mockRejectedValue(new Error("404"));
    await expect(regenerateSetupLinkAction("target")).rejects.toThrow("404");
    await expect(checkSetupLinkTargetAction("target")).rejects.toThrow("404");
    expect(regenerateSetupLink).not.toHaveBeenCalled();
    expect(listAppUsers).not.toHaveBeenCalled();
  });
  it("propagates unknown mutation and read failures without recording", async () => {
    regenerateSetupLink.mockRejectedValue(new Error("unavailable"));
    listAppUsers.mockRejectedValue(new Error("unavailable"));
    await expect(regenerateSetupLinkAction("target")).rejects.toThrow("unavailable");
    await expect(checkSetupLinkTargetAction("target")).rejects.toThrow("unavailable");
    expect(recordActivity).not.toHaveBeenCalled();
  });
  it("keeps committed link success when Activity scheduling fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const actual = await vi.importActual<typeof import("@/lib/activity")>("@/lib/activity");
    recordActivity.mockImplementation(actual.recordActivity);
    nextAfter.mockImplementation(() => {
      throw new Error("outside request scope");
    });
    regenerateSetupLink.mockResolvedValue({
      ok: true,
      userId: "target",
      username: "pending",
      token: "secret",
      expiresAt: "expiry",
      actor: { id: "actor", username: "admin" },
    });
    await expect(regenerateSetupLinkAction("target")).resolves.toMatchObject({ ok: true, userId: "target" });
    log.mockRestore();
  });
});

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
    requireAdmin.mockResolvedValue({ id: "actor", sessionVersion: 2 });
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

  it.each(["invalid-username", "username-taken", "forbidden", "app-unavailable", "retry"])(
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
    requireAdmin.mockResolvedValue({ id: "actor", sessionVersion: 2 });
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

describe("checkAddedUserAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({ id: "actor", sessionVersion: 2 });
  });
  it("authorizes before reading and returns only normalized existence", async () => {
    listAppUsers.mockResolvedValue([{ id: "new", username: "alex.q" }]);
    expect(await checkAddedUserAction(" Alex.Q ")).toBe(true);
    expect(await checkAddedUserAction("absent")).toBe(false);
    expect(requireAdmin).toHaveBeenCalledTimes(2);
    expect(requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(listAppUsers.mock.invocationCallOrder[0]);
    expect(addUser).not.toHaveBeenCalled();
    expect(recordActivity).not.toHaveBeenCalled();
  });
  it("denies reads when admin authority is lost", async () => {
    requireAdmin.mockRejectedValue(new Error("NEXT_HTTP_ERROR_FALLBACK;404"));
    await expect(checkAddedUserAction("alex.q")).rejects.toThrow("404");
    expect(listAppUsers).not.toHaveBeenCalled();
  });
  it("propagates read failures", async () => {
    listAppUsers.mockRejectedValue(new Error("unavailable"));
    await expect(checkAddedUserAction("alex.q")).rejects.toThrow("unavailable");
  });
});

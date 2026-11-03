// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireUser, database, savePolicy, readPolicy, revalidatePath } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  database: {},
  savePolicy: vi.fn(),
  readPolicy: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/auth-helpers", () => ({ requireUser }));
vi.mock("@/db", () => ({ db: database }));
vi.mock("@/lib/password-policy-store", () => ({
  savePasswordPolicy: savePolicy,
  readPasswordPolicyForAdmin: readPolicy,
}));
vi.mock("next/cache", () => ({ revalidatePath }));

import { DEFAULT_PASSWORD_POLICY, type PasswordPolicy } from "@/data/types";
import { refreshPasswordPolicy, savePasswordPolicySettings } from "./actions";

const STRICT: PasswordPolicy = { ...DEFAULT_PASSWORD_POLICY, minNumbers: 2 };

describe("password policy actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "admin-1" });
  });

  it("saves through the store as the signed-in user and revalidates the page", async () => {
    savePolicy.mockResolvedValue({ status: "ok", policy: STRICT, changed: true });
    expect(await savePasswordPolicySettings(STRICT, DEFAULT_PASSWORD_POLICY)).toEqual({ status: "ok", policy: STRICT });
    expect(savePolicy).toHaveBeenCalledWith(database, "admin-1", STRICT, DEFAULT_PASSWORD_POLICY);
    expect(revalidatePath).toHaveBeenCalledWith("/admin/security");
  });

  it("requires a signed-in user before touching the store", async () => {
    requireUser.mockRejectedValue(new Error("redirect:/sign-in"));
    await expect(savePasswordPolicySettings(STRICT, DEFAULT_PASSWORD_POLICY)).rejects.toThrow("redirect:/sign-in");
    expect(savePolicy).not.toHaveBeenCalled();
  });

  it("passes untrusted input straight to the store, which validates it", async () => {
    savePolicy.mockResolvedValue({
      status: "invalid",
      error: "Minimum length must be a whole number from 8 to 16.",
      field: "minLength",
    });
    const result = await savePasswordPolicySettings({ minLength: 8.5 }, "not-a-policy");
    expect(savePolicy).toHaveBeenCalledWith(database, "admin-1", { minLength: 8.5 }, "not-a-policy");
    expect(result).toEqual({
      status: "invalid",
      error: "Minimum length must be a whole number from 8 to 16.",
      field: "minLength",
    });
  });

  it.each([
    ["stale", { status: "stale" }],
    ["forbidden", { status: "forbidden" }],
  ])("returns %s without revalidating", async (_name, result) => {
    savePolicy.mockResolvedValue(result);
    expect(await savePasswordPolicySettings(STRICT, DEFAULT_PASSWORD_POLICY)).toEqual(result);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a safe unavailable status, without error detail, when the save fails", async () => {
    savePolicy.mockRejectedValue(new Error("password_hash column leaked"));
    expect(await savePasswordPolicySettings(STRICT, DEFAULT_PASSWORD_POLICY)).toEqual({ status: "unavailable" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("never turns a committed save into a failure when revalidation throws", async () => {
    savePolicy.mockResolvedValue({ status: "ok", policy: STRICT, changed: false });
    revalidatePath.mockImplementation(() => {
      throw new Error("no cache");
    });
    expect(await savePasswordPolicySettings(STRICT, STRICT)).toEqual({ status: "ok", policy: STRICT });
  });

  it("refresh rechecks admin authority and contains failures", async () => {
    readPolicy.mockResolvedValueOnce({ status: "forbidden" }).mockRejectedValueOnce(new Error("private"));
    expect(await refreshPasswordPolicy()).toEqual({ status: "forbidden" });
    expect(readPolicy).toHaveBeenCalledWith(database, "admin-1");
    expect(await refreshPasswordPolicy()).toEqual({ status: "unavailable" });
  });

  it("refresh returns the saved rules to an admin", async () => {
    readPolicy.mockResolvedValue({ status: "ok", policy: STRICT });
    expect(await refreshPasswordPolicy()).toEqual({ status: "ok", policy: STRICT });
  });
});

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PASSWORD_POLICY, type PasswordPolicy } from "@/data/types";
import {
  PasswordPolicyUnavailableError,
  loadPasswordPolicy,
  readPasswordPolicy,
  readPasswordPolicyForAdmin,
  savePasswordPolicy,
} from "./password-policy-store";

const execute = vi.fn();
const transaction = { execute };
const database = { execute, transaction: vi.fn(async (run) => run(transaction)) } as unknown as Parameters<
  typeof savePasswordPolicy
>[0];
const actor = { id: "admin", username: "alice" };
const STRICT: PasswordPolicy = {
  minLength: 10,
  maxLength: 15,
  minUppercase: 2,
  minNumbers: 2,
  minSpecial: 2,
};

function row(policy: PasswordPolicy) {
  return { ...policy };
}

describe("reading the policy", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the stored policy", async () => {
    execute.mockResolvedValueOnce([row(STRICT)]);
    expect(await readPasswordPolicy(database)).toEqual(STRICT);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("fails closed when the singleton is missing", async () => {
    execute.mockResolvedValueOnce([]);
    await expect(readPasswordPolicy(database)).rejects.toBeInstanceOf(PasswordPolicyUnavailableError);
  });
  it("fails closed on a corrupt row instead of weakening it", async () => {
    execute.mockResolvedValueOnce([{ ...row(STRICT), minLength: 2 }]);
    await expect(readPasswordPolicy(database)).rejects.toBeInstanceOf(PasswordPolicyUnavailableError);
  });
  it("propagates database failures", async () => {
    execute.mockRejectedValueOnce(new Error("down"));
    await expect(readPasswordPolicy(database)).rejects.toThrow("down");
  });
  it("load returns the policy, or undefined on any failure", async () => {
    execute.mockResolvedValueOnce([row(STRICT)]);
    expect(await loadPasswordPolicy(database)).toEqual(STRICT);
    execute.mockRejectedValueOnce(new Error("down"));
    expect(await loadPasswordPolicy(database)).toBeUndefined();
    execute.mockResolvedValueOnce([]);
    expect(await loadPasswordPolicy(database)).toBeUndefined();
  });
});

describe("reading the policy as an admin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the policy for a completed admin from one statement", async () => {
    execute.mockResolvedValueOnce([row(STRICT)]);
    expect(await readPasswordPolicyForAdmin(database, actor.id)).toEqual({ status: "ok", policy: STRICT });
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("is forbidden when the actor is not a completed admin", async () => {
    execute.mockResolvedValueOnce([]);
    expect(await readPasswordPolicyForAdmin(database, actor.id)).toEqual({ status: "forbidden" });
  });
  it("is unavailable on a corrupt row", async () => {
    execute.mockResolvedValueOnce([{ ...row(STRICT), maxLength: 99 }]);
    expect(await readPasswordPolicyForAdmin(database, actor.id)).toEqual({ status: "unavailable" });
  });
});

describe("saving the policy", () => {
  beforeEach(() => vi.clearAllMocks());

  function locked(
    policy: PasswordPolicy = DEFAULT_PASSWORD_POLICY,
    role = "admin",
    passwordHash: string | null = "hash"
  ) {
    execute
      .mockResolvedValueOnce([{ id: true }])
      .mockResolvedValueOnce([{ id: actor.id }])
      .mockResolvedValueOnce([{ ...actor, role, passwordHash, ...policy }]);
  }

  it("locks app then account, rechecks authority and writes", async () => {
    locked();
    execute.mockResolvedValueOnce([]);
    expect(await savePasswordPolicy(database, actor.id, STRICT, DEFAULT_PASSWORD_POLICY)).toEqual({
      status: "ok",
      policy: STRICT,
      changed: true,
    });
    expect(execute).toHaveBeenCalledTimes(4);
  });
  it.each([
    ["impossible length order", { ...STRICT, minLength: 16, maxLength: 15 }],
    ["unfeasible minima", { ...STRICT, maxLength: 15, minUppercase: 6, minNumbers: 5, minSpecial: 5 }],
    ["fractions", { ...STRICT, minLength: 8.5 }],
    ["strings", { ...STRICT, minUppercase: "2" }],
    ["missing counts", { ...STRICT, minSpecial: undefined }],
    ["negative counts", { ...STRICT, minNumbers: -1 }],
    ["counts above 20", { ...STRICT, minUppercase: 21 }],
    ["not an object", "policy"],
  ])("rejects %s before opening a transaction", async (_name, policy) => {
    const result = await savePasswordPolicy(database, actor.id, policy, DEFAULT_PASSWORD_POLICY);
    expect(result.status).toBe("invalid");
    expect(database.transaction).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
  it("rejects a malformed expected policy before opening a transaction", async () => {
    const result = await savePasswordPolicy(database, actor.id, STRICT, { minLength: 8 });
    expect(result.status).toBe("invalid");
    expect(database.transaction).not.toHaveBeenCalled();
  });
  it("carries the failing field of an invalid policy", async () => {
    expect(
      await savePasswordPolicy(database, actor.id, { ...STRICT, minLength: 16, maxLength: 15 }, STRICT)
    ).toMatchObject({
      status: "invalid",
      field: "minLength",
    });
  });
  it("refuses a stale save without mutation", async () => {
    locked({ ...DEFAULT_PASSWORD_POLICY, minLength: 9 });
    expect(await savePasswordPolicy(database, actor.id, STRICT, DEFAULT_PASSWORD_POLICY)).toEqual({ status: "stale" });
    expect(execute).toHaveBeenCalledTimes(3);
  });
  it("treats a stale class minimum as stale too", async () => {
    locked({ ...DEFAULT_PASSWORD_POLICY, minSpecial: 1 });
    expect(await savePasswordPolicy(database, actor.id, STRICT, DEFAULT_PASSWORD_POLICY)).toEqual({ status: "stale" });
  });
  it.each([
    ["member", "hash"],
    ["admin", null],
  ])("refuses lost or incomplete authority (%s, %s)", async (role, passwordHash) => {
    locked(DEFAULT_PASSWORD_POLICY, role, passwordHash as string | null);
    expect(await savePasswordPolicy(database, actor.id, STRICT, DEFAULT_PASSWORD_POLICY)).toEqual({
      status: "forbidden",
    });
    expect(execute).toHaveBeenCalledTimes(3);
  });
  it("refuses a missing singleton and a missing actor", async () => {
    execute.mockResolvedValueOnce([]);
    expect(await savePasswordPolicy(database, actor.id, STRICT, DEFAULT_PASSWORD_POLICY)).toEqual({
      status: "forbidden",
    });
    execute.mockResolvedValueOnce([{ id: true }]).mockResolvedValueOnce([]);
    expect(await savePasswordPolicy(database, actor.id, STRICT, DEFAULT_PASSWORD_POLICY)).toEqual({
      status: "forbidden",
    });
  });
  it("refuses a locked actor whose joined row is gone", async () => {
    execute
      .mockResolvedValueOnce([{ id: true }])
      .mockResolvedValueOnce([{ id: actor.id }])
      .mockResolvedValueOnce([]);
    expect(await savePasswordPolicy(database, actor.id, STRICT, DEFAULT_PASSWORD_POLICY)).toEqual({
      status: "forbidden",
    });
  });
  it("fails closed when the stored row is corrupt", async () => {
    locked({ ...DEFAULT_PASSWORD_POLICY, minLength: 1 });
    expect(await savePasswordPolicy(database, actor.id, STRICT, DEFAULT_PASSWORD_POLICY)).toEqual({ status: "stale" });
    expect(execute).toHaveBeenCalledTimes(3);
  });
  it("saves 0 as a class minimum, meaning not required", async () => {
    locked(STRICT);
    execute.mockResolvedValueOnce([]);
    const next = { ...STRICT, minUppercase: 0, minNumbers: 0, minSpecial: 0 };
    expect(await savePasswordPolicy(database, actor.id, next, STRICT)).toEqual({
      status: "ok",
      policy: next,
      changed: true,
    });
  });
  it("does not write an unchanged policy", async () => {
    locked(STRICT);
    expect(await savePasswordPolicy(database, actor.id, STRICT, STRICT)).toEqual({
      status: "ok",
      policy: STRICT,
      changed: false,
    });
    expect(execute).toHaveBeenCalledTimes(3);
  });
  it("propagates rollback failures without claiming success", async () => {
    locked();
    execute.mockRejectedValueOnce(new Error("rollback"));
    await expect(savePasswordPolicy(database, actor.id, STRICT, DEFAULT_PASSWORD_POLICY)).rejects.toThrow("rollback");
  });
});

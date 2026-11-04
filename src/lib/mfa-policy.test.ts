// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ lock: vi.fn(), configured: vi.fn() }));
vi.mock("./account-lifecycle-locks", () => ({ lockAppAndUsersForUpdate: mocks.lock }));
vi.mock("./field-encryption", () => ({ isFieldEncryptionConfigured: mocks.configured }));
import { PgDialect } from "drizzle-orm/pg-core";
import { readMfaPolicy, saveMfaPolicy } from "./mfa-policy";

describe("MFA policy", () => {
  beforeEach(() => {
    mocks.lock.mockResolvedValue({ appLocked: true, lockedUserIds: new Set(["actor", "target"]) });
    mocks.configured.mockReturnValue(true);
  });
  it.each([
    [false, false, false],
    [true, false, true],
    [false, true, true],
    [true, true, true],
  ])("combines instance %s and individual %s with OR", async (instanceRequired, individualRequired, required) => {
    const execute = vi
      .fn()
      .mockResolvedValue([{ instanceRequired, individualRequired, enrolled: false, sessionVersion: 2 }]);
    await expect(readMfaPolicy({ execute } as never, "target")).resolves.toMatchObject({ required });
  });
  it.each([
    { rows: [] },
    { rows: [{ instanceRequired: null, individualRequired: false, enrolled: false, sessionVersion: 2 }] },
  ])("refuses missing or malformed authority", async ({ rows }) => {
    await expect(readMfaPolicy({ execute: vi.fn().mockResolvedValue(rows) } as never, "target")).rejects.toThrow();
  });
  function database(row: object) {
    const execute = vi.fn().mockResolvedValue([row]);
    const transaction = vi.fn(async (run) => run({ execute }));
    return { execute, transaction };
  }
  it("refuses malformed expected values and target identifiers", async () => {
    const store = database({});
    for (const args of [
      [true, "false"],
      [true, false, 4],
    ] as const) {
      await expect(
        saveMfaPolicy(store as never, { id: "actor", sessionVersion: 2 }, args[0], args[1], args[2] as never)
      ).resolves.toEqual({ status: "invalid" });
    }
  });
  const actor = { role: "admin", passwordHash: "hash", sessionVersion: 2, current: false };
  it("compares under app-before-user locks and commits only current admin saves", async () => {
    const store = database(actor);
    await expect(
      saveMfaPolicy(store as never, { id: "actor", sessionVersion: 2 }, true, false, "target")
    ).resolves.toEqual({ status: "ok", required: true });
    expect(mocks.lock).toHaveBeenCalledWith(expect.anything(), ["actor", "target"]);
    expect(store.execute).toHaveBeenCalledTimes(2);
    expect(new PgDialect().sqlToQuery(store.execute.mock.calls[1][0])).toMatchObject({
      sql: "update users set mfa_required = $1 where id = $2",
      params: [true, "target"],
    });
  });
  it.each([
    [{ ...actor, role: "member" }, "forbidden"],
    [{ ...actor, passwordHash: null }, "forbidden"],
    [{ ...actor, sessionVersion: 3 }, "forbidden"],
    [{ ...actor, current: true }, "stale"],
  ])("refuses changed authority or stale values", async (row, status) => {
    const store = database(row);
    await expect(saveMfaPolicy(store as never, { id: "actor", sessionVersion: 2 }, true, false)).resolves.toEqual({
      status,
    });
    expect(store.execute).toHaveBeenCalledTimes(1);
  });
  it("refuses enabling without encryption, but allows removing a requirement", async () => {
    mocks.configured.mockReturnValue(false);
    const store = database(actor);
    await expect(saveMfaPolicy(store as never, { id: "actor", sessionVersion: 2 }, true, false)).resolves.toEqual({
      status: "key-unavailable",
    });
    expect(store.transaction).not.toHaveBeenCalled();
    await expect(saveMfaPolicy(store as never, { id: "actor", sessionVersion: 2 }, false, false)).resolves.toEqual({
      status: "ok",
      required: false,
    });
  });
  it("rejects malformed wire values and missing locked rows", async () => {
    const store = database(actor);
    await expect(saveMfaPolicy(store as never, { id: "actor", sessionVersion: 2 }, "true", false)).resolves.toEqual({
      status: "invalid",
    });
    mocks.lock.mockResolvedValue({ appLocked: false, lockedUserIds: new Set() });
    await expect(saveMfaPolicy(store as never, { id: "actor", sessionVersion: 2 }, true, false)).resolves.toEqual({
      status: "forbidden",
    });
  });
});

it.each([undefined, "target"])("does not update unchanged policy scope %s", async (target) => {
  mocks.lock.mockResolvedValue({ appLocked: true, lockedUserIds: new Set(["actor", "target"]) });
  mocks.configured.mockReturnValue(true);
  const execute = vi
    .fn()
    .mockResolvedValue([{ role: "admin", passwordHash: "hash", sessionVersion: 2, current: false }]);
  const store = { execute, transaction: vi.fn(async (run) => run({ execute })) };
  await expect(
    saveMfaPolicy(store as never, { id: "actor", sessionVersion: 2 }, false, false, target)
  ).resolves.toEqual({ status: "ok", required: false });
  expect(execute).toHaveBeenCalledTimes(1);
  expect(new PgDialect().sqlToQuery(execute.mock.calls[0][0]).sql).not.toMatch(/update/i);
});
it("updates only the instance singleton with the requested value", async () => {
  const execute = vi
    .fn()
    .mockResolvedValue([{ role: "admin", passwordHash: "hash", sessionVersion: 2, current: false }]);
  const store = { execute, transaction: vi.fn(async (run) => run({ execute })) };
  await saveMfaPolicy(store as never, { id: "actor", sessionVersion: 2 }, true, false);
  expect(new PgDialect().sqlToQuery(execute.mock.calls[1][0])).toMatchObject({
    sql: "update app_state set mfa_required = $1 where id = true",
    params: [true],
  });
});

describe("global requirement removal", () => {
  beforeEach(() => {
    mocks.lock.mockReset().mockResolvedValue({ appLocked: true, lockedUserIds: new Set(["actor", "first", "target"]) });
    mocks.configured.mockReturnValue(true);
  });
  function storeFor(current: boolean, role = "admin") {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([{ id: "target" }, { id: "actor" }, { id: "first" }])
      .mockResolvedValueOnce([{ role, passwordHash: "hash", sessionVersion: 2, current }])
      .mockResolvedValue([]);
    return { execute, transaction: vi.fn(async (run) => run({ execute })) };
  }
  it("locks singleton before collecting and locking all users, then clears both scopes in one transaction", async () => {
    const store = storeFor(true);
    expect(await saveMfaPolicy(store as never, { id: "actor", sessionVersion: 2 }, false, true)).toEqual({
      status: "ok",
      required: false,
    });
    expect(mocks.lock.mock.calls.map((call) => call[1])).toEqual([[], ["actor", "first", "target"]]);
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(store.execute.mock.invocationCallOrder[0]);
    expect(store.execute.mock.invocationCallOrder[0]).toBeLessThan(mocks.lock.mock.invocationCallOrder[1]);
    const statements = store.execute.mock.calls.slice(2).map((call) => new PgDialect().sqlToQuery(call[0]));
    expect(statements).toMatchObject([
      { sql: "update app_state set mfa_required = $1 where id = true", params: [false] },
      { sql: "update users set mfa_required = false where mfa_required = true", params: [] },
    ]);
    expect(store.transaction).toHaveBeenCalledTimes(1);
  });
  it.each([
    [false, "admin", "stale"],
    [true, "member", "forbidden"],
  ])("never resets users on refused saves", async (current, role, status) => {
    const store = storeFor(current as boolean, role as string);
    expect(await saveMfaPolicy(store as never, { id: "actor", sessionVersion: 2 }, false, true)).toEqual({ status });
    expect(store.execute).toHaveBeenCalledTimes(2);
  });
  it("never clears users if saving the instance value fails", async () => {
    const store = storeFor(true);
    store.execute.mockRejectedValueOnce(new Error("instance unavailable"));
    await expect(saveMfaPolicy(store as never, { id: "actor", sessionVersion: 2 }, false, true)).rejects.toThrow();
    expect(store.execute.mock.calls.map((call) => new PgDialect().sqlToQuery(call[0]).sql).join(" ")).not.toContain(
      "update users"
    );
  });
  it("individual off updates only its target and never resets the singleton", async () => {
    const execute = vi
      .fn()
      .mockResolvedValue([{ role: "admin", passwordHash: "hash", sessionVersion: 2, current: true }]);
    const store = { execute, transaction: vi.fn(async (run) => run({ execute })) };
    await saveMfaPolicy(store as never, { id: "actor", sessionVersion: 2 }, false, true, "target");
    expect(new PgDialect().sqlToQuery(execute.mock.calls[1][0])).toMatchObject({
      sql: "update users set mfa_required = $1 where id = $2",
      params: [false, "target"],
    });
    expect(execute).toHaveBeenCalledTimes(2);
  });
});

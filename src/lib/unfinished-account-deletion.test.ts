// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { deleteUnfinishedAccount, type UnfinishedAccountDeletionDatabase } from "./unfinished-account-deletion";

const ADMIN = "00000000-0000-4000-8000-00000000000a";
const TARGET = "00000000-0000-4000-8000-00000000000b";
const dialect = new PgDialect();
function fake(
  options: {
    role?: string;
    actorPassword?: string | null;
    completed?: boolean;
    missing?: boolean;
    noActor?: boolean;
    noInstance?: boolean;
    deleteCount?: number;
    error?: unknown;
  } = {}
) {
  const queries: string[] = [];
  const locks: unknown[] = [];
  let rolledBack = false;
  const execute = vi.fn(async (query: SQL) => {
    const { sql: text, params } = dialect.sqlToQuery(query);
    queries.push(text);
    if (options.error) throw options.error;
    if (text.includes("instance_state")) return options.noInstance ? [] : [{ id: true }];
    if (text.includes("for update")) {
      locks.push(params[0]);
      return [{ id: params[0] }];
    }
    if (text.startsWith("delete")) return Array.from({ length: options.deleteCount ?? 1 }, () => ({ id: TARGET }));
    return [
      ...(!options.noActor
        ? [
            {
              id: ADMIN,
              username: "admin",
              role: options.role ?? "admin",
              passwordHash: options.actorPassword === undefined ? "hash" : options.actorPassword,
            },
          ]
        : []),
      ...(!options.missing
        ? [{ id: TARGET, username: "pending", role: "member", passwordHash: options.completed ? "hash" : null }]
        : []),
    ];
  });
  const transaction = vi.fn(async (run: (transaction: unknown) => Promise<unknown>) => {
    try {
      return await run({ execute });
    } catch (error) {
      rolledBack = true;
      throw error;
    }
  });
  return {
    database: { transaction } as unknown as UnfinishedAccountDeletionDatabase,
    transaction,
    queries,
    locks,
    rolledBack: () => rolledBack,
  };
}
describe("deleteUnfinishedAccount", () => {
  it("deletes in one transaction after locking instance then sorted users", async () => {
    const scope = fake();
    expect(await deleteUnfinishedAccount(scope.database, ADMIN.toUpperCase(), TARGET.toUpperCase())).toEqual({
      ok: true,
      userId: TARGET,
      username: "pending",
      actor: { id: ADMIN, username: "admin" },
    });
    expect(scope.transaction).toHaveBeenCalledOnce();
    expect(scope.queries[0]).toContain("instance_state");
    expect(scope.locks).toEqual([ADMIN, TARGET]);
    const deletes = scope.queries.filter((query) => query.startsWith("delete"));
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toContain("password_hash");
  });
  it.each([
    [{ role: "member" }, "forbidden"],
    [{ actorPassword: null }, "forbidden"],
    [{ noActor: true }, "forbidden"],
    [{ missing: true }, "changed-state"],
    [{ completed: true }, "changed-state"],
    [{ noInstance: true }, "instance-unavailable"],
  ])("refuses current locked state %j without deleting", async (options, reason) => {
    const scope = fake(options);
    expect(await deleteUnfinishedAccount(scope.database, ADMIN, TARGET)).toEqual({ ok: false, reason });
    expect(scope.queries.some((query) => query.startsWith("delete"))).toBe(false);
  });
  it("reports changed state when the guarded delete removes nothing", async () => {
    expect(await deleteUnfinishedAccount(fake({ deleteCount: 0 }).database, ADMIN, TARGET)).toEqual({
      ok: false,
      reason: "changed-state",
    });
  });
  it.each([
    ["invalid", TARGET, "forbidden"],
    [ADMIN, "invalid", "changed-state"],
  ])("rejects invalid IDs before transaction", async (actor, target, reason) => {
    const scope = fake();
    expect(await deleteUnfinishedAccount(scope.database, actor, target)).toEqual({ ok: false, reason });
    expect(scope.transaction).not.toHaveBeenCalled();
  });
  it.each(["40P01", "40001"])("maps nested SQLSTATE %s after rollback", async (code) => {
    const scope = fake({ error: new Error("query", { cause: { code } }) });
    expect(await deleteUnfinishedAccount(scope.database, ADMIN, TARGET)).toEqual({ ok: false, reason: "retry" });
    expect(scope.rolledBack()).toBe(true);
  });
  it("propagates unexpected failure after rollback", async () => {
    const scope = fake({ error: new Error("write failed") });
    await expect(deleteUnfinishedAccount(scope.database, ADMIN, TARGET)).rejects.toThrow("write failed");
    expect(scope.rolledBack()).toBe(true);
  });
});

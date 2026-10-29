// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { DbTransaction } from "@/lib/server-action-locks";
import {
  assertAnotherCompletedAdmin,
  LastCompletedAdminError,
  lockAppAndUsersForUpdate,
} from "./account-lifecycle-locks";

const dialect = new PgDialect();

function createTransaction(
  options: { appMissing?: boolean; missingUsers?: string[]; adminRows?: unknown[]; failOn?: string } = {}
) {
  const statements: { text: string; params: unknown[] }[] = [];
  const transaction = {
    execute: async (query: SQL) => {
      const { sql: text, params } = dialect.sqlToQuery(query);
      statements.push({ text, params });
      if (options.failOn && text.includes(options.failOn)) throw new Error("db down");
      if (text.includes("app_state")) return options.appMissing ? [] : [{ id: true }];
      if (text.includes("for update"))
        return options.missingUsers?.includes(params[0] as string) ? [] : [{ id: params[0] }];
      return options.adminRows ?? [];
    },
  };
  return { statements, transaction: transaction as unknown as DbTransaction };
}

describe("lockAppAndUsersForUpdate", () => {
  it("locks the singleton first, then sorted deduplicated users", async () => {
    const { statements, transaction } = createTransaction();

    const scope = await lockAppAndUsersForUpdate(transaction, ["b", "a", "b", "c"]);

    expect(statements[0].text).toContain("app_state");
    expect(statements.slice(1).map((statement) => statement.params[0])).toEqual(["a", "b", "c"]);
    expect(statements.every((statement) => statement.text.includes("for update"))).toBe(true);
    expect(scope).toEqual({ appLocked: true, lockedUserIds: new Set(["a", "b", "c"]) });
  });

  it("deduplicates ids that differ only by case", async () => {
    const { statements, transaction } = createTransaction();

    const scope = await lockAppAndUsersForUpdate(transaction, ["AA", "aa"]);

    expect(statements).toHaveLength(2);
    expect(scope.lockedUserIds).toEqual(new Set(["aa"]));
  });

  it("composes with the guard on a caller-owned transaction without opening another", async () => {
    const { transaction } = createTransaction({ adminRows: [{ id: "other" }] });
    const spy = {
      ...(transaction as object),
      transaction: () => {
        throw new Error("opened a transaction");
      },
    };

    await lockAppAndUsersForUpdate(spy as unknown as DbTransaction, ["a"]);
    await expect(assertAnotherCompletedAdmin(spy as unknown as DbTransaction, "a")).resolves.toBeUndefined();
  });

  it("reports a missing singleton without locking users", async () => {
    const { statements, transaction } = createTransaction({ appMissing: true });

    await expect(lockAppAndUsersForUpdate(transaction, ["a"])).resolves.toEqual({
      appLocked: false,
      lockedUserIds: new Set(),
    });
    expect(statements).toHaveLength(1);
  });

  it("omits missing user rows from the locked set", async () => {
    const { transaction } = createTransaction({ missingUsers: ["b"] });

    const scope = await lockAppAndUsersForUpdate(transaction, ["a", "b"]);

    expect(scope.lockedUserIds).toEqual(new Set(["a"]));
  });

  it("propagates database failures", async () => {
    const { transaction } = createTransaction({ failOn: "app_state" });

    await expect(lockAppAndUsersForUpdate(transaction, ["a"])).rejects.toThrow("db down");
  });
});

describe("assertAnotherCompletedAdmin", () => {
  it("passes when another completed admin exists, excluding target and passwordless accounts in the query", async () => {
    const { statements, transaction } = createTransaction({ adminRows: [{ id: "other" }] });

    await expect(assertAnotherCompletedAdmin(transaction, "target")).resolves.toBeUndefined();

    expect(statements[0].text).toContain('"password_hash" is not null');
    expect(statements[0].text).toContain('"id" <> $');
    expect(statements[0].params).toEqual(["admin", "target"]);
  });

  it("throws LastCompletedAdminError when no other completed admin exists", async () => {
    const { transaction } = createTransaction({ adminRows: [] });

    await expect(assertAnotherCompletedAdmin(transaction, "target")).rejects.toBeInstanceOf(LastCompletedAdminError);
  });

  it("propagates database failures", async () => {
    const { transaction } = createTransaction({ failOn: "limit 1" });

    await expect(assertAnotherCompletedAdmin(transaction, "target")).rejects.toThrow("db down");
  });
});

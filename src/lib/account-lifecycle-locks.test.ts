// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { DbTransaction } from "@/lib/server-action-locks";
import {
  accountLockMarker,
  assertAnotherCompletedAdmin,
  LastCompletedAdminError,
  lockAppAndUsersForUpdate,
  lockUsersThenTripForUpdate,
} from "./account-lifecycle-locks";

const dialect = new PgDialect();

afterEach(() => {
  vi.unstubAllEnvs();
});

function createTransaction(
  options: {
    appMissing?: boolean;
    tripMissing?: boolean;
    missingUsers?: string[];
    adminRows?: unknown[];
    failOn?: string;
  } = {}
) {
  const statements: { text: string; params: unknown[] }[] = [];
  const transaction = {
    execute: async (query: SQL) => {
      const { sql: text, params } = dialect.sqlToQuery(query);
      statements.push({ text, params });
      if (options.failOn && text.includes(options.failOn)) throw new Error("db down");
      if (text.includes("app_state")) return options.appMissing ? [] : [{ id: true }];
      if (text.includes('"trips"')) return options.tripMissing ? [] : [{ id: params[0] }];
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

  it("adds no statement outside E2E mode", async () => {
    vi.stubEnv("E2E_MODE", "");
    const { statements, transaction } = createTransaction();

    await lockAppAndUsersForUpdate(transaction, ["a"]);

    expect(statements.some((statement) => statement.text.includes("set_config"))).toBe(false);
  });

  it("in E2E mode names the waiting connection after the locked users before taking the singleton", async () => {
    vi.stubEnv("E2E_MODE", "true");
    const { statements, transaction } = createTransaction();

    await lockAppAndUsersForUpdate(transaction, ["B", "a"]);

    expect(statements[0].text).toContain("set_config('application_name'");
    expect(statements[0].text).toContain("true)");
    expect(statements[0].params).toEqual([accountLockMarker(["a", "b"])]);
    expect(statements[1].text).toContain("app_state");
  });

  it("builds the marker from sorted, deduplicated, lowercased ids", () => {
    expect(accountLockMarker(["B", "a", "b"])).toBe("arrivo-account-lock:a,b");
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

describe("lockUsersThenTripForUpdate", () => {
  it("locks sorted deduplicated users first and the trip last", async () => {
    const { statements, transaction } = createTransaction();

    const result = await lockUsersThenTripForUpdate(transaction, ["b", "A", "b", "a"], "trip-1");

    expect(result).toEqual({ locked: true });
    expect(statements.map((statement) => statement.params[0])).toEqual(["a", "b", "trip-1"]);
    expect(statements.every((statement) => statement.text.includes("for update"))).toBe(true);
    expect(statements[2].text).toContain('"trips"');
  });

  it("reports the first missing user and takes no later lock", async () => {
    const { statements, transaction } = createTransaction({ missingUsers: ["b"] });

    const result = await lockUsersThenTripForUpdate(transaction, ["c", "b", "a"], "trip-1");

    expect(result).toEqual({ locked: false, missing: "user", userId: "b" });
    expect(statements.map((statement) => statement.params[0])).toEqual(["a", "b"]);
  });

  it("reports a missing trip after the users are locked", async () => {
    const { transaction } = createTransaction({ tripMissing: true });

    await expect(lockUsersThenTripForUpdate(transaction, ["a"], "trip-1")).resolves.toEqual({
      locked: false,
      missing: "trip",
    });
  });

  it("propagates lock failures", async () => {
    const { transaction } = createTransaction({ failOn: '"trips"' });

    await expect(lockUsersThenTripForUpdate(transaction, ["a"], "trip-1")).rejects.toThrow("db down");
  });
});

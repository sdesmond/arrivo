// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import type { CredentialAuthorizationPurpose, CredentialIssuanceAuthority } from "@/data/types";
import {
  issueCredentialAuthorization,
  issueCredentialAuthorizationInTransaction,
  validateCredentialAuthorization,
  consumeCredentialAuthorization,
  type CredentialAuthorizationDatabase,
} from "./credential-authorizations";

const ADMIN = "00000000-0000-4000-8000-000000000001";
const TARGET = "00000000-0000-4000-8000-000000000002";
const NOW = new Date("2026-10-27T12:00:00Z");
const clock = () => new Date(NOW);
const authority: CredentialIssuanceAuthority = { kind: "admin", actorUserId: ADMIN };
interface StoredAuthorization {
  id: string;
  userId: string;
  purpose: string;
  digest: string;
  expiresAt: string;
  consumedAt: Date | null;
  invalidatedAt: Date | null;
}
function fake(
  options: {
    completed?: boolean;
    role?: string;
    actorRole?: string;
    actorCompleted?: boolean;
    missingApp?: boolean;
    missingTarget?: boolean;
    failure?: unknown;
    failInsert?: boolean;
    afterLock?: () => void;
  } = {}
) {
  const accounts = [
    {
      id: ADMIN,
      username: "admin",
      role: options.actorRole ?? "admin",
      passwordHash: options.actorCompleted === false ? null : "hash",
    },
    ...(options.missingTarget
      ? []
      : [
          {
            id: TARGET,
            username: "target",
            role: options.role ?? "member",
            passwordHash: options.completed ? "hash" : null,
          },
        ]),
  ];
  const rows: StoredAuthorization[] = [];
  const statements: string[] = [];
  const dialect = new PgDialect();
  const execute = vi.fn(async (query: SQL) => {
    const { sql: statement, params } = dialect.sqlToQuery(query);
    statements.push(statement);
    if (options.failure) throw options.failure;
    if (statement.includes("app_state")) {
      options.afterLock?.();
      return options.missingApp ? [] : [{ id: true }];
    }
    if (statement.includes("for update")) return accounts.filter((account) => account.id === params[0]);
    if (statement.startsWith("select") && statement.includes('from "users"'))
      return accounts.filter((account) => params.includes(account.id));
    if (statement.startsWith("select"))
      return rows
        .filter(
          (row) =>
            row.digest === params[0] &&
            row.purpose === params[1] &&
            accounts.some((account) => account.id === row.userId)
        )
        .map((row) => ({ ...row, ...accounts.find((account) => account.id === row.userId), id: row.id }));
    if (statement.startsWith("insert")) {
      if (options.failInsert) throw new Error("insert failed");
      const [id, userId, purpose, digest, expiresAt] = params as [string, string, string, string, string];
      expect(typeof expiresAt).toBe("string");
      rows.push({ id, userId, purpose, digest, expiresAt, consumedAt: null, invalidatedAt: null });
      return [];
    }
    if (statement.includes("set consumed_at")) {
      const row = rows.find((row) => row.id === params[1] && row.consumedAt === null && row.invalidatedAt === null);
      if (!row) return [];
      row.consumedAt = params[0] as Date;
      return [{ id: params[1] }];
    }
    if (statement.startsWith("update")) {
      const [timestamp, userId, ...purposes] = params;
      rows
        .filter(
          (row) => row.userId === userId && purposes.includes(row.purpose) && !row.invalidatedAt && !row.consumedAt
        )
        .forEach((row) => {
          row.invalidatedAt = timestamp as Date;
        });
    }
    return [];
  });
  const transaction = { execute };
  const database = {
    transaction: vi.fn(async (run: (transaction: unknown) => Promise<unknown>) => {
      const snapshot = structuredClone(rows);
      const accountSnapshot = structuredClone(accounts);
      try {
        return await run(transaction);
      } catch (error) {
        rows.splice(0, rows.length, ...snapshot);
        accounts.splice(0, accounts.length, ...accountSnapshot);
        throw error;
      }
    }),
  } as unknown as CredentialAuthorizationDatabase;
  return { database, rows, accounts, statements, transaction };
}
async function issue(
  fixture: ReturnType<typeof fake>,
  purpose: CredentialAuthorizationPurpose = "setup",
  caller = authority
) {
  const result = await issueCredentialAuthorization(fixture.database, caller, { userId: TARGET, purpose }, clock);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

describe("credential authorizations", () => {
  it.each([
    ["setup", false, "member", 1440],
    ["reset", true, "member", 60],
    ["recovery", true, "admin", 60],
  ] as const)(
    "issues hash-only %s with its lifetime and read-only safe validation",
    async (purpose, completed, role, minutes) => {
      const fixture = fake({ completed, role });
      const result = await issue(fixture, purpose, purpose === "recovery" ? { kind: "trusted-operator" } : authority);
      expect(Buffer.from(result.token, "base64url")).toHaveLength(32);
      expect(fixture.rows[0].digest).toBe(createHash("sha256").update(result.token).digest("hex"));
      expect(JSON.stringify(fixture.rows)).not.toContain(result.token);
      expect(result.expiresAt).toBe(new Date(NOW.getTime() + minutes * 60_000).toISOString());
      const snapshot = structuredClone(fixture.rows);
      const valid = await validateCredentialAuthorization(fixture.database, { token: result.token, purpose }, clock);
      expect(valid).toEqual({
        ok: true,
        account: { userId: TARGET, username: "target", purpose, expiresAt: result.expiresAt },
      });
      expect(fixture.rows).toEqual(snapshot);
      expect(
        await validateCredentialAuthorization(
          fixture.database,
          { token: result.token, purpose },
          () => new Date(result.expiresAt)
        )
      ).toEqual({ ok: false, reason: "invalid" });
    }
  );
  it("replaces only same purpose and preserves original on failed insertion", async () => {
    const fixture = fake({ completed: true, role: "admin" });
    const original = await issue(fixture, "reset");
    const recovery = await issue(fixture, "recovery", { kind: "trusted-operator" });
    const replacement = await issue(fixture, "reset");
    expect(
      await validateCredentialAuthorization(fixture.database, { token: original.token, purpose: "reset" }, clock)
    ).toEqual({ ok: false, reason: "invalid" });
    expect(
      (await validateCredentialAuthorization(fixture.database, { token: recovery.token, purpose: "recovery" }, clock))
        .ok
    ).toBe(true);
    expect(
      (await validateCredentialAuthorization(fixture.database, { token: replacement.token, purpose: "reset" }, clock))
        .ok
    ).toBe(true);
    const failed = fake({ failInsert: true });
    await expect(issue(failed)).rejects.toThrow("insert failed");
    expect(failed.rows).toEqual([]);
  });
  it("composes issuance in caller transaction", async () => {
    const fixture = fake();
    await expect(
      fixture.database.transaction((transaction) =>
        issueCredentialAuthorizationInTransaction(transaction, authority, { userId: TARGET, purpose: "setup" }, clock)
      )
    ).resolves.toMatchObject({ ok: true });
    expect(fixture.database.transaction).toHaveBeenCalledTimes(1);
  });
  it.each([
    { actorRole: "member" },
    { actorCompleted: false },
    { missingApp: true },
    { missingTarget: true },
    { completed: true },
  ])("refuses unauthorized/ineligible issuance %j", async (options) => {
    const fixture = fake(options);
    expect(
      (await issueCredentialAuthorization(fixture.database, authority, { userId: TARGET, purpose: "setup" }, clock)).ok
    ).toBe(false);
    expect(fixture.rows).toEqual([]);
  });
  it.each([
    ["reset", false, "member"],
    ["recovery", true, "member"],
    ["recovery", false, "admin"],
  ] as const)("rejects ineligible %s", async (purpose, completed, role) => {
    const fixture = fake({ completed, role });
    expect(
      (
        await issueCredentialAuthorization(
          fixture.database,
          purpose === "recovery" ? { kind: "trusted-operator" } : authority,
          { userId: TARGET, purpose },
          clock
        )
      ).ok
    ).toBe(false);
  });
  it("rejects operator setup and admin recovery, malformed input before DB", async () => {
    const fixture = fake();
    for (const [caller, purpose] of [
      [{ kind: "trusted-operator" }, "setup"],
      [authority, "recovery"],
      [{ kind: "admin", actorUserId: "bad" }, "setup"],
    ] as const) {
      expect(
        (await issueCredentialAuthorization(fixture.database, caller, { userId: TARGET, purpose }, clock)).ok
      ).toBe(false);
    }
    expect(
      (await issueCredentialAuthorization(fixture.database, authority, { userId: "bad", purpose: "setup" }, clock)).ok
    ).toBe(false);
    expect(
      (
        await issueCredentialAuthorization(
          fixture.database,
          authority,
          { userId: TARGET, purpose: "bad" as CredentialAuthorizationPurpose },
          clock
        )
      ).ok
    ).toBe(false);
    expect(await validateCredentialAuthorization(fixture.database, { token: "bad", purpose: "setup" }, clock)).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(fixture.database.transaction).not.toHaveBeenCalled();
  });
  it("consumes once with safe context and invalidates both reset families", async () => {
    const fixture = fake({ completed: true, role: "admin" });
    const reset = await issue(fixture, "reset");
    const recovery = await issue(fixture, "recovery", { kind: "trusted-operator" });
    const callback = vi.fn(async () => {
      fixture.accounts[1].passwordHash = "replacement";
    });
    expect(
      await consumeCredentialAuthorization(fixture.database, { token: reset.token, purpose: "reset" }, callback, clock)
    ).toEqual({ ok: true });
    expect(
      (
        await consumeCredentialAuthorization(
          fixture.database,
          { token: reset.token, purpose: "reset" },
          callback,
          clock
        )
      ).ok
    ).toBe(false);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(
      (await validateCredentialAuthorization(fixture.database, { token: recovery.token, purpose: "recovery" }, clock))
        .ok
    ).toBe(false);
  });
  it("rolls credentials and authorization back when callback throws", async () => {
    const fixture = fake();
    const issued = await issue(fixture);
    await expect(
      consumeCredentialAuthorization(
        fixture.database,
        { token: issued.token, purpose: "setup" },
        async () => {
          fixture.accounts[1].passwordHash = "changed";
          throw new Error("callback failed");
        },
        clock
      )
    ).rejects.toThrow("callback failed");
    expect(fixture.accounts[1].passwordHash).toBeNull();
    expect(
      (await validateCredentialAuthorization(fixture.database, { token: issued.token, purpose: "setup" }, clock)).ok
    ).toBe(true);
  });
  it("checks purpose, account eligibility and expiry again after waiting for lock", async () => {
    const fixture = fake();
    const issued = await issue(fixture);
    expect(
      (await validateCredentialAuthorization(fixture.database, { token: issued.token, purpose: "reset" }, clock)).ok
    ).toBe(false);
    let calls = 0;
    const delayedClock = () => (++calls === 1 ? NOW : new Date(issued.expiresAt));
    const callback = vi.fn();
    expect(
      (
        await consumeCredentialAuthorization(
          fixture.database,
          { token: issued.token, purpose: "setup" },
          callback,
          delayedClock
        )
      ).ok
    ).toBe(false);
    fixture.accounts[1].passwordHash = "completed";
    expect(
      (
        await consumeCredentialAuthorization(
          fixture.database,
          { token: issued.token, purpose: "setup" },
          callback,
          clock
        )
      ).ok
    ).toBe(false);
    expect(callback).not.toHaveBeenCalled();
  });
  it("uses real security time by default independently of itinerary time", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      const fixture = fake();
      const result = await issueCredentialAuthorization(fixture.database, authority, {
        userId: TARGET,
        purpose: "setup",
      });
      expect(result).toMatchObject({ ok: true, expiresAt: "2026-10-28T12:00:00.000Z" });
    } finally {
      vi.useRealTimers();
    }
  });
  it("rolls back when trusted completion changes authorization before conditional consumption", async () => {
    const fixture = fake();
    const original = await issue(fixture);
    await expect(
      consumeCredentialAuthorization(
        fixture.database,
        { token: original.token, purpose: "setup" },
        async () => {
          fixture.accounts[1].passwordHash = "replacement";
          fixture.rows[0].invalidatedAt = NOW;
        },
        clock
      )
    ).rejects.toThrow("Credential authorization changed during completion.");
    expect(fixture.accounts[1].passwordHash).toBeNull();
    expect(
      (await validateCredentialAuthorization(fixture.database, { token: original.token, purpose: "setup" }, clock)).ok
    ).toBe(true);
  });
  it("preserves existing authorization when replacement insert fails", async () => {
    const options = { failInsert: false };
    const fixture = fake(options);
    const original = await issue(fixture);
    options.failInsert = true;
    await expect(issue(fixture)).rejects.toThrow("insert failed");
    expect(
      (await validateCredentialAuthorization(fixture.database, { token: original.token, purpose: "setup" }, clock)).ok
    ).toBe(true);
  });
  it("refuses malformed completion, missing singleton and deleted account without callback", async () => {
    const options = { missingApp: false };
    const fixture = fake(options);
    const original = await issue(fixture);
    const callback = vi.fn();
    expect(
      (await consumeCredentialAuthorization(fixture.database, { token: "bad", purpose: "setup" }, callback, clock)).ok
    ).toBe(false);
    options.missingApp = true;
    expect(
      (
        await consumeCredentialAuthorization(
          fixture.database,
          { token: original.token, purpose: "setup" },
          callback,
          clock
        )
      ).ok
    ).toBe(false);
    options.missingApp = false;
    fixture.accounts.splice(1, 1);
    expect(
      (await validateCredentialAuthorization(fixture.database, { token: original.token, purpose: "setup" }, clock)).ok
    ).toBe(false);
    expect(
      (
        await consumeCredentialAuthorization(
          fixture.database,
          { token: original.token, purpose: "setup" },
          callback,
          clock
        )
      ).ok
    ).toBe(false);
    expect(callback).not.toHaveBeenCalled();
  });
  it("refuses stale recovery eligibility and authority under locks", async () => {
    const fixture = fake({ completed: true, role: "admin" });
    const recovery = await issue(fixture, "recovery", { kind: "trusted-operator" });
    fixture.accounts[1].role = "member";
    const callback = vi.fn();
    expect(
      (
        await consumeCredentialAuthorization(
          fixture.database,
          { token: recovery.token, purpose: "recovery" },
          callback,
          clock
        )
      ).ok
    ).toBe(false);
    const options: { afterLock?: () => void } = {};
    const stale = fake(options);
    options.afterLock = () => {
      stale.accounts[0].role = "member";
    };
    expect(
      await issueCredentialAuthorization(stale.database, authority, { userId: TARGET, purpose: "setup" }, clock)
    ).toEqual({ ok: false, reason: "forbidden" });
    expect(callback).not.toHaveBeenCalled();
  });
  it.each(["40P01", "40001"])("returns explicit retry for %s", async (code) => {
    const fixture = fake({ failure: new Error("query failed", { cause: { code } }) });
    expect(
      await issueCredentialAuthorization(fixture.database, authority, { userId: TARGET, purpose: "setup" }, clock)
    ).toEqual({ ok: false, reason: "retry" });
  });
});

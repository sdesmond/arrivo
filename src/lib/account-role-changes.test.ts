// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { RoleChangeFailure, UserRole } from "@/data/types";
import { changeUserRole, type RoleChangeDatabase } from "./account-role-changes";

const dialect = new PgDialect();

const ADMIN_A = "00000000-0000-4000-8000-00000000000a";
const ADMIN_B = "00000000-0000-4000-8000-00000000000b";
const MEMBER = "00000000-0000-4000-8000-00000000000c";
const UNFINISHED_MEMBER = "00000000-0000-4000-8000-00000000000d";
const UNFINISHED_ADMIN = "00000000-0000-4000-8000-00000000000e";
const MISSING = "00000000-0000-4000-8000-0000000000ff";

interface FakeUser {
  id: string;
  username: string;
  role: string;
  passwordHash: string | null;
}

const baseUsers = (): FakeUser[] => [
  { id: ADMIN_A, username: "admin-a", role: "admin", passwordHash: "hash" },
  { id: ADMIN_B, username: "admin-b", role: "admin", passwordHash: "hash" },
  { id: MEMBER, username: "member", role: "member", passwordHash: "hash" },
  { id: UNFINISHED_MEMBER, username: "unfinished-member", role: "member", passwordHash: null },
  { id: UNFINISHED_ADMIN, username: "unfinished-admin", role: "admin", passwordHash: null },
];

interface FakeOptions {
  users?: FakeUser[];
  appMissing?: boolean;
  onLockUser?: (users: FakeUser[], userId: string) => void;
  failUpdateWith?: unknown;
  failLockWith?: unknown;
}

function createFake(options: FakeOptions = {}) {
  const users = options.users ?? baseUsers();
  const snapshot = users.map((user) => ({ ...user }));
  const writes: string[] = [];
  let rolledBack = false;
  let transactionsOpened = 0;

  const transaction = {
    execute: async (query: SQL) => {
      const { sql: text, params } = dialect.sqlToQuery(query);
      if (text.includes("app_state")) {
        if (options.failLockWith) throw options.failLockWith;
        return options.appMissing ? [] : [{ id: true }];
      }
      if (text.startsWith("update")) {
        if (options.failUpdateWith) throw options.failUpdateWith;
        const [role, id] = params as string[];
        users.find((user) => user.id === id)!.role = role;
        writes.push(`${id}:${role}`);
        return [];
      }
      if (text.includes("for update")) {
        const userId = params[0] as string;
        options.onLockUser?.(users, userId);
        return users.some((user) => user.id === userId) ? [{ id: userId }] : [];
      }
      if (text.includes("limit 1")) {
        const excluded = params[1] as string;
        return users.filter((user) => user.role === "admin" && user.passwordHash !== null && user.id !== excluded);
      }
      return users.filter((user) => params.includes(user.id));
    },
  };
  const database = {
    transaction: async <T>(run: (tx: unknown) => Promise<T>): Promise<T> => {
      transactionsOpened++;
      try {
        return await run(transaction);
      } catch (error) {
        rolledBack = true;
        users.splice(0, users.length, ...snapshot);
        throw error;
      }
    },
  } as unknown as RoleChangeDatabase;
  return { users, writes, database, wasRolledBack: () => rolledBack, transactionCount: () => transactionsOpened };
}

const roleOf = (users: FakeUser[], id: string) => users.find((user) => user.id === id)?.role;

describe("changeUserRole", () => {
  it("promotes a completed member and returns a credential-free result", async () => {
    const { database, users } = createFake();

    const result = await changeUserRole(database, ADMIN_A, { targetUserId: MEMBER, role: UserRole.Admin });

    expect(result).toEqual({
      ok: true,
      userId: MEMBER,
      role: "admin",
      changed: true,
      actor: { id: ADMIN_A, username: "admin-a" },
      target: { id: MEMBER, username: "member" },
    });
    expect(roleOf(users, MEMBER)).toBe("admin");
    expect(JSON.stringify(result)).not.toContain("hash");
  });

  it("demotes another admin, and lets an admin self-demote, while another completed admin remains", async () => {
    const { database, users } = createFake();

    await expect(
      changeUserRole(database, ADMIN_A, { targetUserId: ADMIN_B, role: UserRole.Member })
    ).resolves.toMatchObject({
      ok: true,
      changed: true,
    });
    expect(roleOf(users, ADMIN_B)).toBe("member");

    const second = createFake();
    await expect(
      changeUserRole(second.database, ADMIN_A, { targetUserId: ADMIN_A, role: UserRole.Member })
    ).resolves.toMatchObject({
      ok: true,
    });
    expect(roleOf(second.users, ADMIN_A)).toBe("member");
  });

  it("refuses to demote the last completed admin even when unfinished admins exist", async () => {
    const { database, users, writes } = createFake({
      users: baseUsers().filter((user) => user.id !== ADMIN_B),
    });

    await expect(changeUserRole(database, ADMIN_A, { targetUserId: ADMIN_A, role: UserRole.Member })).resolves.toEqual({
      ok: false,
      reason: RoleChangeFailure.LastAdmin,
    });
    expect(roleOf(users, ADMIN_A)).toBe("admin");
    expect(writes).toEqual([]);
  });

  it("refuses promoting a passwordless account, including one already admin", async () => {
    const { database, users, writes } = createFake();

    for (const targetUserId of [UNFINISHED_MEMBER, UNFINISHED_ADMIN]) {
      await expect(changeUserRole(database, ADMIN_A, { targetUserId, role: UserRole.Admin })).resolves.toEqual({
        ok: false,
        reason: RoleChangeFailure.UnfinishedAccount,
      });
    }
    expect(roleOf(users, UNFINISHED_MEMBER)).toBe("member");
    expect(writes).toEqual([]);
  });

  it("demotes an unfinished admin without needing the guard to count it", async () => {
    const { database, users } = createFake();

    await expect(
      changeUserRole(database, ADMIN_A, { targetUserId: UNFINISHED_ADMIN, role: UserRole.Member })
    ).resolves.toMatchObject({
      ok: true,
    });
    expect(roleOf(users, UNFINISHED_ADMIN)).toBe("member");
  });

  it.each([
    ["missing actor", MISSING],
    ["member actor", MEMBER],
    ["unfinished admin actor", UNFINISHED_ADMIN],
    ["malformed actor id", "nope"],
  ])("refuses a %s as forbidden without writing", async (_label, actor) => {
    const { database, writes } = createFake();

    await expect(changeUserRole(database, actor, { targetUserId: MEMBER, role: UserRole.Admin })).resolves.toEqual({
      ok: false,
      reason: RoleChangeFailure.Forbidden,
    });
    expect(writes).toEqual([]);
  });

  it("refuses when the actor is demoted while waiting for the locks", async () => {
    const { database, writes, users } = createFake({
      onLockUser: (rows, userId) => {
        if (userId === ADMIN_A) rows.find((user) => user.id === ADMIN_A)!.role = "member";
      },
    });

    await expect(changeUserRole(database, ADMIN_A, { targetUserId: MEMBER, role: UserRole.Admin })).resolves.toEqual({
      ok: false,
      reason: RoleChangeFailure.Forbidden,
    });
    expect(roleOf(users, MEMBER)).toBe("member");
    expect(writes).toEqual([]);
  });

  it("captures usernames as they are once the locks are held", async () => {
    const { database } = createFake({
      onLockUser: (rows, userId) => {
        if (userId === MEMBER) rows.find((user) => user.id === MEMBER)!.username = "renamed-member";
      },
    });

    await expect(
      changeUserRole(database, ADMIN_A, { targetUserId: MEMBER, role: UserRole.Admin })
    ).resolves.toMatchObject({ target: { id: MEMBER, username: "renamed-member" } });
  });

  it("reports missing targets, including malformed ids", async () => {
    const { database } = createFake();

    for (const targetUserId of [MISSING, "not-a-uuid"]) {
      await expect(changeUserRole(database, ADMIN_A, { targetUserId, role: UserRole.Admin })).resolves.toEqual({
        ok: false,
        reason: RoleChangeFailure.NotFound,
      });
    }
  });

  it("matches uppercase ids against stored lowercase ids", async () => {
    const { database, users } = createFake();

    await expect(
      changeUserRole(database, ADMIN_A.toUpperCase(), { targetUserId: MEMBER.toUpperCase(), role: UserRole.Admin })
    ).resolves.toMatchObject({ ok: true, changed: true });
    expect(roleOf(users, MEMBER)).toBe("admin");
  });

  it("reports a missing singleton as app-unavailable", async () => {
    const { database } = createFake({ appMissing: true });

    await expect(changeUserRole(database, ADMIN_A, { targetUserId: MEMBER, role: UserRole.Admin })).resolves.toEqual({
      ok: false,
      reason: RoleChangeFailure.AppUnavailable,
    });
  });

  it("succeeds without writing when the target already has the requested role", async () => {
    const { database, writes } = createFake();

    await expect(changeUserRole(database, ADMIN_A, { targetUserId: ADMIN_B, role: UserRole.Admin })).resolves.toEqual({
      ok: true,
      userId: ADMIN_B,
      role: "admin",
      changed: false,
      actor: { id: ADMIN_A, username: "admin-a" },
      target: { id: ADMIN_B, username: "admin-b" },
    });
    expect(writes).toEqual([]);
  });

  it("rejects an invalid runtime role before opening a transaction", async () => {
    const { database, writes, transactionCount } = createFake();

    await expect(
      changeUserRole(database, ADMIN_A, { targetUserId: MEMBER, role: "owner" as UserRole })
    ).resolves.toEqual({ ok: false, reason: RoleChangeFailure.InvalidRole });
    expect(writes).toEqual([]);
    expect(transactionCount()).toBe(0);
  });

  it("rolls back and propagates unexpected write failures", async () => {
    const { database, users, wasRolledBack } = createFake({ failUpdateWith: new Error("disk full") });

    await expect(changeUserRole(database, ADMIN_A, { targetUserId: MEMBER, role: UserRole.Admin })).rejects.toThrow(
      "disk full"
    );
    expect(wasRolledBack()).toBe(true);
    expect(roleOf(users, MEMBER)).toBe("member");
  });

  it.each([
    ["direct deadlock", Object.assign(new Error("deadlock"), { code: "40P01" })],
    ["direct serialization", Object.assign(new Error("serialization"), { code: "40001" })],
    ["nested cause", new Error("Failed query", { cause: { code: "40P01" } })],
  ])("maps a %s failure to retry after rollback", async (_label, failure) => {
    const { database, wasRolledBack } = createFake({ failLockWith: failure });

    await expect(changeUserRole(database, ADMIN_A, { targetUserId: MEMBER, role: UserRole.Admin })).resolves.toEqual({
      ok: false,
      reason: RoleChangeFailure.Retry,
    });
    expect(wasRolledBack()).toBe(true);
  });

  it("propagates failures whose SQLSTATE is not retryable", async () => {
    const { database } = createFake({ failLockWith: Object.assign(new Error("unique"), { code: "23505" }) });

    await expect(changeUserRole(database, ADMIN_A, { targetUserId: MEMBER, role: UserRole.Admin })).rejects.toThrow(
      "unique"
    );
  });
});

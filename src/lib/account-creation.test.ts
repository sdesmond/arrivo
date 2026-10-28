// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { AddUserFailure } from "@/data/types";

const { issue } = vi.hoisted(() => ({ issue: vi.fn() }));
vi.mock("@/lib/credential-authorizations", () => ({ issueCredentialAuthorizationInTransaction: issue }));
import { addUser, type AddUserDatabase } from "./account-creation";

const dialect = new PgDialect();
const ADMIN = "00000000-0000-4000-8000-00000000000a";
const MEMBER = "00000000-0000-4000-8000-00000000000c";
const NEW_ID = "00000000-0000-4000-8000-0000000000aa";

interface FakeUser {
  id: string;
  username: string;
  role: string;
  passwordHash: string | null;
}
const baseUsers = (): FakeUser[] => [
  { id: ADMIN, username: "admin", role: "admin", passwordHash: "hash" },
  { id: MEMBER, username: "member", role: "member", passwordHash: "hash" },
  { id: "00000000-0000-4000-8000-00000000000d", username: "pending.one", role: "member", passwordHash: null },
];

interface FakeOptions {
  users?: FakeUser[];
  instanceMissing?: boolean;
  onLockUser?: (users: FakeUser[], userId: string) => void;
  failInsertWith?: unknown;
  failLockWith?: unknown;
}

function createFake(options: FakeOptions = {}) {
  const users = options.users ?? baseUsers();
  const snapshot = users.map((user) => ({ ...user }));
  let rolledBack = false;
  let transactionsOpened = 0;
  const transaction = {
    execute: async (query: SQL) => {
      const { sql: text, params } = dialect.sqlToQuery(query);
      if (text.includes("instance_state")) {
        if (options.failLockWith) throw options.failLockWith;
        return options.instanceMissing ? [] : [{ id: true }];
      }
      if (text.startsWith("insert")) {
        if (options.failInsertWith) throw options.failInsertWith;
        users.push({ id: NEW_ID, username: params[0] as string, role: params[1] as string, passwordHash: null });
        return [{ id: NEW_ID }];
      }
      if (text.includes("for update")) {
        const userId = params[0] as string;
        options.onLockUser?.(users, userId);
        return users.some((user) => user.id === userId) ? [{ id: userId }] : [];
      }
      if (text.includes("lower(")) {
        return users.filter((user) => user.username.toLowerCase() === params[0]).map((user) => ({ id: user.id }));
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
  } as unknown as AddUserDatabase;
  return { users, database, wasRolledBack: () => rolledBack, transactionCount: () => transactionsOpened };
}

const names = (users: FakeUser[]) => users.map((user) => user.username);

describe("addUser", () => {
  beforeEach(() => {
    issue.mockReset();
    issue.mockResolvedValue({ ok: true, token: "token-value", expiresAt: "2026-10-29T12:00:00.000Z" });
  });

  it("creates a passwordless member with a setup authorization and returns identities for Activity", async () => {
    const { database, users } = createFake();
    const clock = () => new Date("2026-10-28T12:00:00Z");

    const result = await addUser(database, ADMIN, { username: "  Alex.Q " }, clock);

    expect(result).toEqual({
      ok: true,
      userId: NEW_ID,
      username: "alex.q",
      token: "token-value",
      expiresAt: "2026-10-29T12:00:00.000Z",
      actor: { id: ADMIN, username: "admin" },
    });
    expect(users.find((user) => user.id === NEW_ID)).toMatchObject({
      username: "alex.q",
      role: "member",
      passwordHash: null,
    });
    expect(issue).toHaveBeenCalledWith(
      expect.anything(),
      { kind: "admin", actorUserId: ADMIN },
      { userId: NEW_ID, purpose: "setup" },
      clock
    );
  });

  it.each(["", "ab", "has space", "-leading"])(
    "rejects invalid username %j before opening a transaction",
    async (username) => {
      const { database, transactionCount } = createFake();

      const result = await addUser(database, ADMIN, { username });

      expect(result).toMatchObject({ ok: false, reason: AddUserFailure.InvalidUsername });
      expect((result as { message?: string }).message).toEqual(expect.any(String));
      expect(transactionCount()).toBe(0);
      expect(issue).not.toHaveBeenCalled();
    }
  );

  it.each(["MEMBER", "pending.one", " Admin "])(
    "refuses taken username %j without a second account",
    async (username) => {
      const { database, users } = createFake();
      const before = names(users);

      await expect(addUser(database, ADMIN, { username })).resolves.toEqual({
        ok: false,
        reason: AddUserFailure.UsernameTaken,
      });
      expect(names(users)).toEqual(before);
      expect(issue).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["missing actor", "00000000-0000-4000-8000-0000000000ff"],
    ["member actor", MEMBER],
    ["unfinished admin", "00000000-0000-4000-8000-00000000000e"],
    ["malformed id", "nope"],
  ])("refuses a %s as forbidden without writing", async (_label, actor) => {
    const { database, users } = createFake({
      users: [
        ...baseUsers(),
        { id: "00000000-0000-4000-8000-00000000000e", username: "ua", role: "admin", passwordHash: null },
      ],
    });
    const before = names(users);

    await expect(addUser(database, actor, { username: "newbie" })).resolves.toEqual({
      ok: false,
      reason: AddUserFailure.Forbidden,
    });
    expect(names(users)).toEqual(before);
    expect(issue).not.toHaveBeenCalled();
  });

  it("refuses when the actor is demoted while waiting for the locks", async () => {
    const { database, users } = createFake({
      onLockUser: (rows, userId) => {
        if (userId === ADMIN) rows.find((user) => user.id === ADMIN)!.role = "member";
      },
    });

    await expect(addUser(database, ADMIN, { username: "newbie" })).resolves.toEqual({
      ok: false,
      reason: AddUserFailure.Forbidden,
    });
    expect(names(users)).not.toContain("newbie");
  });

  it("reports a missing singleton as instance-unavailable", async () => {
    const { database } = createFake({ instanceMissing: true });

    await expect(addUser(database, ADMIN, { username: "newbie" })).resolves.toEqual({
      ok: false,
      reason: AddUserFailure.InstanceUnavailable,
    });
  });

  it("maps a unique-index violation from a concurrent add to username-taken", async () => {
    const { database, wasRolledBack } = createFake({
      failInsertWith: new Error("Failed query", { cause: { code: "23505" } }),
    });

    await expect(addUser(database, ADMIN, { username: "newbie" })).resolves.toEqual({
      ok: false,
      reason: AddUserFailure.UsernameTaken,
    });
    expect(wasRolledBack()).toBe(true);
  });

  it.each([
    ["direct deadlock", Object.assign(new Error("deadlock"), { code: "40P01" })],
    ["direct serialization", Object.assign(new Error("serialization"), { code: "40001" })],
    ["nested cause", new Error("Failed query", { cause: { code: "40P01" } })],
  ])("maps a %s failure to retry after rollback", async (_label, failure) => {
    const { database, wasRolledBack } = createFake({ failLockWith: failure });

    await expect(addUser(database, ADMIN, { username: "newbie" })).resolves.toEqual({
      ok: false,
      reason: AddUserFailure.Retry,
    });
    expect(wasRolledBack()).toBe(true);
  });

  it("propagates other failures after rolling back", async () => {
    const { database, wasRolledBack } = createFake({ failInsertWith: new Error("disk full") });

    await expect(addUser(database, ADMIN, { username: "newbie" })).rejects.toThrow("disk full");
    expect(wasRolledBack()).toBe(true);
  });

  it.each([
    ["forbidden", AddUserFailure.Forbidden],
    ["instance-unavailable", AddUserFailure.InstanceUnavailable],
    ["retry", AddUserFailure.Retry],
  ])("rolls the account back when issuance refuses with %s", async (reason, expected) => {
    issue.mockResolvedValue({ ok: false, reason });
    const { database, users, wasRolledBack } = createFake();

    await expect(addUser(database, ADMIN, { username: "newbie" })).resolves.toEqual({ ok: false, reason: expected });
    expect(wasRolledBack()).toBe(true);
    expect(names(users)).not.toContain("newbie");
  });

  it("rolls the account back and throws when issuance reports invalid", async () => {
    issue.mockResolvedValue({ ok: false, reason: "invalid" });
    const { database, users } = createFake();

    await expect(addUser(database, ADMIN, { username: "newbie" })).rejects.toThrow("Setup authorization");
    expect(names(users)).not.toContain("newbie");
  });

  it("rolls the account back when issuance throws", async () => {
    issue.mockRejectedValue(new Error("insert failed"));
    const { database, users } = createFake();

    await expect(addUser(database, ADMIN, { username: "newbie" })).rejects.toThrow("insert failed");
    expect(names(users)).not.toContain("newbie");
  });
});

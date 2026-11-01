// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const { consume } = vi.hoisted(() => ({ consume: vi.fn() }));
vi.mock("@/lib/credential-authorizations", () => ({ consumeCredentialAuthorization: consume }));
import { completeAccountSetup } from "./account-setup-completion";

const dialect = new PgDialect();
const ACCOUNT = { userId: "user-1", username: "pending.one", purpose: "setup", expiresAt: "2026-10-29T00:00:00.000Z" };
const INPUT = { token: "t".repeat(43), name: "Alex", passwordHash: "hashed" };
const database = {} as never;

function runWith(updatedRows: unknown[]) {
  const queries: { text: string; params: unknown[] }[] = [];
  consume.mockImplementation(async (...args: unknown[]) => {
    const complete = args[2] as (transaction: unknown, account: typeof ACCOUNT) => Promise<void>;
    const transaction = {
      execute: async (query: SQL) => {
        const { sql: text, params } = dialect.sqlToQuery(query);
        queries.push({ text, params });
        return updatedRows;
      },
    };
    await complete(transaction, ACCOUNT);
    return { ok: true };
  });
  return queries;
}

describe("completeAccountSetup", () => {
  beforeEach(() => {
    consume.mockReset();
  });

  it("saves name and hash with a password-is-null guard and returns the account", async () => {
    const queries = runWith([{ id: "user-1" }]);
    await expect(completeAccountSetup(database, INPUT)).resolves.toEqual({
      ok: true,
      userId: "user-1",
      username: "pending.one",
    });
    expect(consume.mock.calls[0][1]).toEqual({ token: INPUT.token, purpose: "setup" });
    expect(queries).toHaveLength(1);
    expect(queries[0].text).toContain('"password_hash" is null');
    expect(queries[0].params).toEqual(expect.arrayContaining(["Alex", "hashed", "user-1"]));
  });

  it("reads a password that was already set as unavailable and lets the transaction roll back", async () => {
    runWith([]);
    await expect(completeAccountSetup(database, INPUT)).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it.each(["invalid", "forbidden"])("maps a %s consume result to unavailable", async (reason) => {
    consume.mockResolvedValue({ ok: false, reason });
    await expect(completeAccountSetup(database, INPUT)).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("rethrows unexpected failures", async () => {
    consume.mockImplementation(async () => {
      throw new Error("db down");
    });
    await expect(completeAccountSetup(database, INPUT)).rejects.toThrow("db down");
  });

  it("reports a retryable conflict as retry, not unavailable", async () => {
    consume.mockResolvedValue({ ok: false, reason: "retry" });
    await expect(completeAccountSetup(database, INPUT)).resolves.toEqual({ ok: false, reason: "retry" });
  });

  it("repeats as unavailable once the link is consumed", async () => {
    runWith([{ id: "user-1" }]);
    await completeAccountSetup(database, INPUT);
    consume.mockResolvedValue({ ok: false, reason: "invalid" });
    await expect(completeAccountSetup(database, INPUT)).resolves.toEqual({ ok: false, reason: "unavailable" });
  });
});

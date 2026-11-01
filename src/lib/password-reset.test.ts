// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const { consume } = vi.hoisted(() => ({ consume: vi.fn() }));
vi.mock("@/lib/credential-authorizations", () => ({ consumeCredentialAuthorization: consume }));
import { completePasswordReset } from "./password-reset";

const dialect = new PgDialect();
const ACCOUNT = { userId: "user-1", username: "pending.one", purpose: "reset", expiresAt: "2026-10-29T00:00:00.000Z" };
const INPUT = { token: "t".repeat(43), passwordHash: "hashed" };
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

describe("completePasswordReset", () => {
  beforeEach(() => {
    consume.mockReset();
  });

  it("saves hash and revokes sessions and trusted devices and returns the account", async () => {
    const queries = runWith([{ id: "user-1" }]);
    await expect(completePasswordReset(database, INPUT)).resolves.toEqual({
      ok: true,
      userId: "user-1",
      username: "pending.one",
    });
    expect(consume.mock.calls[0][1]).toEqual({ token: INPUT.token, purpose: "reset" });
    expect(queries).toHaveLength(2);
    expect(queries[0].text).toContain('"session_version"');
    expect(queries[1].text).toContain('delete from "trusted_devices"');
    expect(queries[0].params).toEqual(expect.arrayContaining(["hashed", "user-1"]));
  });

  it("reads a missing account as unavailable and lets the transaction roll back", async () => {
    runWith([]);
    await expect(completePasswordReset(database, INPUT)).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it.each(["invalid", "forbidden"])("maps a %s consume result to unavailable", async (reason) => {
    consume.mockResolvedValue({ ok: false, reason });
    await expect(completePasswordReset(database, INPUT)).resolves.toEqual({ ok: false, reason: "unavailable" });
  });

  it("rethrows unexpected failures", async () => {
    consume.mockImplementation(async () => {
      throw new Error("db down");
    });
    await expect(completePasswordReset(database, INPUT)).rejects.toThrow("db down");
  });

  it("reports a retryable conflict as retry, not unavailable", async () => {
    consume.mockResolvedValue({ ok: false, reason: "retry" });
    await expect(completePasswordReset(database, INPUT)).resolves.toEqual({ ok: false, reason: "retry" });
  });

  it("repeats as unavailable once the link is consumed", async () => {
    runWith([{ id: "user-1" }]);
    await completePasswordReset(database, INPUT);
    consume.mockResolvedValue({ ok: false, reason: "invalid" });
    await expect(completePasswordReset(database, INPUT)).resolves.toEqual({ ok: false, reason: "unavailable" });
  });
});

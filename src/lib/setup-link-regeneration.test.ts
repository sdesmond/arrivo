// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
const { issue } = vi.hoisted(() => ({ issue: vi.fn() }));
vi.mock("@/lib/credential-authorizations", () => ({ issueCredentialAuthorizationInTransaction: issue }));
import { regenerateSetupLink, type SetupLinkRegenerationDatabase } from "./setup-link-regeneration";

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
    database: { transaction } as unknown as SetupLinkRegenerationDatabase,
    transaction,
    queries,
    locks,
    rolledBack: () => rolledBack,
  };
}
describe("regenerateSetupLink", () => {
  beforeEach(() => {
    issue.mockReset();
    issue.mockResolvedValue({ ok: true, token: "secret", expiresAt: "2026-10-29T12:00:00.000Z" });
  });
  it("uses one transaction, instance then sorted users, existing ID and setup issuer clock", async () => {
    const scope = fake();
    const clock = () => new Date("2026-10-28T12:00:00Z");
    expect(await regenerateSetupLink(scope.database, ADMIN.toUpperCase(), TARGET.toUpperCase(), clock)).toEqual({
      ok: true,
      userId: TARGET,
      username: "pending",
      token: "secret",
      expiresAt: "2026-10-29T12:00:00.000Z",
      actor: { id: ADMIN, username: "admin" },
    });
    expect(scope.transaction).toHaveBeenCalledOnce();
    expect(scope.queries[0]).toContain("instance_state");
    expect(scope.locks).toEqual([ADMIN, TARGET]);
    expect(scope.queries.some((query) => query.startsWith("insert"))).toBe(false);
    expect(issue).toHaveBeenCalledWith(
      expect.anything(),
      { kind: "admin", actorUserId: ADMIN },
      { userId: TARGET, purpose: "setup" },
      clock
    );
  });
  it.each([
    [{ role: "member" }, "forbidden"],
    [{ actorPassword: null }, "forbidden"],
    [{ noActor: true }, "forbidden"],
    [{ missing: true }, "changed-state"],
    [{ completed: true }, "changed-state"],
    [{ noInstance: true }, "instance-unavailable"],
  ])("refuses current locked state %j", async (options, reason) => {
    expect(await regenerateSetupLink(fake(options).database, ADMIN, TARGET)).toEqual({ ok: false, reason });
    expect(issue).not.toHaveBeenCalled();
  });
  it.each([
    ["invalid", TARGET, "forbidden"],
    [ADMIN, "invalid", "changed-state"],
  ])("rejects invalid IDs before transaction", async (actor, target, reason) => {
    const scope = fake();
    expect(await regenerateSetupLink(scope.database, actor, target)).toEqual({ ok: false, reason });
    expect(scope.transaction).not.toHaveBeenCalled();
  });
  it.each(["40P01", "40001"])("maps nested SQLSTATE %s after rollback", async (code) => {
    const scope = fake({ error: new Error("query", { cause: { code } }) });
    expect(await regenerateSetupLink(scope.database, ADMIN, TARGET)).toEqual({ ok: false, reason: "retry" });
    expect(scope.rolledBack()).toBe(true);
  });
  it.each(["forbidden", "instance-unavailable", "retry", "invalid"])("rolls back issuer refusal %s", async (reason) => {
    issue.mockResolvedValue({ ok: false, reason });
    const scope = fake();
    expect(await regenerateSetupLink(scope.database, ADMIN, TARGET)).toEqual({
      ok: false,
      reason: reason === "invalid" ? "changed-state" : reason,
    });
    expect(scope.rolledBack()).toBe(true);
  });
  it("propagates unexpected failure after rollback", async () => {
    issue.mockRejectedValue(new Error("write failed"));
    const scope = fake();
    await expect(regenerateSetupLink(scope.database, ADMIN, TARGET)).rejects.toThrow("write failed");
    expect(scope.rolledBack()).toBe(true);
  });
  it("defaults authorization expiry to real security time", async () => {
    const before = Date.now();
    await regenerateSetupLink(fake().database, ADMIN, TARGET);
    const securityNow = (issue.mock.calls[0][3] as () => Date)();
    expect(securityNow.getTime()).toBeGreaterThanOrEqual(before);
    expect(securityNow.getTime()).toBeLessThanOrEqual(Date.now());
  });
});

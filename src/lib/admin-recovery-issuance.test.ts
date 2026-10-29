// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
const { issue } = vi.hoisted(() => ({ issue: vi.fn() }));
vi.mock("@/lib/credential-authorizations", () => ({ issueCredentialAuthorizationInTransaction: issue }));
import { issueAdminRecovery } from "./admin-recovery-issuance";
import type { CredentialAuthorizationDatabase } from "./credential-authorizations";

const TARGET = "00000000-0000-4000-8000-00000000000b";
const dialect = new PgDialect();
function fake(
  options: {
    username?: string;
    missing?: boolean;
    deleted?: boolean;
    role?: string;
    pending?: boolean;
    noApp?: boolean;
    error?: unknown;
    activity?: "throw" | "reject" | "stall";
  } = {}
) {
  const statements: { text: string; params: unknown[] }[] = [];
  const events: string[] = [];
  const transaction = vi.fn((run: (transaction: unknown) => Promise<unknown>) => {
    const activity = transaction.mock.calls.length === 2;
    if (activity && options.activity === "throw") throw new Error("private detail");
    if (activity && options.activity === "stall") return new Promise(() => {});
    return (async () => {
      try {
        const result = await run({
          execute: async (query: SQL) => {
            const statement = dialect.sqlToQuery(query);
            statements.push({ text: statement.sql, params: statement.params });
            if (activity && options.activity === "reject") throw new Error("private detail");
            if (!activity && options.error) throw options.error;
            if (statement.sql.includes("app_state")) return options.noApp ? [] : [{ id: true }];
            if (statement.sql.includes("for update")) return options.deleted ? [] : [{ id: TARGET }];
            if (statement.sql.startsWith("select") && statement.sql.includes('"users"')) {
              if (options.missing || (options.deleted && !statement.sql.includes("lower("))) return [];
              return [
                {
                  id: TARGET,
                  username: statement.sql.includes("lower(") ? "admin" : (options.username ?? "admin"),
                  role: options.role ?? "admin",
                  passwordHash: options.pending ? null : "hash",
                },
              ];
            }
            return [];
          },
        });
        events.push(activity ? "activity-commit" : "primary-commit");
        return result;
      } catch (error) {
        events.push("rollback");
        throw error;
      }
    })();
  });
  return { database: { transaction } as unknown as CredentialAuthorizationDatabase, transaction, statements, events };
}
const operator = { kind: "trusted-operator" } as const;
const input = { username: " ADMIN ", origin: "https://example.test:8443/" };
describe("issueAdminRecovery", () => {
  beforeEach(() => {
    issue.mockReset();
    issue.mockResolvedValue({ ok: true, token: "secret-token", expiresAt: "2026-10-29T13:00:00.000Z" });
  });
  afterEach(() => vi.useRealTimers());
  it.each(["http://localhost:3000", "https://example.test:8443/", "HTTP://localhost:3000/", "http://[::1]:3000"])(
    "normalizes identity and uses explicit origin %s after commit",
    async (origin) => {
      const scope = fake();
      const clock = () => new Date("2026-10-29T12:00:00Z");
      const result = await issueAdminRecovery(scope.database, operator, { ...input, origin }, clock);
      expect(result).toEqual({
        ok: true,
        userId: TARGET,
        username: "admin",
        url: `${new URL(origin).origin}/account-recovery?token=secret-token`,
        expiresAt: "2026-10-29T13:00:00.000Z",
      });
      expect(issue).toHaveBeenCalledWith(expect.anything(), operator, { userId: TARGET, purpose: "recovery" }, clock);
      expect(scope.events).toEqual(["primary-commit", "activity-commit"]);
      const activity = scope.statements.filter((statement) => statement.text.startsWith("insert"));
      expect(activity).toHaveLength(1);
      expect(activity[0].params).toEqual(
        expect.arrayContaining(["admin_recovery_link_generated", "Server operator (CLI)", TARGET, "admin"])
      );
      expect(JSON.stringify(activity)).not.toMatch(/secret-token|example.test|ADMIN/);
      expect(activity[0].text).toContain("null");
      expect(
        scope.statements.some(
          (statement) => statement.text.includes("statement_timeout") && statement.params.includes("5000")
        )
      ).toBe(true);
    }
  );
  it.each([
    "ftp://example.test",
    "https://%",
    "https://example.test:99999",
    "https://user:pass@example.test",
    "https://@example.test",
    "https://example.test/path",
    "https://example.test/?",
    "https://example.test/#",
    "https://example.test/?x=y",
    "https://example.test/#part",
    "https://example.test/../",
    " https://example.test",
    "https:\\example.test",
    "invalid",
  ])("rejects origin before DB: %s", async (origin) => {
    const scope = fake();
    expect(await issueAdminRecovery(scope.database, operator, { ...input, origin })).toEqual({
      ok: false,
      reason: "invalid-origin",
    });
    expect(scope.transaction).not.toHaveBeenCalled();
  });
  it.each(["", "ab", "bad space", "x".repeat(31)])("rejects username %s", async (username) => {
    const scope = fake();
    expect(await issueAdminRecovery(scope.database, operator, { ...input, username })).toEqual({
      ok: false,
      reason: "invalid-username",
    });
    expect(scope.transaction).not.toHaveBeenCalled();
  });
  it("rejects authority before DB", async () => {
    const scope = fake();
    expect(await issueAdminRecovery(scope.database, { kind: "admin", actorUserId: TARGET }, input)).toEqual({
      ok: false,
      reason: "forbidden",
    });
    expect(scope.transaction).not.toHaveBeenCalled();
  });
  it.each([{ missing: true }, { deleted: true }, { role: "member" }, { pending: true }, { username: "renamed" }])(
    "refuses stale/ineligible target %j",
    async (options) => {
      const scope = fake(options);
      expect(await issueAdminRecovery(scope.database, operator, input)).toEqual({ ok: false, reason: "changed-state" });
      expect(issue).not.toHaveBeenCalled();
      expect(scope.transaction).toHaveBeenCalledOnce();
    }
  );
  it("refuses missing singleton", async () => {
    expect(await issueAdminRecovery(fake({ noApp: true }).database, operator, input)).toEqual({
      ok: false,
      reason: "app-unavailable",
    });
  });
  it.each(["40P01", "40001"])("maps nested retry %s", async (code) => {
    const scope = fake({ error: new Error("query", { cause: { code } }) });
    expect(await issueAdminRecovery(scope.database, operator, input)).toEqual({ ok: false, reason: "retry" });
    expect(scope.events).toEqual(["rollback"]);
  });
  it.each(["invalid", "forbidden", "app-unavailable", "retry"])("rolls back issuer refusal %s", async (reason) => {
    issue.mockResolvedValue({ ok: false, reason });
    const scope = fake();
    expect(await issueAdminRecovery(scope.database, operator, input)).toEqual({
      ok: false,
      reason: reason === "invalid" ? "changed-state" : reason,
    });
    expect(scope.events).toEqual(["rollback"]);
  });
  it("propagates primary failures without Activity", async () => {
    issue.mockRejectedValue(new Error("write failed"));
    const scope = fake();
    await expect(issueAdminRecovery(scope.database, operator, input)).rejects.toThrow("write failed");
    expect(scope.events).toEqual(["rollback"]);
  });
  it.each(["throw", "reject"] as const)("isolates Activity %s", async (activity) => {
    const scope = fake({ activity });
    expect((await issueAdminRecovery(scope.database, operator, input)).ok).toBe(true);
    expect(scope.events[0]).toBe("primary-commit");
  });
  it("bounds stalled Activity to five seconds", async () => {
    vi.useFakeTimers();
    const scope = fake({ activity: "stall" });
    let completed = false;
    const pending = issueAdminRecovery(scope.database, operator, input).then((result) => {
      completed = true;
      return result;
    });
    await vi.advanceTimersByTimeAsync(4999);
    expect(completed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).ok).toBe(true);
  });
  it("uses real security time by default", async () => {
    const before = Date.now();
    await issueAdminRecovery(fake().database, operator, input);
    expect((issue.mock.calls[0][3] as () => Date)().getTime()).toBeGreaterThanOrEqual(before);
  });
});

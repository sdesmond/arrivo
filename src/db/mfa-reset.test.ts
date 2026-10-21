// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type postgres from "postgres";
import { resetMfa } from "./mfa-reset";

// Tagged-template stand-in for a postgres transaction; answers the UPDATE with `updatedRows`.
function fakeSql(updatedRows: { id: string }[]) {
  const queries: { text: string; values: unknown[] }[] = [];
  const transaction = vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?").replace(/\s+/g, " ").trim();
    queries.push({ text, values });
    return text.startsWith("update users") ? updatedRows : [];
  });
  const sql = { begin: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)) };
  return { sql: sql as unknown as postgres.Sql, queries };
}

describe("resetMfa", () => {
  it("clears two-factor, deletes recovery codes and code lockouts, and revokes sessions", async () => {
    const { sql, queries } = fakeSql([{ id: "user-1" }]);

    await expect(resetMfa(sql, "Alice@Example.com")).resolves.toBe(true);

    const [update, deleteCodes, deleteThrottle] = queries;
    expect(update.text).toContain("totp_secret = null");
    expect(update.text).toContain("mfa_enabled_at = null");
    expect(update.text).toContain("session_version = session_version + 1");
    expect(update.text).toContain("lower(email) = lower(?)");
    expect(update.values).toEqual(["Alice@Example.com"]);
    expect(deleteCodes.text).toBe("delete from mfa_recovery_codes where user_id = ?");
    expect(deleteCodes.values).toEqual(["user-1"]);
    expect(deleteThrottle.values).toEqual(["mfa:user-1"]);
  });

  it("reports an unknown email without touching anything else", async () => {
    const { sql, queries } = fakeSql([]);
    await expect(resetMfa(sql, "nobody@example.com")).resolves.toBe(false);
    expect(queries).toHaveLength(1);
  });
});

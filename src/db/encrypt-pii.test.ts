// @vitest-environment node
import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type postgres from "postgres";
import { decryptField } from "../lib/field-encryption";
import { encryptLegacyPii } from "./encrypt-pii";

interface FakeRow {
  id: string;
  value: string;
}

// Stand-in for postgres.Sql#unsafe: answers each SELECT from `rowsByQuery` and records every UPDATE.
function fakeSql(rowsByColumn: Record<string, FakeRow[]>) {
  const updates: { query: string; params: unknown[] }[] = [];
  const unsafe = vi.fn(async (query: string, params: unknown[] = []) => {
    if (query.startsWith("select")) {
      const key = Object.keys(rowsByColumn).find((candidate) => query.includes(candidate));
      return key ? rowsByColumn[key] : [];
    }
    updates.push({ query, params });
    return [];
  });
  return { sql: { unsafe } as unknown as postgres.Sql, unsafe, updates };
}

describe("encryptLegacyPii", () => {
  beforeEach(() => {
    vi.stubEnv("DATA_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  });

  it("selects only non-empty unprefixed values from every travel-document column", async () => {
    const { sql, unsafe } = fakeSql({});
    await encryptLegacyPii(sql, vi.fn());

    const selects = unsafe.mock.calls.map(([query]) => query);
    expect(selects).toHaveLength(4);
    for (const target of [
      "from users where passport_number",
      "from users where known_traveler_number",
      "from user_companions where passport_number",
      "from user_companions where known_traveler_number",
    ]) {
      expect(selects.some((query) => query.includes(target))).toBe(true);
    }
    expect(selects.every((query) => query.includes("not like 'enc:v1:%'"))).toBe(true);
  });

  it("encrypts each legacy value, guarding against concurrent edits", async () => {
    const { sql, updates } = fakeSql({
      "users where passport_number": [{ id: "user-1", value: "X1234567" }],
      "user_companions where known_traveler_number": [{ id: "companion-1", value: "TT-1" }],
    });
    const log = vi.fn();

    await expect(encryptLegacyPii(sql, log)).resolves.toBe(2);

    expect(updates).toHaveLength(2);
    const [userUpdate, companionUpdate] = updates;
    expect(userUpdate.query).toBe("update users set passport_number = $1 where id = $2 and passport_number = $3");
    expect(decryptField(userUpdate.params[0] as string)).toBe("X1234567");
    expect(userUpdate.params.slice(1)).toEqual(["user-1", "X1234567"]);
    expect(companionUpdate.query).toContain("update user_companions set known_traveler_number = $1");
    expect(decryptField(companionUpdate.params[0] as string)).toBe("TT-1");
    expect(log).toHaveBeenCalledWith("Encrypted 2 legacy travel-document value(s).");
  });

  it("does nothing and logs nothing when every value is already encrypted", async () => {
    const { sql, updates } = fakeSql({});
    const log = vi.fn();
    await expect(encryptLegacyPii(sql, log)).resolves.toBe(0);
    expect(updates).toHaveLength(0);
    expect(log).not.toHaveBeenCalled();
  });
});

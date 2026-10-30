// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { Secret, TOTP } from "otpauth";

const { consume, replaceRecoveryCodes } = vi.hoisted(() => ({ consume: vi.fn(), replaceRecoveryCodes: vi.fn() }));
vi.mock("@/lib/credential-authorizations", () => ({ consumeCredentialAuthorization: consume }));
vi.mock("@/lib/mfa-store", () => ({ replaceRecoveryCodes }));

import { decryptField, encryptField } from "@/lib/field-encryption";
import { completeAdminRecovery, startAdminRecoveryEnrollment } from "./admin-recovery-completion";

const dialect = new PgDialect();
const NOW = new Date("2026-10-29T12:00:00Z");
const clock = () => NOW;
const TOKEN = "t".repeat(43);
const ACCOUNT = { userId: "user-1", username: "root", purpose: "recovery", expiresAt: "2026-10-29T13:00:00.000Z" };
const database = {} as never;
const SECRET = new Secret({ size: 20 }).base32;
const codeFor = (secret = SECRET) =>
  new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 }).generate({ timestamp: NOW.getTime() });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATA_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
  replaceRecoveryCodes.mockResolvedValue(["aaaaa-bbbbb"]);
});

interface Recorded {
  text: string;
  params: unknown[];
}
function enrollmentDatabase(results: unknown[][]) {
  const queries: Recorded[] = [];
  let call = 0;
  const handle = {
    transaction: async (run: (transaction: unknown) => Promise<unknown>) =>
      run({
        execute: async (query: SQL) => {
          const { sql: text, params } = dialect.sqlToQuery(query);
          queries.push({ text, params });
          return results[call++] ?? [];
        },
      }),
  };
  return { handle: handle as never, queries };
}

describe("startAdminRecoveryEnrollment", () => {
  it("returns the stored secret after a null-only conditional update scoped to the authorization", async () => {
    const stored = encryptField(SECRET);
    const { handle, queries } = enrollmentDatabase([[], [{ secret: stored, username: "root" }]]);
    await expect(startAdminRecoveryEnrollment(handle, TOKEN, clock)).resolves.toEqual({
      ok: true,
      secret: SECRET,
      username: "root",
    });
    expect(queries[0].text).toContain('"pending_totp_secret" is null');
    expect(queries[0].text).toContain('"consumed_at" is null');
    expect(queries[0].text).toContain('"invalidated_at" is null');
    expect(queries[0].text).not.toContain('update "users"');
    expect(queries[0].params).toContain(NOW.toISOString());
    expect(decryptField(queries[0].params.find((param) => String(param).startsWith("enc:v1:")) as string)).toMatch(
      /^[A-Z2-7]+$/
    );
  });

  it("is unavailable when the authorization is not usable", async () => {
    const { handle } = enrollmentDatabase([[], []]);
    await expect(startAdminRecoveryEnrollment(handle, TOKEN, clock)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("rejects malformed tokens without querying", async () => {
    const { handle, queries } = enrollmentDatabase([]);
    await expect(startAdminRecoveryEnrollment(handle, "short", clock)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(queries).toHaveLength(0);
  });

  it("explains a missing encryption key without querying", async () => {
    vi.stubEnv("DATA_ENCRYPTION_KEY", "");
    const { handle, queries } = enrollmentDatabase([]);
    await expect(startAdminRecoveryEnrollment(handle, TOKEN, clock)).resolves.toEqual({
      ok: false,
      reason: "needs-key",
    });
    expect(queries).toHaveLength(0);
  });

  it("reports serialization conflicts as retry and rethrows other failures", async () => {
    const conflict = { transaction: async () => Promise.reject(Object.assign(new Error("x"), { code: "40001" })) };
    await expect(startAdminRecoveryEnrollment(conflict as never, TOKEN, clock)).resolves.toEqual({
      ok: false,
      reason: "retry",
    });
    const broken = { transaction: async () => Promise.reject(new Error("db down")) };
    await expect(startAdminRecoveryEnrollment(broken as never, TOKEN, clock)).rejects.toThrow("db down");
  });
});

function consumeWith(secret: string | null, updatedRows: unknown[] = [{ id: "user-1" }]) {
  const queries: Recorded[] = [];
  consume.mockImplementation(async (...args: unknown[]) => {
    const complete = args[2] as (transaction: unknown, account: typeof ACCOUNT) => Promise<void>;
    const transaction = {
      execute: async (query: SQL) => {
        const { sql: text, params } = dialect.sqlToQuery(query);
        queries.push({ text, params });
        if (text.startsWith("select")) return [{ secret }];
        if (text.startsWith("update")) return updatedRows;
        return [];
      },
    };
    await complete(transaction, ACCOUNT);
    return { ok: true };
  });
  return queries;
}
const INPUT = { token: TOKEN, passwordHash: "hashed", code: "" };

describe("completeAdminRecovery", () => {
  it("replaces password, MFA and codes, revokes sessions and devices, and returns codes once", async () => {
    const pending = encryptField(SECRET);
    const queries = consumeWith(pending);
    await expect(completeAdminRecovery(database, { ...INPUT, code: codeFor() }, clock)).resolves.toEqual({
      ok: true,
      userId: "user-1",
      username: "root",
      recoveryCodes: ["aaaaa-bbbbb"],
    });
    expect(consume.mock.calls[0][1]).toEqual({ token: TOKEN, purpose: "recovery" });
    const update = queries.find((query) => query.text.startsWith('update "users"'))!;
    expect(update.text).toContain('"session_version"');
    expect(update.text).toContain("totp_pending_secret = null");
    expect(update.params).toEqual(expect.arrayContaining(["hashed", pending, "user-1", "admin"]));
    expect(queries.some((query) => query.text.startsWith('delete from "trusted_devices"'))).toBe(true);
    expect(replaceRecoveryCodes).toHaveBeenCalledWith(expect.anything(), "user-1");
  });

  it("clears the account's MFA throttle and the authorization's pending secret in the same transaction", async () => {
    const queries = consumeWith(encryptField(SECRET));
    await completeAdminRecovery(database, { ...INPUT, code: codeFor() }, clock);
    const throttle = queries.find((query) => query.text.startsWith('delete from "auth_throttle"'))!;
    expect(throttle.params).toContain("mfa:user-1");
    const scrub = queries.find(
      (query) => query.text.startsWith('update "credential_authorizations"') && query.text.includes("= null")
    )!;
    expect(scrub.params).toEqual(expect.arrayContaining([expect.stringMatching(/^[a-f0-9]{64}$/), "recovery"]));
    const order = queries.map((query) => query.text.split(" ").slice(0, 2).join(" "));
    expect(order.indexOf('update "credential_authorizations"')).toBeGreaterThan(order.indexOf('update "users"'));
  });

  it("keeps the pending secret by failing the transaction on a wrong code", async () => {
    consumeWith(encryptField(SECRET));
    const wrong = codeFor() === "000000" ? "111111" : "000000";
    await expect(completeAdminRecovery(database, { ...INPUT, code: wrong }, clock)).resolves.toEqual({
      ok: false,
      reason: "invalid-code",
    });
    expect(replaceRecoveryCodes).not.toHaveBeenCalled();
  });

  it("rejects a code made for a different secret", async () => {
    consumeWith(encryptField(SECRET));
    const other = codeFor(new Secret({ size: 20 }).base32);
    await expect(completeAdminRecovery(database, { ...INPUT, code: other }, clock)).resolves.toMatchObject({
      ok: false,
    });
  });

  it("treats a missing pending secret as an invalid code", async () => {
    consumeWith(null);
    await expect(completeAdminRecovery(database, { ...INPUT, code: codeFor() }, clock)).resolves.toEqual({
      ok: false,
      reason: "invalid-code",
    });
  });

  it("reads a demoted or missing account as unavailable", async () => {
    consumeWith(encryptField(SECRET), []);
    await expect(completeAdminRecovery(database, { ...INPUT, code: codeFor() }, clock)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(replaceRecoveryCodes).not.toHaveBeenCalled();
  });

  it.each(["invalid", "forbidden"])("maps a %s consume result to unavailable", async (reason) => {
    consume.mockResolvedValue({ ok: false, reason });
    await expect(completeAdminRecovery(database, INPUT, clock)).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("reports a retryable conflict as retry", async () => {
    consume.mockResolvedValue({ ok: false, reason: "retry" });
    await expect(completeAdminRecovery(database, INPUT, clock)).resolves.toEqual({ ok: false, reason: "retry" });
  });

  it("rolls back and rethrows when recovery-code replacement fails", async () => {
    consumeWith(encryptField(SECRET));
    replaceRecoveryCodes.mockRejectedValue(new Error("db down"));
    await expect(completeAdminRecovery(database, { ...INPUT, code: codeFor() }, clock)).rejects.toThrow("db down");
  });

  it("never returns the token, hash or secret in a failure", async () => {
    consume.mockResolvedValue({ ok: false, reason: "invalid" });
    const result = await completeAdminRecovery(database, INPUT, clock);
    expect(JSON.stringify(result)).not.toMatch(/hashed|t{43}/);
  });
});

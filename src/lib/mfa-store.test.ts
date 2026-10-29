// @vitest-environment node
import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Secret, TOTP } from "otpauth";

const { db, returning, schema } = vi.hoisted(() => {
  const returning = vi.fn();
  return {
    returning,
    db: {
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning })) })) })),
      select: vi.fn(),
      delete: vi.fn(),
      insert: vi.fn(),
    },
    schema: {
      users: { id: "users.id", totpLastStep: "users.totp_last_step", mfaEnabledAt: "users.mfa_enabled_at" },
      mfaRecoveryCodes: { id: "c.id", userId: "c.user_id", codeHash: "c.code_hash", usedAt: "c.used_at" },
    },
  };
});

vi.mock("@/db", () => ({ db }));
vi.mock("@/db/schema", () => schema);

import { encryptField } from "./field-encryption";
import { generateTotpSecret, hashRecoveryCode } from "./mfa";
import { getMfaStatus, replaceRecoveryCodes, verifySecondFactor } from "./mfa-store";

const NOW = Date.UTC(2026, 9, 21, 12, 0, 0);

function currentCode(secret: string) {
  return new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 }).generate({ timestamp: NOW });
}

describe("verifySecondFactor", () => {
  const secret = generateTotpSecret();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("DATA_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  });

  function user(overrides: { totpSecret?: string | null; totpLastStep?: number | null } = {}) {
    return { id: "user-1", totpSecret: encryptField(secret), totpLastStep: null, ...overrides };
  }

  it("accepts a valid TOTP code and records its step atomically", async () => {
    returning.mockResolvedValueOnce([{ id: "user-1" }]);
    await expect(verifySecondFactor(user(), currentCode(secret), NOW)).resolves.toBe(true);
    expect(db.update).toHaveBeenCalledWith(schema.users);
  });

  it("rejects a TOTP code when a concurrent sign-in already used that step", async () => {
    returning.mockResolvedValueOnce([]);
    await expect(verifySecondFactor(user(), currentCode(secret), NOW)).resolves.toBe(false);
  });

  it("rejects a wrong TOTP code without touching the database", async () => {
    await expect(verifySecondFactor(user(), "000000", NOW)).resolves.toBe(false);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("consumes an unused recovery code", async () => {
    returning.mockResolvedValueOnce([{ id: "code-1" }]);
    await expect(verifySecondFactor(user(), "abcde-fgh2j", NOW)).resolves.toBe(true);
    expect(db.update).toHaveBeenCalledWith(schema.mfaRecoveryCodes);
  });

  it("uses the caller's transaction when a credential mutation holds the account lock", async () => {
    const transaction = { update: vi.fn(() => ({ set: () => ({ where: () => ({ returning }) }) })) };
    returning.mockResolvedValueOnce([{ id: "code-1" }]);
    await expect(verifySecondFactor(user(), "abcde-fgh2j", NOW, transaction as never)).resolves.toBe(true);
    expect(transaction.update).toHaveBeenCalledWith(schema.mfaRecoveryCodes);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects a recovery code that is unknown or already used", async () => {
    returning.mockResolvedValueOnce([]);
    await expect(verifySecondFactor(user(), "abcde-fgh2j", NOW)).resolves.toBe(false);
  });

  it("rejects everything when two-factor is not set up", async () => {
    await expect(verifySecondFactor(user({ totpSecret: null }), currentCode(secret), NOW)).resolves.toBe(false);
    expect(db.update).not.toHaveBeenCalled();
  });
});

describe("replaceRecoveryCodes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes the old codes and stores hashes of ten new ones", async () => {
    const deleteWhere = vi.fn().mockResolvedValue([]);
    const values = vi.fn().mockResolvedValue([]);
    const executor = { delete: vi.fn(() => ({ where: deleteWhere })), insert: vi.fn(() => ({ values })) };

    const codes = await replaceRecoveryCodes(executor as never, "user-1");

    expect(codes).toHaveLength(10);
    expect(executor.delete).toHaveBeenCalledWith(schema.mfaRecoveryCodes);
    const rows = values.mock.calls[0][0];
    expect(rows).toHaveLength(10);
    expect(rows[0]).toEqual({ userId: "user-1", codeHash: hashRecoveryCode(codes[0]) });
    expect(JSON.stringify(rows)).not.toContain(codes[0]);
  });
});

describe("getMfaStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  function mockSelects(userRows: unknown[], countRows: unknown[]) {
    db.select
      .mockReturnValueOnce({ from: () => ({ where: vi.fn().mockResolvedValue(userRows) }) })
      .mockReturnValueOnce({ from: () => ({ where: vi.fn().mockResolvedValue(countRows) }) });
  }

  it("reports enabled status, enrollment date and unused codes", async () => {
    mockSelects([{ mfaEnabledAt: new Date("2026-10-01T10:00:00Z") }], [{ count: 7 }]);
    await expect(getMfaStatus("user-1")).resolves.toEqual({
      enabled: true,
      enabledAt: "2026-10-01T10:00:00.000Z",
      recoveryCodesRemaining: 7,
    });
  });

  it("reports disabled when the user never enrolled", async () => {
    mockSelects([{ mfaEnabledAt: null }], [{ count: 0 }]);
    await expect(getMfaStatus("user-1")).resolves.toEqual({ enabled: false, recoveryCodesRemaining: 0 });
  });

  it("reports disabled for a missing user", async () => {
    mockSelects([], []);
    await expect(getMfaStatus("gone")).resolves.toEqual({ enabled: false, recoveryCodesRemaining: 0 });
  });
});

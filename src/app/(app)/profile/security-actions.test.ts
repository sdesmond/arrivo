// @vitest-environment node
import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Secret, TOTP } from "otpauth";

const mocks = vi.hoisted(() => {
  const updateWhere = vi.fn().mockResolvedValue([]);
  const updateSet = vi.fn<(values: Record<string, string>) => { where: typeof updateWhere }>(() => ({
    where: updateWhere,
  }));
  const deleteWhere = vi.fn().mockResolvedValue([]);
  const selectWhere = vi.fn();
  const transaction = {
    update: vi.fn(() => ({ set: updateSet })),
    delete: vi.fn(() => ({ where: deleteWhere })),
    select: vi.fn(() => ({ from: () => ({ where: selectWhere }) })),
    execute: vi.fn().mockResolvedValue([]),
  };
  return {
    updateWhere,
    updateSet,
    deleteWhere,
    transaction,
    selectWhere,
    requireUser: vi.fn(),
    signOut: vi.fn(),
    compare: vi.fn(),
    checkThrottle: vi.fn(),
    recordFailure: vi.fn(),
    clearFailures: vi.fn(),
    verifySecondFactor: vi.fn(),
    replaceRecoveryCodes: vi.fn(),
    bumpSessionVersion: vi.fn(),
    lockCurrentSecurityVersion: vi.fn(),
    toDataURL: vi.fn(),
    deleteTrustedDevice: vi.fn(),
    revalidatePath: vi.fn(),
  };
});

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({ from: () => ({ where: mocks.selectWhere }) })),
    update: vi.fn(() => ({ set: mocks.updateSet })),
    transaction: vi.fn(async (callback: (tx: typeof mocks.transaction) => Promise<unknown>) =>
      callback(mocks.transaction)
    ),
  },
}));
vi.mock("@/db/schema", () => ({
  users: { id: "users.id", sessionVersion: "users.session_version" },
  mfaRecoveryCodes: { userId: "c.user_id" },
  credentialAuthorizations: {},
  trustedDevices: {},
}));
vi.mock("@/lib/auth-helpers", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/auth", () => ({ signOut: mocks.signOut }));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare } }));
vi.mock("qrcode", () => ({ default: { toDataURL: mocks.toDataURL } }));
vi.mock("@/lib/auth-throttle", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth-throttle")>()),
  checkThrottle: mocks.checkThrottle,
  recordFailure: mocks.recordFailure,
  clearFailures: mocks.clearFailures,
}));
vi.mock("@/lib/mfa-store", () => ({
  verifySecondFactor: mocks.verifySecondFactor,
  replaceRecoveryCodes: mocks.replaceRecoveryCodes,
}));
vi.mock("@/lib/session-version", () => ({
  bumpSessionVersion: mocks.bumpSessionVersion,
  lockCurrentSecurityVersion: mocks.lockCurrentSecurityVersion,
}));
vi.mock("@/lib/trusted-devices", () => ({
  DEVICE_COOKIE: "arrivo_device",
  forgetTrustedDevice: mocks.deleteTrustedDevice,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { decryptField, encryptField, isEncryptedField } from "@/lib/field-encryption";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { SignInNotice } from "@/data/types";
const MFA_NEEDS_KEY =
  "Two-factor authentication needs DATA_ENCRYPTION_KEY set on the server. Ask whoever runs this Arrivo install.";
import {
  confirmMfaEnrollment,
  disableMfa,
  removeTrustedDevice,
  regenerateRecoveryCodes,
  signOutEverywhere,
  startMfaEnrollment,
} from "./security-actions";

const CODES = Array.from({ length: 10 }, (_value, index) => `aaaaa-bbbb${index}`);

function codeFor(secret: string) {
  return new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30 }).generate();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("DATA_ENCRYPTION_KEY", randomBytes(32).toString("base64"));
  mocks.requireUser.mockResolvedValue({ id: "user-1", name: "Alice", sessionVersion: 2 });
  mocks.lockCurrentSecurityVersion.mockResolvedValue(true);
  mocks.checkThrottle.mockResolvedValue({ locked: false });
  mocks.replaceRecoveryCodes.mockResolvedValue(CODES);
  mocks.toDataURL.mockResolvedValue("data:image/png;base64,QR");
  mocks.compare.mockResolvedValue(true);
  mocks.verifySecondFactor.mockResolvedValue(true);
});

describe("startMfaEnrollment", () => {
  it("rejects a session revoked before acquiring the account lock", async () => {
    mocks.lockCurrentSecurityVersion.mockResolvedValue(false);
    await expect(startMfaEnrollment()).resolves.toEqual({ error: "Session expired. Sign in again." });
    expect(mocks.updateSet).not.toHaveBeenCalled();
  });
  it("stores an encrypted pending secret and returns it with a QR code", async () => {
    mocks.selectWhere.mockResolvedValue([{ mfaEnabledAt: null, username: "alice" }]);
    const result = await startMfaEnrollment();

    if ("error" in result) throw new Error(result.error);
    expect(result.qrDataUrl).toBe("data:image/png;base64,QR");
    expect(result.secret).toMatch(/^[A-Z2-7]{32}$/);
    const stored = mocks.updateSet.mock.calls[0][0].totpPendingSecret;
    expect(isEncryptedField(stored)).toBe(true);
    expect(decryptField(stored)).toBe(result.secret);
    expect(mocks.toDataURL.mock.calls[0][0]).toContain("otpauth://totp/Arrivo:alice");
  });

  it("refuses when two-factor is already on", async () => {
    mocks.selectWhere.mockResolvedValue([{ mfaEnabledAt: new Date() }]);
    await expect(startMfaEnrollment()).resolves.toEqual({ error: "Two-factor authentication is already on." });
    expect(mocks.updateSet).not.toHaveBeenCalled();
  });
});

describe("confirmMfaEnrollment", () => {
  const secret = new Secret({ size: 20 }).base32;

  it("rejects a revoked session before checking a pending proof", async () => {
    mocks.lockCurrentSecurityVersion.mockResolvedValue(false);
    await expect(confirmMfaEnrollment("123456")).resolves.toEqual({ error: "Session expired. Sign in again." });
    expect(mocks.selectWhere).not.toHaveBeenCalled();
  });

  it("turns two-factor on, revokes other sessions and returns recovery codes", async () => {
    mocks.selectWhere.mockResolvedValue([{ mfaEnabledAt: null, totpPendingSecret: encryptField(secret) }]);
    await expect(confirmMfaEnrollment(codeFor(secret))).resolves.toEqual({ recoveryCodes: CODES });

    const written = mocks.updateSet.mock.calls[0][0];
    expect(decryptField(written.totpSecret)).toBe(secret);
    expect(written.totpPendingSecret).toBeNull();
    expect(written.mfaEnabledAt).toBeInstanceOf(Date);
    expect(written.totpLastStep).toEqual(expect.any(Number));
    expect(written.sessionVersion).toBeDefined();
    expect(mocks.replaceRecoveryCodes).toHaveBeenCalledWith(mocks.transaction, "user-1");
  });

  it("rejects a wrong code and counts the failure", async () => {
    mocks.selectWhere.mockResolvedValue([{ mfaEnabledAt: null, totpPendingSecret: encryptField(secret) }]);
    await expect(confirmMfaEnrollment("000000")).resolves.toEqual({
      error: "That code didn't work. Check your authenticator app and try again.",
    });
    expect(mocks.recordFailure).toHaveBeenCalledWith([expect.objectContaining({ key: "mfa:user-1" })]);
    expect(mocks.updateSet).not.toHaveBeenCalled();
  });

  it("asks to restart setup when there is no pending secret", async () => {
    mocks.selectWhere.mockResolvedValue([{ mfaEnabledAt: null, totpPendingSecret: null }]);
    await expect(confirmMfaEnrollment("123456")).resolves.toEqual({ error: "Start two-factor setup again." });
  });

  it("refuses when two-factor is already on", async () => {
    mocks.selectWhere.mockResolvedValue([{ mfaEnabledAt: new Date(), totpPendingSecret: null }]);
    await expect(confirmMfaEnrollment("123456")).resolves.toEqual({
      error: "Two-factor authentication is already on.",
    });
  });

  it("refuses while code attempts are locked", async () => {
    mocks.checkThrottle.mockResolvedValue({ locked: true, retryAfterSeconds: 120 });
    await expect(confirmMfaEnrollment("123456")).resolves.toEqual({
      error: "Too many attempts. Try again in 2 minutes.",
    });
    expect(mocks.selectWhere).not.toHaveBeenCalled();
  });
});

describe("password + code checks", () => {
  const ENROLLED = { passwordHash: "hash", totpSecret: "enc", totpLastStep: 5, mfaEnabledAt: new Date() };

  it.each([regenerateRecoveryCodes, disableMfa])(
    "rejects a revoked session before accepting old proofs",
    async (action) => {
      mocks.lockCurrentSecurityVersion.mockResolvedValue(false);
      await expect(action({ password: "pw", code: "123456" })).resolves.toEqual({
        error: "Session expired. Sign in again.",
      });
      expect(mocks.verifySecondFactor).not.toHaveBeenCalled();
    }
  );

  it("regenerates recovery codes after a correct password and code", async () => {
    mocks.selectWhere.mockResolvedValue([ENROLLED]);
    await expect(regenerateRecoveryCodes({ password: "pw", code: "123456" })).resolves.toEqual({
      recoveryCodes: CODES,
    });
    expect(mocks.replaceRecoveryCodes).toHaveBeenCalledWith(mocks.transaction, "user-1");
    expect(mocks.verifySecondFactor).toHaveBeenCalledWith(
      { id: "user-1", totpSecret: "enc", totpLastStep: 5 },
      "123456",
      expect.any(Number),
      mocks.transaction
    );
    expect(mocks.clearFailures).toHaveBeenCalled();
  });

  it("rejects a wrong password without spending the code", async () => {
    mocks.selectWhere.mockResolvedValue([ENROLLED]);
    mocks.compare.mockResolvedValue(false);
    await expect(regenerateRecoveryCodes({ password: "bad", code: "123456" })).resolves.toEqual({
      error: "Password or code is incorrect.",
    });
    expect(mocks.verifySecondFactor).not.toHaveBeenCalled();
    expect(mocks.recordFailure).toHaveBeenCalled();
  });

  it("rejects a wrong code", async () => {
    mocks.selectWhere.mockResolvedValue([ENROLLED]);
    mocks.verifySecondFactor.mockResolvedValue(false);
    await expect(disableMfa({ password: "pw", code: "000000" })).resolves.toEqual({
      error: "Password or code is incorrect.",
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("refuses when two-factor is off", async () => {
    mocks.selectWhere.mockResolvedValue([{ ...ENROLLED, mfaEnabledAt: null }]);
    await expect(disableMfa({ password: "pw", code: "123456" })).resolves.toEqual({
      error: "Two-factor authentication is not on.",
    });
  });

  it("refuses while locked", async () => {
    mocks.checkThrottle.mockResolvedValue({ locked: true, retryAfterSeconds: 60 });
    await expect(regenerateRecoveryCodes({ password: "pw", code: "123456" })).resolves.toEqual({
      error: "Too many attempts. Try again in 1 minute.",
    });
  });

  it("turns two-factor off, deletes recovery codes and signs out everywhere", async () => {
    mocks.selectWhere.mockResolvedValue([ENROLLED]);
    await disableMfa({ password: "pw", code: "123456" });

    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ totpSecret: null, totpPendingSecret: null, totpLastStep: null, mfaEnabledAt: null })
    );
    expect(mocks.transaction.delete).toHaveBeenCalled();
    expect(mocks.signOut).toHaveBeenCalledWith({ redirectTo: `/sign-in?notice=${SignInNotice.MfaDisabled}` });
  });
});

describe("session exits", () => {
  it("signs out every device", async () => {
    await signOutEverywhere();
    expect(mocks.lockCurrentSecurityVersion).toHaveBeenCalledWith(mocks.transaction, "user-1", 2);
    expect(mocks.bumpSessionVersion).toHaveBeenCalledExactlyOnceWith("user-1", mocks.transaction);
    expect(mocks.signOut).toHaveBeenCalledWith({
      redirectTo: `/sign-in?notice=${SignInNotice.SignedOutEverywhere}`,
    });
  });
});

describe("removeTrustedDevice", () => {
  function mockCookieJar(token?: string) {
    const jar = { get: vi.fn(() => (token ? { value: token } : undefined)), delete: vi.fn(), set: vi.fn() };
    vi.mocked(cookies).mockResolvedValue(jar as never);
    return jar;
  }

  it("removes another browser for the signed-in user only and refreshes the list", async () => {
    mockCookieJar("this-token");
    mocks.deleteTrustedDevice.mockResolvedValue({ wasCurrent: false });
    await removeTrustedDevice("device-1");
    expect(mocks.lockCurrentSecurityVersion).toHaveBeenCalledWith(mocks.transaction, "user-1", 2);
    expect(mocks.deleteTrustedDevice).toHaveBeenCalledWith("user-1", "device-1", "this-token", mocks.transaction);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/profile");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("signs this browser out when it removes itself", async () => {
    const jar = mockCookieJar("this-token");
    mocks.deleteTrustedDevice.mockResolvedValue({ wasCurrent: true });
    await removeTrustedDevice("device-1");
    expect(jar.delete).toHaveBeenCalledWith("arrivo_device");
    expect(mocks.signOut).toHaveBeenCalledWith({ redirectTo: "/sign-in" });
  });
});

describe("guarded session exits", () => {
  const actions = [signOutEverywhere, () => removeTrustedDevice("device-1")];

  it.each(actions)(
    "rejects stale, missing-version and deleted-account requests without success effects",
    async (action) => {
      for (const session of [
        { id: "user-1", sessionVersion: 1 },
        { id: "user-1" },
        { id: "deleted", sessionVersion: 2 },
      ]) {
        vi.clearAllMocks();
        const jar = { get: vi.fn(), delete: vi.fn() };
        vi.mocked(cookies).mockResolvedValue(jar as never);
        mocks.requireUser.mockResolvedValue(session);
        mocks.lockCurrentSecurityVersion.mockResolvedValue(false);
        vi.mocked(redirect).mockImplementationOnce(() => {
          throw new Error("redirect");
        });
        await expect(action()).rejects.toThrow("redirect");
        expect(mocks.lockCurrentSecurityVersion).toHaveBeenCalledWith(
          mocks.transaction,
          session.id,
          "sessionVersion" in session ? session.sessionVersion : undefined
        );
        expect(redirect).toHaveBeenCalledWith("/sign-in");
        expect(mocks.bumpSessionVersion).not.toHaveBeenCalled();
        expect(mocks.deleteTrustedDevice).not.toHaveBeenCalled();
        expect(jar.delete).not.toHaveBeenCalled();
        expect(mocks.signOut).not.toHaveBeenCalled();
        expect(mocks.revalidatePath).not.toHaveBeenCalled();
      }
    }
  );

  it.each(actions)("does not run browser effects if commit fails", async (action) => {
    const jar = { get: vi.fn(), delete: vi.fn() };
    vi.mocked(cookies).mockResolvedValue(jar as never);
    mocks.deleteTrustedDevice.mockResolvedValue({ wasCurrent: true });
    vi.mocked(db.transaction).mockImplementationOnce(async (callback) => {
      await callback(mocks.transaction as never);
      throw new Error("commit failed");
    });
    await expect(action()).rejects.toThrow("commit failed");
    expect(jar.delete).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("without DATA_ENCRYPTION_KEY", () => {
  beforeEach(() => vi.stubEnv("DATA_ENCRYPTION_KEY", ""));

  it("explains why two-factor setup can't start instead of failing", async () => {
    mocks.selectWhere.mockResolvedValue([{ mfaEnabledAt: null }]);
    await expect(startMfaEnrollment()).resolves.toEqual({ error: MFA_NEEDS_KEY });
    expect(mocks.updateSet).not.toHaveBeenCalled();
  });

  it("explains why two-factor setup can't finish instead of failing", async () => {
    await expect(confirmMfaEnrollment("123456")).resolves.toEqual({ error: MFA_NEEDS_KEY });
    expect(mocks.selectWhere).not.toHaveBeenCalled();
  });
});

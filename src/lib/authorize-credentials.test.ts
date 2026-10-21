// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectWhere: vi.fn(),
  compare: vi.fn(),
  checkThrottle: vi.fn(),
  recordFailure: vi.fn(),
  clearFailures: vi.fn(),
  verifySecondFactor: vi.fn(),
  verifyMfaTicket: vi.fn(),
  createMfaTicket: vi.fn(() => "signed-ticket"),
  findTrustedDevice: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: { select: vi.fn(() => ({ from: () => ({ where: mocks.selectWhere }) })) },
}));
vi.mock("@/db/schema", () => ({ users: { id: "users.id", email: "users.email" } }));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare } }));
vi.mock("./auth-throttle", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./auth-throttle")>()),
  checkThrottle: mocks.checkThrottle,
  recordFailure: mocks.recordFailure,
  clearFailures: mocks.clearFailures,
}));
vi.mock("./mfa-store", () => ({ verifySecondFactor: mocks.verifySecondFactor }));
vi.mock("./mfa", () => ({ createMfaTicket: mocks.createMfaTicket, verifyMfaTicket: mocks.verifyMfaTicket }));
vi.mock("./trusted-devices", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./trusted-devices")>()),
  findTrustedDevice: mocks.findTrustedDevice,
}));

import { AuthErrorCode } from "@/data/types";
import { LockedOutError, MfaRequiredError, authorizeCredentials } from "./authorize-credentials";

const USER = {
  id: "user-1",
  email: "alice@example.com",
  name: "Alice",
  passwordHash: "$2a$10$hash",
  sessionVersion: 2,
  mfaEnabledAt: null as Date | null,
  totpSecret: null as string | null,
  totpLastStep: null as number | null,
};

function request(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/auth/callback/credentials", { headers });
}

const targetKeys = (call: unknown[]) => (call[0] as { key: string }[]).map((target) => target.key);

describe("authorizeCredentials — password step", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkThrottle.mockResolvedValue({ locked: false });
    mocks.selectWhere.mockResolvedValue([USER]);
    mocks.compare.mockResolvedValue(true);
    mocks.findTrustedDevice.mockResolvedValue(null);
  });

  it("returns the user with their session version on a correct password", async () => {
    await expect(
      authorizeCredentials({ email: "alice@example.com", password: "pw" }, request({ "x-forwarded-for": "1.2.3.4" }))
    ).resolves.toEqual({ id: "user-1", email: "alice@example.com", name: "Alice", sessionVersion: 2 });
    expect(targetKeys(mocks.checkThrottle.mock.calls[0])).toEqual(["email:alice@example.com", "ip:1.2.3.4"]);
    // Only the account key is cleared; the IP budget is never refunded.
    expect(targetKeys(mocks.clearFailures.mock.calls[0])).toEqual(["email:alice@example.com"]);
    expect(mocks.recordFailure).not.toHaveBeenCalled();
  });

  it("returns null without checking anything when fields are missing", async () => {
    await expect(authorizeCredentials({ email: "alice@example.com" }, request())).resolves.toBeNull();
    expect(mocks.checkThrottle).not.toHaveBeenCalled();
  });

  it("records a failure on a wrong password", async () => {
    mocks.compare.mockResolvedValue(false);
    await expect(authorizeCredentials({ email: "alice@example.com", password: "bad" }, request())).resolves.toBeNull();
    expect(targetKeys(mocks.recordFailure.mock.calls[0])).toEqual(["email:alice@example.com"]);
  });

  it("still runs bcrypt and records a failure for an unknown email", async () => {
    mocks.selectWhere.mockResolvedValue([]);
    await expect(authorizeCredentials({ email: "nobody@example.com", password: "pw" }, request())).resolves.toBeNull();
    expect(mocks.compare).toHaveBeenCalledWith("pw", expect.stringMatching(/^\$2[aby]\$/));
    expect(mocks.recordFailure).toHaveBeenCalled();
  });

  it("treats an account without a password as a failure", async () => {
    mocks.selectWhere.mockResolvedValue([{ ...USER, passwordHash: null }]);
    await expect(authorizeCredentials({ email: "alice@example.com", password: "pw" }, request())).resolves.toBeNull();
    expect(mocks.recordFailure).toHaveBeenCalled();
  });

  it("throws LockedOutError before checking the password while locked", async () => {
    mocks.checkThrottle.mockResolvedValue({ locked: true, retryAfterSeconds: 600 });
    const attempt = authorizeCredentials({ email: "alice@example.com", password: "pw" }, request());
    await expect(attempt).rejects.toBeInstanceOf(LockedOutError);
    await expect(attempt).rejects.toMatchObject({ code: AuthErrorCode.Locked, retryAfterSeconds: 600 });
    expect(mocks.compare).not.toHaveBeenCalled();
  });

  it("asks for a second factor, carrying the ticket off the URL-visible code", async () => {
    mocks.selectWhere.mockResolvedValue([{ ...USER, mfaEnabledAt: new Date(), totpSecret: "enc" }]);
    const attempt = authorizeCredentials({ email: "alice@example.com", password: "pw" }, request());
    await expect(attempt).rejects.toBeInstanceOf(MfaRequiredError);
    await expect(attempt).rejects.toMatchObject({ code: AuthErrorCode.MfaRequired, ticket: "signed-ticket" });
    expect(mocks.createMfaTicket).toHaveBeenCalledWith("user-1");
  });
});

describe("authorizeCredentials — trusted devices", () => {
  const DEVICE = {
    id: "device-1",
    userId: "user-1",
    tokenHash: "hash",
    label: "Chrome on macOS",
    sessionVersion: 2,
    mfaRememberedUntil: null as Date | null,
    createdAt: new Date(),
    lastUsedAt: new Date(),
  };
  const withDeviceCookie = () => request({ cookie: "arrivo_device=device-token", "x-forwarded-for": "1.2.3.4" });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkThrottle.mockResolvedValue({ locked: false });
    mocks.selectWhere.mockResolvedValue([USER]);
    mocks.compare.mockResolvedValue(true);
    mocks.findTrustedDevice.mockResolvedValue(DEVICE);
  });

  it("limits a known browser by its own key, so lockouts from elsewhere don't apply", async () => {
    await authorizeCredentials({ email: "alice@example.com", password: "pw" }, withDeviceCookie());
    expect(mocks.findTrustedDevice).toHaveBeenCalledWith("device-token", USER);
    expect(targetKeys(mocks.checkThrottle.mock.calls[0])).toEqual(["device:device-1"]);
    expect(targetKeys(mocks.clearFailures.mock.calls[0])).toEqual(["device:device-1"]);
  });

  it("counts wrong passwords from a known browser against that browser only", async () => {
    mocks.compare.mockResolvedValue(false);
    await authorizeCredentials({ email: "alice@example.com", password: "bad" }, withDeviceCookie());
    expect(targetKeys(mocks.recordFailure.mock.calls[0])).toEqual(["device:device-1"]);
  });

  it("falls back to the email and IP keys when the cookie isn't a trusted device for this user", async () => {
    mocks.findTrustedDevice.mockResolvedValue(null);
    await authorizeCredentials({ email: "alice@example.com", password: "pw" }, withDeviceCookie());
    expect(targetKeys(mocks.checkThrottle.mock.calls[0])).toEqual(["email:alice@example.com", "ip:1.2.3.4"]);
  });

  it("skips the code on a browser remembered for two-factor", async () => {
    mocks.selectWhere.mockResolvedValue([{ ...USER, mfaEnabledAt: new Date(), totpSecret: "enc" }]);
    mocks.findTrustedDevice.mockResolvedValue({ ...DEVICE, mfaRememberedUntil: new Date(Date.now() + 60_000) });
    await expect(
      authorizeCredentials({ email: "alice@example.com", password: "pw" }, withDeviceCookie())
    ).resolves.toMatchObject({ id: "user-1" });
  });

  it("asks for the code again once the remember window has passed", async () => {
    mocks.selectWhere.mockResolvedValue([{ ...USER, mfaEnabledAt: new Date(), totpSecret: "enc" }]);
    mocks.findTrustedDevice.mockResolvedValue({ ...DEVICE, mfaRememberedUntil: new Date(Date.now() - 60_000) });
    await expect(
      authorizeCredentials({ email: "alice@example.com", password: "pw" }, withDeviceCookie())
    ).rejects.toBeInstanceOf(MfaRequiredError);
  });
});

describe("authorizeCredentials — two-factor step", () => {
  const MFA_USER = { ...USER, mfaEnabledAt: new Date(), totpSecret: "enc", totpLastStep: 10 };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkThrottle.mockResolvedValue({ locked: false });
    mocks.verifyMfaTicket.mockReturnValue("user-1");
    mocks.selectWhere.mockResolvedValue([MFA_USER]);
    mocks.verifySecondFactor.mockResolvedValue(true);
  });

  it("signs in with a valid ticket and code", async () => {
    await expect(authorizeCredentials({ mfaTicket: "t", code: "123456" }, request())).resolves.toEqual({
      id: "user-1",
      email: "alice@example.com",
      name: "Alice",
      sessionVersion: 2,
    });
    expect(mocks.verifySecondFactor).toHaveBeenCalledWith(
      { id: "user-1", totpSecret: "enc", totpLastStep: 10 },
      "123456"
    );
    expect(targetKeys(mocks.clearFailures.mock.calls[0])).toEqual(["mfa:user-1"]);
  });

  it("rejects a forged or expired ticket", async () => {
    mocks.verifyMfaTicket.mockReturnValue(null);
    await expect(authorizeCredentials({ mfaTicket: "t", code: "123456" }, request())).resolves.toBeNull();
    expect(mocks.verifySecondFactor).not.toHaveBeenCalled();
  });

  it("rejects a missing code", async () => {
    await expect(authorizeCredentials({ mfaTicket: "t" }, request())).resolves.toBeNull();
  });

  it("records a failure on a wrong code", async () => {
    mocks.verifySecondFactor.mockResolvedValue(false);
    await expect(authorizeCredentials({ mfaTicket: "t", code: "000000" }, request())).resolves.toBeNull();
    expect(targetKeys(mocks.recordFailure.mock.calls[0])).toEqual(["mfa:user-1"]);
  });

  it("throws LockedOutError while code attempts are locked", async () => {
    mocks.checkThrottle.mockResolvedValue({ locked: true, retryAfterSeconds: 60 });
    await expect(authorizeCredentials({ mfaTicket: "t", code: "123456" }, request())).rejects.toMatchObject({
      retryAfterSeconds: 60,
    });
  });

  it("rejects when two-factor was turned off after the password step", async () => {
    mocks.selectWhere.mockResolvedValue([{ ...MFA_USER, mfaEnabledAt: null }]);
    await expect(authorizeCredentials({ mfaTicket: "t", code: "123456" }, request())).resolves.toBeNull();
  });

  it("rejects when the user no longer exists", async () => {
    mocks.selectWhere.mockResolvedValue([]);
    await expect(authorizeCredentials({ mfaTicket: "t", code: "123456" }, request())).resolves.toBeNull();
  });
});

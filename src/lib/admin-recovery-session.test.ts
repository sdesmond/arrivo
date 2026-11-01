// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { validate, checkThrottle, recordFailure, database } = vi.hoisted(() => ({
  validate: vi.fn(),
  checkThrottle: vi.fn(),
  recordFailure: vi.fn(),
  database: { transaction: vi.fn() },
}));
vi.mock("@/db", () => ({ db: database }));
vi.mock("@/lib/credential-authorizations", () => ({ validateCredentialAuthorization: validate }));
vi.mock("@/lib/auth-throttle", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth-throttle")>("@/lib/auth-throttle");
  return { ...actual, checkThrottle, recordFailure };
});

import {
  ADMIN_RECOVERY_COOKIE,
  adminRecoveryCookie,
  clearedAdminRecoveryCookie,
  ADMIN_RECOVERY_COOKIE_PATH,
  resolveAdminRecoveryContext,
} from "./admin-recovery-session";

const NOW = new Date("2026-10-27T12:00:00Z");
const clock = () => NOW;
const TOKEN = "a".repeat(43);
const account = {
  userId: "user-1",
  username: "pending",
  purpose: "recovery",
  expiresAt: "2026-10-28T12:00:00.000Z",
};
const headers = (init: Record<string, string> = {}) => new Headers({ "x-forwarded-for": "203.0.113.9", ...init });

describe("cookie helpers", () => {
  it("builds a limited cookie that never outlives the link", () => {
    const cookie = adminRecoveryCookie(TOKEN, account.expiresAt, { https: false, now: NOW });
    expect(cookie).toContain(`${ADMIN_RECOVERY_COOKIE}=${TOKEN}`);
    expect(cookie).toContain("Max-Age=86400");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/account-recovery;");
    expect(ADMIN_RECOVERY_COOKIE_PATH).toBe("/account-recovery");
    expect(cookie).not.toContain("Secure");
  });

  it("marks the cookie Secure over HTTPS and clamps Max-Age to the remaining lifetime", () => {
    const cookie = adminRecoveryCookie(TOKEN, "2026-10-27T12:00:30.900Z", { https: true, now: NOW });
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Max-Age=30");
  });

  it("expires immediately when the link is already past expiry", () => {
    expect(adminRecoveryCookie(TOKEN, "2026-10-27T11:00:00Z", { https: false, now: NOW })).toContain("Max-Age=0");
  });

  it("clears the cookie with the same attributes", () => {
    const cookie = clearedAdminRecoveryCookie(true);
    expect(cookie).toContain(`${ADMIN_RECOVERY_COOKIE}=;`);
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("Path=/account-recovery;");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
  });
});

describe("resolveAdminRecoveryContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkThrottle.mockResolvedValue({ locked: false });
    recordFailure.mockResolvedValue(undefined);
    validate.mockResolvedValue({ ok: true, account });
  });

  it("is unavailable without a token and touches nothing", async () => {
    expect(await resolveAdminRecoveryContext(undefined, { headers: headers(), clock })).toEqual({
      status: "unavailable",
    });
    expect(validate).not.toHaveBeenCalled();
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it("validates a recovery-purpose token against the database without counting a page view", async () => {
    const result = await resolveAdminRecoveryContext(TOKEN, { headers: headers(), clock });
    expect(result).toEqual({ status: "ready", account });
    expect(validate).toHaveBeenCalledWith(database, { token: TOKEN, purpose: "recovery" }, clock);
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it("uses distinct budgets for each token and attempt type", async () => {
    await resolveAdminRecoveryContext(TOKEN, { headers: headers(), clock, attempt: "exchange" });
    const exchangeKey = recordFailure.mock.calls[0][0][0].key;
    expect(exchangeKey).toMatch(/^recovery-exchange:[a-f0-9]{64}$/);
    await resolveAdminRecoveryContext("b".repeat(43), { headers: headers(), clock, attempt: "exchange" });
    expect(recordFailure.mock.calls[1][0][0].key).not.toBe(exchangeKey);
    await resolveAdminRecoveryContext(TOKEN, { headers: headers(), clock, attempt: "submit" });
    expect(recordFailure.mock.calls[2][0][0].key).not.toBe(exchangeKey);
  });

  it("allows a page view after the exchange budget locks", async () => {
    checkThrottle.mockResolvedValueOnce({ locked: false }).mockResolvedValue({ locked: true, retryAfterSeconds: 60 });
    expect(await resolveAdminRecoveryContext(TOKEN, { headers: headers(), clock })).toEqual({
      status: "ready",
      account,
    });
  });

  it("counts an invalid token against the client IP and shows the generic result", async () => {
    validate.mockResolvedValue({ ok: false, reason: "invalid" });
    expect(await resolveAdminRecoveryContext(TOKEN, { headers: headers(), clock })).toEqual({
      status: "unavailable",
    });
    expect(recordFailure).toHaveBeenCalledWith([expect.objectContaining({ key: "recovery-ip:203.0.113.9" })], NOW);
  });

  it("skips IP accounting when no proxy header identifies the client", async () => {
    validate.mockResolvedValue({ ok: false, reason: "invalid" });
    await resolveAdminRecoveryContext(TOKEN, { headers: new Headers(), clock });
    expect(recordFailure).toHaveBeenCalledWith([], NOW);
  });

  it("does not count transient validation failures against the IP", async () => {
    validate.mockResolvedValue({ ok: false, reason: "retry" });
    expect(await resolveAdminRecoveryContext(TOKEN, { headers: headers(), clock })).toEqual({
      status: "unavailable",
    });
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it("refuses an IP that is locked out before validating", async () => {
    checkThrottle.mockResolvedValueOnce({ locked: true, retryAfterSeconds: 60 });
    expect(await resolveAdminRecoveryContext(TOKEN, { headers: headers(), clock })).toEqual({
      status: "unavailable",
    });
    expect(validate).not.toHaveBeenCalled();
  });

  it("gives the same generic result for a locked account", async () => {
    checkThrottle
      .mockResolvedValueOnce({ locked: false })
      .mockResolvedValueOnce({ locked: true, retryAfterSeconds: 9 });
    expect(await resolveAdminRecoveryContext(TOKEN, { headers: headers(), clock, attempt: "exchange" })).toEqual({
      status: "unavailable",
    });
    expect(recordFailure).not.toHaveBeenCalled();
  });
});

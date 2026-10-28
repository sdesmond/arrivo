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
  ACCOUNT_SETUP_COOKIE,
  accountSetupCookie,
  clearedAccountSetupCookie,
  readAccountSetupToken,
  resolveAccountSetupContext,
} from "./account-setup-session";

const NOW = new Date("2026-10-27T12:00:00Z");
const clock = () => NOW;
const TOKEN = "a".repeat(43);
const account = {
  userId: "user-1",
  username: "pending",
  purpose: "setup",
  expiresAt: "2026-10-28T12:00:00.000Z",
};
const headers = (init: Record<string, string> = {}) => new Headers({ "x-forwarded-for": "203.0.113.9", ...init });

describe("cookie helpers", () => {
  it("reads only the account-setup cookie", () => {
    expect(readAccountSetupToken(`a=1; ${ACCOUNT_SETUP_COOKIE}=${TOKEN}; b=2`)).toBe(TOKEN);
    expect(readAccountSetupToken("a=1")).toBeUndefined();
    expect(readAccountSetupToken(`${ACCOUNT_SETUP_COOKIE}=`)).toBeUndefined();
    expect(readAccountSetupToken(null)).toBeUndefined();
  });

  it("builds a limited cookie that never outlives the link", () => {
    const cookie = accountSetupCookie(TOKEN, account.expiresAt, { https: false, now: NOW });
    expect(cookie).toContain(`${ACCOUNT_SETUP_COOKIE}=${TOKEN}`);
    expect(cookie).toContain("Max-Age=86400");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).not.toContain("Secure");
  });

  it("marks the cookie Secure over HTTPS and clamps Max-Age to the remaining lifetime", () => {
    const cookie = accountSetupCookie(TOKEN, "2026-10-27T12:00:30.900Z", { https: true, now: NOW });
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("Max-Age=30");
  });

  it("expires immediately when the link is already past expiry", () => {
    expect(accountSetupCookie(TOKEN, "2026-10-27T11:00:00Z", { https: false, now: NOW })).toContain("Max-Age=0");
  });

  it("clears the cookie with the same attributes", () => {
    const cookie = clearedAccountSetupCookie(true);
    expect(cookie).toContain(`${ACCOUNT_SETUP_COOKIE}=;`);
    expect(cookie).toContain("Max-Age=0");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
  });
});

describe("resolveAccountSetupContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkThrottle.mockResolvedValue({ locked: false });
    recordFailure.mockResolvedValue(undefined);
    validate.mockResolvedValue({ ok: true, account });
  });

  it("is unavailable without a token and touches nothing", async () => {
    expect(await resolveAccountSetupContext(undefined, { headers: headers(), clock })).toEqual({
      status: "unavailable",
    });
    expect(validate).not.toHaveBeenCalled();
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it("validates a setup-purpose token against the database without counting a page view", async () => {
    const result = await resolveAccountSetupContext(TOKEN, { headers: headers(), clock });
    expect(result).toEqual({ status: "ready", account });
    expect(validate).toHaveBeenCalledWith(database, { token: TOKEN, purpose: "setup" }, clock);
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it("counts a valid exchange against the account", async () => {
    await resolveAccountSetupContext(TOKEN, { headers: headers(), clock, countAttempt: true });
    expect(recordFailure).toHaveBeenCalledWith([expect.objectContaining({ key: "setup:user-1" })], NOW);
  });

  it("counts an invalid token against the client IP and shows the generic result", async () => {
    validate.mockResolvedValue({ ok: false, reason: "invalid" });
    expect(await resolveAccountSetupContext(TOKEN, { headers: headers(), clock })).toEqual({
      status: "unavailable",
    });
    expect(recordFailure).toHaveBeenCalledWith([expect.objectContaining({ key: "setup-ip:203.0.113.9" })], NOW);
  });

  it("skips IP accounting when no proxy header identifies the client", async () => {
    validate.mockResolvedValue({ ok: false, reason: "invalid" });
    await resolveAccountSetupContext(TOKEN, { headers: new Headers(), clock });
    expect(recordFailure).toHaveBeenCalledWith([], NOW);
  });

  it("does not count transient validation failures against the IP", async () => {
    validate.mockResolvedValue({ ok: false, reason: "retry" });
    expect(await resolveAccountSetupContext(TOKEN, { headers: headers(), clock })).toEqual({
      status: "unavailable",
    });
    expect(recordFailure).not.toHaveBeenCalled();
  });

  it("refuses an IP that is locked out before validating", async () => {
    checkThrottle.mockResolvedValueOnce({ locked: true, retryAfterSeconds: 60 });
    expect(await resolveAccountSetupContext(TOKEN, { headers: headers(), clock })).toEqual({
      status: "unavailable",
    });
    expect(validate).not.toHaveBeenCalled();
  });

  it("gives the same generic result for a locked account", async () => {
    checkThrottle
      .mockResolvedValueOnce({ locked: false })
      .mockResolvedValueOnce({ locked: true, retryAfterSeconds: 9 });
    expect(await resolveAccountSetupContext(TOKEN, { headers: headers(), clock, countAttempt: true })).toEqual({
      status: "unavailable",
    });
    expect(recordFailure).not.toHaveBeenCalled();
  });
});

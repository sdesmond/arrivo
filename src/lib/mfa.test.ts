// @vitest-environment node
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Secret, TOTP } from "otpauth";
import {
  MFA_TICKET_TTL_MS,
  createMfaTicket,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  isRecoveryCodeFormat,
  normalizeRecoveryCode,
  totpUri,
  verifyMfaTicket,
  verifyTotp,
} from "./mfa";

const NOW = Date.UTC(2026, 9, 21, 12, 0, 15);
const STEP = Math.floor(NOW / 30_000);

function codeAt(secret: string, timestamp: number): string {
  return new TOTP({ secret: Secret.fromBase32(secret), digits: 6, period: 30, algorithm: "SHA1" }).generate({
    timestamp,
  });
}

describe("TOTP", () => {
  it("generates a 160-bit base32 secret", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(generateTotpSecret()).not.toBe(secret);
  });

  it("builds an otpauth URI naming Arrivo and the account", () => {
    const uri = totpUri("alice@example.com", generateTotpSecret());
    expect(uri.startsWith("otpauth://totp/Arrivo:alice%40example.com?")).toBe(true);
    expect(uri).toContain("issuer=Arrivo");
  });

  it("accepts the current code and returns its time step", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, codeAt(secret, NOW), null, NOW)).toEqual({ ok: true, step: STEP });
  });

  it("tolerates spaces and one step of clock drift either way", () => {
    const secret = generateTotpSecret();
    const previous = codeAt(secret, NOW - 30_000);
    expect(verifyTotp(secret, `${previous.slice(0, 3)} ${previous.slice(3)}`, null, NOW)).toEqual({
      ok: true,
      step: STEP - 1,
    });
    expect(verifyTotp(secret, codeAt(secret, NOW + 30_000), null, NOW)).toEqual({ ok: true, step: STEP + 1 });
  });

  it("rejects codes outside the drift window", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, codeAt(secret, NOW - 90_000), null, NOW)).toEqual({ ok: false });
  });

  it("rejects a code whose step was already used (replay)", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, codeAt(secret, NOW), STEP, NOW)).toEqual({ ok: false });
    expect(verifyTotp(secret, codeAt(secret, NOW), STEP - 1, NOW)).toEqual({ ok: true, step: STEP });
  });

  it("rejects malformed codes without checking them", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, "12345", null, NOW)).toEqual({ ok: false });
    expect(verifyTotp(secret, "abcdef", null, NOW)).toEqual({ ok: false });
  });
});

describe("recovery codes", () => {
  it("generates ten unique xxxxx-xxxxx codes", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[a-z0-9]{5}-[a-z0-9]{5}$/);
  });

  it("normalizes case, spaces and dashes", () => {
    expect(normalizeRecoveryCode(" ABCDE-fgh2j ")).toBe("abcdefgh2j");
  });

  it("hashes the normalized form", () => {
    expect(hashRecoveryCode("abcde-fgh2j")).toBe(hashRecoveryCode("ABCDEFGH2J"));
    expect(hashRecoveryCode("abcde-fgh2j")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRecoveryCode("abcde-fgh2j")).not.toBe(hashRecoveryCode("abcde-fgh2k"));
  });

  it("tells recovery codes apart from six-digit TOTP codes", () => {
    expect(isRecoveryCodeFormat("abcde-fgh2j")).toBe(true);
    expect(isRecoveryCodeFormat("123456")).toBe(false);
    expect(isRecoveryCodeFormat("abc")).toBe(false);
  });
});

describe("MFA tickets", () => {
  beforeEach(() => vi.stubEnv("NEXTAUTH_SECRET", "test-secret-test-secret-test-secret"));
  afterEach(() => vi.unstubAllEnvs());

  it("round-trips the user id while unexpired", () => {
    const ticket = createMfaTicket("user-1", { keepSignedIn: false }, NOW);
    expect(verifyMfaTicket(ticket, NOW + MFA_TICKET_TTL_MS - 1)).toEqual({ userId: "user-1", keepSignedIn: false });
  });

  it("rejects an expired ticket", () => {
    const ticket = createMfaTicket("user-1", { keepSignedIn: false }, NOW);
    expect(verifyMfaTicket(ticket, NOW + MFA_TICKET_TTL_MS + 1)).toBeNull();
  });

  it("rejects a ticket whose payload was altered", () => {
    const [, signature] = createMfaTicket("user-1", { keepSignedIn: false }, NOW).split(".");
    const forged = Buffer.from(JSON.stringify({ userId: "user-2", expiresAt: NOW + 60_000 })).toString("base64url");
    expect(verifyMfaTicket(`${forged}.${signature}`, NOW)).toBeNull();
  });

  it("rejects a ticket signed with another secret", () => {
    const ticket = createMfaTicket("user-1", { keepSignedIn: false }, NOW);
    vi.stubEnv("NEXTAUTH_SECRET", "a-different-secret-a-different-secret");
    expect(verifyMfaTicket(ticket, NOW)).toBeNull();
  });

  it("rejects malformed tickets", () => {
    expect(verifyMfaTicket("", NOW)).toBeNull();
    expect(verifyMfaTicket("no-dot", NOW)).toBeNull();
    const sign = (payload: string) =>
      createHmac("sha256", "test-secret-test-secret-test-secret").update(payload).digest("base64url");
    const notJson = Buffer.from("not-json").toString("base64url");
    expect(verifyMfaTicket(`${notJson}.${sign(notJson)}`, NOW)).toBeNull();
    const wrongShape = Buffer.from(JSON.stringify({ userId: 7 })).toString("base64url");
    expect(verifyMfaTicket(`${wrongShape}.${sign(wrongShape)}`, NOW)).toBeNull();
  });

  it("prefers AUTH_SECRET when both secrets are set", () => {
    vi.stubEnv("AUTH_SECRET", "auth-secret-auth-secret-auth-secret");
    const ticket = createMfaTicket("user-1", { keepSignedIn: false }, NOW);
    vi.stubEnv("NEXTAUTH_SECRET", "changed-changed-changed-changed");
    expect(verifyMfaTicket(ticket, NOW)).toEqual({ userId: "user-1", keepSignedIn: false });
  });

  it("carries Keep me signed in, defaulting to kept for tickets issued before it existed", () => {
    const kept = createMfaTicket("user-1", { keepSignedIn: true }, NOW);
    expect(verifyMfaTicket(kept, NOW)).toEqual({ userId: "user-1", keepSignedIn: true });

    const sign = (payload: string) =>
      createHmac("sha256", "test-secret-test-secret-test-secret").update(payload).digest("base64url");
    const legacy = Buffer.from(JSON.stringify({ userId: "user-1", expiresAt: NOW + 60_000 })).toString("base64url");
    expect(verifyMfaTicket(`${legacy}.${sign(legacy)}`, NOW)).toEqual({ userId: "user-1", keepSignedIn: true });
  });

  it("refuses to sign without a secret", () => {
    vi.stubEnv("NEXTAUTH_SECRET", "");
    expect(() => createMfaTicket("user-1", { keepSignedIn: false }, NOW)).toThrow("NEXTAUTH_SECRET");
  });
});

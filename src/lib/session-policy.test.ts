// @vitest-environment node
import { describe, expect, it } from "vitest";
import { SHORT_SESSION_MS, isTokenRevoked } from "./session-policy";

const NOW = Date.UTC(2026, 9, 21, 12);
const CURRENT = { sessionVersion: 2, deviceActive: true };

describe("isTokenRevoked", () => {
  it("keeps a current token", () => {
    expect(isTokenRevoked({ sessionVersion: 2, deviceId: "d1", keepSignedIn: true, signedInAt: 0 }, CURRENT, NOW)).toBe(
      false
    );
  });

  it("drops the token of a deleted user", () => {
    expect(isTokenRevoked({ sessionVersion: 0 }, undefined, NOW)).toBe(true);
  });

  it("drops a token issued before the last session-version bump", () => {
    expect(isTokenRevoked({ sessionVersion: 1 }, CURRENT, NOW)).toBe(true);
  });

  it("treats tokens without a version as version 0", () => {
    expect(isTokenRevoked({}, { sessionVersion: 0, deviceActive: false }, NOW)).toBe(false);
    expect(isTokenRevoked({}, CURRENT, NOW)).toBe(true);
  });

  it("drops a token whose browser was removed", () => {
    expect(isTokenRevoked({ sessionVersion: 2, deviceId: "d1" }, { ...CURRENT, deviceActive: false }, NOW)).toBe(true);
  });

  it("ignores the browser check for tokens from before browsers were tracked", () => {
    expect(isTokenRevoked({ sessionVersion: 2 }, { ...CURRENT, deviceActive: false }, NOW)).toBe(false);
  });

  it("ends a short session 12 hours after sign-in", () => {
    const token = { sessionVersion: 2, deviceId: "d1", keepSignedIn: false };
    expect(isTokenRevoked({ ...token, signedInAt: NOW - SHORT_SESSION_MS + 1000 }, CURRENT, NOW)).toBe(false);
    expect(isTokenRevoked({ ...token, signedInAt: NOW - SHORT_SESSION_MS - 1000 }, CURRENT, NOW)).toBe(true);
    expect(SHORT_SESSION_MS).toBe(12 * 60 * 60 * 1000);
  });

  it("never times out a kept session, or one from before the choice existed", () => {
    expect(isTokenRevoked({ sessionVersion: 2, keepSignedIn: true, signedInAt: 0 }, CURRENT, NOW)).toBe(false);
    expect(isTokenRevoked({ sessionVersion: 2, signedInAt: 0 }, CURRENT, NOW)).toBe(false);
    expect(isTokenRevoked({ sessionVersion: 2, keepSignedIn: false }, CURRENT, NOW)).toBe(false);
  });
});

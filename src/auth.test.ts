// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextAuthConfig } from "next-auth";

const mocks = vi.hoisted(() => ({
  config: undefined as NextAuthConfig | undefined,
  getSessionState: vi.fn(),
}));

vi.mock("next-auth", () => ({
  default: (config: NextAuthConfig) => {
    mocks.config = config;
    return { auth: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), handlers: {} };
  },
}));
vi.mock("next-auth/providers/credentials", () => ({
  default: (options: object) => ({ id: "credentials", ...options }),
}));
vi.mock("@auth/drizzle-adapter", () => ({ DrizzleAdapter: vi.fn(() => ({})) }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/authorize-credentials", () => ({ authorizeCredentials: vi.fn() }));
vi.mock("@/lib/session-version", () => ({ getSessionState: mocks.getSessionState }));

import "./auth";

type JwtArgs = Parameters<NonNullable<NonNullable<NextAuthConfig["callbacks"]>["jwt"]>>[0];
const jwt = (args: Partial<JwtArgs>) => mocks.config!.callbacks!.jwt!({ token: {}, ...args } as JwtArgs);

describe("auth jwt callback", () => {
  beforeEach(() => mocks.getSessionState.mockReset());

  it("records the session version, browser and Keep me signed in choice at sign-in", async () => {
    const token = await jwt({
      user: { id: "user-1", sessionVersion: 3, deviceId: "device-1", keepSignedIn: false },
    });
    expect(token).toMatchObject({ sub: "user-1", sessionVersion: 3, deviceId: "device-1", keepSignedIn: false });
    expect(token?.signedInAt).toEqual(expect.any(Number));
    expect(mocks.getSessionState).not.toHaveBeenCalled();
  });

  it("defaults a sign-in without those fields to version 0 and kept", async () => {
    expect(await jwt({ user: { id: "user-1" } })).toMatchObject({ sessionVersion: 0, keepSignedIn: true });
  });

  it("keeps a token the database still vouches for, checking its user and browser", async () => {
    mocks.getSessionState.mockResolvedValue({ sessionVersion: 3, deviceActive: true });
    const token = { sub: "user-1", sessionVersion: 3, deviceId: "device-1" };
    expect(await jwt({ token })).toBe(token);
    expect(mocks.getSessionState).toHaveBeenCalledWith("user-1", "device-1");
  });

  it("drops a revoked token", async () => {
    mocks.getSessionState.mockResolvedValue({ sessionVersion: 4, deviceActive: true });
    expect(await jwt({ token: { sub: "user-1", sessionVersion: 3 } })).toBeNull();
  });

  it("passes a token without a user through untouched", async () => {
    const token = { name: "anonymous" };
    expect(await jwt({ token })).toBe(token);
    expect(mocks.getSessionState).not.toHaveBeenCalled();
  });

  it("keeps the shared config's session callback, pages and JWT strategy", () => {
    expect(mocks.config?.session).toEqual({ strategy: "jwt" });
    expect(mocks.config?.pages).toEqual({ signIn: "/sign-in" });
    expect(mocks.config?.callbacks?.session).toEqual(expect.any(Function));
  });
});

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

const { signIn, signOut, db, selectWhere, rememberDevice, verifyMfaTicket } = vi.hoisted(() => {
  const selectWhere = vi.fn();
  return {
    signIn: vi.fn(),
    signOut: vi.fn(),
    selectWhere,
    rememberDevice: vi.fn(),
    verifyMfaTicket: vi.fn(),
    db: {
      insert: vi.fn(),
      update: vi.fn(),
      select: vi.fn(() => ({ from: () => ({ where: selectWhere }) })),
    },
  };
});

vi.mock("@/auth", () => ({
  signIn,
  signOut,
}));

vi.mock("@/db", () => ({
  db,
}));

vi.mock("next-auth", async () => ({
  AuthError: (await import("@auth/core/errors")).AuthError,
}));

vi.mock("@/lib/trusted-devices", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/trusted-devices")>()),
  rememberDevice,
}));

vi.mock("@/lib/mfa", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/mfa")>()),
  verifyMfaTicket,
}));

import { CredentialsSignin } from "@auth/core/errors";
import { collaborators, users } from "@/db/schema";
import { LockedOutError, MfaRequiredError } from "@/lib/authorize-credentials";
import { MFA_COOKIE } from "@/lib/mfa";
import { DEVICE_COOKIE } from "@/lib/trusted-devices";
import { signInAction, signOutAction, signUpAction, verifyMfaAction } from "./actions";

function cookieJar(values: Record<string, string> = {}) {
  const jar = {
    get: vi.fn((name: string) => (name in values ? { name, value: values[name] } : undefined)),
    set: vi.fn(),
    delete: vi.fn(),
  };
  vi.mocked(cookies).mockResolvedValue(jar as never);
  return jar;
}

function signInForm(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [name, value] of Object.entries(fields)) formData.set(name, value);
  return formData;
}

describe("auth actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.mocked(headers).mockResolvedValue(new Headers());
  });

  it("stores a locale-derived currency when signing up", async () => {
    vi.mocked(headers).mockResolvedValueOnce(new Headers({ "accept-language": "en-GB,en;q=0.9" }));
    const insertValues = vi.fn();

    db.insert.mockImplementation((table: unknown) => {
      if (table === users) {
        return {
          values: insertValues.mockImplementation((values: unknown) => ({
            onConflictDoNothing: () => ({
              returning: async () => [{ id: "user-1", ...(values as Record<string, unknown>) }],
            }),
          })),
        };
      }

      throw new Error("Unexpected insert");
    });
    db.update.mockImplementation((table: unknown) => {
      if (table !== collaborators) throw new Error("Unexpected update");
      return {
        set: () => ({
          where: async () => undefined,
        }),
      };
    });

    const formData = new FormData();
    formData.set("email", "test@example.com");
    formData.set("password", "password123");
    formData.set("name", "Test User");

    await expect(signUpAction(undefined, formData)).resolves.toBeUndefined();

    expect(db.insert).toHaveBeenCalledWith(users);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "test@example.com",
        name: "Test User",
        currency: "GBP",
      })
    );
    expect(signIn).toHaveBeenCalled();
  });

  it("signs out to the sign-in page", async () => {
    await signOutAction();
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/sign-in" });
  });
});

describe("signInAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(headers).mockResolvedValue(new Headers({ "user-agent": "Firefox" }));
    selectWhere.mockResolvedValue([{ id: "user-1", sessionVersion: 3 }]);
    rememberDevice.mockResolvedValue("device-token");
  });

  it("signs in, trusts this browser, then lands on trips", async () => {
    const jar = cookieJar({ [DEVICE_COOKIE]: "old-token" });
    await signInAction(undefined, signInForm({ email: "a@example.com", password: "pw" }));

    expect(signIn).toHaveBeenCalledWith("credentials", { email: "a@example.com", password: "pw", redirect: false });
    expect(rememberDevice).toHaveBeenCalledWith({
      userId: "user-1",
      sessionVersion: 3,
      existingToken: "old-token",
      userAgent: "Firefox",
      rememberMfa: false,
    });
    expect(jar.set).toHaveBeenCalledWith(
      DEVICE_COOKIE,
      "device-token",
      expect.objectContaining({ httpOnly: true, sameSite: "lax", secure: false, maxAge: 365 * 24 * 60 * 60 })
    );
    expect(redirect).toHaveBeenCalledWith("/trips");
  });

  it("still lands on trips if the user row vanished between steps", async () => {
    cookieJar();
    selectWhere.mockResolvedValue([]);
    await signInAction(undefined, signInForm({ email: "a@example.com", password: "pw" }));
    expect(rememberDevice).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/trips");
  });

  it("returns a generic error for bad credentials", async () => {
    signIn.mockRejectedValueOnce(new CredentialsSignin());
    await expect(signInAction(undefined, signInForm({ email: "a@example.com", password: "x" }))).resolves.toEqual({
      error: "Invalid email or password.",
    });
    expect(rememberDevice).not.toHaveBeenCalled();
  });

  it("tells a locked-out user how long to wait", async () => {
    signIn.mockRejectedValueOnce(new LockedOutError(600));
    await expect(signInAction(undefined, signInForm({ email: "a@example.com", password: "x" }))).resolves.toEqual({
      error: "Too many attempts. Try again in 10 minutes.",
    });
  });

  it("stores the two-factor ticket in an httpOnly cookie and asks for a code", async () => {
    const jar = cookieJar();
    signIn.mockRejectedValueOnce(new MfaRequiredError("signed-ticket"));
    await expect(signInAction(undefined, signInForm({ email: "a@example.com", password: "pw" }))).resolves.toEqual({
      mfaRequired: true,
    });
    expect(jar.set).toHaveBeenCalledWith(
      MFA_COOKIE,
      "signed-ticket",
      expect.objectContaining({ httpOnly: true, sameSite: "lax", secure: false, maxAge: 300 })
    );
    expect(rememberDevice).not.toHaveBeenCalled();
  });

  it("marks cookies secure behind an HTTPS proxy", async () => {
    vi.mocked(headers).mockResolvedValue(new Headers({ "x-forwarded-proto": "https" }));
    const jar = cookieJar();
    signIn.mockRejectedValueOnce(new MfaRequiredError("signed-ticket"));
    await signInAction(undefined, signInForm({ email: "a@example.com", password: "pw" }));
    expect(jar.set).toHaveBeenCalledWith(MFA_COOKIE, "signed-ticket", expect.objectContaining({ secure: true }));
  });

  it("marks cookies secure when NEXTAUTH_URL is https and no proxy header is sent", async () => {
    vi.stubEnv("NEXTAUTH_URL", "https://arrivo.example.com");
    const jar = cookieJar();
    await signInAction(undefined, signInForm({ email: "a@example.com", password: "pw" }));
    expect(jar.set).toHaveBeenCalledWith(DEVICE_COOKIE, "device-token", expect.objectContaining({ secure: true }));
    vi.unstubAllEnvs();
  });

  it("rethrows non-auth errors", async () => {
    const failure = new Error("db down");
    signIn.mockRejectedValueOnce(failure);
    await expect(signInAction(undefined, signInForm({ email: "a@example.com", password: "pw" }))).rejects.toBe(failure);
  });
});

describe("verifyMfaAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(headers).mockResolvedValue(new Headers());
    selectWhere.mockResolvedValue([{ id: "user-1", sessionVersion: 3 }]);
    rememberDevice.mockResolvedValue("device-token");
    verifyMfaTicket.mockReturnValue("user-1");
  });

  it("signs in with the ticket and code, clears the ticket, trusts the browser, then lands on trips", async () => {
    const jar = cookieJar({ [MFA_COOKIE]: "signed-ticket" });
    await verifyMfaAction(undefined, signInForm({ code: "123456" }));
    expect(signIn).toHaveBeenCalledWith("credentials", {
      mfaTicket: "signed-ticket",
      code: "123456",
      redirect: false,
    });
    expect(jar.delete).toHaveBeenCalledWith(MFA_COOKIE);
    expect(rememberDevice).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", rememberMfa: false }));
    expect(redirect).toHaveBeenCalledWith("/trips");
  });

  it("remembers the browser for two-factor when the box is ticked", async () => {
    cookieJar({ [MFA_COOKIE]: "signed-ticket" });
    await verifyMfaAction(undefined, signInForm({ code: "123456", remember: "on" }));
    expect(rememberDevice).toHaveBeenCalledWith(expect.objectContaining({ rememberMfa: true }));
  });

  it("skips trusting the browser if the ticket can no longer be read", async () => {
    cookieJar({ [MFA_COOKIE]: "signed-ticket" });
    verifyMfaTicket.mockReturnValue(null);
    await verifyMfaAction(undefined, signInForm({ code: "123456" }));
    expect(rememberDevice).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/trips");
  });

  it("asks the user to start over when the ticket cookie is gone", async () => {
    cookieJar();
    await expect(verifyMfaAction(undefined, signInForm({ code: "123456" }))).resolves.toEqual({
      error: "Your sign-in timed out. Enter your email and password again.",
      expired: true,
    });
    expect(signIn).not.toHaveBeenCalled();
  });

  it("keeps the ticket for another try after a wrong code", async () => {
    const jar = cookieJar({ [MFA_COOKIE]: "signed-ticket" });
    signIn.mockRejectedValueOnce(new CredentialsSignin());
    await expect(verifyMfaAction(undefined, signInForm({ code: "000000" }))).resolves.toEqual({
      error: "That code didn't work. Try again.",
    });
    expect(jar.delete).not.toHaveBeenCalled();
  });

  it("reports how long to wait after repeated wrong codes", async () => {
    cookieJar({ [MFA_COOKIE]: "signed-ticket" });
    signIn.mockRejectedValueOnce(new LockedOutError(60));
    await expect(verifyMfaAction(undefined, signInForm({ code: "000000" }))).resolves.toEqual({
      error: "Too many attempts. Try again in 1 minute.",
    });
  });

  it("rethrows unexpected errors", async () => {
    cookieJar({ [MFA_COOKIE]: "signed-ticket" });
    signIn.mockRejectedValueOnce(new Error("db down"));
    await expect(verifyMfaAction(undefined, signInForm({ code: "123456" }))).rejects.toThrow("db down");
  });
});

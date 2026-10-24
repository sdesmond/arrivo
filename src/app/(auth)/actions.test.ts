// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

const { signIn, signOut, db } = vi.hoisted(() => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  db: {
    insert: vi.fn(),
  },
}));

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

import { CredentialsSignin } from "@auth/core/errors";
import { users } from "@/db/schema";
import { LockedOutError, MfaRequiredError } from "@/lib/authorize-credentials";
import { MFA_COOKIE } from "@/lib/mfa";
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

  function mockUserInsert(result: () => Promise<unknown> = async () => undefined) {
    const insertValues = vi.fn(result);
    db.insert.mockImplementation((table: unknown) => {
      if (table === users) return { values: insertValues };
      throw new Error("Unexpected insert");
    });
    return insertValues;
  }

  function signUpForm(fields: Record<string, string> = {}) {
    return signInForm({ username: " Test.User ", password: "password123", name: "Test User", ...fields });
  }

  it("stores a normalized username and locale-derived currency when signing up", async () => {
    vi.mocked(headers).mockResolvedValueOnce(new Headers({ "accept-language": "en-GB,en;q=0.9" }));
    const insertValues = mockUserInsert();

    await expect(signUpAction(undefined, signUpForm())).resolves.toBeUndefined();

    expect(db.insert).toHaveBeenCalledWith(users);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        username: "test.user",
        name: "Test User",
        currency: "GBP",
      })
    );
    expect(signIn).toHaveBeenCalled();
    const signInFormData = signIn.mock.calls[0][1] as FormData;
    expect(signInFormData.get("username")).toBe("test.user");
    // A brand-new account stays signed in on the browser that created it.
    expect(signInFormData.get("keepSignedIn")).toBe("true");
  });

  it("rejects an invalid username without creating an account", async () => {
    mockUserInsert();

    await expect(signUpAction(undefined, signUpForm({ username: "a@b.com" }))).resolves.toEqual({
      error: "Use letters, numbers, dots, dashes or underscores, starting with a letter or number.",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects a short password", async () => {
    mockUserInsert();

    await expect(signUpAction(undefined, signUpForm({ password: "short" }))).resolves.toEqual({
      error: "Password must be at least 8 characters.",
    });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("reports a taken username", async () => {
    mockUserInsert(async () => {
      throw new Error("Failed query", { cause: { code: "23505" } });
    });

    await expect(signUpAction(undefined, signUpForm())).resolves.toEqual({ error: "That username is taken." });
    expect(signIn).not.toHaveBeenCalled();
  });

  it("rethrows other insert failures", async () => {
    mockUserInsert(async () => {
      throw new Error("db down");
    });

    await expect(signUpAction(undefined, signUpForm())).rejects.toThrow("db down");
  });

  it("refuses sign-up when it is disabled", async () => {
    vi.stubEnv("ALLOW_SIGNUP", "false");
    mockUserInsert();

    await expect(signUpAction(undefined, signUpForm())).resolves.toEqual({ error: "Signup is disabled." });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("signs out to the sign-in page", async () => {
    await signOutAction();
    expect(signOut).toHaveBeenCalledWith({ redirectTo: "/sign-in" });
  });
});

describe("signInAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.mocked(headers).mockResolvedValue(new Headers());
  });

  it("signs in with the submitted credentials and Keep me signed in, then lands on trips", async () => {
    cookieJar();
    await signInAction(undefined, signInForm({ username: "alice", password: "pw", keepSignedIn: "on" }));
    expect(signIn).toHaveBeenCalledWith("credentials", {
      username: "alice",
      password: "pw",
      keepSignedIn: "true",
      redirect: false,
    });
    expect(redirect).toHaveBeenCalledWith("/trips");
  });

  it("sends an unticked Keep me signed in as false", async () => {
    cookieJar();
    await signInAction(undefined, signInForm({ username: "alice", password: "pw" }));
    expect(signIn).toHaveBeenCalledWith("credentials", expect.objectContaining({ keepSignedIn: "false" }));
  });

  it("returns a generic error for bad credentials", async () => {
    signIn.mockRejectedValueOnce(new CredentialsSignin());
    await expect(signInAction(undefined, signInForm({ username: "alice", password: "x" }))).resolves.toEqual({
      error: "Invalid username or password.",
    });
  });

  it("tells a locked-out user how long to wait", async () => {
    signIn.mockRejectedValueOnce(new LockedOutError(600));
    await expect(signInAction(undefined, signInForm({ username: "alice", password: "x" }))).resolves.toEqual({
      error: "Too many attempts. Try again in 10 minutes.",
    });
  });

  it("stores the two-factor ticket in an httpOnly cookie and asks for a code", async () => {
    const jar = cookieJar();
    signIn.mockRejectedValueOnce(new MfaRequiredError("signed-ticket"));
    await expect(signInAction(undefined, signInForm({ username: "alice", password: "pw" }))).resolves.toEqual({
      mfaRequired: true,
    });
    expect(jar.set).toHaveBeenCalledWith(
      MFA_COOKIE,
      "signed-ticket",
      expect.objectContaining({ httpOnly: true, sameSite: "lax", secure: false, maxAge: 300 })
    );
  });

  it("marks the ticket cookie secure behind an HTTPS proxy", async () => {
    vi.mocked(headers).mockResolvedValue(new Headers({ "x-forwarded-proto": "https" }));
    const jar = cookieJar();
    signIn.mockRejectedValueOnce(new MfaRequiredError("signed-ticket"));
    await signInAction(undefined, signInForm({ username: "alice", password: "pw" }));
    expect(jar.set).toHaveBeenCalledWith(MFA_COOKIE, "signed-ticket", expect.objectContaining({ secure: true }));
  });

  it("rethrows non-auth errors", async () => {
    const failure = new Error("db down");
    signIn.mockRejectedValueOnce(failure);
    await expect(signInAction(undefined, signInForm({ username: "alice", password: "pw" }))).rejects.toBe(failure);
  });
});

describe("verifyMfaAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(headers).mockResolvedValue(new Headers());
  });

  it("signs in with the ticket and code, clears the ticket, then lands on trips", async () => {
    const jar = cookieJar({ [MFA_COOKIE]: "signed-ticket" });
    await verifyMfaAction(undefined, signInForm({ code: "123456" }));
    expect(signIn).toHaveBeenCalledWith("credentials", {
      mfaTicket: "signed-ticket",
      code: "123456",
      remember: "false",
      redirect: false,
    });
    expect(jar.delete).toHaveBeenCalledWith(MFA_COOKIE);
    expect(redirect).toHaveBeenCalledWith("/trips");
  });

  it("passes on Don't ask for a code on this browser", async () => {
    cookieJar({ [MFA_COOKIE]: "signed-ticket" });
    await verifyMfaAction(undefined, signInForm({ code: "123456", remember: "on" }));
    expect(signIn).toHaveBeenCalledWith("credentials", expect.objectContaining({ remember: "true" }));
  });

  it("asks the user to start over when the ticket cookie is gone", async () => {
    cookieJar();
    await expect(verifyMfaAction(undefined, signInForm({ code: "123456" }))).resolves.toEqual({
      error: "Your sign-in timed out. Enter your username and password again.",
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

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

const { signIn, signOut, auth, identityRows, db, bootstrapFirstAccount, recordActivity } = vi.hoisted(() => {
  const identityRows = vi.fn();
  return {
    signIn: vi.fn(),
    signOut: vi.fn(),
    auth: vi.fn(),
    identityRows,
    db: { select: vi.fn(() => ({ from: () => ({ where: identityRows }) })) },
    bootstrapFirstAccount: vi.fn(),
    recordActivity: vi.fn(),
  };
});

vi.mock("@/lib/activity", () => ({ recordActivity }));

vi.mock("@/lib/instance-bootstrap", () => ({ bootstrapFirstAccount }));

vi.mock("@/auth", () => ({
  auth,
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

  function mockBootstrap(
    result: () => Promise<unknown> = async () => ({ ok: true, userId: "user-1", username: "test.user" })
  ) {
    bootstrapFirstAccount.mockImplementation(result);
    return bootstrapFirstAccount;
  }

  function signUpForm(fields: Record<string, string> = {}) {
    return signInForm({ username: " Test.User ", password: "password123", name: "Test User", ...fields });
  }

  it("stores a normalized username and locale-derived currency when signing up", async () => {
    vi.mocked(headers).mockResolvedValueOnce(new Headers({ "accept-language": "en-GB,en;q=0.9" }));
    mockBootstrap();

    await expect(signUpAction(undefined, signUpForm())).resolves.toBeUndefined();

    expect(bootstrapFirstAccount).toHaveBeenCalledWith(
      db,
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

  it("records the committed creation with the new ID before the automatic sign-in", async () => {
    mockBootstrap();

    await signUpAction(undefined, signUpForm());

    expect(recordActivity).toHaveBeenCalledTimes(1);
    expect(recordActivity).toHaveBeenCalledWith({
      type: "account_created",
      actor: { id: "user-1", username: "test.user" },
    });
    expect(recordActivity.mock.invocationCallOrder[0]).toBeLessThan(signIn.mock.invocationCallOrder[0]);
  });

  it("records no creation when sign-up is closed, invalid, taken or fails", async () => {
    mockBootstrap(async () => ({ ok: false, reason: "closed" }));
    await signUpAction(undefined, signUpForm());
    mockBootstrap(async () => {
      throw new Error("Failed query", { cause: { code: "23505" } });
    });
    await signUpAction(undefined, signUpForm());
    mockBootstrap(async () => {
      throw new Error("db down");
    });
    await signUpAction(undefined, signUpForm()).catch(() => undefined);
    await signUpAction(undefined, signUpForm({ password: "short" }));
    expect(recordActivity).not.toHaveBeenCalled();
  });

  it("rejects an invalid username without creating an account", async () => {
    mockBootstrap();

    await expect(signUpAction(undefined, signUpForm({ username: "a@b.com" }))).resolves.toEqual({
      error: "Use letters, numbers, dots, dashes or underscores, starting with a letter or number.",
    });
    expect(bootstrapFirstAccount).not.toHaveBeenCalled();
  });

  it("rejects a short password", async () => {
    mockBootstrap();

    await expect(signUpAction(undefined, signUpForm({ password: "short" }))).resolves.toEqual({
      error: "Password must be at least 8 characters.",
    });
    expect(bootstrapFirstAccount).not.toHaveBeenCalled();
  });

  it("reports a taken username", async () => {
    mockBootstrap(async () => {
      throw new Error("Failed query", { cause: { code: "23505" } });
    });

    await expect(signUpAction(undefined, signUpForm())).resolves.toEqual({ error: "That username is taken." });
    expect(signIn).not.toHaveBeenCalled();
  });

  it("rethrows other insert failures", async () => {
    mockBootstrap(async () => {
      throw new Error("db down");
    });

    await expect(signUpAction(undefined, signUpForm())).rejects.toThrow("db down");
  });

  it("refuses sign-up once the instance is initialized", async () => {
    mockBootstrap(async () => ({ ok: false, reason: "closed" }));

    await expect(signUpAction(undefined, signUpForm())).resolves.toEqual({
      error: "Ask an admin to create your account.",
    });
    expect(signIn).not.toHaveBeenCalled();
  });

  describe("signOutAction", () => {
    beforeEach(() => {
      auth.mockResolvedValue({ user: { id: "user-1" } });
      identityRows.mockResolvedValue([{ id: "user-1", username: "alice" }]);
      signOut.mockResolvedValue(undefined);
    });

    it("signs out without redirecting, records the canonical identity, then redirects", async () => {
      await signOutAction();
      expect(signOut).toHaveBeenCalledWith({ redirect: false });
      expect(recordActivity).toHaveBeenCalledTimes(1);
      expect(recordActivity).toHaveBeenCalledWith({
        type: "sign_out",
        actor: { id: "user-1", username: "alice" },
      });
      expect(signOut.mock.invocationCallOrder[0]).toBeLessThan(recordActivity.mock.invocationCallOrder[0]);
      expect(recordActivity.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(redirect).mock.invocationCallOrder[0]);
      expect(redirect).toHaveBeenCalledWith("/sign-in");
    });

    it("records nothing and does not redirect when sign-out fails", async () => {
      signOut.mockRejectedValue(new Error("session store down"));
      await expect(signOutAction()).rejects.toThrow("session store down");
      expect(recordActivity).not.toHaveBeenCalled();
      expect(redirect).not.toHaveBeenCalled();
    });

    it("still signs out, with an unavailable actor, when the identity lookup fails", async () => {
      identityRows.mockRejectedValue(new Error("db down"));
      await signOutAction();
      expect(signOut).toHaveBeenCalledWith({ redirect: false });
      expect(recordActivity).toHaveBeenCalledWith({ type: "sign_out", actor: null });
      expect(redirect).toHaveBeenCalledWith("/sign-in");
    });

    it("records an unavailable actor when the account row is gone", async () => {
      identityRows.mockResolvedValue([]);
      await signOutAction();
      expect(recordActivity).toHaveBeenCalledWith({ type: "sign_out", actor: null });
    });

    it("signs out but records nothing when nobody was signed in", async () => {
      auth.mockResolvedValue(null);
      await signOutAction();
      expect(identityRows).not.toHaveBeenCalled();
      expect(signOut).toHaveBeenCalledWith({ redirect: false });
      expect(recordActivity).not.toHaveBeenCalled();
      expect(redirect).toHaveBeenCalledWith("/sign-in");
    });
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

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

const { auth, signOut, select, signIn, db, resolveAccountSetupContext, completeAccountSetup, recordActivity, hash } =
  vi.hoisted(() => ({
    auth: vi.fn(),
    signOut: vi.fn(),
    select: vi.fn(),
    signIn: vi.fn(),
    db: { select: vi.fn() },
    resolveAccountSetupContext: vi.fn(),
    completeAccountSetup: vi.fn(),
    recordActivity: vi.fn(),
    hash: vi.fn(),
  }));

vi.mock("@/auth", () => ({ auth, signIn, signOut }));
vi.mock("@/db", () => ({ db }));
vi.mock("@/lib/activity", () => ({ recordActivity }));
vi.mock("@/lib/account-setup-completion", () => ({ completeAccountSetup }));
vi.mock("@/lib/account-setup-session", () => ({
  ACCOUNT_SETUP_COOKIE: "arrivo_account_setup",
  resolveAccountSetupContext,
}));
vi.mock("bcryptjs", () => ({ default: { hash } }));
vi.mock("next-auth", async () => ({ AuthError: (await import("@auth/core/errors")).AuthError }));

import { CredentialsSignin } from "@auth/core/errors";
import { completeAccountSetupAction, signOutAndContinueSetupAction } from "./actions";

const TOKEN = "t".repeat(43);

function form(fields: Record<string, string> = {}) {
  const formData = new FormData();
  const values = { name: "  Alex  ", password: "long-enough", confirmPassword: "long-enough", ...fields };
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

describe("completeAccountSetupAction", () => {
  let jar: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    jar = { get: vi.fn(() => ({ name: "arrivo_account_setup", value: TOKEN })), set: vi.fn() };
    vi.mocked(cookies).mockResolvedValue(jar as never);
    vi.mocked(headers).mockResolvedValue(new Headers());
    resolveAccountSetupContext.mockResolvedValue({
      status: "ready",
      account: { userId: "user-1", username: "pending.one" },
    });
    auth.mockResolvedValue(null);
    signOut.mockResolvedValue(undefined);
    db.select.mockReturnValue({ from: () => ({ where: select }) });
    select.mockResolvedValue([{ id: "other", username: "other.person" }]);
    hash.mockResolvedValue("hashed");
    completeAccountSetup.mockResolvedValue({ ok: true, userId: "user-1", username: "pending.one" });
    signIn.mockResolvedValue(undefined);
  });

  it.each([
    [{ name: "   " }, "Name is required.", "name"],
    [{ password: "short", confirmPassword: "short" }, "Password must be at least 8 characters.", "password"],
    [{ confirmPassword: "" }, "Confirm your password.", "confirmPassword"],
    [{ confirmPassword: "different-one" }, "Passwords do not match.", "confirmPassword"],
  ])("rejects invalid input %j without touching the database or bcrypt", async (fields, error, field) => {
    const result = await completeAccountSetupAction(undefined, form(fields));
    expect(result).toMatchObject({ error, field });
    expect(resolveAccountSetupContext).not.toHaveBeenCalled();
    expect(hash).not.toHaveBeenCalled();
    expect(completeAccountSetup).not.toHaveBeenCalled();
  });

  it("returns the trimmed name so the form keeps it", async () => {
    await expect(completeAccountSetupAction(undefined, form({ confirmPassword: "nope" }))).resolves.toMatchObject({
      name: "Alex",
    });
  });

  it("completes setup, clears the cookie, records Activity with identities only and signs in", async () => {
    await completeAccountSetupAction(undefined, form());
    expect(hash).toHaveBeenCalledWith("long-enough", 10);
    expect(completeAccountSetup).toHaveBeenCalledWith(db, { token: TOKEN, name: "Alex", passwordHash: "hashed" });
    expect(jar.set).toHaveBeenCalledWith("arrivo_account_setup", "", expect.objectContaining({ maxAge: 0 }));
    expect(recordActivity).toHaveBeenCalledWith({
      type: "setup_completed",
      actor: { id: "user-1", username: "pending.one" },
    });
    const signInForm = signIn.mock.calls[0][1] as FormData;
    expect(signIn.mock.calls[0][0]).toBe("credentials");
    expect(signInForm.get("username")).toBe("pending.one");
    expect(signInForm.get("password")).toBe("long-enough");
    expect(signInForm.get("redirectTo")).toBe("/trips");
    expect(signInForm.get("keepSignedIn")).toBe("true");
  });

  it("redirects to the unavailable page when the context is not ready, before any bcrypt", async () => {
    resolveAccountSetupContext.mockResolvedValue({ status: "unavailable" });
    await completeAccountSetupAction(undefined, form());
    expect(redirect).toHaveBeenCalledWith("/account-setup");
    expect(jar.set).toHaveBeenCalledWith("arrivo_account_setup", "", expect.objectContaining({ maxAge: 0 }));
    expect(hash).not.toHaveBeenCalled();
    expect(completeAccountSetup).not.toHaveBeenCalled();
  });

  it("redirects to the unavailable page without a cookie", async () => {
    jar.get.mockReturnValue(undefined);
    await completeAccountSetupAction(undefined, form());
    expect(redirect).toHaveBeenCalledWith("/account-setup");
    expect(completeAccountSetup).not.toHaveBeenCalled();
  });

  it("redirects to the unavailable page when completion loses the race, with no Activity or sign-in", async () => {
    completeAccountSetup.mockResolvedValue({ ok: false, reason: "unavailable" });
    await completeAccountSetupAction(undefined, form());
    expect(redirect).toHaveBeenCalledWith("/account-setup");
    expect(recordActivity).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("keeps the link and cookie on a retryable conflict and asks to try again", async () => {
    completeAccountSetup.mockResolvedValue({ ok: false, reason: "retry" });
    const state = await completeAccountSetupAction(undefined, form());
    expect(state).toMatchObject({ error: "Something went wrong. Try again.", field: "password" });
    expect(redirect).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("sends the person to sign-in when sign-in is refused after commit", async () => {
    signIn.mockRejectedValue(new CredentialsSignin());
    await completeAccountSetupAction(undefined, form());
    expect(recordActivity).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });

  it("rethrows other sign-in failures, including the framework redirect", async () => {
    const redirectSignal = new Error("NEXT_REDIRECT");
    signIn.mockRejectedValue(redirectSignal);
    await expect(completeAccountSetupAction(undefined, form())).rejects.toBe(redirectSignal);
  });

  it("marks the cookie Secure over https", async () => {
    vi.mocked(headers).mockResolvedValue(new Headers({ "x-forwarded-proto": "https" }));
    await completeAccountSetupAction(undefined, form());
    expect(jar.set).toHaveBeenCalledWith("arrivo_account_setup", "", expect.objectContaining({ secure: true }));
  });
  it("blocks another account before bcrypt or writes and keeps context", async () => {
    auth.mockResolvedValue({ user: { id: "other" } });
    await completeAccountSetupAction(undefined, form());
    expect(redirect).toHaveBeenCalledWith("/account-setup");
    expect(hash).not.toHaveBeenCalled();
    expect(completeAccountSetup).not.toHaveBeenCalled();
    expect(signIn).not.toHaveBeenCalled();
    expect(jar.set).not.toHaveBeenCalled();
  });
  it("allows same-account completion", async () => {
    auth.mockResolvedValue({ user: { id: "user-1" } });
    await completeAccountSetupAction(undefined, form());
    expect(completeAccountSetup).toHaveBeenCalled();
  });
  it("explicitly logs out with canonical identity Activity and unchanged setup cookie", async () => {
    auth.mockResolvedValue({ user: { id: "other" } });
    await signOutAndContinueSetupAction(undefined, new FormData());
    expect(signOut).toHaveBeenCalledWith({ redirect: false });
    expect(recordActivity).toHaveBeenCalledWith({ type: "sign_out", actor: { id: "other", username: "other.person" } });
    expect(jar.set).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/account-setup");
  });
  it.each(["missing", "unavailable"])("refuses %s context before logout", async (kind) => {
    if (kind === "missing") jar.get.mockReturnValue(undefined);
    else resolveAccountSetupContext.mockResolvedValue({ status: "unavailable" });
    await signOutAndContinueSetupAction(undefined, new FormData());
    expect(signOut).not.toHaveBeenCalled();
    expect(jar.set).toHaveBeenCalledWith("arrivo_account_setup", "", expect.objectContaining({ maxAge: 0 }));
  });
  it("retains context and returns retry alert on logout failure", async () => {
    signOut.mockRejectedValue(new Error("failed"));
    expect(await signOutAndContinueSetupAction(undefined, new FormData())).toEqual({
      error: "Could not sign out. Try again.",
    });
    expect(recordActivity).not.toHaveBeenCalled();
    expect(jar.set).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });
  it("logs out despite unavailable identity", async () => {
    auth.mockResolvedValue({ user: { id: "other" } });
    select.mockRejectedValue(new Error("failed"));
    await signOutAndContinueSetupAction(undefined, new FormData());
    expect(recordActivity).toHaveBeenCalledWith({ type: "sign_out", actor: null });
  });
  it("skips logout Activity for anonymous requests", async () => {
    await signOutAndContinueSetupAction(undefined, new FormData());
    expect(recordActivity).not.toHaveBeenCalled();
  });
  it("rethrows destination redirect", async () => {
    const signal = new Error("NEXT_REDIRECT");
    vi.mocked(redirect).mockImplementationOnce(() => {
      throw signal;
    });
    await expect(signOutAndContinueSetupAction(undefined, new FormData())).rejects.toBe(signal);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
const { auth, resolveAccountSetupContext, loadPolicy } = vi.hoisted(() => ({
  auth: vi.fn(),
  resolveAccountSetupContext: vi.fn(),
  loadPolicy: vi.fn(),
}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/password-policy-store", () => ({ loadPasswordPolicy: loadPolicy }));
vi.mock("@/auth", () => ({ auth }));
vi.mock("./actions", () => ({ completeAccountSetupAction: vi.fn(), signOutAndContinueSetupAction: vi.fn() }));
vi.mock("@/lib/account-setup-session", () => ({ ACCOUNT_SETUP_COOKIE: "setup", resolveAccountSetupContext }));
vi.mock("@/components/arrivo/account-setup-dialog", () => ({
  AccountSetupDialog: ({ username, policy }: { username: string; policy: { minLength: number } }) => (
    <div role="dialog">
      {username} min:{policy.minLength}
    </div>
  ),
}));
vi.mock("@/components/arrivo/account-setup-sign-out", () => ({
  AccountSetupSignOut: () => <h1>Sign out to continue setup.</h1>,
}));
import AccountSetupPage from "./page";
import { DEFAULT_PASSWORD_POLICY } from "@/data/types";
describe("AccountSetupPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.mockResolvedValue(null);
    loadPolicy.mockResolvedValue(DEFAULT_PASSWORD_POLICY);
    vi.mocked(cookies).mockResolvedValue({ get: () => ({ value: "held-token" }) } as never);
    resolveAccountSetupContext.mockResolvedValue({
      status: "ready",
      account: { userId: "pending", username: "pending.person" },
    });
  });
  it.each([null, { user: { id: "pending" } }])("shows setup for anonymous or same account %j", async (session) => {
    auth.mockResolvedValue(session);
    render(await AccountSetupPage());
    expect(screen.getByRole("dialog")).toHaveTextContent("pending.person");
  });
  it("passes the current rules to the dialog", async () => {
    render(await AccountSetupPage());
    expect(screen.getByRole("dialog")).toHaveTextContent("min:8");
  });
  it("says the rules are unavailable, without the dialog, when they cannot be read", async () => {
    loadPolicy.mockResolvedValue(undefined);
    render(await AccountSetupPage());
    expect(screen.getByRole("alert")).toHaveTextContent("Password rules are unavailable");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("does not read the rules for another account or an unusable link", async () => {
    auth.mockResolvedValue({ user: { id: "other" } });
    await AccountSetupPage();
    resolveAccountSetupContext.mockResolvedValue({ status: "unavailable" });
    await AccountSetupPage();
    expect(loadPolicy).not.toHaveBeenCalled();
  });
  it("shows only sign-out prompt to another account", async () => {
    auth.mockResolvedValue({ user: { id: "other" } });
    render(await AccountSetupPage());
    expect(screen.getByRole("heading")).toHaveTextContent("Sign out to continue setup.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("cleans stale context before checking identity", async () => {
    resolveAccountSetupContext.mockResolvedValue({ status: "unavailable" });
    await AccountSetupPage();
    expect(redirect).toHaveBeenCalledWith("/account-setup/open");
    expect(auth).not.toHaveBeenCalled();
  });
  it("shows generic unavailable page without context", async () => {
    vi.mocked(cookies).mockResolvedValue({ get: () => undefined } as never);
    resolveAccountSetupContext.mockResolvedValue({ status: "unavailable" });
    render(await AccountSetupPage());
    expect(screen.getByRole("heading")).toHaveTextContent("Setup link unavailable");
    expect(auth).not.toHaveBeenCalled();
  });
});

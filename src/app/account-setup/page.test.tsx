import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
const { auth, resolveAccountSetupContext } = vi.hoisted(() => ({ auth: vi.fn(), resolveAccountSetupContext: vi.fn() }));
vi.mock("@/auth", () => ({ auth }));
vi.mock("./actions", () => ({ completeAccountSetupAction: vi.fn(), signOutAndContinueSetupAction: vi.fn() }));
vi.mock("@/lib/account-setup-session", () => ({ ACCOUNT_SETUP_COOKIE: "setup", resolveAccountSetupContext }));
vi.mock("@/components/arrivo/account-setup-dialog", () => ({
  AccountSetupDialog: ({ username }: { username: string }) => <div role="dialog">{username}</div>,
}));
vi.mock("@/components/arrivo/account-setup-sign-out", () => ({
  AccountSetupSignOut: () => <h1>Sign out to continue setup.</h1>,
}));
import AccountSetupPage from "./page";
describe("AccountSetupPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.mockResolvedValue(null);
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

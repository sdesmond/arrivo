import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
const { isAppSetupOpen, loadPolicy } = vi.hoisted(() => ({ isAppSetupOpen: vi.fn(), loadPolicy: vi.fn() }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/password-policy-store", () => ({ loadPasswordPolicy: loadPolicy }));
vi.mock("@/lib/app-setup", () => ({ isAppSetupOpen }));
vi.mock("../actions", () => ({ setupAdminAction: vi.fn(), signInAction: vi.fn(), verifyMfaAction: vi.fn() }));
vi.mock("@/components/arrivo/auth-forms", () => ({
  AdminSetupForm: () => <div>Admin setup form</div>,
  SignInForm: () => <div>Sign in form</div>,
}));
import SetupPage from "./page";
import { DEFAULT_PASSWORD_POLICY } from "@/data/types";
describe("SetupPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(redirect).mockReset();
    loadPolicy.mockResolvedValue(DEFAULT_PASSWORD_POLICY);
  });
  it("renders eligible page", async () => {
    isAppSetupOpen.mockResolvedValue(true);
    render(await SetupPage());
    expect(screen.getByRole("heading", { name: "Welcome to Arrivo!" })).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });
  it("renders the form with the stored rules", async () => {
    isAppSetupOpen.mockResolvedValue(true);
    render(await SetupPage());
    expect(screen.getByText("Admin setup form")).toBeInTheDocument();
  });
  it("says the rules are unavailable instead of rendering the form when they cannot be read", async () => {
    isAppSetupOpen.mockResolvedValue(true);
    loadPolicy.mockResolvedValue(undefined);
    render(await SetupPage());
    expect(screen.getByRole("alert")).toHaveTextContent("Password rules are unavailable");
    expect(screen.queryByText("Admin setup form")).not.toBeInTheDocument();
  });
  it("does not read the rules once setup is closed", async () => {
    isAppSetupOpen.mockResolvedValue(false);
    await SetupPage();
    expect(loadPolicy).not.toHaveBeenCalled();
  });
  it("returns immediately after guarded redirect with nonthrowing mocks", async () => {
    isAppSetupOpen.mockResolvedValue(false);
    expect(await SetupPage()).toBeUndefined();
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });
  it("propagates read failure without rendering", async () => {
    isAppSetupOpen.mockRejectedValue(new Error("db down"));
    await expect(SetupPage()).rejects.toThrow("db down");
    expect(redirect).not.toHaveBeenCalled();
  });
});

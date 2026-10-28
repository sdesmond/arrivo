import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
const { isInstanceSetupOpen } = vi.hoisted(() => ({ isInstanceSetupOpen: vi.fn() }));
vi.mock("@/lib/instance-setup", () => ({ isInstanceSetupOpen }));
vi.mock("../actions", () => ({ setupAdminAction: vi.fn(), signInAction: vi.fn(), verifyMfaAction: vi.fn() }));
vi.mock("@/components/arrivo/auth-forms", () => ({
  AdminSetupForm: () => <div>Admin setup form</div>,
  SignInForm: () => <div>Sign in form</div>,
}));
import SetupPage from "./page";
describe("SetupPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(redirect).mockReset();
  });
  it("renders eligible page", async () => {
    isInstanceSetupOpen.mockResolvedValue(true);
    render(await SetupPage());
    expect(screen.getByRole("heading", { name: "Welcome to Arrivo!" })).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });
  it("returns immediately after guarded redirect with nonthrowing mocks", async () => {
    isInstanceSetupOpen.mockResolvedValue(false);
    expect(await SetupPage()).toBeUndefined();
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });
  it("propagates read failure without rendering", async () => {
    isInstanceSetupOpen.mockRejectedValue(new Error("db down"));
    await expect(SetupPage()).rejects.toThrow("db down");
    expect(redirect).not.toHaveBeenCalled();
  });
});

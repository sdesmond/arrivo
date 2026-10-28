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
import SignInPage from "./page";
describe("SignInPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(redirect).mockReset();
  });
  it("renders eligible page", async () => {
    isInstanceSetupOpen.mockResolvedValue(false);
    render(await SignInPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(redirect).not.toHaveBeenCalled();
  });
  it("returns immediately after guarded redirect with nonthrowing mocks", async () => {
    isInstanceSetupOpen.mockResolvedValue(true);
    expect(await SignInPage({ searchParams: Promise.resolve({}) })).toBeUndefined();
    expect(redirect).toHaveBeenCalledWith("/setup");
  });
  it("propagates read failure without rendering", async () => {
    isInstanceSetupOpen.mockRejectedValue(new Error("db down"));
    await expect(SignInPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("db down");
    expect(redirect).not.toHaveBeenCalled();
  });
});

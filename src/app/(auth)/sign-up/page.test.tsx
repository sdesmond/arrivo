import { beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
const { isAppSetupOpen } = vi.hoisted(() => ({ isAppSetupOpen: vi.fn() }));
vi.mock("@/lib/app-setup", () => ({ isAppSetupOpen }));
vi.mock("../actions", () => ({ setupAdminAction: vi.fn(), signInAction: vi.fn(), verifyMfaAction: vi.fn() }));
vi.mock("@/components/arrivo/auth-forms", () => ({
  AdminSetupForm: () => <div>Admin setup form</div>,
  SignInForm: () => <div>Sign in form</div>,
}));
import SignUpPage from "./page";
describe("SignUpPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(redirect).mockReset();
  });
  it.each([
    [true, "/setup"],
    [false, "/sign-in"],
  ])("redirects fresh=%s", async (fresh, destination) => {
    isAppSetupOpen.mockResolvedValue(fresh);
    expect(await SignUpPage()).toBeUndefined();
    expect(redirect).toHaveBeenCalledWith(destination);
  });
  it("propagates read failure without rendering", async () => {
    isAppSetupOpen.mockRejectedValue(new Error("db down"));
    await expect(SignUpPage()).rejects.toThrow("db down");
    expect(redirect).not.toHaveBeenCalled();
  });
});

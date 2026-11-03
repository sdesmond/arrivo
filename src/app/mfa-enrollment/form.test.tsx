import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
const mocks = vi.hoisted(() => ({ signOut: vi.fn(), push: vi.fn() }));
vi.mock("@/app/(auth)/actions", () => ({ signOutAction: mocks.signOut }));
vi.mock("@/app/(app)/profile/mfa-enrollment", () => ({
  MfaEnrollment: ({ onEnrolled }: { onEnrolled: (codes: string[]) => void }) => (
    <button onClick={() => onEnrolled(["recovery-code"])}>Set up two-factor authentication</button>
  ),
}));
vi.mock("@/app/(app)/profile/recovery-codes-dialog", () => ({
  RecoveryCodesDialog: ({ codes, onDone }: { codes: string[] | null; onDone: () => void }) =>
    codes ? <button onClick={onDone}>I saved these</button> : null,
}));
import * as navigation from "next/navigation";
import { MfaEnrollmentForm } from "./form";
vi.spyOn(navigation, "useRouter").mockReturnValue({ ...navigation.useRouter(), push: mocks.push });
describe("mandatory enrollment form", () => {
  it("waits for code acknowledgement before fresh sign-in", async () => {
    render(<MfaEnrollmentForm />);
    await userEvent.click(screen.getByRole("button", { name: "Set up two-factor authentication" }));
    expect(mocks.push).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText("I saved these"));
    expect(mocks.push).toHaveBeenCalledWith("/sign-in?notice=mfa-enabled");
  });
  it("can sign out without app access", async () => {
    render(<MfaEnrollmentForm />);
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(mocks.signOut).toHaveBeenCalledWith();
  });
});

it("shows Arrivo branding and enrollment copy in a centered auth card", () => {
  render(<MfaEnrollmentForm />);
  expect(screen.getByRole("img", { name: "Arrivo" })).toBeVisible();
  expect(screen.getByRole("main")).toHaveClass("min-h-screen", "items-center", "justify-center");
  const heading = screen.getByRole("heading", { name: "Set up two-factor authentication", level: 1 });
  expect(heading).toBeVisible();
  expect(
    screen.getByText("Two-factor authentication is required for your account. Set it up before continuing to Arrivo.")
  ).toBeVisible();
  expect(screen.getByRole("region", { name: "Set up two-factor authentication" })).toHaveClass("rounded-2xl");
  expect(screen.getByRole("button", { name: "Set up two-factor authentication" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
});

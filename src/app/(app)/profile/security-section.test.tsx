import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  disableMfa: vi.fn(),
  regenerateRecoveryCodes: vi.fn(),
  signOutEverywhere: vi.fn(),
  forgetTrustedDevice: vi.fn(),
}));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock("./security-actions", () => mocks);
vi.mock("next/navigation", () => ({ useRouter: () => router }));

vi.mock("./mfa-enrollment", () => ({
  MfaEnrollment: ({ onEnrolled }: { onEnrolled: (codes: string[]) => void }) => (
    <button onClick={() => onEnrolled(["aaaaa-bbbbb"])}>Finish enrollment</button>
  ),
}));

vi.mock("./recovery-codes-dialog", () => ({
  RecoveryCodesDialog: ({ codes, onDone }: { codes: string[] | null; onDone: () => void }) =>
    codes ? (
      <div>
        <span>Codes: {codes.join(",")}</span>
        <button onClick={onDone}>I saved these</button>
      </div>
    ) : null,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({
    children,
    open,
    onOpenChange,
  }: {
    children: React.ReactNode;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }) =>
    open ? (
      <div role="dialog">
        {children}
        <button onClick={() => onOpenChange(false)}>Escape</button>
      </div>
    ) : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { ProfileSecuritySection } from "./security-section";

const ON = { enabled: true, enabledAt: "2026-10-01T12:00:00.000Z", recoveryCodesRemaining: 1 };
const OFF = { enabled: false, recoveryCodesRemaining: 0 };

async function openDialog(name: string) {
  const user = userEvent.setup();
  render(<ProfileSecuritySection status={ON} devices={[]} />);
  await user.click(screen.getByRole("button", { name }));
  return user;
}

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>, submitName: string) {
  await user.type(screen.getByLabelText("Current password"), "pw");
  await user.type(screen.getByLabelText("Code from your app or a recovery code"), "123456");
  await user.click(screen.getByRole("button", { name: submitName }));
}

describe("ProfileSecuritySection", () => {
  beforeEach(() => vi.clearAllMocks());

  it("describes the off state in text and offers setup", () => {
    render(<ProfileSecuritySection status={OFF} devices={[]} />);
    expect(screen.getByText("Two-factor authentication is off.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finish enrollment" })).toBeInTheDocument();
  });

  it("describes the on state with its date and remaining codes", () => {
    render(<ProfileSecuritySection status={ON} devices={[]} />);
    expect(screen.getByText(/is on \(since Oct 1, 2026\)\. 1 recovery code left\./)).toBeInTheDocument();
  });

  it("pluralizes remaining codes and tolerates a missing date", () => {
    render(<ProfileSecuritySection status={{ enabled: true, recoveryCodesRemaining: 4 }} devices={[]} />);
    expect(screen.getByText(/is on\. 4 recovery codes left\./)).toBeInTheDocument();
  });

  it("shows codes after enrollment, then signs in again once saved", async () => {
    const user = userEvent.setup();
    render(<ProfileSecuritySection status={OFF} devices={[]} />);
    await user.click(screen.getByRole("button", { name: "Finish enrollment" }));
    expect(screen.getByText("Codes: aaaaa-bbbbb")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "I saved these" }));
    expect(router.push).toHaveBeenCalledWith("/sign-in?notice=mfa-enabled");
  });

  it("regenerates recovery codes after password and code", async () => {
    mocks.regenerateRecoveryCodes.mockResolvedValue({ recoveryCodes: ["ccccc-ddddd"] });
    const user = await openDialog("Regenerate recovery codes");
    expect(screen.getByLabelText("Current password")).toHaveFocus();
    await fillAndSubmit(user, "Regenerate codes");

    expect(mocks.regenerateRecoveryCodes).toHaveBeenCalledWith({ password: "pw", code: "123456" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Codes: ccccc-ddddd")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "I saved these" }));
    expect(router.push).not.toHaveBeenCalled();
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it("shows a regenerate error inside the dialog", async () => {
    mocks.regenerateRecoveryCodes.mockResolvedValue({ error: "Password or code is incorrect." });
    const user = await openDialog("Regenerate recovery codes");
    await fillAndSubmit(user, "Regenerate codes");
    expect(screen.getByRole("alert")).toHaveTextContent("Password or code is incorrect.");
    expect(screen.getByLabelText("Code from your app or a recovery code")).toHaveAttribute("aria-invalid", "true");
  });

  it("turns two-factor off after password and code", async () => {
    mocks.disableMfa.mockResolvedValue({});
    const user = await openDialog("Turn off two-factor authentication");
    expect(screen.getByRole("heading", { name: "Turn off two-factor authentication?" })).toBeInTheDocument();
    await fillAndSubmit(user, "Turn off");
    expect(mocks.disableMfa).toHaveBeenCalledWith({ password: "pw", code: "123456" });
  });

  it("shows a disable error inside the dialog", async () => {
    mocks.disableMfa.mockResolvedValue({ error: "Too many attempts. Try again later." });
    const user = await openDialog("Turn off two-factor authentication");
    await fillAndSubmit(user, "Turn off");
    expect(screen.getByRole("alert")).toHaveTextContent("Too many attempts");
  });

  it("keeps submit disabled until both fields are filled", async () => {
    await openDialog("Turn off two-factor authentication");
    expect(screen.getByRole("button", { name: "Turn off" })).toBeDisabled();
  });

  it("returns focus to the trigger when the dialog is cancelled or dismissed", async () => {
    const user = await openDialog("Turn off two-factor authentication");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(screen.getByRole("button", { name: "Turn off two-factor authentication" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Regenerate recovery codes" }));
    await user.click(screen.getByRole("button", { name: "Escape" }));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(screen.getByRole("button", { name: "Regenerate recovery codes" })).toHaveFocus();
  });

  it("lists remembered browsers", () => {
    render(
      <ProfileSecuritySection
        status={OFF}
        devices={[
          { id: "device-1", label: "Firefox on Linux", lastUsedAt: "2026-10-21T12:00:00.000Z", isCurrent: true },
        ]}
      />
    );
    expect(screen.getByRole("list", { name: "Remembered browsers" })).toHaveTextContent("Firefox on Linux");
  });

  it("signs out all devices", async () => {
    const user = userEvent.setup();
    render(<ProfileSecuritySection status={OFF} devices={[]} />);
    await user.click(screen.getByRole("button", { name: "Sign out all devices" }));
    expect(mocks.signOutEverywhere).toHaveBeenCalledOnce();
  });
});

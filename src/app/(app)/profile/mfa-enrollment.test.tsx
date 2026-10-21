import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  startMfaEnrollment: vi.fn(),
  confirmMfaEnrollment: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("./security-actions", () => ({
  startMfaEnrollment: mocks.startMfaEnrollment,
  confirmMfaEnrollment: mocks.confirmMfaEnrollment,
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));

import { MfaEnrollment } from "./mfa-enrollment";

const SETUP = { secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", qrDataUrl: "data:image/png;base64,QR" };

async function openSetup() {
  const user = userEvent.setup();
  const onEnrolled = vi.fn();
  mocks.startMfaEnrollment.mockResolvedValue(SETUP);
  render(<MfaEnrollment onEnrolled={onEnrolled} />);
  await user.click(screen.getByRole("button", { name: "Set up two-factor authentication" }));
  return { user, onEnrolled };
}

describe("MfaEnrollment", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the QR code with alt text, the manual key and a labeled code field", async () => {
    await openSetup();
    expect(screen.getByAltText("QR code for your authenticator app")).toHaveAttribute("src", SETUP.qrDataUrl);
    expect(screen.getByTestId("mfa-setup-key")).toHaveTextContent(SETUP.secret);
    expect(screen.getByLabelText("Code from your app")).toHaveFocus();
  });

  it("shows an error when setup can't start", async () => {
    const user = userEvent.setup();
    mocks.startMfaEnrollment.mockResolvedValue({ error: "Two-factor authentication is already on." });
    render(<MfaEnrollment onEnrolled={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Set up two-factor authentication" }));
    expect(screen.getByRole("alert")).toHaveTextContent("already on");
  });

  it("keeps Turn on disabled until six characters are entered", async () => {
    const { user } = await openSetup();
    const turnOn = screen.getByRole("button", { name: "Turn on" });
    expect(turnOn).toBeDisabled();
    await user.type(screen.getByLabelText("Code from your app"), "123456");
    expect(turnOn).toBeEnabled();
  });

  it("accepts a pasted code with a space", async () => {
    const { user } = await openSetup();
    mocks.confirmMfaEnrollment.mockResolvedValue({ recoveryCodes: ["aaaaa-bbbbb"] });
    await user.type(screen.getByLabelText("Code from your app"), "123 456");
    const turnOn = screen.getByRole("button", { name: "Turn on" });
    expect(turnOn).toBeEnabled();
    await user.click(turnOn);
    expect(mocks.confirmMfaEnrollment).toHaveBeenCalledWith("123 456");
  });

  it("keeps Turn on disabled for anything but six digits", async () => {
    const { user } = await openSetup();
    await user.type(screen.getByLabelText("Code from your app"), "12345a");
    expect(screen.getByRole("button", { name: "Turn on" })).toBeDisabled();
  });

  it("reports a wrong code inline", async () => {
    const { user, onEnrolled } = await openSetup();
    mocks.confirmMfaEnrollment.mockResolvedValue({ error: "That code didn't work." });
    await user.type(screen.getByLabelText("Code from your app"), "000000");
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    expect(screen.getByRole("alert")).toHaveTextContent("That code didn't work.");
    expect(screen.getByLabelText("Code from your app")).toHaveAttribute("aria-invalid", "true");
    expect(onEnrolled).not.toHaveBeenCalled();
  });

  it("hands the recovery codes up once the code is accepted", async () => {
    const { user, onEnrolled } = await openSetup();
    mocks.confirmMfaEnrollment.mockResolvedValue({ recoveryCodes: ["aaaaa-bbbbb"] });
    await user.type(screen.getByLabelText("Code from your app"), "123456");
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    expect(mocks.confirmMfaEnrollment).toHaveBeenCalledWith("123456");
    expect(onEnrolled).toHaveBeenCalledWith(["aaaaa-bbbbb"]);
  });

  it("falls back to a generic error when confirm returns nothing useful", async () => {
    const { user } = await openSetup();
    mocks.confirmMfaEnrollment.mockResolvedValue({});
    await user.type(screen.getByLabelText("Code from your app"), "123456");
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong.");
  });

  it("copies the setup key", async () => {
    const { user } = await openSetup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    await user.click(screen.getByRole("button", { name: "Copy key" }));
    expect(writeText).toHaveBeenCalledWith(SETUP.secret);
    expect(mocks.toast.success).toHaveBeenCalled();
  });

  it("tells the user when copying the key fails", async () => {
    const { user } = await openSetup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    await user.click(screen.getByRole("button", { name: "Copy key" }));
    expect(mocks.toast.error).toHaveBeenCalled();
  });

  it("cancels back to the start button", async () => {
    const { user } = await openSetup();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Set up two-factor authentication" })).toBeInTheDocument();
    expect(screen.queryByAltText("QR code for your authenticator app")).not.toBeInTheDocument();
  });
});

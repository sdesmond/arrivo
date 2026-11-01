import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AdminRecoveryForm } from "./form";

const PROPS = { secret: "JBSWY3DPEHPK3PXP", qrDataUrl: "data:image/png;base64,AAAA" };

describe("AdminRecoveryForm", () => {
  it("labels every field, gives the QR alt text and offers the setup key", () => {
    render(<AdminRecoveryForm action={vi.fn()} {...PROPS} />);
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText("Code from your app")).toHaveAttribute("autocomplete", "one-time-code");
    expect(screen.getByAltText("QR code for your authenticator app")).toBeVisible();
    expect(screen.getByTestId("recovery-setup-key")).toHaveTextContent(PROPS.secret);
    expect(screen.getByRole("button", { name: "Copy key" })).toHaveAttribute("title", "Copy key");
    expect(screen.getByRole("button", { name: "Recover account" })).toBeVisible();
  });

  it.each([
    ["password", "Password"],
    ["confirmPassword", "Confirm password"],
    ["code", "Code from your app"],
  ] as const)("shows an alert and focuses the %s field on error", async (field, label) => {
    const action = vi.fn().mockResolvedValue({ error: "Something is wrong.", field });
    render(<AdminRecoveryForm action={action} {...PROPS} />);
    await userEvent.click(screen.getByRole("button", { name: "Recover account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Something is wrong.");
    await waitFor(() => expect(screen.getByLabelText(label, { exact: true })).toHaveFocus());
    expect(screen.getByLabelText(label, { exact: true })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(label, { exact: true })).toHaveAttribute("aria-describedby", "recovery-error");
  });

  it("swaps to the recovery codes, focused on their heading, once the action returns them", async () => {
    const action = vi.fn().mockResolvedValue({ recoveryCodes: ["aaaaa-bbbbb", "ccccc-ddddd"] });
    render(<AdminRecoveryForm action={action} {...PROPS} />);
    await userEvent.click(screen.getByRole("button", { name: "Recover account" }));
    const heading = await screen.findByRole("heading", { name: "Save your recovery codes" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByRole("list", { name: "Recovery codes" })).toHaveTextContent("aaaaa-bbbbb");
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });

  it("copies the setup key", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<AdminRecoveryForm action={vi.fn()} {...PROPS} />);
    await userEvent.click(screen.getByRole("button", { name: "Copy key" }));
    expect(writeText).toHaveBeenCalledWith(PROPS.secret);
  });

  it("survives a refused clipboard", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    render(<AdminRecoveryForm action={vi.fn()} {...PROPS} />);
    await userEvent.click(screen.getByRole("button", { name: "Copy key" }));
    expect(screen.getByRole("button", { name: "Recover account" })).toBeVisible();
  });
});

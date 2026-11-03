import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PASSWORD_POLICY, type PasswordPolicy } from "@/data/types";
import { PasswordResetForm } from "./form";

const strict: PasswordPolicy = { ...DEFAULT_PASSWORD_POLICY, minUppercase: 1, minNumbers: 1 };

describe("PasswordResetForm", () => {
  it("labels password fields and allows password manager filling", () => {
    render(<PasswordResetForm action={vi.fn()} policy={DEFAULT_PASSWORD_POLICY} />);
    expect(screen.getByLabelText("Password", { exact: true })).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByRole("button", { name: "Reset password" })).toBeVisible();
  });

  it("sets no native length constraint on the password field", () => {
    render(<PasswordResetForm action={vi.fn()} policy={DEFAULT_PASSWORD_POLICY} />);
    expect(screen.getByLabelText("Password", { exact: true })).not.toHaveAttribute("minlength");
    expect(screen.getByLabelText("Password", { exact: true })).not.toHaveAttribute("maxlength");
  });

  it("lists the active requirements before typing and links them to the password field", () => {
    render(<PasswordResetForm action={vi.fn()} policy={strict} />);
    const list = screen.getByRole("list");
    expect(list).toHaveTextContent("8 to 20 characters");
    expect(list).toHaveTextContent("At least 1 uppercase letter");
    expect(list).toHaveTextContent("At least 1 number");
    expect(list.querySelector("svg")).toBeNull();
    expect(screen.getByLabelText("Password", { exact: true })).toHaveAttribute(
      "aria-describedby",
      expect.stringContaining(list.id)
    );
  });

  it("omits disabled classes", () => {
    render(<PasswordResetForm action={vi.fn()} policy={DEFAULT_PASSWORD_POLICY} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("checks and unchecks requirements live without ever showing an X", async () => {
    const user = userEvent.setup();
    const { container } = render(<PasswordResetForm action={vi.fn()} policy={strict} />);
    const field = screen.getByLabelText("Password", { exact: true });
    await user.type(field, "Abcdefg1");
    expect(screen.getByRole("list").querySelectorAll("svg")).toHaveLength(3);
    await user.type(field, "{Backspace}");
    expect(screen.getByRole("list").querySelectorAll("svg")).toHaveLength(1);
    expect(container.querySelector(".lucide-x, .lucide-circle-x")).toBeNull();
  });

  it("makes no requests while typing", async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    render(<PasswordResetForm action={action} policy={strict} />);
    await user.type(screen.getByLabelText("Password", { exact: true }), "Abcdefg1");
    expect(action).not.toHaveBeenCalled();
  });

  it("submits even when the local checklist is unmet, since the server decides", async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue(undefined);
    render(<PasswordResetForm action={action} policy={strict} />);
    await user.type(screen.getByLabelText("Password", { exact: true }), "abc");
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await waitFor(() => expect(action).toHaveBeenCalled());
  });

  it("shows an alert and focuses the password field when the server rejects it, refreshing the rules", async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({
      error: "Password must be 12 to 20 characters.",
      field: "password",
      policy: { ...DEFAULT_PASSWORD_POLICY, minLength: 12 },
    });
    render(<PasswordResetForm action={action} policy={DEFAULT_PASSWORD_POLICY} />);
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Password must be 12 to 20 characters.");
    await waitFor(() => expect(screen.getByLabelText("Password", { exact: true })).toHaveFocus());
    expect(screen.getByLabelText("Password", { exact: true })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("list")).toHaveTextContent("12 to 20 characters");
  });

  it("focuses the confirmation when that is what failed", async () => {
    const user = userEvent.setup();
    const action = vi.fn().mockResolvedValue({ error: "Passwords do not match.", field: "confirmPassword" });
    render(<PasswordResetForm action={action} policy={DEFAULT_PASSWORD_POLICY} />);
    await user.click(screen.getByRole("button", { name: "Reset password" }));
    await waitFor(() => expect(screen.getByLabelText("Confirm password")).toHaveFocus());
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute("aria-describedby", "reset-error");
  });
});

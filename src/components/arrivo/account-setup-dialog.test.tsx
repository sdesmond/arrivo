import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AccountSetupActionState } from "@/data/types";
import { AccountSetupDialog } from "./account-setup-dialog";

const noop = async (): Promise<AccountSetupActionState> => undefined;

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Name"), "Alex");
  await user.type(screen.getByLabelText("Password"), "long-enough");
  await user.type(screen.getByLabelText("Confirm password"), "long-enough");
  await user.click(screen.getByRole("button", { name: "Save and continue" }));
}

describe("AccountSetupDialog", () => {
  it("shows the username as read-only text, not an input", () => {
    render(<AccountSetupDialog username="pending-person" action={noop} />);
    const dialog = screen.getByRole("dialog", { name: "Set up your account" });
    expect(dialog).toHaveTextContent("pending-person");
    expect(screen.queryByRole("textbox", { name: /username/i })).not.toBeInTheDocument();
  });

  it("offers Name, Password and Confirm password fields and a save button", () => {
    render(<AccountSetupDialog username="pending-person" action={noop} />);
    expect(screen.getByLabelText("Name")).toBeRequired();
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Save and continue" })).toBeInTheDocument();
  });

  it("offers no Close control", () => {
    render(<AccountSetupDialog username="pending-person" action={noop} />);
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    expect(screen.queryByText("Close")).not.toBeInTheDocument();
  });

  it("ignores Escape and backdrop clicks", async () => {
    const user = userEvent.setup();
    render(<AccountSetupDialog username="pending-person" action={noop} />);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const backdrop = document.querySelector('[data-slot="dialog-overlay"]');
    expect(backdrop).not.toBeNull();
    await user.click(backdrop as Element);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("submits the entered values to the action", async () => {
    const user = userEvent.setup();
    const action = vi.fn<(prev: AccountSetupActionState, formData: FormData) => Promise<AccountSetupActionState>>(noop);
    render(<AccountSetupDialog username="pending-person" action={action} />);
    await fillAndSubmit(user);
    await waitFor(() => expect(action).toHaveBeenCalled());
    const formData = action.mock.calls[0][1];
    expect(formData.get("name")).toBe("Alex");
    expect(formData.get("password")).toBe("long-enough");
    expect(formData.get("confirmPassword")).toBe("long-enough");
  });

  it.each([
    ["name", "Name", "Name is required."],
    ["password", "Password", "Password must be at least 8 characters."],
    ["confirmPassword", "Confirm password", "Passwords do not match."],
  ] as const)("shows a %s error in an alert, focuses that field and keeps the name", async (field, label, error) => {
    const user = userEvent.setup();
    const action = vi.fn(async (): Promise<AccountSetupActionState> => ({ error, field, name: "Alex" }));
    render(<AccountSetupDialog username="pending-person" action={action} />);
    await fillAndSubmit(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(error);
    await waitFor(() => expect(screen.getByLabelText(label)).toHaveFocus());
    expect(screen.getByLabelText(label)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(label)).toHaveAccessibleDescription(error);
    expect(screen.getByLabelText("Name")).toHaveValue("Alex");
  });

  it("disables the button while saving", async () => {
    const user = userEvent.setup();
    let release: () => void = () => {};
    const action = vi.fn(
      () =>
        new Promise<AccountSetupActionState>((resolve) => {
          release = () => resolve(undefined);
        })
    );
    render(<AccountSetupDialog username="pending-person" action={action} />);
    await fillAndSubmit(user);
    expect(await screen.findByRole("button", { name: "Please wait…" })).toBeDisabled();
    release();
  });
});

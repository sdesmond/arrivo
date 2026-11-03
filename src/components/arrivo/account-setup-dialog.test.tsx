import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_PASSWORD_POLICY, type AccountSetupActionState, type PasswordPolicy } from "@/data/types";
import { AccountSetupDialog } from "./account-setup-dialog";

const noop = async (): Promise<AccountSetupActionState> => undefined;

async function fillAndSubmit(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Name"), "Alex");
  await user.type(screen.getByLabelText("Password"), "long-enough");
  await user.type(screen.getByLabelText("Confirm password"), "long-enough");
  await user.click(screen.getByRole("button", { name: "Save and continue" }));
}

describe("AccountSetupDialog", () => {
  it("shows prominent Arrivo branding", () => {
    render(<AccountSetupDialog username="pending-person" action={noop} policy={DEFAULT_PASSWORD_POLICY} />);
    expect(screen.getByRole("img", { name: "Arrivo" })).toHaveAttribute("height", "53");
    expect(document.querySelector('img[aria-hidden="true"]')).toHaveAttribute("height", "80");
  });

  it("shows the username as read-only text, not an input", () => {
    render(<AccountSetupDialog username="pending-person" action={noop} policy={DEFAULT_PASSWORD_POLICY} />);
    const dialog = screen.getByRole("dialog", { name: "Set up your account" });
    expect(dialog).toHaveTextContent("pending-person");
    expect(screen.queryByRole("textbox", { name: /username/i })).not.toBeInTheDocument();
  });

  it("offers Name, Password and Confirm password fields and a save button", () => {
    render(<AccountSetupDialog username="pending-person" action={noop} policy={DEFAULT_PASSWORD_POLICY} />);
    expect(screen.getByLabelText("Name")).toBeRequired();
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByLabelText("Confirm password")).toHaveAttribute("type", "password");
    expect(screen.getByRole("button", { name: "Save and continue" })).toBeInTheDocument();
  });

  it("offers no Close control", () => {
    render(<AccountSetupDialog username="pending-person" action={noop} policy={DEFAULT_PASSWORD_POLICY} />);
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    expect(screen.queryByText("Close")).not.toBeInTheDocument();
  });

  it("ignores Escape and backdrop clicks", async () => {
    const user = userEvent.setup();
    render(<AccountSetupDialog username="pending-person" action={noop} policy={DEFAULT_PASSWORD_POLICY} />);
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
    render(<AccountSetupDialog username="pending-person" action={action} policy={DEFAULT_PASSWORD_POLICY} />);
    await fillAndSubmit(user);
    await waitFor(() => expect(action).toHaveBeenCalled());
    const formData = action.mock.calls[0][1];
    expect(formData.get("name")).toBe("Alex");
    expect(formData.get("password")).toBe("long-enough");
    expect(formData.get("confirmPassword")).toBe("long-enough");
  });

  it.each([
    ["name", "Name", "Name is required."],
    ["password", "Password", "Password must be 8 to 20 characters."],
    ["confirmPassword", "Confirm password", "Passwords do not match."],
  ] as const)("shows a %s error in an alert, focuses that field and keeps the name", async (field, label, error) => {
    const user = userEvent.setup();
    const action = vi.fn(async (): Promise<AccountSetupActionState> => ({ error, field, name: "Alex" }));
    render(<AccountSetupDialog username="pending-person" action={action} policy={DEFAULT_PASSWORD_POLICY} />);
    await fillAndSubmit(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(error);
    await waitFor(() => expect(screen.getByLabelText(label)).toHaveFocus());
    expect(screen.getByLabelText(label)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(label)).toHaveAccessibleDescription(expect.stringContaining(error));
    expect(screen.getByLabelText("Name")).toHaveValue("Alex");
  });

  describe("password checklist", () => {
    const strict: PasswordPolicy = { ...DEFAULT_PASSWORD_POLICY, minNumbers: 1, minSpecial: 1 };

    it("lists the active requirements before typing and links them to the password field", () => {
      render(<AccountSetupDialog username="pending-person" action={noop} policy={strict} />);
      const list = screen.getByRole("list");
      expect(list).toHaveTextContent("8 to 20 characters");
      expect(list).toHaveTextContent("At least 1 number");
      expect(list).toHaveTextContent("At least 1 special character");
      expect(list.querySelector("svg")).toBeNull();
      expect(screen.getByLabelText("Password")).toHaveAttribute("aria-describedby", expect.stringContaining(list.id));
    });

    it("checks each requirement live and removes the check when an edit breaks it", async () => {
      const user = userEvent.setup();
      render(<AccountSetupDialog username="pending-person" action={noop} policy={strict} />);
      await user.type(screen.getByLabelText("Password"), "abcdefg1!");
      expect(screen.getByRole("list").querySelectorAll("svg")).toHaveLength(3);
      await user.type(screen.getByLabelText("Password"), "{Backspace}");
      expect(screen.getByRole("list").querySelectorAll("svg")).toHaveLength(2);
    });

    it("refreshes the checklist from the current rules a refused submission returns", async () => {
      const user = userEvent.setup();
      const action = vi.fn(
        async (): Promise<AccountSetupActionState> => ({
          error: "Password must be 12 to 20 characters.",
          field: "password",
          name: "Alex",
          policy: { ...DEFAULT_PASSWORD_POLICY, minLength: 12 },
        })
      );
      render(<AccountSetupDialog username="pending-person" action={action} policy={DEFAULT_PASSWORD_POLICY} />);
      await fillAndSubmit(user);
      await waitFor(() => expect(screen.getByRole("list")).toHaveTextContent("12 to 20 characters"));
    });

    it("does not stop a submission the local checklist considers unmet, since the server decides", async () => {
      const user = userEvent.setup();
      const action =
        vi.fn<(prev: AccountSetupActionState, formData: FormData) => Promise<AccountSetupActionState>>(noop);
      render(<AccountSetupDialog username="pending-person" action={action} policy={strict} />);
      await fillAndSubmit(user);
      await waitFor(() => expect(action).toHaveBeenCalled());
    });

    it("sets no native length constraint on the password field", () => {
      render(<AccountSetupDialog username="pending-person" action={noop} policy={strict} />);
      expect(screen.getByLabelText("Password")).not.toHaveAttribute("minlength");
      expect(screen.getByLabelText("Password")).not.toHaveAttribute("maxlength");
    });
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
    render(<AccountSetupDialog username="pending-person" action={action} policy={DEFAULT_PASSWORD_POLICY} />);
    await fillAndSubmit(user);
    expect(await screen.findByRole("button", { name: "Please wait…" })).toBeDisabled();
    release();
  });
});

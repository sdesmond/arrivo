import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountSetupDialog } from "./account-setup-dialog";

describe("AccountSetupDialog", () => {
  it("shows the account's username in a dialog", () => {
    render(<AccountSetupDialog username="pending-person" />);
    const dialog = screen.getByRole("dialog", { name: "Set up your account" });
    expect(dialog).toHaveTextContent("pending-person");
  });

  it("offers no Close control or other interactive element", () => {
    render(<AccountSetupDialog username="pending-person" />);
    expect(screen.getByRole("dialog").querySelector("button, a, input")).toBeNull();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    expect(screen.queryByText("Close")).not.toBeInTheDocument();
  });

  it("ignores Escape and backdrop clicks", async () => {
    const user = userEvent.setup();
    render(<AccountSetupDialog username="pending-person" />);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    const backdrop = document.querySelector('[data-slot="dialog-overlay"]');
    expect(backdrop).not.toBeNull();
    await user.click(backdrop as Element);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

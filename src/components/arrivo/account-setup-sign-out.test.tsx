import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SignInActionState } from "@/data/types";
import { AccountSetupSignOut } from "./account-setup-sign-out";
describe("AccountSetupSignOut", () => {
  it("shows heading and explicit submit without setup fields or dialog", () => {
    render(<AccountSetupSignOut action={async () => undefined} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Sign out to continue setup.");
    expect(screen.getByRole("button", { name: "Sign out and continue" })).toHaveClass("h-11");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });
  it("supports keyboard submission and accessible error with retry", async () => {
    const user = userEvent.setup();
    const action = vi.fn(async () => ({ error: "Could not sign out. Try again." }));
    render(<AccountSetupSignOut action={action} />);
    screen.getByRole("button").focus();
    await user.keyboard("{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not sign out. Try again.");
    await user.click(screen.getByRole("button", { name: "Sign out and continue" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
  });
  it("disables repeated submissions while pending", async () => {
    const user = userEvent.setup();
    let release: (value: SignInActionState) => void = () => {};
    render(
      <AccountSetupSignOut
        action={() =>
          new Promise((resolve) => {
            release = resolve;
          })
        }
      />
    );
    await user.click(screen.getByRole("button"));
    expect(await screen.findByRole("button", { name: "Please wait…" })).toBeDisabled();
    await act(async () => release(undefined));
  });
});

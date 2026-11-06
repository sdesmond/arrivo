import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_PASSWORD_POLICY, type PasswordPolicy } from "@/data/types";

vi.mock("./actions", () => ({ changePassword: vi.fn().mockResolvedValue({}) }));

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
      <div>
        {children}
        <button type="button" onClick={() => onOpenChange(false)}>
          Escape
        </button>
      </div>
    ) : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div role="dialog">{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { changePassword } from "./actions";
import { ChangePasswordDialog } from "./change-password-dialog";

const STRICT: PasswordPolicy = { ...DEFAULT_PASSWORD_POLICY, minUppercase: 1, minNumbers: 1 };

function Host({
  policy = DEFAULT_PASSWORD_POLICY,
  startOpen = true,
}: {
  policy?: PasswordPolicy;
  startOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(startOpen);
  return (
    <>
      <button onClick={() => setOpen(true)}>Reopen</button>
      <ChangePasswordDialog open={open} onOpenChange={setOpen} passwordPolicy={policy} />
    </>
  );
}

async function fill(user: ReturnType<typeof userEvent.setup>, current: string, next: string, confirmation = next) {
  await user.type(screen.getByLabelText("Current password"), current);
  await user.type(screen.getByLabelText("New password"), next);
  await user.type(screen.getByLabelText("Confirm new password"), confirmation);
}

describe("ChangePasswordDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(changePassword).mockResolvedValue({});
  });

  it("renders nothing while closed", () => {
    render(<Host startOpen={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("has a title, three labeled fields and 44px targets", () => {
    render(<Host />);
    expect(screen.getByRole("heading", { name: "Change password" })).toBeInTheDocument();
    for (const label of ["Current password", "New password", "Confirm new password"]) {
      expect(screen.getByLabelText(label)).toHaveAttribute("type", "password");
      expect(screen.getByLabelText(label)).toHaveClass("h-11");
    }
    expect(screen.getByLabelText("Current password")).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByLabelText("New password")).toHaveAttribute("autocomplete", "new-password");
    expect(screen.getByRole("button", { name: "Update password" })).toHaveClass("h-11");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("h-11");
  });

  it("lists the active requirements before typing, linked to New password, with blank markers", () => {
    render(<Host policy={STRICT} />);
    const list = screen.getByRole("list", { name: "Password requirements" });
    expect(list).toHaveTextContent("8 to 20 characters");
    expect(list).toHaveTextContent("At least 1 uppercase letter");
    expect(list).toHaveTextContent("At least 1 number");
    expect(list.querySelector("svg")).toBeNull();
    expect(screen.getByLabelText("New password")).toHaveAttribute("aria-describedby", expect.stringContaining(list.id));
  });

  it("checks and unchecks requirements live without a failure mark or a request", async () => {
    const user = userEvent.setup();
    const { container } = render(<Host policy={STRICT} />);
    await user.type(screen.getByLabelText("New password"), "Abcdefg1");
    const list = screen.getByRole("list", { name: "Password requirements" });
    expect(list.querySelectorAll("svg")).toHaveLength(3);
    await user.type(screen.getByLabelText("New password"), "{Backspace}");
    expect(list.querySelectorAll("svg")).toHaveLength(1);
    expect(container.querySelector(".lucide-x, .lucide-circle-x")).toBeNull();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("announces a mismatch on the confirmation field and clears it when corrected", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.type(screen.getByLabelText("New password"), "abcdefgh");
    await user.type(screen.getByLabelText("Confirm new password"), "different");
    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm new password")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Confirm new password")).toHaveAccessibleDescription("Passwords do not match.");
    await user.clear(screen.getByLabelText("Confirm new password"));
    await user.type(screen.getByLabelText("Confirm new password"), "abcdefgh");
    expect(screen.queryByText("Passwords do not match.")).not.toBeInTheDocument();
  });

  it("does not call the action on a mismatch and focuses the confirmation field", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await fill(user, "currentpw", "abcdefgh", "different");
    await user.click(screen.getByRole("button", { name: "Update password" }));
    expect(changePassword).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText("Confirm new password")).toHaveFocus());
  });

  it("submits the entered passwords even when the local checklist is unmet, since the server decides", async () => {
    const user = userEvent.setup();
    render(<Host policy={STRICT} />);
    await fill(user, "currentpw", "short");
    await user.click(screen.getByRole("button", { name: "Update password" }));
    expect(changePassword).toHaveBeenCalledWith({ currentPassword: "currentpw", newPassword: "short" });
  });

  it("shows a pending state and disables the submit while saving", async () => {
    const user = userEvent.setup();
    let release: (value: { error?: string }) => void = () => {};
    vi.mocked(changePassword).mockReturnValue(new Promise((resolve) => (release = resolve)));
    render(<Host />);
    await fill(user, "currentpw", "abcdefgh");
    await user.click(screen.getByRole("button", { name: "Update password" }));
    expect(await screen.findByRole("button", { name: "Update password" })).toBeDisabled();
    release({});
    expect(screen.queryByText("Password updated.")).not.toBeInTheDocument();
  });

  it("on success clears the fields and stops further submits without inline success text", async () => {
    const user = userEvent.setup();
    render(<Host />);
    await fill(user, "currentpw", "abcdefgh");
    await user.click(screen.getByRole("button", { name: "Update password" }));
    // The action settles asynchronously; wait for the cleared state rather than asserting mid-flight.
    await waitFor(() => expect(screen.getByLabelText("New password")).toHaveValue(""));
    expect(screen.queryByText("Password updated.")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update password" })).toBeDisabled();
  });

  it("shows a policy failure, focuses New password and refreshes the checklist from the returned rules", async () => {
    const user = userEvent.setup();
    vi.mocked(changePassword).mockResolvedValueOnce({
      error: "Password must be 12 to 20 characters.",
      policy: { ...DEFAULT_PASSWORD_POLICY, minLength: 12 },
    });
    render(<Host />);
    await fill(user, "currentpw", "abcdefgh");
    await user.click(screen.getByRole("button", { name: "Update password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Password must be 12 to 20 characters.");
    expect(screen.getByRole("list", { name: "Password requirements" })).toHaveTextContent("12 to 20 characters");
    await waitFor(() => expect(screen.getByLabelText("New password")).toHaveFocus());
    expect(screen.getByLabelText("New password")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("New password")).toHaveAccessibleDescription(
      expect.stringContaining("Password must be 12 to 20 characters.")
    );
    // The typed values stay so the person can fix them.
    expect(screen.getByLabelText("New password")).toHaveValue("abcdefgh");
  });

  it("focuses Current password when that is what was wrong, keeping the checklist", async () => {
    const user = userEvent.setup();
    vi.mocked(changePassword).mockResolvedValueOnce({ error: "Current password is incorrect." });
    render(<Host policy={STRICT} />);
    await fill(user, "wrong", "Abcdefg1");
    await user.click(screen.getByRole("button", { name: "Update password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Current password is incorrect.");
    await waitFor(() => expect(screen.getByLabelText("Current password")).toHaveFocus());
    expect(screen.getByLabelText("Current password")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("list", { name: "Password requirements" })).toHaveTextContent(
      "At least 1 uppercase letter"
    );
  });

  it("says the rules are unavailable, hides New password and disables submit when they could not be read", () => {
    render(<ChangePasswordDialog open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Password rules are unavailable");
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update password" })).toBeDisabled();
  });

  it.each(["Cancel", "Escape"])("resets every field and error when closed with %s", async (closer) => {
    const user = userEvent.setup();
    vi.mocked(changePassword).mockResolvedValueOnce({ error: "Current password is incorrect." });
    render(<Host />);
    await fill(user, "wrong", "abcdefgh", "different");
    await user.click(screen.getByRole("button", { name: "Update password" }));
    await user.clear(screen.getByLabelText("Confirm new password"));
    await user.type(screen.getByLabelText("Confirm new password"), "abcdefgh");
    await user.click(screen.getByRole("button", { name: "Update password" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: closer }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reopen" }));
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByLabelText("New password")).toHaveValue("");
    expect(screen.getByLabelText("Confirm new password")).toHaveValue("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Passwords do not match.")).not.toBeInTheDocument();
    expect(screen.queryByText("Password updated.")).not.toBeInTheDocument();
  });

  it("keeps the refreshed rules across a close, since they describe the server, not the form", async () => {
    const user = userEvent.setup();
    vi.mocked(changePassword).mockResolvedValueOnce({
      error: "Password must be 12 to 20 characters.",
      policy: { ...DEFAULT_PASSWORD_POLICY, minLength: 12 },
    });
    render(<Host />);
    await fill(user, "currentpw", "abcdefgh");
    await user.click(screen.getByRole("button", { name: "Update password" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Reopen" }));
    expect(screen.getByRole("list", { name: "Password requirements" })).toHaveTextContent("12 to 20 characters");
  });
});

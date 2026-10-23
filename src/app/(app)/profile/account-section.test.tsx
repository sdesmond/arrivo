import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./actions", () => ({
  changePassword: vi.fn().mockResolvedValue({}),
  deleteAccount: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/components/arrivo/form-section", () => ({
  Section: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Field: ({
    children,
    label,
    error,
    htmlFor,
  }: {
    children: React.ReactNode;
    label: string;
    htmlFor?: string;
    error?: string;
  }) => (
    <div>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error && <p role="alert">{error}</p>}
    </div>
  ),
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { CollaboratorRole } from "@/data/types";
import { ProfileAccountSection } from "./account-section";

describe("ProfileAccountSection — inline password validation (AC6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function typeIntoPasswordField(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
    const input = screen.getByLabelText(label) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, value);
  }

  it("shows length error when new password is fewer than 8 chars", async () => {
    const user = userEvent.setup();
    render(<ProfileAccountSection />);
    await typeIntoPasswordField(user, "New password", "abc");
    expect(screen.getByRole("alert")).toHaveTextContent("Password must be at least 8 characters.");
  });

  it("does not show length error when new password has 8+ chars", async () => {
    const user = userEvent.setup();
    render(<ProfileAccountSection />);
    await typeIntoPasswordField(user, "New password", "abcdefgh");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows mismatch error when confirm password does not match new password", async () => {
    const user = userEvent.setup();
    render(<ProfileAccountSection />);
    await typeIntoPasswordField(user, "New password", "abcdefgh");
    await typeIntoPasswordField(user, "Confirm new password", "different");
    const alerts = screen.getAllByRole("alert");
    expect(alerts.some((el) => el.textContent === "Passwords do not match.")).toBe(true);
  });

  it("clears mismatch error when confirm password is corrected", async () => {
    const user = userEvent.setup();
    render(<ProfileAccountSection />);
    await typeIntoPasswordField(user, "New password", "abcdefgh");
    await typeIntoPasswordField(user, "Confirm new password", "different");
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    await typeIntoPasswordField(user, "Confirm new password", "abcdefgh");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not show client-side errors when fields are empty", () => {
    render(<ProfileAccountSection />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("disables Update password button when passwords do not match", async () => {
    const user = userEvent.setup();
    render(<ProfileAccountSection />);
    await typeIntoPasswordField(user, "Current password", "currentpw");
    await typeIntoPasswordField(user, "New password", "abcdefgh");
    await typeIntoPasswordField(user, "Confirm new password", "different!");
    expect(screen.getByRole("button", { name: /update password/i })).toBeDisabled();
  });

  it("disables Update password button when new password is too short", async () => {
    const user = userEvent.setup();
    render(<ProfileAccountSection />);
    await typeIntoPasswordField(user, "Current password", "currentpw");
    await typeIntoPasswordField(user, "New password", "short");
    expect(screen.getByRole("button", { name: /update password/i })).toBeDisabled();
  });

  it("enables Update password button when all fields are valid", async () => {
    const user = userEvent.setup();
    render(<ProfileAccountSection />);
    await typeIntoPasswordField(user, "Current password", "currentpw");
    await typeIntoPasswordField(user, "New password", "abcdefgh");
    await typeIntoPasswordField(user, "Confirm new password", "abcdefgh");
    expect(screen.getByRole("button", { name: /update password/i })).not.toBeDisabled();
  });
});

describe("ProfileAccountSection — delete account", () => {
  const sharedOwnedTrips = [
    {
      tripId: "trip-kyoto",
      name: "Kyoto Adventure",
      memberCount: 2,
      collaborators: [{ userId: "user-ada", name: "Ada Lovelace", role: CollaboratorRole.Viewer }],
      suggestedHeirUserId: "user-ada",
    },
  ];

  it("opens the dialog with the user's shared trips", async () => {
    const user = userEvent.setup();
    render(<ProfileAccountSection sharedOwnedTrips={sharedOwnedTrips} />);

    await user.click(screen.getByRole("button", { name: "Delete account" }));

    expect(screen.getByRole("heading", { name: "Delete account?" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /Kyoto Adventure/ })).toHaveTextContent(
      "Transfer to Ada Lovelace · viewer"
    );
  });

  it("returns focus to the trigger when the dialog closes", async () => {
    const user = userEvent.setup();
    render(<ProfileAccountSection />);

    await user.click(screen.getByRole("button", { name: "Delete account" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("heading", { name: "Delete account?" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete account" })).toHaveFocus();
  });
});

import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("./actions", () => ({
  changePassword: vi.fn().mockResolvedValue({}),
  updateProfile: vi.fn().mockResolvedValue({}),
  deleteAccount: vi.fn().mockResolvedValue(undefined),
}));
import { changePassword, updateProfile } from "./actions";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div role="dialog">{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { CollaboratorRole, DEFAULT_PASSWORD_POLICY, type UserProfile } from "@/data/types";
import { ProfileAccountSection } from "./account-section";

const USER: UserProfile = {
  id: "user-1",
  name: "Test User",
  username: "test",
  dateFormat: "MM/DD/YYYY",
  currency: "USD",
  distanceUnit: "imperial",
  passportNumber: null,
  passportExpiry: null,
  passportNationality: null,
  knownTravelerNumber: null,
  warningThreshold: 80,
  dangerThreshold: 90,
  loyaltyNumbers: [],
  wishlistDestinations: [],
  companions: [],
};

function renderSection(props: Partial<React.ComponentProps<typeof ProfileAccountSection>> = {}) {
  return render(<ProfileAccountSection user={USER} passwordPolicy={DEFAULT_PASSWORD_POLICY} {...props} />);
}

describe("ProfileAccountSection — one Account section", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has exactly one h2, titled Account, and no separate Identity heading", () => {
    renderSection();
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["Account"]);
    expect(screen.queryByText(/identity/i)).not.toBeInTheDocument();
  });

  it("orders the profile fields, then the change password button, then delete account", () => {
    renderSection();
    const order = [
      screen.getByText("Profile photo upload coming soon."),
      screen.getByLabelText("Name"),
      screen.getByLabelText("Username"),
      screen.getByRole("button", { name: "Change password" }),
      screen.getByRole("button", { name: "Delete account" }),
    ];
    for (let i = 0; i < order.length - 1; i++) {
      expect(order[i].compareDocumentPosition(order[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("saves name and username through the existing profile action", async () => {
    const user = userEvent.setup();
    renderSection();
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Renamed");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(updateProfile).toHaveBeenCalledWith({ name: "Renamed" });
  });

  it("is dirty only for name and username changes", async () => {
    const user = userEvent.setup();
    const onDirtyChange = vi.fn();
    renderSection({ onDirtyChange });
    await user.type(screen.getByLabelText("Name"), "x");
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    await user.type(screen.getByLabelText("Name"), "{Backspace}");
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });
});

describe("ProfileAccountSection — change password dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(changePassword).mockResolvedValue({});
  });

  it("shows no password fields inline, only a 44px Change password button", () => {
    renderSection();
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Password requirements" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change password" })).toHaveClass("h-11");
  });

  it("opens a dialog with the three fields and the live checklist", async () => {
    const user = userEvent.setup();
    renderSection({ passwordPolicy: { ...DEFAULT_PASSWORD_POLICY, minNumbers: 1 } });
    await user.click(screen.getByRole("button", { name: "Change password" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Change password" })).toBeInTheDocument();
    for (const label of ["Current password", "New password", "Confirm new password"]) {
      expect(within(dialog).getByLabelText(label)).toBeInTheDocument();
    }
    expect(within(dialog).getByRole("list", { name: "Password requirements" })).toHaveTextContent("At least 1 number");
  });

  it("submits through the existing action and shows the success state", async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(screen.getByRole("button", { name: "Change password" }));
    await user.type(screen.getByLabelText("Current password"), "currentpw");
    await user.type(screen.getByLabelText("New password"), "abcdefgh");
    await user.type(screen.getByLabelText("Confirm new password"), "abcdefgh");
    await user.click(screen.getByRole("button", { name: "Update password" }));
    expect(changePassword).toHaveBeenCalledWith({ currentPassword: "currentpw", newPassword: "abcdefgh" });
    expect(await screen.findByText("Password updated.")).toBeInTheDocument();
  });

  it("does not make the tab dirty while password fields hold input", async () => {
    const user = userEvent.setup();
    const onDirtyChange = vi.fn();
    renderSection({ onDirtyChange });
    await user.click(screen.getByRole("button", { name: "Change password" }));
    await user.type(screen.getByLabelText("Current password"), "abc");
    await user.type(screen.getByLabelText("New password"), "abc");
    expect(onDirtyChange).not.toHaveBeenCalled();
  });

  it("returns focus to the Change password button when the dialog closes", async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(screen.getByRole("button", { name: "Change password" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change password" })).toHaveFocus();
  });

  it("clears the fields when the dialog is closed and reopened", async () => {
    const user = userEvent.setup();
    renderSection();
    await user.click(screen.getByRole("button", { name: "Change password" }));
    await user.type(screen.getByLabelText("Current password"), "abc");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByLabelText("Current password")).toHaveValue("");
  });

  it("says the rules are unavailable inside the dialog when the server could not read them", async () => {
    const user = userEvent.setup();
    renderSection({ passwordPolicy: undefined });
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toHaveTextContent("Password rules are unavailable");
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

  it("right-aligns the button under a divider, as a 44px target", () => {
    renderSection();
    const button = screen.getByRole("button", { name: "Delete account" });
    expect(button).toHaveClass("min-h-11");
    const row = button.parentElement as HTMLElement;
    expect(row).toHaveClass("justify-end");
    expect(row.style.borderTop).toContain("var(--line)");
  });

  it("opens the dialog with the user's shared trips", async () => {
    const user = userEvent.setup();
    renderSection({ sharedOwnedTrips });

    await user.click(screen.getByRole("button", { name: "Delete account" }));

    expect(screen.getByRole("heading", { name: "Delete account?" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /Kyoto Adventure/ })).toHaveTextContent(
      "Transfer to Ada Lovelace · viewer"
    );
  });

  it("returns focus to the trigger when the dialog closes", async () => {
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole("button", { name: "Delete account" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("heading", { name: "Delete account?" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete account" })).toHaveFocus();
  });
});

import * as React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as navigation from "next/navigation";
import { CollaboratorRole, TripDeletionAction } from "@/data/types";
import { SIGN_IN_PASSWORD_MAX_LENGTH } from "@/lib/validation-limits";
import type { AccountDeletionTrip } from "@/data/types";

const { mockDeleteAccount, router } = vi.hoisted(() => ({
  mockDeleteAccount: vi.fn(),
  router: { push: vi.fn(), refresh: vi.fn() },
}));

vi.mock("./actions", () => ({ deleteAccount: mockDeleteAccount }));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children: React.ReactNode }) => <div role="dialog">{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { DeleteAccountDialog } from "./delete-account-dialog";

const LISBON: AccountDeletionTrip = {
  tripId: "trip-lisbon",
  name: "Lisbon Escape",
  memberCount: 3,
  collaborators: [
    { userId: "user-bo", name: "Bo Nilsen", role: CollaboratorRole.Manager },
    { userId: "user-ada", name: "Ada Lovelace", role: CollaboratorRole.Viewer },
  ],
  suggestedHeirUserId: "user-bo",
};
const KYOTO: AccountDeletionTrip = {
  tripId: "trip-kyoto",
  name: "Kyoto Adventure",
  memberCount: 2,
  collaborators: [{ userId: "user-grace", name: "Grace Hopper", role: CollaboratorRole.Editor }],
  suggestedHeirUserId: "user-grace",
};

function renderDialog(sharedTrips: AccountDeletionTrip[] = [LISBON, KYOTO]) {
  const onOpenChange = vi.fn();
  const view = render(<DeleteAccountDialog open onOpenChange={onOpenChange} sharedTrips={sharedTrips} />);
  return { ...view, onOpenChange };
}

async function confirmWithPassword(user: ReturnType<typeof userEvent.setup>, password = "correct-password") {
  await user.type(screen.getByLabelText("Current password"), password);
  await user.click(screen.getByRole("button", { name: "Delete account" }));
}

describe("DeleteAccountDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // The global next/navigation mock builds a fresh router per call; pin one so calls can be asserted.
    vi.spyOn(navigation, "useRouter").mockReturnValue(router as unknown as ReturnType<typeof navigation.useRouter>);
    mockDeleteAccount.mockResolvedValue({ status: "success" });
  });

  it("asks for the current password and keeps Delete account disabled until one is typed", async () => {
    const user = userEvent.setup();
    renderDialog([]);

    const password = screen.getByLabelText("Current password");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    expect(password).not.toHaveAttribute("maxlength");
    expect(password).toHaveClass("h-11");
    expect(screen.getByRole("button", { name: "Delete account" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Delete account" }));
    expect(mockDeleteAccount).not.toHaveBeenCalled();

    await user.type(password, "hunter2hunter2");
    expect(screen.getByRole("button", { name: "Delete account" })).toBeEnabled();
  });

  it("caps the password at the server's limit in characters, so emoji count once", async () => {
    const user = userEvent.setup();
    renderDialog([]);
    const password = screen.getByLabelText("Current password");

    await user.type(password, "p".repeat(SIGN_IN_PASSWORD_MAX_LENGTH + 5));
    expect(password).toHaveValue("p".repeat(SIGN_IN_PASSWORD_MAX_LENGTH));

    await user.clear(password);
    await user.click(password);
    await user.paste("😀".repeat(SIGN_IN_PASSWORD_MAX_LENGTH + 2));
    expect(password).toHaveValue("😀".repeat(SIGN_IN_PASSWORD_MAX_LENGTH));
  });

  it("clears the typed password after a wrong attempt", async () => {
    const user = userEvent.setup();
    mockDeleteAccount.mockResolvedValue({
      status: "error",
      message: "Current password is incorrect.",
      field: "password",
    });
    renderDialog([]);

    await confirmWithPassword(user, "nope");

    await screen.findByRole("alert");
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Delete account" })).toBeDisabled();
  });

  it("keeps the typed password after a refusal that is not about the password", async () => {
    const user = userEvent.setup();
    mockDeleteAccount.mockResolvedValue({ status: "error", message: "Nope." });
    renderDialog([]);

    await confirmWithPassword(user, "still-right");

    await screen.findByRole("alert");
    expect(screen.getByLabelText("Current password")).toHaveValue("still-right");
  });

  it("forgets the password and any error once the dialog is cancelled, so reopening starts clean", async () => {
    const user = userEvent.setup();
    mockDeleteAccount.mockResolvedValue({ status: "error", message: "Nope." });
    const { rerender, onOpenChange } = renderDialog([]);

    await confirmWithPassword(user, "typed-secret");
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    rerender(<DeleteAccountDialog open={false} onOpenChange={onOpenChange} sharedTrips={[]} />);
    rerender(<DeleteAccountDialog open onOpenChange={onOpenChange} sharedTrips={[]} />);

    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("submits on Enter from the password field", async () => {
    const user = userEvent.setup();
    renderDialog([]);

    await user.type(screen.getByLabelText("Current password"), "correct-password{Enter}");

    expect(mockDeleteAccount).toHaveBeenCalledWith([], "correct-password");
  });

  it("marks the password invalid and keeps the dialog open when it is wrong", async () => {
    const user = userEvent.setup();
    mockDeleteAccount.mockResolvedValue({
      status: "error",
      message: "Current password is incorrect.",
      field: "password",
    });
    renderDialog([]);

    await confirmWithPassword(user, "nope");

    expect(await screen.findByRole("alert")).toHaveTextContent("Current password is incorrect.");
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Current password")).toHaveAttribute("aria-invalid", "true");
  });

  it("does not flag the password for an unrelated refusal", async () => {
    const user = userEvent.setup();
    mockDeleteAccount.mockResolvedValue({ status: "error", message: "Nope." });
    renderDialog([]);

    await confirmWithPassword(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("Nope.");
    expect(screen.getByLabelText("Current password")).not.toHaveAttribute("aria-invalid");
  });

  it("shows one owner picker per shared trip, labelled by the trip and preselected to the suggested heir", () => {
    renderDialog();

    const lisbonPicker = screen.getByRole("combobox", { name: /Lisbon Escape/ });
    expect(lisbonPicker).toHaveTextContent("Transfer to Bo Nilsen · manager");
    expect(lisbonPicker).toHaveAccessibleDescription("3 people");
    expect(lisbonPicker).toHaveClass("h-11");
    expect(screen.getByRole("combobox", { name: /Kyoto Adventure/ })).toHaveTextContent(
      "Transfer to Grace Hopper · editor"
    );
    expect(screen.getByText("New owners become managers. Pending invites you sent will be cancelled.")).toBeVisible();
  });

  it("offers every collaborator plus deleting the trip", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("combobox", { name: /Lisbon Escape/ }));

    expect(await screen.findByRole("option", { name: "Transfer to Bo Nilsen · manager" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Transfer to Ada Lovelace · viewer" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Delete this trip" })).toBeInTheDocument();
  });

  it("submits the suggested heirs when nothing is changed", async () => {
    const user = userEvent.setup();
    renderDialog();

    await confirmWithPassword(user);

    expect(mockDeleteAccount).toHaveBeenCalledWith(
      [
        { tripId: "trip-lisbon", action: TripDeletionAction.Transfer, newOwnerUserId: "user-bo" },
        { tripId: "trip-kyoto", action: TripDeletionAction.Transfer, newOwnerUserId: "user-grace" },
      ],
      "correct-password"
    );
    expect(router.push).toHaveBeenCalledWith("/sign-in");
  });

  it("submits a different heir and a deliberate delete, warning that members lose access", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("combobox", { name: /Lisbon Escape/ }));
    await user.click(await screen.findByRole("option", { name: "Transfer to Ada Lovelace · viewer" }));
    await user.click(screen.getByRole("combobox", { name: /Kyoto Adventure/ }));
    await user.click(await screen.findByRole("option", { name: "Delete this trip" }));

    expect(screen.getByRole("combobox", { name: /Kyoto Adventure/ })).toHaveTextContent("Delete this trip");
    expect(screen.getByText("Everyone on this trip will lose access.")).toBeVisible();

    await confirmWithPassword(user);

    expect(mockDeleteAccount).toHaveBeenCalledWith(
      [
        { tripId: "trip-lisbon", action: TripDeletionAction.Transfer, newOwnerUserId: "user-ada" },
        { tripId: "trip-kyoto", action: TripDeletionAction.Delete },
      ],
      "correct-password"
    );
  });

  it("falls back to the new suggestion when a chosen heir is no longer on the trip after a refresh", async () => {
    const user = userEvent.setup();
    const { rerender, onOpenChange } = renderDialog([LISBON]);

    await user.click(screen.getByRole("combobox", { name: /Lisbon Escape/ }));
    await user.click(await screen.findByRole("option", { name: "Transfer to Ada Lovelace · viewer" }));

    const lisbonWithoutAda = { ...LISBON, memberCount: 2, collaborators: [LISBON.collaborators[0]] };
    rerender(<DeleteAccountDialog open onOpenChange={onOpenChange} sharedTrips={[lisbonWithoutAda]} />);

    expect(screen.getByRole("combobox", { name: /Lisbon Escape/ })).toHaveTextContent(
      "Transfer to Bo Nilsen · manager"
    );
  });

  it("refreshes and explains when the shared trips changed on the server", async () => {
    const user = userEvent.setup();
    mockDeleteAccount.mockResolvedValue({
      status: "error",
      message: "Your shared trips changed. Review them and try again.",
      stale: true,
    });
    renderDialog();

    await confirmWithPassword(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("Your shared trips changed. Review them and try again.");
    expect(router.refresh).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("shows a non-stale error without refreshing", async () => {
    const user = userEvent.setup();
    mockDeleteAccount.mockResolvedValue({ status: "error", message: "Nope." });
    renderDialog();

    await confirmWithPassword(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("Nope.");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("disables both buttons while the deletion is pending", async () => {
    const user = userEvent.setup();
    mockDeleteAccount.mockReturnValue(new Promise(() => {}));
    renderDialog();

    await confirmWithPassword(user);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Delete account" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
  });

  it("shows only the confirmation when the user owns no shared trips", () => {
    renderDialog([]);

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText(/choose who takes over/i)).not.toBeInTheDocument();
    expect(screen.getByText("Pending invites you sent will be cancelled.")).toBeVisible();
  });

  it("closes through onOpenChange when cancelled", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

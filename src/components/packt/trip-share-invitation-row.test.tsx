import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Invitation } from "@/data/types";
import { TripShareInvitationRow } from "./trip-share-invitation-row";

const pendingInvitation: Invitation = {
  id: "pending-1",
  email: "pending@example.com",
  expiresAt: "2099-01-01T00:00:00.000Z",
  invitedBy: "manager-1",
  role: "viewer",
  status: "pending",
  tripId: "trip-1",
};

const declinedInvitation: Invitation = {
  ...pendingInvitation,
  id: "declined-1",
  email: "declined@example.com",
  status: "declined",
};

describe("TripShareInvitationRow", () => {
  it("renders resend and rescind, but no dismiss, for a pending invitation", () => {
    render(
      <TripShareInvitationRow
        invitation={pendingInvitation}
        onDismiss={vi.fn()}
        onRescind={vi.fn()}
        onResend={vi.fn()}
        pendingAction={null}
        roleLabel={(role) => role}
      />
    );

    expect(screen.getByTitle("Resend invitation to pending@example.com")).toBeEnabled();
    expect(screen.getByTitle("Rescind invitation to pending@example.com")).toBeEnabled();
    expect(screen.queryByTitle("Dismiss invitation to pending@example.com")).not.toBeInTheDocument();
  });

  it("renders and invokes an accessible dismiss action for a declined invitation", () => {
    const onDismiss = vi.fn();
    render(
      <TripShareInvitationRow
        invitation={declinedInvitation}
        onDismiss={onDismiss}
        onRescind={vi.fn()}
        onResend={vi.fn()}
        pendingAction={null}
        roleLabel={(role) => role}
      />
    );

    fireEvent.click(screen.getByTitle("Dismiss invitation to declined@example.com"));

    expect(onDismiss).toHaveBeenCalledWith(declinedInvitation);
    expect(screen.getByText("Declined")).toBeInTheDocument();
  });

  it("shows only dismiss progress for the pending declined-row request", () => {
    render(
      <TripShareInvitationRow
        invitation={declinedInvitation}
        onDismiss={vi.fn()}
        onRescind={vi.fn()}
        onResend={vi.fn()}
        pendingAction="dismiss"
        roleLabel={(role) => role}
      />
    );

    expect(screen.getByTitle("Dismiss invitation to declined@example.com")).toBeDisabled();
    expect(screen.getByLabelText("Dismissing invitation")).toBeInTheDocument();
  });

  it.each(["accepted", "expired", "rescinded"] as const)("does not render a terminal %s invitation", (status) => {
    const { container } = render(
      <TripShareInvitationRow
        invitation={{ ...declinedInvitation, status }}
        onDismiss={vi.fn()}
        onRescind={vi.fn()}
        onResend={vi.fn()}
        pendingAction={null}
        roleLabel={(role) => role}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });
});

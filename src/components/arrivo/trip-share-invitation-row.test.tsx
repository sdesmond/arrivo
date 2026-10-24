import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MockDateProvider } from "@/components/providers/mock-date-provider";
import type { Invitation } from "@/data/types";
import { TripShareInvitationRow } from "./trip-share-invitation-row";

const NOW_ISO = "2026-06-15T12:00:00.000Z";

const pendingInvitation: Invitation = {
  id: "pending-1",
  inviteeUsername: "pending",
  expiresAt: "2099-01-01T00:00:00.000Z",
  invitedBy: "manager-1",
  role: "viewer",
  status: "pending",
  tripId: "trip-1",
};

const expiredPendingInvitation: Invitation = {
  ...pendingInvitation,
  id: "expired-pending-1",
  inviteeUsername: "expired-pending",
  expiresAt: "2026-01-01T00:00:00.000Z",
};

const declinedInvitation: Invitation = {
  ...pendingInvitation,
  id: "declined-1",
  inviteeUsername: "declined",
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

    expect(screen.getByText("@pending")).toBeInTheDocument();
    expect(screen.getByText("PE")).toBeInTheDocument();
    expect(screen.getByTitle("Resend invitation to @pending")).toBeEnabled();
    expect(screen.getByTitle("Rescind invitation to @pending")).toBeEnabled();
    expect(screen.queryByTitle("Dismiss invitation to @pending")).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByTitle("Dismiss invitation to @declined"));

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

    expect(screen.getByTitle("Dismiss invitation to @declined")).toBeDisabled();
    expect(screen.getByLabelText("Dismissing invitation")).toBeInTheDocument();
  });

  it("shows an Expired badge, but still offers resend and rescind, for an expired pending invitation", () => {
    render(
      <MockDateProvider initialISO={NOW_ISO}>
        <TripShareInvitationRow
          invitation={expiredPendingInvitation}
          onDismiss={vi.fn()}
          onRescind={vi.fn()}
          onResend={vi.fn()}
          pendingAction={null}
          roleLabel={(role) => role}
        />
      </MockDateProvider>
    );

    expect(screen.getByText("Expired")).toBeInTheDocument();
    expect(screen.queryByText("Pending")).not.toBeInTheDocument();
    expect(screen.getByTitle("Resend invitation to @expired-pending")).toBeEnabled();
    expect(screen.getByTitle("Rescind invitation to @expired-pending")).toBeEnabled();
    expect(screen.queryByTitle("Dismiss invitation to @expired-pending")).not.toBeInTheDocument();
  });

  it("shows a Pending badge for a pending invitation that has not expired yet", () => {
    render(
      <MockDateProvider initialISO={NOW_ISO}>
        <TripShareInvitationRow
          invitation={pendingInvitation}
          onDismiss={vi.fn()}
          onRescind={vi.fn()}
          onResend={vi.fn()}
          pendingAction={null}
          roleLabel={(role) => role}
        />
      </MockDateProvider>
    );

    expect(screen.getByText("Pending")).toBeInTheDocument();
    expect(screen.queryByText("Expired")).not.toBeInTheDocument();
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

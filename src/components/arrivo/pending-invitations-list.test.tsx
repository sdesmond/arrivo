import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { acceptInvitation, declineInvitation } from "@/app/(app)/trips/actions";
import { PendingInvitationsList } from "./pending-invitations-list";
import type { PendingInvitation } from "@/data/types";

const { mockRouterPush } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/app/(app)/trips/actions", () => ({
  acceptInvitation: vi.fn(),
  declineInvitation: vi.fn(),
}));

const INVITATION: PendingInvitation = {
  id: "invite-1",
  tripId: "trip-1",
  tripName: "Kyoto Trip",
  inviterName: "Ada Lovelace",
  inviterUsername: "ada",
  role: "editor",
  expiresAt: "2026-09-10T00:00:00.000Z",
};

const SECOND_INVITATION: PendingInvitation = {
  id: "invite-2",
  tripId: "trip-2",
  tripName: "Oslo Trip",
  inviterName: "Bo Nilsen",
  inviterUsername: "bo",
  role: "viewer",
  expiresAt: "2026-09-10T00:00:00.000Z",
};

describe("PendingInvitationsList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when there are no pending invitations", () => {
    const { container } = render(<PendingInvitationsList invitations={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders an Invitations section with trip name, inviter, role pill, and pending badge for each invitation", () => {
    render(<PendingInvitationsList invitations={[INVITATION]} />);

    expect(screen.getByText("Invitations")).toBeInTheDocument();
    expect(screen.getByText("Kyoto Trip")).toBeInTheDocument();
    expect(screen.getByText(/Ada Lovelace/)).toBeInTheDocument();
    expect(screen.getByText("Editor")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("renders Accept and Decline buttons with descriptive titles", () => {
    render(<PendingInvitationsList invitations={[INVITATION]} />);

    expect(screen.getByTitle("Accept invitation to Kyoto Trip")).toBeInTheDocument();
    expect(screen.getByTitle("Decline invitation to Kyoto Trip")).toBeInTheDocument();
  });

  it("redirects to the trip on a successful accept", async () => {
    const user = userEvent.setup();
    vi.mocked(acceptInvitation).mockResolvedValue({ status: "accepted", tripId: "trip-1" });

    render(<PendingInvitationsList invitations={[INVITATION]} />);
    await user.click(screen.getByTitle("Accept invitation to Kyoto Trip"));

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith("/trips/trip-1"));
    expect(acceptInvitation).toHaveBeenCalledWith("invite-1");
  });

  it("shows an error toast and keeps the row when accept fails", async () => {
    const user = userEvent.setup();
    vi.mocked(acceptInvitation).mockResolvedValue({ status: "error", message: "This invitation has expired." });

    render(<PendingInvitationsList invitations={[INVITATION]} />);
    await user.click(screen.getByTitle("Accept invitation to Kyoto Trip"));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This invitation has expired."));
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(screen.getByText("Kyoto Trip")).toBeInTheDocument();
  });

  it("shows a success toast and removes the row on a successful decline", async () => {
    const user = userEvent.setup();
    vi.mocked(declineInvitation).mockResolvedValue({ status: "declined" });

    render(<PendingInvitationsList invitations={[INVITATION]} />);
    await user.click(screen.getByTitle("Decline invitation to Kyoto Trip"));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Invitation declined."));
    await waitFor(() => expect(screen.queryByText("Kyoto Trip")).not.toBeInTheDocument());
    expect(declineInvitation).toHaveBeenCalledWith("invite-1");
  });

  it("shows an error toast and keeps the row when decline fails", async () => {
    const user = userEvent.setup();
    vi.mocked(declineInvitation).mockResolvedValue({
      status: "error",
      message: "This invitation is no longer pending.",
    });

    render(<PendingInvitationsList invitations={[INVITATION]} />);
    await user.click(screen.getByTitle("Decline invitation to Kyoto Trip"));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This invitation is no longer pending."));
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByText("Kyoto Trip")).toBeInTheDocument();
  });

  it("declining one invitation does not remove other rows", async () => {
    const user = userEvent.setup();
    vi.mocked(declineInvitation).mockResolvedValue({ status: "declined" });

    render(<PendingInvitationsList invitations={[INVITATION, SECOND_INVITATION]} />);
    await user.click(screen.getByTitle("Decline invitation to Kyoto Trip"));

    await waitFor(() => expect(screen.queryByText("Kyoto Trip")).not.toBeInTheDocument());
    expect(screen.getByText("Oslo Trip")).toBeInTheDocument();
  });

  it("shows invitations that arrive through new props after a live refresh", () => {
    const { rerender } = render(<PendingInvitationsList invitations={[INVITATION]} />);

    rerender(<PendingInvitationsList invitations={[INVITATION, SECOND_INVITATION]} />);

    expect(screen.getByText("Oslo Trip")).toBeInTheDocument();
    expect(screen.getByText("Kyoto Trip")).toBeInTheDocument();
  });

  it("drops invitations that disappear from new props, such as a rescinded one", () => {
    const { rerender, container } = render(<PendingInvitationsList invitations={[INVITATION]} />);

    rerender(<PendingInvitationsList invitations={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("keeps a locally declined invitation hidden when stale props re-deliver it", async () => {
    const user = userEvent.setup();
    vi.mocked(declineInvitation).mockResolvedValue({ status: "declined" });

    const { rerender } = render(<PendingInvitationsList invitations={[INVITATION, SECOND_INVITATION]} />);
    await user.click(screen.getByTitle("Decline invitation to Kyoto Trip"));
    await waitFor(() => expect(screen.queryByText("Kyoto Trip")).not.toBeInTheDocument());

    rerender(<PendingInvitationsList invitations={[INVITATION, SECOND_INVITATION]} />);

    expect(screen.queryByText("Kyoto Trip")).not.toBeInTheDocument();
    expect(screen.getByText("Oslo Trip")).toBeInTheDocument();
  });
});

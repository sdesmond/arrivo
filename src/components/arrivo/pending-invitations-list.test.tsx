import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { acceptInvitation, declineInvitation } from "@/lib/api/contract/sharing";
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

vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  api: vi.fn(),
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
    vi.mocked(api).mockResolvedValue({ status: "accepted", tripId: "trip-1" });

    render(<PendingInvitationsList invitations={[INVITATION]} />);
    await user.click(screen.getByTitle("Accept invitation to Kyoto Trip"));

    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith("/trips/trip-1"));
    expect(api).toHaveBeenCalledExactlyOnceWith(acceptInvitation, {
      params: { invitationId: "invite-1" },
      body: {},
      idempotencyKey: expect.any(String),
    });
  });

  it("shows an error toast and keeps the row when accept fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api).mockRejectedValue(new ApiClientError(409, "conflict", "This invitation has expired."));

    render(<PendingInvitationsList invitations={[INVITATION]} />);
    await user.click(screen.getByTitle("Accept invitation to Kyoto Trip"));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This invitation has expired."));
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(screen.getByText("Kyoto Trip")).toBeInTheDocument();
  });

  it.each([
    ["accept", "Accept"],
    ["decline", "Decline"],
  ])("shows a not-found toast and keeps the row when %s hits a concealed 404", async (_name, label) => {
    const user = userEvent.setup();
    vi.mocked(api).mockRejectedValue(new ApiClientError(404, "not_found", "Resource not found."));

    render(<PendingInvitationsList invitations={[INVITATION]} />);
    await user.click(screen.getByTitle(`${label} invitation to Kyoto Trip`));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Invitation not found."));
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(screen.getByTitle(`${label} invitation to Kyoto Trip`)).toBeEnabled();
  });

  it("shows a generic toast for an unexpected failure", async () => {
    const user = userEvent.setup();
    vi.mocked(api).mockRejectedValue(new Error("boom"));

    render(<PendingInvitationsList invitations={[INVITATION]} />);
    await user.click(screen.getByTitle("Decline invitation to Kyoto Trip"));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not save changes. Try again."));
  });

  it("removes the row on a successful decline without a confirmation toast", async () => {
    const user = userEvent.setup();
    vi.mocked(api).mockResolvedValue({ status: "declined" });

    render(<PendingInvitationsList invitations={[INVITATION]} />);
    await user.click(screen.getByTitle("Decline invitation to Kyoto Trip"));

    await waitFor(() => expect(screen.queryByText("Kyoto Trip")).not.toBeInTheDocument());
    expect(api).toHaveBeenCalledExactlyOnceWith(declineInvitation, {
      params: { invitationId: "invite-1" },
      body: {},
      idempotencyKey: expect.any(String),
    });
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("shows an error toast and keeps the row when decline fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api).mockRejectedValue(new ApiClientError(409, "conflict", "This invitation is no longer pending."));

    render(<PendingInvitationsList invitations={[INVITATION]} />);
    await user.click(screen.getByTitle("Decline invitation to Kyoto Trip"));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This invitation is no longer pending."));
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByText("Kyoto Trip")).toBeInTheDocument();
  });

  it("declining one invitation does not remove other rows", async () => {
    const user = userEvent.setup();
    vi.mocked(api).mockResolvedValue({ status: "declined" });

    render(<PendingInvitationsList invitations={[INVITATION, SECOND_INVITATION]} />);
    await user.click(screen.getByTitle("Decline invitation to Kyoto Trip"));

    await waitFor(() => expect(screen.queryByText("Kyoto Trip")).not.toBeInTheDocument());
    expect(screen.getByText("Oslo Trip")).toBeInTheDocument();
  });

  it("retries an uncertain failure with the same key and completes normally", async () => {
    const user = userEvent.setup();
    vi.mocked(api)
      .mockRejectedValueOnce(new ApiClientError(0, "network_error", "Offline"))
      .mockResolvedValueOnce({ status: "accepted", tripId: "trip-1" });
    render(<PendingInvitationsList invitations={[INVITATION]} />);
    await user.click(screen.getByTitle("Accept invitation to Kyoto Trip"));
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith("/trips/trip-1"));
    expect(vi.mocked(api).mock.calls[0][1]).toEqual(vi.mocked(api).mock.calls[1][1]);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("retries HTTP 408 and retains its key for a later attempt after both requests time out", async () => {
    const user = userEvent.setup();
    vi.mocked(api)
      .mockRejectedValueOnce(new ApiClientError(408, "timeout", "Timed out"))
      .mockRejectedValueOnce(new ApiClientError(408, "timeout", "Timed out"))
      .mockResolvedValueOnce({ status: "accepted", tripId: "trip-1" });
    render(<PendingInvitationsList invitations={[INVITATION]} />);
    const button = screen.getByTitle("Accept invitation to Kyoto Trip");
    await user.click(button);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Timed out"));
    await user.click(button);
    await waitFor(() => expect(mockRouterPush).toHaveBeenCalledWith("/trips/trip-1"));
    const calls = vi.mocked(api).mock.calls;
    expect(calls).toHaveLength(3);
    expect(calls[0][1].idempotencyKey).toBe(calls[1][1].idempotencyKey);
    expect(calls[1][1].idempotencyKey).toBe(calls[2][1].idempotencyKey);
  });

  it("uses distinct keys for decisions after an uncertain failure and forgets definitive rejections", async () => {
    const user = userEvent.setup();
    vi.mocked(api).mockRejectedValue(new ApiClientError(0, "timeout", "Timeout"));
    render(<PendingInvitationsList invitations={[INVITATION, SECOND_INVITATION]} />);
    await user.click(screen.getByTitle("Accept invitation to Kyoto Trip"));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    await user.click(screen.getByTitle("Decline invitation to Kyoto Trip"));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(4));
    const calls = vi.mocked(api).mock.calls;
    expect(calls[0][1].idempotencyKey).not.toBe(calls[2][1].idempotencyKey);
  });

  it("retains a key after uncertain failures but replaces it after a definitive rejection", async () => {
    const user = userEvent.setup();
    vi.mocked(api)
      .mockRejectedValueOnce(new ApiClientError(0, "timeout", "Timeout"))
      .mockRejectedValueOnce(new ApiClientError(0, "timeout", "Timeout"))
      .mockRejectedValueOnce(new ApiClientError(409, "conflict", "Expired"))
      .mockRejectedValueOnce(new ApiClientError(404, "not_found", "Gone"));
    render(<PendingInvitationsList invitations={[INVITATION]} />);
    const button = screen.getByTitle("Accept invitation to Kyoto Trip");
    await user.click(button);
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    await waitFor(() => expect(api).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    await waitFor(() => expect(api).toHaveBeenCalledTimes(4));
    const calls = vi.mocked(api).mock.calls;
    expect(calls[0][1].idempotencyKey).toBe(calls[2][1].idempotencyKey);
    expect(calls[2][1].idempotencyKey).not.toBe(calls[3][1].idempotencyKey);
  });

  it("does not retry or navigate after unmount", async () => {
    const user = userEvent.setup();
    let rejectRequest!: (error: Error) => void;
    vi.mocked(api).mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          rejectRequest = reject;
        })
    );
    const { unmount } = render(<PendingInvitationsList invitations={[INVITATION]} />);
    await user.click(screen.getByTitle("Accept invitation to Kyoto Trip"));
    unmount();
    rejectRequest(new ApiClientError(0, "network_error", "Offline"));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1));
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("prevents double submission while allowing another invitation its own key", async () => {
    vi.mocked(api).mockImplementation(() => new Promise(() => {}));
    render(<PendingInvitationsList invitations={[INVITATION, SECOND_INVITATION]} />);
    const first = screen.getByTitle("Accept invitation to Kyoto Trip");
    fireEvent.click(first);
    fireEvent.click(first);
    fireEvent.click(screen.getByTitle("Accept invitation to Oslo Trip"));
    expect(api).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(api).mock.calls;
    expect(calls[0][1].idempotencyKey).not.toBe(calls[1][1].idempotencyKey);
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
    vi.mocked(api).mockResolvedValue({ status: "declined" });

    const { rerender } = render(<PendingInvitationsList invitations={[INVITATION, SECOND_INVITATION]} />);
    await user.click(screen.getByTitle("Decline invitation to Kyoto Trip"));
    await waitFor(() => expect(screen.queryByText("Kyoto Trip")).not.toBeInTheDocument());

    rerender(<PendingInvitationsList invitations={[INVITATION, SECOND_INVITATION]} />);

    expect(screen.queryByText("Kyoto Trip")).not.toBeInTheDocument();
    expect(screen.getByText("Oslo Trip")).toBeInTheDocument();
  });
});

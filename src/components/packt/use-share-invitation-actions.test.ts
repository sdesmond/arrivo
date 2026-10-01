import { act, renderHook, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { Invitation } from "@/data/types";
import type { ShareDialogData } from "./use-trip-share-dialog-controller";
import { useShareInvitationActions } from "./use-share-invitation-actions";

const mockRescindShareInvitation = vi.fn();
const mockResendShareInvitation = vi.fn();
const mockDismissShareInvitation = vi.fn();

vi.mock("@/app/(app)/trips/[tripId]/actions", () => ({
  rescindShareInvitation: (...args: unknown[]) => mockRescindShareInvitation(...args),
  resendShareInvitation: (...args: unknown[]) => mockResendShareInvitation(...args),
  dismissShareInvitation: (...args: unknown[]) => mockDismissShareInvitation(...args),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const pendingInvitation: Invitation = {
  id: "invite-1",
  tripId: "trip-1",
  email: "pending@example.com",
  role: "viewer",
  status: "pending",
  expiresAt: "2099-01-01T00:00:00.000Z",
  invitedBy: "owner-1",
};

const declinedInvitation: Invitation = { ...pendingInvitation, id: "invite-2", status: "declined" };

function renderActions(
  initialData: ShareDialogData | null = {
    collaborators: [],
    currentCollaboratorId: null,
    invitations: [pendingInvitation, declinedInvitation],
  }
) {
  const isCurrentRef = { current: true };
  const suppressedInvitationIdsRef = { current: new Set<string>() };
  const rendered = renderHook(() => {
    const [data, setData] = useState<ShareDialogData | null>(initialData);
    const actions = useShareInvitationActions({ isCurrentRef, setData, suppressedInvitationIdsRef, tripId: "trip-1" });
    return { actions, data };
  });
  return { ...rendered, isCurrentRef, suppressedInvitationIdsRef };
}

describe("useShareInvitationActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResendShareInvitation.mockResolvedValue({ status: "success", expiresAt: "2099-02-01T00:00:00.000Z" });
    mockRescindShareInvitation.mockResolvedValue({ status: "success" });
    mockDismissShareInvitation.mockResolvedValue({ status: "success" });
  });

  it("marks a row pending while its action runs, then clears it", async () => {
    let resolveResend: (value: { status: "success"; expiresAt: string }) => void = () => {};
    mockResendShareInvitation.mockReturnValue(new Promise((resolve) => (resolveResend = resolve)));
    const { result } = renderActions();

    let resendPromise: Promise<void>;
    act(() => {
      resendPromise = result.current.actions.resendPendingInvitation(pendingInvitation);
    });
    expect(result.current.actions.pendingActions).toEqual({ "invite-1": "resend" });

    await act(async () => {
      resolveResend({ status: "success", expiresAt: "2099-02-01T00:00:00.000Z" });
      await resendPromise!;
    });
    expect(result.current.actions.pendingActions).toEqual({});
  });

  it("patches the resent invitation's expiry and confirms", async () => {
    const { result } = renderActions();

    await act(async () => result.current.actions.resendPendingInvitation(pendingInvitation));

    expect(mockResendShareInvitation).toHaveBeenCalledWith("trip-1", "invite-1");
    expect(result.current.data?.invitations[0]?.expiresAt).toBe("2099-02-01T00:00:00.000Z");
    expect(result.current.data?.invitations[1]?.expiresAt).toBe("2099-01-01T00:00:00.000Z");
    expect(toast.success).toHaveBeenCalledWith("Invitation resent.");
  });

  it("leaves null data alone when a resend succeeds before data loaded", async () => {
    const { result } = renderActions(null);

    await act(async () => result.current.actions.resendPendingInvitation(pendingInvitation));

    expect(result.current.data).toBeNull();
  });

  it("toasts a resend error result and a thrown resend", async () => {
    mockResendShareInvitation.mockResolvedValueOnce({ status: "error", message: "Invitation is no longer pending." });
    mockResendShareInvitation.mockRejectedValueOnce(new Error("network"));
    const { result } = renderActions();

    await act(async () => result.current.actions.resendPendingInvitation(pendingInvitation));
    await act(async () => result.current.actions.resendPendingInvitation(pendingInvitation));

    expect(toast.error).toHaveBeenCalledWith("Invitation is no longer pending.");
    expect(toast.error).toHaveBeenCalledWith("Could not resend invitation.");
  });

  it("removes and suppresses a rescinded invitation", async () => {
    const { result, suppressedInvitationIdsRef } = renderActions();

    await act(async () => result.current.actions.rescindPendingInvitation(pendingInvitation));

    expect(mockRescindShareInvitation).toHaveBeenCalledWith("trip-1", "invite-1");
    expect(result.current.data?.invitations).toEqual([declinedInvitation]);
    expect(suppressedInvitationIdsRef.current.has("invite-1")).toBe(true);
    expect(toast.success).toHaveBeenCalledWith("Invitation rescinded.");
  });

  it("removes and suppresses a dismissed invitation", async () => {
    const { result, suppressedInvitationIdsRef } = renderActions();

    await act(async () => result.current.actions.dismissDeclinedInvitation(declinedInvitation));

    expect(mockDismissShareInvitation).toHaveBeenCalledWith("trip-1", "invite-2");
    expect(result.current.data?.invitations).toEqual([pendingInvitation]);
    expect(suppressedInvitationIdsRef.current.has("invite-2")).toBe(true);
    expect(toast.success).toHaveBeenCalledWith("Invitation dismissed.");
  });

  it("leaves null data alone when a removal succeeds before data loaded", async () => {
    const { result } = renderActions(null);

    await act(async () => result.current.actions.rescindPendingInvitation(pendingInvitation));

    expect(result.current.data).toBeNull();
  });

  it("keeps the row and toasts on a removal error result", async () => {
    mockRescindShareInvitation.mockResolvedValue({ status: "error", message: "Invitation not found." });
    const { result, suppressedInvitationIdsRef } = renderActions();

    await act(async () => result.current.actions.rescindPendingInvitation(pendingInvitation));

    expect(toast.error).toHaveBeenCalledWith("Invitation not found.");
    expect(result.current.data?.invitations).toHaveLength(2);
    expect(suppressedInvitationIdsRef.current.size).toBe(0);
  });

  it("toasts action-specific messages when a removal throws", async () => {
    mockRescindShareInvitation.mockRejectedValue(new Error("network"));
    mockDismissShareInvitation.mockRejectedValue(new Error("network"));
    const { result } = renderActions();

    await act(async () => result.current.actions.rescindPendingInvitation(pendingInvitation));
    await act(async () => result.current.actions.dismissDeclinedInvitation(declinedInvitation));

    expect(toast.error).toHaveBeenCalledWith("Could not rescind invitation.");
    expect(toast.error).toHaveBeenCalledWith("Could not dismiss invitation.");
  });

  it("skips state updates and toasts once the dialog is gone", async () => {
    mockRescindShareInvitation.mockRejectedValueOnce(new Error("network"));
    mockResendShareInvitation.mockRejectedValueOnce(new Error("network"));
    const { result, isCurrentRef } = renderActions();
    isCurrentRef.current = false;

    await act(async () => result.current.actions.rescindPendingInvitation(pendingInvitation));
    await act(async () => result.current.actions.resendPendingInvitation(pendingInvitation));
    await act(async () => result.current.actions.dismissDeclinedInvitation(declinedInvitation));

    await waitFor(() => expect(mockDismissShareInvitation).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(result.current.data?.invitations).toHaveLength(2);
    expect(result.current.actions.pendingActions).toEqual({
      "invite-1": "resend",
      "invite-2": "dismiss",
    });
  });
});

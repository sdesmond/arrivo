// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireUser,
  mockRevalidatePath,
  mockDismissInvitation,
  mockGetContributorsAndInvitations,
  mockRescindInvitation,
  mockResendInvitation,
  mockSaveContributorChanges,
} = vi.hoisted(() => ({
  mockRequireUser: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockDismissInvitation: vi.fn(),
  mockGetContributorsAndInvitations: vi.fn(),
  mockRescindInvitation: vi.fn(),
  mockResendInvitation: vi.fn(),
  mockSaveContributorChanges: vi.fn(),
}));

vi.mock("@/lib/auth-helpers", () => ({ requireUser: mockRequireUser }));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/lib/invitations", () => ({ resendInvitation: mockResendInvitation }));
vi.mock("@/lib/queries", () => ({ getContributorsAndInvitations: mockGetContributorsAndInvitations }));
vi.mock("../actions", () => ({
  dismissInvitation: mockDismissInvitation,
  rescindInvitation: mockRescindInvitation,
  saveContributorChanges: mockSaveContributorChanges,
}));

import {
  dismissShareInvitation,
  getShareDialogData,
  rescindShareInvitation,
  resendShareInvitation,
  saveContributorChanges,
} from "./actions";
import { type ContributorChange } from "@/data/types";

describe("share invitation actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireUser.mockResolvedValue({ id: "manager-1" });
    mockResendInvitation.mockResolvedValue({ status: "success", expiresAt: "2026-09-04T12:00:00.000Z" });
    mockRescindInvitation.mockResolvedValue({ status: "success" });
    mockDismissInvitation.mockResolvedValue({ status: "success" });
    mockSaveContributorChanges.mockResolvedValue({ status: "success" });
    mockGetContributorsAndInvitations.mockResolvedValue({
      collaborators: [],
      currentCollaboratorId: "manager-row-1",
      invitations: [],
    });
  });

  it("delegates to getContributorsAndInvitations with the caller's id", async () => {
    await expect(getShareDialogData("trip-1")).resolves.toEqual({
      collaborators: [],
      currentCollaboratorId: "manager-row-1",
      invitations: [],
    });

    expect(mockGetContributorsAndInvitations).toHaveBeenCalledWith("trip-1", "manager-1");
  });

  it("propagates a rejection from getContributorsAndInvitations", async () => {
    mockGetContributorsAndInvitations.mockRejectedValue(new Error("not found"));

    await expect(getShareDialogData("trip-1")).rejects.toThrow("not found");
  });

  it("delegates a resend before revalidating the trip", async () => {
    await expect(resendShareInvitation("trip-1", "invite-1")).resolves.toEqual({
      status: "success",
      expiresAt: "2026-09-04T12:00:00.000Z",
    });

    expect(mockResendInvitation).toHaveBeenCalledWith("invite-1", "trip-1", "manager-1");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("delegates a rescind before revalidating the trip", async () => {
    await expect(rescindShareInvitation("trip-1", "invite-1")).resolves.toEqual({ status: "success" });

    expect(mockRescindInvitation).toHaveBeenCalledWith("trip-1", "invite-1");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("delegates a dismissal and revalidates the trip after success", async () => {
    await expect(dismissShareInvitation("trip-1", "invite-1")).resolves.toEqual({ status: "success" });

    expect(mockDismissInvitation).toHaveBeenCalledWith("trip-1", "invite-1");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("does not revalidate when a dismissal result is rejected", async () => {
    mockDismissInvitation.mockResolvedValue({ status: "error", message: "Invitation is still pending." });

    await expect(dismissShareInvitation("trip-1", "invite-1")).resolves.toEqual({
      status: "error",
      message: "Invitation is still pending.",
    });

    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("propagates a rejection from underlying share invitation actions without revalidating", async () => {
    mockResendInvitation.mockRejectedValue(new Error("not found"));
    mockRescindInvitation.mockRejectedValue(new Error("not found"));
    mockDismissInvitation.mockRejectedValue(new Error("not found"));

    await expect(resendShareInvitation("trip-1", "invite-1")).rejects.toThrow("not found");
    await expect(rescindShareInvitation("trip-1", "invite-1")).rejects.toThrow("not found");
    await expect(dismissShareInvitation("trip-1", "invite-1")).rejects.toThrow("not found");

    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("delegates saveContributorChanges and revalidates the detail route on success", async () => {
    const changes: ContributorChange[] = [
      { type: "role", collaboratorId: "collab-1", fromRole: "editor", toRole: "viewer" },
      { type: "remove", collaboratorId: "collab-2" },
    ];

    await expect(saveContributorChanges("trip-1", changes)).resolves.toEqual({ status: "success" });

    expect(mockSaveContributorChanges).toHaveBeenCalledWith("trip-1", changes);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("does not revalidate when a saveContributorChanges batch is rejected", async () => {
    mockSaveContributorChanges.mockResolvedValue({ status: "error", message: "Batch rejected." });

    await expect(saveContributorChanges("trip-1", [{ type: "remove", collaboratorId: "collab-1" }])).resolves.toEqual({
      status: "error",
      message: "Batch rejected.",
    });

    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });
});

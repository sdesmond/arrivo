import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Collaborator, Invitation } from "@/data/types";
import { useTripShareDialogController } from "./use-trip-share-dialog-controller";

const mockGetShareDialogData = vi.fn();
const mockRescindShareInvitation = vi.fn();
const mockResendShareInvitation = vi.fn();
const mockDismissShareInvitation = vi.fn();
const mockInviteContributor = vi.fn();
const mockSaveContributorChanges = vi.fn();

vi.mock("@/app/(app)/trips/[tripId]/actions", () => ({
  getShareDialogData: (...args: unknown[]) => mockGetShareDialogData(...args),
  rescindShareInvitation: (...args: unknown[]) => mockRescindShareInvitation(...args),
  resendShareInvitation: (...args: unknown[]) => mockResendShareInvitation(...args),
  dismissShareInvitation: (...args: unknown[]) => mockDismissShareInvitation(...args),
  saveContributorChanges: (...args: unknown[]) => mockSaveContributorChanges(...args),
}));

vi.mock("@/app/(app)/trips/actions", () => ({
  inviteContributor: (...args: unknown[]) => mockInviteContributor(...args),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const manager: Collaborator = {
  id: "manager-1",
  email: "manager@example.com",
  initials: "MA",
  isCreator: false,
  name: "Manager",
  role: "manager",
};

const pendingInvitation: Invitation = {
  id: "invite-1",
  tripId: "trip-1",
  email: "pending@example.com",
  role: "viewer",
  status: "pending",
  expiresAt: "2099-01-01T00:00:00.000Z",
  invitedBy: "owner-1",
};

function createDeferred<T>() {
  let resolvePromise: (value: T) => void;
  let rejectPromise: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, reject: rejectPromise!, resolve: resolvePromise! };
}

describe("useTripShareDialogController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetShareDialogData.mockResolvedValue({
      collaborators: [manager],
      currentCollaboratorId: "manager-1",
      invitations: [pendingInvitation],
    });
    mockInviteContributor.mockResolvedValue({ status: "invited" });
    mockRescindShareInvitation.mockResolvedValue({ status: "success" });
    mockResendShareInvitation.mockResolvedValue({ status: "success", expiresAt: "2099-02-01T00:00:00.000Z" });
    mockDismissShareInvitation.mockResolvedValue({ status: "success" });
    mockSaveContributorChanges.mockResolvedValue({ status: "success" });
  });

  it("suppresses a successfully rescinded invitation from an overlapping refetch", async () => {
    const refetch = createDeferred<{
      collaborators: Collaborator[];
      currentCollaboratorId: string | null;
      invitations: Invitation[];
    }>();
    mockGetShareDialogData.mockResolvedValueOnce({
      collaborators: [manager],
      currentCollaboratorId: "manager-1",
      invitations: [pendingInvitation],
    });
    mockGetShareDialogData.mockReturnValueOnce(refetch.promise);
    const { result } = renderHook(() => useTripShareDialogController({ onRequestClose: vi.fn(), tripId: "trip-1" }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.setEmail("new@example.com"));
    let invitePromise: Promise<void>;
    act(() => {
      invitePromise = result.current.handleInvite();
    });
    await waitFor(() => expect(mockGetShareDialogData).toHaveBeenCalledTimes(2));

    await act(async () => result.current.rescindPendingInvitation(pendingInvitation));
    expect(result.current.data?.invitations).toEqual([]);

    await act(async () => {
      refetch.resolve({
        collaborators: [manager],
        currentCollaboratorId: "manager-1",
        invitations: [pendingInvitation],
      });
      await invitePromise!;
    });

    expect(result.current.data?.invitations).toEqual([]);
  });

  it("does not suppress an invitation when rescinding fails", async () => {
    mockRescindShareInvitation.mockResolvedValue({ status: "error", message: "Invitation is no longer pending." });
    const { result } = renderHook(() => useTripShareDialogController({ onRequestClose: vi.fn(), tripId: "trip-1" }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => result.current.rescindPendingInvitation(pendingInvitation));
    act(() => result.current.setEmail("new@example.com"));
    await act(async () => result.current.handleInvite());

    expect(result.current.data?.invitations).toEqual([pendingInvitation]);
  });

  it("rejects collaborator edits and invites while saving, then restores interaction", async () => {
    const save = createDeferred<{ status: "success" }>();
    mockSaveContributorChanges.mockReturnValue(save.promise);
    const onRequestClose = vi.fn();
    const { result } = renderHook(() => useTripShareDialogController({ onRequestClose, tripId: "trip-1" }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.stageRemoval(manager));
    let savePromise: Promise<void>;
    act(() => {
      savePromise = result.current.handleSaveChanges();
    });
    await waitFor(() => expect(result.current.isSavingChanges).toBe(true));

    act(() => {
      result.current.stageRoleChange(manager, "viewer");
      result.current.setEmail("blocked@example.com");
    });
    await act(async () => result.current.handleInvite());

    expect(mockInviteContributor).not.toHaveBeenCalled();
    expect(result.current.stagedChanges["manager-1"]).toEqual({ type: "remove", collaboratorId: "manager-1" });

    await act(async () => {
      save.resolve({ status: "success" });
      await savePromise!;
    });
    expect(result.current.isSavingChanges).toBe(false);
    expect(onRequestClose).toHaveBeenCalledOnce();
  });

  it("retains the save error and reports an out-of-date warning when stale recovery fails", async () => {
    mockSaveContributorChanges.mockResolvedValue({
      status: "error",
      message: "A contributor changed since you started editing.",
      stale: true,
    });
    mockGetShareDialogData
      .mockResolvedValueOnce({
        collaborators: [manager],
        currentCollaboratorId: "manager-1",
        invitations: [],
      })
      .mockRejectedValueOnce(new Error("refresh failed"));
    const onRequestClose = vi.fn();
    const { result } = renderHook(() => useTripShareDialogController({ onRequestClose, tripId: "trip-1" }));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.stageRemoval(manager));
    await act(async () => result.current.handleSaveChanges());

    expect(result.current.saveError).toBe("A contributor changed since you started editing.");
    expect(result.current.recoveryWarning).toBe("Sharing details may be out of date. Close and reopen to refresh.");
    expect(result.current.stagedChanges).toEqual({});
    expect(result.current.isSavingChanges).toBe(false);
    expect(onRequestClose).not.toHaveBeenCalled();
  });

  const UNMOUNTED_UPDATE_WARNING = /Can't perform a React state update on an unmounted component/;

  it("does not update state when the dialog unmounts mid-save", async () => {
    const save = createDeferred<{ status: "success" }>();
    mockSaveContributorChanges.mockReturnValue(save.promise);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result, unmount } = renderHook(() =>
      useTripShareDialogController({ onRequestClose: vi.fn(), tripId: "trip-1" })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.stageRemoval(manager));
    let savePromise: Promise<void>;
    act(() => {
      savePromise = result.current.handleSaveChanges();
    });
    unmount();

    await act(async () => {
      save.resolve({ status: "success" });
      await savePromise!;
    });

    expect(consoleErrorSpy.mock.calls.some((call) => UNMOUNTED_UPDATE_WARNING.test(String(call[0])))).toBe(false);
    consoleErrorSpy.mockRestore();
  });

  it("does not update state when the dialog unmounts mid-resend", async () => {
    const resend = createDeferred<{ status: "success"; expiresAt: string }>();
    mockResendShareInvitation.mockReturnValue(resend.promise);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result, unmount } = renderHook(() =>
      useTripShareDialogController({ onRequestClose: vi.fn(), tripId: "trip-1" })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let resendPromise: Promise<void>;
    act(() => {
      resendPromise = result.current.resendPendingInvitation(pendingInvitation);
    });
    unmount();

    await act(async () => {
      resend.resolve({ status: "success", expiresAt: "2099-03-01T00:00:00.000Z" });
      await resendPromise!;
    });

    expect(consoleErrorSpy.mock.calls.some((call) => UNMOUNTED_UPDATE_WARNING.test(String(call[0])))).toBe(false);
    consoleErrorSpy.mockRestore();
  });

  it("does not update state when the dialog unmounts mid-rescind", async () => {
    const rescind = createDeferred<{ status: "success" }>();
    mockRescindShareInvitation.mockReturnValue(rescind.promise);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { result, unmount } = renderHook(() =>
      useTripShareDialogController({ onRequestClose: vi.fn(), tripId: "trip-1" })
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let rescindPromise: Promise<void>;
    act(() => {
      rescindPromise = result.current.rescindPendingInvitation(pendingInvitation);
    });
    unmount();

    await act(async () => {
      rescind.resolve({ status: "success" });
      await rescindPromise!;
    });

    expect(consoleErrorSpy.mock.calls.some((call) => UNMOUNTED_UPDATE_WARNING.test(String(call[0])))).toBe(false);
    consoleErrorSpy.mockRestore();
  });
});

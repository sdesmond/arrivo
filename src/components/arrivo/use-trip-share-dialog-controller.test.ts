import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSyncEventType } from "@/data/types";
import type { Collaborator, Invitation } from "@/data/types";
import { MockEventSource, tripSource } from "@/lib/live-sync-test-helpers";
import { resetLiveSyncChannelsForTest } from "@/lib/use-live-sync";
import { toast } from "sonner";
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
  username: "manager",
  initials: "MA",
  isCreator: false,
  name: "Manager",
  role: "manager",
};

const pendingInvitation: Invitation = {
  id: "invite-1",
  tripId: "trip-1",
  inviteeUsername: "pending",
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

const editor: Collaborator = {
  id: "editor-1",
  username: "editor",
  initials: "ED",
  isCreator: false,
  name: "Editor",
  role: "editor",
};

const acceptedCollaborator: Collaborator = {
  id: "collaborator-2",
  username: "pending",
  initials: "PE",
  isCreator: false,
  name: "Pending Person",
  role: "viewer",
};

type ShareData = { collaborators: Collaborator[]; currentCollaboratorId: string | null; invitations: Invitation[] };

function emitTripEvent(type: LiveSyncEventType): void {
  act(() => tripSource().emitMessage(JSON.stringify({ type, tripId: "trip-1" })));
}

describe("useTripShareDialogController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetLiveSyncChannelsForTest();
    MockEventSource.instances = [];
    vi.stubGlobal("EventSource", MockEventSource);
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

  afterEach(() => {
    resetLiveSyncChannelsForTest();
    vi.unstubAllGlobals();
  });

  describe("live membership updates", () => {
    it("joins the trip channel", async () => {
      const { result } = renderHook(() => useTripShareDialogController({ onRequestClose: vi.fn(), tripId: "trip-1" }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(tripSource().url).toBe("/api/trips/trip-1/events");
    });

    it("refetches on membership-changed so an accepted invitation becomes a collaborator", async () => {
      const { result } = renderHook(() => useTripShareDialogController({ onRequestClose: vi.fn(), tripId: "trip-1" }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      mockGetShareDialogData.mockResolvedValueOnce({
        collaborators: [manager, acceptedCollaborator],
        currentCollaboratorId: "manager-1",
        invitations: [],
      });

      emitTripEvent(LiveSyncEventType.MembershipChanged);

      await waitFor(() => expect(result.current.data?.collaborators).toEqual([manager, acceptedCollaborator]));
      expect(result.current.data?.invitations).toEqual([]);
    });

    it("shows a declined invitation without a reload", async () => {
      const { result } = renderHook(() => useTripShareDialogController({ onRequestClose: vi.fn(), tripId: "trip-1" }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      mockGetShareDialogData.mockResolvedValueOnce({
        collaborators: [manager],
        currentCollaboratorId: "manager-1",
        invitations: [{ ...pendingInvitation, status: "declined" }],
      });

      emitTripEvent(LiveSyncEventType.MembershipChanged);

      await waitFor(() => expect(result.current.data?.invitations[0]?.status).toBe("declined"));
    });

    it("drops a collaborator who left and discards changes staged for them", async () => {
      mockGetShareDialogData.mockResolvedValueOnce({
        collaborators: [manager, editor],
        currentCollaboratorId: "manager-1",
        invitations: [],
      });
      const { result } = renderHook(() => useTripShareDialogController({ onRequestClose: vi.fn(), tripId: "trip-1" }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      act(() => {
        result.current.stageRoleChange(editor, "viewer");
        result.current.stageRoleChange(manager, "editor");
      });
      mockGetShareDialogData.mockResolvedValueOnce({
        collaborators: [manager],
        currentCollaboratorId: "manager-1",
        invitations: [],
      });

      emitTripEvent(LiveSyncEventType.MembershipChanged);

      await waitFor(() => expect(result.current.data?.collaborators).toEqual([manager]));
      expect(Object.keys(result.current.stagedChanges)).toEqual(["manager-1"]);
    });

    it("ignores non-membership trip events", async () => {
      const { result } = renderHook(() => useTripShareDialogController({ onRequestClose: vi.fn(), tripId: "trip-1" }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      emitTripEvent(LiveSyncEventType.ItineraryChanged);

      expect(mockGetShareDialogData).toHaveBeenCalledOnce();
    });

    it("applies only the latest of overlapping refetches", async () => {
      const slow = createDeferred<ShareData>();
      const { result } = renderHook(() => useTripShareDialogController({ onRequestClose: vi.fn(), tripId: "trip-1" }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      mockGetShareDialogData.mockReturnValueOnce(slow.promise).mockResolvedValueOnce({
        collaborators: [manager, acceptedCollaborator],
        currentCollaboratorId: "manager-1",
        invitations: [],
      });

      emitTripEvent(LiveSyncEventType.MembershipChanged);
      emitTripEvent(LiveSyncEventType.MembershipChanged);
      await waitFor(() => expect(result.current.data?.collaborators).toEqual([manager, acceptedCollaborator]));

      await act(async () => {
        slow.resolve({
          collaborators: [manager],
          currentCollaboratorId: "manager-1",
          invitations: [pendingInvitation],
        });
        await slow.promise;
      });

      expect(result.current.data?.collaborators).toEqual([manager, acceptedCollaborator]);
      expect(result.current.data?.invitations).toEqual([]);
    });

    it("keeps the last good data when a live refetch fails", async () => {
      const { result } = renderHook(() => useTripShareDialogController({ onRequestClose: vi.fn(), tripId: "trip-1" }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      mockGetShareDialogData.mockRejectedValueOnce(new Error("network"));

      emitTripEvent(LiveSyncEventType.MembershipChanged);
      await waitFor(() => expect(mockGetShareDialogData).toHaveBeenCalledTimes(2));

      expect(result.current.data?.invitations).toEqual([pendingInvitation]);
      expect(result.current.loadError).toBe(false);
    });

    it("keeps a rescinded invitation hidden when a live refetch still returns it", async () => {
      const { result } = renderHook(() => useTripShareDialogController({ onRequestClose: vi.fn(), tripId: "trip-1" }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      await act(async () => result.current.rescindPendingInvitation(pendingInvitation));

      emitTripEvent(LiveSyncEventType.MembershipChanged);
      await waitFor(() => expect(mockGetShareDialogData).toHaveBeenCalledTimes(2));

      expect(result.current.data?.invitations).toEqual([]);
    });

    it("defers a refetch that arrives mid-save until a failed save settles", async () => {
      const save = createDeferred<{ status: "error"; message: string }>();
      mockSaveContributorChanges.mockReturnValue(save.promise);
      const { result } = renderHook(() => useTripShareDialogController({ onRequestClose: vi.fn(), tripId: "trip-1" }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      act(() => result.current.stageRoleChange(manager, "editor"));
      let savePromise: Promise<void>;
      act(() => {
        savePromise = result.current.handleSaveChanges();
      });

      emitTripEvent(LiveSyncEventType.MembershipChanged);
      expect(mockGetShareDialogData).toHaveBeenCalledOnce();

      await act(async () => {
        save.resolve({ status: "error", message: "Could not save." });
        await savePromise!;
      });

      await waitFor(() => expect(mockGetShareDialogData).toHaveBeenCalledTimes(2));
    });

    it("ignores a first-load failure once a newer live refetch has succeeded", async () => {
      const firstLoad = createDeferred<ShareData>();
      mockGetShareDialogData.mockReset();
      mockGetShareDialogData.mockReturnValueOnce(firstLoad.promise).mockResolvedValueOnce({
        collaborators: [manager, acceptedCollaborator],
        currentCollaboratorId: "manager-1",
        invitations: [],
      });
      const { result } = renderHook(() => useTripShareDialogController({ onRequestClose: vi.fn(), tripId: "trip-1" }));

      emitTripEvent(LiveSyncEventType.MembershipChanged);
      await waitFor(() => expect(result.current.data?.collaborators).toEqual([manager, acceptedCollaborator]));
      await act(async () => {
        firstLoad.reject(new Error("first load failed"));
        await firstLoad.promise.catch(() => undefined);
      });

      expect(result.current.data?.collaborators).toEqual([manager, acceptedCollaborator]);
      expect(result.current.loadError).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("reports a load error when the refetch that superseded the first load fails", async () => {
      const firstLoad = createDeferred<ShareData>();
      mockGetShareDialogData.mockReset();
      mockGetShareDialogData.mockReturnValueOnce(firstLoad.promise).mockRejectedValueOnce(new Error("network"));
      const { result } = renderHook(() => useTripShareDialogController({ onRequestClose: vi.fn(), tripId: "trip-1" }));

      emitTripEvent(LiveSyncEventType.MembershipChanged);
      await act(async () => {
        firstLoad.resolve({ collaborators: [manager], currentCollaboratorId: "manager-1", invitations: [] });
        await firstLoad.promise;
      });

      await waitFor(() => expect(result.current.loadError).toBe(true));
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toBeNull();
    });

    it("does not flag a load error when a superseded invite refetch fails", async () => {
      const inviteRefetch = createDeferred<ShareData>();
      const { result } = renderHook(() => useTripShareDialogController({ onRequestClose: vi.fn(), tripId: "trip-1" }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      mockGetShareDialogData.mockReturnValueOnce(inviteRefetch.promise).mockResolvedValueOnce({
        collaborators: [manager, acceptedCollaborator],
        currentCollaboratorId: "manager-1",
        invitations: [],
      });

      act(() => result.current.setUsername("new"));
      let invitePromise: Promise<void>;
      act(() => {
        invitePromise = result.current.handleInvite();
      });
      await waitFor(() => expect(mockGetShareDialogData).toHaveBeenCalledTimes(2));
      emitTripEvent(LiveSyncEventType.MembershipChanged);
      await waitFor(() => expect(result.current.data?.collaborators).toEqual([manager, acceptedCollaborator]));
      await act(async () => {
        inviteRefetch.reject(new Error("network"));
        await invitePromise!;
      });

      expect(result.current.loadError).toBe(false);
    });

    it("replays a membership change missed mid-save when stale recovery fails", async () => {
      const save = createDeferred<{ status: "error"; message: string; stale: true }>();
      mockSaveContributorChanges.mockReturnValue(save.promise);
      const { result } = renderHook(() => useTripShareDialogController({ onRequestClose: vi.fn(), tripId: "trip-1" }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      act(() => result.current.stageRoleChange(manager, "editor"));
      let savePromise: Promise<void>;
      act(() => {
        savePromise = result.current.handleSaveChanges();
      });
      emitTripEvent(LiveSyncEventType.MembershipChanged);
      mockGetShareDialogData.mockRejectedValueOnce(new Error("recovery failed")).mockResolvedValueOnce({
        collaborators: [manager, acceptedCollaborator],
        currentCollaboratorId: "manager-1",
        invitations: [],
      });

      await act(async () => {
        save.resolve({ status: "error", message: "A contributor changed.", stale: true });
        await savePromise!;
      });

      await waitFor(() => expect(result.current.data?.collaborators).toEqual([manager, acceptedCollaborator]));
      expect(mockGetShareDialogData).toHaveBeenCalledTimes(3);
    });

    it("does not refetch after a successful save closes the dialog", async () => {
      const save = createDeferred<{ status: "success" }>();
      mockSaveContributorChanges.mockReturnValue(save.promise);
      const onRequestClose = vi.fn();
      const { result } = renderHook(() => useTripShareDialogController({ onRequestClose, tripId: "trip-1" }));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      act(() => result.current.stageRoleChange(manager, "editor"));
      let savePromise: Promise<void>;
      act(() => {
        savePromise = result.current.handleSaveChanges();
      });

      emitTripEvent(LiveSyncEventType.MembershipChanged);
      await act(async () => {
        save.resolve({ status: "success" });
        await savePromise!;
      });

      expect(onRequestClose).toHaveBeenCalledOnce();
      expect(mockGetShareDialogData).toHaveBeenCalledOnce();
    });
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

    act(() => result.current.setUsername("new"));
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
    act(() => result.current.setUsername("new"));
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
      result.current.setUsername("blocked");
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

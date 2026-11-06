import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CollaboratorRole } from "@/data/types";
import type { InvitableUser, InvitableUsersResult } from "@/data/types";
import { useTripShareInviteForm } from "./use-trip-share-invite-form";

const mockInviteContributor = vi.fn();
const mockListInvitableUsers = vi.fn();

vi.mock("@/app/(app)/trips/actions", () => ({
  inviteContributor: (...args: unknown[]) => mockInviteContributor(...args),
  listInvitableUsers: (...args: unknown[]) => mockListInvitableUsers(...args),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const { toast } = await import("sonner");

const alice: InvitableUser = { id: "user-alice", username: "alice" };
const bob: InvitableUser = { id: "user-bob", username: "bob" };

function createDeferred<T>() {
  let resolvePromise: (value: T) => void;
  let rejectPromise: (reason: Error) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise!, reject: rejectPromise! };
}

describe("useTripShareInviteForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListInvitableUsers.mockResolvedValue({ users: [alice, bob], hasOtherUsers: true });
  });

  function setup(overrides?: { isBlocked?: () => boolean; onInvited?: () => void | Promise<void> }) {
    const onInvited = overrides?.onInvited ?? vi.fn();
    const isBlocked = overrides?.isBlocked ?? (() => false);
    const rendered = renderHook(() => useTripShareInviteForm({ tripId: "trip-1", isBlocked, onInvited }));
    return { ...rendered, onInvited };
  }

  async function setupWithUsers(overrides?: Parameters<typeof setup>[0]) {
    const rendered = setup(overrides);
    await act(async () => rendered.result.current.reloadOptions());
    return rendered;
  }

  describe("options", () => {
    it("starts unloaded and lists nothing until the options load", () => {
      const { result } = setup();

      expect(result.current.usersLoaded).toBe(false);
      expect(result.current.invitableUsers).toEqual([]);
      expect(result.current.selectedUser).toBeNull();
      expect(mockListInvitableUsers).not.toHaveBeenCalled();
    });

    it("loads the invitable users for the trip", async () => {
      const { result } = await setupWithUsers();

      expect(mockListInvitableUsers).toHaveBeenCalledWith("trip-1");
      expect(result.current.invitableUsers).toEqual([alice, bob]);
      expect(result.current.hasOtherUsers).toBe(true);
      expect(result.current.usersLoaded).toBe(true);
    });

    it("reports a sole user when no other account exists", async () => {
      mockListInvitableUsers.mockResolvedValue({ users: [], hasOtherUsers: false });
      const { result } = await setupWithUsers();

      expect(result.current.invitableUsers).toEqual([]);
      expect(result.current.hasOtherUsers).toBe(false);
      expect(result.current.usersLoaded).toBe(true);
    });

    it("toasts and falls back to an empty list when the load fails", async () => {
      mockListInvitableUsers.mockRejectedValue(new Error("boom"));
      const { result } = await setupWithUsers();

      expect(toast.error).toHaveBeenCalledWith("Could not load users");
      expect(result.current.invitableUsers).toEqual([]);
      expect(result.current.hasOtherUsers).toBe(true);
      expect(result.current.usersLoaded).toBe(true);
    });

    it("keeps the selection when the reloaded list still has that user", async () => {
      const { result } = await setupWithUsers();
      act(() => result.current.selectUser(alice));

      await act(async () => result.current.reloadOptions());

      expect(result.current.selectedUser).toEqual(alice);
    });

    it("clears the selection when a reload drops the selected user", async () => {
      const { result } = await setupWithUsers();
      act(() => result.current.selectUser(alice));
      mockListInvitableUsers.mockResolvedValue({ users: [bob], hasOtherUsers: true } satisfies InvitableUsersResult);

      await act(async () => result.current.reloadOptions());

      expect(result.current.invitableUsers).toEqual([bob]);
      expect(result.current.selectedUser).toBeNull();
    });

    it("applies only the newest of overlapping reloads", async () => {
      const slow = createDeferred<InvitableUsersResult>();
      mockListInvitableUsers
        .mockReturnValueOnce(slow.promise)
        .mockResolvedValueOnce({ users: [bob], hasOtherUsers: true });
      const { result } = setup();

      let firstReload: Promise<void>;
      act(() => {
        firstReload = result.current.reloadOptions();
      });
      await act(async () => result.current.reloadOptions());
      await act(async () => {
        slow.resolve({ users: [alice], hasOtherUsers: true });
        await firstReload!;
      });

      expect(result.current.invitableUsers).toEqual([bob]);
    });

    it("ignores a stale rejection from an older reload", async () => {
      const slow = createDeferred<InvitableUsersResult>();
      mockListInvitableUsers
        .mockReturnValueOnce(slow.promise)
        .mockResolvedValueOnce({ users: [bob], hasOtherUsers: true });
      const { result } = setup();

      let firstReload: Promise<void>;
      act(() => {
        firstReload = result.current.reloadOptions();
      });
      await act(async () => result.current.reloadOptions());
      await act(async () => {
        slow.reject(new Error("late"));
        await firstReload!;
      });

      expect(toast.error).not.toHaveBeenCalled();
      expect(result.current.invitableUsers).toEqual([bob]);
    });

    it("drops a response that lands after unmount", async () => {
      const slow = createDeferred<InvitableUsersResult>();
      mockListInvitableUsers.mockReturnValueOnce(slow.promise);
      const { result, unmount } = setup();

      let reload: Promise<void>;
      act(() => {
        reload = result.current.reloadOptions();
      });
      unmount();
      await act(async () => {
        slow.reject(new Error("late"));
        await reload!;
      });

      expect(toast.error).not.toHaveBeenCalled();
    });
  });

  describe("inviting", () => {
    it("sends the selected username with the chosen role, refreshes and resets without a toast", async () => {
      mockInviteContributor.mockResolvedValue({ status: "invited" });
      const onInvited = vi.fn();
      const { result } = await setupWithUsers({ onInvited });

      act(() => {
        result.current.selectUser(alice);
        result.current.setRole(CollaboratorRole.Editor);
      });
      await act(async () => result.current.handleInvite());

      expect(mockInviteContributor).toHaveBeenCalledWith("trip-1", "alice", CollaboratorRole.Editor);
      expect(toast.success).not.toHaveBeenCalled();
      expect(onInvited).toHaveBeenCalledOnce();
      expect(result.current.selectedUser).toBeNull();
      expect(result.current.role).toBe(CollaboratorRole.Viewer);
    });

    it("toasts a resent message for an already-pending invitation", async () => {
      mockInviteContributor.mockResolvedValue({ status: "resent" });
      const { result } = await setupWithUsers();

      act(() => result.current.selectUser(alice));
      await act(async () => result.current.handleInvite());

      expect(toast.success).toHaveBeenCalledWith("Invitation resent.");
    });

    it("shows an inline error, clears the selection and reloads when the account vanished", async () => {
      mockInviteContributor.mockResolvedValue({
        status: "error",
        message: "No account found for this username",
        errorCode: "no-account",
      });
      const onInvited = vi.fn();
      const { result } = await setupWithUsers({ onInvited });
      mockListInvitableUsers.mockClear();
      mockListInvitableUsers.mockResolvedValue({ users: [bob], hasOtherUsers: true });

      act(() => result.current.selectUser(alice));
      await act(async () => result.current.handleInvite());

      expect(result.current.inviteError).toBe("No account found for this username.");
      expect(result.current.selectedUser).toBeNull();
      expect(mockListInvitableUsers).toHaveBeenCalledOnce();
      expect(result.current.invitableUsers).toEqual([bob]);
      expect(toast.error).not.toHaveBeenCalled();
      expect(onInvited).not.toHaveBeenCalled();
    });

    it("toasts other typed errors instead of setting an inline error", async () => {
      mockInviteContributor.mockResolvedValue({
        status: "error",
        message: "You cannot invite yourself to this trip",
        errorCode: "self-invite",
      });
      const { result } = await setupWithUsers();

      act(() => result.current.selectUser(alice));
      await act(async () => result.current.handleInvite());

      expect(toast.error).toHaveBeenCalledWith("You cannot invite yourself to this trip");
      expect(result.current.inviteError).toBeNull();
      expect(result.current.selectedUser).toEqual(alice);
    });

    it("clears a previous inline error when another user is picked", async () => {
      mockInviteContributor.mockResolvedValue({
        status: "error",
        message: "No account found for this username",
        errorCode: "no-account",
      });
      const { result } = await setupWithUsers();
      act(() => result.current.selectUser(alice));
      await act(async () => result.current.handleInvite());
      expect(result.current.inviteError).not.toBeNull();

      act(() => result.current.selectUser(bob));

      expect(result.current.inviteError).toBeNull();
    });

    it("does nothing without a selected user", async () => {
      const { result } = await setupWithUsers();

      await act(async () => result.current.handleInvite());

      expect(mockInviteContributor).not.toHaveBeenCalled();
    });

    it("does nothing when blocked", async () => {
      const { result } = await setupWithUsers({ isBlocked: () => true });

      act(() => result.current.selectUser(alice));
      await act(async () => result.current.handleInvite());

      expect(mockInviteContributor).not.toHaveBeenCalled();
    });

    it("logs and toasts a generic error when the server action throws", async () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      mockInviteContributor.mockRejectedValue(new Error("network down"));
      const { result } = await setupWithUsers();

      act(() => result.current.selectUser(alice));
      await act(async () => result.current.handleInvite());

      expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to send trip invitation", expect.any(Error));
      expect(toast.error).toHaveBeenCalledWith("Could not send invitation.");
      consoleErrorSpy.mockRestore();
    });

    it("toggles inviteLoading for the duration of the request", async () => {
      const deferred = createDeferred<{ status: "invited" }>();
      mockInviteContributor.mockReturnValue(deferred.promise);
      const { result } = await setupWithUsers();

      act(() => result.current.selectUser(alice));
      let invitePromise: Promise<void>;
      act(() => {
        invitePromise = result.current.handleInvite();
      });
      await waitFor(() => expect(result.current.inviteLoading).toBe(true));

      await act(async () => {
        deferred.resolve({ status: "invited" });
        await invitePromise!;
      });
      expect(result.current.inviteLoading).toBe(false);
    });
  });
});

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CollaboratorRole } from "@/data/types";
import type { InvitableUser, InvitableUsersResult } from "@/data/types";
import { useTripShareInviteForm } from "./use-trip-share-invite-form";
import { ApiClientError } from "@/lib/api/client";

const mockInviteContributor = vi.fn();
const mockListInvitableUsers = vi.fn();

vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  api: (
    endpoint: { path: string },
    input: { params: { tripId?: string }; body: { tripId?: string; username?: string; role?: string; id?: string } }
  ) => {
    if (endpoint.path.endsWith("/invitable")) return mockListInvitableUsers(input.body.tripId);
    return mockInviteContributor(input.params.tripId, input.body.username, input.body.role, input.body.id);
  },
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
    it("retains UUID when successful response JSON cannot be decoded", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      mockInviteContributor
        .mockRejectedValueOnce(new ApiClientError(200, "server_error", "Malformed JSON"))
        .mockResolvedValueOnce({ status: "invited" });
      const { result } = await setupWithUsers();
      act(() => result.current.selectUser(alice));
      await act(async () => result.current.handleInvite());
      await act(async () => result.current.handleInvite());
      expect(mockInviteContributor.mock.calls[1][3]).toBe(mockInviteContributor.mock.calls[0][3]);
      log.mockRestore();
    });
    it("submits with fallback UUID when randomUUID is unavailable", async () => {
      const original = crypto.randomUUID;
      Object.defineProperty(crypto, "randomUUID", { configurable: true, value: undefined });
      try {
        mockInviteContributor.mockResolvedValue({ status: "invited" });
        const { result } = await setupWithUsers();
        act(() => result.current.selectUser(alice));
        await act(async () => result.current.handleInvite());
        expect(mockInviteContributor.mock.calls[0][3]).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
        );
        expect(result.current.inviteLoading).toBe(false);
      } finally {
        Object.defineProperty(crypto, "randomUUID", { configurable: true, value: original });
      }
    });
    it("replaces UUID after a definite conflict instead of trapping fresh intent", async () => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      mockInviteContributor.mockRejectedValue(new ApiClientError(409, "conflict", "Retired intent"));
      const { result } = await setupWithUsers();
      act(() => result.current.selectUser(alice));
      await act(async () => result.current.handleInvite());
      await act(async () => result.current.handleInvite());
      expect(mockInviteContributor.mock.calls[1][3]).not.toBe(mockInviteContributor.mock.calls[0][3]);
      log.mockRestore();
    });
    it("ignores completed invitation after unmount", async () => {
      const deferred = createDeferred<{ status: "invited" }>();
      mockInviteContributor.mockReturnValue(deferred.promise);
      const { result, unmount, onInvited } = await setupWithUsers();
      act(() => result.current.selectUser(alice));
      let pending: Promise<void>;
      act(() => {
        pending = result.current.handleInvite();
      });
      unmount();
      await act(async () => {
        deferred.resolve({ status: "invited" });
        await pending!;
      });
      expect(onInvited).not.toHaveBeenCalled();
      expect(toast.success).not.toHaveBeenCalled();
    });
    it("keeps UUID on uncertain retry and replaces it after changed intent", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      mockInviteContributor.mockRejectedValue(new Error("network"));
      const { result } = await setupWithUsers();
      act(() => result.current.selectUser(alice));
      await act(async () => result.current.handleInvite());
      await act(async () => result.current.handleInvite());
      const firstId = mockInviteContributor.mock.calls[0][3];
      expect(mockInviteContributor.mock.calls[1][3]).toBe(firstId);
      act(() => result.current.setRole(CollaboratorRole.Editor));
      await act(async () => result.current.handleInvite());
      expect(mockInviteContributor.mock.calls[2][3]).not.toBe(firstId);
      vi.restoreAllMocks();
    });
    it("blocks double submit before state has rendered", async () => {
      const deferred = createDeferred<{ status: "invited" }>();
      mockInviteContributor.mockReturnValue(deferred.promise);
      const { result } = await setupWithUsers();
      act(() => result.current.selectUser(alice));
      let pending: Promise<void>;
      act(() => {
        pending = result.current.handleInvite();
        void result.current.handleInvite();
      });
      expect(mockInviteContributor).toHaveBeenCalledOnce();
      await act(async () => {
        deferred.resolve({ status: "invited" });
        await pending!;
      });
    });
    it("sends the selected username with the chosen role, refreshes and resets without a toast", async () => {
      mockInviteContributor.mockResolvedValue({ status: "invited" });
      const onInvited = vi.fn();
      const { result } = await setupWithUsers({ onInvited });

      act(() => {
        result.current.selectUser(alice);
        result.current.setRole(CollaboratorRole.Editor);
      });
      await act(async () => result.current.handleInvite());

      expect(mockInviteContributor).toHaveBeenCalledWith(
        "trip-1",
        "alice",
        CollaboratorRole.Editor,
        expect.any(String)
      );
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

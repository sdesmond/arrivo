import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CollaboratorRole } from "@/data/types";
import { useTripShareInviteForm } from "./use-trip-share-invite-form";

const mockInviteContributor = vi.fn();

vi.mock("@/app/(app)/trips/actions", () => ({
  inviteContributor: (...args: unknown[]) => mockInviteContributor(...args),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const { toast } = await import("sonner");

function createDeferred<T>() {
  let resolvePromise: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise! };
}

describe("useTripShareInviteForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setup(overrides?: { isBlocked?: () => boolean; onInvited?: () => void | Promise<void> }) {
    const onInvited = overrides?.onInvited ?? vi.fn();
    const isBlocked = overrides?.isBlocked ?? (() => false);
    const { result } = renderHook(() => useTripShareInviteForm({ tripId: "trip-1", isBlocked, onInvited }));
    return { onInvited, result };
  }

  it("sends an invite, toasts success, refreshes, and resets the form", async () => {
    mockInviteContributor.mockResolvedValue({ status: "invited" });
    const onInvited = vi.fn();
    const { result } = setup({ onInvited });

    act(() => {
      result.current.setUsername("invitee");
      result.current.setRole(CollaboratorRole.Editor);
    });
    await act(async () => result.current.handleInvite());

    expect(mockInviteContributor).toHaveBeenCalledWith("trip-1", "invitee", CollaboratorRole.Editor);
    expect(toast.success).toHaveBeenCalledWith("Invitation sent.");
    expect(onInvited).toHaveBeenCalledOnce();
    expect(result.current.username).toBe("");
    expect(result.current.role).toBe(CollaboratorRole.Viewer);
  });

  it("toasts a resent message for an already-pending invitation", async () => {
    mockInviteContributor.mockResolvedValue({ status: "resent" });
    const { result } = setup();

    act(() => result.current.setUsername("pending"));
    await act(async () => result.current.handleInvite());

    expect(toast.success).toHaveBeenCalledWith("Invitation resent.");
  });

  it("sets an inline error for a no-account result without toasting", async () => {
    mockInviteContributor.mockResolvedValue({
      status: "error",
      message: "No account found for this username",
      errorCode: "no-account",
    });
    const onInvited = vi.fn();
    const { result } = setup({ onInvited });

    act(() => result.current.setUsername("missing"));
    await act(async () => result.current.handleInvite());

    expect(result.current.inviteError).toBe("No account found for this username.");
    expect(toast.error).not.toHaveBeenCalled();
    expect(onInvited).not.toHaveBeenCalled();
  });

  it("toasts other typed errors instead of setting an inline error", async () => {
    mockInviteContributor.mockResolvedValue({
      status: "error",
      message: "You cannot invite yourself to this trip",
      errorCode: "self-invite",
    });
    const { result } = setup();

    act(() => result.current.setUsername("self"));
    await act(async () => result.current.handleInvite());

    expect(toast.error).toHaveBeenCalledWith("You cannot invite yourself to this trip");
    expect(result.current.inviteError).toBeNull();
  });

  it("rejects an invalid username before calling the server action", async () => {
    const { result } = setup();

    act(() => result.current.setUsername("ann@example.com"));
    await act(async () => result.current.handleInvite());

    expect(mockInviteContributor).not.toHaveBeenCalled();
    expect(result.current.inviteError).toBe(
      "Use letters, numbers, dots, dashes or underscores, starting with a letter or number."
    );
  });

  it("does nothing when blocked", async () => {
    const { result } = setup({ isBlocked: () => true });

    act(() => result.current.setUsername("invitee"));
    await act(async () => result.current.handleInvite());

    expect(mockInviteContributor).not.toHaveBeenCalled();
  });

  it("does nothing for an empty username", async () => {
    const { result } = setup();

    await act(async () => result.current.handleInvite());

    expect(mockInviteContributor).not.toHaveBeenCalled();
  });

  it("logs and toasts a generic error when the server action throws", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockInviteContributor.mockRejectedValue(new Error("network down"));
    const { result } = setup();

    act(() => result.current.setUsername("invitee"));
    await act(async () => result.current.handleInvite());

    expect(consoleErrorSpy).toHaveBeenCalledWith("Failed to send trip invitation", expect.any(Error));
    expect(toast.error).toHaveBeenCalledWith("Could not send invitation.");
    consoleErrorSpy.mockRestore();
  });

  it("toggles inviteLoading for the duration of the request", async () => {
    const deferred = createDeferred<{ status: "invited" }>();
    mockInviteContributor.mockReturnValue(deferred.promise);
    const { result } = setup();

    act(() => result.current.setUsername("invitee"));
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

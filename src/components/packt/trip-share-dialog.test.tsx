import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Collaborator, Invitation } from "@/data/types";
import { MockEventSource } from "@/lib/live-sync-test-helpers";
import { resetLiveSyncChannelsForTest } from "@/lib/use-live-sync";
import { isDismissalPress, TripShareDialog } from "./trip-share-dialog";

// The share dialog joins the trip's live channel to refetch on membership changes; jsdom has no
// EventSource, so every suite here runs against the shared mock.
beforeEach(() => {
  resetLiveSyncChannelsForTest();
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
});

afterEach(() => {
  resetLiveSyncChannelsForTest();
  vi.unstubAllGlobals();
});

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

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const creator: Collaborator = {
  id: "creator-1",
  name: "Ada Lovelace",
  email: "ada@example.com",
  initials: "AL",
  role: "manager",
  isCreator: true,
};

const activeCollaborator: Collaborator = {
  id: "editor-1",
  name: "Grace Hopper",
  email: "grace@example.com",
  initials: "GH",
  role: "editor",
  isCreator: false,
};

const pendingInvitation: Invitation = {
  id: "pending-1",
  tripId: "trip-1",
  email: "pending@example.com",
  role: "viewer",
  status: "pending",
  expiresAt: "2099-01-01T00:00:00.000Z",
  invitedBy: "creator-1",
};

const declinedInvitation: Invitation = {
  id: "declined-1",
  tripId: "trip-1",
  email: "declined@example.com",
  role: "editor",
  status: "declined",
  expiresAt: "2020-01-01T00:00:00.000Z",
  invitedBy: "creator-1",
};

const secondDeclinedInvitation: Invitation = {
  ...declinedInvitation,
  id: "declined-2",
  email: "second-declined@example.com",
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

describe("TripShareDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetShareDialogData.mockResolvedValue({
      collaborators: [creator, activeCollaborator],
      currentCollaboratorId: "creator-1",
      invitations: [pendingInvitation, declinedInvitation],
    });
    mockResendShareInvitation.mockResolvedValue({ status: "success", expiresAt: "2099-02-01T00:00:00.000Z" });
    mockRescindShareInvitation.mockResolvedValue({ status: "success" });
    mockDismissShareInvitation.mockResolvedValue({ status: "success" });
    mockInviteContributor.mockResolvedValue({ status: "invited" });
    mockSaveContributorChanges.mockResolvedValue({ status: "success" });
  });

  it("renders locked creator and active, pending, and declined rows", async () => {
    render(<TripShareDialog open onOpenChange={vi.fn()} tripId="trip-1" />);

    await waitFor(() => expect(mockGetShareDialogData).toHaveBeenCalledWith("trip-1"));

    expect(screen.getByLabelText("Trip creator — access can't be changed")).toBeInTheDocument();
    expect(screen.queryByLabelText("Role for Ada Lovelace")).not.toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByLabelText("Role for Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("pending@example.com")).toBeInTheDocument();
    expect(screen.getByText("Pending", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("declined@example.com")).toBeInTheDocument();
    expect(screen.getByText("Declined", { exact: true })).toBeInTheDocument();
  });

  it("wires the caller row id into current-user marking and locking", async () => {
    mockGetShareDialogData.mockResolvedValue({
      collaborators: [creator, activeCollaborator],
      currentCollaboratorId: "editor-1",
      invitations: [],
    });

    render(<TripShareDialog open onOpenChange={vi.fn()} tripId="trip-1" />);

    await screen.findByText("Grace Hopper");
    expect(screen.getByText("You")).toBeInTheDocument();
    expect(screen.getByLabelText("Your access can't be changed here")).toBeInTheDocument();
    expect(screen.queryByLabelText("Role for Grace Hopper")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Remove Grace Hopper")).not.toBeInTheDocument();
  });

  it("shows only creator and invite form without an empty state", async () => {
    mockGetShareDialogData.mockResolvedValue({ collaborators: [creator], invitations: [] });

    render(<TripShareDialog open onOpenChange={vi.fn()} tripId="trip-1" />);

    await screen.findByText("Ada Lovelace");

    expect(screen.getByRole("textbox", { name: "Invite email" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Invite role" })).toHaveTextContent("viewer");
    expect(screen.getByRole("button", { name: "Invite" })).toBeEnabled();
    expect(screen.queryByText("No collaborators yet.")).not.toBeInTheDocument();
  });

  it("renders invitation rows returned by the server action", async () => {
    mockGetShareDialogData.mockResolvedValue({
      collaborators: [creator],
      invitations: [{ ...pendingInvitation, email: "expired@example.com", expiresAt: "2020-01-01T00:00:00.000Z" }],
    });

    render(<TripShareDialog open onOpenChange={vi.fn()} tripId="trip-1" />);

    await screen.findByText("Ada Lovelace");

    expect(screen.getByText("expired@example.com")).toBeInTheDocument();
  });

  it("clears stale rows and shows loading while a changed trip loads", async () => {
    const nextTripData = createDeferred<{ collaborators: Collaborator[]; invitations: Invitation[] }>();
    mockGetShareDialogData
      .mockResolvedValueOnce({ collaborators: [creator], invitations: [] })
      .mockReturnValueOnce(nextTripData.promise);

    const { rerender } = render(<TripShareDialog open onOpenChange={vi.fn()} tripId="trip-1" />);

    await screen.findByText("Ada Lovelace");

    rerender(<TripShareDialog open onOpenChange={vi.fn()} tripId="trip-2" />);

    expect(screen.getByRole("status", { name: "Loading sharing details" })).toBeInTheDocument();
    expect(screen.queryByText("Ada Lovelace")).not.toBeInTheDocument();

    nextTripData.resolve({ collaborators: [activeCollaborator], invitations: [] });

    expect(await screen.findByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Loading sharing details" })).not.toBeInTheDocument();
  });

  it("shows an error and an empty list state when loading fails", async () => {
    const { toast } = await import("sonner");
    mockGetShareDialogData.mockRejectedValue(new Error("Forbidden"));

    render(<TripShareDialog open onOpenChange={vi.fn()} tripId="trip-1" />);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not load sharing details"));

    expect(screen.getByText("Could not load collaborators and invitations.")).toBeInTheDocument();
  });

  it("renders titled resend and rescind controls for a pending invitation", async () => {
    render(<TripShareDialog open onOpenChange={vi.fn()} tripId="trip-1" />);

    expect(await screen.findByTitle("Resend invitation to pending@example.com")).toBeEnabled();
    expect(screen.getByTitle("Rescind invitation to pending@example.com")).toBeEnabled();
    expect(screen.queryByTitle("Dismiss invitation to pending@example.com")).not.toBeInTheDocument();
    expect(screen.getByTitle("Dismiss invitation to declined@example.com")).toBeEnabled();
  });

  it("dismisses a declined invitation, removes its row, and shows a confirmation", async () => {
    const { toast } = await import("sonner");
    render(<TripShareDialog open onOpenChange={vi.fn()} tripId="trip-1" />);

    fireEvent.click(await screen.findByTitle("Dismiss invitation to declined@example.com"));

    await waitFor(() => expect(mockDismissShareInvitation).toHaveBeenCalledWith("trip-1", "declined-1"));
    expect(screen.queryByText("declined@example.com")).not.toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Invitation dismissed.");
  });

  it("keeps a declined invitation and shows an error when dismissal fails", async () => {
    const { toast } = await import("sonner");
    mockDismissShareInvitation.mockResolvedValue({ status: "error", message: "Invitation not found." });
    render(<TripShareDialog open onOpenChange={vi.fn()} tripId="trip-1" />);

    fireEvent.click(await screen.findByTitle("Dismiss invitation to declined@example.com"));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Invitation not found."));
    expect(screen.getByText("declined@example.com")).toBeInTheDocument();
  });

  it("keeps a declined invitation and restores its control when dismissal rejects", async () => {
    const { toast } = await import("sonner");
    mockDismissShareInvitation.mockRejectedValue(new Error("Network failure"));
    render(<TripShareDialog open onOpenChange={vi.fn()} tripId="trip-1" />);

    const dismissButton = await screen.findByTitle("Dismiss invitation to declined@example.com");
    fireEvent.click(dismissButton);

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not dismiss invitation."));
    expect(screen.getByText("declined@example.com")).toBeInTheDocument();
    expect(dismissButton).toBeEnabled();
  });

  it("shows dismissal progress only on clicked declined row", async () => {
    const deferred = createDeferred<{ status: "success" }>();
    mockDismissShareInvitation.mockReturnValue(deferred.promise);
    render(<TripShareDialog open onOpenChange={vi.fn()} tripId="trip-1" />);

    const dismissButton = await screen.findByTitle("Dismiss invitation to declined@example.com");
    const resendButton = screen.getByTitle("Resend invitation to pending@example.com");
    fireEvent.click(dismissButton);

    await waitFor(() => expect(dismissButton).toBeDisabled());
    expect(resendButton).toBeEnabled();
    expect(screen.getByLabelText("Dismissing invitation")).toBeInTheDocument();

    deferred.resolve({ status: "success" });
    await waitFor(() => expect(screen.queryByText("declined@example.com")).not.toBeInTheDocument());
  });

  it("keeps progress local to each concurrently dismissed declined row", async () => {
    const firstDismissal = createDeferred<{ status: "success" }>();
    const secondDismissal = createDeferred<{ status: "success" }>();
    mockGetShareDialogData.mockResolvedValue({
      collaborators: [creator, activeCollaborator],
      invitations: [pendingInvitation, declinedInvitation, secondDeclinedInvitation],
    });
    mockDismissShareInvitation.mockReturnValueOnce(firstDismissal.promise).mockReturnValueOnce(secondDismissal.promise);
    render(<TripShareDialog open onOpenChange={vi.fn()} tripId="trip-1" />);

    const firstDismissButton = await screen.findByTitle("Dismiss invitation to declined@example.com");
    const secondDismissButton = screen.getByTitle("Dismiss invitation to second-declined@example.com");
    fireEvent.click(firstDismissButton);
    fireEvent.click(secondDismissButton);

    await waitFor(() => expect(firstDismissButton).toBeDisabled());
    expect(secondDismissButton).toBeDisabled();
    expect(screen.getAllByLabelText("Dismissing invitation")).toHaveLength(2);

    firstDismissal.resolve({ status: "success" });
    await waitFor(() => expect(screen.queryByText("declined@example.com")).not.toBeInTheDocument());
    expect(secondDismissButton).toBeDisabled();

    secondDismissal.resolve({ status: "success" });
    await waitFor(() => expect(screen.queryByText("second-declined@example.com")).not.toBeInTheDocument());
  });

  it("does not restore a dismissed invitation from an overlapping invite refresh", async () => {
    const staleRefresh = createDeferred<{ collaborators: Collaborator[]; invitations: Invitation[] }>();
    const initialData = {
      collaborators: [creator, activeCollaborator],
      invitations: [pendingInvitation, declinedInvitation],
    };
    mockGetShareDialogData.mockResolvedValueOnce(initialData).mockReturnValueOnce(staleRefresh.promise);
    render(<TripShareDialog open onOpenChange={vi.fn()} tripId="trip-1" />);

    fireEvent.change(await screen.findByRole("textbox", { name: "Invite email" }), {
      target: { value: "guest@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));
    await waitFor(() => expect(mockGetShareDialogData).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByTitle("Dismiss invitation to declined@example.com"));
    await waitFor(() => expect(screen.queryByText("declined@example.com")).not.toBeInTheDocument());

    staleRefresh.resolve(initialData);

    await waitFor(() => expect(screen.getByRole("textbox", { name: "Invite email" })).toHaveValue(""));
    await waitFor(() => expect(screen.queryByText("declined@example.com")).not.toBeInTheDocument());
  });

  it("preserves dialog close handling after the extracted content regions render", async () => {
    const onOpenChange = vi.fn();
    render(<TripShareDialog open onOpenChange={onOpenChange} tripId="trip-1" />);

    fireEvent.click(await screen.findByTitle("Close sharing dialog"));

    expect(onOpenChange.mock.calls[0]?.[0]).toBe(false);
  });

  it("resends a pending invitation, updates its expiry to the server-returned value, and shows a confirmation", async () => {
    const { toast } = await import("sonner");
    render(<TripShareDialog open onOpenChange={vi.fn()} tripId="trip-1" />);

    fireEvent.click(await screen.findByTitle("Resend invitation to pending@example.com"));

    await waitFor(() => expect(mockResendShareInvitation).toHaveBeenCalledWith("trip-1", "pending-1"));
    expect(toast.success).toHaveBeenCalledWith("Invitation resent.");
    const expectedExpiry = new Date("2099-02-01T00:00:00.000Z").toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    expect(screen.getByText(`Expires ${expectedExpiry}`)).toBeInTheDocument();
  });

  it("rescinds a pending invitation and removes its row", async () => {
    const { toast } = await import("sonner");
    render(<TripShareDialog open onOpenChange={vi.fn()} tripId="trip-1" />);

    fireEvent.click(await screen.findByTitle("Rescind invitation to pending@example.com"));

    await waitFor(() => expect(mockRescindShareInvitation).toHaveBeenCalledWith("trip-1", "pending-1"));
    expect(screen.queryByText("pending@example.com")).not.toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Invitation rescinded.");
  });

  it("shows an error toast when a pending resend action fails", async () => {
    const { toast } = await import("sonner");
    mockResendShareInvitation.mockResolvedValue({ status: "error", message: "Invitation is no longer pending." });
    render(<TripShareDialog open onOpenChange={vi.fn()} tripId="trip-1" />);

    fireEvent.click(await screen.findByTitle("Resend invitation to pending@example.com"));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Invitation is no longer pending."));
    expect(screen.getByText("pending@example.com")).toBeInTheDocument();
  });

  it("shows an error toast when a pending rescind action fails and keeps the row", async () => {
    const { toast } = await import("sonner");
    mockRescindShareInvitation.mockResolvedValue({ status: "error", message: "Invitation is no longer pending." });
    render(<TripShareDialog open onOpenChange={vi.fn()} tripId="trip-1" />);

    fireEvent.click(await screen.findByTitle("Rescind invitation to pending@example.com"));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Invitation is no longer pending."));
    expect(screen.getByText("pending@example.com")).toBeInTheDocument();
  });

  it("only shows a spinner on the button that was clicked while its sibling stays disabled but not spinning", async () => {
    const deferred = createDeferred<{ status: "success"; expiresAt: string }>();
    mockResendShareInvitation.mockReturnValue(deferred.promise);
    render(<TripShareDialog open onOpenChange={vi.fn()} tripId="trip-1" />);

    const resendButton = await screen.findByTitle("Resend invitation to pending@example.com");
    const rescindButton = screen.getByTitle("Rescind invitation to pending@example.com");
    fireEvent.click(resendButton);

    await waitFor(() => expect(resendButton).toBeDisabled());
    expect(rescindButton).toBeDisabled();
    expect(screen.getByLabelText("Resending invitation")).toBeInTheDocument();
    expect(screen.queryByLabelText("Rescinding invitation")).not.toBeInTheDocument();

    deferred.resolve({ status: "success", expiresAt: "2099-02-01T00:00:00.000Z" });
    await waitFor(() => expect(resendButton).toBeEnabled());
    expect(rescindButton).toBeEnabled();
  });

  it("invites a user, refetches data, clears the email, resets role, and shows a success toast", async () => {
    const { toast } = await import("sonner");
    render(<TripShareDialog open onOpenChange={vi.fn()} tripId="trip-1" />);

    const emailInput = await screen.findByRole("textbox", { name: "Invite email" });
    fireEvent.change(emailInput, { target: { value: "invitee@example.com" } });

    fireEvent.click(screen.getByRole("button", { name: "Invite" }));

    await waitFor(() => expect(mockInviteContributor).toHaveBeenCalledWith("trip-1", "invitee@example.com", "viewer"));
    expect(mockGetShareDialogData).toHaveBeenCalledTimes(2);
    expect(emailInput).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Invite role" })).toHaveTextContent("viewer");
    expect(toast.success).toHaveBeenCalledWith("Invitation sent.");
  });

  it("shows Invitation resent toast when inviteContributor returns resent", async () => {
    const { toast } = await import("sonner");
    mockInviteContributor.mockResolvedValue({ status: "resent" });
    render(<TripShareDialog open onOpenChange={vi.fn()} tripId="trip-1" />);

    fireEvent.change(await screen.findByRole("textbox", { name: "Invite email" }), {
      target: { value: "invitee@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Invitation resent."));
    expect(screen.getByRole("textbox", { name: "Invite email" })).toHaveValue("");
  });

  it("shows an inline error below the email input when no Packt account matches the email", async () => {
    const { toast } = await import("sonner");
    mockInviteContributor.mockResolvedValue({
      status: "error",
      message: "No Packt account found for this email",
      errorCode: "no-account",
    });
    render(<TripShareDialog open onOpenChange={vi.fn()} tripId="trip-1" />);

    fireEvent.change(await screen.findByRole("textbox", { name: "Invite email" }), {
      target: { value: "nobody@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));

    await waitFor(() => expect(screen.getByText("No Packt account found for this email.")).toBeInTheDocument());
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "Invite email" })).toHaveValue("nobody@example.com");
  });

  it("shows an error toast and keeps the input for other invite errors", async () => {
    const { toast } = await import("sonner");
    mockInviteContributor.mockResolvedValue({
      status: "error",
      message: "This person is already a collaborator on this trip",
      errorCode: "already-collaborator",
    });
    render(<TripShareDialog open onOpenChange={vi.fn()} tripId="trip-1" />);

    fireEvent.change(await screen.findByRole("textbox", { name: "Invite email" }), {
      target: { value: "dupe@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("This person is already a collaborator on this trip"));
    expect(screen.getByRole("textbox", { name: "Invite email" })).toHaveValue("dupe@example.com");
  });

  it("disables the Invite button, email input, and role select while the request is in flight", async () => {
    const deferred = createDeferred<{ status: "invited" }>();
    mockInviteContributor.mockReturnValue(deferred.promise);
    render(<TripShareDialog open onOpenChange={vi.fn()} tripId="trip-1" />);

    fireEvent.change(await screen.findByRole("textbox", { name: "Invite email" }), {
      target: { value: "invitee@example.com" },
    });
    const inviteButton = screen.getByRole("button", { name: "Invite" });
    fireEvent.click(inviteButton);

    await waitFor(() => expect(inviteButton).toBeDisabled());
    expect(screen.getByRole("textbox", { name: "Invite email" })).toBeDisabled();
    expect(screen.getByLabelText("Sending invitation")).toBeInTheDocument();

    deferred.resolve({ status: "invited" });
    await waitFor(() => expect(inviteButton).toBeEnabled());
    expect(screen.getByRole("textbox", { name: "Invite email" })).toBeEnabled();
  });

  it("clears the stale inline error when the user starts typing a new email", async () => {
    mockInviteContributor.mockResolvedValue({
      status: "error",
      message: "No Packt account found for this email",
      errorCode: "no-account",
    });
    render(<TripShareDialog open onOpenChange={vi.fn()} tripId="trip-1" />);

    fireEvent.change(await screen.findByRole("textbox", { name: "Invite email" }), {
      target: { value: "nobody@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));

    await waitFor(() => expect(screen.getByText("No Packt account found for this email.")).toBeInTheDocument());

    fireEvent.change(screen.getByRole("textbox", { name: "Invite email" }), {
      target: { value: "someone@example.com" },
    });

    expect(screen.queryByText("No Packt account found for this email.")).not.toBeInTheDocument();
  });

  it("shows a toast if the invite succeeds but the refetch fails", async () => {
    const { toast } = await import("sonner");
    mockGetShareDialogData.mockRejectedValueOnce(new Error("network"));
    render(<TripShareDialog open onOpenChange={vi.fn()} tripId="trip-1" />);

    fireEvent.change(await screen.findByRole("textbox", { name: "Invite email" }), {
      target: { value: "invitee@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));

    await waitFor(() => expect(mockInviteContributor).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith("Invitation sent.");
    expect(screen.getByRole("textbox", { name: "Invite email" })).toHaveValue("");
  });
});

describe("TripShareDialog batch staging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetShareDialogData.mockResolvedValue({
      collaborators: [creator, activeCollaborator],
      invitations: [],
    });
    mockSaveContributorChanges.mockResolvedValue({ status: "success" });
  });

  function openDialog(onOpenChange: (open: boolean) => void = vi.fn()): (open: boolean) => void {
    render(<TripShareDialog open onOpenChange={onOpenChange} tripId="trip-1" />);
    return onOpenChange;
  }

  it("renders Save and Cancel always, with Save disabled until a change is staged", async () => {
    openDialog();

    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled();
  });

  it("stages a role change and enables Save without applying it", async () => {
    const user = userEvent.setup();
    openDialog();

    await user.click(await screen.findByLabelText("Role for Grace Hopper"));
    await user.click(await screen.findByRole("option", { name: "Viewer" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    expect(mockSaveContributorChanges).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Role for Grace Hopper")).toHaveTextContent("Viewer");
  });

  it("stages a removal and shows a pending-removal indicator without applying it", async () => {
    openDialog();

    fireEvent.click(await screen.findByTitle("Remove Grace Hopper"));

    await waitFor(() => expect(screen.getByLabelText("Grace Hopper will be removed")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(mockSaveContributorChanges).not.toHaveBeenCalled();
  });

  it("replaces a staged role change on the same row with the latest edit", async () => {
    const user = userEvent.setup();
    openDialog();

    await user.click(await screen.findByLabelText("Role for Grace Hopper"));
    await user.click(await screen.findByRole("option", { name: "Viewer" }));
    await waitFor(() => expect(screen.getByLabelText("Role for Grace Hopper")).toHaveTextContent("Viewer"));

    await user.click(screen.getByLabelText("Role for Grace Hopper"));
    await user.click(await screen.findByRole("option", { name: "Manager" }));

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockSaveContributorChanges).toHaveBeenCalledWith("trip-1", [
        { type: "role", collaboratorId: "editor-1", fromRole: "editor", toRole: "manager" },
      ])
    );
  });

  it("saves one batch containing role changes and removals, then closes the dialog", async () => {
    const user = userEvent.setup();
    const onOpenChange = openDialog();

    await user.click(await screen.findByLabelText("Role for Grace Hopper"));
    await user.click(await screen.findByRole("option", { name: "Viewer" }));

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockSaveContributorChanges).toHaveBeenCalledWith("trip-1", [
        { type: "role", collaboratorId: "editor-1", fromRole: "editor", toRole: "viewer" },
      ])
    );
    expect(mockSaveContributorChanges).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("cancels staged edits with no server call and closes the dialog", async () => {
    const onOpenChange = openDialog();

    fireEvent.click(await screen.findByTitle("Remove Grace Hopper"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockSaveContributorChanges).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps staged state, shows the error, and does not close when the batch fails", async () => {
    const { toast } = await import("sonner");
    mockSaveContributorChanges.mockResolvedValue({ status: "error", message: "Batch rejected" });
    const onOpenChange = openDialog();

    fireEvent.click(await screen.findByTitle("Remove Grace Hopper"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Batch rejected"));
    expect(screen.getByLabelText("Grace Hopper will be removed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(mockGetShareDialogData).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("refetches and discards staged changes when the batch is rejected as stale", async () => {
    mockSaveContributorChanges.mockResolvedValue({
      status: "error",
      message: "A contributor's role changed since you started editing.",
      stale: true,
    });
    openDialog();

    fireEvent.click(await screen.findByTitle("Remove Grace Hopper"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("A contributor's role changed since you started editing.")
    );
    await waitFor(() => expect(mockGetShareDialogData).toHaveBeenCalledTimes(2));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.queryByLabelText("Grace Hopper will be removed")).not.toBeInTheDocument();
  });

  it("disables collaborator, invite, Save, Cancel, and close controls while a save is in flight", async () => {
    const deferred = createDeferred<{ status: "success" }>();
    mockSaveContributorChanges.mockReturnValue(deferred.promise);
    openDialog();

    fireEvent.click(await screen.findByTitle("Remove Grace Hopper"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    const saveButton = screen.getByRole("button", { name: "Save" });
    fireEvent.click(saveButton);

    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled());
    expect(saveButton).toBeDisabled();
    expect(screen.getByTitle("Close sharing dialog")).toBeDisabled();
    expect(screen.getByLabelText("Role for Grace Hopper")).toBeDisabled();
    expect(screen.getByTitle("Remove Grace Hopper")).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Invite email" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Invite role" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Invite" })).toBeDisabled();
    expect(screen.queryByLabelText("Sending invitation")).not.toBeInTheDocument();

    deferred.resolve({ status: "success" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled());
  });
});

describe("isDismissalPress", () => {
  it("treats outside-press and escape-key as dismissal presses", () => {
    expect(isDismissalPress("outside-press")).toBe(true);
    expect(isDismissalPress("escape-key")).toBe(true);
  });

  it("does not treat close-press or trigger-press as a dismissal press", () => {
    expect(isDismissalPress("close-press")).toBe(false);
    expect(isDismissalPress("trigger-press")).toBe(false);
  });
});

describe("TripShareDialog dialog dismissal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetShareDialogData.mockResolvedValue({
      collaborators: [creator, activeCollaborator],
      currentCollaboratorId: "creator-1",
      invitations: [],
    });
    mockSaveContributorChanges.mockResolvedValue({ status: "success" });
  });

  async function stageRoleChange(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(await screen.findByLabelText("Role for Grace Hopper"));
    await user.click(await screen.findByRole("option", { name: "Viewer" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
  }

  it("does nothing on Escape when changes are staged", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<TripShareDialog open onOpenChange={onOpenChange} tripId="trip-1" />);
    await stageRoleChange(user);

    screen.getByRole("dialog").focus();
    await user.keyboard("{Escape}");

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("does nothing on Escape when there are no staged changes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<TripShareDialog open onOpenChange={onOpenChange} tripId="trip-1" />);
    await screen.findByText("Grace Hopper");

    screen.getByRole("dialog").focus();
    await user.keyboard("{Escape}");

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes and discards staged changes via the explicit Cancel button", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<TripShareDialog open onOpenChange={onOpenChange} tripId="trip-1" />);
    await stageRoleChange(user);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockSaveContributorChanges).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("closes via Save once changes are staged", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<TripShareDialog open onOpenChange={onOpenChange} tripId="trip-1" />);
    await stageRoleChange(user);

    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("closes via the X button regardless of staged changes", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<TripShareDialog open onOpenChange={onOpenChange} tripId="trip-1" />);
    await stageRoleChange(user);

    await user.click(screen.getByTitle("Close sharing dialog"));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { Collaborator, Invitation } from "@/data/types";
import { TripShareDialog } from "./trip-share-dialog";

const mockGetShareDialogData = vi.fn();

vi.mock("@/app/(app)/trips/[tripId]/actions", () => ({
  getShareDialogData: (...args: unknown[]) => mockGetShareDialogData(...args),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
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

function createDeferred<T>() {
  let resolvePromise: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return { promise, resolve: resolvePromise! };
}

describe("TripShareDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetShareDialogData.mockResolvedValue({
      collaborators: [creator, activeCollaborator],
      invitations: [pendingInvitation, declinedInvitation],
    });
  });

  it("renders locked creator and active, pending, and declined rows", async () => {
    render(<TripShareDialog open onOpenChange={vi.fn()} tripId="trip-1" />);

    await waitFor(() => expect(mockGetShareDialogData).toHaveBeenCalledWith("trip-1"));

    expect(screen.getByLabelText("Trip creator — access can't be changed")).toBeInTheDocument();
    expect(screen.queryByLabelText("Role for Ada Lovelace")).not.toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("Editor", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("pending@example.com")).toBeInTheDocument();
    expect(screen.getByText("Pending", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("declined@example.com")).toBeInTheDocument();
    expect(screen.getByText("Declined", { exact: true })).toBeInTheDocument();
  });

  it("shows only creator and invite form without an empty state", async () => {
    mockGetShareDialogData.mockResolvedValue({ collaborators: [creator], invitations: [] });

    render(<TripShareDialog open onOpenChange={vi.fn()} tripId="trip-1" />);

    await screen.findByText("Ada Lovelace");

    expect(screen.getByRole("textbox", { name: "Invite email" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Invite role" })).toHaveTextContent("viewer");
    expect(screen.getByRole("button", { name: "Invite" })).toBeDisabled();
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
});

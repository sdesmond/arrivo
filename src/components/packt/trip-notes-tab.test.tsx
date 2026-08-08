import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripNotesTab } from "./trip-notes-tab";
import type { TripNote } from "@/data/types";
import { createTripNote } from "@/app/(app)/trips/[tripId]/actions";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
  Toaster: () => null,
}));

vi.mock("@/app/(app)/trips/[tripId]/actions", () => ({
  createTripNote: vi.fn(),
}));

const mockCreateTripNote = vi.mocked(createTripNote);

function buildNote(overrides: Partial<TripNote> = {}): TripNote {
  return {
    id: "note-1",
    tripId: "trip-1",
    position: 0,
    ...overrides,
  };
}

describe("TripNotesTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the empty state with a New Note action and no persistent capture bar when there are no notes", () => {
    render(<TripNotesTab tripId="trip-1" notes={[]} />);
    expect(screen.getByText("No notes yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New Note" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Note title")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Note body")).not.toBeInTheDocument();
  });

  it("renders notes in the given order with a persistent header New Note action when populated", () => {
    render(
      <TripNotesTab
        tripId="trip-1"
        notes={[
          buildNote({ id: "note-1", title: "First note", position: 0 }),
          buildNote({ id: "note-2", title: "Second note", position: 1 }),
        ]}
      />
    );

    expect(screen.queryByText("No notes yet")).not.toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("First note");
    expect(items[1]).toHaveTextContent("Second note");
    expect(screen.getByRole("button", { name: "New Note" })).toBeInTheDocument();
  });

  it("applies a 44x44px minimum target to the New Note action", () => {
    render(<TripNotesTab tripId="trip-1" notes={[]} />);
    const button = screen.getByRole("button", { name: "New Note" });
    expect(button.style.minHeight).toBe("44px");
    expect(button.style.minWidth).toBe("44px");
  });

  it("opens the editor with the title field focused when New Note is activated from the empty state", async () => {
    const user = userEvent.setup();
    render(<TripNotesTab tripId="trip-1" notes={[]} />);

    await user.click(screen.getByRole("button", { name: "New Note" }));

    expect(screen.getByLabelText("Note title")).toHaveFocus();
  });

  it("opens the editor and hides the header action when New Note is activated on a populated list", async () => {
    const user = userEvent.setup();
    render(<TripNotesTab tripId="trip-1" notes={[buildNote({ title: "First note" })]} />);

    await user.click(screen.getByRole("button", { name: "New Note" }));

    expect(screen.getByLabelText("Note title")).toHaveFocus();
    expect(screen.queryByRole("button", { name: "New Note" })).not.toBeInTheDocument();
  });

  it("closes the draft and returns focus to New Note after a successful create", async () => {
    mockCreateTripNote.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<TripNotesTab tripId="trip-1" notes={[]} />);

    await user.click(screen.getByRole("button", { name: "New Note" }));
    await user.type(screen.getByLabelText("Note title"), "Pack sunscreen");
    await user.tab();
    await user.tab();

    await waitFor(() => expect(screen.queryByLabelText("Note title")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole("button", { name: "New Note" })).toHaveFocus());
  });

  it("closes the draft and returns focus to New Note when a blank draft is discarded", async () => {
    const user = userEvent.setup();
    render(<TripNotesTab tripId="trip-1" notes={[]} />);

    await user.click(screen.getByRole("button", { name: "New Note" }));
    await user.tab();
    await user.tab();

    await waitFor(() => expect(screen.queryByLabelText("Note title")).not.toBeInTheDocument());
    expect(mockCreateTripNote).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "New Note" })).toHaveFocus());
  });

  it("keeps the editor open with Retry visible when create fails", async () => {
    mockCreateTripNote.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    render(<TripNotesTab tripId="trip-1" notes={[]} />);

    await user.click(screen.getByRole("button", { name: "New Note" }));
    await user.type(screen.getByLabelText("Note title"), "Pack sunscreen");
    await user.tab();
    await user.tab();

    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument());
    expect(screen.getByLabelText("Note title")).toBeInTheDocument();
  });
});

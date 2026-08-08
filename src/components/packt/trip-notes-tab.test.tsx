import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripNotesTab } from "./trip-notes-tab";
import type { TripNote } from "@/data/types";
import { createTripNote, updateTripNote } from "@/app/(app)/trips/[tripId]/actions";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
  Toaster: () => null,
}));

vi.mock("@/app/(app)/trips/[tripId]/actions", () => ({
  createTripNote: vi.fn(),
  updateTripNote: vi.fn(),
}));

const mockCreateTripNote = vi.mocked(createTripNote);
const mockUpdateTripNote = vi.mocked(updateTripNote);

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
    expect(screen.getByText("Note saved")).toBeInTheDocument();
    expect(screen.getAllByText("Note saved")).toHaveLength(1);
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

  it("expands a collapsed note in place and focuses its prefilled title", async () => {
    const user = userEvent.setup();
    render(<TripNotesTab tripId="trip-1" notes={[buildNote({ title: "Pack sunscreen", body: "Reef-safe only" })]} />);

    await user.click(screen.getByRole("button", { name: /Pack sunscreen Reef-safe only/ }));

    expect(screen.getByRole("region")).toBeInTheDocument();
    expect(screen.getByLabelText("Note title")).toHaveValue("Pack sunscreen");
    expect(screen.getByLabelText("Note title")).toHaveFocus();
  });

  it("commits the expanded note before switching to another note", async () => {
    mockUpdateTripNote.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <TripNotesTab
        tripId="trip-1"
        notes={[
          buildNote({ id: "note-1", title: "First note", body: "First body", position: 0 }),
          buildNote({ id: "note-2", title: "Second note", body: "Second body", position: 1 }),
        ]}
      />
    );
    await user.click(screen.getByRole("button", { name: /First note First body/ }));
    await user.clear(screen.getByLabelText("Note title"));
    await user.type(screen.getByLabelText("Note title"), "Updated first");

    await user.click(screen.getByRole("button", { name: /Second note Second body/ }));

    await waitFor(() =>
      expect(mockUpdateTripNote).toHaveBeenCalledWith("note-1", { title: "Updated first", body: "First body" })
    );
    await waitFor(() => expect(screen.getByLabelText("Note title")).toHaveValue("Second note"));
    expect(screen.getByRole("button", { name: /First note First body/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: /Second note Second body/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("region")).toHaveLength(1);
  });

  it("keeps the first note expanded when its save fails during a switch", async () => {
    mockUpdateTripNote.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    render(
      <TripNotesTab
        tripId="trip-1"
        notes={[
          buildNote({ id: "note-1", title: "First note", body: "First body", position: 0 }),
          buildNote({ id: "note-2", title: "Second note", body: "Second body", position: 1 }),
        ]}
      />
    );
    await user.click(screen.getByRole("button", { name: /First note First body/ }));
    await user.clear(screen.getByLabelText("Note title"));
    await user.type(screen.getByLabelText("Note title"), "Updated first");

    await user.click(screen.getByRole("button", { name: /Second note Second body/ }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toHaveFocus());
    expect(screen.getByRole("button", { name: /First note First body/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: /Second note Second body/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByLabelText("Note title")).toHaveValue("Updated first");
  });

  it("collapses a clean expanded note and removes its region", async () => {
    const user = userEvent.setup();
    render(<TripNotesTab tripId="trip-1" notes={[buildNote({ title: "Pack sunscreen" })]} />);
    const trigger = screen.getByRole("button", { name: /Pack sunscreen/ });
    await user.click(trigger);

    await user.click(trigger);

    await waitFor(() => expect(screen.queryByRole("region")).not.toBeInTheDocument());
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(mockUpdateTripNote).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it("autosaves an edit on blur and announces the confirmed save once", async () => {
    mockUpdateTripNote.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<TripNotesTab tripId="trip-1" notes={[buildNote({ title: "Pack sunscreen" })]} />);
    await user.click(screen.getByRole("button", { name: /Pack sunscreen/ }));
    fireEvent.change(screen.getByLabelText("Note body"), { target: { value: "Reef-safe only" } });

    fireEvent.blur(screen.getByLabelText("Note body"), { relatedTarget: null });

    await waitFor(() => expect(mockUpdateTripNote).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("Note saved")).toBeInTheDocument());
    expect(screen.getAllByText("Note saved")).toHaveLength(1);
    expect(screen.getByRole("region")).toBeInTheDocument();
  });

  it("shows refreshed saved wording after collapse without changing list order", async () => {
    mockUpdateTripNote.mockResolvedValue(undefined);
    const user = userEvent.setup();
    const notes = [
      buildNote({ id: "note-1", title: "First note", body: "First body", position: 0 }),
      buildNote({ id: "note-2", title: "Second note", body: "Second body", position: 1 }),
    ];
    const { rerender } = render(<TripNotesTab tripId="trip-1" notes={notes} />);
    await user.click(screen.getByRole("button", { name: /First note First body/ }));
    fireEvent.change(screen.getByLabelText("Note title"), { target: { value: "Updated first" } });
    fireEvent.change(screen.getByLabelText("Note body"), { target: { value: "Updated body" } });
    fireEvent.blur(screen.getByLabelText("Note body"), { relatedTarget: null });
    await waitFor(() => expect(mockUpdateTripNote).toHaveBeenCalledTimes(1));

    rerender(
      <TripNotesTab
        tripId="trip-1"
        notes={[buildNote({ id: "note-1", title: "Updated first", body: "Updated body", position: 0 }), notes[1]]}
      />
    );
    await user.click(screen.getByRole("button", { name: /Updated first Updated body/ }));

    await waitFor(() => expect(screen.queryByRole("region")).not.toBeInTheDocument());
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Updated first");
    expect(items[0]).toHaveTextContent("Updated body");
    expect(items[1]).toHaveTextContent("Second note");
  });

  it("commits and collapses an expanded note before opening a new-note draft", async () => {
    mockUpdateTripNote.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<TripNotesTab tripId="trip-1" notes={[buildNote({ title: "Pack sunscreen" })]} />);
    await user.click(screen.getByRole("button", { name: /Pack sunscreen/ }));
    fireEvent.change(screen.getByLabelText("Note body"), { target: { value: "Reef-safe only" } });

    await user.click(screen.getByRole("button", { name: "New Note" }));

    await waitFor(() => expect(mockUpdateTripNote).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("region")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Note title")).toHaveValue("");
    expect(screen.getByLabelText("Note title")).toHaveFocus();
  });
});

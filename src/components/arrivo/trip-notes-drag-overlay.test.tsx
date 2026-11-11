import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TripNote } from "@/data/types";
import { TripNotesDragOverlay } from "./trip-notes-drag-overlay";

describe("TripNotesDragOverlay", () => {
  it("shows the note title and body preview, hidden from assistive tech", () => {
    const note: TripNote = {
      id: "note-1",
      tripId: "trip-1",
      position: 0,
      title: "Pack sunscreen",
      body: "Reef-safe only\nGet it at the airport",
    };

    const { container } = render(<TripNotesDragOverlay note={note} />);

    expect(screen.getByText("Pack sunscreen")).toBeInTheDocument();
    expect(screen.getByText("Reef-safe only")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });
});

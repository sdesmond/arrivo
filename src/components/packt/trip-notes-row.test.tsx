import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TripNotesRow } from "./trip-notes-row";
import type { TripNote } from "@/data/types";

function buildNote(overrides: Partial<TripNote> = {}): TripNote {
  return {
    id: "note-1",
    tripId: "trip-1",
    position: 0,
    ...overrides,
  };
}

describe("TripNotesRow", () => {
  it("renders title and first body line when both are present and differ", () => {
    render(
      <TripNotesRow note={buildNote({ title: "Pack sunscreen", body: "Reef-safe only\nGet it at the airport" })} />
    );
    expect(screen.getByText("Pack sunscreen")).toBeInTheDocument();
    expect(screen.getByText("Reef-safe only")).toBeInTheDocument();
  });

  it("repeats the title as the preview line when there is no body (AC-4)", () => {
    render(<TripNotesRow note={buildNote({ title: "Pack sunscreen", body: undefined })} />);
    const matches = screen.getAllByText("Pack sunscreen");
    expect(matches).toHaveLength(2);
  });

  it("uses the first body line as the implicit title when there is no title (AC-5)", () => {
    render(<TripNotesRow note={buildNote({ title: undefined, body: "Buy tickets\nAt the gate" })} />);
    const matches = screen.getAllByText("Buy tickets");
    expect(matches).toHaveLength(2);
    expect(screen.queryByText("At the gate")).not.toBeInTheDocument();
  });

  it("renders the decorative glyph as aria-hidden", () => {
    render(<TripNotesRow note={buildNote({ title: "Pack sunscreen" })} />);
    const svg = document.querySelector("svg");
    expect(svg).toBeInTheDocument();
    const glyph = svg?.closest("[aria-hidden]");
    expect(glyph).toBeInTheDocument();
  });

  it("applies line-clamp and word-break-safe styling to the preview line to avoid horizontal overflow", () => {
    const longWord = "a".repeat(200);
    render(<TripNotesRow note={buildNote({ title: "Title", body: longWord })} />);
    const previewElement = screen.getByText(longWord);
    expect(previewElement.className).toContain("line-clamp-1");
    expect(previewElement.style.overflowWrap).toBe("anywhere");
  });
});

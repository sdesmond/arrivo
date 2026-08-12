import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

function renderRow(note: TripNote, isExpanded = false, onToggle = vi.fn()) {
  return render(
    <TripNotesRow note={note} isExpanded={isExpanded} onToggle={onToggle} editor={<div>Full editor</div>} />
  );
}

describe("TripNotesRow", () => {
  it("renders title and first body line when both are present and differ", () => {
    renderRow(buildNote({ title: "Pack sunscreen", body: "Reef-safe only\nGet it at the airport" }));
    expect(screen.getByText("Pack sunscreen")).toBeInTheDocument();
    expect(screen.getByText("Reef-safe only")).toBeInTheDocument();
  });

  it("repeats the title as the preview line when there is no body (AC-4)", () => {
    renderRow(buildNote({ title: "Pack sunscreen", body: undefined }));
    const matches = screen.getAllByText("Pack sunscreen");
    expect(matches).toHaveLength(2);
  });

  it("uses the first body line as the implicit title when there is no title (AC-5)", () => {
    renderRow(buildNote({ title: undefined, body: "Buy tickets\nAt the gate" }));
    const matches = screen.getAllByText("Buy tickets");
    expect(matches).toHaveLength(2);
    expect(screen.queryByText("At the gate")).not.toBeInTheDocument();
  });

  it("renders the decorative glyph as aria-hidden", () => {
    renderRow(buildNote({ title: "Pack sunscreen" }));
    const svg = document.querySelector("svg");
    expect(svg).toBeInTheDocument();
    const glyph = svg?.closest("[aria-hidden]");
    expect(glyph).toBeInTheDocument();
  });

  it("applies line-clamp and word-break-safe styling to the preview line to avoid horizontal overflow", () => {
    const longWord = "a".repeat(200);
    renderRow(buildNote({ title: "Title", body: longWord }));
    const previewElement = screen.getByText(longWord);
    expect(previewElement.className).toContain("line-clamp-1");
    expect(previewElement.style.overflowWrap).toBe("anywhere");
  });

  it("renders each note as a bordered card", () => {
    renderRow(buildNote({ title: "Pack sunscreen" }));

    const row = screen.getByRole("listitem");
    expect(row).toHaveClass("rounded-xl");
    expect(row).toHaveStyle({
      border: "1px solid var(--line)",
      background: "var(--bg)",
    });
  });

  it("renders a collapsed disclosure button and omits the expanded region", () => {
    renderRow(buildNote({ title: "Pack sunscreen", body: "Reef-safe only" }));

    const trigger = screen.getByRole("button", { name: /Pack sunscreen Reef-safe only/ });
    expect(trigger).toHaveAttribute("id", "trip-note-disclosure-note-1");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("aria-controls", "trip-note-region-note-1");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  it("renders the labelled expanded region only while expanded", () => {
    renderRow(buildNote({ title: "Pack sunscreen" }), true);

    const trigger = screen.getByRole("button", { name: "Collapse Pack sunscreen" });
    const region = screen.getByRole("region");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(region).toHaveAttribute("id", "trip-note-region-note-1");
    expect(region).toHaveAttribute("aria-labelledby", "trip-note-region-label-note-1");
    expect(region).toHaveAccessibleName("Pack sunscreen");
    expect(region).toHaveTextContent("Full editor");
  });

  it("hides the collapsed title and preview text once expanded to avoid duplicating the editor's fields", () => {
    renderRow(buildNote({ title: "Pack sunscreen", body: "Reef-safe only" }), true);

    expect(screen.queryByText("Reef-safe only")).not.toBeInTheDocument();
    expect(screen.getByText("Pack sunscreen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse Pack sunscreen" })).toBeInTheDocument();
  });

  it("activates on click, Enter, and Space through native button behavior", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderRow(buildNote({ title: "Pack sunscreen" }), false, onToggle);
    const trigger = screen.getByRole("button", { name: /Pack sunscreen/ });

    await user.click(trigger);
    trigger.focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(onToggle).toHaveBeenCalledTimes(3);
    expect(onToggle).toHaveBeenCalledWith("note-1");
  });

  it("applies the 44px target floor and omits future reorder and trash controls", () => {
    renderRow(buildNote({ title: "Pack sunscreen" }));
    const trigger = screen.getByRole("button", { name: /Pack sunscreen/ });

    expect(trigger.style.minHeight).toBe("44px");
    expect(trigger.style.minWidth).toBe("44px");
    expect(screen.queryByRole("button", { name: /reorder/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /trash|delete/i })).not.toBeInTheDocument();
  });
});

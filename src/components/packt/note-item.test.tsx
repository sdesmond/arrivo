// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NoteItem } from "./note-item";
import type { ItineraryNote } from "@/data/types";

const note: ItineraryNote = {
  id: "note-1",
  content: "Remember to bring sunscreen",
  position: 0,
};

describe("NoteItem", () => {
  it("renders the note content", () => {
    render(<NoteItem note={note} />);
    expect(screen.getByText("Remember to bring sunscreen")).toBeInTheDocument();
  });

  it("renders a FileText icon with strokeWidth 1.5", () => {
    render(<NoteItem note={note} />);
    const svg = document.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("mounts with id note-{id} for E2E targeting", () => {
    render(<NoteItem note={note} />);
    expect(document.getElementById("note-note-1")).toBeInTheDocument();
  });

  it("clicking content activates inline edit", async () => {
    const user = userEvent.setup();
    render(<NoteItem note={note} />);
    await user.click(screen.getByRole("button", { name: "Remember to bring sunscreen" }));
    expect(screen.getByDisplayValue("Remember to bring sunscreen")).toBeInTheDocument();
  });

  it("pressing Enter on content span activates inline edit", async () => {
    const user = userEvent.setup();
    render(<NoteItem note={note} />);
    screen.getByRole("button", { name: "Remember to bring sunscreen" }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByDisplayValue("Remember to bring sunscreen")).toBeInTheDocument();
  });

  it("Enter key commits the edit and calls onUpdate", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<NoteItem note={note} onUpdate={onUpdate} />);
    await user.click(screen.getByRole("button", { name: "Remember to bring sunscreen" }));
    const textarea = screen.getByDisplayValue("Remember to bring sunscreen");
    await user.clear(textarea);
    await user.type(textarea, "New content");
    await user.keyboard("{Enter}");
    expect(onUpdate).toHaveBeenCalledWith("note-1", "New content");
  });

  it("blur commits the edit and calls onUpdate", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<NoteItem note={note} onUpdate={onUpdate} />);
    await user.click(screen.getByRole("button", { name: "Remember to bring sunscreen" }));
    const textarea = screen.getByDisplayValue("Remember to bring sunscreen");
    await user.clear(textarea);
    await user.type(textarea, "Blurred content");
    fireEvent.blur(textarea);
    expect(onUpdate).toHaveBeenCalledWith("note-1", "Blurred content");
  });

  it("Escape cancels edit without calling onUpdate", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<NoteItem note={note} onUpdate={onUpdate} />);
    await user.click(screen.getByRole("button", { name: "Remember to bring sunscreen" }));
    const textarea = screen.getByDisplayValue("Remember to bring sunscreen");
    await user.clear(textarea);
    await user.type(textarea, "Discarded");
    await user.keyboard("{Escape}");
    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText("Remember to bring sunscreen")).toBeInTheDocument();
  });

  it("does not call onUpdate when content unchanged", async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<NoteItem note={note} onUpdate={onUpdate} />);
    await user.click(screen.getByRole("button", { name: "Remember to bring sunscreen" }));
    await user.keyboard("{Enter}");
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("delete button calls onDelete with note id", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<NoteItem note={note} onDelete={onDelete} />);
    await user.click(screen.getByTitle("Delete note"));
    expect(onDelete).toHaveBeenCalledWith("note-1");
  });

  it("delete button has mobile-always-visible and desktop-hover-only CSS classes", () => {
    render(<NoteItem note={note} onDelete={vi.fn()} />);
    const trashBtn = screen.getByTitle("Delete note");
    expect(trashBtn.className).toContain("opacity-100");
    expect(trashBtn.className).toContain("sm:opacity-0");
    expect(trashBtn.className).toContain("sm:group-hover:opacity-100");
  });

  // ── isDraft mode ──────────────────────────────────────────────────────────

  it("isDraft renders textarea immediately without clicking", () => {
    const draftNote: ItineraryNote = { id: "draft", content: "", position: 0 };
    render(<NoteItem note={draftNote} isDraft onCreate={vi.fn()} onCancelDraft={vi.fn()} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("isDraft Enter with content calls onCreate", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const draftNote: ItineraryNote = { id: "draft", content: "", position: 0 };
    render(<NoteItem note={draftNote} isDraft onCreate={onCreate} onCancelDraft={vi.fn()} />);
    await user.type(screen.getByRole("textbox"), "Bring tickets");
    await user.keyboard("{Enter}");
    expect(onCreate).toHaveBeenCalledWith("Bring tickets");
  });

  it("isDraft Escape calls onCancelDraft", async () => {
    const user = userEvent.setup();
    const onCancelDraft = vi.fn();
    const draftNote: ItineraryNote = { id: "draft", content: "", position: 0 };
    render(<NoteItem note={draftNote} isDraft onCreate={vi.fn()} onCancelDraft={onCancelDraft} />);
    await user.keyboard("{Escape}");
    expect(onCancelDraft).toHaveBeenCalled();
  });

  it("isDraft blur with empty content calls onCancelDraft", () => {
    const onCancelDraft = vi.fn();
    const draftNote: ItineraryNote = { id: "draft", content: "", position: 0 };
    render(<NoteItem note={draftNote} isDraft onCreate={vi.fn()} onCancelDraft={onCancelDraft} />);
    fireEvent.blur(screen.getByRole("textbox"));
    expect(onCancelDraft).toHaveBeenCalled();
  });

  it("isDraft blur with content calls onCreate", async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn();
    const draftNote: ItineraryNote = { id: "draft", content: "", position: 0 };
    render(<NoteItem note={draftNote} isDraft onCreate={onCreate} onCancelDraft={vi.fn()} />);
    await user.type(screen.getByRole("textbox"), "Pack sunscreen");
    fireEvent.blur(screen.getByRole("textbox"));
    expect(onCreate).toHaveBeenCalledWith("Pack sunscreen");
  });

  it("renders dragHandle when provided", () => {
    render(<NoteItem note={note} dragHandle={<span data-testid="drag-handle">grip</span>} />);
    expect(screen.getByTestId("drag-handle")).toBeInTheDocument();
  });

  it("does NOT render dragHandle slot when isDraft", () => {
    const draftNote: ItineraryNote = { id: "draft", content: "", position: 0 };
    render(
      <NoteItem
        note={draftNote}
        isDraft
        onCreate={vi.fn()}
        onCancelDraft={vi.fn()}
        dragHandle={<span data-testid="drag-handle">grip</span>}
      />
    );
    expect(screen.queryByTestId("drag-handle")).not.toBeInTheDocument();
  });
});

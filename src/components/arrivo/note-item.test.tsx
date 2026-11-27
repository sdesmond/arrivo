import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NoteItem } from "./note-item";
import { TripEditAccessProvider } from "./trip-edit-access";
import type { ItineraryNote } from "@/data/types";
import { FIELD_LIMITS } from "@/lib/validation-limits";
import { IconSize } from "@/lib/size-tokens";

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
    const actionGroup = screen.getByTitle("Delete note").parentElement as HTMLElement;
    expect(actionGroup.className).toContain("opacity-100");
    expect(actionGroup.className).toContain("sm:opacity-0");
    expect(actionGroup.className).toContain("sm:group-hover:opacity-100");
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

  const handle = <span data-testid="drag-handle">grip</span>;

  function noteRow(): HTMLElement {
    return document.getElementById("note-note-1") as HTMLElement;
  }

  function expectNoGripOrLeftInset(container: HTMLElement) {
    expect(screen.queryByTestId("drag-handle")).not.toBeInTheDocument();
    // The note icon stays the first thing in the row, so no empty column precedes it
    expect(container.firstElementChild?.firstElementChild?.querySelector("svg")).toBeInTheDocument();
  }

  it("renders an always-visible drag handle in a leading slot before the content", () => {
    render(<NoteItem note={note} dragHandle={handle} />);
    const grip = screen.getByTestId("drag-handle");
    const slot = grip.parentElement as HTMLElement;

    expect(slot).toBe(noteRow().firstElementChild);
    expect(slot).toHaveClass("size-11", "shrink-0");
    expect(slot.style.color).toBe("var(--fg-3)");
    for (let element: HTMLElement | null = grip; element; element = element.parentElement) {
      expect(element.className).not.toContain("opacity-");
    }
    expect(grip.compareDocumentPosition(screen.getByRole("button", { name: note.content }))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it("keeps a 44px Delete on the right, apart from the drag handle", () => {
    render(<NoteItem note={note} onDelete={vi.fn()} dragHandle={handle} />);
    const deleteButton = screen.getByTitle("Delete note");
    const group = deleteButton.parentElement as HTMLElement;

    expect(group).toHaveClass("absolute", "right-1", "flex", "items-center", "sm:focus-within:opacity-100");
    expect(group).not.toContainElement(screen.getByTestId("drag-handle"));
    expect(deleteButton).toHaveClass("size-11", "items-center", "justify-center");
    expect(deleteButton.querySelector("svg")).toHaveAttribute("width", String(IconSize.rowAction));
    expect(noteRow()).toHaveClass("pr-12");
    expect(noteRow()).not.toHaveClass("pr-24");
  });

  it("hides the grip while editing but keeps the left inset and drops the right inset", async () => {
    const user = userEvent.setup();
    render(<NoteItem note={note} dragHandle={handle} />);
    await user.click(screen.getByRole("button", { name: note.content }));

    expect(screen.queryByTestId("drag-handle")).not.toBeInTheDocument();
    expect(noteRow().firstElementChild).toHaveClass("size-11", "shrink-0");
    expect(noteRow().firstElementChild).toBeEmptyDOMElement();
    expect(noteRow()).not.toHaveClass("pr-12");
    expect(screen.getByRole("textbox")).toHaveClass("min-w-0");
  });

  it("renders no leading slot when there is no drag handle", () => {
    const { container } = render(<NoteItem note={note} />);
    expectNoGripOrLeftInset(container);
    expect(noteRow()).toHaveClass("pr-12");
  });

  it("renders no drag handle or left inset when isDraft", () => {
    const draftNote: ItineraryNote = { id: "draft", content: "", position: 0 };
    const { container } = render(
      <NoteItem note={draftNote} isDraft onCreate={vi.fn()} onCancelDraft={vi.fn()} dragHandle={handle} />
    );
    expectNoGripOrLeftInset(container);
  });

  it("keeps the grip and left inset in a display-only preview so content lines up", () => {
    render(<NoteItem note={note} displayOnly dragHandle={handle} />);
    expect(screen.getByTestId("drag-handle").parentElement).toHaveClass("size-11", "shrink-0");
  });

  it("sizes the edit textarea to its wrapped content", async () => {
    // jsdom does no layout, so stand in for a note that wraps onto three lines
    Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", { configurable: true, get: () => 66 });
    try {
      const user = userEvent.setup();
      render(<NoteItem note={note} />);
      await user.click(screen.getByRole("button", { name: note.content }));
      expect(screen.getByRole("textbox").style.height).toBe("66px");
    } finally {
      Reflect.deleteProperty(HTMLTextAreaElement.prototype, "scrollHeight");
    }
  });

  it("leaves the textarea height to its rows when it cannot be measured", async () => {
    const user = userEvent.setup();
    render(<NoteItem note={note} />);
    await user.click(screen.getByRole("button", { name: note.content }));
    expect(screen.getByRole("textbox").style.height).toBe("auto");
  });

  it("lets long unbroken content wrap", () => {
    render(<NoteItem note={note} />);
    expect(screen.getByText(note.content)).toHaveClass("min-w-0", "wrap-anywhere");
  });
});

describe("NoteItem for a viewer", () => {
  it("shows the note as text without edit, drag or delete controls", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <TripEditAccessProvider canEdit={false}>
        <NoteItem
          note={note}
          onUpdate={vi.fn()}
          onDelete={vi.fn()}
          dragHandle={<span data-testid="drag-handle">drag</span>}
        />
      </TripEditAccessProvider>
    );

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("drag-handle")).not.toBeInTheDocument();
    expect(container.firstElementChild?.firstElementChild?.querySelector("svg")).toBeInTheDocument();
    expect(screen.getByText("Remember to bring sunscreen")).toHaveClass("min-w-0", "wrap-anywhere");
    await user.click(screen.getByText("Remember to bring sunscreen"));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});

describe("NoteItem length limit", () => {
  it("caps the note textarea at the shared itinerary note limit", () => {
    const draftNote: ItineraryNote = { id: "draft", content: "", position: 0 };
    render(<NoteItem note={draftNote} isDraft onCreate={vi.fn()} onCancelDraft={vi.fn()} />);
    expect(screen.getByRole("textbox")).toHaveAttribute("maxLength", String(FIELD_LIMITS.itineraryNote));
  });
});

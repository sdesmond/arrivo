import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlaceRowNoteEditor } from "./place-row-note-editor";
import { TripEditAccessProvider } from "./trip-edit-access";

const defaultProps = {
  note: "Bring cash",
  isEditingNote: false,
  draftNote: "Bring cash",
  onDraftChange: vi.fn(),
  onSave: vi.fn(),
  onCancel: vi.fn(),
  onStartEdit: vi.fn(),
};

describe("PlaceRowNoteEditor", () => {
  it("opens the editor when the note is clicked", async () => {
    const user = userEvent.setup();
    const onStartEdit = vi.fn();
    render(<PlaceRowNoteEditor {...defaultProps} onStartEdit={onStartEdit} />);
    await user.click(screen.getByRole("button", { name: "Bring cash" }));
    expect(onStartEdit).toHaveBeenCalledOnce();
  });

  it("opens the editor from the keyboard", () => {
    const onStartEdit = vi.fn();
    render(<PlaceRowNoteEditor {...defaultProps} onStartEdit={onStartEdit} />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Bring cash" }), { key: " " });
    expect(onStartEdit).toHaveBeenCalledOnce();
  });

  it("prompts for a note when there is none", () => {
    render(<PlaceRowNoteEditor {...defaultProps} note={undefined} />);
    expect(screen.getByRole("button", { name: "Add a note..." })).toBeInTheDocument();
  });

  it("saves on blur and cancels on Escape while editing", () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    const onDraftChange = vi.fn();
    render(
      <PlaceRowNoteEditor
        {...defaultProps}
        isEditingNote
        onSave={onSave}
        onCancel={onCancel}
        onDraftChange={onDraftChange}
      />
    );
    const textarea = screen.getByDisplayValue("Bring cash");
    fireEvent.change(textarea, { target: { value: "Bring yen" } });
    expect(onDraftChange).toHaveBeenCalledWith("Bring yen");
    fireEvent.keyDown(textarea, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
    fireEvent.blur(textarea);
    expect(onSave).toHaveBeenCalledOnce();
  });

  describe("for a viewer", () => {
    function renderAsViewer(props: Partial<React.ComponentProps<typeof PlaceRowNoteEditor>> = {}) {
      return render(
        <TripEditAccessProvider canEdit={false}>
          <PlaceRowNoteEditor {...defaultProps} {...props} />
        </TripEditAccessProvider>
      );
    }

    it("shows an existing note as plain text that never opens the editor", async () => {
      const user = userEvent.setup();
      const onStartEdit = vi.fn();
      renderAsViewer({ onStartEdit });

      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      await user.click(screen.getByText("Bring cash"));
      expect(onStartEdit).not.toHaveBeenCalled();
    });

    it("renders nothing when there is no note", () => {
      const { container } = renderAsViewer({ note: undefined });
      expect(container).toBeEmptyDOMElement();
    });
  });
});

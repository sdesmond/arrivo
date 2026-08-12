import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { TripNotesEditor, type TripNotesEditorHandle } from "./trip-notes-editor";
import { createTripNote, updateTripNote } from "@/app/(app)/trips/[tripId]/actions";
import { toast } from "sonner";

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

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("TripNotesEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("focuses the title field on mount", () => {
    render(<TripNotesEditor tripId="trip-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByLabelText("Note title")).toHaveFocus();
  });

  it("does not commit when focus moves between title and body within the composite", async () => {
    const onClose = vi.fn();
    render(<TripNotesEditor tripId="trip-1" onClose={onClose} onSaved={vi.fn()} />);
    const title = screen.getByLabelText("Note title");
    const body = screen.getByLabelText("Note body");

    await userEvent.type(title, "Pack sunscreen");
    fireEvent.blur(title, { relatedTarget: body });

    expect(mockCreateTripNote).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("discards a blank draft on blur without calling the server action", async () => {
    const onClose = vi.fn();
    render(<TripNotesEditor tripId="trip-1" onClose={onClose} onSaved={vi.fn()} />);
    const title = screen.getByLabelText("Note title");

    fireEvent.blur(title, { relatedTarget: null });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockCreateTripNote).not.toHaveBeenCalled();
  });

  it("discards a whitespace-only draft on blur without calling the server action", async () => {
    const onClose = vi.fn();
    render(<TripNotesEditor tripId="trip-1" onClose={onClose} onSaved={vi.fn()} />);
    const title = screen.getByLabelText("Note title");
    const body = screen.getByLabelText("Note body");

    await userEvent.type(title, "   ");
    await userEvent.type(body, "   ");
    fireEvent.blur(title, { relatedTarget: null });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockCreateTripNote).not.toHaveBeenCalled();
  });

  it("commits the serialized values when focus leaves the composite", async () => {
    mockCreateTripNote.mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<TripNotesEditor tripId="trip-1" onClose={onClose} onSaved={vi.fn()} />);
    const title = screen.getByLabelText("Note title");
    const body = screen.getByLabelText("Note body");

    await userEvent.type(title, "Pack sunscreen");
    await userEvent.type(body, "Reef-safe only");
    fireEvent.blur(body, { relatedTarget: null });

    await waitFor(() =>
      expect(mockCreateTripNote).toHaveBeenCalledWith("trip-1", { title: "Pack sunscreen", body: "Reef-safe only" })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("commits a body-only draft with an undefined title", async () => {
    mockCreateTripNote.mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<TripNotesEditor tripId="trip-1" onClose={onClose} onSaved={vi.fn()} />);
    const body = screen.getByLabelText("Note body");

    await userEvent.type(body, "Buy tickets");
    fireEvent.blur(body, { relatedTarget: null });

    await waitFor(() =>
      expect(mockCreateTripNote).toHaveBeenCalledWith("trip-1", { title: undefined, body: "Buy tickets" })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("sets aria-busy on the composite while the save request is in flight", async () => {
    const { promise, resolve } = deferred<void>();
    mockCreateTripNote.mockReturnValue(promise);
    render(<TripNotesEditor tripId="trip-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    const title = screen.getByLabelText("Note title");

    await userEvent.type(title, "Pack sunscreen");
    fireEvent.blur(title, { relatedTarget: null });

    await waitFor(() => expect(title.closest("[aria-busy]")).toHaveAttribute("aria-busy", "true"));

    resolve(undefined);
    await waitFor(() => expect(title.closest("[aria-busy]")).toHaveAttribute("aria-busy", "false"));
  });

  it("announces 'Saving note' only after a delay while the request is still pending", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { promise, resolve } = deferred<void>();
    mockCreateTripNote.mockReturnValue(promise);
    render(<TripNotesEditor tripId="trip-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    const title = screen.getByLabelText("Note title");

    await act(async () => {
      fireEvent.change(title, { target: { value: "Pack sunscreen" } });
    });
    await act(async () => {
      fireEvent.blur(title, { relatedTarget: null });
    });

    expect(screen.getByText("", { selector: "[aria-live] span" })).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe("Saving note");

    await act(async () => {
      resolve(undefined);
      await promise;
    });
  });

  it("reports a successful save exactly once before closing", async () => {
    mockCreateTripNote.mockResolvedValue(undefined);
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<TripNotesEditor tripId="trip-1" onClose={onClose} onSaved={onSaved} />);
    const title = screen.getByLabelText("Note title");

    await userEvent.type(title, "Pack sunscreen");
    fireEvent.blur(title, { relatedTarget: null });

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onSaved.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0]);
  });

  it("keeps the editor open with the dirty value and shows an inline error plus Retry on failure", async () => {
    mockCreateTripNote.mockRejectedValue(new Error("network down"));
    const onClose = vi.fn();
    render(<TripNotesEditor tripId="trip-1" onClose={onClose} onSaved={vi.fn()} />);
    const title = screen.getByLabelText("Note title");

    await userEvent.type(title, "Pack sunscreen");
    fireEvent.blur(title, { relatedTarget: null });

    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Note title")).toHaveValue("Pack sunscreen");
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save note. Try again.");
    expect(toast.error).toHaveBeenCalledWith("Couldn't save note. Try again.");
  });

  it("focuses the Retry control after a failure", async () => {
    mockCreateTripNote.mockRejectedValue(new Error("network down"));
    render(<TripNotesEditor tripId="trip-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    const title = screen.getByLabelText("Note title");

    await userEvent.type(title, "Pack sunscreen");
    fireEvent.blur(title, { relatedTarget: null });

    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toHaveFocus());
  });

  it("re-invokes the create action with the same draft when Retry is activated", async () => {
    mockCreateTripNote.mockRejectedValueOnce(new Error("network down"));
    mockCreateTripNote.mockResolvedValueOnce(undefined);
    const onClose = vi.fn();
    render(<TripNotesEditor tripId="trip-1" onClose={onClose} onSaved={vi.fn()} />);
    const title = screen.getByLabelText("Note title");

    await userEvent.type(title, "Pack sunscreen");
    fireEvent.blur(title, { relatedTarget: null });
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(mockCreateTripNote).toHaveBeenCalledTimes(2));
    expect(mockCreateTripNote).toHaveBeenLastCalledWith("trip-1", { title: "Pack sunscreen", body: undefined });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("commits from the title field on Enter", async () => {
    mockCreateTripNote.mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<TripNotesEditor tripId="trip-1" onClose={onClose} onSaved={vi.fn()} />);
    const title = screen.getByLabelText("Note title");

    await userEvent.type(title, "Pack sunscreen{Enter}");

    await waitFor(() =>
      expect(mockCreateTripNote).toHaveBeenCalledWith("trip-1", { title: "Pack sunscreen", body: undefined })
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("preserves Enter as a newline in the body without committing", async () => {
    render(<TripNotesEditor tripId="trip-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    const body = screen.getByLabelText("Note body");

    fireEvent.change(body, { target: { value: "First line" } });
    fireEvent.keyDown(body, { key: "Enter" });

    expect(mockCreateTripNote).not.toHaveBeenCalled();
  });

  it("disables editing and ignores overlapping commits while a save is in flight", async () => {
    const { promise, resolve } = deferred<void>();
    mockCreateTripNote.mockReturnValue(promise);
    render(<TripNotesEditor tripId="trip-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    const title = screen.getByLabelText("Note title");
    const body = screen.getByLabelText("Note body");

    await userEvent.type(title, "Pack sunscreen");
    fireEvent.blur(title, { relatedTarget: null });
    fireEvent.blur(title, { relatedTarget: null });

    await waitFor(() => expect(title).toBeDisabled());
    expect(body).toBeDisabled();
    expect(mockCreateTripNote).toHaveBeenCalledTimes(1);

    resolve(undefined);
    await promise;
  });

  it("prefills edit mode and focuses the title field", () => {
    render(
      <TripNotesEditor
        tripId="trip-1"
        mode="edit"
        noteId="note-1"
        initialTitle="Pack sunscreen"
        initialBody="Reef-safe only"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Note title")).toHaveValue("Pack sunscreen");
    expect(screen.getByLabelText("Note body")).toHaveValue("Reef-safe only");
    expect(screen.getByLabelText("Note title")).toHaveFocus();
  });

  it("autosaves changed edit values on composite blur and keeps the editor open", async () => {
    mockUpdateTripNote.mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <TripNotesEditor
        tripId="trip-1"
        mode="edit"
        noteId="note-1"
        initialTitle="Pack sunscreen"
        initialBody="Reef-safe only"
        onClose={onClose}
        onSaved={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Note title"), { target: { value: "  Pack hats  " } });
    fireEvent.change(screen.getByLabelText("Note body"), { target: { value: "  Two each  " } });
    fireEvent.blur(screen.getByLabelText("Note body"), { relatedTarget: null });

    await waitFor(() =>
      expect(mockUpdateTripNote).toHaveBeenCalledWith("note-1", { title: "Pack hats", body: "Two each" })
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Note title")).toBeInTheDocument();
  });

  it("returns clean without saving when edit values match the baseline", async () => {
    const editorRef = createRef<TripNotesEditorHandle>();
    render(
      <TripNotesEditor
        ref={editorRef}
        tripId="trip-1"
        mode="edit"
        noteId="note-1"
        initialTitle="Pack sunscreen"
        initialBody="Reef-safe only"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    await expect(editorRef.current?.commit()).resolves.toBe("clean");
    expect(mockUpdateTripNote).not.toHaveBeenCalled();
  });

  it("discards a blank edit by restoring saved content without a server call", async () => {
    render(
      <TripNotesEditor
        tripId="trip-1"
        mode="edit"
        noteId="note-1"
        initialTitle="Pack sunscreen"
        initialBody="Reef-safe only"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Note title"), { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText("Note body"), { target: { value: "" } });
    fireEvent.blur(screen.getByLabelText("Note body"), { relatedTarget: null });

    await waitFor(() => expect(screen.getByLabelText("Note title")).toHaveValue("Pack sunscreen"));
    expect(screen.getByLabelText("Note body")).toHaveValue("Reef-safe only");
    expect(mockUpdateTripNote).not.toHaveBeenCalled();
  });

  it("returns failed and preserves dirty edit values with linked error, focused Retry, and toast", async () => {
    mockUpdateTripNote.mockRejectedValue(new Error("network down"));
    const editorRef = createRef<TripNotesEditorHandle>();
    render(
      <TripNotesEditor
        ref={editorRef}
        tripId="trip-1"
        mode="edit"
        noteId="note-1"
        initialTitle="Pack sunscreen"
        initialBody="Reef-safe only"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("Note title"), { target: { value: "Pack hats" } });

    let commitResult: string | undefined;
    await act(async () => {
      commitResult = await editorRef.current?.commit();
    });

    expect(commitResult).toBe("failed");
    expect(screen.getByLabelText("Note title")).toHaveValue("Pack hats");
    expect(screen.getByLabelText("Note title")).toHaveAttribute("aria-describedby", "trip-note-editor-error");
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save note. Try again.");
    expect(screen.getByRole("button", { name: "Retry" })).toHaveFocus();
    expect(toast.error).toHaveBeenCalledWith("Couldn't save note. Try again.");
  });

  it("retries a failed edit with the preserved values", async () => {
    mockUpdateTripNote.mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce(undefined);
    render(
      <TripNotesEditor
        tripId="trip-1"
        mode="edit"
        noteId="note-1"
        initialTitle="Pack sunscreen"
        initialBody="Reef-safe only"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("Note title"), { target: { value: "Pack hats" } });
    fireEvent.blur(screen.getByLabelText("Note title"), { relatedTarget: null });
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toHaveFocus());

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(mockUpdateTripNote).toHaveBeenCalledTimes(2));
    expect(mockUpdateTripNote).toHaveBeenLastCalledWith("note-1", {
      title: "Pack hats",
      body: "Reef-safe only",
    });
  });

  it("shares one in-flight edit request across overlapping imperative commits", async () => {
    const { promise, resolve } = deferred<void>();
    mockUpdateTripNote.mockReturnValue(promise);
    const editorRef = createRef<TripNotesEditorHandle>();
    render(
      <TripNotesEditor
        ref={editorRef}
        tripId="trip-1"
        mode="edit"
        noteId="note-1"
        initialTitle="Pack sunscreen"
        initialBody="Reef-safe only"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("Note title"), { target: { value: "Pack hats" } });

    const firstCommit = editorRef.current!.commit();
    const secondCommit = editorRef.current!.commit();

    expect(mockUpdateTripNote).toHaveBeenCalledTimes(1);
    resolve(undefined);
    await expect(Promise.all([firstCommit, secondCommit])).resolves.toEqual(["saved", "saved"]);
  });

  it("returns saved once, announces once, and resets the edit baseline", async () => {
    mockUpdateTripNote.mockResolvedValue(undefined);
    const editorRef = createRef<TripNotesEditorHandle>();
    const onSaved = vi.fn();
    render(
      <TripNotesEditor
        ref={editorRef}
        tripId="trip-1"
        mode="edit"
        noteId="note-1"
        initialTitle="Pack sunscreen"
        initialBody="Reef-safe only"
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    );
    fireEvent.change(screen.getByLabelText("Note title"), { target: { value: "  Pack hats  " } });

    await expect(editorRef.current?.commit()).resolves.toBe("saved");
    expect(onSaved).toHaveBeenCalledTimes(1);
    await expect(editorRef.current?.commit()).resolves.toBe("clean");
    expect(mockUpdateTripNote).toHaveBeenCalledTimes(1);
  });

  it("sends a cleared single field as empty so the explicit clear persists", async () => {
    mockUpdateTripNote.mockResolvedValue(undefined);
    render(
      <TripNotesEditor
        tripId="trip-1"
        mode="edit"
        noteId="note-1"
        initialTitle="Pack sunscreen"
        initialBody="Reef-safe only"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Note body"), { target: { value: "" } });
    fireEvent.blur(screen.getByLabelText("Note body"), { relatedTarget: null });

    await waitFor(() =>
      expect(mockUpdateTripNote).toHaveBeenCalledWith("note-1", { title: "Pack sunscreen", body: "" })
    );
  });

  it("commits dirty edits on unmount when no blur fired", async () => {
    mockUpdateTripNote.mockResolvedValue(undefined);
    const { unmount } = render(
      <TripNotesEditor
        tripId="trip-1"
        mode="edit"
        noteId="note-1"
        initialTitle="Pack sunscreen"
        initialBody="Reef-safe only"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("Note title"), { target: { value: "Pack hats" } });

    unmount();

    await waitFor(() =>
      expect(mockUpdateTripNote).toHaveBeenCalledWith("note-1", { title: "Pack hats", body: "Reef-safe only" })
    );
  });

  it("does not call the action on unmount when the editor holds no changes", async () => {
    const { unmount } = render(
      <TripNotesEditor
        tripId="trip-1"
        mode="edit"
        noteId="note-1"
        initialTitle="Pack sunscreen"
        initialBody="Reef-safe only"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    unmount();

    expect(mockUpdateTripNote).not.toHaveBeenCalled();
  });

  it("reuses the in-flight request when unmount races a blur-triggered save", async () => {
    const { promise, resolve } = deferred<void>();
    mockUpdateTripNote.mockReturnValue(promise);
    const { unmount } = render(
      <TripNotesEditor
        tripId="trip-1"
        mode="edit"
        noteId="note-1"
        initialTitle="Pack sunscreen"
        initialBody="Reef-safe only"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("Note title"), { target: { value: "Pack hats" } });
    fireEvent.blur(screen.getByLabelText("Note title"), { relatedTarget: null });
    await waitFor(() => expect(mockUpdateTripNote).toHaveBeenCalledTimes(1));

    unmount();
    resolve(undefined);
    await promise;

    expect(mockUpdateTripNote).toHaveBeenCalledTimes(1);
  });

  it("stays silent when blurred again after a failed save until an explicit retry", async () => {
    mockUpdateTripNote.mockRejectedValue(new Error("network down"));
    render(
      <TripNotesEditor
        tripId="trip-1"
        mode="edit"
        noteId="note-1"
        initialTitle="Pack sunscreen"
        initialBody="Reef-safe only"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("Note title"), { target: { value: "Pack hats" } });
    fireEvent.blur(screen.getByLabelText("Note title"), { relatedTarget: null });
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument());

    fireEvent.blur(screen.getByLabelText("Note title"), { relatedTarget: null });

    expect(mockUpdateTripNote).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(mockUpdateTripNote).toHaveBeenCalledTimes(2));
  });

  it("restores the trimmed display for a whitespace-only edit without saving", async () => {
    render(
      <TripNotesEditor
        tripId="trip-1"
        mode="edit"
        noteId="note-1"
        initialTitle="Pack sunscreen"
        initialBody="Reef-safe only"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Note title"), { target: { value: "Pack sunscreen " } });
    fireEvent.blur(screen.getByLabelText("Note title"), { relatedTarget: null });

    await waitFor(() => expect(screen.getByLabelText("Note title")).toHaveValue("Pack sunscreen"));
    expect(mockUpdateTripNote).not.toHaveBeenCalled();
  });

  it("does not call the action when an edit-mode blur carries no changes", async () => {
    render(
      <TripNotesEditor
        tripId="trip-1"
        mode="edit"
        noteId="note-1"
        initialTitle="Pack sunscreen"
        initialBody="Reef-safe only"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    fireEvent.blur(screen.getByLabelText("Note title"), { relatedTarget: null });

    expect(mockUpdateTripNote).not.toHaveBeenCalled();
  });

  it("commits from the title field on Enter in edit mode and stays open", async () => {
    mockUpdateTripNote.mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(
      <TripNotesEditor
        tripId="trip-1"
        mode="edit"
        noteId="note-1"
        initialTitle="Pack sunscreen"
        initialBody="Reef-safe only"
        onClose={onClose}
        onSaved={vi.fn()}
      />
    );
    const title = screen.getByLabelText("Note title");

    await userEvent.type(title, "{End} updated{Enter}");

    await waitFor(() =>
      expect(mockUpdateTripNote).toHaveBeenCalledWith("note-1", {
        title: "Pack sunscreen updated",
        body: "Reef-safe only",
      })
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Note title")).toBeInTheDocument();
  });
});

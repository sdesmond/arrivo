import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { TripNotesEditor, type TripNotesEditorHandle } from "./trip-notes-editor";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { createTripNote, updateTripNote } from "@/lib/api/contract/trip-notes";
import { FIELD_LIMITS } from "@/lib/validation-limits";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
  Toaster: () => null,
}));

vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  api: vi.fn(),
}));

const mockApi = vi.mocked(api);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function createCalls() {
  return mockApi.mock.calls.filter(([endpoint]) => endpoint === createTripNote);
}

function updateCalls() {
  return mockApi.mock.calls.filter(([endpoint]) => endpoint === updateTripNote);
}

function expectCreated(body: Record<string, unknown>) {
  expect(mockApi).toHaveBeenCalledWith(createTripNote, {
    params: { tripId: "trip-1" },
    body: { id: expect.stringMatching(UUID_PATTERN), ...body },
  });
}

function expectUpdated(noteId: string, body: Record<string, unknown>) {
  expect(mockApi).toHaveBeenCalledWith(updateTripNote, { params: { noteId }, body });
}

const serverFailure = () => new ApiClientError(500, "server_error", "The server could not save the note.");

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
    mockApi.mockResolvedValue(undefined as never);
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

    expect(createCalls()).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not commit when focus moves from the editor to a control in its row", () => {
    render(
      <li>
        <TripNotesEditor
          tripId="trip-1"
          mode="edit"
          noteId="note-1"
          initialTitle="Pack sunscreen"
          onClose={vi.fn()}
          onSaved={vi.fn()}
        />
        <button type="button">Delete Pack sunscreen</button>
      </li>
    );
    const title = screen.getByLabelText("Note title");
    const deleteButton = screen.getByRole("button", { name: "Delete Pack sunscreen" });
    fireEvent.change(title, { target: { value: "Pack hats" } });

    fireEvent.blur(title, { relatedTarget: deleteButton });

    expect(updateCalls()).toHaveLength(0);
  });

  it("discards a blank draft on blur without calling the API", async () => {
    const onClose = vi.fn();
    render(<TripNotesEditor tripId="trip-1" onClose={onClose} onSaved={vi.fn()} />);
    const title = screen.getByLabelText("Note title");

    fireEvent.blur(title, { relatedTarget: null });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(createCalls()).toHaveLength(0);
  });

  it("discards a whitespace-only draft on blur without calling the API", async () => {
    const onClose = vi.fn();
    render(<TripNotesEditor tripId="trip-1" onClose={onClose} onSaved={vi.fn()} />);
    const title = screen.getByLabelText("Note title");
    const body = screen.getByLabelText("Note body");

    await userEvent.type(title, "   ");
    await userEvent.type(body, "   ");
    fireEvent.blur(title, { relatedTarget: null });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(createCalls()).toHaveLength(0);
  });

  it("commits the serialized values when focus leaves the composite", async () => {
    const onClose = vi.fn();
    render(<TripNotesEditor tripId="trip-1" onClose={onClose} onSaved={vi.fn()} />);
    const title = screen.getByLabelText("Note title");
    const body = screen.getByLabelText("Note body");

    await userEvent.type(title, "Pack sunscreen");
    await userEvent.type(body, "Reef-safe only");
    fireEvent.blur(body, { relatedTarget: null });

    await waitFor(() => expectCreated({ title: "Pack sunscreen", body: "Reef-safe only" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("commits a body-only draft with an undefined title", async () => {
    const onClose = vi.fn();
    render(<TripNotesEditor tripId="trip-1" onClose={onClose} onSaved={vi.fn()} />);
    const body = screen.getByLabelText("Note body");

    await userEvent.type(body, "Buy tickets");
    fireEvent.blur(body, { relatedTarget: null });

    await waitFor(() => expectCreated({ body: "Buy tickets" }));
    expect((createCalls()[0][1] as { body: object }).body).not.toHaveProperty("title");
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("sets aria-busy on the composite while the save request is in flight", async () => {
    const { promise, resolve } = deferred<void>();
    mockApi.mockReturnValue(promise as never);
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
    mockApi.mockReturnValue(promise as never);
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
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<TripNotesEditor tripId="trip-1" onClose={onClose} onSaved={onSaved} />);
    const title = screen.getByLabelText("Note title");

    await userEvent.type(title, "Pack sunscreen");
    fireEvent.blur(title, { relatedTarget: null });

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onSaved.mock.invocationCallOrder[0]).toBeLessThan(onClose.mock.invocationCallOrder[0]);
  });

  it("does not create a duplicate note when a successful create unmounts the editor", async () => {
    const editorRef = createRef<TripNotesEditorHandle>();
    const { unmount } = render(<TripNotesEditor ref={editorRef} tripId="trip-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Note title"), { target: { value: "Pack sunscreen" } });

    await expect(editorRef.current?.commit()).resolves.toBe("saved");
    unmount();

    expect(createCalls()).toHaveLength(1);
  });

  it("keeps the editor open with the dirty value and shows an inline error plus Retry on failure", async () => {
    mockApi.mockRejectedValue(serverFailure());
    const onClose = vi.fn();
    render(<TripNotesEditor tripId="trip-1" onClose={onClose} onSaved={vi.fn()} />);
    const title = screen.getByLabelText("Note title");

    await userEvent.type(title, "Pack sunscreen");
    fireEvent.blur(title, { relatedTarget: null });

    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Note title")).toHaveValue("Pack sunscreen");
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't save note. Try again.");
    expect(toast.error).toHaveBeenCalledWith("The server could not save the note.");
  });

  it("focuses the Retry control after a failure", async () => {
    mockApi.mockRejectedValue(serverFailure());
    render(<TripNotesEditor tripId="trip-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    const title = screen.getByLabelText("Note title");

    await userEvent.type(title, "Pack sunscreen");
    fireEvent.blur(title, { relatedTarget: null });

    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toHaveFocus());
  });

  it("re-invokes the create action with the same draft when Retry is activated", async () => {
    mockApi.mockRejectedValueOnce(serverFailure());
    const onClose = vi.fn();
    render(<TripNotesEditor tripId="trip-1" onClose={onClose} onSaved={vi.fn()} />);
    const title = screen.getByLabelText("Note title");

    await userEvent.type(title, "Pack sunscreen");
    fireEvent.blur(title, { relatedTarget: null });
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(createCalls()).toHaveLength(2));
    expect(createCalls().at(-1)?.[1]).toEqual({
      params: { tripId: "trip-1" },
      body: { id: expect.stringMatching(UUID_PATTERN), title: "Pack sunscreen" },
    });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("commits from the title field on Enter", async () => {
    const onClose = vi.fn();
    render(<TripNotesEditor tripId="trip-1" onClose={onClose} onSaved={vi.fn()} />);
    const title = screen.getByLabelText("Note title");

    await userEvent.type(title, "Pack sunscreen{Enter}");

    await waitFor(() => expectCreated({ title: "Pack sunscreen" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("preserves Enter as a newline in the body without committing", async () => {
    render(<TripNotesEditor tripId="trip-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    const body = screen.getByLabelText("Note body");

    fireEvent.change(body, { target: { value: "First line" } });
    fireEvent.keyDown(body, { key: "Enter" });

    expect(createCalls()).toHaveLength(0);
  });

  it("disables editing and ignores overlapping commits while a save is in flight", async () => {
    const { promise, resolve } = deferred<void>();
    mockApi.mockReturnValue(promise as never);
    render(<TripNotesEditor tripId="trip-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    const title = screen.getByLabelText("Note title");
    const body = screen.getByLabelText("Note body");

    await userEvent.type(title, "Pack sunscreen");
    fireEvent.blur(title, { relatedTarget: null });
    fireEvent.blur(title, { relatedTarget: null });

    await waitFor(() => expect(title).toBeDisabled());
    expect(body).toBeDisabled();
    expect(createCalls()).toHaveLength(1);

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

    await waitFor(() => expectUpdated("note-1", { title: "Pack hats", body: "Two each" }));
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
    expect(updateCalls()).toHaveLength(0);
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
    expect(updateCalls()).toHaveLength(0);
  });

  it("returns failed and preserves dirty edit values with linked error, focused Retry, and toast", async () => {
    mockApi.mockRejectedValue(serverFailure());
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
    expect(toast.error).toHaveBeenCalledWith("The server could not save the note.");
  });

  it("retries a failed edit with the preserved values", async () => {
    mockApi.mockRejectedValueOnce(serverFailure());
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

    await waitFor(() => expect(updateCalls()).toHaveLength(2));
    expect(updateCalls().at(-1)?.[1]).toEqual({ params: { noteId: "note-1" }, body: { title: "Pack hats" } });
  });

  it("shares one in-flight edit request across overlapping imperative commits", async () => {
    const { promise, resolve } = deferred<void>();
    mockApi.mockReturnValue(promise as never);
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

    expect(updateCalls()).toHaveLength(1);
    resolve(undefined);
    await expect(Promise.all([firstCommit, secondCommit])).resolves.toEqual(["saved", "saved"]);
  });

  it("returns saved once, announces once, and resets the edit baseline", async () => {
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
    expect(updateCalls()).toHaveLength(1);
  });

  it("sends a cleared single field as empty so the explicit clear persists", async () => {
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

    await waitFor(() => expectUpdated("note-1", { body: "" }));
  });

  it("commits dirty edits on unmount when no blur fired", async () => {
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

    await waitFor(() => expectUpdated("note-1", { title: "Pack hats" }));
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

    expect(updateCalls()).toHaveLength(0);
  });

  it("reuses the in-flight request when unmount races a blur-triggered save", async () => {
    const { promise, resolve } = deferred<void>();
    mockApi.mockReturnValue(promise as never);
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
    await waitFor(() => expect(updateCalls()).toHaveLength(1));

    unmount();
    resolve(undefined);
    await promise;

    expect(updateCalls()).toHaveLength(1);
  });

  it("stays silent when blurred again after a failed save until an explicit retry", async () => {
    mockApi.mockRejectedValue(serverFailure());
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

    expect(updateCalls()).toHaveLength(1);
    expect(toast.error).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(updateCalls()).toHaveLength(2));
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
    expect(updateCalls()).toHaveLength(0);
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

    expect(updateCalls()).toHaveLength(0);
  });

  it("commits from the title field on Enter in edit mode and stays open", async () => {
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

    await waitFor(() => expectUpdated("note-1", { title: "Pack sunscreen updated" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Note title")).toBeInTheDocument();
  });
});

describe("TripNotesEditor client id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.mockResolvedValue(undefined as never);
  });

  async function failCreate(): Promise<void> {
    render(<TripNotesEditor tripId="trip-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Note title"), "Pack sunscreen");
    fireEvent.blur(screen.getByLabelText("Note title"), { relatedTarget: null });
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument());
  }

  function ids(): string[] {
    return createCalls().map(([, input]) => (input as { body: { id: string } }).body.id);
  }

  it("sends the same id on a retry after a failed create", async () => {
    mockApi.mockRejectedValueOnce(serverFailure());
    await failCreate();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(createCalls()).toHaveLength(2));
    expect(ids()[0]).toMatch(UUID_PATTERN);
    expect(ids()[1]).toBe(ids()[0]);
  });

  it("sends a fresh id after the server reports the id belongs to a different note", async () => {
    mockApi.mockRejectedValueOnce(
      new ApiClientError(409, "conflict", "This ID was already used for a different note.")
    );
    await failCreate();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(createCalls()).toHaveLength(2));
    expect(ids()[1]).toMatch(UUID_PATTERN);
    expect(ids()[1]).not.toBe(ids()[0]);
  });

  it("gives each new draft its own id", async () => {
    const first = render(<TripNotesEditor tripId="trip-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Note title"), "One{Enter}");
    await waitFor(() => expect(createCalls()).toHaveLength(1));
    first.unmount();

    render(<TripNotesEditor tripId="trip-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Note title"), "Two{Enter}");
    await waitFor(() => expect(createCalls()).toHaveLength(2));

    expect(ids()[0]).not.toBe(ids()[1]);
  });

  it("gives the next draft its own id when the editor stays mounted after a save", async () => {
    const editorRef = createRef<TripNotesEditorHandle>();
    render(<TripNotesEditor ref={editorRef} tripId="trip-1" onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Note title"), { target: { value: "One" } });
    await expect(editorRef.current?.commit()).resolves.toBe("saved");
    fireEvent.change(screen.getByLabelText("Note title"), { target: { value: "Two" } });
    await expect(editorRef.current?.commit()).resolves.toBe("saved");

    expect(createCalls()).toHaveLength(2);
    expect(ids()[1]).not.toBe(ids()[0]);
  });

  it("still sends a create when the draft is unmounted with text", async () => {
    const { unmount } = render(<TripNotesEditor tripId="trip-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Note body"), { target: { value: "Remember the tickets" } });

    unmount();

    await waitFor(() => expectCreated({ body: "Remember the tickets" }));
  });

  it("falls back to a failed result when edit mode has no note id", async () => {
    const editorRef = createRef<TripNotesEditorHandle>();
    render(
      <TripNotesEditor
        ref={editorRef}
        tripId="trip-1"
        mode="edit"
        initialTitle="A"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );
    fireEvent.change(screen.getByLabelText("Note title"), { target: { value: "B" } });

    let result: string | undefined;
    await act(async () => {
      result = await editorRef.current?.commit();
    });

    expect(result).toBe("failed");
    expect(mockApi).not.toHaveBeenCalled();
  });
});

describe("TripNotesEditor length limits", () => {
  it("caps the title and body at the shared note limits", () => {
    render(<TripNotesEditor tripId="trip-1" onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByLabelText("Note title")).toHaveAttribute("maxLength", String(FIELD_LIMITS.noteTitle));
    expect(screen.getByLabelText("Note body")).toHaveAttribute("maxLength", String(FIELD_LIMITS.noteBody));
  });
});

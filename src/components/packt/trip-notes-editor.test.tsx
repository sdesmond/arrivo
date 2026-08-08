import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TripNotesEditor } from "./trip-notes-editor";
import { createTripNote } from "@/app/(app)/trips/[tripId]/actions";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
  Toaster: () => null,
}));

vi.mock("@/app/(app)/trips/[tripId]/actions", () => ({
  createTripNote: vi.fn(),
}));

const mockCreateTripNote = vi.mocked(createTripNote);

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
    render(<TripNotesEditor tripId="trip-1" onClose={vi.fn()} />);
    expect(screen.getByLabelText("Note title")).toHaveFocus();
  });

  it("does not commit when focus moves between title and body within the composite", async () => {
    const onClose = vi.fn();
    render(<TripNotesEditor tripId="trip-1" onClose={onClose} />);
    const title = screen.getByLabelText("Note title");
    const body = screen.getByLabelText("Note body");

    await userEvent.type(title, "Pack sunscreen");
    fireEvent.blur(title, { relatedTarget: body });

    expect(mockCreateTripNote).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("discards a blank draft on blur without calling the server action", async () => {
    const onClose = vi.fn();
    render(<TripNotesEditor tripId="trip-1" onClose={onClose} />);
    const title = screen.getByLabelText("Note title");

    fireEvent.blur(title, { relatedTarget: null });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(mockCreateTripNote).not.toHaveBeenCalled();
  });

  it("discards a whitespace-only draft on blur without calling the server action", async () => {
    const onClose = vi.fn();
    render(<TripNotesEditor tripId="trip-1" onClose={onClose} />);
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
    render(<TripNotesEditor tripId="trip-1" onClose={onClose} />);
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
    render(<TripNotesEditor tripId="trip-1" onClose={onClose} />);
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
    render(<TripNotesEditor tripId="trip-1" onClose={vi.fn()} />);
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
    render(<TripNotesEditor tripId="trip-1" onClose={vi.fn()} />);
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

  it("announces 'Note saved' exactly once after a successful create", async () => {
    mockCreateTripNote.mockResolvedValue(undefined);
    render(<TripNotesEditor tripId="trip-1" onClose={vi.fn()} />);
    const title = screen.getByLabelText("Note title");

    await userEvent.type(title, "Pack sunscreen");
    fireEvent.blur(title, { relatedTarget: null });

    await waitFor(() => expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe("Note saved"));

    const savedAnnouncements = screen.getAllByText("Note saved");
    expect(savedAnnouncements).toHaveLength(1);
  });

  it("keeps the editor open with the dirty value and shows an inline error plus Retry on failure", async () => {
    mockCreateTripNote.mockRejectedValue(new Error("network down"));
    const onClose = vi.fn();
    render(<TripNotesEditor tripId="trip-1" onClose={onClose} />);
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
    render(<TripNotesEditor tripId="trip-1" onClose={vi.fn()} />);
    const title = screen.getByLabelText("Note title");

    await userEvent.type(title, "Pack sunscreen");
    fireEvent.blur(title, { relatedTarget: null });

    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toHaveFocus());
  });

  it("re-invokes the create action with the same draft when Retry is activated", async () => {
    mockCreateTripNote.mockRejectedValueOnce(new Error("network down"));
    mockCreateTripNote.mockResolvedValueOnce(undefined);
    const onClose = vi.fn();
    render(<TripNotesEditor tripId="trip-1" onClose={onClose} />);
    const title = screen.getByLabelText("Note title");

    await userEvent.type(title, "Pack sunscreen");
    fireEvent.blur(title, { relatedTarget: null });
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(mockCreateTripNote).toHaveBeenCalledTimes(2));
    expect(mockCreateTripNote).toHaveBeenLastCalledWith("trip-1", { title: "Pack sunscreen", body: undefined });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});

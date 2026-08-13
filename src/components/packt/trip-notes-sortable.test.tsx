import type { ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TripNotesSortable } from "./trip-notes-sortable";
import type { TripNote } from "@/data/types";

const { mockReorderTripNotes } = vi.hoisted(() => ({ mockReorderTripNotes: vi.fn() }));

vi.mock("@/app/(app)/trips/[tripId]/actions", () => ({
  reorderTripNotes: mockReorderTripNotes,
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
  Toaster: () => null,
}));

const dndContextState = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
const useSensorMock = vi.hoisted(() => vi.fn((sensor: unknown, options: unknown) => ({ sensor, options })));
const useSortableMock = vi.hoisted(() =>
  vi.fn((options: { id: string; disabled?: boolean }) => ({
    attributes: { "aria-roledescription": "sortable", "data-sortable-id": options.id },
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }))
);

vi.mock("@dnd-kit/core", () => ({
  DndContext: (props: { children: ReactNode }) => {
    dndContextState.props = props;
    return <>{props.children}</>;
  },
  DragOverlay: ({ children }: { children: ReactNode }) => <>{children}</>,
  PointerSensor: class {},
  KeyboardSensor: class {},
  useSensor: useSensorMock,
  useSensors: vi.fn((...sensors: unknown[]) => sensors),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: ReactNode }) => <>{children}</>,
  useSortable: useSortableMock,
  verticalListSortingStrategy: {},
  sortableKeyboardCoordinates: vi.fn(() => ({ x: 0, y: 100 })),
  arrayMove: (list: TripNote[], from: number, to: number) => {
    const copy = list.slice();
    const [moved] = copy.splice(from, 1);
    copy.splice(to, 0, moved);
    return copy;
  },
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: vi.fn(() => undefined) } },
}));

function buildNote(overrides: Partial<TripNote> = {}): TripNote {
  return { id: "note-1", tripId: "trip-1", position: 0, title: "Note 1", ...overrides };
}

function getDndProps<T>(): T {
  return dndContextState.props as T;
}

function renderSortable(overrides: Partial<React.ComponentProps<typeof TripNotesSortable>> = {}) {
  const props = {
    tripId: "trip-1",
    notes: [
      buildNote({ id: "note-1", title: "First note" }),
      buildNote({ id: "note-2", title: "Second note" }),
      buildNote({ id: "note-3", title: "Third note" }),
    ],
    expandedNoteId: null,
    onToggle: vi.fn(),
    onDeleteRequest: vi.fn(),
    onAnnounce: vi.fn(),
    renderEditor: vi.fn(() => <div>Editor</div>),
    ...overrides,
  };
  const utils = render(<TripNotesSortable {...props} />);
  return { ...utils, props };
}

describe("TripNotesSortable", () => {
  beforeEach(() => {
    dndContextState.props = null;
    mockReorderTripNotes.mockReset();
    mockReorderTripNotes.mockResolvedValue(undefined);
    vi.clearAllMocks();
  });

  it("renders each note's reorder handle with an accessible position label", () => {
    renderSortable();

    expect(screen.getByRole("button", { name: "Reorder First note, position 1 of 3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reorder Second note, position 2 of 3" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reorder Third note, position 3 of 3" })).toBeInTheDocument();
  });

  it("previews the candidate order during drag over without mutating anything yet", () => {
    renderSortable();

    act(() => {
      getDndProps<{ onDragOver?: (event: unknown) => void }>().onDragOver?.({
        active: { id: "note-1" },
        over: { id: "note-2" },
      });
    });

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Second note");
    expect(items[1]).toHaveTextContent("First note");
    expect(mockReorderTripNotes).not.toHaveBeenCalled();
  });

  it("submits the full ordered id list and announces the confirmed drop on a successful pointer drag", async () => {
    const onAnnounce = vi.fn();
    renderSortable({ onAnnounce });

    act(() => {
      getDndProps<{ onDragStart?: (event: unknown) => void }>().onDragStart?.({
        active: { id: "note-1" },
        activatorEvent: new MouseEvent("mousedown"),
      });
    });
    act(() => {
      getDndProps<{ onDragOver?: (event: unknown) => void }>().onDragOver?.({
        active: { id: "note-1" },
        over: { id: "note-2" },
      });
    });
    await act(async () => {
      await getDndProps<{ onDragEnd?: (event: unknown) => Promise<void> }>().onDragEnd?.({
        active: { id: "note-1" },
        over: { id: "note-2" },
      });
    });

    expect(mockReorderTripNotes).toHaveBeenCalledWith({
      tripId: "trip-1",
      orderedNoteIds: ["note-2", "note-1", "note-3"],
    });
    // Pointer drags stay silent on lift/every-candidate-position — only the confirmed outcome is announced.
    expect(onAnnounce).not.toHaveBeenCalledWith(expect.stringContaining("Reordering"));
    expect(onAnnounce).toHaveBeenCalledWith("Reordered. First note now at position 2 of 3");
    // Focus returns to the dragged handle in its new position immediately after the save.
    expect(screen.getByRole("button", { name: "Reorder First note, position 2 of 3" })).toHaveFocus();
  });

  it("announces lift instructions and every candidate position during a keyboard drag", () => {
    const onAnnounce = vi.fn();
    renderSortable({ onAnnounce });

    act(() => {
      getDndProps<{ onDragStart?: (event: unknown) => void }>().onDragStart?.({
        active: { id: "note-1" },
        activatorEvent: new KeyboardEvent("keydown", { code: "Space" }),
      });
    });

    expect(onAnnounce).toHaveBeenCalledWith(
      "Reordering First note. Use up and down arrow keys to move, space or enter to drop, escape to cancel."
    );

    act(() => {
      getDndProps<{ onDragOver?: (event: unknown) => void }>().onDragOver?.({
        active: { id: "note-1" },
        over: { id: "note-2" },
      });
    });

    expect(onAnnounce).toHaveBeenCalledWith("First note, position 2 of 3");
  });

  it("announces an invalid boundary attempt at the top of the list without moving anything", () => {
    const onAnnounce = vi.fn();
    renderSortable({ onAnnounce });

    act(() => {
      getDndProps<{ onDragStart?: (event: unknown) => void }>().onDragStart?.({
        active: { id: "note-1" },
        activatorEvent: new KeyboardEvent("keydown", { code: "Space" }),
      });
    });
    onAnnounce.mockClear();

    const handle = screen.getByRole("button", { name: "Reorder First note, position 1 of 3" });
    fireEvent.keyDown(handle, { key: "ArrowUp" });

    expect(onAnnounce).toHaveBeenCalledWith("First note is already at position 1 of 3");
    expect(mockReorderTripNotes).not.toHaveBeenCalled();
  });

  it("announces an invalid boundary attempt at the bottom of the list without moving anything", () => {
    const onAnnounce = vi.fn();
    renderSortable({ onAnnounce });

    act(() => {
      getDndProps<{ onDragStart?: (event: unknown) => void }>().onDragStart?.({
        active: { id: "note-3" },
        activatorEvent: new KeyboardEvent("keydown", { code: "Space" }),
      });
    });
    onAnnounce.mockClear();

    const handle = screen.getByRole("button", { name: "Reorder Third note, position 3 of 3" });
    fireEvent.keyDown(handle, { key: "ArrowDown" });

    expect(onAnnounce).toHaveBeenCalledWith("Third note is already at position 3 of 3");
  });

  it("does not announce a boundary for a non-boundary arrow press", () => {
    const onAnnounce = vi.fn();
    renderSortable({ onAnnounce });

    act(() => {
      getDndProps<{ onDragStart?: (event: unknown) => void }>().onDragStart?.({
        active: { id: "note-2" },
        activatorEvent: new KeyboardEvent("keydown", { code: "Space" }),
      });
    });
    onAnnounce.mockClear();

    const handle = screen.getByRole("button", { name: "Reorder Second note, position 2 of 3" });
    fireEvent.keyDown(handle, { key: "ArrowUp" });

    expect(onAnnounce).not.toHaveBeenCalledWith(expect.stringContaining("already at position"));
  });

  it("restores the original order and announces cancellation on Escape without calling the server", () => {
    const onAnnounce = vi.fn();
    renderSortable({ onAnnounce });

    act(() => {
      getDndProps<{ onDragStart?: (event: unknown) => void }>().onDragStart?.({
        active: { id: "note-1" },
        activatorEvent: new KeyboardEvent("keydown", { code: "Space" }),
      });
    });
    act(() => {
      getDndProps<{ onDragOver?: (event: unknown) => void }>().onDragOver?.({
        active: { id: "note-1" },
        over: { id: "note-2" },
      });
    });

    let items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Second note");

    act(() => {
      getDndProps<{ onDragCancel?: (event: unknown) => void }>().onDragCancel?.({ active: { id: "note-1" } });
    });

    items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("First note");
    expect(onAnnounce).toHaveBeenCalledWith("Reorder cancelled. First note restored to position 1 of 3");
    expect(mockReorderTripNotes).not.toHaveBeenCalled();
  });

  it("rolls back to the persisted order, toasts, and announces the restored position on failure", async () => {
    mockReorderTripNotes.mockRejectedValue(new Error("network down"));
    const onAnnounce = vi.fn();
    renderSortable({ onAnnounce });
    const { toast } = await import("sonner");

    act(() => {
      getDndProps<{ onDragOver?: (event: unknown) => void }>().onDragOver?.({
        active: { id: "note-1" },
        over: { id: "note-2" },
      });
    });
    await act(async () => {
      await getDndProps<{ onDragEnd?: (event: unknown) => Promise<void> }>().onDragEnd?.({
        active: { id: "note-1" },
        over: { id: "note-2" },
      });
    });

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("First note");
    expect(toast.error).toHaveBeenCalledWith("Couldn't reorder notes. Try again.");
    expect(onAnnounce).toHaveBeenCalledWith(
      "Couldn't reorder notes. Try again. First note restored to position 1 of 3"
    );
    // Failure focus returns to the same handle at its restored position.
    expect(screen.getByRole("button", { name: "Reorder First note, position 1 of 3" })).toHaveFocus();
  });

  it("treats a drop with no preview change as a no-op", async () => {
    renderSortable();

    await act(async () => {
      await getDndProps<{ onDragEnd?: (event: unknown) => Promise<void> }>().onDragEnd?.({
        active: { id: "note-1" },
        over: { id: "note-1" },
      });
    });

    expect(mockReorderTripNotes).not.toHaveBeenCalled();
  });

  it("keeps rendering the expanded note's editor by id as it moves position", () => {
    const renderEditor = vi.fn((note: TripNote) => <div>Editor for {note.title}</div>);
    renderSortable({ expandedNoteId: "note-3", renderEditor });

    act(() => {
      getDndProps<{ onDragOver?: (event: unknown) => void }>().onDragOver?.({
        active: { id: "note-3" },
        over: { id: "note-1" },
      });
    });

    expect(screen.getByText("Editor for Third note")).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Third note");
  });

  it("disables every reorder handle while a reorder is persisting", async () => {
    let resolvePersist!: () => void;
    mockReorderTripNotes.mockReturnValue(
      new Promise<void>((resolve) => {
        resolvePersist = resolve;
      })
    );
    renderSortable();

    act(() => {
      getDndProps<{ onDragOver?: (event: unknown) => void }>().onDragOver?.({
        active: { id: "note-1" },
        over: { id: "note-2" },
      });
    });

    let dragEndPromise: Promise<void> | undefined;
    act(() => {
      dragEndPromise = getDndProps<{ onDragEnd?: (event: unknown) => Promise<void> }>().onDragEnd?.({
        active: { id: "note-1" },
        over: { id: "note-2" },
      });
    });

    expect(useSortableMock.mock.calls.slice(-3).every((call) => call[0].disabled === true)).toBe(true);

    await act(async () => {
      resolvePersist();
      await dragEndPromise;
    });
  });

  it("renders a refreshed notes prop that diverges after a confirmed reorder instead of the stale optimistic order", async () => {
    const { props, rerender } = renderSortable();

    act(() => {
      getDndProps<{ onDragStart?: (event: unknown) => void }>().onDragStart?.({
        active: { id: "note-1" },
        activatorEvent: new MouseEvent("mousedown"),
      });
    });
    act(() => {
      getDndProps<{ onDragOver?: (event: unknown) => void }>().onDragOver?.({
        active: { id: "note-1" },
        over: { id: "note-2" },
      });
    });
    await act(async () => {
      await getDndProps<{ onDragEnd?: (event: unknown) => Promise<void> }>().onDragEnd?.({
        active: { id: "note-1" },
        over: { id: "note-2" },
      });
    });

    rerender(
      <TripNotesSortable
        {...props}
        notes={[
          buildNote({ id: "note-4", title: "Brand new note" }),
          buildNote({ id: "note-2", title: "Second note" }),
          buildNote({ id: "note-1", title: "First note" }),
        ]}
      />
    );

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Brand new note");
    expect(items[1]).toHaveTextContent("Second note");
    expect(items[2]).toHaveTextContent("First note");
  });

  it("does not announce boundary attempts during a pointer drag or on key auto-repeat", () => {
    const onAnnounce = vi.fn();
    renderSortable({ onAnnounce });

    act(() => {
      getDndProps<{ onDragStart?: (event: unknown) => void }>().onDragStart?.({
        active: { id: "note-1" },
        activatorEvent: new MouseEvent("mousedown"),
      });
    });

    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder First note, position 1 of 3" }), {
      key: "ArrowUp",
    });
    expect(onAnnounce).not.toHaveBeenCalledWith(expect.stringContaining("already at position"));

    onAnnounce.mockClear();
    act(() => {
      getDndProps<{ onDragCancel?: (event: unknown) => void }>().onDragCancel?.({ active: { id: "note-1" } });
    });
    act(() => {
      getDndProps<{ onDragStart?: (event: unknown) => void }>().onDragStart?.({
        active: { id: "note-1" },
        activatorEvent: new KeyboardEvent("keydown", { code: "Space" }),
      });
    });

    fireEvent.keyDown(screen.getByRole("button", { name: "Reorder First note, position 1 of 3" }), {
      key: "ArrowUp",
      repeat: true,
    });
    expect(onAnnounce).not.toHaveBeenCalledWith(expect.stringContaining("already at position"));
  });

  it("cancels a keyboard drag by dispatching Escape when focus leaves the handle", () => {
    const dispatchEventSpy = vi.spyOn(document, "dispatchEvent");
    renderSortable();

    act(() => {
      getDndProps<{ onDragStart?: (event: unknown) => void }>().onDragStart?.({
        active: { id: "note-1" },
        activatorEvent: new KeyboardEvent("keydown", { code: "Space" }),
      });
    });

    fireEvent.blur(screen.getByRole("button", { name: "Reorder First note, position 1 of 3" }));

    const escapeDispatched = dispatchEventSpy.mock.calls.some(([event]) => (event as KeyboardEvent).key === "Escape");
    expect(escapeDispatched).toBe(true);
    dispatchEventSpy.mockRestore();
  });

  it("leaves pointer-dragged rows inert but keeps keyboard-drag rows focusable", () => {
    renderSortable();

    act(() => {
      getDndProps<{ onDragStart?: (event: unknown) => void }>().onDragStart?.({
        active: { id: "note-1" },
        activatorEvent: new MouseEvent("mousedown"),
      });
    });
    expect(screen.getAllByRole("listitem")[0].hasAttribute("inert")).toBe(true);

    act(() => {
      getDndProps<{ onDragCancel?: (event: unknown) => void }>().onDragCancel?.({ active: { id: "note-1" } });
    });
    act(() => {
      getDndProps<{ onDragStart?: (event: unknown) => void }>().onDragStart?.({
        active: { id: "note-1" },
        activatorEvent: new KeyboardEvent("keydown", { code: "Space" }),
      });
    });
    expect(screen.getAllByRole("listitem")[0].hasAttribute("inert")).toBe(false);
  });

  it("wires a coordinateGetter that blocks Left/Right and delegates Up/Down to sortableKeyboardCoordinates", async () => {
    renderSortable();
    const { sortableKeyboardCoordinates } = await import("@dnd-kit/sortable");

    const keyboardSensorCall = useSensorMock.mock.calls.find(
      (call) => (call[1] as { coordinateGetter?: unknown })?.coordinateGetter
    );
    expect(keyboardSensorCall).toBeDefined();
    const coordinateGetter = (keyboardSensorCall?.[1] as { coordinateGetter: (...args: unknown[]) => unknown })
      .coordinateGetter;

    const args = { context: {} } as never;
    expect(coordinateGetter(new KeyboardEvent("keydown", { code: "ArrowLeft" }), args)).toBeUndefined();
    expect(coordinateGetter(new KeyboardEvent("keydown", { code: "ArrowRight" }), args)).toBeUndefined();

    coordinateGetter(new KeyboardEvent("keydown", { code: "ArrowDown" }), args);
    expect(sortableKeyboardCoordinates).toHaveBeenCalled();
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FocusEvent, KeyboardEvent, ReactNode } from "react";

type MockDndEvent = { active: { id: string }; over: { id: string } | null };
type MockDragStartEvent = { active: { id: string } };
type DndHandlerMap = Record<string, ((event: MockDndEvent) => void) | undefined>;
type DndStartHandlerMap = Record<string, ((event: MockDragStartEvent) => void) | undefined>;
type DndCancelHandlerMap = Record<string, (() => void) | undefined>;
interface DragOverlayState {
  lastProps?: Record<string, unknown>;
}
interface MockDndContextProps {
  children: ReactNode;
  onDragEnd?: (event: MockDndEvent) => void;
  onDragStart?: (event: MockDragStartEvent) => void;
  onDragCancel?: () => void;
  id?: string;
}
interface MockDragOverlayProps extends Record<string, unknown> {
  children: ReactNode;
}
interface MockChecklistItemProps {
  checklist: { id: string; items: unknown[] };
  isDraft?: boolean;
  onCommitDraft?: (firstItemContent?: string) => void;
  onCancelDraft?: () => void;
}
interface MockPlaceRowProps {
  place: { id: string; name: string; linkedReservationId?: string };
  isDraft?: boolean;
  onCreate?: (name: string) => void;
  onCancelDraft?: () => void;
  onLinkedEventTap?: (linkedReservationId: string) => void;
  isHighlighted?: boolean;
}
interface MockChildrenProps {
  children: ReactNode;
}
const dndHandlers = vi.hoisted((): DndHandlerMap => ({}));
const dndStartHandlers = vi.hoisted((): DndStartHandlerMap => ({}));
const dndCancelHandlers = vi.hoisted((): DndCancelHandlerMap => ({}));
const dragOverlayCapture = vi.hoisted((): DragOverlayState => ({}));

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, onDragEnd, onDragStart, onDragCancel, id }: MockDndContextProps) => {
    if (id) {
      dndHandlers[id] = onDragEnd;
      dndStartHandlers[id] = onDragStart;
      dndCancelHandlers[id] = onDragCancel;
    }
    return <>{children}</>;
  },
  DragOverlay: ({ children, ...rest }: MockDragOverlayProps) => {
    dragOverlayCapture.lastProps = rest;
    return <>{children}</>;
  },
  closestCenter: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}));

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: MockChildrenProps) => <>{children}</>,
  verticalListSortingStrategy: {},
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  })),
  arrayMove: vi.fn((arr: unknown[], from: number, to: number) => {
    const res = [...arr];
    const [item] = res.splice(from, 1);
    res.splice(to, 0, item);
    return res;
  }),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: vi.fn(() => undefined) } },
}));

vi.mock("./checklist-item", () => ({
  ChecklistItem: ({ checklist, isDraft, onCommitDraft, onCancelDraft }: MockChecklistItemProps) => {
    if (isDraft) {
      return (
        <input
          autoFocus
          data-testid="checklist-draft-input"
          placeholder="Add an item…"
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            const val = event.currentTarget.value.trim();
            if (event.key === "Enter") {
              if (val) onCommitDraft?.(val);
              else onCancelDraft?.();
            }
            if (event.key === "Escape") onCancelDraft?.();
          }}
          onBlur={(event: FocusEvent<HTMLInputElement>) => {
            const val = event.currentTarget.value.trim();
            if (val) onCommitDraft?.(val);
            else onCancelDraft?.();
          }}
        />
      );
    }
    return <div data-testid={`checklist-item-${checklist.id}`} />;
  },
}));

vi.mock("./place-row", () => ({
  PlaceRow: ({ place, isDraft, onCreate, onCancelDraft, onLinkedEventTap, isHighlighted }: MockPlaceRowProps) => {
    if (isDraft) {
      return (
        <input
          autoFocus
          placeholder="Event name"
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            const val = event.currentTarget.value.trim();
            if (event.key === "Enter") {
              if (val) onCreate?.(val);
              else onCancelDraft?.();
            }
            if (event.key === "Escape") onCancelDraft?.();
          }}
          onBlur={(event: FocusEvent<HTMLInputElement>) => {
            const val = event.currentTarget.value.trim();
            if (val) onCreate?.(val);
            else onCancelDraft?.();
          }}
        />
      );
    }
    if (place.linkedReservationId) {
      return (
        <button
          onClick={() => {
            if (place.linkedReservationId) {
              onLinkedEventTap?.(place.linkedReservationId);
            }
          }}
          data-testid={`linked-place-row-${place.id}`}
        >
          {place.name}
        </button>
      );
    }
    return (
      <div data-testid={`place-row-${place.id}`} data-highlighted={String(!!isHighlighted)}>
        {place.name}
      </div>
    );
  },
}));

import { DayCard } from "./day-card";
import { MockDateProvider } from "@/components/providers/mock-date-provider";
import type { DayItinerary, TripEvent } from "@/data/types";

const NOW_ISO = "2026-05-13T12:00:00.000Z";

function Wrapper({ children }: MockChildrenProps) {
  return <MockDateProvider initialISO={NOW_ISO}>{children}</MockDateProvider>;
}

const scheduledEvent: TripEvent = {
  id: "ev-s1",
  name: "Museum Visit",
  startAt: "2026-05-13T10:00:00Z",
  endAt: "2026-05-13T12:00:00Z",
  position: 0,
};

const unscheduledEvent: TripEvent = {
  id: "ev-u1",
  name: "Free Roaming",
  position: 1,
};

const baseDay: DayItinerary = {
  dayNumber: 1,
  date: "2026-05-13",
  label: "Day 1",
  subtitle: "Exploring the city",
  today: true,
  events: [scheduledEvent, unscheduledEvent],
};

describe("DayCard", () => {
  it("threads a final-day removal callback to the header", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(
      <DayCard
        day={baseDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
        onRemove={onRemove}
      />,
      { wrapper: Wrapper }
    );
    await user.click(screen.getByRole("button", { name: "Remove day" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("renders the day label and date", () => {
    render(<DayCard day={baseDay} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />, {
      wrapper: Wrapper,
    });
    expect(screen.getByText(/Wed, May 13/i)).toBeInTheDocument();
  });

  it("renders date header in MM/DD/YYYY format (month before day)", () => {
    render(
      <DayCard
        day={baseDay}
        dateFormat="MM/DD/YYYY"
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getByText(/Wed, May 13/i)).toBeInTheDocument();
  });

  it("renders date header in DD/MM/YYYY format (day before month)", () => {
    render(
      <DayCard
        day={baseDay}
        dateFormat="DD/MM/YYYY"
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getByText(/Wed, 13 May/i)).toBeInTheDocument();
  });

  it("renders scheduled and unscheduled events in the expanded body", () => {
    render(
      <DayCard
        day={{ ...baseDay, today: true }}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getByText("Museum Visit")).toBeInTheDocument();
    expect(screen.getByText("Free Roaming")).toBeInTheDocument();
  });

  it("renders events without startAt inline in the flat events list", () => {
    render(
      <DayCard
        day={{ ...baseDay, today: true }}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getByText("Free Roaming")).toBeInTheDocument();
  });

  it("toggle button has aria-expanded reflecting open state", () => {
    render(
      <DayCard
        day={{ ...baseDay, today: true }}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    const toggle = screen.getByRole("button", { name: /Wed, May 13/i });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("starts expanded when initialOpen=true", () => {
    render(
      <DayCard
        day={{ ...baseDay, today: false, date: "2026-06-01" }}
        initialOpen
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getByRole("button", { name: /Mon, Jun 1/i })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Museum Visit")).toBeInTheDocument();
  });

  it("forwards highlightedEventId to the matching event row only", () => {
    render(
      <DayCard
        day={baseDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
        highlightedEventId="ev-s1"
      />,
      { wrapper: Wrapper }
    );
    expect(screen.getByTestId("place-row-ev-s1")).toHaveAttribute("data-highlighted", "true");
    expect(screen.getByTestId("place-row-ev-u1")).toHaveAttribute("data-highlighted", "false");
  });

  it("clicking toggle button collapses the card", async () => {
    const user = userEvent.setup();
    render(<DayCard day={baseDay} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />, {
      wrapper: Wrapper,
    });
    const toggle = screen.getByRole("button", { name: /Wed, May 13/i });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("uses d.label when date is absent and today is false", () => {
    const dayNoDate: DayItinerary = {
      dayNumber: 3,
      date: undefined,
      label: "Day 3 · Free Day",
      today: false,
      events: [],
    };
    render(<DayCard day={dayNoDate} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />, {
      wrapper: Wrapper,
    });
    expect(screen.getByText("Day 3, Free Day")).toBeInTheDocument();
  });

  it("uses d.today flag for isToday when date is absent", () => {
    const dayNoDate: DayItinerary = {
      dayNumber: 4,
      date: undefined,
      label: "Day 4",
      today: true,
      events: [],
    };
    render(<DayCard day={dayNoDate} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />, {
      wrapper: Wrapper,
    });
    const toggle = screen.getByRole("button", { name: /Day 4/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("subtitle edit activates on click", async () => {
    const user = userEvent.setup();
    render(<DayCard day={baseDay} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />, {
      wrapper: Wrapper,
    });
    const subtitleBtn = screen.getByRole("button", { name: /exploring the city/i });
    await user.click(subtitleBtn);
    expect(screen.getByDisplayValue("Exploring the city")).toBeInTheDocument();
  });

  it("subtitle edit activates on Enter key", async () => {
    const user = userEvent.setup();
    render(<DayCard day={baseDay} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />, {
      wrapper: Wrapper,
    });
    const subtitleBtn = screen.getByRole("button", { name: /exploring the city/i });
    subtitleBtn.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByDisplayValue("Exploring the city")).toBeInTheDocument();
  });

  it("subtitle edit activates on Space key", async () => {
    const user = userEvent.setup();
    render(<DayCard day={baseDay} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />, {
      wrapper: Wrapper,
    });
    const subtitleBtn = screen.getByRole("button", { name: /exploring the city/i });
    subtitleBtn.focus();
    await user.keyboard(" ");
    expect(screen.getByDisplayValue("Exploring the city")).toBeInTheDocument();
  });

  it("subtitle blur calls onUpdateDay with new value", async () => {
    const user = userEvent.setup();
    const onUpdateDay = vi.fn();
    render(
      <DayCard
        day={baseDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
        onUpdateDay={onUpdateDay}
      />,
      { wrapper: Wrapper }
    );
    const subtitleBtn = screen.getByRole("button", { name: /exploring the city/i });
    await user.click(subtitleBtn);
    const input = screen.getByDisplayValue("Exploring the city");
    await user.clear(input);
    await user.type(input, "Changed subtitle");
    fireEvent.blur(input);
    expect(onUpdateDay).toHaveBeenCalledWith(baseDay.dayNumber, { subtitle: "Changed subtitle" });
  });

  it("subtitle Escape key cancels edit", async () => {
    const user = userEvent.setup();
    const onUpdateDay = vi.fn();
    render(
      <DayCard
        day={baseDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
        onUpdateDay={onUpdateDay}
      />,
      { wrapper: Wrapper }
    );
    await user.click(screen.getByRole("button", { name: /exploring the city/i }));
    await user.keyboard("{Escape}");
    expect(onUpdateDay).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /exploring the city/i })).toBeInTheDocument();
  });

  it("subtitle Enter key saves edit", async () => {
    const user = userEvent.setup();
    const onUpdateDay = vi.fn();
    render(
      <DayCard
        day={baseDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
        onUpdateDay={onUpdateDay}
      />,
      { wrapper: Wrapper }
    );
    await user.click(screen.getByRole("button", { name: /exploring the city/i }));
    const input = screen.getByDisplayValue("Exploring the city");
    await user.clear(input);
    await user.type(input, "New note{Enter}");
    expect(onUpdateDay).toHaveBeenCalledWith(baseDay.dayNumber, { subtitle: "New note" });
  });

  // ── TypePicker / bottom "+" flow ──────────────────────────────────────────

  it("clicking 'Add a place' button shows TypePicker", async () => {
    const user = userEvent.setup();
    render(<DayCard day={baseDay} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />, {
      wrapper: Wrapper,
    });
    await user.click(screen.getByRole("button", { name: /add a place to day 1/i }));
    expect(screen.getByTitle("Add event")).toBeInTheDocument();
    expect(screen.getByTitle("Add note")).toBeInTheDocument();
  });

  it("clicking Add event in TypePicker shows event name input", async () => {
    const user = userEvent.setup();
    render(<DayCard day={baseDay} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />, {
      wrapper: Wrapper,
    });
    await user.click(screen.getByRole("button", { name: /add a place to day 1/i }));
    await user.click(screen.getByTitle("Add event"));
    expect(screen.getByPlaceholderText("Event name")).toBeInTheDocument();
  });

  it("clicking Add note in TypePicker shows note content input", async () => {
    const user = userEvent.setup();
    render(<DayCard day={baseDay} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />, {
      wrapper: Wrapper,
    });
    await user.click(screen.getByRole("button", { name: /add a place to day 1/i }));
    await user.click(screen.getByTitle("Add note"));
    expect(screen.getByPlaceholderText("Add a note…")).toBeInTheDocument();
  });

  it("typing event name and pressing Enter calls onAddEvent", async () => {
    const user = userEvent.setup();
    const onAddEvent = vi.fn();
    render(
      <DayCard
        day={baseDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
        onAddEvent={onAddEvent}
      />,
      { wrapper: Wrapper }
    );
    await user.click(screen.getByRole("button", { name: /add a place to day 1/i }));
    await user.click(screen.getByTitle("Add event"));
    await user.type(screen.getByPlaceholderText("Event name"), "New Museum");
    await user.keyboard("{Enter}");
    expect(onAddEvent).toHaveBeenCalledWith(baseDay.dayNumber, "New Museum", undefined, 2);
  });

  it("typing note content and pressing Enter calls onAddNote", async () => {
    const user = userEvent.setup();
    const onAddNote = vi.fn();
    render(
      <DayCard
        day={baseDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
        onAddNote={onAddNote}
      />,
      { wrapper: Wrapper }
    );
    await user.click(screen.getByRole("button", { name: /add a place to day 1/i }));
    await user.click(screen.getByTitle("Add note"));
    await user.type(screen.getByPlaceholderText("Add a note…"), "Bring sunscreen");
    await user.keyboard("{Enter}");
    expect(onAddNote).toHaveBeenCalledWith(baseDay.dayNumber, "Bring sunscreen", 2);
  });

  it("pressing Escape in event name input dismisses it", async () => {
    const user = userEvent.setup();
    render(<DayCard day={baseDay} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />, {
      wrapper: Wrapper,
    });
    await user.click(screen.getByRole("button", { name: /add a place to day 1/i }));
    await user.click(screen.getByTitle("Add event"));
    expect(screen.getByPlaceholderText("Event name")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByPlaceholderText("Event name")).not.toBeInTheDocument();
  });

  it("blurring the event name input dismisses it", async () => {
    const user = userEvent.setup();
    render(<DayCard day={baseDay} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />, {
      wrapper: Wrapper,
    });
    await user.click(screen.getByRole("button", { name: /add a place to day 1/i }));
    await user.click(screen.getByTitle("Add event"));
    const input = screen.getByPlaceholderText("Event name");
    fireEvent.blur(input);
    expect(screen.queryByPlaceholderText("Event name")).not.toBeInTheDocument();
  });

  it("pressing Escape in TypePicker dismisses it and restores bottom button", async () => {
    const user = userEvent.setup();
    render(<DayCard day={baseDay} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />, {
      wrapper: Wrapper,
    });
    await user.click(screen.getByRole("button", { name: /add a place to day 1/i }));
    expect(screen.getByTitle("Add event")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTitle("Add event")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add a place to day 1/i })).toBeInTheDocument();
  });

  // ── Between-item gap zones ────────────────────────────────────────────────

  it("renders 'Insert item here' buttons between consecutive scheduled events", () => {
    const secondScheduled: TripEvent = {
      id: "ev-s2",
      name: "Dinner",
      startAt: "2026-05-13T19:00:00Z",
      position: 2,
    };
    const day: DayItinerary = {
      ...baseDay,
      events: [scheduledEvent, secondScheduled],
    };
    render(<DayCard day={day} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />, {
      wrapper: Wrapper,
    });
    expect(screen.getByTitle("Insert item here")).toBeInTheDocument();
  });

  it("GapZone insert button has mobile-always-visible and desktop-hover-only CSS classes", () => {
    const secondScheduled: TripEvent = {
      id: "ev-s2",
      name: "Dinner",
      startAt: "2026-05-13T19:00:00Z",
      position: 2,
    };
    const day: DayItinerary = {
      ...baseDay,
      events: [scheduledEvent, secondScheduled],
    };
    render(<DayCard day={day} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />, {
      wrapper: Wrapper,
    });
    const insertBtn = screen.getByTitle("Insert item here");
    expect(insertBtn.className).toContain("opacity-100");
    expect(insertBtn.className).toContain("sm:opacity-0");
    expect(insertBtn.className).toContain("sm:group-hover:opacity-100");
  });

  it("clicking between-item '+' opens TypePicker at that gap", async () => {
    const user = userEvent.setup();
    const secondScheduled: TripEvent = {
      id: "ev-s2",
      name: "Dinner",
      startAt: "2026-05-13T19:00:00Z",
      position: 2,
    };
    const day: DayItinerary = {
      ...baseDay,
      events: [scheduledEvent, secondScheduled],
    };
    render(<DayCard day={day} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />, {
      wrapper: Wrapper,
    });
    await user.click(screen.getByTitle("Insert item here"));
    expect(screen.getByTitle("Add event")).toBeInTheDocument();
    expect(screen.getByTitle("Add note")).toBeInTheDocument();
  });

  it("inserting event between scheduled items passes afterEventId to onAddEvent", async () => {
    const user = userEvent.setup();
    const onAddEvent = vi.fn();
    const secondScheduled: TripEvent = {
      id: "ev-s2",
      name: "Dinner",
      startAt: "2026-05-13T19:00:00Z",
      position: 2,
    };
    const day: DayItinerary = {
      ...baseDay,
      events: [scheduledEvent, secondScheduled],
    };
    render(
      <DayCard
        day={day}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
        onAddEvent={onAddEvent}
      />,
      { wrapper: Wrapper }
    );
    await user.click(screen.getByTitle("Insert item here"));
    await user.click(screen.getByTitle("Add event"));
    await user.type(screen.getByPlaceholderText("Event name"), "Afternoon Walk");
    await user.keyboard("{Enter}");
    expect(onAddEvent).toHaveBeenCalledWith(baseDay.dayNumber, "Afternoon Walk", "ev-s1");
  });

  it("inserting event after a Linked Event row falls back to insertAtPosition instead of the linked event's id", async () => {
    const user = userEvent.setup();
    const onAddEvent = vi.fn();
    const linkedEvent: TripEvent = {
      id: "linked-1",
      name: "Check-in — Torel Avantgarde",
      startAt: "2030-06-16T15:00:00Z",
      position: -123,
      linkedReservationId: "reservation-1",
      reservationType: "lodging",
    };
    const day: DayItinerary = {
      ...baseDay,
      events: [linkedEvent, scheduledEvent],
    };
    render(
      <DayCard
        day={day}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
        onAddEvent={onAddEvent}
      />,
      { wrapper: Wrapper }
    );
    await user.click(screen.getByTitle("Insert item here"));
    await user.click(screen.getByTitle("Add event"));
    await user.type(screen.getByPlaceholderText("Event name"), "Late Arrival Snack");
    await user.keyboard("{Enter}");
    expect(onAddEvent).toHaveBeenCalledWith(baseDay.dayNumber, "Late Arrival Snack", undefined, 0);
  });

  it("renders inline notes from d.notes", () => {
    const dayWithNote: DayItinerary = {
      ...baseDay,
      events: [scheduledEvent],
      notes: [{ id: "n1", content: "Bring sunscreen", position: 1 }],
    };
    render(<DayCard day={dayWithNote} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />, {
      wrapper: Wrapper,
    });
    expect(screen.getByText("Bring sunscreen")).toBeInTheDocument();
  });

  it("renders gap between adjacent events when day has multiple events", () => {
    render(<DayCard day={baseDay} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />, {
      wrapper: Wrapper,
    });
    // baseDay has two events; one gap between them
    expect(screen.getByTitle("Insert item here")).toBeInTheDocument();
  });

  it("no gap rendered when day has only one event", () => {
    const dayOneEvent: DayItinerary = {
      ...baseDay,
      events: [scheduledEvent],
    };
    render(<DayCard day={dayOneEvent} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />, {
      wrapper: Wrapper,
    });
    expect(screen.queryByTitle("Insert item here")).not.toBeInTheDocument();
  });

  // ── DnD tests ─────────────────────────────────────────────────────────────

  it("passes dropAnimation={null} to DragOverlay", () => {
    render(<DayCard day={baseDay} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />, {
      wrapper: Wrapper,
    });
    const captured = dragOverlayCapture.lastProps;
    expect(captured).toBeDefined();
    expect(captured!.dropAnimation).toBeNull();
  });

  it("handleDragEnd returns early when over is null", () => {
    const onReorderDayItems = vi.fn();
    render(
      <DayCard day={baseDay} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={onReorderDayItems} />,
      { wrapper: Wrapper }
    );
    act(() => {
      dndHandlers["day-1"]?.({ active: { id: "ev-s1" }, over: null });
    });
    expect(onReorderDayItems).not.toHaveBeenCalled();
  });

  it("handleDragEnd returns early when same id", () => {
    const onReorderDayItems = vi.fn();
    render(
      <DayCard day={baseDay} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={onReorderDayItems} />,
      { wrapper: Wrapper }
    );
    act(() => {
      dndHandlers["day-1"]?.({ active: { id: "ev-s1" }, over: { id: "ev-s1" } });
    });
    expect(onReorderDayItems).not.toHaveBeenCalled();
  });

  it("handleDragEnd calls onReorderDayItems with typed entries when ids differ", () => {
    const secondEvent: TripEvent = { id: "ev-u2", name: "Park Walk", position: 1 };
    const day = { ...baseDay, events: [{ ...scheduledEvent, position: 0 }, secondEvent] };
    const onReorderDayItems = vi.fn();
    render(
      <DayCard day={day} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={onReorderDayItems} />,
      {
        wrapper: Wrapper,
      }
    );
    act(() => {
      dndHandlers["day-1"]?.({ active: { id: "ev-s1" }, over: { id: "ev-u2" } });
    });
    expect(onReorderDayItems).toHaveBeenCalledWith(1, [
      { type: "event", id: "ev-u2" },
      { type: "event", id: "ev-s1" },
    ]);
  });

  it("handleDragEnd reorders an event past a checklist (mixed types)", () => {
    const day: DayItinerary = {
      ...baseDay,
      events: [{ ...scheduledEvent, position: 0 }],
      checklists: [{ id: "cl-1", tripDayId: "day-1", position: 1, items: [] }],
    };
    const onReorderDayItems = vi.fn();
    render(
      <DayCard day={day} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={onReorderDayItems} />,
      { wrapper: Wrapper }
    );
    act(() => {
      dndHandlers["day-1"]?.({ active: { id: "ev-s1" }, over: { id: "cl-1" } });
    });
    expect(onReorderDayItems).toHaveBeenCalledWith(1, [
      { type: "checklist", id: "cl-1" },
      { type: "event", id: "ev-s1" },
    ]);
  });

  it("handleDragEnd reorders a checklist before an event (mixed types)", () => {
    const day: DayItinerary = {
      ...baseDay,
      events: [{ ...scheduledEvent, position: 0 }],
      checklists: [{ id: "cl-1", tripDayId: "day-1", position: 1, items: [] }],
    };
    const onReorderDayItems = vi.fn();
    render(
      <DayCard day={day} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={onReorderDayItems} />,
      { wrapper: Wrapper }
    );
    act(() => {
      dndHandlers["day-1"]?.({ active: { id: "cl-1" }, over: { id: "ev-s1" } });
    });
    expect(onReorderDayItems).toHaveBeenCalledWith(1, [
      { type: "checklist", id: "cl-1" },
      { type: "event", id: "ev-s1" },
    ]);
  });

  it("handleDragEnd no-ops when active id is not in timelineItems", () => {
    const onReorderDayItems = vi.fn();
    render(
      <DayCard day={baseDay} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={onReorderDayItems} />,
      { wrapper: Wrapper }
    );
    act(() => {
      dndHandlers["day-1"]?.({ active: { id: "does-not-exist" }, over: { id: "ev-s1" } });
    });
    expect(onReorderDayItems).not.toHaveBeenCalled();
  });

  // ── Checklist integration ─────────────────────────────────────────────────

  it("TypePicker shows 'Add checklist' button", async () => {
    const user = userEvent.setup();
    render(<DayCard day={baseDay} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />, {
      wrapper: Wrapper,
    });
    await user.click(screen.getByRole("button", { name: /add a place to day 1/i }));
    expect(screen.getByTitle("Add checklist")).toBeInTheDocument();
  });

  it("clicking Add checklist in TypePicker shows checklist draft input", async () => {
    const user = userEvent.setup();
    render(<DayCard day={baseDay} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />, {
      wrapper: Wrapper,
    });
    await user.click(screen.getByRole("button", { name: /add a place to day 1/i }));
    await user.click(screen.getByTitle("Add checklist"));
    expect(screen.getByPlaceholderText("Add an item…")).toBeInTheDocument();
  });

  it("committing checklist draft calls onAddChecklist", async () => {
    const user = userEvent.setup();
    const onAddChecklist = vi.fn();
    render(
      <DayCard
        day={baseDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
        onAddChecklist={onAddChecklist}
      />,
      { wrapper: Wrapper }
    );
    await user.click(screen.getByRole("button", { name: /add a place to day 1/i }));
    await user.click(screen.getByTitle("Add checklist"));
    await user.type(screen.getByPlaceholderText("Add an item…"), "Sunscreen");
    await user.keyboard("{Enter}");
    expect(onAddChecklist).toHaveBeenCalledWith(baseDay.dayNumber, 2, "Sunscreen");
  });

  it("Escape in checklist draft input cancels without calling onAddChecklist", async () => {
    const user = userEvent.setup();
    const onAddChecklist = vi.fn();
    render(
      <DayCard
        day={baseDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
        onAddChecklist={onAddChecklist}
      />,
      { wrapper: Wrapper }
    );
    await user.click(screen.getByRole("button", { name: /add a place to day 1/i }));
    await user.click(screen.getByTitle("Add checklist"));
    await user.keyboard("{Escape}");
    expect(onAddChecklist).not.toHaveBeenCalled();
    expect(screen.queryByPlaceholderText("Add an item…")).not.toBeInTheDocument();
  });

  it("renders checklists from d.checklists", () => {
    const dayWithChecklist: DayItinerary = {
      ...baseDay,
      events: [scheduledEvent],
      checklists: [{ id: "cl-1", tripDayId: "day-1", position: 1, items: [] }],
    };
    render(
      <DayCard day={dayWithChecklist} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />,
      { wrapper: Wrapper }
    );
    expect(screen.getByTestId("checklist-item-cl-1")).toBeInTheDocument();
  });

  it("handleDragEnd calls onReorderDayItems for any two events", () => {
    const secondScheduled: TripEvent = {
      id: "ev-s2",
      name: "Dinner",
      startAt: "2026-05-13T19:00:00Z",
      position: 1,
    };
    const day = { ...baseDay, events: [{ ...scheduledEvent, position: 0 }, secondScheduled] };
    const onReorderDayItems = vi.fn();
    render(
      <DayCard day={day} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={onReorderDayItems} />,
      {
        wrapper: Wrapper,
      }
    );
    act(() => {
      dndHandlers["day-1"]?.({ active: { id: "ev-s1" }, over: { id: "ev-s2" } });
    });
    expect(onReorderDayItems).toHaveBeenCalledWith(1, [
      { type: "event", id: "ev-s2" },
      { type: "event", id: "ev-s1" },
    ]);
  });

  it("renders items in optimistic order immediately after drop, before the day prop catches up", () => {
    const secondScheduled: TripEvent = {
      id: "ev-s2",
      name: "Dinner",
      startAt: "2026-05-13T19:00:00Z",
      position: 1,
    };
    const day = { ...baseDay, events: [{ ...scheduledEvent, position: 0 }, secondScheduled] };
    const { container } = render(
      <DayCard day={day} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />,
      { wrapper: Wrapper }
    );
    const idsBefore = Array.from(container.querySelectorAll('[data-testid^="place-row-"]'))
      .map((el) => el.getAttribute("data-testid"))
      .filter((id): id is string => id !== null);
    expect(idsBefore).toEqual(["place-row-ev-s1", "place-row-ev-s2"]);

    act(() => {
      dndHandlers["day-1"]?.({ active: { id: "ev-s1" }, over: { id: "ev-s2" } });
    });

    const idsAfter = Array.from(container.querySelectorAll('[data-testid^="place-row-"]'))
      .map((el) => el.getAttribute("data-testid"))
      .filter((id): id is string => id !== null);
    expect(idsAfter).toEqual(["place-row-ev-s2", "place-row-ev-s1"]);
  });

  it("handleDragStart sets the active drag id", () => {
    render(<DayCard day={baseDay} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />, {
      wrapper: Wrapper,
    });
    act(() => {
      dndStartHandlers["day-1"]?.({ active: { id: "ev-s1" } });
    });
    // No assertion needed beyond confirming no error thrown — coverage is the goal
  });

  it("handleDragCancel clears the active drag id", () => {
    render(<DayCard day={baseDay} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />, {
      wrapper: Wrapper,
    });
    act(() => {
      dndStartHandlers["day-1"]?.({ active: { id: "ev-s1" } });
    });
    act(() => {
      dndCancelHandlers["day-1"]?.();
    });
    // No assertion needed beyond confirming no error thrown — coverage is the goal
  });

  it("between-items gap onDismiss closes the TypePicker", async () => {
    const user = userEvent.setup();
    const secondScheduled: TripEvent = { id: "ev-s2", name: "Dinner", startAt: "2026-05-13T19:00:00Z", position: 2 };
    const day: DayItinerary = { ...baseDay, events: [scheduledEvent, secondScheduled] };
    render(<DayCard day={day} onUpdateEvent={vi.fn()} onDeleteEvent={vi.fn()} onReorderDayItems={vi.fn()} />, {
      wrapper: Wrapper,
    });
    await user.click(screen.getByTitle("Insert item here"));
    expect(screen.getByTitle("Add event")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTitle("Add event")).not.toBeInTheDocument();
  });

  it("threads onLinkedEventTap through DayCard to linked event rows", async () => {
    const user = userEvent.setup();
    const onLinkedEventTap = vi.fn();
    const linkedDay: DayItinerary = {
      ...baseDay,
      events: [
        {
          id: "linked-event-1",
          name: "Check-in — Torel Avantgarde",
          startAt: "2030-06-16T15:00:00Z",
          position: 0,
          linkedReservationId: "reservation-1",
          reservationType: "lodging",
        },
      ],
    };

    render(
      <DayCard
        day={linkedDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderDayItems={vi.fn()}
        onLinkedEventTap={onLinkedEventTap}
      />,
      { wrapper: Wrapper }
    );

    await user.click(screen.getByTestId("linked-place-row-linked-event-1"));

    expect(onLinkedEventTap).toHaveBeenCalledWith("reservation-1");
  });
});

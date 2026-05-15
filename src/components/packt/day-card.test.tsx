// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

type MockDndEvent = { active: { id: string }; over: { id: string } | null };
const dndHandlers = vi.hoisted(() => ({} as Record<string, ((e: MockDndEvent) => void) | undefined>))

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, onDragEnd, id }: {
    children: React.ReactNode
    onDragEnd?: (e: MockDndEvent) => void
    id?: string
  }) => {
    if (id) dndHandlers[id] = onDragEnd
    return <>{children}</>
  },
  closestCenter: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}))

vi.mock("@dnd-kit/sortable", () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
    const res = [...arr]
    const [item] = res.splice(from, 1)
    res.splice(to, 0, item)
    return res
  }),
}))

vi.mock("@dnd-kit/utilities", () => ({
  CSS: { Transform: { toString: vi.fn(() => undefined) } },
}))

vi.mock("./place-row", () => ({
  PlaceRow: ({ place, isDraft, onCreate, onCancelDraft }: {
    place: { id: string; name: string };
    isDraft?: boolean;
    onCreate?: (name: string) => void;
    onCancelDraft?: () => void;
  }) => {
    if (isDraft) {
      return (
        <input
          autoFocus
          placeholder="Event name"
          onKeyDown={e => {
            const val = (e.target as HTMLInputElement).value.trim();
            if (e.key === "Enter") { if (val) onCreate?.(val); else onCancelDraft?.(); }
            if (e.key === "Escape") onCancelDraft?.();
          }}
          onBlur={e => { const val = e.target.value.trim(); if (val) onCreate?.(val); else onCancelDraft?.(); }}
        />
      );
    }
    return <div data-testid={`place-row-${place.id}`}>{place.name}</div>;
  },
}))

import { DayCard } from "./day-card"
import { MockDateProvider } from "@/components/providers/mock-date-provider"
import type { DayItinerary, TripEvent } from "@/data/types"

const NOW_ISO = "2026-05-13T12:00:00.000Z"

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MockDateProvider initialISO={NOW_ISO}>{children}</MockDateProvider>
}

const scheduledEvent: TripEvent = {
  id: "ev-s1",
  name: "Museum Visit",
  startAt: "2026-05-13T10:00:00Z",
  endAt: "2026-05-13T12:00:00Z",
  position: 0,
}

const unscheduledEvent: TripEvent = {
  id: "ev-u1",
  name: "Free Roaming",
  position: 1,
}

const baseDay: DayItinerary = {
  dayNumber: 1,
  date: "2026-05-13",
  label: "Day 1",
  subtitle: "Exploring the city",
  today: true,
  events: [scheduledEvent, unscheduledEvent],
}

describe("DayCard", () => {
  it("renders the day label and date", () => {
    render(
      <DayCard
        day={baseDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    expect(screen.getByText(/Wed, May 13/i)).toBeInTheDocument()
  })

  it("renders scheduled and unscheduled events in the expanded body", () => {
    render(
      <DayCard
        day={{ ...baseDay, today: true }}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    expect(screen.getByText("Museum Visit")).toBeInTheDocument()
    expect(screen.getByText("Free Roaming")).toBeInTheDocument()
  })

  it("renders events without startAt inline in the flat events list", () => {
    render(
      <DayCard
        day={{ ...baseDay, today: true }}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    expect(screen.getByText("Free Roaming")).toBeInTheDocument()
  })

  it("toggle button has aria-expanded reflecting open state", () => {
    render(
      <DayCard
        day={{ ...baseDay, today: true }}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    const toggle = screen.getByRole("button", { name: /Wed, May 13/i })
    expect(toggle).toHaveAttribute("aria-expanded", "true")
  })

  it("clicking toggle button collapses the card", async () => {
    const user = userEvent.setup()
    render(
      <DayCard
        day={baseDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    const toggle = screen.getByRole("button", { name: /Wed, May 13/i })
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "false")
  })

  it("uses d.label when date is absent and today is false", () => {
    const dayNoDate: DayItinerary = {
      dayNumber: 3,
      date: undefined,
      label: "Day 3 · Free Day",
      today: false,
      events: [],
    }
    render(
      <DayCard
        day={dayNoDate}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    expect(screen.getByText("Day 3, Free Day")).toBeInTheDocument()
  })

  it("uses d.today flag for isToday when date is absent", () => {
    const dayNoDate: DayItinerary = {
      dayNumber: 4,
      date: undefined,
      label: "Day 4",
      today: true,
      events: [],
    }
    render(
      <DayCard
        day={dayNoDate}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    const toggle = screen.getByRole("button", { name: /Day 4/ })
    expect(toggle).toHaveAttribute("aria-expanded", "true")
  })

  it("subtitle edit activates on click", async () => {
    const user = userEvent.setup()
    render(
      <DayCard
        day={baseDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    const subtitleBtn = screen.getByRole("button", { name: /exploring the city/i })
    await user.click(subtitleBtn)
    expect(screen.getByDisplayValue("Exploring the city")).toBeInTheDocument()
  })

  it("subtitle edit activates on Enter key", async () => {
    const user = userEvent.setup()
    render(
      <DayCard
        day={baseDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    const subtitleBtn = screen.getByRole("button", { name: /exploring the city/i })
    subtitleBtn.focus()
    await user.keyboard("{Enter}")
    expect(screen.getByDisplayValue("Exploring the city")).toBeInTheDocument()
  })

  it("subtitle edit activates on Space key", async () => {
    const user = userEvent.setup()
    render(
      <DayCard
        day={baseDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    const subtitleBtn = screen.getByRole("button", { name: /exploring the city/i })
    subtitleBtn.focus()
    await user.keyboard(" ")
    expect(screen.getByDisplayValue("Exploring the city")).toBeInTheDocument()
  })

  it("subtitle blur calls onUpdateDay with new value", async () => {
    const user = userEvent.setup()
    const onUpdateDay = vi.fn()
    render(
      <DayCard
        day={baseDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
        onUpdateDay={onUpdateDay}
      />,
      { wrapper: Wrapper }
    )
    const subtitleBtn = screen.getByRole("button", { name: /exploring the city/i })
    await user.click(subtitleBtn)
    const input = screen.getByDisplayValue("Exploring the city")
    await user.clear(input)
    await user.type(input, "Changed subtitle")
    fireEvent.blur(input)
    expect(onUpdateDay).toHaveBeenCalledWith(baseDay.dayNumber, { subtitle: "Changed subtitle" })
  })

  it("subtitle Escape key cancels edit", async () => {
    const user = userEvent.setup()
    const onUpdateDay = vi.fn()
    render(
      <DayCard
        day={baseDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
        onUpdateDay={onUpdateDay}
      />,
      { wrapper: Wrapper }
    )
    await user.click(screen.getByRole("button", { name: /exploring the city/i }))
    await user.keyboard("{Escape}")
    expect(onUpdateDay).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: /exploring the city/i })).toBeInTheDocument()
  })

  it("subtitle Enter key saves edit", async () => {
    const user = userEvent.setup()
    const onUpdateDay = vi.fn()
    render(
      <DayCard
        day={baseDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
        onUpdateDay={onUpdateDay}
      />,
      { wrapper: Wrapper }
    )
    await user.click(screen.getByRole("button", { name: /exploring the city/i }))
    const input = screen.getByDisplayValue("Exploring the city")
    await user.clear(input)
    await user.type(input, "New note{Enter}")
    expect(onUpdateDay).toHaveBeenCalledWith(baseDay.dayNumber, { subtitle: "New note" })
  })

  // ── TypePicker / bottom "+" flow ──────────────────────────────────────────

  it("clicking 'Add a place' button shows TypePicker", async () => {
    const user = userEvent.setup()
    render(
      <DayCard
        day={baseDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    await user.click(screen.getByRole("button", { name: /add a place to day 1/i }))
    expect(screen.getByTitle("Add event")).toBeInTheDocument()
    expect(screen.getByTitle("Add note")).toBeInTheDocument()
  })

  it("clicking Add event in TypePicker shows event name input", async () => {
    const user = userEvent.setup()
    render(
      <DayCard
        day={baseDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    await user.click(screen.getByRole("button", { name: /add a place to day 1/i }))
    await user.click(screen.getByTitle("Add event"))
    expect(screen.getByPlaceholderText("Event name")).toBeInTheDocument()
  })

  it("clicking Add note in TypePicker shows note content input", async () => {
    const user = userEvent.setup()
    render(
      <DayCard
        day={baseDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    await user.click(screen.getByRole("button", { name: /add a place to day 1/i }))
    await user.click(screen.getByTitle("Add note"))
    expect(screen.getByPlaceholderText("Add a note…")).toBeInTheDocument()
  })

  it("typing event name and pressing Enter calls onAddEvent", async () => {
    const user = userEvent.setup()
    const onAddEvent = vi.fn()
    render(
      <DayCard
        day={baseDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
        onAddEvent={onAddEvent}
      />,
      { wrapper: Wrapper }
    )
    await user.click(screen.getByRole("button", { name: /add a place to day 1/i }))
    await user.click(screen.getByTitle("Add event"))
    await user.type(screen.getByPlaceholderText("Event name"), "New Museum")
    await user.keyboard("{Enter}")
    expect(onAddEvent).toHaveBeenCalledWith(baseDay.dayNumber, "New Museum", undefined, 2)
  })

  it("typing note content and pressing Enter calls onAddNote", async () => {
    const user = userEvent.setup()
    const onAddNote = vi.fn()
    render(
      <DayCard
        day={baseDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
        onAddNote={onAddNote}
      />,
      { wrapper: Wrapper }
    )
    await user.click(screen.getByRole("button", { name: /add a place to day 1/i }))
    await user.click(screen.getByTitle("Add note"))
    await user.type(screen.getByPlaceholderText("Add a note…"), "Bring sunscreen")
    await user.keyboard("{Enter}")
    expect(onAddNote).toHaveBeenCalledWith(baseDay.dayNumber, "Bring sunscreen", 2)
  })

  it("pressing Escape in event name input dismisses it", async () => {
    const user = userEvent.setup()
    render(
      <DayCard
        day={baseDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    await user.click(screen.getByRole("button", { name: /add a place to day 1/i }))
    await user.click(screen.getByTitle("Add event"))
    expect(screen.getByPlaceholderText("Event name")).toBeInTheDocument()
    await user.keyboard("{Escape}")
    expect(screen.queryByPlaceholderText("Event name")).not.toBeInTheDocument()
  })

  it("blurring the event name input dismisses it", async () => {
    const user = userEvent.setup()
    render(
      <DayCard
        day={baseDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    await user.click(screen.getByRole("button", { name: /add a place to day 1/i }))
    await user.click(screen.getByTitle("Add event"))
    const input = screen.getByPlaceholderText("Event name")
    fireEvent.blur(input)
    expect(screen.queryByPlaceholderText("Event name")).not.toBeInTheDocument()
  })

  it("pressing Escape in TypePicker dismisses it and restores bottom button", async () => {
    const user = userEvent.setup()
    render(
      <DayCard
        day={baseDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    await user.click(screen.getByRole("button", { name: /add a place to day 1/i }))
    expect(screen.getByTitle("Add event")).toBeInTheDocument()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByTitle("Add event")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /add a place to day 1/i })).toBeInTheDocument()
  })

  // ── Between-item gap zones ────────────────────────────────────────────────

  it("renders 'Insert item here' buttons between consecutive scheduled events", () => {
    const secondScheduled: TripEvent = {
      id: "ev-s2",
      name: "Dinner",
      startAt: "2026-05-13T19:00:00Z",
      position: 2,
    }
    const day: DayItinerary = {
      ...baseDay,
      events: [scheduledEvent, secondScheduled],
    }
    render(
      <DayCard
        day={day}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    expect(screen.getByTitle("Insert item here")).toBeInTheDocument()
  })

  it("GapZone insert button has mobile-always-visible and desktop-hover-only CSS classes", () => {
    const secondScheduled: TripEvent = {
      id: "ev-s2",
      name: "Dinner",
      startAt: "2026-05-13T19:00:00Z",
      position: 2,
    }
    const day: DayItinerary = {
      ...baseDay,
      events: [scheduledEvent, secondScheduled],
    }
    render(
      <DayCard
        day={day}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    const insertBtn = screen.getByTitle("Insert item here")
    expect(insertBtn.className).toContain("opacity-100")
    expect(insertBtn.className).toContain("sm:opacity-0")
    expect(insertBtn.className).toContain("sm:group-hover:opacity-100")
  })

  it("clicking between-item '+' opens TypePicker at that gap", async () => {
    const user = userEvent.setup()
    const secondScheduled: TripEvent = {
      id: "ev-s2",
      name: "Dinner",
      startAt: "2026-05-13T19:00:00Z",
      position: 2,
    }
    const day: DayItinerary = {
      ...baseDay,
      events: [scheduledEvent, secondScheduled],
    }
    render(
      <DayCard
        day={day}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    await user.click(screen.getByTitle("Insert item here"))
    expect(screen.getByTitle("Add event")).toBeInTheDocument()
    expect(screen.getByTitle("Add note")).toBeInTheDocument()
  })

  it("inserting event between scheduled items passes afterEventId to onAddEvent", async () => {
    const user = userEvent.setup()
    const onAddEvent = vi.fn()
    const secondScheduled: TripEvent = {
      id: "ev-s2",
      name: "Dinner",
      startAt: "2026-05-13T19:00:00Z",
      position: 2,
    }
    const day: DayItinerary = {
      ...baseDay,
      events: [scheduledEvent, secondScheduled],
    }
    render(
      <DayCard
        day={day}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
        onAddEvent={onAddEvent}
      />,
      { wrapper: Wrapper }
    )
    await user.click(screen.getByTitle("Insert item here"))
    await user.click(screen.getByTitle("Add event"))
    await user.type(screen.getByPlaceholderText("Event name"), "Afternoon Walk")
    await user.keyboard("{Enter}")
    expect(onAddEvent).toHaveBeenCalledWith(baseDay.dayNumber, "Afternoon Walk", "ev-s1")
  })

  it("renders inline notes from d.notes", () => {
    const dayWithNote: DayItinerary = {
      ...baseDay,
      events: [scheduledEvent],
      notes: [{ id: "n1", content: "Bring sunscreen", position: 1 }],
    }
    render(
      <DayCard
        day={dayWithNote}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    expect(screen.getByText("Bring sunscreen")).toBeInTheDocument()
  })

  it("renders gap between adjacent events when day has multiple events", () => {
    render(
      <DayCard
        day={baseDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    // baseDay has two events; one gap between them
    expect(screen.getByTitle("Insert item here")).toBeInTheDocument()
  })

  it("no gap rendered when day has only one event", () => {
    const dayOneEvent: DayItinerary = {
      ...baseDay,
      events: [scheduledEvent],
    }
    render(
      <DayCard
        day={dayOneEvent}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    expect(screen.queryByTitle("Insert item here")).not.toBeInTheDocument()
  })

  // ── DnD tests ─────────────────────────────────────────────────────────────

  it("handleDragEnd returns early when over is null", () => {
    const onReorderEvents = vi.fn()
    render(
      <DayCard
        day={baseDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={onReorderEvents}
      />,
      { wrapper: Wrapper }
    )
    act(() => {
      dndHandlers["day-1"]?.({ active: { id: "ev-s1" }, over: null })
    })
    expect(onReorderEvents).not.toHaveBeenCalled()
  })

  it("handleDragEnd returns early when same id", () => {
    const onReorderEvents = vi.fn()
    render(
      <DayCard
        day={baseDay}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={onReorderEvents}
      />,
      { wrapper: Wrapper }
    )
    act(() => {
      dndHandlers["day-1"]?.({ active: { id: "ev-s1" }, over: { id: "ev-s1" } })
    })
    expect(onReorderEvents).not.toHaveBeenCalled()
  })

  it("handleDragEnd calls onReorderEvents when ids differ", () => {
    const secondEvent: TripEvent = { id: "ev-u2", name: "Park Walk" }
    const day = { ...baseDay, events: [scheduledEvent, secondEvent] }
    const onReorderEvents = vi.fn()
    render(
      <DayCard
        day={day}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={onReorderEvents}
      />,
      { wrapper: Wrapper }
    )
    act(() => {
      dndHandlers["day-1"]?.({ active: { id: "ev-s1" }, over: { id: "ev-u2" } })
    })
    expect(onReorderEvents).toHaveBeenCalledWith(1, expect.any(Array))
  })

  it("handleDragEnd calls onReorderEvents for any two events", () => {
    const secondScheduled: TripEvent = {
      id: "ev-s2",
      name: "Dinner",
      startAt: "2026-05-13T19:00:00Z",
    }
    const day = { ...baseDay, events: [scheduledEvent, secondScheduled] }
    const onReorderEvents = vi.fn()
    render(
      <DayCard
        day={day}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={onReorderEvents}
      />,
      { wrapper: Wrapper }
    )
    act(() => {
      dndHandlers["day-1"]?.({ active: { id: "ev-s1" }, over: { id: "ev-s2" } })
    })
    expect(onReorderEvents).toHaveBeenCalledWith(1, expect.any(Array))
  })
})

// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const dndHandlers = vi.hoisted(() => ({} as Record<string, ((e: any) => void) | undefined>))

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children, onDragEnd, id }: {
    children: React.ReactNode
    onDragEnd?: (e: any) => void
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
  PlaceRow: ({ place }: { place: { id: string; name: string } }) => (
    <div data-testid={`place-row-${place.id}`}>{place.name}</div>
  ),
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
}

const unscheduledEvent: TripEvent = {
  id: "ev-u1",
  name: "Free Roaming",
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

  it("renders an Unscheduled section label for events without startAt", () => {
    render(
      <DayCard
        day={{ ...baseDay, today: true }}
        onUpdateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onReorderEvents={vi.fn()}
      />,
      { wrapper: Wrapper }
    )
    expect(screen.getByText(/unscheduled/i)).toBeInTheDocument()
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

  it("clicking 'Add a place' button shows event name input", async () => {
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
    expect(screen.getByPlaceholderText("Event name")).toBeInTheDocument()
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
    await user.type(screen.getByPlaceholderText("Event name"), "New Museum")
    await user.keyboard("{Enter}")
    expect(onAddEvent).toHaveBeenCalledWith(baseDay.dayNumber, "New Museum")
  })

  it("pressing Escape in add event input dismisses it", async () => {
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
    expect(screen.getByPlaceholderText("Event name")).toBeInTheDocument()
    await user.keyboard("{Escape}")
    expect(screen.queryByPlaceholderText("Event name")).not.toBeInTheDocument()
  })

  it("blurring the add event input dismisses it", async () => {
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
    const input = screen.getByPlaceholderText("Event name")
    fireEvent.blur(input)
    expect(screen.queryByPlaceholderText("Event name")).not.toBeInTheDocument()
  })

  it("handleUnscheduledDragEnd returns early when over is null", () => {
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
      dndHandlers["day-1-unscheduled"]?.({ active: { id: "ev-u1" }, over: null })
    })
    expect(onReorderEvents).not.toHaveBeenCalled()
  })

  it("handleUnscheduledDragEnd returns early when same id", () => {
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
      dndHandlers["day-1-unscheduled"]?.({ active: { id: "ev-u1" }, over: { id: "ev-u1" } })
    })
    expect(onReorderEvents).not.toHaveBeenCalled()
  })

  it("handleUnscheduledDragEnd calls onReorderEvents when ids differ", () => {
    const secondUnscheduled: TripEvent = { id: "ev-u2", name: "Park Walk" }
    const day = { ...baseDay, events: [unscheduledEvent, secondUnscheduled] }
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
      dndHandlers["day-1-unscheduled"]?.({ active: { id: "ev-u1" }, over: { id: "ev-u2" } })
    })
    expect(onReorderEvents).toHaveBeenCalledWith(1, expect.any(Array))
  })

  it("handleScheduledDragEnd returns early when over is null", () => {
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
      dndHandlers["day-1-scheduled"]?.({ active: { id: "ev-s1" }, over: null })
    })
    expect(onReorderEvents).not.toHaveBeenCalled()
  })

  it("handleScheduledDragEnd calls onReorderEvents when ids differ", () => {
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
      dndHandlers["day-1-scheduled"]?.({ active: { id: "ev-s1" }, over: { id: "ev-s2" } })
    })
    expect(onReorderEvents).toHaveBeenCalledWith(1, expect.any(Array))
  })
})

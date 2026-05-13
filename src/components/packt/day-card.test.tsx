// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
    // Date is formatted from the date field
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
})

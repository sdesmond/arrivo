// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("next/link", () => ({
  default: ({ children, href, title, className }: {
    children: React.ReactNode; href: string; title?: string; className?: string
  }) => <a href={href} title={title} className={className}>{children}</a>,
}))

vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lucide-react")>()
  return {
    ...actual,
    MapPin: ({ strokeWidth, ...props }: React.SVGProps<SVGSVGElement> & { strokeWidth?: number }) => (
      <svg data-testid="map-pin-icon" data-stroke-width={strokeWidth} {...props} />
    ),
  }
})

import { EventChip } from "./event-chip"
import type { TripEvent } from "@/data/types"

const TRIP_ID = "trip-1"

const baseEvent: TripEvent = {
  id: "ev-1",
  name: "Lunch at Cafe",
  startAt: "2026-05-13T10:00:00Z",
  endAt: "2026-05-13T13:00:00Z",
}

describe("EventChip", () => {
  it("renders the event name", () => {
    const now = new Date("2026-05-13T09:00:00Z")
    render(<EventChip ev={baseEvent} tripId={TRIP_ID} now={now} />)
    expect(screen.getByText("Lunch at Cafe")).toBeInTheDocument()
  })

  it("shows NOW text indicator when event is current", () => {
    const now = new Date("2026-05-13T11:30:00Z")
    render(<EventChip ev={baseEvent} tripId={TRIP_ID} now={now} />)
    expect(screen.getByText(/NOW/)).toBeInTheDocument()
  })

  it("shows DONE text indicator when event is past", () => {
    const now = new Date("2026-05-13T15:00:00Z")
    render(<EventChip ev={baseEvent} tripId={TRIP_ID} now={now} />)
    expect(screen.getByText(/DONE/)).toBeInTheDocument()
  })

  it("renders a time string when startAt is present", () => {
    const now = new Date("2026-05-13T09:00:00Z")
    render(<EventChip ev={baseEvent} tripId={TRIP_ID} now={now} />)
    // Time label div contains the formatted start time (non-empty)
    const link = screen.getByTitle(`Open ${baseEvent.name} in day planner`)
    expect(link).toBeInTheDocument()
    // The chip has a time label - find the first child div which holds the time text
    const timeDivs = link.querySelectorAll("div")
    const timeText = timeDivs[0]?.textContent ?? ""
    expect(timeText.length).toBeGreaterThan(0)
  })

  it("renders no time string when startAt is absent", () => {
    const now = new Date("2026-05-13T09:00:00Z")
    const ev: TripEvent = { id: "ev-2", name: "Free time" }
    render(<EventChip ev={ev} tripId={TRIP_ID} now={now} />)
    expect(screen.getByText("Free time")).toBeInTheDocument()
  })

  it("link has a descriptive title", () => {
    const now = new Date("2026-05-13T09:00:00Z")
    render(<EventChip ev={baseEvent} tripId={TRIP_ID} now={now} />)
    expect(screen.getByTitle(`Open ${baseEvent.name} in day planner`)).toBeInTheDocument()
  })

  it("renders MapPin icon", () => {
    const now = new Date("2026-05-13T09:00:00Z")
    render(<EventChip ev={baseEvent} tripId={TRIP_ID} now={now} />)
    expect(screen.getByTestId("map-pin-icon")).toBeInTheDocument()
  })

  it("MapPin icon has strokeWidth 1.5", () => {
    const now = new Date("2026-05-13T09:00:00Z")
    render(<EventChip ev={baseEvent} tripId={TRIP_ID} now={now} />)
    expect(screen.getByTestId("map-pin-icon")).toHaveAttribute("data-stroke-width", "1.5")
  })
})

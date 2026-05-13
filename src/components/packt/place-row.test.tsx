// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("./docs-block", () => ({ DocsBlock: () => null }))
vi.mock("./time-picker-dropdown", () => ({ TimePickerDropdown: () => null }))
vi.mock("./cost-dialog", () => ({ CostDialog: () => null }))
vi.mock("./location-dialog", () => ({ LocationDialog: () => null }))
vi.mock("./add-doc-dialog", () => ({ AddDocDialog: () => null }))

import { PlaceRow } from "./place-row"
import { MockDateProvider } from "@/components/providers/mock-date-provider"
import type { TripEvent } from "@/data/types"

const NOW_ISO = "2026-05-13T12:00:00.000Z"

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MockDateProvider initialISO={NOW_ISO}>{children}</MockDateProvider>
}

const basePlace: TripEvent = {
  id: "ev-1",
  name: "Tokyo Tower",
  startAt: "2026-05-13T10:00:00Z",
  endAt: "2026-05-13T11:00:00Z",
}

describe("PlaceRow", () => {
  it("renders the event name", () => {
    render(
      <PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    expect(screen.getByText("Tokyo Tower")).toBeInTheDocument()
  })

  it("shows formatted time range when startAt and endAt are present", () => {
    render(
      <PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    // When startAt/endAt are set the time button should NOT show "Add time"
    expect(screen.queryByRole("button", { name: /add time/i })).not.toBeInTheDocument()
    // At least one button contains a formatted time string (e.g. "10:00 AM – 11:00 AM")
    const allButtons = screen.getAllByRole("button")
    const timeBtn = allButtons.find(btn => /\d:\d{2}\s*(AM|PM)/.test(btn.textContent ?? ""))
    expect(timeBtn).toBeDefined()
  })

  it("shows 'Add time' when no startAt", () => {
    const place: TripEvent = { id: "ev-2", name: "Free Time" }
    render(
      <PlaceRow place={place} onUpdate={vi.fn()} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    expect(screen.getByRole("button", { name: /add time/i })).toBeInTheDocument()
  })

  it("delete button has a title attribute", () => {
    render(
      <PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    expect(screen.getByTitle("Delete event")).toBeInTheDocument()
  })

  it("calls onDelete with the event id when delete button is clicked", async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    render(
      <PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={onDelete} />,
      { wrapper: Wrapper }
    )
    await user.click(screen.getByTitle("Delete event"))
    expect(onDelete).toHaveBeenCalledOnce()
    expect(onDelete).toHaveBeenCalledWith(basePlace.id)
  })

  it("note area is keyboard operable (role=button, tabIndex=0)", () => {
    render(
      <PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    const noteBtn = screen.getByRole("button", { name: /add a note/i })
    expect(noteBtn).toHaveAttribute("tabindex", "0")
  })

  it("note edit activates on Enter key", async () => {
    const user = userEvent.setup()
    render(
      <PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    const noteBtn = screen.getByRole("button", { name: /add a note/i })
    noteBtn.focus()
    await user.keyboard("{Enter}")
    // Textarea replaces the button when editing is active
    expect(screen.getByRole("textbox", { name: "" })).toBeInTheDocument()
  })

  it("calls onUpdate with new name after editing and blur", async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    render(
      <PlaceRow place={basePlace} onUpdate={onUpdate} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    // Click the pencil edit button (has title="Edit name")
    await user.click(screen.getByTitle("Edit name"))
    const nameInput = screen.getByDisplayValue("Tokyo Tower")
    await user.clear(nameInput)
    await user.type(nameInput, "Shibuya Crossing")
    fireEvent.blur(nameInput)
    expect(onUpdate).toHaveBeenCalledOnce()
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: "Shibuya Crossing" }))
  })
})

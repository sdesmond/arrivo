// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("next/image", () => ({
  default: ({ src, alt, width, height, style }: {
    src: string; alt: string; width?: number; height?: number; style?: React.CSSProperties
  }) => <img src={src} alt={alt} width={width} height={height} style={style} />,
}))

vi.mock("./trip-edit-collaborators", () => ({
  TripEditCollaborators: () => null,
}))

import { TripEditSheet } from "./trip-edit-sheet"
import type { Trip, UpdateTripPatch } from "@/data/types"

const baseTrip: Trip = {
  id: "trip-1",
  name: "Tokyo Adventure",
  status: "upcoming",
  startDate: "2026-06-01",
  endDate: "2026-06-10",
  budget: {
    currency: "USD",
    total: 3000,
    perPerson: 1500,
  },
}

describe("TripEditSheet", () => {
  it("renders pre-filled trip name", () => {
    render(
      <TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />
    )
    expect(screen.getByDisplayValue("Tokyo Adventure")).toBeInTheDocument()
  })

  it("renders pre-filled start and end dates", () => {
    render(
      <TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />
    )
    expect(screen.getByDisplayValue("2026-06-01")).toBeInTheDocument()
    expect(screen.getByDisplayValue("2026-06-10")).toBeInTheDocument()
  })

  it("renders budget total and per-person inputs with pre-filled values", () => {
    render(
      <TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />
    )
    expect(screen.getByDisplayValue("3000")).toBeInTheDocument()
    expect(screen.getByDisplayValue("1500")).toBeInTheDocument()
  })

  it("budget section label text is visible", () => {
    render(
      <TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={vi.fn()} />
    )
    expect(screen.getByText("Total")).toBeInTheDocument()
    expect(screen.getByText("Per person")).toBeInTheDocument()
  })

  it("Cancel button calls onClose", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <TripEditSheet trip={baseTrip} open onClose={onClose} onSave={vi.fn()} />
    )
    await user.click(screen.getByRole("button", { name: /cancel/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("Save button calls onSave with current draft values", async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(
      <TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />
    )
    await user.click(screen.getByRole("button", { name: /save changes/i }))
    expect(onSave).toHaveBeenCalledOnce()
    const patch: UpdateTripPatch = onSave.mock.calls[0][0]
    expect(patch.name).toBe("Tokyo Adventure")
    expect(patch.startDate).toBe("2026-06-01")
    expect(patch.endDate).toBe("2026-06-10")
    expect(patch.budgetTotal).toBe(3000)
    expect(patch.budgetPerPerson).toBe(1500)
  })

  it("onSave includes modified name after editing", async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(
      <TripEditSheet trip={baseTrip} open onClose={vi.fn()} onSave={onSave} />
    )
    const nameInput = screen.getByDisplayValue("Tokyo Adventure")
    await user.clear(nameInput)
    await user.type(nameInput, "Kyoto Journey")
    await user.click(screen.getByRole("button", { name: /save changes/i }))
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: "Kyoto Journey" }))
  })

  it("renders nothing when trip is null", () => {
    const { container } = render(
      <TripEditSheet trip={null} open onClose={vi.fn()} onSave={vi.fn()} />
    )
    expect(container).toBeEmptyDOMElement()
  })
})

// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { TimePickerDropdown } from "./time-picker-dropdown"

describe("TimePickerDropdown", () => {
  it("renders Start time and End time labels", () => {
    render(<TimePickerDropdown onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText("Start time")).toBeInTheDocument()
    expect(screen.getByText("End time")).toBeInTheDocument()
  })

  it("pre-fills start time input from time prop", () => {
    render(<TimePickerDropdown time="10:30" onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByDisplayValue("10:30")).toBeInTheDocument()
  })

  it("pre-fills end time input from endTime prop", () => {
    render(<TimePickerDropdown time="10:00" endTime="11:45" onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByDisplayValue("11:45")).toBeInTheDocument()
  })

  it("does not show Remove button when no time is set", () => {
    render(<TimePickerDropdown onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByRole("button", { name: /remove/i })).not.toBeInTheDocument()
  })

  it("shows Remove button when time prop is provided", () => {
    render(<TimePickerDropdown time="10:00" onSave={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole("button", { name: /remove/i })).toBeInTheDocument()
  })

  it("Remove button calls onSave(undefined, undefined)", async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<TimePickerDropdown time="10:00" endTime="11:00" onSave={onSave} onClose={vi.fn()} />)
    await user.click(screen.getByRole("button", { name: /remove/i }))
    expect(onSave).toHaveBeenCalledWith(undefined, undefined)
  })

  it("Save button calls onSave with pre-filled values", async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<TimePickerDropdown time="09:00" endTime="10:00" onSave={onSave} onClose={vi.fn()} />)
    await user.click(screen.getByRole("button", { name: /save/i }))
    expect(onSave).toHaveBeenCalledWith("09:00", "10:00")
  })

  it("Save button calls onSave with undefined when inputs are empty", async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<TimePickerDropdown onSave={onSave} onClose={vi.fn()} />)
    await user.click(screen.getByRole("button", { name: /save/i }))
    expect(onSave).toHaveBeenCalledWith(undefined, undefined)
  })

  it("mousedown outside the picker calls onClose", () => {
    const onClose = vi.fn()
    render(<TimePickerDropdown onSave={vi.fn()} onClose={onClose} />)
    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("mousedown inside the picker does not call onClose", () => {
    const onClose = vi.fn()
    render(<TimePickerDropdown time="10:00" onSave={vi.fn()} onClose={onClose} />)
    fireEvent.mouseDown(screen.getByRole("button", { name: /remove/i }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it("Cancel button calls onClose", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<TimePickerDropdown onSave={vi.fn()} onClose={onClose} />)
    await user.click(screen.getByRole("button", { name: /cancel/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it("changing start time input updates draft on Save", async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(<TimePickerDropdown onSave={onSave} onClose={vi.fn()} />)
    const inputs = document.querySelectorAll("input[type='time']")
    fireEvent.change(inputs[0], { target: { value: "14:00" } })
    await user.click(screen.getByRole("button", { name: /save/i }))
    expect(onSave).toHaveBeenCalledWith("14:00", undefined)
  })
})

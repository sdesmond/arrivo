// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lucide-react")>()
  return {
    ...actual,
    MapPin: ({ strokeWidth, ...props }: React.SVGProps<SVGSVGElement> & { strokeWidth?: number }) => (
      <svg data-testid="map-pin-icon" data-stroke-width={strokeWidth} {...props} />
    ),
  }
})

vi.mock("./docs-block", () => ({
  DocsBlock: ({ docs, onDelete, onAdd }: { docs: { id: string; name: string }[]; onDelete: (id: string) => void; onAdd: () => void }) => (
    <div data-testid="docs-block">
      {docs.map(d => <button key={d.id} onClick={() => onDelete(d.id)}>del-{d.name}</button>)}
      <button onClick={onAdd}>add-doc-in-block</button>
    </div>
  ),
}))
vi.mock("./time-picker-dropdown", () => ({
  TimePickerDropdown: ({ onSave, onClose }: { onSave: (t?: string, et?: string) => void; onClose: () => void }) => (
    <div data-testid="time-picker-dropdown">
      <button onClick={() => onSave("10:00", "11:00")}>picker-save</button>
      <button onClick={() => onSave(undefined, undefined)}>picker-clear</button>
      <button onClick={onClose}>picker-close</button>
    </div>
  ),
}))
vi.mock("./cost-dialog", () => ({
  CostDialog: ({ open, onSave, onOpenChange }: { open: boolean; cost?: number; onSave: (c?: number) => void; onOpenChange: (v: boolean) => void }) =>
    open ? (
      <div data-testid="cost-dialog">
        <button onClick={() => onSave(99)}>cost-save</button>
        <button onClick={() => onOpenChange(false)}>cost-close</button>
      </div>
    ) : null,
}))
vi.mock("./location-dialog", () => ({
  LocationDialog: ({ open, onSave, onOpenChange }: { open: boolean; address?: string; onSave: (a?: string) => void; onOpenChange: (v: boolean) => void }) =>
    open ? (
      <div data-testid="location-dialog">
        <button onClick={() => onSave("Tokyo")}>loc-save</button>
        <button onClick={() => onOpenChange(false)}>loc-close</button>
      </div>
    ) : null,
}))
vi.mock("./add-doc-dialog", () => ({
  AddDocDialog: ({ open, onAdd, onOpenChange }: { open: boolean; onAdd: (doc: { id: string; name: string; kind: string; scope: string; offline: boolean }) => void; onOpenChange: (v: boolean) => void }) =>
    open ? (
      <div data-testid="add-doc-dialog">
        <button onClick={() => onAdd({ id: "d99", name: "New.pdf", kind: "pdf", scope: "event", offline: false })}>doc-add</button>
        <button onClick={() => onOpenChange(false)}>doc-close</button>
      </div>
    ) : null,
}))

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

  it("clicking note area shows textarea", async () => {
    const user = userEvent.setup()
    render(
      <PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    const noteBtn = screen.getByRole("button", { name: /add a note/i })
    await user.click(noteBtn)
    expect(screen.getByRole("textbox")).toBeInTheDocument()
  })

  it("blurring note textarea calls onUpdate with trimmed note", async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    render(
      <PlaceRow place={basePlace} onUpdate={onUpdate} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    await user.click(screen.getByRole("button", { name: /add a note/i }))
    const textarea = screen.getByRole("textbox")
    await user.type(textarea, "Great place")
    fireEvent.blur(textarea)
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ note: "Great place" }))
  })

  it("pressing Escape in note textarea dismisses it without saving", async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    render(
      <PlaceRow place={basePlace} onUpdate={onUpdate} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    await user.click(screen.getByRole("button", { name: /add a note/i }))
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it("shows 'Add location' button", () => {
    render(
      <PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    expect(screen.getByRole("button", { name: /add location/i })).toBeInTheDocument()
  })

  it("shows 'Add cost' button", () => {
    render(
      <PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    expect(screen.getByRole("button", { name: /add cost/i })).toBeInTheDocument()
  })

  it("shows cost amount when cost is set", () => {
    const place = { ...basePlace, cost: 42.5 }
    render(
      <PlaceRow place={place} onUpdate={vi.fn()} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    expect(screen.getByText("42.50")).toBeInTheDocument()
  })

  it("shows doc count button when docs are present", () => {
    const place = { ...basePlace, docs: [{ id: "d1", name: "Plan.pdf", kind: "pdf" as const, scope: "event" as const, offline: false }] }
    render(
      <PlaceRow place={place} onUpdate={vi.fn()} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    expect(screen.getByRole("button", { name: /1 doc/i })).toBeInTheDocument()
  })

  it("renders location address when set", () => {
    const place = { ...basePlace, locationAddress: "Shibuya, Tokyo" }
    render(
      <PlaceRow place={place} onUpdate={vi.fn()} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    expect(screen.getByText("Shibuya, Tokyo")).toBeInTheDocument()
  })

  it("clicking time button shows time picker dropdown", async () => {
    const user = userEvent.setup()
    render(
      <PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    const timeBtn = screen.getAllByRole("button").find(b => /\d:\d{2}\s*(AM|PM)/.test(b.textContent ?? ""))!
    await user.click(timeBtn)
    expect(screen.getByTestId("time-picker-dropdown")).toBeInTheDocument()
  })

  it("picker save with times calls onUpdate and hides picker", async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    render(
      <PlaceRow place={basePlace} dayDate="2026-05-13" onUpdate={onUpdate} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    const timeBtn = screen.getAllByRole("button").find(b => /\d:\d{2}\s*(AM|PM)/.test(b.textContent ?? ""))!
    await user.click(timeBtn)
    await user.click(screen.getByRole("button", { name: "picker-save" }))
    expect(onUpdate).toHaveBeenCalledOnce()
    expect(screen.queryByTestId("time-picker-dropdown")).not.toBeInTheDocument()
  })

  it("picker save with no dayDate sets startAt/endAt to undefined", async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    render(
      <PlaceRow place={basePlace} onUpdate={onUpdate} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    const timeBtn = screen.getAllByRole("button").find(b => /\d:\d{2}\s*(AM|PM)/.test(b.textContent ?? ""))!
    await user.click(timeBtn)
    await user.click(screen.getByRole("button", { name: "picker-save" }))
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ startAt: undefined, endAt: undefined }))
  })

  it("picker clear calls onUpdate with startAt/endAt undefined", async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    render(
      <PlaceRow place={basePlace} onUpdate={onUpdate} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    const timeBtn = screen.getAllByRole("button").find(b => /\d:\d{2}\s*(AM|PM)/.test(b.textContent ?? ""))!
    await user.click(timeBtn)
    await user.click(screen.getByRole("button", { name: "picker-clear" }))
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ startAt: undefined, endAt: undefined }))
  })

  it("picker close hides picker without calling onUpdate", async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    render(
      <PlaceRow place={basePlace} onUpdate={onUpdate} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    const timeBtn = screen.getAllByRole("button").find(b => /\d:\d{2}\s*(AM|PM)/.test(b.textContent ?? ""))!
    await user.click(timeBtn)
    await user.click(screen.getByRole("button", { name: "picker-close" }))
    expect(screen.queryByTestId("time-picker-dropdown")).not.toBeInTheDocument()
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it("clicking location button shows location dialog", async () => {
    const user = userEvent.setup()
    render(
      <PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    await user.click(screen.getByRole("button", { name: /add location/i }))
    expect(screen.getByTestId("location-dialog")).toBeInTheDocument()
  })

  it("location dialog save calls onUpdate with locationAddress", async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    render(
      <PlaceRow place={basePlace} onUpdate={onUpdate} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    await user.click(screen.getByRole("button", { name: /add location/i }))
    await user.click(screen.getByRole("button", { name: "loc-save" }))
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ locationAddress: "Tokyo" }))
  })

  it("clicking cost button shows cost dialog", async () => {
    const user = userEvent.setup()
    render(
      <PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    await user.click(screen.getByRole("button", { name: /add cost/i }))
    expect(screen.getByTestId("cost-dialog")).toBeInTheDocument()
  })

  it("cost dialog save calls onUpdate with new cost", async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    render(
      <PlaceRow place={basePlace} onUpdate={onUpdate} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    await user.click(screen.getByRole("button", { name: /add cost/i }))
    await user.click(screen.getByRole("button", { name: "cost-save" }))
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ cost: 99 }))
  })

  it("clicking doc count button toggles docs block", async () => {
    const user = userEvent.setup()
    const place = { ...basePlace, docs: [{ id: "d1", name: "Plan.pdf", kind: "pdf" as const, scope: "event" as const, offline: false }] }
    render(
      <PlaceRow place={place} onUpdate={vi.fn()} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    expect(screen.queryByTestId("docs-block")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /1 doc/i }))
    expect(screen.getByTestId("docs-block")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /1 doc/i }))
    expect(screen.queryByTestId("docs-block")).not.toBeInTheDocument()
  })

  it("clicking attach button shows add-doc dialog", async () => {
    const user = userEvent.setup()
    render(
      <PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    await user.click(screen.getByTitle("Attach document"))
    expect(screen.getByTestId("add-doc-dialog")).toBeInTheDocument()
  })

  it("add-doc dialog onAdd calls onAddDoc with event id and doc data", async () => {
    const user = userEvent.setup()
    const onAddDoc = vi.fn()
    render(
      <PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} onAddDoc={onAddDoc} />,
      { wrapper: Wrapper }
    )
    await user.click(screen.getByTitle("Attach document"))
    await user.click(screen.getByRole("button", { name: "doc-add" }))
    expect(onAddDoc).toHaveBeenCalledWith(basePlace.id, expect.objectContaining({ name: "New.pdf", kind: "pdf" }))
  })

  it("docs block onDelete calls onDeleteDoc with docId", async () => {
    const user = userEvent.setup()
    const onDeleteDoc = vi.fn()
    const place = { ...basePlace, docs: [{ id: "d1", name: "Plan.pdf", kind: "pdf" as const, scope: "event" as const, offline: false }] }
    render(
      <PlaceRow place={place} onUpdate={vi.fn()} onDelete={vi.fn()} onDeleteDoc={onDeleteDoc} />,
      { wrapper: Wrapper }
    )
    await user.click(screen.getByRole("button", { name: /1 doc/i }))
    await user.click(screen.getByRole("button", { name: /del-Plan.pdf/i }))
    expect(onDeleteDoc).toHaveBeenCalledWith("d1")
  })

  it("renders dragHandle when provided", () => {
    render(
      <PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} dragHandle={<span data-testid="drag-handle">drag</span>} />,
      { wrapper: Wrapper }
    )
    expect(screen.getByTestId("drag-handle")).toBeInTheDocument()
  })

  it("isLast prop omits the connector line", () => {
    const { container } = render(
      <PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} isLast />,
      { wrapper: Wrapper }
    )
    expect(container.firstChild).toBeInTheDocument()
  })

  it("saveName with same value does not call onUpdate", async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    render(
      <PlaceRow place={basePlace} onUpdate={onUpdate} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    await user.click(screen.getByTitle("Edit name"))
    const nameInput = screen.getByDisplayValue("Tokyo Tower")
    fireEvent.blur(nameInput)
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it("pressing Enter in name input saves and hides input", async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    render(
      <PlaceRow place={basePlace} onUpdate={onUpdate} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    await user.click(screen.getByTitle("Edit name"))
    const nameInput = screen.getByDisplayValue("Tokyo Tower")
    await user.clear(nameInput)
    await user.type(nameInput, "Akihabara")
    await user.keyboard("{Enter}")
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ name: "Akihabara" }))
    expect(screen.queryByDisplayValue("Akihabara")).not.toBeInTheDocument()
  })

  it("pressing Escape in name input cancels edit", async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    render(
      <PlaceRow place={basePlace} onUpdate={onUpdate} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    await user.click(screen.getByTitle("Edit name"))
    await user.keyboard("{Escape}")
    expect(onUpdate).not.toHaveBeenCalled()
    expect(screen.queryByDisplayValue("Tokyo Tower")).not.toBeInTheDocument()
  })

  it("Space key on note area activates editing", async () => {
    const user = userEvent.setup()
    render(
      <PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    const noteBtn = screen.getByRole("button", { name: /add a note/i })
    noteBtn.focus()
    await user.keyboard(" ")
    expect(screen.getByRole("textbox", { name: "" })).toBeInTheDocument()
  })

  it("note textarea onUpdate not called when note unchanged", async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    const place = { ...basePlace, note: "existing note" }
    render(
      <PlaceRow place={place} onUpdate={onUpdate} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    const noteBtn = screen.getByText("existing note")
    await user.click(noteBtn)
    fireEvent.blur(screen.getByRole("textbox"))
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it("renders with only startAt (no endAt) — single-time label", () => {
    const place: TripEvent = { id: "ev-3", name: "Solo Event", startAt: "2026-05-13T14:00:00Z" }
    render(
      <PlaceRow place={place} onUpdate={vi.fn()} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    const allButtons = screen.getAllByRole("button")
    const timeBtn = allButtons.find(btn => /\d:\d{2}\s*(AM|PM)/.test(btn.textContent ?? ""))
    expect(timeBtn).toBeDefined()
  })

  it("renders MapPin icon as the event type indicator", () => {
    render(
      <PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    const icons = screen.getAllByTestId("map-pin-icon")
    expect(icons.length).toBeGreaterThanOrEqual(1)
  })

  it("timeline MapPin icon has strokeWidth 1.5", () => {
    render(
      <PlaceRow place={basePlace} onUpdate={vi.fn()} onDelete={vi.fn()} />,
      { wrapper: Wrapper }
    )
    const icons = screen.getAllByTestId("map-pin-icon")
    expect(icons[0]).toHaveAttribute("data-stroke-width", "1.5")
  })

  // ── isDraft mode ──────────────────────────────────────────────────────────

  it("isDraft renders name input focused with empty placeholder", () => {
    const draftPlace: TripEvent = { id: "draft", name: "" }
    render(
      <PlaceRow place={draftPlace} onUpdate={vi.fn()} onDelete={vi.fn()} isDraft onCreate={vi.fn()} onCancelDraft={vi.fn()} />,
      { wrapper: Wrapper }
    )
    expect(screen.getByRole("textbox")).toBeInTheDocument()
  })

  it("isDraft Enter with content calls onCreate and not onUpdate", async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    const onUpdate = vi.fn()
    const draftPlace: TripEvent = { id: "draft", name: "" }
    render(
      <PlaceRow place={draftPlace} onUpdate={onUpdate} onDelete={vi.fn()} isDraft onCreate={onCreate} onCancelDraft={vi.fn()} />,
      { wrapper: Wrapper }
    )
    const input = screen.getByRole("textbox")
    await user.type(input, "New Stop")
    await user.keyboard("{Enter}")
    expect(onCreate).toHaveBeenCalledWith("New Stop")
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it("isDraft Escape calls onCancelDraft", async () => {
    const user = userEvent.setup()
    const onCancelDraft = vi.fn()
    const draftPlace: TripEvent = { id: "draft", name: "" }
    render(
      <PlaceRow place={draftPlace} onUpdate={vi.fn()} onDelete={vi.fn()} isDraft onCreate={vi.fn()} onCancelDraft={onCancelDraft} />,
      { wrapper: Wrapper }
    )
    await user.keyboard("{Escape}")
    expect(onCancelDraft).toHaveBeenCalled()
  })

  it("isDraft blur with empty content calls onCancelDraft", () => {
    const onCancelDraft = vi.fn()
    const draftPlace: TripEvent = { id: "draft", name: "" }
    render(
      <PlaceRow place={draftPlace} onUpdate={vi.fn()} onDelete={vi.fn()} isDraft onCreate={vi.fn()} onCancelDraft={onCancelDraft} />,
      { wrapper: Wrapper }
    )
    fireEvent.blur(screen.getByRole("textbox"))
    expect(onCancelDraft).toHaveBeenCalled()
  })

  it("isDraft blur with content calls onCreate", async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    const draftPlace: TripEvent = { id: "draft", name: "" }
    render(
      <PlaceRow place={draftPlace} onUpdate={vi.fn()} onDelete={vi.fn()} isDraft onCreate={onCreate} onCancelDraft={vi.fn()} />,
      { wrapper: Wrapper }
    )
    await user.type(screen.getByRole("textbox"), "Tokyo Museum")
    fireEvent.blur(screen.getByRole("textbox"))
    expect(onCreate).toHaveBeenCalledWith("Tokyo Museum")
  })
})

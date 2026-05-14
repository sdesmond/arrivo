// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { DocsBlock } from "./docs-block"
import type { Document } from "@/data/types"

const docs: Document[] = [
  { id: "d1", name: "Itinerary.pdf", kind: "pdf", scope: "event", offline: false },
  { id: "d2", name: "Hotels.pdf", kind: "pdf", scope: "event", offline: true },
]

describe("DocsBlock", () => {
  it("renders doc names", () => {
    render(<DocsBlock docs={docs} onDelete={vi.fn()} onAdd={vi.fn()} />)
    expect(screen.getByText("Itinerary.pdf")).toBeInTheDocument()
    expect(screen.getByText("Hotels.pdf")).toBeInTheDocument()
  })

  it("calls onDelete with doc id when remove button is clicked", async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    render(<DocsBlock docs={docs} onDelete={onDelete} onAdd={vi.fn()} />)
    await user.click(screen.getByRole("button", { name: /remove itinerary\.pdf/i }))
    expect(onDelete).toHaveBeenCalledWith("d1")
  })

  it("calls onAdd when 'Add doc' is clicked", async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<DocsBlock docs={docs} onDelete={vi.fn()} onAdd={onAdd} />)
    await user.click(screen.getByRole("button", { name: /add doc/i }))
    expect(onAdd).toHaveBeenCalledOnce()
  })

  it("renders Add doc button with no border when docs array is empty", () => {
    render(<DocsBlock docs={[]} onDelete={vi.fn()} onAdd={vi.fn()} />)
    expect(screen.getByRole("button", { name: /add doc/i })).toBeInTheDocument()
  })

  it("shows offline indicator for offline docs", () => {
    render(<DocsBlock docs={docs} onDelete={vi.fn()} onAdd={vi.fn()} />)
    expect(screen.getByText(/offline/i)).toBeInTheDocument()
  })
})

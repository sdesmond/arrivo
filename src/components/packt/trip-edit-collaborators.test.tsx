// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { TripEditCollaborators } from "./trip-edit-collaborators"
import type { Collaborator } from "@/data/types"

const collaborators: Collaborator[] = [
  { name: "Alice Smith", email: "alice@example.com", initials: "AS", role: "editor", tint: { bg: "#e0f2fe", fg: "#0369a1" } },
  { name: "Bob Jones", email: "bob@example.com", initials: "BJ", role: "viewer", tint: { bg: "#f0fdf4", fg: "#166534" } },
]

describe("TripEditCollaborators", () => {
  it("renders collaborator names and emails", () => {
    render(<TripEditCollaborators collaborators={collaborators} onRemove={vi.fn()} onUpdateRole={vi.fn()} onAdd={vi.fn()} />)
    expect(screen.getByText("Alice Smith")).toBeInTheDocument()
    expect(screen.getByText("alice@example.com")).toBeInTheDocument()
    expect(screen.getByText("Bob Jones")).toBeInTheDocument()
  })

  it("calls onRemove with index when remove button is clicked", async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(<TripEditCollaborators collaborators={collaborators} onRemove={onRemove} onUpdateRole={vi.fn()} onAdd={vi.fn()} />)
    const removeButtons = screen.getAllByTitle("Remove")
    await user.click(removeButtons[0])
    expect(onRemove).toHaveBeenCalledWith(0)
  })

  it("calls onUpdateRole when role select changes", async () => {
    const user = userEvent.setup()
    const onUpdateRole = vi.fn()
    render(<TripEditCollaborators collaborators={collaborators} onRemove={vi.fn()} onUpdateRole={onUpdateRole} onAdd={vi.fn()} />)
    const selects = screen.getAllByRole("combobox")
    // First select is for the first collaborator (Alice - editor)
    await user.selectOptions(selects[0], "viewer")
    expect(onUpdateRole).toHaveBeenCalledWith(0, "viewer")
  })

  it("calls onAdd when form is filled and Add is clicked", async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<TripEditCollaborators collaborators={[]} onRemove={vi.fn()} onUpdateRole={vi.fn()} onAdd={onAdd} />)
    await user.type(screen.getByPlaceholderText("Name"), "Carol White")
    await user.type(screen.getByPlaceholderText("Email"), "carol@example.com")
    await user.click(screen.getByRole("button", { name: /add/i }))
    expect(onAdd).toHaveBeenCalledWith("Carol White", "carol@example.com", "editor")
  })

  it("renders 'No collaborators yet' when list is empty", () => {
    render(<TripEditCollaborators collaborators={[]} onRemove={vi.fn()} onUpdateRole={vi.fn()} onAdd={vi.fn()} />)
    expect(screen.getByText(/no collaborators yet/i)).toBeInTheDocument()
  })

  it("calls onAdd with viewer role when new role select is changed before adding", async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    render(<TripEditCollaborators collaborators={[]} onRemove={vi.fn()} onUpdateRole={vi.fn()} onAdd={onAdd} />)
    await user.type(screen.getByPlaceholderText("Name"), "Dana Blue")
    await user.type(screen.getByPlaceholderText("Email"), "dana@example.com")
    const selects = screen.getAllByRole("combobox")
    const newRoleSelect = selects[selects.length - 1]
    await user.selectOptions(newRoleSelect, "viewer")
    await user.click(screen.getByRole("button", { name: /add/i }))
    expect(onAdd).toHaveBeenCalledWith("Dana Blue", "dana@example.com", "viewer")
  })

  it("owner role cannot be removed (button is disabled)", () => {
    const ownerCollaborator: Collaborator[] = [
      { name: "Owner User", email: "owner@example.com", initials: "OU", role: "owner" },
    ]
    render(<TripEditCollaborators collaborators={ownerCollaborator} onRemove={vi.fn()} onUpdateRole={vi.fn()} onAdd={vi.fn()} />)
    const removeButtons = screen.getAllByTitle(/Owner cannot be removed/i)
    expect(removeButtons[0]).toBeDisabled()
  })
})

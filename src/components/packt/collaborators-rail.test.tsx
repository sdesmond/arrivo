// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { CollaboratorsRail } from "./collaborators-rail"
import type { Collaborator } from "@/data/types"

const collaborators: Collaborator[] = [
  { name: "Alice Smith", email: "alice@example.com", initials: "AS", role: "editor", tint: { bg: "#e0f2fe", fg: "#0369a1" } },
  { name: "Bob Jones", email: "bob@example.com", initials: "BJ", role: "viewer", tint: { bg: "#f0fdf4", fg: "#166534" } },
]

describe("CollaboratorsRail", () => {
  it("renders collaborator names", () => {
    render(<CollaboratorsRail collaborators={collaborators} />)
    expect(screen.getByText("Alice Smith")).toBeInTheDocument()
    expect(screen.getByText("Bob Jones")).toBeInTheDocument()
  })

  it("renders Invite button", () => {
    render(<CollaboratorsRail collaborators={collaborators} />)
    expect(screen.getByRole("button", { name: /invite/i })).toBeInTheDocument()
  })

  it("renders with empty list", () => {
    render(<CollaboratorsRail collaborators={[]} />)
    expect(screen.getByRole("button", { name: /invite/i })).toBeInTheDocument()
  })
})

// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}))

import { vi } from "vitest"
import { Topbar } from "./trips-topbar"

describe("Topbar", () => {
  it("renders 'My trips' heading", () => {
    render(<Topbar tripCount={3} pastCount={2} now={new Date("2026-05-13")} />)
    expect(screen.getByText("My trips")).toBeInTheDocument()
  })

  it("renders trip count info", () => {
    render(<Topbar tripCount={3} pastCount={2} now={new Date("2026-05-13")} />)
    expect(screen.getByText(/3 trips/i)).toBeInTheDocument()
  })

  it("renders singular 'trip' when count is 1", () => {
    render(<Topbar tripCount={1} pastCount={0} now={new Date("2026-05-13")} />)
    expect(screen.getByText(/1 trip\b/)).toBeInTheDocument()
  })

  it("renders past count info", () => {
    render(<Topbar tripCount={3} pastCount={2} now={new Date("2026-05-13")} />)
    expect(screen.getByText(/2 past/i)).toBeInTheDocument()
  })
})

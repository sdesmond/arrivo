// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { Map } from "lucide-react"

vi.mock("next/link", () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) =>
    <a href={href} className={className}>{children}</a>,
}))

import { vi } from "vitest"
import { NavItem } from "./nav-item"

describe("NavItem", () => {
  it("renders label and link href", () => {
    render(<NavItem href="/trips" label="Trips" icon={Map} />)
    expect(screen.getByText("Trips")).toBeInTheDocument()
    expect(screen.getByRole("link")).toHaveAttribute("href", "/trips")
  })

  it("renders count when provided", () => {
    render(<NavItem href="/trips" label="Trips" icon={Map} count={5} />)
    expect(screen.getByText("5")).toBeInTheDocument()
  })

  it("renders without error when active", () => {
    render(<NavItem href="/trips" label="Trips" icon={Map} active />)
    expect(screen.getByText("Trips")).toBeInTheDocument()
  })

  it("does not render count when omitted", () => {
    render(<NavItem href="/trips" label="Trips" icon={Map} />)
    expect(screen.queryByText("0")).not.toBeInTheDocument()
  })
})

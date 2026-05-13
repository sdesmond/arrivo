// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("next/navigation", () => ({
  usePathname: () => "/trips",
}))

vi.mock("next/link", () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) =>
    <a href={href} className={className}>{children}</a>,
}))

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}))

vi.mock("@/app/(auth)/actions", () => ({
  signOutAction: vi.fn(),
}))

import { SidebarNav } from "./sidebar-nav"

describe("SidebarNav", () => {
  it("renders Trips nav item", () => {
    render(<SidebarNav />)
    expect(screen.getAllByText("Trips").length).toBeGreaterThanOrEqual(1)
  })

  it("renders Search nav item", () => {
    render(<SidebarNav />)
    expect(screen.getByText("Search")).toBeInTheDocument()
  })

  it("renders the Packt brand name", () => {
    render(<SidebarNav />)
    expect(screen.getByText("Packt")).toBeInTheDocument()
  })

  it("renders sign out button", () => {
    render(<SidebarNav />)
    expect(screen.getByTitle("Sign out")).toBeInTheDocument()
  })
})

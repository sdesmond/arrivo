import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Map } from "lucide-react";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    className,
    "aria-label": ariaLabel,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
    "aria-label"?: string;
  }) => (
    <a href={href} className={className} aria-label={ariaLabel}>
      {children}
    </a>
  ),
}));

import { vi } from "vitest";
import { NavItem } from "./nav-item";

describe("NavItem", () => {
  it("renders label and link href", () => {
    render(<NavItem href="/trips" label="Trips" icon={Map} />);
    expect(screen.getByText("Trips")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/trips");
  });

  it("renders count when provided", () => {
    render(<NavItem href="/trips" label="Trips" icon={Map} count={5} />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("renders without error when active", () => {
    render(<NavItem href="/trips" label="Trips" icon={Map} active />);
    expect(screen.getByText("Trips")).toBeInTheDocument();
  });

  it("does not render count when omitted", () => {
    render(<NavItem href="/trips" label="Trips" icon={Map} />);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("does not render a badge or aria-label when count is zero", () => {
    render(<NavItem href="/trips" label="Trips" icon={Map} count={0} />);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.getByRole("link")).not.toHaveAttribute("aria-label");
  });

  it("sets an accessible label naming the pending invitation count", () => {
    render(<NavItem href="/trips" label="Trips" icon={Map} count={3} />);
    expect(screen.getByRole("link")).toHaveAttribute("aria-label", "Trips, 3 pending invitations");
  });

  it("tints the count badge to the warning color when countTint is warning", () => {
    render(<NavItem href="/trips" label="Trips" icon={Map} count={2} countTint="warning" />);
    expect(screen.getByText("2")).toHaveStyle({ color: "var(--warning)" });
  });

  it("uses the default badge color when countTint is omitted", () => {
    render(<NavItem href="/trips" label="Trips" icon={Map} count={2} />);
    expect(screen.getByText("2")).toHaveStyle({ color: "var(--fg-3)" });
  });
});

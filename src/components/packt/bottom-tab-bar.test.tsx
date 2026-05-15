// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/trips",
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    className,
    style,
    "aria-label": ariaLabel,
    "aria-current": ariaCurrent,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
    style?: React.CSSProperties;
    "aria-label"?: string;
    "aria-current"?: React.AriaAttributes["aria-current"];
  }) => (
    <a href={href} className={className} style={style} aria-label={ariaLabel} aria-current={ariaCurrent}>
      {children}
    </a>
  ),
}));

import { BottomTabBar } from "./bottom-tab-bar";

describe("BottomTabBar", () => {
  it("renders the Trips tab", () => {
    render(<BottomTabBar />);
    expect(screen.getByText("Trips")).toBeInTheDocument();
  });

  it("marks Trips tab as active when pathname is /trips", () => {
    render(<BottomTabBar />);
    const tripsLink = screen.getByRole("link", { name: /trips/i });
    expect(tripsLink).toHaveAttribute("aria-current", "page");
  });

  it("renders all 4 tabs", () => {
    render(<BottomTabBar />);
    expect(screen.getByText("Trips")).toBeInTheDocument();
    expect(screen.getByText("Search")).toBeInTheDocument();
    expect(screen.getByText("Map")).toBeInTheDocument();
    expect(screen.getByText("Profile")).toBeInTheDocument();
  });
});

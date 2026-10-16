import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { vi } from "vitest";
import { TripDetailCrumb } from "./trip-detail-crumb";

describe("TripDetailCrumb", () => {
  it("renders the trip name", () => {
    render(<TripDetailCrumb tripName="Paris Trip" />);
    expect(screen.getByText("Paris Trip")).toBeInTheDocument();
  });

  it("renders a back link to /trips", () => {
    render(<TripDetailCrumb tripName="Paris Trip" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/trips");
  });
});

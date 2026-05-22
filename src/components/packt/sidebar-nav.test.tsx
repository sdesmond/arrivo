// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { UserProfile } from "@/data/types";

vi.mock("next/navigation", () => ({
  usePathname: () => "/trips",
}));

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

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}));

vi.mock("@/app/(auth)/actions", () => ({
  signOutAction: vi.fn(),
}));

import { SidebarNav } from "./sidebar-nav";

const baseUser: UserProfile = {
  id: "user-1",
  name: "Jane Doe",
  email: "jane@example.com",
  dateFormat: null,
  currency: null,
  distanceUnit: null,
  passportNumber: null,
  passportExpiry: null,
  passportNationality: null,
  knownTravelerNumber: null,
  loyaltyNumbers: [],
  wishlistDestinations: [],
  companions: [],
};

describe("SidebarNav", () => {
  it("renders Trips nav item", () => {
    render(<SidebarNav user={baseUser} />);
    expect(screen.getAllByText("Trips").length).toBeGreaterThanOrEqual(1);
  });

  it("renders Search nav item", () => {
    render(<SidebarNav user={baseUser} />);
    expect(screen.getByText("Search")).toBeInTheDocument();
  });

  it("renders the Packt brand name", () => {
    render(<SidebarNav user={baseUser} />);
    expect(screen.getByText("Packt")).toBeInTheDocument();
  });

  it("renders sign out button", () => {
    render(<SidebarNav user={baseUser} />);
    expect(screen.getByTitle("Sign out")).toBeInTheDocument();
  });

  it("renders user name from UserProfile", () => {
    render(<SidebarNav user={baseUser} />);
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("renders user email from UserProfile", () => {
    render(<SidebarNav user={baseUser} />);
    expect(screen.getAllByText("jane@example.com").length).toBeGreaterThanOrEqual(1);
  });

  it("derives initials from name", () => {
    render(<SidebarNav user={baseUser} />);
    expect(screen.getByText("JD")).toBeInTheDocument();
  });

  it("falls back to email initial when name is null", () => {
    render(<SidebarNav user={{ ...baseUser, name: null }} />);
    expect(screen.getByText("J")).toBeInTheDocument();
  });

  it("derives initials from a single-word name", () => {
    render(<SidebarNav user={{ ...baseUser, name: "Jane" }} />);
    expect(screen.getByText("J")).toBeInTheDocument();
  });

  it("renders placeholder initials and fallback name when user is null", () => {
    render(<SidebarNav user={null} />);
    expect(screen.getByText("?")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("footer user block links to /profile", () => {
    render(<SidebarNav user={baseUser} />);
    const profileLink = screen.getByRole("link", { name: /view profile/i });
    expect(profileLink).toHaveAttribute("href", "/profile");
  });

  it("sign out button is outside the profile link", () => {
    render(<SidebarNav user={baseUser} />);
    const profileLink = screen.getByRole("link", { name: /view profile/i });
    const signOutButton = screen.getByTitle("Sign out");
    expect(profileLink).not.toContainElement(signOutButton);
  });
});

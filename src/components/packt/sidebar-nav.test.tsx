import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserProfile } from "@/data/types";

const { mockSignOutAction, mockClearOfflineDb } = vi.hoisted(() => ({
  mockSignOutAction: vi.fn(),
  mockClearOfflineDb: vi.fn(),
}));

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
  signOutAction: mockSignOutAction,
}));

vi.mock("@/lib/offline/db", () => ({
  clearOfflineDb: mockClearOfflineDb,
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
  beforeEach(() => {
    mockSignOutAction.mockReset();
    mockClearOfflineDb.mockReset();
  });

  it("renders Trips nav item", () => {
    render(<SidebarNav user={baseUser} />);
    expect(screen.getAllByText("Trips").length).toBeGreaterThanOrEqual(1);
  });

  it("renders Search nav item", () => {
    render(<SidebarNav user={baseUser} />);
    expect(screen.getByText("Search")).toBeInTheDocument();
  });

  it("renders Packing Templates nav item linking to /packing", () => {
    render(<SidebarNav user={baseUser} />);
    const link = screen.getByRole("link", { name: "Packing Templates" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/packing");
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

  it("clears the offline mirror for the current user before signing out", async () => {
    const user = userEvent.setup();
    render(<SidebarNav user={baseUser} />);

    await user.click(screen.getByTitle("Sign out"));

    expect(mockClearOfflineDb).toHaveBeenCalledWith("user-1");
    expect(mockSignOutAction).toHaveBeenCalled();
    expect(mockClearOfflineDb.mock.invocationCallOrder[0]).toBeLessThan(mockSignOutAction.mock.invocationCallOrder[0]);
  });

  it("signs out without clearing an offline mirror when there is no current user", async () => {
    const user = userEvent.setup();
    render(<SidebarNav user={null} />);

    await user.click(screen.getByTitle("Sign out"));

    expect(mockClearOfflineDb).not.toHaveBeenCalled();
    expect(mockSignOutAction).toHaveBeenCalled();
  });
});

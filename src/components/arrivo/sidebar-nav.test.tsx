import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { render, screen } from "@testing-library/react";
import type { UserProfile } from "@/data/types";

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}));

beforeEach(() =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ isAdmin: false }))
  )
);
afterEach(() => vi.unstubAllGlobals());

vi.mock("@/app/(auth)/actions", () => ({
  signOutAction: vi.fn(),
}));

import { SidebarNav } from "./sidebar-nav";

const baseUser: UserProfile = {
  id: "user-1",
  name: "Jane Doe",
  username: "jane",
  dateFormat: null,
  currency: null,
  distanceUnit: null,
  passportNumber: null,
  passportExpiry: null,
  passportNationality: null,
  knownTravelerNumber: null,
  warningThreshold: 80,
  dangerThreshold: 90,
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

  it("renders Packing Templates nav item linking to /packing", () => {
    render(<SidebarNav user={baseUser} />);
    const link = screen.getByRole("link", { name: "Packing Templates" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/packing");
  });

  it("renders the Arrivo brand name", () => {
    render(<SidebarNav user={baseUser} />);
    expect(screen.getByText("Arrivo")).toBeInTheDocument();
  });

  it("renders the logo inside the brand link to /trips", () => {
    render(<SidebarNav user={baseUser} />);
    const brandLink = screen.getByText("Arrivo").closest("a");
    expect(brandLink).toHaveAttribute("href", "/trips");
    expect(brandLink?.querySelector("img")).toBeInTheDocument();
  });

  it("opens account menu instead of showing standalone sign out", async () => {
    render(<SidebarNav user={baseUser} />);
    expect(screen.queryByTitle("Sign out")).not.toBeInTheDocument();
    screen.getByRole("button", { name: "Account menu" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("menuitem", { name: "Settings" })).toHaveAttribute("href", "/profile");
  });

  it("renders user name from UserProfile", () => {
    render(<SidebarNav user={baseUser} />);
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("renders the username from UserProfile", () => {
    render(<SidebarNav user={baseUser} />);
    expect(screen.getByText("@jane")).toBeInTheDocument();
  });

  it("derives initials from name", () => {
    render(<SidebarNav user={baseUser} />);
    expect(screen.getByText("JD")).toBeInTheDocument();
  });

  it("falls back to the username for initial and display name when name is null", () => {
    render(<SidebarNav user={{ ...baseUser, name: null }} />);
    expect(screen.getByText("J")).toBeInTheDocument();
    expect(screen.getByText("jane")).toBeInTheDocument();
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

  it("keeps name and username in the account trigger", () => {
    render(<SidebarNav user={baseUser} />);
    const trigger = screen.getByRole("button", { name: "Account menu" });
    expect(trigger).toHaveTextContent("Jane Doe");
    expect(trigger).toHaveTextContent("@jane");
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
  });

  it("shows a pending-invitations badge on the Trips nav item when invitationCount is positive", () => {
    render(<SidebarNav user={baseUser} invitationCount={2} />);
    const tripsLink = screen.getByRole("link", { name: "Trips, 2 pending invitations" });
    expect(tripsLink).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders no badge on the Trips nav item when invitationCount is zero", () => {
    render(<SidebarNav user={baseUser} invitationCount={0} />);
    expect(screen.getByRole("link", { name: "Trips" })).toBeInTheDocument();
  });

  it("renders no badge on the Trips nav item when invitationCount is omitted", () => {
    render(<SidebarNav user={baseUser} />);
    expect(screen.getByRole("link", { name: "Trips" })).toBeInTheDocument();
  });
});

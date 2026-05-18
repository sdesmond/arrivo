// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserProfile } from "@/data/types";

vi.mock("./actions", () => ({
  updateProfile: vi.fn(),
  addLoyaltyNumber: vi.fn(),
  deleteLoyaltyNumber: vi.fn(),
  addWishlistDestination: vi.fn(),
  deleteWishlistDestination: vi.fn(),
  changePassword: vi.fn().mockResolvedValue({ error: null }),
  deleteAccount: vi.fn(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}));

vi.mock("@/components/packt/theme-select", () => ({
  ThemeSelect: () => <div data-testid="theme-select">Theme selector</div>,
}));

import { ProfilePageClient } from "./page-client";

const baseUser: UserProfile = {
  id: "user-1",
  name: "Test User",
  email: "test@example.com",
  dateFormat: "MM/DD/YYYY",
  currency: "USD",
  distanceUnit: "imperial",
  passportNumber: null,
  passportExpiry: null,
  passportNationality: null,
  knownTravelerNumber: null,
  loyaltyNumbers: [],
  wishlistDestinations: [],
};

describe("ProfilePageClient", () => {
  it("shows Identity content by default", () => {
    render(<ProfilePageClient user={baseUser} />);
    expect(screen.getByLabelText("Profile sections")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Test User")).toBeInTheDocument();
  });

  it("renders all five nav items", () => {
    render(<ProfilePageClient user={baseUser} />);
    const nav = screen.getByRole("tablist", { name: "Profile sections" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Identity" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Traveler" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Preferences" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Account" })).toBeInTheDocument();
  });

  it("Identity tab is selected by default", () => {
    render(<ProfilePageClient user={baseUser} />);
    expect(screen.getByRole("tab", { name: "Identity" })).toHaveAttribute("aria-selected", "true");
  });

  it("clicking Traveler tab shows all three sub-sections", async () => {
    const user = userEvent.setup();
    render(<ProfilePageClient user={baseUser} />);
    await user.click(screen.getByRole("tab", { name: "Traveler" }));
    expect(screen.getByText("Loyalty Numbers")).toBeInTheDocument();
    expect(screen.getByText("Passport & Travel Documents")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Test User")).not.toBeInTheDocument();
  });

  it("clicking Preferences tab shows preferences and hides Identity", async () => {
    const user = userEvent.setup();
    render(<ProfilePageClient user={baseUser} />);
    await user.click(screen.getByRole("tab", { name: "Preferences" }));
    expect(screen.getByLabelText("Date format")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Test User")).not.toBeInTheDocument();
  });

  it("clicking Appearance tab shows the theme selector", async () => {
    const user = userEvent.setup();
    render(<ProfilePageClient user={baseUser} />);
    await user.click(screen.getByRole("tab", { name: "Appearance" }));
    expect(screen.getByTestId("theme-select")).toBeInTheDocument();
  });

  it("clicking Account tab shows the password form", async () => {
    const user = userEvent.setup();
    render(<ProfilePageClient user={baseUser} />);
    await user.click(screen.getByRole("tab", { name: "Account" }));
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
  });
});

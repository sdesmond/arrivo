import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollaboratorRole } from "@/data/types";
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

vi.mock("./security-actions", () => ({
  startMfaEnrollment: vi.fn(),
  confirmMfaEnrollment: vi.fn(),
  regenerateRecoveryCodes: vi.fn(),
  disableMfa: vi.fn(),
  signOutEverywhere: vi.fn(),
  removeTrustedDevice: vi.fn(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}));

vi.mock("@/components/arrivo/theme-select", () => ({
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
  warningThreshold: 80,
  dangerThreshold: 90,
  loyaltyNumbers: [],
  wishlistDestinations: [],
  companions: [],
};

const MFA_OFF = { enabled: false, recoveryCodesRemaining: 0 };

describe("ProfilePageClient", () => {
  it("shows Identity content by default", () => {
    render(
      <ProfilePageClient
        user={baseUser}
        mfaStatus={MFA_OFF}
        trustedDevices={[]}
        encryptionConfigured
        sharedOwnedTrips={[]}
      />
    );
    expect(screen.getByLabelText("Profile sections")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Test User")).toBeInTheDocument();
  });

  it("renders all five nav items", () => {
    render(
      <ProfilePageClient
        user={baseUser}
        mfaStatus={MFA_OFF}
        trustedDevices={[]}
        encryptionConfigured
        sharedOwnedTrips={[]}
      />
    );
    const nav = screen.getByRole("tablist", { name: "Profile sections" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Identity" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Traveler" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Preferences" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Security" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Account" })).toBeInTheDocument();
  });

  it("Identity tab is selected by default", () => {
    render(
      <ProfilePageClient
        user={baseUser}
        mfaStatus={MFA_OFF}
        trustedDevices={[]}
        encryptionConfigured
        sharedOwnedTrips={[]}
      />
    );
    expect(screen.getByRole("tab", { name: "Identity" })).toHaveAttribute("aria-selected", "true");
  });

  it("clicking Traveler tab shows all three sub-sections", async () => {
    const user = userEvent.setup();
    render(
      <ProfilePageClient
        user={baseUser}
        mfaStatus={MFA_OFF}
        trustedDevices={[]}
        encryptionConfigured
        sharedOwnedTrips={[]}
      />
    );
    await user.click(screen.getByRole("tab", { name: "Traveler" }));
    expect(screen.getByText("Loyalty Numbers")).toBeInTheDocument();
    expect(screen.getByText("Passport & Travel Documents")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Test User")).not.toBeInTheDocument();
  });

  it("clicking Preferences tab shows preferences and hides Identity", async () => {
    const user = userEvent.setup();
    render(
      <ProfilePageClient
        user={baseUser}
        mfaStatus={MFA_OFF}
        trustedDevices={[]}
        encryptionConfigured
        sharedOwnedTrips={[]}
      />
    );
    await user.click(screen.getByRole("tab", { name: "Preferences" }));
    expect(screen.getByRole("button", { name: "Month/Day" })).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Test User")).not.toBeInTheDocument();
  });

  it("clicking Appearance tab shows the theme selector", async () => {
    const user = userEvent.setup();
    render(
      <ProfilePageClient
        user={baseUser}
        mfaStatus={MFA_OFF}
        trustedDevices={[]}
        encryptionConfigured
        sharedOwnedTrips={[]}
      />
    );
    await user.click(screen.getByRole("tab", { name: "Appearance" }));
    expect(screen.getByTestId("theme-select")).toBeInTheDocument();
  });

  it("clicking Security tab shows two-factor status and the sign-out-everywhere control", async () => {
    const user = userEvent.setup();
    render(
      <ProfilePageClient
        user={baseUser}
        mfaStatus={MFA_OFF}
        trustedDevices={[]}
        encryptionConfigured
        sharedOwnedTrips={[]}
      />
    );
    await user.click(screen.getByRole("tab", { name: "Security" }));
    expect(screen.getByText("Two-factor authentication is off.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign out all devices" })).toBeInTheDocument();
  });

  it("clicking Account tab shows the password form", async () => {
    const user = userEvent.setup();
    render(
      <ProfilePageClient
        user={baseUser}
        mfaStatus={MFA_OFF}
        trustedDevices={[]}
        encryptionConfigured
        sharedOwnedTrips={[]}
      />
    );
    await user.click(screen.getByRole("tab", { name: "Account" }));
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
  });

  it("passes the user's shared trips to the delete-account dialog", async () => {
    const user = userEvent.setup();
    render(
      <ProfilePageClient
        user={baseUser}
        mfaStatus={MFA_OFF}
        trustedDevices={[]}
        encryptionConfigured
        sharedOwnedTrips={[
          {
            tripId: "trip-lisbon",
            name: "Lisbon Escape",
            memberCount: 2,
            collaborators: [{ userId: "user-bo", name: "Bo Nilsen", role: CollaboratorRole.Editor }],
            suggestedHeirUserId: "user-bo",
          },
        ]}
      />
    );
    await user.click(screen.getByRole("tab", { name: "Account" }));
    await user.click(screen.getByRole("button", { name: "Delete account" }));
    expect(await screen.findByRole("combobox", { name: /Lisbon Escape/ })).toHaveTextContent(
      "Transfer to Bo Nilsen · editor"
    );
  });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollaboratorRole, DEFAULT_PASSWORD_POLICY } from "@/data/types";
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
  username: "test",
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
  it("shows the Account section by default, with the profile fields first", () => {
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

  it("renders one Account tab first and no Identity tab", () => {
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
    expect(screen.queryByRole("tab", { name: "Identity" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("tab", { name: "Account" })).toHaveLength(1);
    expect(screen.getAllByRole("tab")[0]).toHaveTextContent("Account");
    expect(screen.getByRole("tab", { name: "Traveler" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Preferences" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Security" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Account" })).toBeInTheDocument();
  });

  it("Account tab is selected by default", () => {
    render(
      <ProfilePageClient
        user={baseUser}
        mfaStatus={MFA_OFF}
        trustedDevices={[]}
        encryptionConfigured
        sharedOwnedTrips={[]}
      />
    );
    expect(screen.getByRole("tab", { name: "Account" })).toHaveAttribute("aria-selected", "true");
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

  it("clicking Preferences tab shows preferences and hides Account", async () => {
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

  it("opens the change-password dialog from the Account section with the rules the page loaded", async () => {
    const user = userEvent.setup();
    render(
      <ProfilePageClient
        user={baseUser}
        mfaStatus={MFA_OFF}
        trustedDevices={[]}
        encryptionConfigured
        sharedOwnedTrips={[]}
        passwordPolicy={{ ...DEFAULT_PASSWORD_POLICY, minNumbers: 1 }}
      />
    );
    expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Password requirements" })).toHaveTextContent("At least 1 number");
  });

  it("says the password rules are unavailable in the dialog when the page could not load them", async () => {
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
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Password rules are unavailable");
  });

  it("keeps the password form out of the Security tab", async () => {
    const user = userEvent.setup();
    render(
      <ProfilePageClient
        user={baseUser}
        mfaStatus={MFA_OFF}
        trustedDevices={[]}
        encryptionConfigured
        sharedOwnedTrips={[]}
        passwordPolicy={DEFAULT_PASSWORD_POLICY}
      />
    );
    await user.click(screen.getByRole("tab", { name: "Security" }));
    expect(screen.queryByRole("button", { name: "Change password" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument();
  });

  it("has one h2 for the Account section", () => {
    render(
      <ProfilePageClient
        user={baseUser}
        mfaStatus={MFA_OFF}
        trustedDevices={[]}
        encryptionConfigured
        sharedOwnedTrips={[]}
        passwordPolicy={DEFAULT_PASSWORD_POLICY}
      />
    );
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["Account"]);
  });

  it("warns before leaving the Account tab only for unsaved name or username input, never for the password dialog", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <ProfilePageClient
        user={baseUser}
        mfaStatus={MFA_OFF}
        trustedDevices={[]}
        encryptionConfigured
        sharedOwnedTrips={[]}
        passwordPolicy={DEFAULT_PASSWORD_POLICY}
      />
    );
    await user.click(screen.getByRole("button", { name: "Change password" }));
    await user.type(screen.getByLabelText(/current password/i), "abc");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("tab", { name: "Security" }));
    expect(confirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole("tab", { name: "Account" }));
    await user.type(screen.getByLabelText("Name"), "x");
    await user.click(screen.getByRole("tab", { name: "Traveler" }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Name")).toHaveValue("Test Userx");
    confirm.mockReturnValue(true);
    await user.click(screen.getByRole("tab", { name: "Traveler" }));
    await user.click(screen.getByRole("tab", { name: "Account" }));
    expect(screen.getByLabelText("Name")).toHaveValue("Test User");
    confirm.mockRestore();
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
    await user.click(screen.getByRole("button", { name: "Delete account" }));
    expect(await screen.findByRole("combobox", { name: /Lisbon Escape/ })).toHaveTextContent(
      "Transfer to Bo Nilsen · editor"
    );
  });
});

it("passes effective MFA requirement through to Security", async () => {
  render(
    <ProfilePageClient
      user={baseUser}
      mfaStatus={{ enabled: true, recoveryCodesRemaining: 10 }}
      trustedDevices={[]}
      encryptionConfigured
      sharedOwnedTrips={[]}
      mfaRequired
    />
  );
  await userEvent.click(screen.getByRole("tab", { name: "Security" }));
  expect(screen.getByRole("button", { name: "Turn off two-factor authentication" })).toBeDisabled();
});

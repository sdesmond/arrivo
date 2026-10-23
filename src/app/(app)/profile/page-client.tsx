"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Section } from "@/components/arrivo/form-section";
import { ThemeSelect } from "@/components/arrivo/theme-select";
import { FontSizeSelect } from "@/components/arrivo/font-size-select";
import { ProfileIdentitySection } from "./identity-section";
import { LoyaltySection } from "./loyalty-section";
import { PassportSection } from "./passport-section";
import { WishlistSection } from "./wishlist-section";
import { CompanionsSection } from "./companions-section";
import { ProfilePreferencesSection } from "./preferences-section";
import { ProfileAccountSection } from "./account-section";
import { ProfileSecuritySection } from "./security-section";
import type { AccountDeletionTrip, MfaStatus, TrustedDeviceSummary, UserProfile, ProfileSection } from "@/data/types";

const NAV_ITEMS: { value: ProfileSection; label: string }[] = [
  { value: "identity", label: "Identity" },
  { value: "traveler", label: "Traveler" },
  { value: "companions", label: "Companions" },
  { value: "preferences", label: "Preferences" },
  { value: "appearance", label: "Appearance" },
  { value: "security", label: "Security" },
  { value: "account", label: "Account" },
];

interface ProfilePageClientProps {
  user: UserProfile;
  mfaStatus: MfaStatus;
  trustedDevices: TrustedDeviceSummary[];
  encryptionConfigured: boolean;
  sharedOwnedTrips: AccountDeletionTrip[];
}

export function ProfilePageClient({
  user,
  mfaStatus,
  trustedDevices,
  encryptionConfigured,
  sharedOwnedTrips,
}: ProfilePageClientProps) {
  const [activeSection, setActiveSection] = useState<ProfileSection>("identity");

  const [dirtyMap, setDirtyMap] = useState<Record<string, boolean>>({});
  const [resetKeys, setResetKeys] = useState<Record<string, number>>({});

  function handleDirtyChange(section: ProfileSection, dirty: boolean) {
    setDirtyMap((prev) => ({ ...prev, [section]: dirty }));
  }

  function handleTabChange(next: string) {
    if (dirtyMap[activeSection]) {
      const confirmed = window.confirm("You have unsaved changes. Leave without saving?");
      if (!confirmed) return;
      setResetKeys((prev) => ({ ...prev, [activeSection]: (prev[activeSection] ?? 0) + 1 }));
      setDirtyMap((prev) => ({ ...prev, [activeSection]: false }));
    }
    setActiveSection(next as ProfileSection);
  }

  return (
    <div className="mx-auto max-w-3xl py-6 sm:py-8">
      <h1
        className="px-4 sm:px-6"
        style={{
          fontFamily: "var(--font-heading-family, ui-sans-serif)",
          fontSize: "calc(22px * var(--font-scale))",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: "var(--fg)",
          marginBottom: 24,
        }}
      >
        Profile &amp; Settings
      </h1>

      <Tabs
        value={activeSection}
        onValueChange={handleTabChange}
        orientation="vertical"
        className="profile-tabs w-full"
      >
        <div className="w-full flex flex-col sm:flex-row sm:items-start sm:gap-8 sm:px-6">
          <TabsList
            variant="line"
            aria-label="Profile sections"
            style={{ height: "auto" }}
            className="w-full overflow-x-auto overflow-y-hidden justify-start pl-4 sm:pl-0 sm:w-40 sm:shrink-0 sm:items-start sm:overflow-x-visible sm:overflow-y-visible sm:rounded-none sm:bg-transparent sm:gap-0 sm:p-0"
          >
            {NAV_ITEMS.map(({ value, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="min-h-[44px] text-fg-2 hover:text-fg data-active:text-fg data-active:bg-surface-2 hover:bg-surface-2 sm:w-full sm:justify-start"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1 min-w-0 mt-4 sm:mt-0 px-4 sm:px-0">
            <TabsContent value="identity" className="w-full">
              <ProfileIdentitySection
                key={resetKeys.identity ?? 0}
                user={user}
                onDirtyChange={(dirty) => handleDirtyChange("identity", dirty)}
              />
            </TabsContent>

            <TabsContent value="traveler" className="w-full">
              <div className="flex flex-col gap-8">
                <LoyaltySection loyaltyNumbers={user.loyaltyNumbers} />
                <PassportSection
                  key={resetKeys.traveler ?? 0}
                  user={user}
                  onDirtyChange={(dirty) => handleDirtyChange("traveler", dirty)}
                />
                <WishlistSection wishlistDestinations={user.wishlistDestinations} />
              </div>
            </TabsContent>

            <TabsContent value="companions" className="w-full">
              <CompanionsSection companions={user.companions} />
            </TabsContent>

            <TabsContent value="preferences" className="w-full">
              <ProfilePreferencesSection
                key={resetKeys.preferences ?? 0}
                user={user}
                onDirtyChange={(dirty) => handleDirtyChange("preferences", dirty)}
              />
            </TabsContent>

            <TabsContent value="appearance" className="w-full">
              <Section>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--fg-2)" }}>Theme</span>
                    <div style={{ width: 130 }}>
                      <ThemeSelect />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: "calc(13px * var(--font-scale))", color: "var(--fg-2)" }}>Font size</span>
                    <div style={{ width: 130 }}>
                      <FontSizeSelect />
                    </div>
                  </div>
                </div>
              </Section>
            </TabsContent>

            <TabsContent value="security" className="w-full">
              <ProfileSecuritySection
                status={mfaStatus}
                devices={trustedDevices}
                encryptionConfigured={encryptionConfigured}
              />
            </TabsContent>

            <TabsContent value="account" className="w-full">
              <ProfileAccountSection
                key={resetKeys.account ?? 0}
                sharedOwnedTrips={sharedOwnedTrips}
                onDirtyChange={(dirty) => handleDirtyChange("account", dirty)}
              />
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </div>
  );
}

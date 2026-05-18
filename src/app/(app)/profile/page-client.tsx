"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Section } from "@/components/packt/form-section";
import { ThemeSelect } from "@/components/packt/theme-select";
import { FontSizeSelect } from "@/components/packt/font-size-select";
import { ProfileIdentitySection } from "./identity-section";
import { LoyaltySection } from "./loyalty-section";
import { PassportSection } from "./passport-section";
import { WishlistSection } from "./wishlist-section";
import { ProfilePreferencesSection } from "./preferences-section";
import { ProfileAccountSection } from "./account-section";
import type { UserProfile, ProfileSection } from "@/data/types";

const NAV_ITEMS: { value: ProfileSection; label: string }[] = [
  { value: "identity", label: "Identity" },
  { value: "traveler", label: "Traveler" },
  { value: "preferences", label: "Preferences" },
  { value: "appearance", label: "Appearance" },
  { value: "account", label: "Account" },
];

interface ProfilePageClientProps {
  user: UserProfile;
}

export function ProfilePageClient({ user }: ProfilePageClientProps) {
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
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1
        style={{
          fontFamily: "var(--font-heading-family, ui-sans-serif)",
          fontSize: 22,
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
        <div className="flex flex-col sm:flex-row items-start sm:gap-8">
          <TabsList
            variant="line"
            aria-label="Profile sections"
            style={{ height: "auto" }}
            className="w-full overflow-x-auto overflow-y-hidden justify-start sm:w-36 sm:shrink-0 sm:items-start sm:overflow-x-visible sm:rounded-none sm:bg-transparent sm:gap-0 sm:p-0"
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

          <div className="flex-1 min-w-0 mt-4 sm:mt-0">
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

            <TabsContent value="preferences" className="w-full">
              <ProfilePreferencesSection
                key={resetKeys.preferences ?? 0}
                user={user}
                onDirtyChange={(dirty) => handleDirtyChange("preferences", dirty)}
              />
            </TabsContent>

            <TabsContent value="appearance" className="w-full">
              <Section>
                <div className="flex items-center justify-between gap-4">
                  <span style={{ fontSize: 13, color: "var(--fg-2)" }}>Theme</span>
                  <ThemeSelect />
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span style={{ fontSize: 13, color: "var(--fg-2)" }}>Font size</span>
                  <FontSizeSelect />
                </div>
              </Section>
            </TabsContent>

            <TabsContent value="account" className="w-full">
              <ProfileAccountSection
                key={resetKeys.account ?? 0}
                onDirtyChange={(dirty) => handleDirtyChange("account", dirty)}
              />
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Section } from "@/components/packt/form-section";
import { ThemeSelect } from "@/components/packt/theme-select";
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
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

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

      <Tabs defaultValue="identity" orientation={isDesktop ? "vertical" : "horizontal"} className="w-full">
        <div className="flex flex-col sm:flex-row items-start sm:gap-8">
          <TabsList
            variant="line"
            aria-label="Profile sections"
            style={{ height: "auto" }}
            className="w-full overflow-x-auto justify-start sm:w-36 sm:shrink-0 sm:items-start sm:overflow-x-visible sm:rounded-none sm:bg-transparent sm:gap-0 sm:p-0"
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
            <TabsContent value="identity">
              <ProfileIdentitySection user={user} />
            </TabsContent>

            <TabsContent value="traveler">
              <div className="flex flex-col gap-8">
                <LoyaltySection loyaltyNumbers={user.loyaltyNumbers} />
                <PassportSection user={user} />
                <WishlistSection wishlistDestinations={user.wishlistDestinations} />
              </div>
            </TabsContent>

            <TabsContent value="preferences">
              <ProfilePreferencesSection user={user} />
            </TabsContent>

            <TabsContent value="appearance">
              <Section title="Appearance">
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: 13, color: "var(--fg-2)" }}>Theme</span>
                  <ThemeSelect />
                </div>
              </Section>
            </TabsContent>

            <TabsContent value="account">
              <ProfileAccountSection />
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </div>
  );
}

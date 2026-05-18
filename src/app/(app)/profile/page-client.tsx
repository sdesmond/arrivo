"use client";

import { Section } from "@/components/packt/form-section";
import { ThemeSelect } from "@/components/packt/theme-select";
import { ProfileIdentitySection } from "./identity-section";
import { LoyaltySection } from "./loyalty-section";
import { PassportSection } from "./passport-section";
import { WishlistSection } from "./wishlist-section";
import { ProfilePreferencesSection } from "./preferences-section";
import { ProfileAccountSection } from "./account-section";
import type { UserProfile } from "@/data/types";

interface ProfilePageClientProps {
  user: UserProfile;
}

export function ProfilePageClient({ user }: ProfilePageClientProps) {
  return (
    <div className="max-w-lg mx-auto px-4 py-8 flex flex-col gap-8">
      <div>
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

        <div className="flex flex-col gap-8">
          <ProfileIdentitySection user={user} />
          <LoyaltySection loyaltyNumbers={user.loyaltyNumbers} />
          <PassportSection user={user} />
          <WishlistSection wishlistDestinations={user.wishlistDestinations} />
          <ProfilePreferencesSection user={user} />

          <Section title="Appearance">
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 13, color: "var(--fg-2)" }}>Theme</span>
              <ThemeSelect />
            </div>
          </Section>

          <ProfileAccountSection />
        </div>
      </div>
    </div>
  );
}

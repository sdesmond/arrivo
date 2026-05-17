"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Search, Clock, LogOut } from "lucide-react";
import { signOutAction } from "@/app/(auth)/actions";
import { getAvatarTint } from "@/lib/trip-tints";
import { NavItem } from "./nav-item";
import { SectionHeading } from "./section-heading";
import type { UserProfile } from "@/data/types";

const NAV_ITEMS = [
  { id: "trips", label: "Trips", icon: Briefcase, href: "/trips", count: 4 },
  { id: "search", label: "Search", icon: Search, href: "/search" },
  { id: "travel-history", label: "Travel History", icon: Clock, href: "/travel-history" },
];

const PINNED = [
  { name: "Tokyo", hue: 8, meta: "D5" },
  { name: "Lisbon", hue: 78, meta: "21d" },
  { name: "Oaxaca", hue: 45, meta: "92d" },
];

function getInitials(user: UserProfile): string {
  if (user.name) {
    const parts = user.name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0][0].toUpperCase();
  }
  return user.email[0].toUpperCase();
}

export interface SidebarNavProps {
  user: UserProfile | null;
}

export function SidebarNav({ user }: SidebarNavProps) {
  const pathname = usePathname();
  const initials = user ? getInitials(user) : "?";
  const avatarTint = getAvatarTint(initials);

  return (
    <aside
      className="flex flex-col w-[240px] shrink-0 border-r scroll-thin overflow-y-auto"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
      role="navigation"
      aria-label="Main navigation"
    >
      {/* Brand row */}
      <div
        className="flex items-center gap-2 px-4 py-4"
        style={{
          fontFamily: "var(--font-heading-family, ui-sans-serif)",
          fontWeight: 700,
          fontSize: 16,
          letterSpacing: "-0.02em",
        }}
      >
        <span
          className="relative grid place-items-center rounded-[5px]"
          style={{ width: 18, height: 18, background: "var(--fg)" }}
        >
          <span
            className="absolute"
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: "var(--accent-brand)",
              transform: "rotate(45deg)",
            }}
          />
        </span>
        Packt
      </div>

      {/* Workspace */}
      <div className="px-2 pb-1">
        <SectionHeading>Workspace</SectionHeading>
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            href={item.href}
            count={item.count}
            active={pathname === item.href || (item.href === "/trips" && pathname.startsWith("/trips"))}
          />
        ))}
      </div>

      {/* Pinned trips */}
      <div className="px-2 pb-1">
        <SectionHeading>Pinned trips</SectionHeading>
        {PINNED.map((trip) => (
          <Link
            key={trip.name}
            href={`/trips`}
            className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-[6px] text-[13px] font-medium text-fg-2 hover:bg-surface-2 transition-colors"
          >
            <span
              className="shrink-0 rounded-[3px]"
              style={{
                width: 14,
                height: 14,
                background: `oklch(0.85 0.06 ${trip.hue})`,
              }}
            />
            <span className="text-fg">{trip.name}</span>
            <span
              className="ml-auto"
              style={{
                fontFamily: "var(--font-mono-family, ui-monospace)",
                fontSize: "10.5px",
                fontWeight: 500,
                letterSpacing: "0.04em",
                color: "var(--fg-3)",
              }}
            >
              {trip.meta}
            </span>
          </Link>
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Footer */}
      <div className="flex items-center gap-2 px-3 py-3" style={{ borderTop: "1px solid var(--line)" }}>
        <Link
          href="/profile"
          className="flex items-center gap-2 flex-1 min-w-0 rounded-[6px] hover:bg-surface-2 transition-colors px-1 py-0.5"
          aria-label="View profile"
        >
          <div
            className="shrink-0 rounded-full flex items-center justify-center font-semibold text-[12px]"
            style={{
              width: 28,
              height: 28,
              background: avatarTint.bg,
              color: avatarTint.color,
              fontFamily: "var(--font-body, ui-sans-serif)",
            }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium text-fg truncate">{user?.name ?? user?.email ?? "—"}</div>
            <div className="text-[11px] text-fg-3 truncate">{user?.email ?? ""}</div>
          </div>
        </Link>
        <form action={signOutAction}>
          <button
            type="submit"
            className="shrink-0 p-1 rounded-[6px] text-fg-3 hover:text-fg hover:bg-surface-2 transition-colors"
            title="Sign out"
          >
            <LogOut size={14} strokeWidth={1.5} />
          </button>
        </form>
      </div>
    </aside>
  );
}

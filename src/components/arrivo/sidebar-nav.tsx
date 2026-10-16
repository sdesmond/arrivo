"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Search, Clock, LogOut, LayoutTemplate } from "lucide-react";
import { signOutAction } from "@/app/(auth)/actions";
import { getAvatarTint } from "@/lib/trip-tints";
import { NavItem } from "./nav-item";
import type { UserProfile } from "@/data/types";

const NAV_ITEMS = [
  { id: "trips", label: "Trips", icon: Briefcase, href: "/trips" },
  { id: "templates", label: "Packing Templates", icon: LayoutTemplate, href: "/packing" },
  { id: "search", label: "Search", icon: Search, href: "/search" },
  { id: "travel-history", label: "Travel History", icon: Clock, href: "/travel-history" },
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
  invitationCount?: number;
}

export function SidebarNav({ user, invitationCount }: SidebarNavProps) {
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
      <Link
        href="/trips"
        className="flex items-center gap-2 px-4 py-4"
        style={{
          fontFamily: "var(--font-heading-family, ui-sans-serif)",
          fontWeight: 700,
          fontSize: "calc(16px * var(--font-scale))",
          letterSpacing: "-0.02em",
          textDecoration: "none",
          color: "inherit",
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
        Arrivo
      </Link>

      {/* Nav items */}
      <div className="px-2 pb-1">
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            href={item.href}
            count={item.id === "trips" ? invitationCount : undefined}
            countLabel="pending invitations"
            countTint={item.id === "trips" && invitationCount ? "warning" : undefined}
            active={
              pathname === item.href ||
              (item.href === "/trips" && pathname.startsWith("/trips")) ||
              (item.href === "/packing" && (pathname === "/packing" || pathname.startsWith("/packing/")))
            }
          />
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
            className="shrink-0 rounded-full flex items-center justify-center font-semibold"
            style={{
              width: 28,
              height: 28,
              background: avatarTint.bg,
              color: avatarTint.color,
              fontFamily: "var(--font-body, ui-sans-serif)",
              fontSize: "calc(12px * var(--font-scale))",
            }}
          >
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium text-fg truncate" style={{ fontSize: "calc(13px * var(--font-scale))" }}>
              {user?.name ?? user?.email ?? "—"}
            </div>
            <div className="text-fg-3 truncate" style={{ fontSize: "calc(11px * var(--font-scale))" }}>
              {user?.email ?? ""}
            </div>
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

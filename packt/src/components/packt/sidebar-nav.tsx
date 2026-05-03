"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase, Search, Map, Globe, User, Settings, MoreHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TRIP_TINTS } from "@/data/trips";
import { getAvatarTint } from "@/lib/trip-tints";

const NAV_ITEMS = [
  { id: "trips",  label: "Trips",     icon: Briefcase, href: "/trips",     count: 4 },
  { id: "search", label: "Search",    icon: Search,    href: "/search" },
  { id: "map",    label: "Map",       icon: Map,       href: "/map" },
  { id: "world",  label: "World map", icon: Globe,     href: "/world" },
];

const ACCOUNT_ITEMS = [
  { id: "profile",  label: "Profile",  icon: User,     href: "/profile" },
  { id: "settings", label: "Settings", icon: Settings, href: "/settings" },
];

const PINNED = [
  { name: "Tokyo",    hue: 8,  meta: "D5"  },
  { name: "Lisbon",   hue: 78, meta: "21d" },
  { name: "Oaxaca",   hue: 45, meta: "92d" },
];

interface NavItemProps {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  href: string;
  count?: number;
  active?: boolean;
}

function NavItem({ icon: Icon, label, href, count, active }: NavItemProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 px-2.5 py-1.5 rounded-[6px] text-[13px] font-medium transition-colors",
        "hover:bg-surface",
        active
          ? "bg-surface-2 text-fg"
          : "text-fg-2"
      )}
    >
      <Icon
        size={16}
        strokeWidth={1.5}
        className={cn("shrink-0", active ? "text-accent-brand" : "text-fg-3")}
      />
      <span>{label}</span>
      {count != null && (
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
          {count}
        </span>
      )}
    </Link>
  );
}

export function SidebarNav() {
  const pathname = usePathname();
  const avatarTint = getAvatarTint("MR");

  return (
    <aside
      className="flex flex-col w-[240px] shrink-0 border-r scroll-thin overflow-y-auto"
      style={{ borderColor: "var(--line)", background: "var(--surface)" }}
    >
      {/* Brand row */}
      <div
        className="flex items-center gap-2 px-4 py-4"
        style={{ fontFamily: "var(--font-heading-family, ui-sans-serif)", fontWeight: 700, fontSize: 16, letterSpacing: "-0.02em" }}
      >
        <span
          className="relative grid place-items-center rounded-[5px]"
          style={{ width: 18, height: 18, background: "var(--fg)" }}
        >
          <span
            className="absolute"
            style={{
              width: 8, height: 8, borderRadius: 2,
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
                width: 14, height: 14,
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

      {/* Account */}
      <div className="px-2 pb-1">
        <SectionHeading>Account</SectionHeading>
        {ACCOUNT_ITEMS.map((item) => (
          <NavItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            href={item.href}
            active={pathname === item.href}
          />
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Footer */}
      <div
        className="flex items-center gap-2 px-3 py-3"
        style={{ borderTop: "1px solid var(--line)" }}
      >
        <div
          className="shrink-0 rounded-full flex items-center justify-center font-semibold text-[12px]"
          style={{
            width: 28, height: 28,
            background: avatarTint.bg,
            color: avatarTint.color,
            fontFamily: "var(--font-body, ui-sans-serif)",
          }}
        >
          MR
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-fg truncate">Maya R.</div>
          <div className="text-[11px] text-fg-3 truncate">maya@packt.local</div>
        </div>
        <button
          className="shrink-0 p-1 rounded-[6px] text-fg-3 hover:text-fg hover:bg-surface-2 transition-colors"
          title="More options"
        >
          <MoreHorizontal size={14} strokeWidth={1.5} />
        </button>
      </div>
    </aside>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-2.5 pb-1 pt-3"
      style={{
        fontFamily: "var(--font-mono-family, ui-monospace)",
        fontSize: "10.5px",
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "var(--fg-4)",
      }}
    >
      {children}
    </div>
  );
}

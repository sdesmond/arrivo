"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Search, Map, User } from "lucide-react";

const TABS = [
  { id: "trips", label: "Trips", icon: Briefcase, href: "/trips" },
  { id: "search", label: "Search", icon: Search, href: "/search" },
  { id: "map", label: "Map", icon: Map, href: "/map" },
  { id: "profile", label: "Profile", icon: User, href: "/profile" },
];

export function BottomTabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex lg:hidden"
      aria-label="Mobile navigation"
      style={{
        height: 56,
        background: "var(--surface)",
        borderTop: "1px solid var(--line)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {TABS.map((tab) => {
        const active = tab.href === "/trips" ? pathname.startsWith("/trips") : pathname === tab.href;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition-colors"
            style={{ color: active ? "var(--accent-brand)" : "var(--fg-3)" }}
            aria-current={active ? "page" : undefined}
            aria-label={tab.label}
          >
            <Icon
              size={20}
              strokeWidth={1.5}
              style={{ color: active ? "var(--accent-brand)" : "var(--fg-3)" }}
              aria-hidden
            />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

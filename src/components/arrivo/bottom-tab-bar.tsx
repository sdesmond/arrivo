"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountMenu } from "./account-menu";
import { Briefcase, Search, Map, Clock, User } from "lucide-react";

const TABS = [
  { id: "trips", label: "Trips", icon: Briefcase, href: "/trips" },
  { id: "history", label: "History", icon: Clock, href: "/travel-history" },
  { id: "search", label: "Search", icon: Search, href: "/search" },
  { id: "map", label: "Map", icon: Map, href: "/map" },
  { id: "profile", label: "Profile", icon: User, href: "/profile" },
];

export interface BottomTabBarProps {
  isAdmin?: boolean;
}

export function BottomTabBar({ isAdmin = false }: BottomTabBarProps) {
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
        if (tab.id === "profile") {
          return (
            <AccountMenu
              key={tab.id}
              isAdmin={isAdmin}
              side="top"
              trigger={
                <button
                  type="button"
                  aria-label="Profile"
                  aria-current={active ? "page" : undefined}
                  className="flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 font-medium text-fg-3"
                  style={{
                    color: active ? "var(--accent-brand)" : "var(--fg-3)",
                    fontSize: "calc(10.5px * var(--font-scale))",
                  }}
                >
                  <Icon size={20} strokeWidth={1.5} aria-hidden />
                  {tab.label}
                </button>
              }
            />
          );
        }
        return (
          <Link
            key={tab.id}
            href={tab.href}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 font-medium transition-colors"
            style={{
              color: active ? "var(--accent-brand)" : "var(--fg-3)",
              fontSize: "calc(10.5px * var(--font-scale))",
            }}
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

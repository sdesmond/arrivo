"use client";

import { Search, Bell, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/packt/theme-toggle";
import { pluralize } from "@/lib/utils";

interface TopbarProps {
  tripCount: number;
  pastCount: number;
  now: Date;
  onNewTrip: () => void;
}

export function Topbar({ tripCount, pastCount, now, onNewTrip }: TopbarProps) {
  const todayFormatted = now
    .toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    })
    .replace(/\//g, ".");

  return (
    <div className="flex items-center gap-3 px-6 py-4" style={{ borderBottom: "1px solid var(--line)" }}>
      <div>
        <div
          style={{
            fontFamily: "var(--font-heading-family, ui-sans-serif)",
            fontSize: "calc(16px * var(--font-scale))",
            fontWeight: 600,
            letterSpacing: "-0.01em",
            color: "var(--fg)",
          }}
        >
          My trips
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono-family, ui-monospace)",
            fontSize: "calc(10.5px * var(--font-scale))",
            color: "var(--fg-3)",
            letterSpacing: "0.04em",
            marginTop: 2,
          }}
        >
          {todayFormatted} · {pluralize(tripCount, "trip")} · {pastCount} past
        </div>
      </div>

      <span className="flex-1" />

      <div className="relative w-[280px] hidden md:block">
        <Search
          size={14}
          strokeWidth={1.5}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "var(--fg-3)" }}
        />
        <Input
          placeholder="Search trips, places, docs…"
          className="pl-8"
          style={{ height: 34, fontSize: "calc(13px * var(--font-scale))" }}
        />
      </div>

      <ThemeToggle />

      <Button variant="outline" size="icon-sm" title="Notifications">
        <Bell size={14} strokeWidth={1.5} />
      </Button>
      <Button size="sm" onClick={onNewTrip}>
        <Plus size={14} strokeWidth={1.5} />
        New trip
      </Button>
    </div>
  );
}

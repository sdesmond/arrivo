"use client";

import { useEffect } from "react";
import { Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MobileActiveTab,
  MobileUpcomingTab,
  MobilePastTab,
  MobileUnscheduledTab,
} from "@/components/packt/trips-mobile-tabs";
import { type Trip, type TripListEntry } from "@/data/types";
import { type MobileTab } from "@/app/(app)/trips/use-trips-page-handlers";

interface TripsMobileLayoutProps {
  activeEntry: TripListEntry | null;
  upcomingTrips: Trip[];
  pastTrips: Trip[];
  unscheduledEntries: TripListEntry[];
  now: Date;
  dateFormat: string;
  mobileTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  onNewTrip: () => void;
}

export function TripsMobileLayout({
  activeEntry,
  upcomingTrips,
  pastTrips,
  unscheduledEntries,
  now,
  dateFormat,
  mobileTab,
  onTabChange,
  onNewTrip,
}: TripsMobileLayoutProps) {
  const tabs: MobileTab[] = [
    ...(unscheduledEntries.length > 0 ? (["Unscheduled"] as const) : []),
    "Active" as const,
    "Upcoming" as const,
    "Past" as const,
  ].filter((tab) => tab !== "Active" || activeEntry !== null);

  const unscheduledVisible = unscheduledEntries.length > 0;
  const activeVisible = activeEntry !== null;
  useEffect(() => {
    if (mobileTab === "Unscheduled" && !unscheduledVisible) {
      onTabChange(activeVisible ? "Active" : "Upcoming");
    }
  }, [mobileTab, unscheduledVisible, activeVisible, onTabChange]);

  return (
    <div className="flex flex-col lg:hidden min-h-screen">
      <div className="px-4 pt-12 pb-3" style={{ borderBottom: "1px solid var(--line)" }}>
        <div className="flex items-end justify-between">
          <div>
            <h1
              style={{
                fontFamily: "var(--font-heading-family, ui-sans-serif)",
                fontSize: "calc(26px * var(--font-scale))",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "var(--fg)",
              }}
            >
              Trips
            </h1>
            <div
              style={{
                fontFamily: "var(--font-mono-family, ui-monospace)",
                fontSize: "calc(10.5px * var(--font-scale))",
                color: "var(--fg-3)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                marginTop: 4,
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--accent-brand)",
                  marginRight: 6,
                  verticalAlign: "middle",
                }}
              />
              Synced offline ·{" "}
              {unscheduledEntries.length + (activeEntry ? 1 : 0) + upcomingTrips.length + pastTrips.length} trips
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" title="Search trips" style={{ minHeight: 44, minWidth: 44 }}>
              <Search size={15} strokeWidth={1.5} />
            </Button>
            <Button size="icon-sm" title="New trip" style={{ minHeight: 44, minWidth: 44 }} onClick={onNewTrip}>
              <Plus size={15} strokeWidth={1.5} />
            </Button>
          </div>
        </div>

        <div className="flex gap-0 mt-4" style={{ borderBottom: "2px solid var(--line)" }}>
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              className="px-4 py-2 font-medium transition-colors"
              style={{
                fontSize: "calc(13px * var(--font-scale))",
                minHeight: 44,
                color: mobileTab === tab ? "var(--accent-brand)" : "var(--fg-3)",
                borderBottom: mobileTab === tab ? "2px solid var(--accent-brand)" : "2px solid transparent",
                marginBottom: -2,
                background: "transparent",
                cursor: "pointer",
                paddingBottom: 8,
              }}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scroll-thin p-4">
        {mobileTab === "Unscheduled" && (
          <MobileUnscheduledTab trips={unscheduledEntries.map((e) => e.trip)} dateFormat={dateFormat} />
        )}
        {mobileTab === "Active" && (
          <MobileActiveTab trip={activeEntry?.trip ?? null} todayEvents={activeEntry?.todayEvents ?? []} now={now} />
        )}
        {mobileTab === "Upcoming" && <MobileUpcomingTab trips={upcomingTrips} now={now} dateFormat={dateFormat} />}
        {mobileTab === "Past" && <MobilePastTab trips={pastTrips} dateFormat={dateFormat} />}
      </div>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { ArrowUpDown, Filter, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NowCard } from "@/components/packt/now-card";
import { DayRibbon } from "@/components/packt/day-ribbon";
import { TripCard } from "@/components/packt/trip-card";
import { NewTripCard } from "@/components/packt/new-trip-card";
import { NewTripDialog } from "@/components/packt/new-trip-dialog";
import { TripEditSheet } from "@/components/packt/trip-edit-sheet";
import { Topbar } from "@/components/packt/trips-topbar";
import { SectionHead } from "@/components/packt/trips-section-head";
import { PastTripsList } from "@/components/packt/trips-past-list";
import { MobileActiveTab, MobileUpcomingTab, MobilePastTab } from "@/components/packt/trips-mobile-tabs";
import { type TripListEntry, type UpdateTripPatch } from "@/data/types";
import { getTripStatus } from "@/lib/utils";
import { updateTripMetadata } from "./actions";

type MobileTab = "Active" | "Upcoming" | "Past";

interface TripsPageClientProps {
  initialEntries: TripListEntry[];
  nowISO: string;
  dateFormat: string;
}

export function TripsPageClient({ initialEntries, nowISO, dateFormat }: TripsPageClientProps) {
  const now = new Date(nowISO);
  const [editingTrip, setEditingTrip] = useState<string | null>(null);
  const [newTripOpen, setNewTripOpen] = useState(false);

  const activeEntries = initialEntries.filter((e) => getTripStatus(e.trip.startDate, e.trip.endDate, now) === "active");
  const upcomingEntries = initialEntries.filter(
    (e) => getTripStatus(e.trip.startDate, e.trip.endDate, now) === "upcoming"
  );
  const pastEntries = initialEntries.filter((e) => getTripStatus(e.trip.startDate, e.trip.endDate, now) === "past");

  const activeEntry = activeEntries[0] ?? null;
  const upcomingTrips = upcomingEntries.map((e) => e.trip);
  const pastTrips = pastEntries.map((e) => e.trip);

  const [mobileTab, setMobileTab] = useState<MobileTab>(activeEntry !== null ? "Active" : "Upcoming");

  const nextInDays =
    upcomingTrips.length > 0
      ? Math.min(
          ...upcomingTrips.map((trip) => {
            const today = new Date(now);
            today.setHours(0, 0, 0, 0);
            return Math.ceil(
              (new Date(trip.startDate + "T00:00:00").getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
            );
          })
        )
      : null;

  function handleTripSave(tripId: string, patch: UpdateTripPatch) {
    React.startTransition(() => {
      updateTripMetadata(tripId, patch);
    });
    setEditingTrip(null);
  }

  const editingEntry = editingTrip ? (initialEntries.find((e) => e.trip.id === editingTrip) ?? null) : null;

  return (
    <>
      {/* ── Desktop layout ── */}
      <div className="hidden lg:flex lg:flex-col h-full">
        <Topbar
          tripCount={activeEntries.length + upcomingEntries.length}
          pastCount={pastEntries.length}
          now={now}
          onNewTrip={() => setNewTripOpen(true)}
        />
        <div className="flex-1 overflow-y-auto scroll-thin">
          <div className="p-6 flex flex-col gap-6 max-w-[1200px]">
            {activeEntry !== null && (
              <>
                <NowCard
                  trip={activeEntry.trip}
                  todayEvents={activeEntry.todayEvents}
                  onEditTrip={(t) => setEditingTrip(t.id)}
                  dateFormat={dateFormat}
                />
                <DayRibbon trip={activeEntry.trip} todayEvents={activeEntry.todayEvents} />
              </>
            )}

            {/* Upcoming */}
            <div>
              <SectionHead
                title="Upcoming"
                count={`${upcomingTrips.length} TRIP${upcomingTrips.length !== 1 ? "S" : ""}${nextInDays != null ? ` · NEXT IN ${nextInDays} DAYS` : ""}`}
              >
                <div className="seg">
                  <button className="seg-item active">Cards</button>
                  <button className="seg-item">List</button>
                </div>
                <Button variant="ghost" size="sm">
                  <ArrowUpDown size={13} strokeWidth={1.5} />
                  Date
                </Button>
              </SectionHead>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {upcomingTrips.map((trip) => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    onEditTrip={(t) => setEditingTrip(t.id)}
                    dateFormat={dateFormat}
                  />
                ))}
                <NewTripCard onNewTrip={() => setNewTripOpen(true)} />
              </div>
            </div>

            {/* Past trips */}
            <div>
              <SectionHead title="Past trips" count={`${pastTrips.length} OF ${pastTrips.length}`}>
                <Button variant="ghost" size="sm">
                  <Filter size={13} strokeWidth={1.5} />
                  Filter
                </Button>
              </SectionHead>
              <PastTripsList trips={pastTrips} dateFormat={dateFormat} onEditTrip={(t) => setEditingTrip(t.id)} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Mobile layout ── */}
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
                Synced offline · {initialEntries.length} trips
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon-sm" title="Search trips" style={{ minHeight: 44, minWidth: 44 }}>
                <Search size={15} strokeWidth={1.5} />
              </Button>
              <Button
                size="icon-sm"
                title="New trip"
                style={{ minHeight: 44, minWidth: 44 }}
                onClick={() => setNewTripOpen(true)}
              >
                <Plus size={15} strokeWidth={1.5} />
              </Button>
            </div>
          </div>

          <div className="flex gap-0 mt-4" style={{ borderBottom: "2px solid var(--line)" }}>
            {(["Active", "Upcoming", "Past"] as MobileTab[])
              .filter((tab) => tab !== "Active" || activeEntry !== null)
              .map((tab) => (
                <button
                  key={tab}
                  onClick={() => setMobileTab(tab)}
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
          {mobileTab === "Active" && (
            <MobileActiveTab trip={activeEntry?.trip ?? null} todayEvents={activeEntry?.todayEvents ?? []} now={now} />
          )}
          {mobileTab === "Upcoming" && <MobileUpcomingTab trips={upcomingTrips} now={now} dateFormat={dateFormat} />}
          {mobileTab === "Past" && <MobilePastTab trips={pastTrips} dateFormat={dateFormat} />}
        </div>
      </div>

      <TripEditSheet
        key={editingTrip ?? "none"}
        trip={editingEntry?.trip ?? null}
        open={editingTrip !== null}
        onClose={() => setEditingTrip(null)}
        onSave={(patch) => editingTrip && handleTripSave(editingTrip, patch)}
      />
      <NewTripDialog open={newTripOpen} onOpenChange={setNewTripOpen} />
    </>
  );
}

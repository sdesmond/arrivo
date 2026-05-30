"use client";

import { ArrowUpDown, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NowCard } from "@/components/packt/now-card";
import { DayRibbon } from "@/components/packt/day-ribbon";
import { TripCard } from "@/components/packt/trip-card";
import { NewTripCard } from "@/components/packt/new-trip-card";
import { Topbar } from "@/components/packt/trips-topbar";
import { SectionHead } from "@/components/packt/trips-section-head";
import { PastTripsList } from "@/components/packt/trips-past-list";
import { UnscheduledSection } from "@/components/packt/unscheduled-section";
import { pluralize } from "@/lib/utils";
import { type Trip, type TripListEntry } from "@/data/types";

interface TripsDesktopLayoutProps {
  activeEntry: TripListEntry | null;
  upcomingTrips: Trip[];
  pastTrips: Trip[];
  unscheduledEntries: TripListEntry[];
  now: Date;
  dateFormat: string;
  nextInDays: number | null;
  onNewTrip: () => void;
  onEditTrip: (tripId: string) => void;
  onDeleteTrip: (trip: Trip) => void;
}

export function TripsDesktopLayout({
  activeEntry,
  upcomingTrips,
  pastTrips,
  unscheduledEntries,
  now,
  dateFormat,
  nextInDays,
  onNewTrip,
  onEditTrip,
  onDeleteTrip,
}: TripsDesktopLayoutProps) {
  return (
    <div className="hidden lg:flex lg:flex-col h-full">
      <Topbar
        tripCount={unscheduledEntries.length + (activeEntry ? 1 : 0) + upcomingTrips.length}
        pastCount={pastTrips.length}
        now={now}
        onNewTrip={onNewTrip}
      />
      <div className="flex-1 overflow-y-auto scroll-thin">
        <div className="p-6 flex flex-col gap-6 max-w-[1200px]">
          {activeEntry !== null && (
            <>
              <NowCard
                trip={activeEntry.trip}
                todayEvents={activeEntry.todayEvents}
                onEditTrip={(t) => onEditTrip(t.id)}
                onDeleteTrip={onDeleteTrip}
                dateFormat={dateFormat}
              />
              <DayRibbon trip={activeEntry.trip} todayEvents={activeEntry.todayEvents} />
            </>
          )}

          {/* Unscheduled */}
          <UnscheduledSection
            trips={unscheduledEntries.map((e) => e.trip)}
            onEditTrip={(t) => onEditTrip(t.id)}
            onDeleteTrip={onDeleteTrip}
            dateFormat={dateFormat}
          />

          {/* Upcoming */}
          <div>
            <SectionHead
              title="Upcoming"
              count={`${pluralize(upcomingTrips.length, "TRIP")}${nextInDays != null ? ` · NEXT IN ${pluralize(nextInDays, "DAY")}` : ""}`}
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
                  onEditTrip={(t) => onEditTrip(t.id)}
                  onDeleteTrip={onDeleteTrip}
                  dateFormat={dateFormat}
                />
              ))}
              <NewTripCard onNewTrip={onNewTrip} />
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
            <PastTripsList
              trips={pastTrips}
              dateFormat={dateFormat}
              onEditTrip={(t) => onEditTrip(t.id)}
              onDeleteTrip={onDeleteTrip}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

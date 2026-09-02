"use client";

import { useState } from "react";
import Link from "next/link";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { TripsActiveEntryPanel } from "@/components/packt/trips-active-entry-panel";
import { TripCard } from "@/components/packt/trip-card";
import { TripCover } from "@/components/packt/trip-cover";
import { NewTripCard } from "@/components/packt/new-trip-card";
import { Topbar } from "@/components/packt/trips-topbar";
import { SectionHead } from "@/components/packt/trips-section-head";
import { UnscheduledSection } from "@/components/packt/unscheduled-section";
import { formatDate, getDisplayedTripDays } from "@/lib/utils";
import { CollaboratorRole, type Trip, type TripListEntry } from "@/data/types";

type ViewMode = "cards" | "list";

const VIEW_MODE_KEY = "trips-view-mode";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

interface TripsDesktopLayoutProps {
  activeEntry: TripListEntry | null;
  upcomingTrips: Trip[];
  unscheduledEntries: TripListEntry[];
  dateFormat: string;
  initialViewMode?: ViewMode;
  onNewTrip: () => void;
  onEditTrip: (tripId: string) => void;
  onDeleteTrip: (trip: Trip) => void;
}

export function TripsDesktopLayout({
  activeEntry,
  upcomingTrips,
  unscheduledEntries,
  dateFormat,
  initialViewMode = "cards",
  onNewTrip,
  onEditTrip,
  onDeleteTrip,
}: TripsDesktopLayoutProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(initialViewMode);

  function handleViewMode(mode: ViewMode) {
    setViewMode(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
      document.cookie = `${VIEW_MODE_KEY}=${mode}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
    } catch {
      // storage unavailable
    }
  }

  return (
    <div className="hidden lg:flex lg:flex-col h-full">
      <Topbar onNewTrip={onNewTrip} />
      <div className="flex-1 overflow-y-auto scroll-thin">
        <div className="p-6 flex flex-col gap-6 max-w-[1200px]">
          {activeEntry !== null && (
            <TripsActiveEntryPanel
              activeEntry={activeEntry}
              dateFormat={dateFormat}
              onEditTrip={onEditTrip}
              onDeleteTrip={onDeleteTrip}
            />
          )}

          {/* Master view toggle */}
          <div className="flex items-center justify-end">
            <div className="seg">
              <button
                className={viewMode === "cards" ? "seg-item active" : "seg-item"}
                onClick={() => handleViewMode("cards")}
              >
                Cards
              </button>
              <button
                className={viewMode === "list" ? "seg-item active" : "seg-item"}
                onClick={() => handleViewMode("list")}
              >
                List
              </button>
            </div>
          </div>

          {/* Unscheduled */}
          <UnscheduledSection
            trips={unscheduledEntries.map((entry) => entry.trip)}
            onEditTrip={(trip) => onEditTrip(trip.id)}
            onDeleteTrip={onDeleteTrip}
            dateFormat={dateFormat}
            viewMode={viewMode}
          />

          {/* Upcoming */}
          <div>
            <SectionHead title="Upcoming" />
            {viewMode === "cards" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {upcomingTrips.map((trip) => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    onEditTrip={(trip) => onEditTrip(trip.id)}
                    onDeleteTrip={onDeleteTrip}
                    dateFormat={dateFormat}
                  />
                ))}
                <NewTripCard onNewTrip={onNewTrip} />
              </div>
            ) : (
              <div className="rounded-[14px] overflow-hidden" style={{ border: "1px solid var(--line)" }}>
                {upcomingTrips.map((trip, i) => (
                  <Link
                    key={trip.id}
                    href={`/trips/${trip.id}`}
                    className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface"
                    style={{ borderTop: i > 0 ? "1px solid var(--line)" : undefined }}
                  >
                    <TripCover
                      name={trip.name}
                      showCity={false}
                      style={{ width: 52, height: 40, borderRadius: 6, flexShrink: 0 }}
                      coverImageUrl={trip.coverImageUrl}
                    />
                    <div className="flex-1 min-w-0">
                      <div style={{ fontSize: "calc(14px * var(--font-scale))", fontWeight: 500, color: "var(--fg)" }}>
                        {trip.name}
                      </div>
                    </div>
                    <span
                      style={{
                        fontSize: "calc(12.5px * var(--font-scale))",
                        color: "var(--fg-3)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {trip.startDate ? formatDate(trip.startDate, dateFormat) : "No dates"}
                    </span>
                    <span
                      style={{
                        fontFamily: "var(--font-mono-family, ui-monospace)",
                        fontSize: "calc(10.5px * var(--font-scale))",
                        color: "var(--fg-4)",
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        width: 52,
                        textAlign: "right",
                      }}
                    >
                      {getDisplayedTripDays(trip)} DAYS
                    </span>
                    <Badge variant="outline">Upcoming</Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        title="Trip options"
                        className="p-1 rounded-[6px] text-fg-4 hover:text-fg hover:bg-surface-2 transition-colors"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                      >
                        <MoreHorizontal size={14} strokeWidth={1.5} />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent side="bottom" align="end">
                        {trip.accessRole !== CollaboratorRole.Viewer ? (
                          <DropdownMenuItem
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              onEditTrip(trip.id);
                            }}
                          >
                            <Pencil size={13} strokeWidth={1.5} />
                            Edit trip
                          </DropdownMenuItem>
                        ) : null}
                        {trip.accessRole === CollaboratorRole.Manager ? (
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              onDeleteTrip(trip);
                            }}
                          >
                            <Trash2 size={13} strokeWidth={1.5} />
                            Delete trip
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

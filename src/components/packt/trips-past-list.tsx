"use client";

import Link from "next/link";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TripCover } from "@/components/packt/trip-cover";
import { TripCard } from "@/components/packt/trip-card";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { type Trip } from "@/data/types";
import { getTripDays, formatDate } from "@/lib/utils";

interface PastTripsListProps {
  trips: Trip[];
  dateFormat: string;
  onEditTrip: (trip: Trip) => void;
  onDeleteTrip?: (trip: Trip) => void;
  viewMode?: "cards" | "list";
}

export function PastTripsList({ trips, dateFormat, onEditTrip, onDeleteTrip, viewMode = "list" }: PastTripsListProps) {
  if (viewMode === "cards") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {trips.map((trip) => (
          <TripCard
            key={trip.id}
            trip={trip}
            onEditTrip={onEditTrip}
            onDeleteTrip={onDeleteTrip ?? (() => {})}
            dateFormat={dateFormat}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-[14px] overflow-hidden" style={{ border: "1px solid var(--line)" }}>
      {trips.map((trip, i) => (
        <Link
          key={trip.id}
          href={`/trips/${trip.id}`}
          className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface"
          style={{
            borderTop: i > 0 ? "1px solid var(--line)" : undefined,
          }}
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
            {getTripDays(trip.startDate, trip.endDate)} DAYS
          </span>
          <Badge variant="outline">Past</Badge>
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
              <DropdownMenuItem
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onEditTrip(trip);
                }}
              >
                <Pencil size={13} strokeWidth={1.5} />
                Edit trip
              </DropdownMenuItem>
              {onDeleteTrip ? (
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
  );
}

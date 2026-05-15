"use client";

import Link from "next/link";
import { MoreHorizontal, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TripCover } from "@/components/packt/trip-cover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { type Trip } from "@/data/types";
import { getTripDays } from "@/lib/utils";

interface PastTripsListProps {
  trips: Trip[];
  onEditTrip: (trip: Trip) => void;
}

export function PastTripsList({ trips, onEditTrip }: PastTripsListProps) {
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
          />
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)" }}>{trip.name}</div>
          </div>
          <span style={{ fontSize: 12.5, color: "var(--fg-3)", fontVariantNumeric: "tabular-nums" }}>
            {trip.startDate}
          </span>
          <span
            style={{
              fontFamily: "var(--font-mono-family, ui-monospace)",
              fontSize: "10.5px",
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
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <MoreHorizontal size={14} strokeWidth={1.5} />
            </DropdownMenuTrigger>
            <DropdownMenuContent side="bottom" align="end">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onEditTrip(trip);
                }}
              >
                <Pencil size={13} strokeWidth={1.5} />
                Edit trip
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Link>
      ))}
    </div>
  );
}

"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { TripCover } from "@/components/arrivo/trip-cover";
import { type Trip } from "@/data/types";
import { formatDate, getDisplayedTripDays, pluralize } from "@/lib/utils";

interface MobileUpcomingTabProps {
  trips: Trip[];
  now: Date;
  dateFormat: string;
}

export function MobileUpcomingTab({ trips, now, dateFormat }: MobileUpcomingTabProps) {
  return (
    <div className="flex flex-col gap-3">
      {trips.map((trip) => {
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        const tripDays = getDisplayedTripDays(trip);
        const inDays = trip.startDate
          ? Math.ceil((new Date(trip.startDate + "T00:00:00").getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
          : null;
        const dateLine =
          trip.startDate && trip.endDate
            ? `${formatDate(trip.startDate, dateFormat)} — ${formatDate(trip.endDate, dateFormat)}`
            : "No dates";

        return (
          <Link
            key={trip.id}
            href={`/trips/${trip.id}`}
            className="flex overflow-hidden rounded-[14px]"
            style={{ border: "1px solid var(--line)", background: "var(--bg)" }}
          >
            <TripCover
              name={trip.name}
              showCity={false}
              style={{ width: 100, minHeight: 100 }}
              coverImageUrl={trip.coverImageUrl}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-3">
              <div style={{ fontSize: "calc(14px * var(--font-scale))", fontWeight: 600, color: "var(--fg)" }}>
                {trip.name}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono-family, ui-monospace)",
                  fontSize: "calc(10.5px * var(--font-scale))",
                  color: "var(--fg-3)",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                {tripDays} {pluralize(tripDays, "DAY", "DAYS")}
              </div>
              <div style={{ fontSize: "calc(12.5px * var(--font-scale))", color: "var(--fg-3)" }}>{dateLine}</div>
              <div className="mt-1 flex items-center gap-1.5">
                <Badge variant="soft">{inDays === null ? "unscheduled" : `in ${inDays}d`}</Badge>
                {(trip.docs?.length ?? 0) > 0 ? (
                  <Badge variant="success">{pluralize(trip.docs!.length, "doc")}</Badge>
                ) : (
                  <Badge variant="warning">no docs</Badge>
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { TripCover } from "@/components/packt/trip-cover";
import { type Trip } from "@/data/types";
import { formatDate, pluralize } from "@/lib/utils";

interface MobileUnscheduledTabProps {
  trips: Trip[];
  dateFormat: string;
}

export function MobileUnscheduledTab({ trips, dateFormat }: MobileUnscheduledTabProps) {
  return (
    <div className="flex flex-col gap-3">
      {trips.map((trip) => {
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
              <div style={{ fontSize: "calc(12.5px * var(--font-scale))", color: "var(--fg-3)" }}>{dateLine}</div>
              <div className="mt-1 flex items-center gap-1.5">
                <Badge variant="soft">unscheduled</Badge>
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

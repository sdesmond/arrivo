"use client";

import Link from "next/link";
import { Calendar, FileText, MoreHorizontal, Pencil, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TripCover } from "./trip-cover";
import { AvatarStack } from "./avatar-stack";
import { type Trip } from "@/data/types";
import { getTripDays, formatDate, getTripStatus, pluralize } from "@/lib/utils";
import { useNow } from "@/components/providers/mock-date-provider";

interface TripCardProps {
  trip: Trip;
  onEditTrip: (trip: Trip) => void;
  onDeleteTrip: (trip: Trip) => void;
  dateFormat: string;
}

export function TripCard({ trip, onEditTrip, onDeleteTrip, dateFormat }: TripCardProps) {
  const now = useNow();
  const tripDays = getTripDays(trip.startDate, trip.endDate);
  const sub = pluralize(tripDays, "DAY");
  const hasTripDates = Boolean(trip.startDate && trip.endDate);
  const tripStatus = hasTripDates ? getTripStatus(trip.startDate, trip.endDate, now) : null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const inDays = trip.startDate
    ? Math.ceil((new Date(trip.startDate + "T00:00:00").getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const badgeLabel =
    inDays === null
      ? "unscheduled"
      : tripStatus === "past"
        ? "past"
        : tripStatus === "active"
          ? "active"
          : `in ${inDays}d`;
  const coverMetaTag = tripStatus ? tripStatus.toUpperCase() : "UNSCHEDULED";
  const dateLine =
    trip.startDate && trip.endDate
      ? `${formatDate(trip.startDate, dateFormat)} — ${formatDate(trip.endDate, dateFormat)}`
      : "No dates";

  return (
    <Link
      href={`/trips/${trip.id}`}
      className="relative flex flex-col rounded-[14px] overflow-hidden transition-shadow hover:shadow-2"
      style={{
        border: "1px solid var(--line)",
        background: "var(--bg)",
      }}
    >
      {/* Overflow menu — upper-right */}
      <div className="absolute top-2 right-2 z-10">
        <DropdownMenu>
          <DropdownMenuTrigger
            title="Trip options"
            className="rounded-[6px] p-2 bg-black/25 text-white backdrop-blur-sm transition-colors hover:bg-black/45"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
          >
            <MoreHorizontal size={18} strokeWidth={1.5} />
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
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Cover */}
      <TripCover
        name={trip.name}
        country={sub}
        metaTag={coverMetaTag}
        showCity
        style={{ minHeight: 160 }}
        coverImageUrl={trip.coverImageUrl}
        destinationCountry={trip.destinationCountry}
      />

      {/* Body */}
      <div className="flex flex-col gap-2.5 p-4">
        {/* Heading */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div
              style={{
                fontSize: "calc(15px * var(--font-scale))",
                fontWeight: 600,
                fontFamily: "var(--font-heading-family, ui-sans-serif)",
                letterSpacing: "-0.01em",
                color: "var(--fg)",
                lineHeight: 1.2,
              }}
            >
              {trip.name}
            </div>
            <div
              data-testid="trip-card-date-range"
              style={{
                fontSize: "calc(12.5px * var(--font-scale))",
                color: "var(--fg-3)",
                marginTop: 3,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {dateLine}
            </div>
          </div>
          <Badge variant="soft" className="shrink-0 mt-0.5">
            {badgeLabel}
          </Badge>
        </div>

        {/* Meta row */}
        <div
          className="flex items-center gap-3"
          style={{ fontSize: "calc(12.5px * var(--font-scale))", color: "var(--fg-3)" }}
        >
          <span className="flex items-center gap-1">
            <Calendar size={13} strokeWidth={1.5} />
            {pluralize(tripDays, "day")}
          </span>
          <span className="flex items-center gap-1">
            <FileText size={13} strokeWidth={1.5} />
            {pluralize(trip.docs?.length ?? 0, "doc")}
          </span>
          <span className="flex items-center gap-1">
            <Users size={13} strokeWidth={1.5} />
            {trip.collaborators?.length ?? 0}
          </span>
        </div>

        {/* Footer */}
        {trip.collaborators && (
          <div className="mt-0.5">
            <AvatarStack initials={trip.collaborators.map((c) => c.initials)} size="sm" />
          </div>
        )}
      </div>
    </Link>
  );
}

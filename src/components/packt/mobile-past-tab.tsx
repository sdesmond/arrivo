"use client";

import Link from "next/link";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TripCover } from "@/components/packt/trip-cover";
import { CollaboratorRole, type Trip } from "@/data/types";
import { formatDate, getDisplayedTripDays } from "@/lib/utils";

interface MobilePastTabProps {
  trips: Trip[];
  dateFormat: string;
  onEditTrip?: (trip: Trip) => void;
  onDeleteTrip?: (trip: Trip) => void;
}

export function MobilePastTab({ trips, dateFormat, onEditTrip, onDeleteTrip }: MobilePastTabProps) {
  return (
    <div className="flex flex-col gap-3">
      {trips.map((trip) => {
        const canDelete = Boolean(onDeleteTrip) && trip.accessRole === CollaboratorRole.Manager;
        const canEdit = Boolean(onEditTrip) && trip.accessRole !== CollaboratorRole.Viewer;
        return (
          <div
            key={trip.id}
            className="flex overflow-hidden rounded-[14px]"
            style={{ border: "1px solid var(--line)", background: "var(--bg)" }}
          >
            <Link href={`/trips/${trip.id}`} className="flex min-w-0 flex-1">
              <TripCover
                name={trip.name}
                showCity={false}
                style={{ width: 80, minHeight: 80 }}
                coverImageUrl={trip.coverImageUrl}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1 p-3">
                <div style={{ fontSize: "calc(14px * var(--font-scale))", fontWeight: 600, color: "var(--fg)" }}>
                  {trip.name}
                </div>
                <div style={{ fontSize: "calc(12.5px * var(--font-scale))", color: "var(--fg-3)" }}>
                  {trip.startDate ? formatDate(trip.startDate, dateFormat) : "No dates"} · {getDisplayedTripDays(trip)}{" "}
                  days
                </div>
                <Badge variant="outline" className="mt-1 w-fit">
                  Past
                </Badge>
              </div>
            </Link>
            {canEdit || canDelete ? (
              <div className="flex items-start justify-center pr-1 pt-1">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    title="Trip options"
                    className="rounded-[6px] p-1 text-fg-4 transition-colors hover:bg-surface-2 hover:text-fg"
                    style={{ minHeight: 44, minWidth: 44 }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                  >
                    <MoreHorizontal size={14} strokeWidth={1.5} />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="bottom" align="end">
                    {canEdit ? (
                      <DropdownMenuItem
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onEditTrip!(trip);
                        }}
                      >
                        <Pencil size={13} strokeWidth={1.5} />
                        Edit trip
                      </DropdownMenuItem>
                    ) : null}
                    {canDelete ? (
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onDeleteTrip!(trip);
                        }}
                      >
                        <Trash2 size={13} strokeWidth={1.5} />
                        Delete trip
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

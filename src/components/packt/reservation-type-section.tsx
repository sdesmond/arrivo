"use client";

import { ChevronDown } from "lucide-react";
import { RESERVATION_TYPE_META, formatAnchorDateTime } from "@/components/packt/reservation-type-badge";
import { ReservationRow } from "@/components/packt/reservation-row";
import type { Document, Reservation, ReservationType } from "@/data/types";

export interface ReservationTypeSectionProps {
  type: ReservationType;
  reservations: Reservation[];
  open: boolean;
  onToggle: () => void;
  now: Date;
  tripDocs?: Document[];
  highlightedReservationId?: string | null;
}

export { formatAnchorDateTime };

export function sortReservationsByStartAt(reservations: Reservation[]): Reservation[] {
  const dated = reservations.filter((reservation) => reservation.startAt);
  const undated = reservations.filter((reservation) => !reservation.startAt);
  dated.sort((first, second) => new Date(first.startAt!).getTime() - new Date(second.startAt!).getTime());
  return [...dated, ...undated];
}

export function getNextUpcoming(reservations: Reservation[], now: Date): Reservation | undefined {
  if (reservations.length === 0) return undefined;
  const dated = reservations.filter((reservation) => reservation.startAt);
  if (dated.length === 0) return reservations[0];

  const upcoming = dated.filter((reservation) => new Date(reservation.startAt!).getTime() >= now.getTime());
  if (upcoming.length > 0) {
    return upcoming.reduce((soonest, candidate) =>
      new Date(candidate.startAt!).getTime() < new Date(soonest.startAt!).getTime() ? candidate : soonest
    );
  }

  return dated.reduce((latest, candidate) =>
    new Date(candidate.startAt!).getTime() > new Date(latest.startAt!).getTime() ? candidate : latest
  );
}

function renderPreview(reservations: Reservation[], now: Date) {
  const next = getNextUpcoming(reservations, now);
  if (!next) return null;
  if (!next.startAt) {
    return (
      <>
        Next: <strong>{next.provider}</strong>
      </>
    );
  }
  return (
    <>
      Next: <strong>{next.provider}</strong> · {formatAnchorDateTime(next.startAt)}
    </>
  );
}

export function ReservationTypeSection({
  type,
  reservations,
  open,
  onToggle,
  now,
  tripDocs,
  highlightedReservationId,
}: ReservationTypeSectionProps) {
  const { label, icon: Icon } = RESERVATION_TYPE_META[type];
  const count = reservations.length;
  const accessibleName = `${label}, ${count} reservation${count === 1 ? "" : "s"}, ${open ? "expanded" : "collapsed"}`;

  return (
    <div
      className="mb-3"
      style={{ borderRadius: 14, border: "1px solid var(--line)", background: "var(--bg)", overflow: "hidden" }}
    >
      <button
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        style={{
          background: "var(--surface)",
          borderTop: "none",
          borderLeft: "none",
          borderRight: "none",
          borderBottom: open ? "1px solid var(--line)" : "none",
          cursor: "pointer",
        }}
        onClick={onToggle}
        aria-expanded={open}
        aria-label={accessibleName}
      >
        <span
          className="flex items-center gap-2"
          style={{ fontSize: "calc(var(--fs-card-title) * var(--font-scale))", fontWeight: 600, color: "var(--fg)" }}
        >
          <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
          {label}
        </span>
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-flex items-center justify-center rounded-full"
            style={{
              height: 22,
              minWidth: 22,
              padding: "0 8px",
              fontSize: 11,
              fontWeight: 600,
              background: "var(--surface-2)",
              color: "var(--fg-2)",
            }}
          >
            {count}
          </span>
          <ChevronDown
            size={14}
            strokeWidth={1.5}
            aria-hidden="true"
            style={{
              color: "var(--fg-4)",
              transform: open ? "rotate(180deg)" : undefined,
              transition: "transform 0.15s",
              flexShrink: 0,
            }}
          />
        </span>
      </button>

      {!open && (
        <div
          className="px-4 py-2"
          style={{ fontSize: "calc(var(--fs-card-sub) * var(--font-scale))", color: "var(--fg-2)" }}
        >
          {renderPreview(reservations, now)}
        </div>
      )}

      {open &&
        sortReservationsByStartAt(reservations).map((reservation, index, all) => (
          <ReservationRow
            key={reservation.id}
            reservation={reservation}
            type={type}
            isLast={index === all.length - 1}
            tripDocs={tripDocs}
            highlighted={reservation.id === highlightedReservationId}
          />
        ))}
    </div>
  );
}

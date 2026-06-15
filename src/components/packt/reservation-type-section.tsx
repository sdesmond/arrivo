"use client";

import { ChevronDown, Wallet } from "lucide-react";
import { ANCHOR_LABELS, RESERVATION_TYPE_META } from "@/components/packt/reservation-type-badge";
import type { Reservation, ReservationType } from "@/data/types";

export interface ReservationTypeSectionProps {
  type: ReservationType;
  reservations: Reservation[];
  open: boolean;
  onToggle: () => void;
  now: Date;
}

export function formatAnchorDateTime(iso: string): string {
  const date = new Date(iso);
  const datePart = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const timePart = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${datePart} · ${timePart}`;
}

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

function renderAnchorLine(label: string, value: string | undefined) {
  if (!value) return null;
  return (
    <div className="flex gap-2" style={{ fontSize: 13 }}>
      <span style={{ color: "var(--fg-3)", minWidth: 68 }}>{label}</span>
      <span style={{ color: "var(--fg-2)" }}>{formatAnchorDateTime(value)}</span>
    </div>
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

export function ReservationTypeSection({ type, reservations, open, onToggle, now }: ReservationTypeSectionProps) {
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
          <div
            key={reservation.id}
            className="px-4 py-3.5"
            style={{ borderBottom: index < all.length - 1 ? "1px solid var(--line)" : "none" }}
          >
            <div style={{ fontSize: "calc(var(--fs-card-title) * var(--font-scale))", fontWeight: 600 }}>
              {reservation.provider}
            </div>
            {renderAnchorLine(ANCHOR_LABELS[type].start, reservation.startAt)}
            {renderAnchorLine(ANCHOR_LABELS[type].end, reservation.endAt)}
            {reservation.confirmationCode && (
              <span
                className="inline-flex items-center gap-1 mt-1.5 rounded"
                style={{
                  background: "var(--surface-2)",
                  padding: "2px 8px",
                  fontFamily: "var(--font-mono-family, ui-monospace)",
                  fontSize: 12,
                }}
              >
                <Wallet size={12} strokeWidth={1.5} aria-hidden="true" />
                {reservation.confirmationCode}
              </span>
            )}
          </div>
        ))}
    </div>
  );
}

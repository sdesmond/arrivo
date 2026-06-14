"use client";

import { useState } from "react";
import { ReservationTypePicker } from "@/components/packt/reservation-type-picker";
import { ReservationEditDrawer } from "@/components/packt/reservation-edit-drawer";
import { RESERVATION_TYPE_META } from "@/components/packt/reservation-type-badge";
import { ReservationType, type Reservation } from "@/data/types";

export interface ReservationsTabProps {
  tripId: string;
  reservations: Reservation[];
}

function formatReservationDateTime(value?: string): string | undefined {
  if (!value) return undefined;
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function ReservationsTab({ tripId, reservations }: ReservationsTabProps) {
  const [selectedType, setSelectedType] = useState<ReservationType | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const groupedByType = Object.values(ReservationType)
    .map((type) => ({ type, items: reservations.filter((reservation) => reservation.type === type) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 style={{ fontSize: "calc(16px * var(--font-scale))", fontWeight: 600 }}>Reservations</h2>
        <ReservationTypePicker
          onSelectType={(type) => {
            setSelectedType(type);
            setDrawerOpen(true);
          }}
        />
      </div>

      {groupedByType.length === 0 ? (
        <p style={{ fontSize: "calc(14px * var(--font-scale))", color: "var(--fg-2)" }}>No reservations yet.</p>
      ) : (
        groupedByType.map((group) => (
          <div key={group.type} className="flex flex-col gap-2">
            <h3
              style={{
                fontFamily: "var(--font-mono-family, ui-monospace)",
                fontSize: "calc(9px * var(--font-scale))",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--fg-4)",
                borderBottom: "1px solid var(--line)",
                paddingBottom: 6,
              }}
            >
              {RESERVATION_TYPE_META[group.type].label}
            </h3>
            {group.items.map((reservation) => (
              <div key={reservation.id} className="flex items-center justify-between py-1.5">
                <span style={{ fontSize: "calc(14px * var(--font-scale))" }}>{reservation.provider}</span>
                <span style={{ fontSize: "calc(12px * var(--font-scale))", color: "var(--fg-3)" }}>
                  {[formatReservationDateTime(reservation.startAt), formatReservationDateTime(reservation.endAt)]
                    .filter(Boolean)
                    .join(" – ")}
                </span>
              </div>
            ))}
          </div>
        ))
      )}

      {selectedType && (
        <ReservationEditDrawer tripId={tripId} type={selectedType} open={drawerOpen} onOpenChange={setDrawerOpen} />
      )}
    </div>
  );
}

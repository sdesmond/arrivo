"use client";

import { useState } from "react";
import { Luggage } from "lucide-react";
import { useNow } from "@/components/providers/mock-date-provider";
import { ReservationTypePicker } from "@/components/packt/reservation-type-picker";
import { ReservationEditDrawer } from "@/components/packt/reservation-edit-drawer";
import { ReservationTypeSection, getNextUpcoming } from "@/components/packt/reservation-type-section";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ReservationType, type Reservation } from "@/data/types";

export interface ReservationsTabProps {
  tripId: string;
  reservations: Reservation[];
}

function sectionSortKey(type: ReservationType, reservations: Reservation[], now: Date): [number, number] {
  const nextUpcoming = getNextUpcoming(reservations, now);
  if (!nextUpcoming?.startAt) {
    return [2, Object.values(ReservationType).indexOf(type)];
  }
  const startAtMs = new Date(nextUpcoming.startAt).getTime();
  if (startAtMs >= now.getTime()) {
    return [0, startAtMs];
  }
  return [1, -startAtMs];
}

export function ReservationsTab({ tripId, reservations }: ReservationsTabProps) {
  const now = useNow();
  const [selectedType, setSelectedType] = useState<ReservationType | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Set<ReservationType>>(new Set());

  function handleSelectType(type: ReservationType): void {
    setSelectedType(type);
    setDrawerOpen(true);
  }

  function toggleSection(type: ReservationType): void {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }

  const sections = Object.values(ReservationType)
    .map((type) => ({ type, items: reservations.filter((reservation) => reservation.type === type) }))
    .filter((section) => section.items.length > 0)
    .sort((first, second) => {
      const keyA = sectionSortKey(first.type, first.items, now);
      const keyB = sectionSortKey(second.type, second.items, now);
      return keyA[0] - keyB[0] || keyA[1] - keyB[1];
    });

  return (
    <div className="flex flex-col gap-4">
      {sections.length > 0 && (
        <div className="flex items-center justify-between">
          <h2 style={{ fontSize: "calc(16px * var(--font-scale))", fontWeight: 600 }}>Reservations</h2>
          <ReservationTypePicker onSelectType={handleSelectType} />
        </div>
      )}

      {sections.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Luggage strokeWidth={1.5} />
            </EmptyMedia>
            <EmptyTitle>No reservations yet</EmptyTitle>
            <EmptyDescription>
              Add a Flight, Lodging, Rental Car, and more to keep your bookings in one place.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <ReservationTypePicker onSelectType={handleSelectType} />
          </EmptyContent>
        </Empty>
      ) : (
        sections.map((section) => (
          <ReservationTypeSection
            key={section.type}
            type={section.type}
            reservations={section.items}
            open={openSections.has(section.type)}
            onToggle={() => toggleSection(section.type)}
            now={now}
          />
        ))
      )}

      {selectedType && (
        <ReservationEditDrawer tripId={tripId} type={selectedType} open={drawerOpen} onOpenChange={setDrawerOpen} />
      )}
    </div>
  );
}

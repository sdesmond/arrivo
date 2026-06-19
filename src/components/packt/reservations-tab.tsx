"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Luggage } from "lucide-react";
import { useNow } from "@/components/providers/mock-date-provider";
import { ReservationTypePicker } from "@/components/packt/reservation-type-picker";
import { ReservationEditDrawer } from "@/components/packt/reservation-edit-drawer";
import { ReservationTypeSection, getNextUpcoming } from "@/components/packt/reservation-type-section";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { ReservationType, type Document, type Reservation } from "@/data/types";

const HIGHLIGHT_DURATION_MS = 2000;

export interface ReservationsTabProps {
  tripId: string;
  reservations: Reservation[];
  tripDocs?: Document[];
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

export function ReservationsTab({ tripId, reservations, tripDocs }: ReservationsTabProps) {
  const now = useNow();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selectedType, setSelectedType] = useState<ReservationType | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Set<ReservationType>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [highlightedReservationId, setHighlightedReservationId] = useState<string | null>(null);
  const consumedActionRef = useRef<string | null>(null);
  const consumedHighlightRef = useRef<string | null>(null);

  const actionParam = searchParams.get("action");
  const highlightParam = searchParams.get("highlight");

  function stripOneShotParam(paramName: string): void {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    nextSearchParams.delete(paramName);
    const nextQueryString = nextSearchParams.toString();
    router.replace(nextQueryString ? `${pathname}?${nextQueryString}` : pathname, { scroll: false });
  }

  useEffect(() => {
    if (actionParam !== "add-reservation") return;
    if (consumedActionRef.current === actionParam) return;
    consumedActionRef.current = actionParam;
    setPickerOpen(true);
    stripOneShotParam("action");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionParam]);

  useEffect(() => {
    if (!highlightParam) return;
    if (consumedHighlightRef.current === highlightParam) return;
    consumedHighlightRef.current = highlightParam;

    const target = reservations.find((reservation) => reservation.id === highlightParam);
    setOpenSections((current) => (target ? new Set(current).add(target.type) : current));
    setHighlightedReservationId(target ? highlightParam : null);
    stripOneShotParam("highlight");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightParam]);

  useEffect(() => {
    if (!highlightedReservationId) return;
    const target = document.getElementById(`reservation-${highlightedReservationId}`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.focus();
    const timeoutId = setTimeout(() => setHighlightedReservationId(null), HIGHLIGHT_DURATION_MS);
    return () => clearTimeout(timeoutId);
  }, [highlightedReservationId]);

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
          <ReservationTypePicker onSelectType={handleSelectType} open={pickerOpen} onOpenChange={setPickerOpen} />
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
            <ReservationTypePicker onSelectType={handleSelectType} open={pickerOpen} onOpenChange={setPickerOpen} />
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
            tripDocs={tripDocs}
            highlightedReservationId={highlightedReservationId}
          />
        ))
      )}

      {selectedType && (
        <ReservationEditDrawer tripId={tripId} type={selectedType} open={drawerOpen} onOpenChange={setDrawerOpen} />
      )}
    </div>
  );
}

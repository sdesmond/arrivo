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

const HIGHLIGHT_DURATION_MS = 1000;

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
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedType, setSelectedType] = useState<ReservationType | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Set<ReservationType>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [highlightedReservationId, setHighlightedReservationId] = useState<string | null>(null);
  const handledActionSearchRef = useRef<string | null>(null);
  const handledHighlightSearchRef = useRef<string | null>(null);

  const actionParam = searchParams.get("action");
  const highlightParam = searchParams.get("highlight");
  const searchParamsString = searchParams.toString();

  useEffect(() => {
    const nextSearchParams = new URLSearchParams(searchParamsString);
    let needsReplace = false;

    if (actionParam !== "add-reservation") {
      handledActionSearchRef.current = null;
    } else if (handledActionSearchRef.current !== searchParamsString) {
      handledActionSearchRef.current = searchParamsString;
      setPickerOpen(true);
      nextSearchParams.delete("action");
      needsReplace = true;
    }

    if (!highlightParam) {
      handledHighlightSearchRef.current = null;
    } else {
      const target = reservations.find((reservation) => reservation.id === highlightParam);
      if (target && handledHighlightSearchRef.current !== searchParamsString) {
        handledHighlightSearchRef.current = searchParamsString;
        const targetType = target.type;
        setOpenSections((current) => new Set(current).add(targetType));
        setHighlightedReservationId(highlightParam);
        nextSearchParams.delete("highlight");
        needsReplace = true;
      }
    }

    if (needsReplace) {
      const nextQueryString = nextSearchParams.toString();
      router.replace(nextQueryString ? `${pathname}?${nextQueryString}` : pathname, { scroll: false });
    }
  }, [actionParam, highlightParam, pathname, reservations, router, searchParamsString]);

  useEffect(() => {
    if (!highlightedReservationId) return;
    const target = containerRef.current?.querySelector(`[data-reservation-id="${highlightedReservationId}"]`);
    if (target instanceof HTMLElement) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.focus();
    }
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

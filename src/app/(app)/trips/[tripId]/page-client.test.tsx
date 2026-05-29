import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { TripDetailClient } from "./page-client";
import type { TripDetailPayload } from "@/data/types";

const { tripConfettiMock } = vi.hoisted(() => ({
  tripConfettiMock: vi.fn(({ tripId }: { tripId: string }) => {
    void tripId;
    return null;
  }),
}));

interface TripCoverProps {
  metaTag: string;
  name: string;
}

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock("@/components/packt/trip-cover", () => ({
  TripCover: ({ metaTag, name }: TripCoverProps) => (
    <div>
      <span>{name}</span>
      <span>{metaTag}</span>
    </div>
  ),
}));

vi.mock("./trip-detail-tab-body", () => ({
  TripDetailTabBody: () => <div>Itinerary body</div>,
}));

vi.mock("@/components/packt/trip-confetti", () => ({
  TripConfetti: ({ tripId }: { tripId: string }) => tripConfettiMock({ tripId }),
}));

vi.mock("@/components/packt/trip-edit-sheet", () => ({
  TripEditSheet: () => null,
}));

vi.mock("@/lib/use-focus-scroll", () => ({
  useFocusScroll: vi.fn(),
}));

vi.mock("./use-trip-detail-handlers", () => ({
  useTripDetailHandlers: () => ({
    newlyCreatedChecklistId: null,
    addingDay: false,
    removingDay: false,
    savingTrip: false,
    isDeleting: false,
    handleEventUpdate: vi.fn(),
    handleEventDelete: vi.fn(),
    handleDayItemsReorder: vi.fn(),
    handleDayUpdate: vi.fn(),
    handleAddEvent: vi.fn(),
    handleAddNote: vi.fn(),
    handleUpdateNote: vi.fn(),
    handleDeleteNote: vi.fn(),
    handleAddChecklist: vi.fn(),
    handleUpdateChecklistTitle: vi.fn(),
    handleDeleteChecklist: vi.fn(),
    handleAddChecklistItem: vi.fn(),
    handleUpdateChecklistItem: vi.fn(),
    handleDeleteChecklistItem: vi.fn(),
    handleToggleChecklistItem: vi.fn(),
    handleTripSave: vi.fn(),
    handleTripSaveResolution: vi.fn(),
    handleDeleteTrip: vi.fn(),
    handleAddDay: vi.fn(),
    handleRemoveLastDay: vi.fn(),
  }),
}));

const baseDetail: TripDetailPayload = {
  trip: {
    id: "trip-1",
    name: "Tokyo",
    status: "upcoming",
  },
  days: [],
  unscheduledEvents: [],
  docs: [],
  collaborators: [],
  packingItems: [],
};

describe("TripDetailClient", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders TripConfetti for newly created trips", () => {
    render(<TripDetailClient detail={baseDetail} nowISO="2026-05-24T12:00:00.000Z" dateFormat="MM/DD/YYYY" isNew />);

    expect(tripConfettiMock).toHaveBeenCalledWith({ tripId: "trip-1" });
  });

  it("does not render TripConfetti when the trip is not new", () => {
    render(<TripDetailClient detail={baseDetail} nowISO="2026-05-24T12:00:00.000Z" dateFormat="MM/DD/YYYY" />);

    expect(tripConfettiMock).not.toHaveBeenCalled();
  });

  it("does not render TripConfetti when isNew is explicitly false", () => {
    render(
      <TripDetailClient detail={baseDetail} nowISO="2026-05-24T12:00:00.000Z" dateFormat="MM/DD/YYYY" isNew={false} />
    );

    expect(tripConfettiMock).not.toHaveBeenCalled();
  });

  it("shows an unscheduled hero label when the trip has no dates", () => {
    render(<TripDetailClient detail={baseDetail} nowISO="2026-05-24T12:00:00.000Z" dateFormat="MM/DD/YYYY" />);

    expect(screen.getByText("UNSCHEDULED TRIP · OFFLINE")).toBeInTheDocument();
  });

  it("counts unscheduled events in the hero summary", () => {
    render(
      <TripDetailClient
        detail={{
          ...baseDetail,
          unscheduledEvents: [{ id: "event-1", name: "Displaced dinner", position: 0 }],
        }}
        nowISO="2026-05-24T12:00:00.000Z"
        dateFormat="MM/DD/YYYY"
      />
    );

    expect(screen.getByText("place")).toBeInTheDocument();
  });
});

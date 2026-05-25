// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { TripDetailClient } from "./page-client";
import type { TripDetailPayload } from "@/data/types";

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

    expect(screen.getByText("1 places")).toBeInTheDocument();
  });
});

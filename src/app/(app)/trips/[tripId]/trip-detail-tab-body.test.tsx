import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type {
  DayItinerary,
  Document,
  Expense,
  PackingItem,
  PackingTemplate,
  Reservation,
  Trip,
  TripPackingList,
} from "@/data/types";
import { TripDetailTabBody, type TripDetailTabBodyProps } from "./trip-detail-tab-body";

const { tripBudgetTabSpy, reservationsTabSpy, tripItineraryViewSpy, mapTabSpy } = vi.hoisted(() => ({
  tripBudgetTabSpy: vi.fn(),
  reservationsTabSpy: vi.fn(),
  tripItineraryViewSpy: vi.fn(),
  mapTabSpy: vi.fn(),
}));

vi.mock("./trip-itinerary-view", () => ({
  TripItineraryView: (props: unknown) => {
    tripItineraryViewSpy(props);
    return <div>Itinerary tab</div>;
  },
}));

vi.mock("@/components/packt/trip-docs-tab", () => ({
  TripDocsTab: ({ docs }: { docs: Document[] }) => <div>{`Docs ${docs.length}`}</div>,
}));

vi.mock("@/components/packt/trip-budget-tab", () => ({
  TripBudgetTab: (props: unknown) => {
    tripBudgetTabSpy(props);
    return <div>Budget tab</div>;
  },
}));

vi.mock("@/components/packt/packing-lists-view", () => ({
  PackingListsView: () => <div>Packing tab</div>,
}));

vi.mock("@/components/packt/reservations-tab", () => ({
  ReservationsTab: (props: unknown) => {
    reservationsTabSpy(props);
    return <div>Reservations tab</div>;
  },
}));

vi.mock("@/components/packt/map-tab", () => ({
  MapTab: (props: unknown) => {
    mapTabSpy(props);
    return <div>Map tab</div>;
  },
}));

const trip: Trip = {
  id: "trip-1",
  name: "Tokyo",
  status: "upcoming",
  budget: { currency: "USD", total: 1000 },
};

const days: DayItinerary[] = [
  {
    id: "day-1",
    dayNumber: 1,
    date: "2026-07-01",
    label: "Day 1",
    events: [{ id: "event-1", name: "Museum", position: 0 }],
  },
];

const unscheduledEvents = [{ id: "event-2", name: "Dinner", position: 0, displacedDate: "2026-07-02" }];

const docs: Document[] = [
  { id: "doc-1", name: "Trip Doc", scope: "trip", kind: "pdf" },
  { id: "doc-2", name: "Event Doc", scope: "event", kind: "image" },
];

const reservations: Reservation[] = [
  {
    id: "reservation-1",
    tripId: "trip-1",
    type: "lodging",
    provider: "Hotel",
  },
];

const expenses: Expense[] = [
  {
    id: "expense-1",
    tripId: "trip-1",
    amount: 42,
    currency: "USD",
    category: "food",
    convertedAmountTrip: 42,
    date: "2026-07-01",
  },
];

function buildProps(overrides: Partial<TripDetailTabBodyProps> = {}): TripDetailTabBodyProps {
  return {
    tripId: "trip-1",
    trip,
    defaultExpenseCurrency: "EUR",
    warningThreshold: 80,
    dangerThreshold: 90,
    activeTab: "itin",
    days,
    unscheduledEvents,
    docs,
    packingItems: [] as PackingItem[],
    packingLists: [] as TripPackingList[],
    reservations,
    expenses,
    templates: [] as PackingTemplate[],
    dateFormat: "MM/DD/YYYY",
    onUpdateEvent: vi.fn(),
    onDeleteEvent: vi.fn(),
    onReorderDayItems: vi.fn(),
    onUpdateDay: vi.fn(),
    onAddEvent: vi.fn(),
    onAddNote: vi.fn(),
    onUpdateNote: vi.fn(),
    onDeleteNote: vi.fn(),
    onAddChecklist: vi.fn(),
    onUpdateChecklistTitle: vi.fn(),
    onDeleteChecklist: vi.fn(),
    onAddChecklistItem: vi.fn(),
    onUpdateChecklistItem: vi.fn(),
    onDeleteChecklistItem: vi.fn(),
    onToggleChecklistItem: vi.fn(),
    onAddPackingItem: vi.fn().mockResolvedValue(undefined),
    onRemovePackingItem: vi.fn().mockResolvedValue(undefined),
    onRemovePackingSection: vi.fn().mockResolvedValue(undefined),
    onTogglePackingItem: vi.fn().mockResolvedValue(undefined),
    onReorderPackingItems: vi.fn(),
    onEditPackingItem: vi.fn(),
    onPullTemplates: vi.fn().mockResolvedValue(undefined),
    onCreatePackingList: vi.fn().mockResolvedValue(undefined),
    onRenamePackingList: vi.fn().mockResolvedValue(undefined),
    onDeletePackingList: vi.fn().mockResolvedValue(undefined),
    onInsertFromPackingSource: vi.fn().mockResolvedValue(undefined),
    isDateless: false,
    onOpenEditDates: vi.fn(),
    onOpenEditBudget: vi.fn(),
    onActivateReservationsCta: vi.fn(),
    onLinkedEventTap: vi.fn(),
    onEditExpense: vi.fn(),
    onAddDay: vi.fn(),
    onRemoveLastDay: vi.fn(),
    addingDay: false,
    removingDay: false,
    ...overrides,
  };
}

describe("TripDetailTabBody", () => {
  it("passes budget data, flattened events, and thresholds to the Budget tab", () => {
    const onEditExpense = vi.fn();
    render(<TripDetailTabBody {...buildProps({ activeTab: "budget", onEditExpense })} />);

    expect(screen.getByText("Budget tab")).toBeInTheDocument();
    expect(tripBudgetTabSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: "trip-1",
        budget: trip.budget,
        expenses,
        reservations,
        events: [days[0].events[0], unscheduledEvents[0]],
        defaultExpenseCurrency: "EUR",
        warningThreshold: 80,
        dangerThreshold: 90,
        onOpenEditBudget: expect.any(Function),
        onEditExpense,
      })
    );
  });

  it("threads onOpenMapTab into the Itinerary tab", () => {
    const onOpenMapTab = vi.fn();
    render(<TripDetailTabBody {...buildProps({ activeTab: "itin", onOpenMapTab })} />);

    expect(tripItineraryViewSpy).toHaveBeenCalledWith(expect.objectContaining({ onOpenMapTab }));
  });

  it("falls back to drive when the trip has no transit mode set", () => {
    render(<TripDetailTabBody {...buildProps({ trip: { ...trip, transitMode: null }, activeTab: "itin" })} />);

    expect(tripItineraryViewSpy).toHaveBeenCalledWith(expect.objectContaining({ tripTransitMode: "drive" }));
  });

  it("threads defaultExpenseCurrency into itinerary and reservations tabs", () => {
    const { rerender } = render(<TripDetailTabBody {...buildProps({ activeTab: "itin" })} />);

    expect(screen.getByText("Itinerary tab")).toBeInTheDocument();
    expect(tripItineraryViewSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultExpenseCurrency: "EUR",
        tripDocs: [docs[0]],
      })
    );

    rerender(<TripDetailTabBody {...buildProps({ activeTab: "res" })} />);

    expect(screen.getByText("Reservations tab")).toBeInTheDocument();
    expect(reservationsTabSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        reservations,
        defaultExpenseCurrency: "EUR",
        tripDocs: [docs[0]],
      })
    );
  });

  it("renders the Map tab with all flattened events, reservations, and the trip id when activeTab is map", () => {
    render(<TripDetailTabBody {...buildProps({ activeTab: "map" })} />);

    expect(screen.getByText("Map tab")).toBeInTheDocument();
    expect(mapTabSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: "trip-1",
        events: [days[0].events[0], unscheduledEvents[0]],
        days,
        unscheduledEvents,
        reservations,
      })
    );
  });
});

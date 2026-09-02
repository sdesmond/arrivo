import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  CollaboratorRole,
  SpendingDateRange,
  type CurrencyOption,
  type SpendingSummary,
  type TripDateChangeConfirmation,
  type TripListEntry,
  type UpdateTripPatch,
} from "@/data/types";
import { TravelHistoryPageClient } from "./page-client";

const { mockUseTravelHistoryPageHandlers, spendingViewSpy, tripEditSheetSpy } = vi.hoisted(() => ({
  mockUseTravelHistoryPageHandlers: vi.fn(),
  spendingViewSpy: vi.fn(),
  tripEditSheetSpy: vi.fn(),
}));

vi.mock("./use-travel-history-page-handlers", () => ({
  useTravelHistoryPageHandlers: mockUseTravelHistoryPageHandlers,
}));

vi.mock("@/components/packt/travel-history-list", () => ({
  TravelHistoryList: ({
    trips,
    onEditTrip,
    onDeleteTrip,
  }: {
    trips: TripListEntry["trip"][];
    onEditTrip: (trip: TripListEntry["trip"]) => void;
    onDeleteTrip: (trip: TripListEntry["trip"]) => void;
  }) => (
    <div>
      <span data-testid="travel-history-trip-count">{trips.length}</span>
      <button onClick={() => onEditTrip(trips[0])}>Edit first trip</button>
      <button onClick={() => onDeleteTrip(trips[0])}>Delete first trip</button>
    </div>
  ),
}));

vi.mock("@/components/packt/spending-view", () => ({
  SpendingView: (props: unknown) => {
    spendingViewSpy(props);
    const { onRangeChange } = props as { onRangeChange: (range: SpendingDateRange) => void };
    return <button onClick={() => onRangeChange(SpendingDateRange.AllTime)}>Change range</button>;
  },
}));

vi.mock("@/components/packt/trip-edit-sheet", () => ({
  TripEditSheet: (props: unknown) => {
    tripEditSheetSpy(props);
    return <div data-testid="trip-edit-sheet" />;
  },
}));

vi.mock("@/components/packt/delete-trip-alert-dialog", () => ({
  DeleteTripAlertDialog: ({ onConfirm }: { onConfirm: () => void }) => (
    <button onClick={onConfirm}>Confirm delete</button>
  ),
}));

const entries: TripListEntry[] = [
  {
    trip: { id: "trip-1", name: "Tokyo", status: "past", startDate: "2026-06-01", endDate: "2026-06-05" },
    todayEvents: [],
    summaryEvents: [],
  },
];

const currencyOptions: CurrencyOption[] = [{ code: "USD", name: "US Dollar" }];

const spendingSummary: SpendingSummary = {
  totalSpend: 180,
  averageTripSpend: 180,
  averageDailySpend: 45,
  averageTripDuration: 4,
  tripCount: 1,
  countedTripCount: 1,
  totalTripDays: 4,
  categoryBreakdown: [],
  destinationBreakdown: [],
  budgetAdherence: { underBudget: 1, onBudget: 0, overBudget: 0 },
};

interface HandlerState {
  activeView: "trips" | "spending";
  pastTrips: TripListEntry["trip"][];
  editingEntry: TripListEntry | null;
  editingTrip: string | null;
  deletingTrip: TripListEntry["trip"] | null;
  savingTrip: boolean;
  tripDateConfirmation: TripDateChangeConfirmation | null;
  isDeleting: boolean;
  handleViewChange: (view: "trips" | "spending") => void;
  handleRangeChange: (range: SpendingDateRange) => void;
  setEditingTrip: (tripId: string | null) => void;
  setDeletingTrip: (trip: TripListEntry["trip"] | null) => void;
  closeTripEditSheet: () => void;
  handleTripSave: (tripId: string, patch: UpdateTripPatch) => Promise<void>;
  handleTripSaveResolution: (resolution: "delete-events" | "keep-events") => Promise<void>;
  cancelTripDateChange: () => void;
  handleConfirmDeleteTrip: (tripId?: string) => Promise<void>;
}

function createHandlers(overrides: Partial<HandlerState> = {}): HandlerState {
  return {
    activeView: "trips",
    pastTrips: entries.map((entry) => entry.trip),
    editingEntry: entries[0],
    editingTrip: "trip-1",
    deletingTrip: entries[0].trip,
    savingTrip: false,
    tripDateConfirmation: null,
    isDeleting: false,
    handleViewChange: vi.fn(),
    handleRangeChange: vi.fn(),
    setEditingTrip: vi.fn(),
    setDeletingTrip: vi.fn(),
    closeTripEditSheet: vi.fn(),
    handleTripSave: vi.fn().mockResolvedValue(undefined),
    handleTripSaveResolution: vi.fn().mockResolvedValue(undefined),
    cancelTripDateChange: vi.fn(),
    handleConfirmDeleteTrip: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("TravelHistoryPageClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the spending view with summary fallback and range handler", async () => {
    const user = userEvent.setup();
    const handlers = createHandlers({
      activeView: "spending",
      editingEntry: null,
      editingTrip: null,
      deletingTrip: null,
    });
    mockUseTravelHistoryPageHandlers.mockReturnValue(handlers);

    render(
      <TravelHistoryPageClient
        initialEntries={entries}
        nowISO="2026-07-07T12:00:00.000Z"
        dateFormat="MM/DD/YYYY"
        initialViewMode="cards"
        initialRange={SpendingDateRange.ThisYear}
        currency="EUR"
      />
    );

    expect(spendingViewSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        initialRange: SpendingDateRange.ThisYear,
        currency: "EUR",
        initialSummary: expect.objectContaining({
          totalSpend: 0,
          tripCount: 0,
        }),
        trips: [entries[0].trip],
      })
    );

    await user.click(screen.getByRole("button", { name: "Change range" }));
    expect(handlers.handleRangeChange).toHaveBeenCalledWith(SpendingDateRange.AllTime);
  });

  it("renders the trips list and threads edit, delete, and currency options", async () => {
    const user = userEvent.setup();
    const handlers = createHandlers();
    mockUseTravelHistoryPageHandlers.mockReturnValue(handlers);

    render(
      <TravelHistoryPageClient
        initialEntries={entries}
        currencyOptions={currencyOptions}
        nowISO="2026-07-07T12:00:00.000Z"
        dateFormat="MM/DD/YYYY"
        initialViewMode="list"
        initialSummary={spendingSummary}
      />
    );

    expect(screen.getByTestId("travel-history-trip-count")).toHaveTextContent("1");
    expect(tripEditSheetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        trip: entries[0].trip,
        currencyOptions,
        open: true,
      })
    );

    await user.click(screen.getByRole("button", { name: "Spending" }));
    expect(handlers.handleViewChange).toHaveBeenCalledWith("spending");

    await user.click(screen.getByRole("button", { name: "Edit first trip" }));
    expect(handlers.setEditingTrip).toHaveBeenCalledWith("trip-1");

    await user.click(screen.getByRole("button", { name: "Delete first trip" }));
    expect(handlers.setDeletingTrip).toHaveBeenCalledWith(entries[0].trip);

    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect(handlers.handleConfirmDeleteTrip).toHaveBeenCalledWith("trip-1");
  });

  it.each([
    ["manager", CollaboratorRole.Manager, true],
    ["editor", CollaboratorRole.Editor, false],
    ["viewer", CollaboratorRole.Viewer, false],
  ] as const)("gates canManage/onDelete on the edit sheet for a %s", async (_label, accessRole, canManage) => {
    const entryWithRole: TripListEntry = { ...entries[0], trip: { ...entries[0].trip, accessRole } };
    const handlers = createHandlers({ editingEntry: entryWithRole });
    mockUseTravelHistoryPageHandlers.mockReturnValue(handlers);

    render(
      <TravelHistoryPageClient
        initialEntries={entries}
        currencyOptions={currencyOptions}
        nowISO="2026-07-07T12:00:00.000Z"
        dateFormat="MM/DD/YYYY"
        initialViewMode="list"
      />
    );

    expect(tripEditSheetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        canManage,
        onDelete: canManage ? expect.any(Function) : undefined,
      })
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import {
  CollaboratorRole,
  type CurrencyOption,
  type TripDateChangeConfirmation,
  type TripListEntry,
  type UpdateTripPatch,
} from "@/data/types";
import { TripsPageClient } from "./page-client";

const { mockUseTripsPageHandlers, tripEditSheetSpy } = vi.hoisted(() => ({
  mockUseTripsPageHandlers: vi.fn(),
  tripEditSheetSpy: vi.fn(),
}));

vi.mock("./use-trips-page-handlers", () => ({
  useTripsPageHandlers: mockUseTripsPageHandlers,
}));

vi.mock("@/components/packt/trips-desktop-layout", () => ({
  TripsDesktopLayout: ({
    onEditTrip,
    onDeleteTrip,
  }: {
    onEditTrip: (tripId: string) => void;
    onDeleteTrip: (trip: TripListEntry["trip"]) => void;
  }) => (
    <div>
      <button onClick={() => onEditTrip("trip-1")}>Desktop edit</button>
      <button onClick={() => onDeleteTrip({ id: "trip-1", name: "Tokyo", status: "upcoming" })}>Desktop delete</button>
    </div>
  ),
}));

vi.mock("@/components/packt/trips-mobile-layout", () => ({
  TripsMobileLayout: ({ mobileTab }: { mobileTab: string }) => <div>{`Mobile ${mobileTab}`}</div>,
}));

vi.mock("@/components/packt/trip-edit-sheet", () => ({
  TripEditSheet: (props: unknown) => {
    tripEditSheetSpy(props);
    return <div data-testid="trip-edit-sheet" />;
  },
}));

vi.mock("@/components/packt/delete-trip-alert-dialog", () => ({
  DeleteTripAlertDialog: ({ onConfirm }: { onConfirm: () => void }) => (
    <button onClick={onConfirm}>Confirm trip delete</button>
  ),
}));

vi.mock("@/components/packt/new-trip-dialog", () => ({
  NewTripDialog: () => <div>New trip dialog</div>,
}));

vi.mock("@/components/packt/pending-invitations-list", () => ({
  PendingInvitationsList: () => null,
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogAction: ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
  AlertDialogCancel: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  AlertDialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const entries: TripListEntry[] = [
  {
    trip: { id: "trip-1", name: "Tokyo", status: "active", startDate: "2026-07-07", endDate: "2026-07-10" },
    todayEvents: [],
    summaryEvents: [],
  },
];

const currencyOptions: CurrencyOption[] = [{ code: "USD", name: "US Dollar" }];

interface HandlerState {
  activeEntry: TripListEntry | null;
  upcomingTrips: TripListEntry["trip"][];
  unscheduledEntries: TripListEntry[];
  mobileTab: string;
  editingEntry: TripListEntry | null;
  editingTrip: string | null;
  deletingTrip: TripListEntry["trip"] | null;
  newTripOpen: boolean;
  isCreating: boolean;
  savingTrip: boolean;
  isDeleting: boolean;
  pendingDraft: { dayCount: number; draft: object } | null;
  tripDateConfirmation: TripDateChangeConfirmation | null;
  setMobileTab: (tab: string) => void;
  setNewTripOpen: (open: boolean) => void;
  setEditingTrip: (tripId: string | null) => void;
  setDeletingTrip: (trip: TripListEntry["trip"] | null) => void;
  closeTripEditSheet: () => void;
  handleTripSave: (tripId: string, patch: UpdateTripPatch) => Promise<void>;
  handleTripSaveResolution: (resolution: "delete-events" | "keep-events") => Promise<void>;
  cancelTripDateChange: () => void;
  handleConfirmDeleteTrip: (tripId?: string) => Promise<void>;
  handleCreate: () => Promise<void>;
  submitCreateTrip: (draft: object) => void;
  setPendingDraft: (draft: { dayCount: number; draft: object } | null) => void;
}

function createHandlers(overrides: Partial<HandlerState> = {}): HandlerState {
  return {
    activeEntry: entries[0],
    upcomingTrips: [],
    unscheduledEntries: [],
    mobileTab: "Active",
    editingEntry: entries[0],
    editingTrip: "trip-1",
    deletingTrip: entries[0].trip,
    newTripOpen: false,
    isCreating: false,
    savingTrip: false,
    isDeleting: false,
    pendingDraft: null,
    tripDateConfirmation: null,
    setMobileTab: vi.fn(),
    setNewTripOpen: vi.fn(),
    setEditingTrip: vi.fn(),
    setDeletingTrip: vi.fn(),
    closeTripEditSheet: vi.fn(),
    handleTripSave: vi.fn().mockResolvedValue(undefined),
    handleTripSaveResolution: vi.fn().mockResolvedValue(undefined),
    cancelTripDateChange: vi.fn(),
    handleConfirmDeleteTrip: vi.fn().mockResolvedValue(undefined),
    handleCreate: vi.fn().mockResolvedValue(undefined),
    submitCreateTrip: vi.fn(),
    setPendingDraft: vi.fn(),
    ...overrides,
  };
}

describe("TripsPageClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("threads currency options and edit/delete handlers into the edit flow", async () => {
    const user = userEvent.setup();
    const handlers = createHandlers();
    mockUseTripsPageHandlers.mockReturnValue(handlers);

    render(
      <TripsPageClient
        initialEntries={entries}
        currencyOptions={currencyOptions}
        nowISO="2026-07-07T12:00:00.000Z"
        dateFormat="MM/DD/YYYY"
        initialViewMode="cards"
      />
    );

    expect(tripEditSheetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        trip: entries[0].trip,
        currencyOptions,
        open: true,
      })
    );

    await user.click(screen.getByRole("button", { name: "Desktop edit" }));
    expect(handlers.setEditingTrip).toHaveBeenCalledWith("trip-1");

    await user.click(screen.getByRole("button", { name: "Desktop delete" }));
    expect(handlers.setDeletingTrip).toHaveBeenCalledWith({ id: "trip-1", name: "Tokyo", status: "upcoming" });

    await user.click(screen.getByRole("button", { name: "Confirm trip delete" }));
    expect(handlers.handleConfirmDeleteTrip).toHaveBeenCalledWith("trip-1");
  });

  it.each([
    ["manager", CollaboratorRole.Manager, true],
    ["editor", CollaboratorRole.Editor, false],
    ["viewer", CollaboratorRole.Viewer, false],
  ] as const)("gates canManage/onDelete on the edit sheet for a %s", async (_label, accessRole, canManage) => {
    const entryWithRole: TripListEntry = { ...entries[0], trip: { ...entries[0].trip, accessRole } };
    const handlers = createHandlers({ editingEntry: entryWithRole });
    mockUseTripsPageHandlers.mockReturnValue(handlers);

    render(
      <TripsPageClient
        initialEntries={entries}
        currencyOptions={currencyOptions}
        nowISO="2026-07-07T12:00:00.000Z"
        dateFormat="MM/DD/YYYY"
        initialViewMode="cards"
      />
    );

    expect(tripEditSheetSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        canManage,
        onDelete: canManage ? expect.any(Function) : undefined,
      })
    );
  });

  it("shows pending long-trip warning and submits draft on continue", async () => {
    const user = userEvent.setup();
    const draft = { name: "Long trip" };
    const handlers = createHandlers({
      pendingDraft: { dayCount: 31, draft },
    });
    mockUseTripsPageHandlers.mockReturnValue(handlers);

    render(
      <TripsPageClient
        initialEntries={entries}
        nowISO="2026-07-07T12:00:00.000Z"
        dateFormat="MM/DD/YYYY"
        initialViewMode="cards"
      />
    );

    expect(screen.getByText("This trip spans 31 days. Are you sure you want to continue?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(handlers.submitCreateTrip).toHaveBeenCalledWith(draft);
    expect(handlers.setPendingDraft).toHaveBeenCalledWith(null);
  });
});

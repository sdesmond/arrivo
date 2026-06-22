import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, renderHook, act, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { useTripsPageHandlers } from "./use-trips-page-handlers";
import { TripsPageClient } from "./page-client";
import { deleteTrip, updateTripMetadata } from "./actions";
import { TripDateConflictResolution, type TripListEntry } from "@/data/types";

vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("./actions", () => ({
  createTrip: vi.fn(),
  deleteTrip: vi.fn(),
  updateTripMetadata: vi.fn(),
}));

const { mockUseOfflineDb, mockUseOnlineStatus, mockMirrorTripListEntries, mockReadTripListFromMirror } = vi.hoisted(
  () => ({
    mockUseOfflineDb: vi.fn(() => null as { userId: string } | null),
    mockUseOnlineStatus: vi.fn(() => true),
    mockMirrorTripListEntries: vi.fn(),
    mockReadTripListFromMirror: vi.fn(),
  })
);

vi.mock("@/lib/offline/db", () => ({
  useOfflineDb: mockUseOfflineDb,
  mirrorTripListEntries: mockMirrorTripListEntries,
  readTripListFromMirror: mockReadTripListFromMirror,
}));

vi.mock("@/lib/offline/use-online-status", () => ({
  useOnlineStatus: mockUseOnlineStatus,
}));

vi.mock("dexie-react-hooks", async () => {
  const { useEffect, useState } = await import("react");
  return {
    useLiveQuery: (querier: () => unknown, deps: unknown[] = []) => {
      const [value, setValue] = useState<unknown>(undefined);
      useEffect(() => {
        let cancelled = false;
        const result = querier();
        if (result && typeof (result as Promise<unknown>).then === "function") {
          Promise.resolve(result).then((resolvedResult) => {
            if (!cancelled) setValue(resolvedResult);
          });
        } else {
          setValue(result);
        }
        return () => {
          cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, deps);
      return value;
    },
  };
});

vi.mock("@/components/packt/trips-desktop-layout", () => ({
  TripsDesktopLayout: ({
    upcomingTrips,
    unscheduledEntries,
  }: {
    upcomingTrips: { name: string }[];
    unscheduledEntries: { trip: { name: string } }[];
  }) => (
    <div data-testid="desktop-layout">
      <span>upcoming:{upcomingTrips.map((trip) => trip.name).join(",")}</span>
      <span>unscheduled:{unscheduledEntries.map((entry) => entry.trip.name).join(",")}</span>
    </div>
  ),
}));

vi.mock("@/components/packt/trips-mobile-layout", () => ({
  TripsMobileLayout: () => null,
}));

vi.mock("@/components/packt/trip-edit-sheet", () => ({
  TripEditSheet: () => null,
}));

vi.mock("@/components/packt/new-trip-dialog", () => ({
  NewTripDialog: () => null,
}));

vi.mock("@/components/packt/delete-trip-alert-dialog", () => ({
  DeleteTripAlertDialog: () => null,
}));

const NOW = new Date("2026-05-13T12:00:00.000Z");

function createDeferredPromise(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return { promise, resolve: resolvePromise };
}

const datedEntries: TripListEntry[] = [
  {
    trip: { id: "trip-active", name: "Tokyo", status: "active", startDate: "2026-05-10", endDate: "2026-05-20" },
    todayEvents: [],
  },
  {
    trip: { id: "trip-upcoming", name: "Paris", status: "upcoming", startDate: "2026-06-01", endDate: "2026-06-10" },
    todayEvents: [],
  },
  {
    trip: { id: "trip-past", name: "Lisbon", status: "past", startDate: "2025-09-01", endDate: "2025-09-07" },
    todayEvents: [],
  },
];

const unscheduledEntry: TripListEntry = {
  trip: { id: "trip-unscheduled", name: "Unsorted", status: "upcoming" },
  todayEvents: [],
};

describe("useTripsPageHandlers", () => {
  it("separates unscheduled entries from dated entries", () => {
    const { result } = renderHook(() => useTripsPageHandlers([...datedEntries, unscheduledEntry], NOW));

    expect(result.current.unscheduledEntries).toHaveLength(1);
    expect(result.current.unscheduledEntries[0].trip.id).toBe("trip-unscheduled");
  });

  it("filters active entries from dated entries only", () => {
    const { result } = renderHook(() => useTripsPageHandlers([...datedEntries, unscheduledEntry], NOW));

    expect(result.current.activeEntry?.trip.id).toBe("trip-active");
    expect(result.current.upcomingTrips).toHaveLength(1);
    expect(result.current.upcomingTrips[0].id).toBe("trip-upcoming");
  });

  it("defaults to Unscheduled mobile tab when no active entry and unscheduled exist", () => {
    const entries = [datedEntries[1], datedEntries[2], unscheduledEntry];
    const { result } = renderHook(() => useTripsPageHandlers(entries, NOW));

    expect(result.current.mobileTab).toBe("Unscheduled");
  });

  it("defaults to Active mobile tab when active entry exists", () => {
    const { result } = renderHook(() => useTripsPageHandlers([...datedEntries, unscheduledEntry], NOW));

    expect(result.current.mobileTab).toBe("Active");
  });

  it("defaults to Upcoming mobile tab when no active and no unscheduled", () => {
    const { result } = renderHook(() => useTripsPageHandlers([datedEntries[1], datedEntries[2]], NOW));

    expect(result.current.mobileTab).toBe("Upcoming");
  });

  it("returns null nextInDays when no upcoming trips", () => {
    const { result } = renderHook(() =>
      useTripsPageHandlers([datedEntries[0], datedEntries[2], unscheduledEntry], NOW)
    );

    expect(result.current.nextInDays).toBeNull();
  });

  it("calculates nextInDays from upcoming trips", () => {
    const { result } = renderHook(() => useTripsPageHandlers(datedEntries, NOW));

    expect(result.current.nextInDays).toBe(19);
  });

  it("computes editingEntry from editingTrip id", () => {
    const { result } = renderHook(() => useTripsPageHandlers([...datedEntries, unscheduledEntry], NOW));

    act(() => {
      result.current.setEditingTrip("trip-active");
    });
    expect(result.current.editingEntry?.trip.id).toBe("trip-active");
  });

  it("keeps the sheet open and stores confirmation state when a date edit needs review", async () => {
    vi.mocked(updateTripMetadata).mockResolvedValueOnce({
      status: "confirmation-required",
      confirmation: {
        removedDates: ["2026-06-10"],
        events: [{ id: "event-1", name: "Dinner", displacedDate: "2026-06-10", docCount: 0 }],
        noteCount: 0,
        checklistCount: 0,
        eventDocumentCount: 0,
      },
    });

    const { result } = renderHook(() => useTripsPageHandlers([...datedEntries, unscheduledEntry], NOW));

    act(() => {
      result.current.setEditingTrip("trip-upcoming");
    });

    await act(async () => {
      await result.current.handleTripSave("trip-upcoming", {
        startDate: "2026-06-01",
        endDate: "2026-06-09",
      });
    });

    expect(result.current.editingTrip).toBe("trip-upcoming");
    expect(result.current.tripDateConfirmation?.removedDates).toEqual(["2026-06-10"]);
    expect(result.current.pendingTripPatch).toEqual({
      startDate: "2026-06-01",
      endDate: "2026-06-09",
    });
  });

  it("replays the stored patch with the selected resolution and confirmation payload", async () => {
    const confirmation = {
      removedDates: ["2026-06-10"],
      events: [{ id: "event-1", name: "Dinner", displacedDate: "2026-06-10", docCount: 0 }],
      noteCount: 0,
      checklistCount: 0,
      eventDocumentCount: 0,
    };
    vi.mocked(updateTripMetadata)
      .mockResolvedValueOnce({
        status: "confirmation-required",
        confirmation,
      })
      .mockResolvedValueOnce({ status: "saved" });

    const { result } = renderHook(() => useTripsPageHandlers([...datedEntries, unscheduledEntry], NOW));

    act(() => {
      result.current.setEditingTrip("trip-upcoming");
    });

    await act(async () => {
      await result.current.handleTripSave("trip-upcoming", {
        startDate: "2026-06-01",
        endDate: "2026-06-09",
      });
    });

    await act(async () => {
      await result.current.handleTripSaveResolution(TripDateConflictResolution.DeleteEvents);
    });

    expect(updateTripMetadata).toHaveBeenLastCalledWith(
      "trip-upcoming",
      { startDate: "2026-06-01", endDate: "2026-06-09" },
      TripDateConflictResolution.DeleteEvents,
      confirmation
    );
    expect(result.current.editingTrip).toBeNull();
    expect(result.current.tripDateConfirmation).toBeNull();
    expect(result.current.pendingTripPatch).toBeNull();
  });

  it("deletes the selected trip and clears delete state", async () => {
    vi.mocked(deleteTrip).mockResolvedValueOnce(undefined);

    const { result } = renderHook(() => useTripsPageHandlers([...datedEntries, unscheduledEntry], NOW));

    act(() => {
      result.current.setDeletingTrip(datedEntries[1].trip);
    });

    await act(async () => {
      await result.current.handleConfirmDeleteTrip();
    });

    expect(deleteTrip).toHaveBeenCalledWith("trip-upcoming");
    expect(result.current.deletingTrip).toBeNull();
  });

  it("shows a toast when trip deletion fails", async () => {
    vi.mocked(deleteTrip).mockRejectedValueOnce(new Error("Delete failed"));

    const { result } = renderHook(() => useTripsPageHandlers([...datedEntries, unscheduledEntry], NOW));

    act(() => {
      result.current.setDeletingTrip(datedEntries[2].trip);
    });

    await act(async () => {
      await result.current.handleConfirmDeleteTrip();
    });

    expect(toast.error).toHaveBeenCalledWith("Delete failed");
    expect(result.current.deletingTrip?.id).toBe("trip-past");
  });
});

describe("TripsPageClient offline mirroring", () => {
  beforeEach(() => {
    mockUseOfflineDb.mockReturnValue(null);
    mockUseOnlineStatus.mockReturnValue(true);
    mockReadTripListFromMirror.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("mirrors trip list entries to the offline db when online and a database is available", () => {
    const fakeDb = { userId: "user-1" };
    mockUseOfflineDb.mockReturnValue(fakeDb);
    mockUseOnlineStatus.mockReturnValue(true);

    render(
      <TripsPageClient
        initialEntries={datedEntries}
        nowISO="2026-05-13T12:00:00.000Z"
        dateFormat="MM/DD/YYYY"
        initialViewMode="cards"
      />
    );

    expect(mockMirrorTripListEntries).toHaveBeenCalledWith(fakeDb, datedEntries);
  });

  it("does not mirror when offline", () => {
    mockUseOfflineDb.mockReturnValue({ userId: "user-1" });
    mockUseOnlineStatus.mockReturnValue(false);

    render(
      <TripsPageClient
        initialEntries={datedEntries}
        nowISO="2026-05-13T12:00:00.000Z"
        dateFormat="MM/DD/YYYY"
        initialViewMode="cards"
      />
    );

    expect(mockMirrorTripListEntries).not.toHaveBeenCalled();
  });

  it("does not mirror when no offline db is available yet", () => {
    mockUseOfflineDb.mockReturnValue(null);
    mockUseOnlineStatus.mockReturnValue(true);

    render(
      <TripsPageClient
        initialEntries={datedEntries}
        nowISO="2026-05-13T12:00:00.000Z"
        dateFormat="MM/DD/YYYY"
        initialViewMode="cards"
      />
    );

    expect(mockMirrorTripListEntries).not.toHaveBeenCalled();
  });

  it("renders entries from the offline mirror once it resolves while offline", async () => {
    const fakeDb = { userId: "user-1" };
    mockUseOfflineDb.mockReturnValue(fakeDb);
    mockUseOnlineStatus.mockReturnValue(false);
    mockReadTripListFromMirror.mockResolvedValue([unscheduledEntry]);

    render(
      <TripsPageClient
        initialEntries={datedEntries}
        nowISO="2026-05-13T12:00:00.000Z"
        dateFormat="MM/DD/YYYY"
        initialViewMode="cards"
      />
    );

    expect(await screen.findByText("unscheduled:Unsorted")).toBeInTheDocument();
    expect(mockReadTripListFromMirror).toHaveBeenCalledWith(fakeDb, new Date("2026-05-13T12:00:00.000Z"));
  });

  it("keeps showing server entries while offline before the mirror read resolves", () => {
    const fakeDb = { userId: "user-1" };
    mockUseOfflineDb.mockReturnValue(fakeDb);
    mockUseOnlineStatus.mockReturnValue(false);
    mockReadTripListFromMirror.mockReturnValue(new Promise(() => {}));

    render(
      <TripsPageClient
        initialEntries={datedEntries}
        nowISO="2026-05-13T12:00:00.000Z"
        dateFormat="MM/DD/YYYY"
        initialViewMode="cards"
      />
    );

    expect(screen.getByText("upcoming:Paris")).toBeInTheDocument();
  });

  it("replays latest entries after an in-flight mirror write resolves", async () => {
    const fakeDb = { userId: "user-1" };
    const deferredMirror = createDeferredPromise();
    const updatedEntries: TripListEntry[] = [
      {
        ...datedEntries[0],
        trip: {
          ...datedEntries[0].trip,
          name: "Paris Updated",
        },
      },
      ...datedEntries.slice(1),
    ];
    mockUseOfflineDb.mockReturnValue(fakeDb);
    mockUseOnlineStatus.mockReturnValue(true);
    mockMirrorTripListEntries.mockImplementationOnce(() => deferredMirror.promise).mockResolvedValue(undefined);

    const { rerender } = render(
      <TripsPageClient
        initialEntries={datedEntries}
        nowISO="2026-05-13T12:00:00.000Z"
        dateFormat="MM/DD/YYYY"
        initialViewMode="cards"
      />
    );

    rerender(
      <TripsPageClient
        initialEntries={updatedEntries}
        nowISO="2026-05-13T12:00:00.000Z"
        dateFormat="MM/DD/YYYY"
        initialViewMode="cards"
      />
    );

    deferredMirror.resolve();

    await waitFor(() => expect(mockMirrorTripListEntries).toHaveBeenCalledTimes(2));
    expect(mockMirrorTripListEntries).toHaveBeenLastCalledWith(fakeDb, updatedEntries);
  });
});

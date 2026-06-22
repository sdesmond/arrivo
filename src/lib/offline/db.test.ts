import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { DocKind, ReservationType, type TripDetailPayload, type TripListEntry } from "@/data/types";
import type {
  OfflineDay,
  OfflineDocument,
  OfflineEvent,
  OfflineOutboxEntry,
  OfflinePackingItem,
  OfflineTrip,
} from "./schema";

class MockTable<RowType extends { id: string }> {
  rows = new Map<string, RowType>();

  put = vi.fn(async (row: RowType) => {
    this.rows.set(row.id, row);
    return row.id;
  });

  bulkPut = vi.fn(async (rowsToInsert: RowType[]) => {
    for (const row of rowsToInsert) this.rows.set(row.id, row);
    return rowsToInsert.map((row) => row.id);
  });

  delete = vi.fn(async (id: string) => {
    this.rows.delete(id);
  });

  get = vi.fn(async (id: string) => this.rows.get(id));

  toArray = vi.fn(async () => [...this.rows.values()]);

  where = vi.fn(<Key extends keyof RowType>(field: Key) => ({
    equals: (value: RowType[Key]) => {
      const matches = () => [...this.rows.values()].filter((row) => row[field] === value);
      return {
        toArray: async () => matches(),
        delete: async () => {
          for (const row of matches()) {
            this.rows.delete(row.id);
          }
        },
        sortBy: async (sortField: keyof RowType) =>
          [...matches()].sort((first, second) => {
            const firstValue = first[sortField];
            const secondValue = second[sortField];
            if (typeof firstValue === "number" && typeof secondValue === "number") {
              return firstValue - secondValue;
            }
            return String(firstValue).localeCompare(String(secondValue));
          }),
      };
    },
  }));
}

class MockDexie {
  static delete = vi.fn(async () => undefined);
  name: string;
  trips = new MockTable<OfflineTrip>();
  days = new MockTable<OfflineDay>();
  events = new MockTable<OfflineEvent>();
  documents = new MockTable<OfflineDocument>();
  packingItems = new MockTable<OfflinePackingItem>();
  outbox = new MockTable<OfflineOutboxEntry>();

  constructor(name: string) {
    this.name = name;
  }

  version() {
    return { stores: () => undefined };
  }

  transaction(...args: unknown[]) {
    const callback = args[args.length - 1] as () => Promise<void>;
    return callback();
  }
}

vi.mock("dexie", () => ({
  default: MockDexie,
  Dexie: MockDexie,
}));

vi.mock("dexie-react-hooks", async () => {
  const React = await import("react");

  return {
    useLiveQuery: (query: () => unknown | Promise<unknown>, deps: React.DependencyList = []) => {
      const [value, setValue] = React.useState<unknown>(undefined);
      const dependencyKey = JSON.stringify(deps);

      React.useEffect(() => {
        let cancelled = false;

        Promise.resolve(query()).then((nextValue) => {
          if (!cancelled) {
            setValue(nextValue);
          }
        });

        return () => {
          cancelled = true;
        };
      }, [dependencyKey, query]);

      return value;
    },
  };
});

const {
  deleteDocumentLocally,
  deleteEventLocally,
  deletePackingItemLocally,
  getOfflineDb,
  clearOfflineDb,
  mirrorTripDetail,
  reorderEventsLocally,
  mirrorTripListEntries,
  readTripDetailFromMirror,
  readTripListFromMirror,
  updateDayLocally,
  useOfflineEntitySyncStatus,
  updateEventLocally,
  useOfflineDb,
  writeDocumentLocally,
  writeEventLocally,
  writePackingItemLocally,
} = await import("./db");

beforeEach(() => {
  vi.restoreAllMocks();
  MockDexie.delete.mockClear();
});

describe("useOfflineDb", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves to the offline db for the session user once the session fetch completes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ user: { id: "user-hook-test" } }) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useOfflineDb());
    expect(result.current).toBeNull();

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.userId).toBe("user-hook-test");
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/session");
  });

  it("stays null when the session has no user", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => null }));

    const { result } = renderHook(() => useOfflineDb());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current).toBeNull();
  });

  it("stays null when the session fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    const { result } = renderHook(() => useOfflineDb());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current).toBeNull();
  });
});

describe("OfflineDb naming and caching", () => {
  it("names the database packt-offline-{userId}", async () => {
    const database = await getOfflineDb("user-name-test");
    expect(database.name).toBe("packt-offline-user-name-test");
  });

  it("returns the cached instance for repeated calls with the same userId", async () => {
    const first = await getOfflineDb("user-cache-test");
    const second = await getOfflineDb("user-cache-test");
    expect(first).toBe(second);
  });

  it("returns distinct instances for distinct userIds", async () => {
    const userA = await getOfflineDb("user-a");
    const userB = await getOfflineDb("user-b");
    expect(userA).not.toBe(userB);
    expect(userA.userId).toBe("user-a");
    expect(userB.userId).toBe("user-b");
  });
});

describe("clearOfflineDb", () => {
  it("deletes the cached instance and evicts it so the next get creates a fresh one", async () => {
    const original = await getOfflineDb("user-clear-test");
    await clearOfflineDb("user-clear-test");
    expect(MockDexie.delete).toHaveBeenCalledWith("packt-offline-user-clear-test");

    const recreated = await getOfflineDb("user-clear-test");
    expect(recreated).not.toBe(original);
  });

  it("deletes a not-yet-cached userId's database without throwing", async () => {
    await expect(clearOfflineDb("user-never-opened")).resolves.toBeUndefined();
  });
});

function buildTripDetail(): TripDetailPayload {
  return {
    trip: {
      id: "trip-1",
      status: "upcoming",
      name: "Tokyo",
      startDate: "2026-07-01",
      endDate: "2026-07-10",
    },
    days: [
      {
        id: "day-1",
        tripId: "trip-1",
        dayNumber: 1,
        date: "2026-07-01",
        label: "Day 1",
        events: [
          {
            id: "event-1",
            tripId: "trip-1",
            dayId: "day-1",
            name: "Museum",
            position: 0,
            docs: [
              {
                id: "doc-event-1",
                name: "Ticket",
                kind: DocKind.PDF,
                offline: false,
                url: "https://example.com/ticket.pdf",
                scope: "event",
              },
            ],
          },
        ],
      },
    ],
    unscheduledEvents: [
      {
        id: "event-2",
        tripId: "trip-1",
        name: "Souvenir shopping",
        position: 0,
        docs: [
          {
            id: "doc-event-2",
            name: "Receipt",
            kind: DocKind.Image,
            offline: false,
            url: "https://example.com/receipt.jpg",
            scope: "event",
          },
        ],
      },
    ],
    docs: [
      {
        id: "doc-event-1",
        name: "Ticket",
        kind: DocKind.PDF,
        offline: false,
        url: "https://example.com/ticket.pdf",
        scope: "event",
      },
      {
        id: "doc-event-2",
        name: "Receipt",
        kind: DocKind.Image,
        offline: false,
        url: "https://example.com/receipt.jpg",
        scope: "event",
      },
      {
        id: "doc-trip-1",
        name: "Itinerary",
        kind: DocKind.Doc,
        offline: false,
        url: "https://example.com/it.pdf",
        scope: "trip",
      },
    ],
    collaborators: [],
    packingItems: [{ id: "packing-1", name: "Passport", done: false, tripId: "trip-1", listId: "list-1", position: 0 }],
    packingLists: [],
    reservations: [],
  };
}

describe("mirrorTripDetail", () => {
  it("writes trip, days, events, documents (with correct event scoping), and packing items", async () => {
    const database = await getOfflineDb("user-mirror-detail");
    await mirrorTripDetail(database, buildTripDetail());

    expect((await database.trips.get("trip-1"))?.name).toBe("Tokyo");
    expect((await database.days.get("day-1"))?.dayNumber).toBe(1);
    expect((await database.events.get("event-1"))?.dayId).toBe("day-1");
    expect((await database.events.get("event-2"))?.dayId).toBeNull();
    expect((await database.documents.get("doc-event-1"))?.eventId).toBe("event-1");
    expect((await database.documents.get("doc-event-2"))?.eventId).toBe("event-2");
    expect((await database.documents.get("doc-trip-1"))?.eventId).toBeNull();
    expect((await database.documents.get("doc-trip-1"))?.tripId).toBe("trip-1");
    expect((await database.packingItems.get("packing-1"))?.name).toBe("Passport");
  });

  it("updates an existing mirrored list snapshot with latest trip metadata", async () => {
    const database = await getOfflineDb("user-mirror-detail-list-sync");
    await mirrorTripListEntries(database, [
      {
        trip: { id: "trip-1", status: "upcoming", name: "Tokyo (old)", startDate: "2026-07-01", endDate: "2026-07-10" },
        todayEvents: [{ id: "today-1", name: "Lunch", startAt: "2026-07-05T12:00:00.000Z", position: 0 }],
      },
    ]);

    const detail = buildTripDetail();
    detail.trip.name = "Tokyo (new)";
    await mirrorTripDetail(database, detail);

    expect((await database.trips.get("trip-1"))?.listEntrySnapshot?.trip.name).toBe("Tokyo (new)");
    expect((await database.trips.get("trip-1"))?.listEntrySnapshot?.todayEvents).toHaveLength(1);
  });
});

describe("mirrorTripListEntries", () => {
  it("writes each entry's trip row scoped to the database's userId", async () => {
    const database = await getOfflineDb("user-mirror-list");
    const entries: TripListEntry[] = [
      { trip: { id: "trip-a", status: "upcoming", name: "Paris", startDate: "2026-08-01" }, todayEvents: [] },
      { trip: { id: "trip-b", status: "past", name: "Rome", startDate: "2025-01-01" }, todayEvents: [] },
    ];

    await mirrorTripListEntries(database, entries);

    expect((await database.trips.get("trip-a"))?.ownerId).toBe("user-mirror-list");
    expect((await database.trips.get("trip-b"))?.name).toBe("Rome");
    expect((await database.trips.get("trip-a"))?.listEntrySnapshot).toEqual(entries[0]);
  });

  it("deletes mirrored trips that no longer appear in the latest list snapshot", async () => {
    const database = await getOfflineDb("user-mirror-list-delete");
    await mirrorTripListEntries(database, [
      { trip: { id: "trip-a", status: "upcoming", name: "Paris", startDate: "2026-08-01" }, todayEvents: [] },
      { trip: { id: "trip-b", status: "upcoming", name: "Rome", startDate: "2026-09-01" }, todayEvents: [] },
    ]);

    await mirrorTripListEntries(database, [
      { trip: { id: "trip-b", status: "upcoming", name: "Rome", startDate: "2026-09-01" }, todayEvents: [] },
    ]);

    expect(await database.trips.get("trip-a")).toBeUndefined();
    expect((await database.trips.get("trip-b"))?.name).toBe("Rome");
  });

  it("clears orphaned outbox entries when a removed trip had mirrored entity rows", async () => {
    const database = await getOfflineDb("user-mirror-list-delete-outbox");
    await mirrorTripListEntries(database, [
      { trip: { id: "trip-a", status: "upcoming", name: "Paris", startDate: "2026-08-01" }, todayEvents: [] },
      { trip: { id: "trip-b", status: "upcoming", name: "Rome", startDate: "2026-09-01" }, todayEvents: [] },
    ]);
    await database.events.put({
      id: "event-a",
      tripId: "trip-a",
      dayId: null,
      name: "Museum",
      note: null,
      startAt: null,
      endAt: null,
      locationName: null,
      locationAddress: null,
      locationLat: null,
      locationLng: null,
      position: 0,
      cost: null,
      confirmationNumber: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "pending",
    });
    await database.outbox.put({
      id: "outbox-event-a",
      entityType: "event",
      entityId: "event-a",
      operation: "update",
      payload: {},
      createdAt: "2026-06-01T00:00:00.000Z",
      attempts: 0,
    });

    await mirrorTripListEntries(database, [
      { trip: { id: "trip-b", status: "upcoming", name: "Rome", startDate: "2026-09-01" }, todayEvents: [] },
    ]);

    expect(await database.trips.get("trip-a")).toBeUndefined();
    expect(await database.outbox.get("outbox-event-a")).toBeUndefined();
  });

  it("updates an existing mirrored detail snapshot with latest trip metadata", async () => {
    const database = await getOfflineDb("user-mirror-list-detail-sync");
    await mirrorTripDetail(database, buildTripDetail());

    await mirrorTripListEntries(database, [
      {
        trip: {
          id: "trip-1",
          status: "upcoming",
          name: "Tokyo (renamed)",
          startDate: "2026-07-01",
          endDate: "2026-07-10",
        },
        todayEvents: [],
      },
    ]);

    expect((await database.trips.get("trip-1"))?.detailSnapshot?.trip.name).toBe("Tokyo (renamed)");
  });
});

describe("readTripDetailFromMirror", () => {
  it("returns null when the trip is not in the mirror", async () => {
    const database = await getOfflineDb("user-read-detail-missing");
    const result = await readTripDetailFromMirror(database, "missing-trip", new Date("2026-07-05"));
    expect(result).toBeNull();
  });

  it("reconstructs the TripDetailPayload shape from mirrored rows", async () => {
    const database = await getOfflineDb("user-read-detail");
    const detail = buildTripDetail();
    detail.collaborators = [
      {
        id: "collab-1",
        name: "Alex",
        email: "alex@example.com",
        initials: "AL",
        role: "editor",
        tintBg: "#123",
        tintFg: "#456",
      },
    ];
    detail.packingLists = [{ id: "list-1", tripId: "trip-1", name: "Carry-on", position: 0 }];
    detail.reservations = [
      {
        id: "reservation-1",
        tripId: "trip-1",
        type: ReservationType.Lodging,
        provider: "Hotel Tokyo",
        startAt: "2026-07-01T15:00:00.000Z",
        endAt: "2026-07-10T11:00:00.000Z",
        documents: [
          {
            id: "doc-res-1",
            name: "Confirmation",
            kind: DocKind.PDF,
            offline: false,
            scope: "reservation",
          },
        ],
      },
    ];
    detail.days[0].notes = [{ id: "note-1", content: "Book museum in advance", position: 1 }];
    detail.days[0].checklists = [
      {
        id: "checklist-1",
        tripDayId: "day-1",
        position: 2,
        title: "Before arrival",
        items: [{ id: "checklist-item-1", checklistId: "checklist-1", content: "Buy tickets", isChecked: false }],
      },
    ];
    await mirrorTripDetail(database, detail);

    const result = await readTripDetailFromMirror(database, "trip-1", new Date("2026-07-05"));

    expect(result?.trip.name).toBe("Tokyo");
    expect(result?.trip.status).toBe("active");
    expect(result?.days).toHaveLength(1);
    expect(result?.days[0].events).toHaveLength(1);
    expect(result?.days[0].events[0].docs).toHaveLength(1);
    expect(result?.unscheduledEvents).toHaveLength(1);
    expect(result?.unscheduledEvents[0].docs).toHaveLength(1);
    expect(result?.docs).toHaveLength(3);
    expect(result?.days[0].notes).toEqual(detail.days[0].notes);
    expect(result?.days[0].checklists).toEqual(detail.days[0].checklists);
    expect(result?.packingItems).toHaveLength(1);
    expect(result?.collaborators).toEqual(detail.collaborators);
    expect(result?.packingLists).toEqual(detail.packingLists);
    expect(result?.reservations).toEqual(detail.reservations);
  });

  it("handles a day with no events and an event with no documents", async () => {
    const database = await getOfflineDb("user-read-detail-empty");
    const detail: TripDetailPayload = {
      trip: { id: "trip-empty", status: "upcoming", name: "Empty Trip" },
      days: [
        { id: "day-empty", tripId: "trip-empty", dayNumber: 1, label: "Day 1", events: [] },
        {
          id: "day-with-event",
          tripId: "trip-empty",
          dayNumber: 2,
          label: "Day 2",
          events: [{ id: "event-no-docs", tripId: "trip-empty", dayId: "day-with-event", name: "Walk", position: 0 }],
        },
      ],
      unscheduledEvents: [],
      docs: [],
      collaborators: [],
      packingItems: [],
      packingLists: [],
      reservations: [],
    };
    await mirrorTripDetail(database, detail);

    const result = await readTripDetailFromMirror(database, "trip-empty", new Date("2026-07-05"));

    expect(result?.days.find((day) => day.id === "day-empty")?.events).toEqual([]);
    expect(result?.days.find((day) => day.id === "day-with-event")?.events[0].docs).toEqual([]);
  });

  it("falls back to normalized rows when no detail snapshot exists", async () => {
    const database = await getOfflineDb("user-read-detail-fallback");
    await database.trips.put({
      id: "trip-fallback",
      ownerId: "user-read-detail-fallback",
      name: "Fallback Trip",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      destinationName: null,
      destinationCountry: null,
      coverImageUrl: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      listEntrySnapshot: null,
      detailSnapshot: null,
    });
    await database.days.put({
      id: "day-fallback",
      tripId: "trip-fallback",
      dayNumber: 1,
      date: "2026-07-01",
      label: "Day 1",
      subtitle: null,
    });
    await database.events.put({
      id: "event-fallback",
      tripId: "trip-fallback",
      dayId: "day-fallback",
      name: "Station",
      note: null,
      startAt: "2026-07-01T09:00:00.000Z",
      endAt: null,
      locationName: null,
      locationAddress: null,
      locationLat: null,
      locationLng: null,
      position: 0,
      cost: null,
      confirmationNumber: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "synced",
    });
    await database.documents.put({
      id: "doc-fallback",
      tripId: "trip-fallback",
      eventId: "event-fallback",
      reservationId: null,
      name: "Boarding pass",
      kind: DocKind.PDF,
      scope: "event",
      size: null,
      offline: false,
      url: "https://example.com/boarding-pass.pdf",
      addedAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "synced",
    });
    await database.packingItems.put({
      id: "packing-fallback",
      tripId: "trip-fallback",
      listId: null,
      name: "Passport",
      done: false,
      isLabel: false,
      position: 0,
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "synced",
    });

    const result = await readTripDetailFromMirror(database, "trip-fallback", new Date("2026-07-02T12:00:00.000Z"));

    expect(result?.trip.status).toBe("active");
    expect(result?.days[0].events[0].docs?.[0].name).toBe("Boarding pass");
    expect(result?.packingItems[0].name).toBe("Passport");
    expect(result?.collaborators).toEqual([]);
    expect(result?.packingLists).toEqual([]);
    expect(result?.reservations).toEqual([]);
  });

  it("falls back to normalized rows with unscheduled events and trip-scoped docs", async () => {
    const database = await getOfflineDb("user-read-detail-fallback-unscheduled");
    await database.trips.put({
      id: "trip-fallback",
      ownerId: "user-read-detail-fallback-unscheduled",
      name: "Fallback Trip",
      startDate: undefined,
      endDate: undefined,
      destinationName: null,
      destinationCountry: null,
      coverImageUrl: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      listEntrySnapshot: null,
      detailSnapshot: null,
    });
    await database.events.put({
      id: "event-unscheduled",
      tripId: "trip-fallback",
      dayId: null,
      name: "Airport transfer",
      note: null,
      startAt: null,
      endAt: null,
      locationName: null,
      locationAddress: null,
      locationLat: null,
      locationLng: null,
      position: 0,
      cost: null,
      confirmationNumber: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "synced",
    });
    await database.documents.put({
      id: "doc-trip",
      tripId: "trip-fallback",
      eventId: null,
      reservationId: null,
      name: "Trip overview",
      kind: DocKind.Doc,
      scope: "trip",
      size: null,
      offline: false,
      url: "https://example.com/overview",
      addedAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "synced",
    });

    const result = await readTripDetailFromMirror(database, "trip-fallback", new Date("2026-07-02T12:00:00.000Z"));

    expect(result?.unscheduledEvents).toEqual([
      expect.objectContaining({
        id: "event-unscheduled",
        docs: [],
      }),
    ]);
    expect(result?.docs).toEqual([
      expect.objectContaining({
        id: "doc-trip",
        scope: "trip",
      }),
    ]);
  });
});

describe("readTripListFromMirror", () => {
  it("returns mirrored trips for the database's userId sorted by startDate", async () => {
    const database = await getOfflineDb("user-read-list");
    const entries: TripListEntry[] = [
      {
        trip: { id: "trip-later", status: "upcoming", name: "Later", startDate: "2026-09-01" },
        todayEvents: [{ id: "event-later", name: "Dinner", startAt: "2026-07-05T18:00:00.000Z", position: 0 }],
      },
      {
        trip: { id: "trip-sooner", status: "upcoming", name: "Sooner", startDate: "2026-08-01" },
        todayEvents: [{ id: "event-sooner", name: "Train", startAt: "2026-07-05T09:00:00.000Z", position: 0 }],
      },
    ];
    await mirrorTripListEntries(database, entries);

    const result = await readTripListFromMirror(database, new Date("2026-07-05"));

    expect(result.map((entry) => entry.trip.id)).toEqual(["trip-sooner", "trip-later"]);
    expect(result.map((entry) => entry.todayEvents[0]?.id)).toEqual(["event-sooner", "event-later"]);
  });

  it("sorts trips without a startDate before dated trips", async () => {
    const database = await getOfflineDb("user-read-list-undated");
    const entries: TripListEntry[] = [
      { trip: { id: "trip-dated", status: "upcoming", name: "Dated", startDate: "2026-08-01" }, todayEvents: [] },
      { trip: { id: "trip-undated", status: "upcoming", name: "Undated" }, todayEvents: [] },
    ];
    await mirrorTripListEntries(database, entries);

    const result = await readTripListFromMirror(database, new Date("2026-07-05"));

    expect(result.map((entry) => entry.trip.id)).toEqual(["trip-undated", "trip-dated"]);
  });

  it("falls back to normalized rows when no list snapshot exists", async () => {
    const database = await getOfflineDb("user-read-list-fallback");
    await database.trips.put({
      id: "trip-fallback",
      ownerId: "user-read-list-fallback",
      name: "Fallback Trip",
      startDate: "2026-08-01",
      endDate: "2026-08-03",
      destinationName: null,
      destinationCountry: null,
      coverImageUrl: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      listEntrySnapshot: null,
      detailSnapshot: null,
    });

    const result = await readTripListFromMirror(database, new Date("2026-08-02T12:00:00.000Z"));

    expect(result).toEqual([
      {
        trip: expect.objectContaining({ id: "trip-fallback", status: "active", name: "Fallback Trip" }),
        todayEvents: [],
      },
    ]);
  });
});

describe("useOfflineEntitySyncStatus", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns synced when no database session is available", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => null }));

    const { result } = renderHook(() => useOfflineEntitySyncStatus("event", "missing"));

    await waitFor(() => expect(result.current).toBe("synced"));
  });

  it("reads event sync status from the local mirror", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ user: { id: "sync-status-user" } }) }));
    const database = await getOfflineDb("sync-status-user");
    await database.events.put({
      id: "event-sync",
      tripId: "trip-1",
      dayId: "day-1",
      name: "Museum",
      note: null,
      startAt: null,
      endAt: null,
      locationName: null,
      locationAddress: null,
      locationLat: null,
      locationLng: null,
      position: 0,
      cost: null,
      confirmationNumber: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "pending",
    });

    const { result } = renderHook(() => useOfflineEntitySyncStatus("event", "event-sync"));

    await waitFor(() => expect(result.current).toBe("pending"));
  });

  it("reads document and packing-item sync status from the local mirror", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ user: { id: "sync-status-user-2" } }) }));
    const database = await getOfflineDb("sync-status-user-2");
    await database.documents.put({
      id: "doc-sync",
      tripId: "trip-1",
      eventId: null,
      reservationId: null,
      name: "Boarding pass",
      kind: "pdf",
      scope: "trip",
      size: null,
      offline: true,
      url: null,
      addedAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "pending",
    });
    await database.packingItems.put({
      id: "packing-sync",
      tripId: "trip-1",
      listId: null,
      name: "Passport",
      done: false,
      isLabel: false,
      position: 0,
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "pending",
    });

    const { result: documentResult } = renderHook(() => useOfflineEntitySyncStatus("document", "doc-sync"));
    const { result: packingResult } = renderHook(() => useOfflineEntitySyncStatus("packingItem", "packing-sync"));

    await waitFor(() => expect(documentResult.current).toBe("pending"));
    await waitFor(() => expect(packingResult.current).toBe("pending"));
  });
});

describe("offline local write paths", () => {
  it("writeEventLocally writes pending event row and matching outbox entry", async () => {
    const database = await getOfflineDb("user-local-event");
    await database.trips.put({
      id: "trip-1",
      ownerId: "user-local-event",
      name: "Tokyo",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      destinationName: null,
      destinationCountry: null,
      coverImageUrl: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      listEntrySnapshot: null,
      detailSnapshot: buildTripDetail(),
    });

    await writeEventLocally(database, "trip-1", "day-1", {
      id: "10000000-0000-4000-8000-000000000001",
      name: "Offline museum",
      afterEventId: "event-1",
      insertAtPosition: 1,
    });

    const eventRow = await database.events.get("10000000-0000-4000-8000-000000000001");
    const outboxRows = await database.outbox.toArray();

    expect(eventRow).toEqual(
      expect.objectContaining({
        id: "10000000-0000-4000-8000-000000000001",
        tripId: "trip-1",
        dayId: "day-1",
        name: "Offline museum",
        syncStatus: "pending",
      })
    );
    expect(outboxRows).toHaveLength(1);
    expect(outboxRows[0]).toEqual(
      expect.objectContaining({
        entityType: "event",
        entityId: "10000000-0000-4000-8000-000000000001",
        operation: "create",
        attempts: 0,
      })
    );
  });

  it("writeEventLocally stores locationLat and locationLng on the new row", async () => {
    const database = await getOfflineDb("user-local-event-coords-create");
    await database.trips.put({
      id: "trip-1",
      ownerId: "user-local-event-coords-create",
      name: "Tokyo",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      destinationName: null,
      destinationCountry: null,
      coverImageUrl: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      listEntrySnapshot: null,
      detailSnapshot: buildTripDetail(),
    });

    await writeEventLocally(database, "trip-1", "day-1", {
      id: "10000000-0000-4000-8000-000000000002",
      name: "Offline museum",
      locationLat: 35.6586,
      locationLng: 139.7454,
    });

    expect(await database.events.get("10000000-0000-4000-8000-000000000002")).toEqual(
      expect.objectContaining({
        locationLat: 35.6586,
        locationLng: 139.7454,
      })
    );
  });

  it("writeEventLocally throws when the caller-supplied id is not a UUID", async () => {
    const database = await getOfflineDb("user-local-event-bad-id");
    await database.trips.put({
      id: "trip-1",
      ownerId: "user-local-event-bad-id",
      name: "Tokyo",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      destinationName: null,
      destinationCountry: null,
      coverImageUrl: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      listEntrySnapshot: null,
      detailSnapshot: buildTripDetail(),
    });

    await expect(
      writeEventLocally(database, "trip-1", "day-1", {
        id: "not-a-uuid",
        name: "Offline museum",
      })
    ).rejects.toThrow("Invalid client-supplied id: must be a UUID");
  });

  it("writeEventLocally shifts existing event positions when inserting at a position", async () => {
    const database = await getOfflineDb("user-local-event-insert");
    await database.trips.put({
      id: "trip-1",
      ownerId: "user-local-event-insert",
      name: "Tokyo",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      destinationName: null,
      destinationCountry: null,
      coverImageUrl: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      listEntrySnapshot: null,
      detailSnapshot: buildTripDetail(),
    });
    await database.events.put({
      id: "event-a",
      tripId: "trip-1",
      dayId: "day-1",
      name: "Breakfast",
      note: null,
      startAt: null,
      endAt: null,
      locationName: null,
      locationAddress: null,
      locationLat: null,
      locationLng: null,
      position: 0,
      cost: null,
      confirmationNumber: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "synced",
    });
    await database.events.put({
      id: "event-b",
      tripId: "trip-1",
      dayId: "day-1",
      name: "Lunch",
      note: null,
      startAt: null,
      endAt: null,
      locationName: null,
      locationAddress: null,
      locationLat: null,
      locationLng: null,
      position: 1,
      cost: null,
      confirmationNumber: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "synced",
    });

    await writeEventLocally(database, "trip-1", "day-1", {
      id: "10000000-0000-4000-8000-000000000003",
      name: "Offline museum",
      insertAtPosition: 1,
    });

    expect((await database.events.get("event-b"))?.position).toBe(2);
    expect((await database.events.get("10000000-0000-4000-8000-000000000003"))?.position).toBe(1);
  });

  it("writeEventLocally inserts after a target event and shifts following rows", async () => {
    const database = await getOfflineDb("user-local-event-after");
    await database.trips.put({
      id: "trip-1",
      ownerId: "user-local-event-after",
      name: "Tokyo",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      destinationName: null,
      destinationCountry: null,
      coverImageUrl: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      listEntrySnapshot: null,
      detailSnapshot: buildTripDetail(),
    });
    await database.events.put({
      id: "event-a",
      tripId: "trip-1",
      dayId: "day-1",
      name: "Breakfast",
      note: null,
      startAt: null,
      endAt: null,
      locationName: null,
      locationAddress: null,
      locationLat: null,
      locationLng: null,
      position: 0,
      cost: null,
      confirmationNumber: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "synced",
    });
    await database.events.put({
      id: "event-b",
      tripId: "trip-1",
      dayId: "day-1",
      name: "Lunch",
      note: null,
      startAt: null,
      endAt: null,
      locationName: null,
      locationAddress: null,
      locationLat: null,
      locationLng: null,
      position: 1,
      cost: null,
      confirmationNumber: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "synced",
    });

    await writeEventLocally(database, "trip-1", "day-1", {
      id: "10000000-0000-4000-8000-000000000004",
      name: "Offline coffee",
      afterEventId: "event-a",
    });

    expect((await database.events.get("10000000-0000-4000-8000-000000000004"))?.position).toBe(1);
    expect((await database.events.get("event-b"))?.position).toBe(2);
  });

  it("writeEventLocally appends when afterEventId does not match a row", async () => {
    const database = await getOfflineDb("user-local-event-after-missing");
    await database.trips.put({
      id: "trip-1",
      ownerId: "user-local-event-after-missing",
      name: "Tokyo",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      destinationName: null,
      destinationCountry: null,
      coverImageUrl: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      listEntrySnapshot: null,
      detailSnapshot: buildTripDetail(),
    });
    await database.events.put({
      id: "event-a",
      tripId: "trip-1",
      dayId: "day-1",
      name: "Breakfast",
      note: null,
      startAt: null,
      endAt: null,
      locationName: null,
      locationAddress: null,
      locationLat: null,
      locationLng: null,
      position: 0,
      cost: null,
      confirmationNumber: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "synced",
    });

    await writeEventLocally(database, "trip-1", "day-1", {
      id: "10000000-0000-4000-8000-000000000005",
      name: "Offline dinner",
      afterEventId: "missing-event",
    });

    expect((await database.events.get("10000000-0000-4000-8000-000000000005"))?.position).toBe(1);
  });

  it("writeEventLocally still writes rows when trip mirror row is missing", async () => {
    const database = await getOfflineDb("user-local-event-no-trip");

    await writeEventLocally(database, "trip-missing", "day-1", {
      id: "10000000-0000-4000-8000-000000000006",
      name: "Offline museum",
    });

    expect(await database.events.get("10000000-0000-4000-8000-000000000006")).toEqual(
      expect.objectContaining({
        tripId: "trip-missing",
        syncStatus: "pending",
      })
    );
    expect(await database.outbox.toArray()).toHaveLength(1);
    expect(await database.trips.get("trip-missing")).toBeUndefined();
  });

  it("updateEventLocally marks existing event pending and enqueues update", async () => {
    const database = await getOfflineDb("user-local-event-update");
    await database.trips.put({
      id: "trip-1",
      ownerId: "user-local-event-update",
      name: "Tokyo",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      destinationName: null,
      destinationCountry: null,
      coverImageUrl: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      listEntrySnapshot: null,
      detailSnapshot: buildTripDetail(),
    });
    await database.events.put({
      id: "event-1",
      tripId: "trip-1",
      dayId: "day-1",
      name: "Museum",
      note: null,
      startAt: null,
      endAt: null,
      locationName: null,
      locationAddress: null,
      locationLat: null,
      locationLng: null,
      position: 0,
      cost: null,
      confirmationNumber: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "synced",
    });

    await updateEventLocally(database, "event-1", {
      name: "Museum late entry",
      note: "Bring tickets",
    });

    const eventRow = await database.events.get("event-1");
    const outboxRows = await database.outbox.toArray();

    expect(eventRow).toEqual(
      expect.objectContaining({
        name: "Museum late entry",
        note: "Bring tickets",
        syncStatus: "pending",
      })
    );
    expect(outboxRows[0]).toEqual(
      expect.objectContaining({
        entityType: "event",
        entityId: "event-1",
        operation: "update",
      })
    );
  });

  it("updateEventLocally clears optional event fields when patch explicitly passes undefined", async () => {
    const database = await getOfflineDb("user-local-event-clear");
    await database.trips.put({
      id: "trip-1",
      ownerId: "user-local-event-clear",
      name: "Tokyo",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      destinationName: null,
      destinationCountry: null,
      coverImageUrl: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      listEntrySnapshot: null,
      detailSnapshot: buildTripDetail(),
    });
    await database.events.put({
      id: "event-1",
      tripId: "trip-1",
      dayId: "day-1",
      name: "Museum",
      note: "Existing note",
      startAt: "2026-07-01T09:00:00.000Z",
      endAt: "2026-07-01T10:00:00.000Z",
      locationName: "Tokyo",
      locationAddress: "Tower",
      locationLat: 35.6586,
      locationLng: 139.7454,
      position: 0,
      cost: 25,
      confirmationNumber: "ABC123",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "synced",
    });

    await updateEventLocally(database, "event-1", {
      note: undefined,
      startAt: undefined,
      endAt: undefined,
      locationName: undefined,
      locationAddress: undefined,
      locationLat: undefined,
      locationLng: undefined,
      cost: undefined,
      confirmationNumber: undefined,
    });

    expect(await database.events.get("event-1")).toEqual(
      expect.objectContaining({
        note: null,
        startAt: null,
        endAt: null,
        locationName: null,
        locationAddress: null,
        locationLat: null,
        locationLng: null,
        cost: null,
        confirmationNumber: null,
      })
    );
  });

  it("updateEventLocally updates locationLat and locationLng when patch provides coordinates", async () => {
    const database = await getOfflineDb("user-local-event-coords");
    await database.trips.put({
      id: "trip-1",
      ownerId: "user-local-event-coords",
      name: "Tokyo",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      destinationName: null,
      destinationCountry: null,
      coverImageUrl: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      listEntrySnapshot: null,
      detailSnapshot: buildTripDetail(),
    });
    await database.events.put({
      id: "event-1",
      tripId: "trip-1",
      dayId: "day-1",
      name: "Museum",
      note: null,
      startAt: null,
      endAt: null,
      locationName: null,
      locationAddress: null,
      locationLat: null,
      locationLng: null,
      position: 0,
      cost: null,
      confirmationNumber: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "synced",
    });

    await updateEventLocally(database, "event-1", {
      locationLat: 35.6586,
      locationLng: 139.7454,
    });

    expect(await database.events.get("event-1")).toEqual(
      expect.objectContaining({
        locationLat: 35.6586,
        locationLng: 139.7454,
      })
    );
  });

  it("updateEventLocally no-ops when the target row is missing", async () => {
    const database = await getOfflineDb("user-local-event-missing");

    await updateEventLocally(database, "missing-event", {
      name: "Ignored",
    });

    expect(await database.events.get("missing-event")).toBeUndefined();
    expect(await database.outbox.toArray()).toEqual([]);
  });

  it("updateEventLocally updates event rows without requiring a trip snapshot row", async () => {
    const database = await getOfflineDb("user-local-event-update-no-trip");
    await database.events.put({
      id: "event-1",
      tripId: "trip-missing",
      dayId: "day-1",
      name: "Museum",
      note: null,
      startAt: null,
      endAt: null,
      locationName: null,
      locationAddress: null,
      locationLat: null,
      locationLng: null,
      position: 0,
      cost: null,
      confirmationNumber: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "synced",
    });

    await updateEventLocally(database, "event-1", {
      name: "Offline museum",
    });

    expect(await database.events.get("event-1")).toEqual(
      expect.objectContaining({
        name: "Offline museum",
        syncStatus: "pending",
      })
    );
    expect(await database.outbox.toArray()).toHaveLength(1);
    expect(await database.trips.get("trip-missing")).toBeUndefined();
  });

  it("writeDocumentLocally writes pending document row and matching outbox entry", async () => {
    const database = await getOfflineDb("user-local-doc");
    await database.trips.put({
      id: "trip-1",
      ownerId: "user-local-doc",
      name: "Tokyo",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      destinationName: null,
      destinationCountry: null,
      coverImageUrl: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      listEntrySnapshot: null,
      detailSnapshot: buildTripDetail(),
    });

    const file = new File(["content"], "boarding.pdf", { type: "application/pdf" });

    await writeDocumentLocally(database, {
      id: "20000000-0000-4000-8000-000000000001",
      tripId: "trip-1",
      file,
    });

    const documentRow = await database.documents.get("20000000-0000-4000-8000-000000000001");
    const outboxRows = await database.outbox.toArray();

    expect(documentRow).toEqual(
      expect.objectContaining({
        id: "20000000-0000-4000-8000-000000000001",
        name: "boarding.pdf",
        syncStatus: "pending",
        offline: true,
      })
    );
    expect(outboxRows[0]).toEqual(
      expect.objectContaining({
        entityType: "document",
        entityId: "20000000-0000-4000-8000-000000000001",
        operation: "create",
      })
    );
  });

  it("writeDocumentLocally throws when the caller-supplied id is not a UUID", async () => {
    const database = await getOfflineDb("user-local-doc-bad-id");
    const file = new File(["content"], "boarding.pdf", { type: "application/pdf" });

    await expect(
      writeDocumentLocally(database, {
        id: "not-a-uuid",
        tripId: "trip-1",
        file,
      })
    ).rejects.toThrow("Invalid client-supplied id: must be a UUID");
  });

  it("writeDocumentLocally resolves tripId from the event row when only eventId is provided", async () => {
    const database = await getOfflineDb("user-local-doc-event");
    await database.trips.put({
      id: "trip-1",
      ownerId: "user-local-doc-event",
      name: "Tokyo",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      destinationName: null,
      destinationCountry: null,
      coverImageUrl: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      listEntrySnapshot: null,
      detailSnapshot: buildTripDetail(),
    });
    await database.events.put({
      id: "event-1",
      tripId: "trip-1",
      dayId: "day-1",
      name: "Museum",
      note: null,
      startAt: null,
      endAt: null,
      locationName: null,
      locationAddress: null,
      locationLat: null,
      locationLng: null,
      position: 0,
      cost: null,
      confirmationNumber: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "synced",
    });

    await writeDocumentLocally(database, {
      id: "20000000-0000-4000-8000-000000000002",
      eventId: "event-1",
      file: new File(["content"], "ticket.pdf", { type: "application/pdf" }),
    });

    expect(await database.documents.get("20000000-0000-4000-8000-000000000002")).toEqual(
      expect.objectContaining({
        tripId: "trip-1",
        eventId: "event-1",
        scope: "event",
      })
    );
  });

  it("writeDocumentLocally throws when neither tripId nor event lookup resolves", async () => {
    const database = await getOfflineDb("user-local-doc-missing");

    await expect(
      writeDocumentLocally(database, {
        id: "20000000-0000-4000-8000-000000000003",
        eventId: "missing-event",
        file: new File(["content"], "ticket.pdf", { type: "application/pdf" }),
      })
    ).rejects.toThrow("Event not found");

    expect(await database.documents.get("20000000-0000-4000-8000-000000000003")).toBeUndefined();
    expect(await database.outbox.toArray()).toEqual([]);
  });

  it("writeDocumentLocally throws when no trip context is supplied", async () => {
    const database = await getOfflineDb("user-local-doc-no-trip-context");

    await expect(
      writeDocumentLocally(database, {
        id: "20000000-0000-4000-8000-000000000097",
        file: new File(["content"], "ticket.pdf", { type: "application/pdf" }),
      })
    ).rejects.toThrow("Trip not found");

    expect(await database.documents.get("20000000-0000-4000-8000-000000000097")).toBeUndefined();
    expect(await database.outbox.toArray()).toEqual([]);
  });

  it("writeDocumentLocally uses reservation scope when reservationId is provided", async () => {
    const database = await getOfflineDb("user-local-doc-reservation");
    await database.trips.put({
      id: "trip-1",
      ownerId: "user-local-doc-reservation",
      name: "Tokyo",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      destinationName: null,
      destinationCountry: null,
      coverImageUrl: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      listEntrySnapshot: null,
      detailSnapshot: buildTripDetail(),
    });

    await writeDocumentLocally(database, {
      id: "20000000-0000-4000-8000-000000000004",
      tripId: "trip-1",
      reservationId: "reservation-1",
      file: new File(["content"], "confirmation.pdf", { type: "application/pdf" }),
    });

    expect(await database.documents.get("20000000-0000-4000-8000-000000000004")).toEqual(
      expect.objectContaining({
        tripId: "trip-1",
        reservationId: "reservation-1",
        scope: "reservation",
      })
    );
  });

  it("writeDocumentLocally still writes rows when trip mirror row is missing", async () => {
    const database = await getOfflineDb("user-local-doc-no-trip");

    await writeDocumentLocally(database, {
      id: "20000000-0000-4000-8000-000000000005",
      tripId: "trip-missing",
      file: new File(["content"], "ticket.pdf", { type: "application/pdf" }),
    });

    expect(await database.documents.get("20000000-0000-4000-8000-000000000005")).toEqual(
      expect.objectContaining({
        tripId: "trip-missing",
        scope: "trip",
        syncStatus: "pending",
      })
    );
    expect(await database.outbox.toArray()).toHaveLength(1);
    expect(await database.trips.get("trip-missing")).toBeUndefined();
  });

  it("writePackingItemLocally writes pending packing row and outbox entry", async () => {
    const database = await getOfflineDb("user-local-pack");
    await database.trips.put({
      id: "trip-1",
      ownerId: "user-local-pack",
      name: "Tokyo",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      destinationName: null,
      destinationCountry: null,
      coverImageUrl: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      listEntrySnapshot: null,
      detailSnapshot: buildTripDetail(),
    });

    await writePackingItemLocally(database, {
      operation: "create",
      tripId: "trip-1",
      input: {
        id: "30000000-0000-4000-8000-000000000001",
        name: "Passport",
      },
    });

    const packingRow = await database.packingItems.get("30000000-0000-4000-8000-000000000001");
    const outboxRows = await database.outbox.toArray();

    expect(packingRow).toEqual(
      expect.objectContaining({
        id: "30000000-0000-4000-8000-000000000001",
        name: "Passport",
        syncStatus: "pending",
      })
    );
    expect(outboxRows[0]).toEqual(
      expect.objectContaining({
        entityType: "packingItem",
        entityId: "30000000-0000-4000-8000-000000000001",
        operation: "create",
      })
    );
  });

  it("writePackingItemLocally updates and toggles existing rows", async () => {
    const database = await getOfflineDb("user-local-pack-update");
    await database.trips.put({
      id: "trip-1",
      ownerId: "user-local-pack-update",
      name: "Tokyo",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      destinationName: null,
      destinationCountry: null,
      coverImageUrl: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      listEntrySnapshot: null,
      detailSnapshot: buildTripDetail(),
    });
    await database.packingItems.put({
      id: "packing-1",
      tripId: "trip-1",
      listId: null,
      name: "Passport",
      done: false,
      isLabel: false,
      position: 0,
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "synced",
    });

    await writePackingItemLocally(database, {
      operation: "update",
      itemId: "packing-1",
      patch: { name: "Passport holder" },
    });
    await writePackingItemLocally(database, {
      operation: "toggle",
      itemId: "packing-1",
    });

    expect(await database.packingItems.get("packing-1")).toEqual(
      expect.objectContaining({
        name: "Passport holder",
        done: true,
        syncStatus: "pending",
      })
    );
    expect(await database.outbox.toArray()).toHaveLength(2);
  });

  it("writePackingItemLocally inserts before a target row and shifts following items", async () => {
    const database = await getOfflineDb("user-local-pack-before");
    await database.trips.put({
      id: "trip-1",
      ownerId: "user-local-pack-before",
      name: "Tokyo",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      destinationName: null,
      destinationCountry: null,
      coverImageUrl: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      listEntrySnapshot: null,
      detailSnapshot: buildTripDetail(),
    });
    await database.packingItems.put({
      id: "packing-a",
      tripId: "trip-1",
      listId: null,
      name: "Passport",
      done: false,
      isLabel: false,
      position: 0,
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "synced",
    });
    await database.packingItems.put({
      id: "packing-b",
      tripId: "trip-1",
      listId: null,
      name: "Adapter",
      done: false,
      isLabel: false,
      position: 1,
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "synced",
    });

    await writePackingItemLocally(database, {
      operation: "create",
      tripId: "trip-1",
      input: {
        id: "30000000-0000-4000-8000-000000000002",
        name: "Tickets",
        beforeItemId: "packing-b",
      },
    });

    expect((await database.packingItems.get("30000000-0000-4000-8000-000000000002"))?.position).toBe(1);
    expect((await database.packingItems.get("packing-b"))?.position).toBe(2);
  });

  it("writePackingItemLocally inserts after a target row and shifts following items", async () => {
    const database = await getOfflineDb("user-local-pack-after");
    await database.trips.put({
      id: "trip-1",
      ownerId: "user-local-pack-after",
      name: "Tokyo",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      destinationName: null,
      destinationCountry: null,
      coverImageUrl: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      listEntrySnapshot: null,
      detailSnapshot: buildTripDetail(),
    });
    await database.packingItems.put({
      id: "packing-a",
      tripId: "trip-1",
      listId: null,
      name: "Passport",
      done: false,
      isLabel: false,
      position: 0,
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "synced",
    });
    await database.packingItems.put({
      id: "packing-b",
      tripId: "trip-1",
      listId: null,
      name: "Adapter",
      done: false,
      isLabel: false,
      position: 1,
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "synced",
    });

    await writePackingItemLocally(database, {
      operation: "create",
      tripId: "trip-1",
      input: {
        id: "30000000-0000-4000-8000-000000000003",
        name: "Tickets",
        afterItemId: "packing-a",
      },
    });

    expect((await database.packingItems.get("30000000-0000-4000-8000-000000000003"))?.position).toBe(1);
    expect((await database.packingItems.get("packing-b"))?.position).toBe(2);
  });

  it("writePackingItemLocally throws when afterItemId does not match a row", async () => {
    const database = await getOfflineDb("user-local-pack-after-missing");
    await database.trips.put({
      id: "trip-1",
      ownerId: "user-local-pack-after-missing",
      name: "Tokyo",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      destinationName: null,
      destinationCountry: null,
      coverImageUrl: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      listEntrySnapshot: null,
      detailSnapshot: buildTripDetail(),
    });

    await expect(
      writePackingItemLocally(database, {
        operation: "create",
        tripId: "trip-1",
        input: {
          id: "30000000-0000-4000-8000-000000000006",
          name: "Tickets",
          afterItemId: "missing-item",
        },
      })
    ).rejects.toThrow("Target item not found");
  });

  it("writePackingItemLocally throws when beforeItemId does not match a row", async () => {
    const database = await getOfflineDb("user-local-pack-before-missing");
    await database.trips.put({
      id: "trip-1",
      ownerId: "user-local-pack-before-missing",
      name: "Tokyo",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      destinationName: null,
      destinationCountry: null,
      coverImageUrl: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      listEntrySnapshot: null,
      detailSnapshot: buildTripDetail(),
    });

    await expect(
      writePackingItemLocally(database, {
        operation: "create",
        tripId: "trip-1",
        input: {
          id: "30000000-0000-4000-8000-000000000007",
          name: "Tickets",
          beforeItemId: "missing-item",
        },
      })
    ).rejects.toThrow("Target item not found");
  });

  it("writePackingItemLocally throws when the caller-supplied id is not a UUID", async () => {
    const database = await getOfflineDb("user-local-pack-bad-id");
    await database.trips.put({
      id: "trip-1",
      ownerId: "user-local-pack-bad-id",
      name: "Tokyo",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      destinationName: null,
      destinationCountry: null,
      coverImageUrl: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      listEntrySnapshot: null,
      detailSnapshot: buildTripDetail(),
    });

    await expect(
      writePackingItemLocally(database, {
        operation: "create",
        tripId: "trip-1",
        input: {
          id: "not-a-uuid",
          name: "Tickets",
        },
      })
    ).rejects.toThrow("Invalid client-supplied id: must be a UUID");
  });

  it("writePackingItemLocally ignores blank create and update names", async () => {
    const database = await getOfflineDb("user-local-pack-blank");
    await database.trips.put({
      id: "trip-1",
      ownerId: "user-local-pack-blank",
      name: "Tokyo",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      destinationName: null,
      destinationCountry: null,
      coverImageUrl: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      listEntrySnapshot: null,
      detailSnapshot: buildTripDetail(),
    });
    await database.packingItems.put({
      id: "packing-1",
      tripId: "trip-1",
      listId: null,
      name: "Passport",
      done: false,
      isLabel: false,
      position: 0,
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "synced",
    });

    await writePackingItemLocally(database, {
      operation: "create",
      tripId: "trip-1",
      input: {
        id: "30000000-0000-4000-8000-000000000004",
        name: "   ",
      },
    });
    await writePackingItemLocally(database, {
      operation: "update",
      itemId: "packing-1",
      patch: {
        name: "   ",
      },
    });

    expect(await database.packingItems.get("30000000-0000-4000-8000-000000000004")).toBeUndefined();
    expect((await database.packingItems.get("packing-1"))?.name).toBe("Passport");
  });

  it("writePackingItemLocally no-ops when update target row is missing", async () => {
    const database = await getOfflineDb("user-local-pack-missing");

    await writePackingItemLocally(database, {
      operation: "toggle",
      itemId: "missing-item",
    });

    expect(await database.packingItems.get("missing-item")).toBeUndefined();
    expect(await database.outbox.toArray()).toEqual([]);
  });

  it("writePackingItemLocally still writes created rows when trip mirror row is missing", async () => {
    const database = await getOfflineDb("user-local-pack-no-trip");

    await writePackingItemLocally(database, {
      operation: "create",
      tripId: "trip-missing",
      input: {
        id: "30000000-0000-4000-8000-000000000005",
        name: "Passport",
      },
    });

    expect(await database.packingItems.get("30000000-0000-4000-8000-000000000005")).toEqual(
      expect.objectContaining({
        tripId: "trip-missing",
        syncStatus: "pending",
      })
    );
    expect(await database.outbox.toArray()).toHaveLength(1);
    expect(await database.trips.get("trip-missing")).toBeUndefined();
  });

  it("writePackingItemLocally updates rows without requiring a trip snapshot row", async () => {
    const database = await getOfflineDb("user-local-pack-update-no-trip");
    await database.packingItems.put({
      id: "packing-1",
      tripId: "trip-missing",
      listId: null,
      name: "Passport",
      done: false,
      isLabel: false,
      position: 0,
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "synced",
    });

    await writePackingItemLocally(database, {
      operation: "update",
      itemId: "packing-1",
      patch: { name: "Passport holder" },
    });

    expect(await database.packingItems.get("packing-1")).toEqual(
      expect.objectContaining({
        name: "Passport holder",
        syncStatus: "pending",
      })
    );
    expect(await database.outbox.toArray()).toHaveLength(1);
    expect(await database.trips.get("trip-missing")).toBeUndefined();
  });

  it("mirrorTripDetail preserves pending local document and packing rows", async () => {
    const database = await getOfflineDb("user-pending-merge-doc-pack");
    await database.trips.put({
      id: "trip-1",
      ownerId: "user-pending-merge-doc-pack",
      name: "Tokyo",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      destinationName: null,
      destinationCountry: null,
      coverImageUrl: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      listEntrySnapshot: null,
      detailSnapshot: buildTripDetail(),
    });
    await database.documents.put({
      id: "doc-trip-1",
      tripId: "trip-1",
      eventId: null,
      reservationId: null,
      name: "Offline itinerary",
      kind: "pdf",
      scope: "trip",
      size: null,
      offline: true,
      url: null,
      addedAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "pending",
    });
    await database.packingItems.put({
      id: "packing-1",
      tripId: "trip-1",
      listId: null,
      name: "Offline passport",
      done: true,
      isLabel: false,
      position: 0,
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "pending",
    });

    await mirrorTripDetail(database, buildTripDetail());

    expect(await database.documents.get("doc-trip-1")).toEqual(
      expect.objectContaining({
        name: "Offline itinerary",
        syncStatus: "pending",
      })
    );
    expect(await database.packingItems.get("packing-1")).toEqual(
      expect.objectContaining({
        name: "Offline passport",
        done: true,
        syncStatus: "pending",
      })
    );
  });

  it("mirrorTripDetail renumbers packing item positions per list after merging pending rows", async () => {
    const database = await getOfflineDb("user-pending-merge-pack-positions");
    await database.trips.put({
      id: "trip-1",
      ownerId: "user-pending-merge-pack-positions",
      name: "Tokyo",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      destinationName: null,
      destinationCountry: null,
      coverImageUrl: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      listEntrySnapshot: null,
      detailSnapshot: buildTripDetail(),
    });
    await database.packingItems.put({
      id: "30000000-0000-4000-8000-000000000008",
      tripId: "trip-1",
      listId: "list-1",
      name: "Offline adapter",
      done: false,
      isLabel: false,
      position: 0,
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "pending",
    });

    await mirrorTripDetail(database, buildTripDetail());

    const listRows = (await database.packingItems.toArray())
      .filter((row) => row.listId === "list-1")
      .sort((first, second) => first.position - second.position);

    expect(listRows.map((row) => row.id)).toEqual(["packing-1", "30000000-0000-4000-8000-000000000008"]);
    expect(listRows.map((row) => row.position)).toEqual([0, 1]);
  });

  it("mirrorTripDetail preserves pending local entity rows over fresh server data", async () => {
    const database = await getOfflineDb("user-pending-merge");
    await database.trips.put({
      id: "trip-1",
      ownerId: "user-pending-merge",
      name: "Tokyo",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      destinationName: null,
      destinationCountry: null,
      coverImageUrl: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      listEntrySnapshot: null,
      detailSnapshot: buildTripDetail(),
    });
    await database.events.put({
      id: "event-1",
      tripId: "trip-1",
      dayId: "day-1",
      name: "Offline renamed museum",
      note: null,
      startAt: null,
      endAt: null,
      locationName: null,
      locationAddress: null,
      locationLat: null,
      locationLng: null,
      position: 0,
      cost: null,
      confirmationNumber: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-02T00:00:00.000Z",
      syncStatus: "pending",
    });

    const detail = buildTripDetail();
    detail.days[0].events[0].name = "Server museum";
    await mirrorTripDetail(database, detail);

    expect(await database.events.get("event-1")).toEqual(
      expect.objectContaining({
        name: "Offline renamed museum",
        syncStatus: "pending",
      })
    );
    expect((await database.trips.get("trip-1"))?.detailSnapshot?.days[0].events[0]?.name).toBe(
      "Offline renamed museum"
    );
  });
});

describe("offline write parity helpers", () => {
  async function seedMirroredTrip(database: Awaited<ReturnType<typeof getOfflineDb>>, userId: string): Promise<void> {
    await database.trips.put({
      id: "trip-1",
      ownerId: userId,
      name: "Tokyo",
      startDate: "2026-07-01",
      endDate: "2026-07-03",
      destinationName: null,
      destinationCountry: null,
      coverImageUrl: null,
      notes: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      listEntrySnapshot: null,
      detailSnapshot: buildTripDetail(),
    });
    await mirrorTripDetail(database, buildTripDetail());
  }

  it("reorderEventsLocally marks affected events pending, enqueues updates, and refreshes the snapshot", async () => {
    const database = await getOfflineDb("user-offline-reorder");
    await seedMirroredTrip(database, "user-offline-reorder");
    await database.events.put({
      id: "event-3",
      tripId: "trip-1",
      dayId: "day-1",
      name: "Dinner",
      note: null,
      startAt: null,
      endAt: null,
      locationName: null,
      locationAddress: null,
      locationLat: null,
      locationLng: null,
      position: 1,
      cost: null,
      confirmationNumber: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "synced",
    });

    await reorderEventsLocally(database, "day-1", [
      { id: "event-3", position: 0 },
      { id: "event-1", position: 1 },
    ]);

    expect(await database.events.get("event-3")).toEqual(
      expect.objectContaining({ position: 0, syncStatus: "pending" })
    );
    expect(await database.events.get("event-1")).toEqual(
      expect.objectContaining({ position: 1, syncStatus: "pending" })
    );
    expect(
      (await database.outbox.toArray()).filter((entry) => entry.entityType === "event" && entry.operation === "update")
    ).toHaveLength(2);
    expect((await database.trips.get("trip-1"))?.detailSnapshot?.days[0].events.map((event) => event.id)).toEqual([
      "event-3",
      "event-1",
    ]);
  });

  it("reorderEventsLocally no-ops when the reordered ids are not mirrored in the requested day", async () => {
    const database = await getOfflineDb("user-offline-reorder-missing");
    await seedMirroredTrip(database, "user-offline-reorder-missing");

    await reorderEventsLocally(database, "day-2", [{ id: "event-1", position: 0 }]);

    expect(await database.events.get("event-1")).toEqual(
      expect.objectContaining({ position: 0, syncStatus: "synced" })
    );
    expect(await database.outbox.toArray()).toEqual([]);
  });

  it("deleteEventLocally removes synced events, clears related docs, and queues a delete", async () => {
    const database = await getOfflineDb("user-offline-delete-event-synced");
    await seedMirroredTrip(database, "user-offline-delete-event-synced");
    await updateEventLocally(database, "event-1", { name: "Museum update" });

    await deleteEventLocally(database, "event-1");

    expect(await database.events.get("event-1")).toBeUndefined();
    expect(await database.documents.get("doc-event-1")).toBeUndefined();
    expect((await database.outbox.toArray()).filter((entry) => entry.entityId === "event-1")).toEqual([
      expect.objectContaining({ entityId: "event-1", operation: "delete" }),
    ]);
    expect((await database.trips.get("trip-1"))?.detailSnapshot?.days[0].events).toEqual([]);
    expect(
      (await database.trips.get("trip-1"))?.detailSnapshot?.docs.find((doc) => doc.id === "doc-event-1")
    ).toBeUndefined();
  });

  it("deleteEventLocally drops offline-created events and related document writes without enqueuing a delete", async () => {
    const database = await getOfflineDb("user-offline-delete-event-created");
    await seedMirroredTrip(database, "user-offline-delete-event-created");

    await writeEventLocally(database, "trip-1", "day-1", {
      id: "10000000-0000-4000-8000-000000000099",
      name: "Offline only",
    });
    await writeDocumentLocally(database, {
      id: "20000000-0000-4000-8000-000000000099",
      eventId: "10000000-0000-4000-8000-000000000099",
      file: new File(["content"], "offline-only.pdf", { type: "application/pdf" }),
    });

    await deleteEventLocally(database, "10000000-0000-4000-8000-000000000099");

    expect(await database.events.get("10000000-0000-4000-8000-000000000099")).toBeUndefined();
    expect(await database.documents.get("20000000-0000-4000-8000-000000000099")).toBeUndefined();
    expect(
      (await database.outbox.toArray()).some((entry) => entry.entityId === "10000000-0000-4000-8000-000000000099")
    ).toBe(false);
  });

  it("deleteDocumentLocally removes synced docs and queues a delete", async () => {
    const database = await getOfflineDb("user-offline-delete-doc");
    await seedMirroredTrip(database, "user-offline-delete-doc");

    await deleteDocumentLocally(database, "doc-trip-1");

    expect(await database.documents.get("doc-trip-1")).toBeUndefined();
    expect((await database.outbox.toArray()).filter((entry) => entry.entityId === "doc-trip-1")).toEqual([
      expect.objectContaining({ entityId: "doc-trip-1", operation: "delete" }),
    ]);
    expect(
      (await database.trips.get("trip-1"))?.detailSnapshot?.docs.find((doc) => doc.id === "doc-trip-1")
    ).toBeUndefined();
  });

  it("deleteDocumentLocally drops offline-created docs without enqueuing a delete", async () => {
    const database = await getOfflineDb("user-offline-delete-doc-created");
    await seedMirroredTrip(database, "user-offline-delete-doc-created");

    await writeDocumentLocally(database, {
      id: "20000000-0000-4000-8000-000000000098",
      tripId: "trip-1",
      file: new File(["content"], "offline-doc.pdf", { type: "application/pdf" }),
    });

    await deleteDocumentLocally(database, "20000000-0000-4000-8000-000000000098");

    expect(await database.documents.get("20000000-0000-4000-8000-000000000098")).toBeUndefined();
    expect(
      (await database.outbox.toArray()).some((entry) => entry.entityId === "20000000-0000-4000-8000-000000000098")
    ).toBe(false);
  });

  it("deleteDocumentLocally no-ops when the target row is missing", async () => {
    const database = await getOfflineDb("user-offline-delete-doc-missing");

    await deleteDocumentLocally(database, "missing-doc");

    expect(await database.documents.get("missing-doc")).toBeUndefined();
    expect(await database.outbox.toArray()).toEqual([]);
  });

  it("deletePackingItemLocally removes synced items and queues a delete", async () => {
    const database = await getOfflineDb("user-offline-delete-pack");
    await seedMirroredTrip(database, "user-offline-delete-pack");

    await deletePackingItemLocally(database, "packing-1");

    expect(await database.packingItems.get("packing-1")).toBeUndefined();
    expect((await database.outbox.toArray()).filter((entry) => entry.entityId === "packing-1")).toEqual([
      expect.objectContaining({ entityId: "packing-1", operation: "delete" }),
    ]);
    expect((await database.trips.get("trip-1"))?.detailSnapshot?.packingItems).toEqual([]);
  });

  it("deletePackingItemLocally drops offline-created items without enqueuing a delete", async () => {
    const database = await getOfflineDb("user-offline-delete-pack-created");
    await seedMirroredTrip(database, "user-offline-delete-pack-created");

    await writePackingItemLocally(database, {
      operation: "create",
      tripId: "trip-1",
      input: {
        id: "30000000-0000-4000-8000-000000000099",
        name: "Offline charger",
      },
    });

    await deletePackingItemLocally(database, "30000000-0000-4000-8000-000000000099");

    expect(await database.packingItems.get("30000000-0000-4000-8000-000000000099")).toBeUndefined();
    expect(
      (await database.outbox.toArray()).some((entry) => entry.entityId === "30000000-0000-4000-8000-000000000099")
    ).toBe(false);
  });

  it("updateDayLocally updates local rows, snapshots, and queues a day outbox entry", async () => {
    const database = await getOfflineDb("user-offline-day-update");
    await seedMirroredTrip(database, "user-offline-day-update");

    await updateDayLocally(database, "day-1", {
      label: "Arrival day",
      subtitle: "Tokyo station",
      weather: "Sunny",
    });

    expect(await database.days.get("day-1")).toEqual(
      expect.objectContaining({ label: "Arrival day", subtitle: "Tokyo station" })
    );
    expect((await database.outbox.toArray()).filter((entry) => entry.entityId === "day-1")).toEqual([
      expect.objectContaining({
        entityType: "day",
        operation: "update",
        payload: { dayId: "day-1", patch: { label: "Arrival day", subtitle: "Tokyo station", weather: "Sunny" } },
      }),
    ]);
    expect((await database.trips.get("trip-1"))?.detailSnapshot?.days[0]).toEqual(
      expect.objectContaining({ label: "Arrival day", subtitle: "Tokyo station", weather: "Sunny" })
    );
  });

  it("updateDayLocally no-ops when the mirrored day row is missing", async () => {
    const database = await getOfflineDb("user-offline-day-update-missing");

    await updateDayLocally(database, "missing-day", { label: "Unused" });

    expect(await database.days.get("missing-day")).toBeUndefined();
    expect(await database.outbox.toArray()).toEqual([]);
  });

  it("updateDayLocally updates mirrored day rows without requiring a trip snapshot row", async () => {
    const database = await getOfflineDb("user-offline-day-update-no-trip");
    await database.days.put({
      id: "day-1",
      tripId: "trip-missing",
      dayNumber: 1,
      date: "2026-07-01",
      label: "Day 1",
      subtitle: null,
    });

    await updateDayLocally(database, "day-1", { subtitle: "Offline subtitle" });

    expect(await database.days.get("day-1")).toEqual(expect.objectContaining({ subtitle: "Offline subtitle" }));
    expect((await database.outbox.toArray()).filter((entry) => entry.entityId === "day-1")).toHaveLength(1);
    expect(await database.trips.get("trip-missing")).toBeUndefined();
  });

  it("mirrorTripDetail preserves pending day updates and pending deletes over fresh server data", async () => {
    const database = await getOfflineDb("user-offline-merge-preserve");
    await seedMirroredTrip(database, "user-offline-merge-preserve");

    await updateDayLocally(database, "day-1", { label: "Offline day", weather: "Cloudy" });
    await deleteDocumentLocally(database, "doc-trip-1");
    await deletePackingItemLocally(database, "packing-1");
    await deleteEventLocally(database, "event-1");

    const refreshedDetail = buildTripDetail();
    refreshedDetail.days[0].label = "Server day";
    await mirrorTripDetail(database, refreshedDetail);

    expect(await database.documents.get("doc-trip-1")).toBeUndefined();
    expect(await database.packingItems.get("packing-1")).toBeUndefined();
    expect(await database.events.get("event-1")).toBeUndefined();
    expect((await database.days.get("day-1"))?.label).toBe("Offline day");
    expect((await database.trips.get("trip-1"))?.detailSnapshot?.days[0]).toEqual(
      expect.objectContaining({ label: "Offline day", weather: "Cloudy" })
    );
    expect((await database.trips.get("trip-1"))?.detailSnapshot?.days[0].events).toEqual([]);
  });

  it("writePackingItemLocally throws when a create request omits the caller-supplied id", async () => {
    const database = await getOfflineDb("user-local-pack-missing-id");
    await seedMirroredTrip(database, "user-local-pack-missing-id");

    await expect(
      writePackingItemLocally(database, {
        operation: "create",
        tripId: "trip-1",
        input: {
          name: "Missing id",
        },
      })
    ).rejects.toThrow("Packing item id required");
  });

  it("reorderEventsLocally updates mirrored rows without requiring a trip snapshot row", async () => {
    const database = await getOfflineDb("user-offline-reorder-no-trip");
    await database.events.put({
      id: "event-1",
      tripId: "trip-missing",
      dayId: "day-1",
      name: "Museum",
      note: null,
      startAt: null,
      endAt: null,
      locationName: null,
      locationAddress: null,
      locationLat: null,
      locationLng: null,
      position: 0,
      cost: null,
      confirmationNumber: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
      syncStatus: "synced",
    });

    await reorderEventsLocally(database, "day-1", [{ id: "event-1", position: 2 }]);

    expect(await database.events.get("event-1")).toEqual(
      expect.objectContaining({ position: 2, syncStatus: "pending" })
    );
    expect((await database.outbox.toArray()).filter((entry) => entry.entityId === "event-1")).toHaveLength(1);
    expect(await database.trips.get("trip-missing")).toBeUndefined();
  });
});

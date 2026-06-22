import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { DocKind, ReservationType, type TripDetailPayload, type TripListEntry } from "@/data/types";
import type { OfflineDay, OfflineDocument, OfflineEvent, OfflinePackingItem, OfflineTrip } from "./schema";

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

const {
  getOfflineDb,
  clearOfflineDb,
  mirrorTripDetail,
  mirrorTripListEntries,
  readTripDetailFromMirror,
  readTripListFromMirror,
  useOfflineDb,
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
      position: 0,
      cost: null,
      confirmationNumber: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
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
    });
    await database.packingItems.put({
      id: "packing-fallback",
      tripId: "trip-fallback",
      listId: null,
      name: "Passport",
      done: false,
      isLabel: false,
      position: 0,
    });

    const result = await readTripDetailFromMirror(database, "trip-fallback", new Date("2026-07-02T12:00:00.000Z"));

    expect(result?.trip.status).toBe("active");
    expect(result?.days[0].events[0].docs?.[0].name).toBe("Boarding pass");
    expect(result?.packingItems[0].name).toBe("Passport");
    expect(result?.collaborators).toEqual([]);
    expect(result?.packingLists).toEqual([]);
    expect(result?.reservations).toEqual([]);
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

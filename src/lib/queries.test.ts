// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAssertTripAccess, mockDbSelect, schemaTokens } = vi.hoisted(() => ({
  mockAssertTripAccess: vi.fn(),
  mockDbSelect: vi.fn(),
  schemaTokens: {
    trips: { id: "trips.id", name: "trips.name", startDate: "trips.startDate", endDate: "trips.endDate" },
    days: { tripId: "days.tripId" },
    events: { tripId: "events.tripId", startAt: "events.startAt", position: "events.position" },
    documents: {
      tripId: "documents.tripId",
      eventId: "documents.eventId",
      reservationId: "documents.reservationId",
      addedAt: "documents.addedAt",
      id: "documents.id",
    },
    collaborators: { tripId: "collaborators.tripId", userId: "collaborators.userId" },
    reservations: { tripId: "reservations.tripId" },
    expenses: { tripId: "expenses.tripId" },
    packingItems: { tripId: "packingItems.tripId", done: "packingItems.done", isLabel: "packingItems.isLabel" },
    tripPackingLists: {},
    itineraryNotes: {},
    itineraryChecklists: {},
    checklistItems: {},
    users: {},
    userLoyaltyNumbers: {},
    userWishlistDestinations: {},
    userCompanions: {},
    packingTemplates: {},
    packingTemplateItems: {},
  },
}));

vi.mock("@/db", () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock("@/lib/auth-helpers", () => ({
  assertTripAccess: mockAssertTripAccess,
}));

vi.mock("server-only", () => ({}));

vi.mock("@/db/schema", () => schemaTokens);

vi.mock("drizzle-orm", () => ({
  and: vi.fn(() => "and"),
  asc: vi.fn(() => "asc"),
  count: vi.fn(() => "count"),
  eq: vi.fn(() => "eq"),
  inArray: vi.fn(() => "inArray"),
  isNull: vi.fn(() => "isNull"),
  sql: vi.fn(() => "sql"),
}));

vi.mock("@/lib/db-mappers", () => ({
  dbTripToType: vi.fn((trip: { id: string; name: string; startDate: string | null; endDate: string | null }) => ({
    id: trip.id,
    name: trip.name,
    startDate: trip.startDate ?? undefined,
    endDate: trip.endDate ?? undefined,
    status: "upcoming" as const,
  })),
  dbEventToType: vi.fn((event: unknown) => event),
  dbDocToType: vi.fn((doc: unknown) => doc),
  dbCollabToType: vi.fn((collaborator: unknown) => collaborator),
  dbReservationToType: vi.fn((reservation: unknown) => reservation),
  dbChecklistToType: vi.fn(),
  dbLoyaltyToType: vi.fn(),
  dbWishlistToType: vi.fn(),
  dbCompanionToType: vi.fn(),
  dbPackingItemToType: vi.fn(),
  dbPackingListToType: vi.fn(),
  dbTemplateToType: vi.fn(),
  dbTemplateItemToType: vi.fn(),
}));

import { getTripDetail, listTripsForUser } from "./queries";

describe("listTripsForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("threads aggregated day totals onto trip list entries for dateless trips", async () => {
    mockDbSelect
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            orderBy: async () => [
              {
                trip: {
                  id: "trip-1",
                  name: "Flex Trip",
                  startDate: null,
                  endDate: null,
                },
              },
            ],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            orderBy: async () => [],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            orderBy: async () => [],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            groupBy: async () => [{ tripId: "trip-1", dayTotal: 3 }],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            groupBy: async () => [],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [],
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [],
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [],
        }),
      });

    const result = await listTripsForUser("user-1", new Date("2026-05-13T12:00:00.000Z"));

    expect(result).toHaveLength(1);
    expect(result[0].trip).toEqual(
      expect.objectContaining({
        id: "trip-1",
        name: "Flex Trip",
        dayTotal: 3,
      })
    );
    expect(result[0].summaryEvents).toEqual([]);
  });

  it("keeps todayEvents current-day only while summaryEvents include future active-trip events", async () => {
    mockDbSelect
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            orderBy: async () => [
              {
                trip: {
                  id: "trip-1",
                  name: "Lisbon Trip",
                  startDate: "2026-05-13",
                  endDate: "2026-05-20",
                },
              },
            ],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            orderBy: async () => [
              { id: "ev-1", tripId: "trip-1", name: "Dinner", startAt: "2026-05-13T19:00:00.000Z", position: 0 },
            ],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            orderBy: async () => [
              { id: "ev-1", tripId: "trip-1", name: "Dinner", startAt: "2026-05-13T19:00:00.000Z", position: 0 },
              {
                id: "ev-2",
                tripId: "trip-1",
                name: "Sintra Day Trip",
                startAt: "2026-05-14T09:00:00.000Z",
                position: 0,
              },
              {
                id: "ev-outside",
                tripId: "trip-1",
                name: "Too Late",
                startAt: "2026-05-21T09:00:00.000Z",
                position: 0,
              },
            ],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            groupBy: async () => [],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            groupBy: async () => [],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [],
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [],
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [
            {
              id: "res-1",
              tripId: "trip-1",
              type: "lodging",
              provider: "Hotel Avenida Palace",
              startAt: "2026-05-13T15:00:00.000Z",
              endAt: "2026-05-14T11:00:00.000Z",
            },
          ],
        }),
      });

    const result = await listTripsForUser("user-1", new Date("2026-05-13T12:00:00.000Z"));

    expect(result).toHaveLength(1);
    expect(result[0].todayEvents.map((event) => event.name)).toEqual(["Check-in — Hotel Avenida Palace", "Dinner"]);
    expect(result[0].summaryEvents.map((event) => event.name)).toEqual([
      "Check-in — Hotel Avenida Palace",
      "Dinner",
      "Sintra Day Trip",
      "Check-out — Hotel Avenida Palace",
    ]);
  });
});

describe("getTripDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertTripAccess.mockResolvedValue(undefined);
  });

  it("orders reservation documents by addedAt before mapping them onto reservations", async () => {
    const reservationDocOrderBy = vi.fn().mockResolvedValue([
      {
        id: "doc-older",
        reservationId: "res-1",
        addedAt: "2026-08-01T08:00:00.000Z",
        name: "older.pdf",
      },
      {
        id: "doc-newer",
        reservationId: "res-1",
        addedAt: "2026-08-02T08:00:00.000Z",
        name: "newer.pdf",
      },
    ]);

    mockDbSelect
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [{ id: "trip-1", name: "Trip", startDate: "2026-08-01", endDate: "2026-08-05" }],
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            orderBy: async () => [],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            orderBy: async () => [],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            orderBy: async () => [],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [],
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            orderBy: async () => [],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            orderBy: async () => [],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [
            { id: "res-1", tripId: "trip-1", type: "flight", provider: "Acme", startAt: null, endAt: null },
          ],
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [],
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            orderBy: reservationDocOrderBy,
          }),
        }),
      });

    const result = await getTripDetail("trip-1", "user-1");

    expect(reservationDocOrderBy).toHaveBeenCalledTimes(1);
    expect(reservationDocOrderBy.mock.calls[0]).toHaveLength(2);
    expect(result?.reservations[0]?.documents).toEqual([
      expect.objectContaining({ id: "doc-older" }),
      expect.objectContaining({ id: "doc-newer" }),
    ]);
  });
});

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAssertTripAccess, mockDbSelect, schemaTokens } = vi.hoisted(() => ({
  mockAssertTripAccess: vi.fn(),
  mockDbSelect: vi.fn(),
  schemaTokens: {
    trips: { id: "trips.id", name: "trips.name", startDate: "trips.startDate", endDate: "trips.endDate" },
    days: { tripId: "days.tripId" },
    events: { tripId: "events.tripId", startAt: "events.startAt", position: "events.position" },
    documents: { tripId: "documents.tripId", eventId: "documents.eventId" },
    collaborators: { tripId: "collaborators.tripId", userId: "collaborators.userId" },
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
  dbChecklistToType: vi.fn(),
  dbLoyaltyToType: vi.fn(),
  dbWishlistToType: vi.fn(),
  dbCompanionToType: vi.fn(),
  dbPackingItemToType: vi.fn(),
  dbPackingListToType: vi.fn(),
  dbTemplateToType: vi.fn(),
  dbTemplateItemToType: vi.fn(),
}));

import { listTripsForUser } from "./queries";

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
  });
});

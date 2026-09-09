// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, ne } from "drizzle-orm";
import { CollaboratorRole } from "@/data/types";

const { mockAssertTripAccess, mockDbSelect, mockDbTripNoteToType, mockDbTripToType, schemaTokens } = vi.hoisted(() => ({
  mockAssertTripAccess: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbTripNoteToType: vi.fn((tripNote: { id: string; tripId: string; position: number }) => tripNote),
  mockDbTripToType: vi.fn((trip: { id: string; name: string; startDate: string | null; endDate: string | null }) => ({
    id: trip.id,
    name: trip.name,
    startDate: trip.startDate ?? undefined,
    endDate: trip.endDate ?? undefined,
    status: "upcoming" as const,
  })),
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
    collaborators: { tripId: "collaborators.tripId", userId: "collaborators.userId", role: "collaborators.role" },
    invitations: { tripId: "invitations.tripId", status: "invitations.status", expiresAt: "invitations.expiresAt" },
    reservations: { tripId: "reservations.tripId" },
    expenses: { tripId: "expenses.tripId" },
    packingItems: { tripId: "packingItems.tripId", done: "packingItems.done", isLabel: "packingItems.isLabel" },
    tripPackingLists: {},
    itineraryNotes: {},
    notes: { position: "notes.position" },
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
  or: vi.fn(() => "or"),
  asc: vi.fn(() => "asc"),
  count: vi.fn(() => "count"),
  eq: vi.fn(() => "eq"),
  inArray: vi.fn(() => "inArray"),
  isNull: vi.fn(() => "isNull"),
  ne: vi.fn(() => "ne"),
  sql: vi.fn(() => "sql"),
}));

vi.mock("@/lib/db-mappers", () => ({
  dbTripToType: mockDbTripToType,
  dbEventToType: vi.fn((event: unknown) => event),
  dbDocToType: vi.fn((doc: unknown) => doc),
  dbCollabToType: vi.fn((collaborator: unknown) => collaborator),
  dbInvitationToType: vi.fn((invitation: unknown) => invitation),
  dbReservationToType: vi.fn((reservation: unknown) => reservation),
  dbExpenseToType: vi.fn((expense: { id: string }) => ({ id: expense.id })),
  dbChecklistToType: vi.fn(),
  dbTripNoteToType: mockDbTripNoteToType,
  dbLoyaltyToType: vi.fn(),
  dbWishlistToType: vi.fn(),
  dbCompanionToType: vi.fn(),
  dbPackingItemToType: vi.fn(),
  dbPackingListToType: vi.fn(),
  dbTemplateToType: vi.fn(),
  dbTemplateItemToType: vi.fn(),
}));

import { getContributorsAndInvitations, getTripDetail, listExpensesForUserInRange, listTripsForUser } from "./queries";

describe("getContributorsAndInvitations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires manager access before loading sharing data", async () => {
    mockAssertTripAccess.mockImplementation(async () => {
      expect(mockDbSelect).not.toHaveBeenCalled();
      return CollaboratorRole.Manager;
    });
    mockDbSelect
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) });

    await expect(getContributorsAndInvitations("trip-1", "user-1")).resolves.toEqual({
      collaborators: [],
      currentCollaboratorId: null,
      invitations: [],
    });

    expect(mockAssertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", CollaboratorRole.Manager);
  });

  it("returns the caller collaborator row id beside mapped sharing data", async () => {
    mockAssertTripAccess.mockResolvedValue(CollaboratorRole.Manager);
    mockDbSelect
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [
            { id: "creator-1", userId: "owner-1" },
            { id: "manager-1", userId: "user-1" },
          ],
        }),
      })
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) });

    await expect(getContributorsAndInvitations("trip-1", "user-1")).resolves.toMatchObject({
      currentCollaboratorId: "manager-1",
    });
  });

  it("returns a null caller row id when no collaborator row matches", async () => {
    mockAssertTripAccess.mockResolvedValue(CollaboratorRole.Manager);
    mockDbSelect
      .mockReturnValueOnce({ from: () => ({ where: async () => [{ id: "creator-1", userId: "owner-1" }] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) });

    await expect(getContributorsAndInvitations("trip-1", "missing-user")).resolves.toMatchObject({
      currentCollaboratorId: null,
    });
  });
});

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

  it("stamps the caller's collaborator role onto the returned trip as accessRole", async () => {
    mockDbSelect
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            orderBy: async () => [
              {
                trip: {
                  id: "trip-1",
                  name: "Editor's Trip",
                  startDate: null,
                  endDate: null,
                },
                accessRole: "editor",
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
          where: async () => [],
        }),
      });

    const result = await listTripsForUser("user-1", new Date("2026-05-13T12:00:00.000Z"));

    expect(result[0].trip.accessRole).toBe("editor");
    expect(mockDbTripToType).toHaveBeenCalledWith(expect.objectContaining({ id: "trip-1" }), { role: "editor" });
  });

  it("omits budget from a viewer-role trip in the list payload", async () => {
    mockDbSelect
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            orderBy: async () => [
              {
                trip: {
                  id: "trip-1",
                  name: "Viewer's Trip",
                  startDate: null,
                  endDate: null,
                },
                accessRole: "viewer",
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
          where: async () => [],
        }),
      });

    await listTripsForUser("user-1", new Date("2026-05-13T12:00:00.000Z"));

    expect(mockDbTripToType).toHaveBeenCalledWith(expect.objectContaining({ id: "trip-1" }), { role: "viewer" });
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

  it("keeps the current local day's Linked Events when now is a late evening west of UTC", async () => {
    // Regression: "today" must be the wall-clock date, not now.toISOString()'s UTC
    // date. `now` is a late-evening LOCAL instant (built with the local Date ctor so
    // the wall-clock date is May 13 in any runtime zone). Under the old UTC-based
    // todayISO, this rolled forward to May 14 west of UTC and dropped the Check-in.
    const lateEveningNow = new Date(2026, 4, 13, 22, 30);

    mockDbSelect
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            orderBy: async () => [
              { trip: { id: "trip-1", name: "Lisbon Trip", startDate: "2026-05-13", endDate: "2026-05-20" } },
            ],
          }),
        }),
      })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ groupBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ groupBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [
            {
              id: "res-1",
              tripId: "trip-1",
              type: "lodging",
              provider: "Hotel Avenida Palace",
              startAt: "2026-05-13T19:00:00.000Z",
              endAt: "2026-05-15T11:00:00.000Z",
            },
          ],
        }),
      });

    const result = await listTripsForUser("user-1", lateEveningNow);

    expect(result[0].todayEvents.map((event) => event.name)).toContain("Check-in — Hotel Avenida Palace");
    expect(result[0].summaryEvents.map((event) => event.name)).toContain("Check-in — Hotel Avenida Palace");
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
      // notes
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

  it("returns all trip expenses (including unlinked ones) in the payload", async () => {
    mockDbSelect
      // trip
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [{ id: "trip-1", name: "Trip", startDate: "2026-08-01", endDate: "2026-08-05" }],
        }),
      })
      // days
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      // events
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      // trip docs
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      // collaborators
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) })
      // packing items
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      // packing lists
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      // notes
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      // reservations
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) })
      // expenses
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [
            {
              id: "expense-event",
              tripId: "trip-1",
              eventId: "event-1",
              reservationId: null,
              category: "food",
              amount: "10",
              currency: "USD",
              convertedAmountTrip: "10",
              date: "2026-08-01",
            },
            {
              id: "expense-unlinked",
              tripId: "trip-1",
              eventId: null,
              reservationId: null,
              category: "misc",
              amount: "25",
              currency: "USD",
              convertedAmountTrip: "25",
              date: "2026-08-02",
            },
          ],
        }),
      });

    const result = await getTripDetail("trip-1", "user-1");

    expect(result?.expenses.map((expense) => expense.id)).toEqual(["expense-event", "expense-unlinked"]);
  });

  it("threads the resolved role into the trip mapper and returns it as accessRole", async () => {
    mockAssertTripAccess.mockResolvedValue("editor");

    mockDbSelect
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [{ id: "trip-1", name: "Trip", startDate: "2026-08-01", endDate: "2026-08-05" }],
        }),
      })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) });

    const result = await getTripDetail("trip-1", "user-1");

    expect(mockDbTripToType).toHaveBeenCalledWith(expect.objectContaining({ id: "trip-1" }), {
      role: "editor",
    });
    expect(result?.accessRole).toBe("editor");
  });

  it("omits the expenses list and reservation-linked expense for a viewer role", async () => {
    mockAssertTripAccess.mockResolvedValue("viewer");

    mockDbSelect
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [{ id: "trip-1", name: "Trip", startDate: "2026-08-01", endDate: "2026-08-05" }],
        }),
      })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [
            { id: "res-1", tripId: "trip-1", type: "flight", provider: "Acme", startAt: null, endAt: null },
          ],
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [
            {
              id: "expense-1",
              tripId: "trip-1",
              eventId: null,
              reservationId: "res-1",
              category: "food",
              amount: "50",
              currency: "USD",
              date: "2026-08-01",
            },
          ],
        }),
      })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) });

    const result = await getTripDetail("trip-1", "user-1");

    expect(result?.expenses).toEqual([]);
    expect(result?.reservations[0]?.expense).toBeUndefined();
    expect(result?.reservations[0]).not.toHaveProperty("expense");
    expect(result?.accessRole).toBe("viewer");
  });

  it("includes the expenses list and reservation-linked expense for an editor role", async () => {
    mockAssertTripAccess.mockResolvedValue("editor");

    mockDbSelect
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [{ id: "trip-1", name: "Trip", startDate: "2026-08-01", endDate: "2026-08-05" }],
        }),
      })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [
            { id: "res-1", tripId: "trip-1", type: "flight", provider: "Acme", startAt: null, endAt: null },
          ],
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [
            {
              id: "expense-1",
              tripId: "trip-1",
              eventId: null,
              reservationId: "res-1",
              category: "food",
              amount: "50",
              currency: "USD",
              date: "2026-08-01",
            },
          ],
        }),
      })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) });

    const result = await getTripDetail("trip-1", "user-1");

    expect(result?.expenses).toEqual([{ id: "expense-1" }]);
    expect(result?.reservations[0]?.expense).toEqual({ id: "expense-1" });
  });

  it("omits an unscheduled event's linked expense for a viewer role", async () => {
    mockAssertTripAccess.mockResolvedValue("viewer");

    mockDbSelect
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [{ id: "trip-1", name: "Trip", startDate: "2026-08-01", endDate: "2026-08-05" }],
        }),
      })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            orderBy: async () => [
              {
                id: "event-1",
                dayId: null,
                tripId: "trip-1",
                name: "Museum",
                position: 0,
                startAt: null,
                endAt: null,
                displacedDate: null,
              },
            ],
          }),
        }),
      })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [
            {
              id: "expense-1",
              tripId: "trip-1",
              eventId: "event-1",
              reservationId: null,
              category: "food",
              amount: "20",
              currency: "USD",
              date: "2026-08-01",
            },
          ],
        }),
      })
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) });

    const result = await getTripDetail("trip-1", "user-1");

    expect(result?.unscheduledEvents[0]?.expense).toBeUndefined();
    expect(result?.unscheduledEvents[0]).not.toHaveProperty("expense");
  });

  it("attaches or omits a day-scheduled event's linked expense based on role", async () => {
    async function runForRole(role: string) {
      mockAssertTripAccess.mockResolvedValue(role);

      mockDbSelect
        .mockReturnValueOnce({
          from: () => ({
            where: async () => [{ id: "trip-1", name: "Trip", startDate: "2026-08-01", endDate: "2026-08-05" }],
          }),
        })
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              orderBy: async () => [{ id: "day-1", dayNumber: 1, date: "2026-08-01", label: "Day 1" }],
            }),
          }),
        })
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              orderBy: async () => [
                {
                  id: "event-1",
                  dayId: "day-1",
                  tripId: "trip-1",
                  name: "Museum",
                  position: 0,
                  startAt: null,
                  endAt: null,
                  displacedDate: null,
                },
              ],
            }),
          }),
        })
        .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: async () => [] }) })
        .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: async () => [] }) })
        .mockReturnValueOnce({
          from: () => ({
            where: async () => [
              {
                id: "expense-1",
                tripId: "trip-1",
                eventId: "event-1",
                reservationId: null,
                category: "food",
                amount: "20",
                currency: "USD",
                date: "2026-08-01",
              },
            ],
          }),
        })
        .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
        .mockReturnValueOnce({ from: () => ({ where: async () => [] }) });

      return getTripDetail("trip-1", "user-1");
    }

    const viewerResult = await runForRole("viewer");
    expect(viewerResult?.days[0]?.events[0]?.expense).toBeUndefined();
    expect(viewerResult?.days[0]?.events[0]).not.toHaveProperty("expense");

    vi.clearAllMocks();
    mockAssertTripAccess.mockResolvedValue("editor");

    const editorResult = await runForRole("editor");
    expect(editorResult?.days[0]?.events[0]?.expense).toEqual({ id: "expense-1" });
  });

  it("maps trip notes into the payload in persisted position order", async () => {
    const noteRows = [
      { id: "note-newest", tripId: "trip-1", position: 0 },
      { id: "note-older", tripId: "trip-1", position: 1 },
    ];
    const noteOrderBy = vi.fn().mockResolvedValue(noteRows);

    mockDbSelect
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [{ id: "trip-1", name: "Trip", startDate: "2026-08-01", endDate: "2026-08-05" }],
        }),
      })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => [] }) }) })
      .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: noteOrderBy }) }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) });

    const result = await getTripDetail("trip-1", "user-1");

    expect(noteOrderBy).toHaveBeenCalledWith("notes.position");
    expect(mockDbTripNoteToType).toHaveBeenCalledTimes(2);
    expect(result?.notes.map((note) => note.id)).toEqual(["note-newest", "note-older"]);
  });
});

describe("listExpensesForUserInRange", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("applies any-date-overlap inclusion rule and returns trips for user", async () => {
    mockDbSelect
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: async () => [
              { trip: { id: "trip-1", name: "Lisbon Trip", startDate: "2026-05-01", endDate: "2026-05-10" } },
            ],
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
            groupBy: async () => [],
          }),
        }),
      });

    const result = await listExpensesForUserInRange("user-1", "2026-01-01", "2026-12-31");

    expect(result.trips).toEqual([expect.objectContaining({ id: "trip-1", name: "Lisbon Trip" })]);
  });

  it("returns mapped expenses with dbExpenseToType", async () => {
    mockDbSelect
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: async () => [
              { trip: { id: "trip-1", name: "Lisbon Trip", startDate: "2026-05-01", endDate: "2026-05-10" } },
            ],
          }),
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: async () => [{ id: "expense-1", tripId: "trip-1", category: "food", amount: "10" }],
        }),
      })
      .mockReturnValueOnce({
        from: () => ({
          where: () => ({
            groupBy: async () => [],
          }),
        }),
      });

    const result = await listExpensesForUserInRange("user-1", "2026-01-01", "2026-12-31");

    expect(result.expenses).toEqual([{ id: "expense-1" }]);
  });

  it("threads aggregated day totals onto dateless trips", async () => {
    mockDbSelect
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: async () => [{ trip: { id: "trip-1", name: "Flex Trip", startDate: null, endDate: null } }],
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
            groupBy: async () => [{ tripId: "trip-1", dayTotal: 3 }],
          }),
        }),
      });

    const result = await listExpensesForUserInRange("user-1", "2026-01-01", "2026-12-31");

    expect(result.trips).toEqual([expect.objectContaining({ id: "trip-1", name: "Flex Trip", dayTotal: 3 })]);
  });

  it("applies a ne(role, viewer) predicate to the collaborator join condition", async () => {
    mockDbSelect
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: async () => [
              { trip: { id: "trip-1", name: "Editor Trip", startDate: "2026-05-01", endDate: "2026-05-10" } },
            ],
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
            groupBy: async () => [],
          }),
        }),
      });

    const result = await listExpensesForUserInRange("user-1", "2026-01-01", "2026-12-31");

    expect(ne).toHaveBeenCalledWith(schemaTokens.collaborators.role, "viewer");
    expect(and).toHaveBeenCalledWith("eq", "eq", "ne");
    expect(result.trips).toEqual([expect.objectContaining({ id: "trip-1" })]);
    expect(result.expenses).toEqual([]);
  });

  it("returns every non-viewer trip when a call spans both an editor and a manager trip", async () => {
    mockDbSelect
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: async () => [
              { trip: { id: "trip-editor", name: "Editor Trip", startDate: "2026-05-01", endDate: "2026-05-10" } },
              { trip: { id: "trip-manager", name: "Manager Trip", startDate: "2026-06-01", endDate: "2026-06-10" } },
            ],
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
            groupBy: async () => [],
          }),
        }),
      });

    const result = await listExpensesForUserInRange("user-1", "2026-01-01", "2026-12-31");

    expect(result.trips.map((trip) => trip.id)).toEqual(["trip-editor", "trip-manager"]);
  });

  it("includes a trip on the next call once the user's role is no longer viewer", async () => {
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: async () => [],
        }),
      }),
    });

    const whileViewer = await listExpensesForUserInRange("user-1", "2026-01-01", "2026-12-31");
    expect(whileViewer.trips).toEqual([]);

    mockDbSelect
      .mockReturnValueOnce({
        from: () => ({
          innerJoin: () => ({
            where: async () => [
              { trip: { id: "trip-1", name: "Promoted Trip", startDate: "2026-05-01", endDate: "2026-05-10" } },
            ],
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
            groupBy: async () => [],
          }),
        }),
      });

    const afterPromotion = await listExpensesForUserInRange("user-1", "2026-01-01", "2026-12-31");
    expect(afterPromotion.trips).toEqual([expect.objectContaining({ id: "trip-1" })]);
  });

  it("returns empty trips and expenses when the user has no trips in range", async () => {
    mockDbSelect.mockReturnValueOnce({
      from: () => ({
        innerJoin: () => ({
          where: async () => [],
        }),
      }),
    });

    const result = await listExpensesForUserInRange("user-1", "2026-01-01", "2026-12-31");

    expect(result).toEqual({ trips: [], expenses: [] });
  });
});

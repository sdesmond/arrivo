// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { assertTripAccess, db, daysTable, documentsTable, requireUser, reservationsTable, revalidatePath, tripsTable } =
  vi.hoisted(() => ({
    assertTripAccess: vi.fn(),
    db: {
      insert: vi.fn(),
      select: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      transaction: vi.fn(),
    },
    daysTable: {
      id: "days.id",
      tripId: "days.tripId",
      dayNumber: "days.dayNumber",
      date: "days.date",
      label: "days.label",
    },
    documentsTable: { id: "documents.id", reservationId: "documents.reservationId", url: "documents.url" },
    requireUser: vi.fn(),
    reservationsTable: { id: "reservations.id", tripId: "reservations.tripId" },
    revalidatePath: vi.fn(),
    tripsTable: { id: "trips.id", startDate: "trips.startDate", endDate: "trips.endDate" },
  }));

vi.mock("@/lib/auth-helpers", () => ({
  assertTripAccess,
  requireUser,
}));

vi.mock("@/db", () => ({
  db,
}));

vi.mock("@/db/schema", () => ({
  reservations: reservationsTable,
  documents: documentsTable,
  days: daysTable,
  trips: tripsTable,
}));

vi.mock("next/cache", () => ({
  revalidatePath,
}));

const { put, del } = vi.hoisted(() => ({
  put: vi.fn(),
  del: vi.fn(),
}));
vi.mock("@vercel/blob", () => ({ put, del }));

const { saveLocalUpload } = vi.hoisted(() => ({
  saveLocalUpload: vi.fn(),
}));
vi.mock("@/lib/local-upload", () => ({ saveLocalUpload }));

import {
  createReservation,
  updateReservation,
  deleteReservation,
  uploadReservationDocument,
  removeReservationDocument,
  renameReservationDocument,
  promoteReservationDocToTrip,
  attachTripDocToReservation,
} from "./actions";
import { ReservationType } from "@/data/types";

function createAwaitableRows(rows: unknown[]) {
  return {
    orderBy: async () => rows,
    then: (onfulfilled?: ((value: unknown[]) => unknown) | null, onrejected?: ((reason: unknown) => unknown) | null) =>
      Promise.resolve(rows).then(onfulfilled, onrejected),
  };
}

function createSelectMock(rows: unknown[]) {
  return {
    from: () => ({
      where: () => createAwaitableRows(rows),
    }),
  };
}

function nextDateString(date: string): string {
  const nextDate = new Date(`${date}T00:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  return nextDate.toISOString().slice(0, 10);
}

function buildDateRows(startDate: string, endDate: string): { date: string }[] {
  const dateRows: { date: string }[] = [];
  let cursor = startDate;
  while (cursor <= endDate) {
    dateRows.push({ date: cursor });
    cursor = nextDateString(cursor);
  }
  return dateRows;
}

function buildDayNumberRows(totalDays: number): { dayNumber: number }[] {
  return Array.from({ length: totalDays }, (_, index) => ({ dayNumber: index + 1 }));
}

describe("createReservation", () => {
  let insertedReservationValues: Record<string, unknown> | undefined;
  let insertedDayValues: Record<string, unknown>[];
  let updatedDayValues: Record<string, unknown>[];
  let updatedTripValues: Record<string, unknown>[];

  function mockSelectResults(...results: unknown[][]): void {
    db.select.mockReset();
    for (const result of results) {
      db.select.mockReturnValueOnce(createSelectMock(result));
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    insertedReservationValues = undefined;
    insertedDayValues = [];
    updatedDayValues = [];
    updatedTripValues = [];

    db.transaction.mockImplementation(async (callback: (transaction: typeof db) => Promise<void>) => {
      await callback(db);
    });

    db.select.mockReturnValue(createSelectMock([{ startDate: "2026-08-01", endDate: "2026-08-05" }]));
    db.insert.mockImplementation((table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        if (table === reservationsTable) {
          insertedReservationValues = values;
          return;
        }
        if (table === daysTable) {
          insertedDayValues.push(values);
        }
      },
    }));
    db.update.mockImplementation((table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        if (table === daysTable) {
          updatedDayValues.push(values);
        }
        if (table === tripsTable) {
          updatedTripValues.push(values);
        }
        return { where: async () => undefined };
      },
    }));
  });

  it.each([ReservationType.Lodging, ReservationType.RentalCar, ReservationType.Cruise])(
    "requires an end date for %s reservations",
    async (type) => {
      await expect(
        createReservation("trip-1", {
          type,
          provider: "Acme",
          startAt: "2026-08-01T10:00:00.000Z",
        })
      ).rejects.toThrow("An end date and time is required for this reservation type.");

      expect(db.insert).not.toHaveBeenCalled();
    }
  );

  it.each([
    ReservationType.Flight,
    ReservationType.Train,
    ReservationType.Bus,
    ReservationType.Ferry,
    ReservationType.Other,
  ])("allows %s reservations without an end date", async (type) => {
    await createReservation("trip-1", {
      type,
      provider: "Acme",
      startAt: "2026-08-01T10:00:00.000Z",
    });

    expect(insertedReservationValues).toMatchObject({
      tripId: "trip-1",
      type,
      provider: "Acme",
      endAt: undefined,
    });
  });

  it("checks editor access before inserting", async () => {
    await createReservation("trip-1", {
      type: ReservationType.Flight,
      provider: "Acme Air",
      startAt: "2026-08-01T10:00:00.000Z",
    });

    expect(requireUser).toHaveBeenCalled();
    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
  });

  it("inserts a reservation with all provided fields and converts dates", async () => {
    await createReservation("trip-1", {
      type: ReservationType.Lodging,
      provider: "Grand Hotel",
      startAt: "2026-08-01T15:00:00.000Z",
      endAt: "2026-08-05T11:00:00.000Z",
      startAddress: "123 Main St, New York, NY",
      startLocationName: "John F. Kennedy International Airport",
      startLocationLat: 40.6413,
      startLocationLng: -73.7781,
      endAddress: "456 Main St, Los Angeles, CA",
      endLocationName: "Los Angeles International Airport",
      endLocationLat: 33.9416,
      endLocationLng: -118.4085,
      cost: 499.99,
      confirmationCode: "ABC123",
      serviceNumber: "SVC-9",
      notes: "Late checkout requested",
    });

    expect(insertedReservationValues).toEqual({
      tripId: "trip-1",
      type: ReservationType.Lodging,
      provider: "Grand Hotel",
      startAt: new Date("2026-08-01T15:00:00.000Z"),
      endAt: new Date("2026-08-05T11:00:00.000Z"),
      startAddress: "123 Main St, New York, NY",
      startLocationName: "John F. Kennedy International Airport",
      startLocationLat: 40.6413,
      startLocationLng: -73.7781,
      endAddress: "456 Main St, Los Angeles, CA",
      endLocationName: "Los Angeles International Airport",
      endLocationLat: 33.9416,
      endLocationLng: -118.4085,
      cost: "499.99",
      confirmationCode: "ABC123",
      serviceNumber: "SVC-9",
      notes: "Late checkout requested",
    });
  });

  it("revalidates the trip path after a successful insert", async () => {
    await createReservation("trip-1", {
      type: ReservationType.Flight,
      provider: "Acme Air",
      startAt: "2026-08-01T10:00:00.000Z",
    });

    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("omits startAt and endAt when not provided", async () => {
    await createReservation("trip-1", {
      type: ReservationType.Other,
      provider: "Misc",
    });

    expect(insertedReservationValues).toMatchObject({
      startAt: undefined,
      endAt: undefined,
    });
  });

  it("rejects an unknown reservation type", async () => {
    await expect(
      createReservation("trip-1", {
        type: "teleport" as ReservationType,
        provider: "Acme",
      })
    ).rejects.toThrow("Invalid reservation type.");

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects a blank provider", async () => {
    await expect(
      createReservation("trip-1", {
        type: ReservationType.Other,
        provider: "   ",
      })
    ).rejects.toThrow("Provider is required.");

    expect(db.insert).not.toHaveBeenCalled();
  });

  it("trims the provider before inserting", async () => {
    await createReservation("trip-1", {
      type: ReservationType.Other,
      provider: "  Misc  ",
    });

    expect(insertedReservationValues).toMatchObject({ provider: "Misc" });
  });

  it("extends endDate when reservation falls after trip endDate", async () => {
    mockSelectResults(
      [{ startDate: "2030-06-01", endDate: "2030-06-05" }],
      [{ count: 5 }],
      [buildDateRows("2030-06-01", "2030-06-05")[0], ...buildDateRows("2030-06-02", "2030-06-05")],
      buildDayNumberRows(5)
    );

    await createReservation("trip-1", {
      type: ReservationType.Flight,
      provider: "Acme Air",
      startAt: "2030-06-06T10:00:00.000Z",
    });

    expect(insertedDayValues).toEqual([
      {
        tripId: "trip-1",
        dayNumber: 6,
        date: "2030-06-06",
        label: "Day 6",
      },
    ]);
    expect(updatedTripValues).toContainEqual({
      endDate: "2030-06-06",
      updatedAt: expect.any(Date),
    });
    expect(insertedReservationValues).toMatchObject({
      provider: "Acme Air",
      startAt: new Date("2030-06-06T10:00:00.000Z"),
    });
  });

  it("extends startDate when reservation falls before trip startDate", async () => {
    mockSelectResults(
      [{ startDate: "2030-06-10", endDate: "2030-06-15" }],
      [{ count: 6 }],
      buildDateRows("2030-06-10", "2030-06-15"),
      buildDayNumberRows(6)
    );

    await createReservation("trip-1", {
      type: ReservationType.Flight,
      provider: "Early Air",
      startAt: "2030-06-09T10:00:00.000Z",
    });

    expect(updatedDayValues).toHaveLength(2);
    expect(insertedDayValues).toEqual([
      {
        tripId: "trip-1",
        dayNumber: 1,
        date: "2030-06-09",
        label: "Day 1",
      },
    ]);
    expect(updatedTripValues).toContainEqual({
      startDate: "2030-06-09",
      updatedAt: expect.any(Date),
    });
  });

  it("extends startDate by multiple days, shifting every existing and newly-inserted day in order", async () => {
    mockSelectResults(
      [{ startDate: "2030-06-10", endDate: "2030-06-15" }],
      [{ count: 6 }],
      buildDateRows("2030-06-10", "2030-06-15")
    );

    await createReservation("trip-1", {
      type: ReservationType.Flight,
      provider: "Far Early Air",
      startAt: "2030-06-07T10:00:00.000Z",
    });

    expect(updatedDayValues).toHaveLength(6);
    expect(insertedDayValues).toEqual([
      { tripId: "trip-1", dayNumber: 1, date: "2030-06-09", label: "Day 1" },
      { tripId: "trip-1", dayNumber: 1, date: "2030-06-08", label: "Day 1" },
      { tripId: "trip-1", dayNumber: 1, date: "2030-06-07", label: "Day 1" },
    ]);
    expect(updatedTripValues).toContainEqual({
      startDate: "2030-06-07",
      updatedAt: expect.any(Date),
    });
  });

  it("extends both startDate and endDate when reservation spans beyond both boundaries", async () => {
    mockSelectResults(
      [{ startDate: "2030-06-10", endDate: "2030-06-15" }],
      [{ count: 6 }],
      buildDateRows("2030-06-10", "2030-06-15"),
      buildDayNumberRows(6).map((row) => ({ dayNumber: row.dayNumber + 1 }))
    );

    await createReservation("trip-1", {
      type: ReservationType.Lodging,
      provider: "Grand Hotel",
      startAt: "2030-06-09T15:00:00.000Z",
      endAt: "2030-06-16T11:00:00.000Z",
    });

    expect(insertedDayValues).toEqual([
      {
        tripId: "trip-1",
        dayNumber: 1,
        date: "2030-06-09",
        label: "Day 1",
      },
      {
        tripId: "trip-1",
        dayNumber: 8,
        date: "2030-06-16",
        label: "Day 8",
      },
    ]);
    expect(updatedTripValues).toContainEqual({
      startDate: "2030-06-09",
      endDate: "2030-06-16",
      updatedAt: expect.any(Date),
    });
  });

  it("does not extend when reservation falls within the existing range", async () => {
    mockSelectResults([{ startDate: "2030-06-10", endDate: "2030-06-15" }]);

    await createReservation("trip-1", {
      type: ReservationType.Flight,
      provider: "Within Range Air",
      startAt: "2030-06-12T10:00:00.000Z",
    });

    expect(insertedDayValues).toEqual([]);
    expect(updatedTripValues).toEqual([]);
  });

  it("throws when the extension would exceed MAX_TRIP_DAYS", async () => {
    mockSelectResults(
      [{ startDate: "2030-06-01", endDate: "2030-07-15" }],
      [{ count: 45 }],
      buildDateRows("2030-06-01", "2030-07-15")
    );

    await expect(
      createReservation("trip-1", {
        type: ReservationType.Flight,
        provider: "Overflow Air",
        startAt: "2030-07-16T10:00:00.000Z",
      })
    ).rejects.toThrow("Trip cannot exceed 45 days.");

    expect(insertedReservationValues).toBeUndefined();
    expect(insertedDayValues).toEqual([]);
    expect(updatedTripValues).toEqual([]);
  });

  it("does not duplicate days when the reservation starts on the existing boundary date", async () => {
    mockSelectResults([{ startDate: "2030-06-10", endDate: "2030-06-15" }]);

    await createReservation("trip-1", {
      type: ReservationType.Flight,
      provider: "Boundary Air",
      startAt: "2030-06-10T15:00:00.000Z",
    });

    expect(insertedDayValues).toEqual([]);
    expect(updatedTripValues).toEqual([]);
  });

  it("does not insert the reservation when date-range extension fails", async () => {
    db.select
      .mockReturnValueOnce(createSelectMock([{ startDate: "2030-06-10", endDate: "2030-06-15" }]))
      .mockImplementationOnce(() => {
        throw new Error("extension failed");
      });

    await expect(
      createReservation("trip-1", {
        type: ReservationType.Flight,
        provider: "Broken Air",
        startAt: "2030-06-09T10:00:00.000Z",
      })
    ).rejects.toThrow("extension failed");

    expect(insertedReservationValues).toBeUndefined();
    expect(insertedDayValues).toEqual([]);
    expect(updatedTripValues).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("updateReservation", () => {
  const baseRow = {
    id: "res-1",
    tripId: "trip-1",
    type: ReservationType.Flight,
    provider: "Acme Air",
    startAt: new Date("2026-08-01T10:00:00.000Z"),
    endAt: null,
    startAddress: null,
    startLocationName: null,
    startLocationLat: null,
    startLocationLng: null,
    endAddress: null,
    endLocationName: null,
    endLocationLat: null,
    endLocationLng: null,
    cost: null,
    confirmationCode: null,
    serviceNumber: null,
    notes: null,
  };
  let insertedDayValues: Record<string, unknown>[];
  let updatedDayValues: Record<string, unknown>[];
  let updatedReservationValues: Record<string, unknown> | undefined;
  let updatedTripValues: Record<string, unknown>[];

  function mockSelectResults(...results: unknown[][]): void {
    db.select.mockReset();
    for (const result of results) {
      db.select.mockReturnValueOnce(createSelectMock(result));
    }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    insertedDayValues = [];
    updatedDayValues = [];
    updatedReservationValues = undefined;
    updatedTripValues = [];

    db.transaction.mockImplementation(async (callback: (transaction: typeof db) => Promise<void>) => {
      await callback(db);
    });

    mockSelectResults([baseRow], [{ startDate: "2026-08-01", endDate: "2026-08-05" }]);
    db.insert.mockImplementation((table: unknown) => ({
      values: async (values: Record<string, unknown>) => {
        if (table === daysTable) {
          insertedDayValues.push(values);
        }
      },
    }));
    db.update.mockImplementation((table: unknown) => ({
      set: (values: Record<string, unknown>) => {
        if (table === reservationsTable) {
          updatedReservationValues = values;
        }
        if (table === daysTable) {
          updatedDayValues.push(values);
        }
        if (table === tripsTable) {
          updatedTripValues.push(values);
        }
        return { where: async () => undefined };
      },
    }));
  });

  it("throws when the reservation does not exist", async () => {
    mockSelectResults([]);

    await expect(updateReservation("missing", { provider: "New Name" })).rejects.toThrow("Reservation not found.");

    expect(assertTripAccess).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("checks editor access on the reservation's trip before updating", async () => {
    await updateReservation("res-1", { provider: "New Name" });

    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
  });

  it("updates the provider independently and trims it", async () => {
    await updateReservation("res-1", { provider: "  New Name  " });

    expect(updatedReservationValues).toMatchObject({ provider: "New Name" });
    expect(updatedReservationValues).not.toHaveProperty("startAt");
    expect(updatedReservationValues).not.toHaveProperty("endAt");
  });

  it("rejects an empty provider", async () => {
    await expect(updateReservation("res-1", { provider: "   " })).rejects.toThrow("Provider is required.");

    expect(db.update).not.toHaveBeenCalled();
  });

  it("updates startAt independently, converting to a Date", async () => {
    mockSelectResults([baseRow], [{ startDate: "2026-08-01", endDate: "2026-09-05" }]);

    await updateReservation("res-1", { startAt: "2026-09-01T12:00:00.000Z" });

    expect(updatedReservationValues).toMatchObject({ startAt: new Date("2026-09-01T12:00:00.000Z") });
    expect(updatedReservationValues).not.toHaveProperty("provider");
  });

  it("updates endAt independently, converting to a Date", async () => {
    mockSelectResults([baseRow], [{ startDate: "2026-08-01", endDate: "2026-09-05" }]);

    await updateReservation("res-1", { endAt: "2026-09-02T12:00:00.000Z" });

    expect(updatedReservationValues).toMatchObject({ endAt: new Date("2026-09-02T12:00:00.000Z") });
  });

  it("rejects an unparseable startAt before any update", async () => {
    await expect(updateReservation("res-1", { startAt: "not-a-date" })).rejects.toThrow("Invalid start date and time.");

    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects an unparseable endAt before any update", async () => {
    await expect(updateReservation("res-1", { endAt: "garbage" })).rejects.toThrow("Invalid end date and time.");

    expect(db.update).not.toHaveBeenCalled();
  });

  it("updates confirmationCode independently", async () => {
    await updateReservation("res-1", { confirmationCode: "XYZ987" });

    expect(updatedReservationValues).toMatchObject({ confirmationCode: "XYZ987" });
  });

  it("updates serviceNumber independently", async () => {
    await updateReservation("res-1", { serviceNumber: "TP 202" });

    expect(updatedReservationValues).toMatchObject({ serviceNumber: "TP 202" });
  });

  it("updates notes independently", async () => {
    await updateReservation("res-1", { notes: "Window seat please" });

    expect(updatedReservationValues).toMatchObject({ notes: "Window seat please" });
  });

  it("clears confirmationCode, serviceNumber, and notes when set to an empty string", async () => {
    mockSelectResults(
      [{ ...baseRow, confirmationCode: "ABC123", serviceNumber: "TP 202", notes: "Old notes" }],
      [{ startDate: "2026-08-01", endDate: "2026-08-05" }]
    );

    await updateReservation("res-1", { confirmationCode: "", serviceNumber: "", notes: "" });

    expect(updatedReservationValues).toMatchObject({ confirmationCode: null, serviceNumber: null, notes: null });
  });

  it("updates startAddress and endAddress independently", async () => {
    await updateReservation("res-1", {
      startAddress: "JFK International Airport, NY",
      endAddress: "LAX International Airport, CA",
    });

    expect(updatedReservationValues).toMatchObject({
      startAddress: "JFK International Airport, NY",
      endAddress: "LAX International Airport, CA",
    });
  });

  it("updates structured start and end location fields when addresses are patched", async () => {
    await updateReservation("res-1", {
      startAddress: "JFK International Airport, NY",
      startLocationName: "John F. Kennedy International Airport",
      startLocationLat: 40.6413,
      startLocationLng: -73.7781,
      endAddress: "LAX International Airport, CA",
      endLocationName: "Los Angeles International Airport",
      endLocationLat: 33.9416,
      endLocationLng: -118.4085,
    });

    expect(updatedReservationValues).toMatchObject({
      startAddress: "JFK International Airport, NY",
      startLocationName: "John F. Kennedy International Airport",
      startLocationLat: 40.6413,
      startLocationLng: -73.7781,
      endAddress: "LAX International Airport, CA",
      endLocationName: "Los Angeles International Airport",
      endLocationLat: 33.9416,
      endLocationLng: -118.4085,
    });
  });

  it("clears startAddress and endAddress when set to an empty string", async () => {
    mockSelectResults(
      [
        {
          ...baseRow,
          startAddress: "JFK",
          startLocationName: "JFK Airport",
          startLocationLat: 40.6413,
          startLocationLng: -73.7781,
          endAddress: "LAX",
          endLocationName: "LAX Airport",
          endLocationLat: 33.9416,
          endLocationLng: -118.4085,
        },
      ],
      [{ startDate: "2026-08-01", endDate: "2026-08-05" }]
    );

    await updateReservation("res-1", { startAddress: "", endAddress: "" });

    expect(updatedReservationValues).toMatchObject({
      startAddress: null,
      startLocationName: null,
      startLocationLat: null,
      startLocationLng: null,
      endAddress: null,
      endLocationName: null,
      endLocationLat: null,
      endLocationLng: null,
    });
  });

  it("leaves existing structured location data untouched when only the address text is patched", async () => {
    mockSelectResults(
      [
        {
          ...baseRow,
          startAddress: "JFK",
          startLocationName: "JFK Airport",
          startLocationLat: 40.6413,
          startLocationLng: -73.7781,
        },
      ],
      [{ startDate: "2026-08-01", endDate: "2026-08-05" }]
    );

    await updateReservation("res-1", { startAddress: "JFK Terminal 4" });

    expect(updatedReservationValues).toMatchObject({ startAddress: "JFK Terminal 4" });
    expect(updatedReservationValues).not.toHaveProperty("startLocationName");
    expect(updatedReservationValues).not.toHaveProperty("startLocationLat");
    expect(updatedReservationValues).not.toHaveProperty("startLocationLng");
  });

  it("updates cost independently, converting to a numeric string", async () => {
    await updateReservation("res-1", { cost: 349.5 });

    expect(updatedReservationValues).toMatchObject({ cost: "349.5" });
  });

  it("clears cost when set to null", async () => {
    mockSelectResults([{ ...baseRow, cost: "199.00" }], [{ startDate: "2026-08-01", endDate: "2026-08-05" }]);

    await updateReservation("res-1", { cost: null });

    expect(updatedReservationValues).toMatchObject({ cost: null });
  });

  it.each([ReservationType.Lodging, ReservationType.RentalCar, ReservationType.Cruise])(
    "rejects clearing endAt for %s reservations",
    async (type) => {
      mockSelectResults([
        {
          ...baseRow,
          type,
          startAt: new Date("2026-08-01T10:00:00.000Z"),
          endAt: new Date("2026-08-05T11:00:00.000Z"),
        },
      ]);

      await expect(updateReservation("res-1", { endAt: "" })).rejects.toThrow(
        "An end date and time is required for this reservation type."
      );

      expect(db.update).not.toHaveBeenCalled();
    }
  );

  it("rejects setting endAt when the resulting startAt is unset", async () => {
    mockSelectResults([{ ...baseRow, startAt: null, endAt: null }]);

    await expect(updateReservation("res-1", { endAt: "2026-09-02T12:00:00.000Z" })).rejects.toThrow(
      "A start date and time is required when an end date and time is set."
    );

    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects clearing startAt when the resulting endAt is still set", async () => {
    mockSelectResults([
      {
        ...baseRow,
        startAt: new Date("2026-08-01T10:00:00.000Z"),
        endAt: new Date("2026-08-05T11:00:00.000Z"),
        type: ReservationType.Other,
      },
    ]);

    await expect(updateReservation("res-1", { startAt: "" })).rejects.toThrow(
      "A start date and time is required when an end date and time is set."
    );

    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects an endAt before the resulting startAt", async () => {
    await expect(
      updateReservation("res-1", { startAt: "2026-09-05T10:00:00.000Z", endAt: "2026-09-01T10:00:00.000Z" })
    ).rejects.toThrow("The end date and time must be after the start date and time.");

    expect(db.update).not.toHaveBeenCalled();
  });

  it("validates endAt against the existing startAt when only endAt is patched", async () => {
    mockSelectResults([{ ...baseRow, startAt: new Date("2026-09-05T10:00:00.000Z"), endAt: null }]);

    await expect(updateReservation("res-1", { endAt: "2026-09-01T10:00:00.000Z" })).rejects.toThrow(
      "The end date and time must be after the start date and time."
    );

    expect(db.update).not.toHaveBeenCalled();
  });

  it("allows a successful patch that omits fields, changing only the provided keys", async () => {
    await updateReservation("res-1", { notes: "Updated notes" });

    expect(updatedReservationValues).toEqual({ updatedAt: expect.any(Date), notes: "Updated notes" });
  });

  it("revalidates the trip path after a successful update", async () => {
    await updateReservation("res-1", { provider: "New Name" });

    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("extends trip date range when an updated startAt falls before the current range", async () => {
    mockSelectResults(
      [{ ...baseRow, startAt: new Date("2030-06-12T10:00:00.000Z") }],
      [{ startDate: "2030-06-10", endDate: "2030-06-15" }],
      [{ count: 6 }],
      buildDateRows("2030-06-10", "2030-06-15"),
      buildDayNumberRows(6)
    );

    await updateReservation("res-1", { startAt: "2030-06-09T10:00:00.000Z" });

    expect(updatedDayValues).toHaveLength(2);
    expect(insertedDayValues).toEqual([
      {
        tripId: "trip-1",
        dayNumber: 1,
        date: "2030-06-09",
        label: "Day 1",
      },
    ]);
    expect(updatedTripValues).toContainEqual({
      startDate: "2030-06-09",
      updatedAt: expect.any(Date),
    });
    expect(updatedReservationValues).toMatchObject({
      startAt: new Date("2030-06-09T10:00:00.000Z"),
    });
  });

  it("does not extend when the update changes only provider text", async () => {
    mockSelectResults(
      [{ ...baseRow, startAt: new Date("2030-06-12T10:00:00.000Z") }],
      [{ startDate: "2030-06-10", endDate: "2030-06-15" }]
    );

    await updateReservation("res-1", { provider: "Updated Name" });

    expect(insertedDayValues).toEqual([]);
    expect(updatedTripValues).toEqual([]);
    expect(updatedReservationValues).toMatchObject({
      provider: "Updated Name",
    });
  });

  it("does not extend when only the reservation time changes on the same calendar date", async () => {
    mockSelectResults(
      [{ ...baseRow, startAt: new Date("2030-06-12T10:00:00.000Z") }],
      [{ startDate: "2030-06-10", endDate: "2030-06-15" }]
    );

    await updateReservation("res-1", { startAt: "2030-06-12T12:30:00.000Z" });

    expect(insertedDayValues).toEqual([]);
    expect(updatedTripValues).toEqual([]);
    expect(updatedReservationValues).toMatchObject({
      startAt: new Date("2030-06-12T12:30:00.000Z"),
    });
  });

  it("extends when an added endAt falls after the current trip range", async () => {
    mockSelectResults(
      [{ ...baseRow, type: ReservationType.Other, startAt: new Date("2030-06-12T10:00:00.000Z"), endAt: null }],
      [{ startDate: "2030-06-10", endDate: "2030-06-15" }],
      [{ count: 6 }],
      buildDateRows("2030-06-10", "2030-06-15"),
      buildDayNumberRows(6)
    );

    await updateReservation("res-1", { endAt: "2030-06-16T11:00:00.000Z" });

    expect(insertedDayValues).toEqual([
      {
        tripId: "trip-1",
        dayNumber: 7,
        date: "2030-06-16",
        label: "Day 7",
      },
    ]);
    expect(updatedTripValues).toContainEqual({
      endDate: "2030-06-16",
      updatedAt: expect.any(Date),
    });
    expect(updatedReservationValues).toMatchObject({
      endAt: new Date("2030-06-16T11:00:00.000Z"),
    });
  });
});

describe("deleteReservation", () => {
  const baseRow = {
    id: "res-1",
    tripId: "trip-1",
    type: ReservationType.Flight,
    provider: "Acme Air",
    startAt: new Date("2026-08-01T10:00:00.000Z"),
    endAt: null,
    startAddress: null,
    startLocationName: null,
    startLocationLat: null,
    startLocationLng: null,
    endAddress: null,
    endLocationName: null,
    endLocationLat: null,
    endLocationLng: null,
    cost: null,
    confirmationCode: null,
    notes: null,
  };

  function mockExistingReservation(row: Record<string, unknown> | undefined): void {
    db.select.mockReturnValue({
      from: () => ({
        where: async () => (row ? [row] : []),
      }),
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    db.select.mockReset();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    mockExistingReservation(baseRow);
    db.delete.mockReturnValue({
      where: async () => undefined,
    });
  });

  it("resolves silently when the reservation does not exist (idempotent)", async () => {
    mockExistingReservation(undefined);

    await expect(deleteReservation("missing")).resolves.toBeUndefined();

    expect(assertTripAccess).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
  });

  it("checks editor access on the reservation's trip before deleting", async () => {
    await deleteReservation("res-1");

    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
  });

  it("deletes the reservation row with a where filter on the reservation id", async () => {
    const whereStub = vi.fn().mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where: whereStub });

    await deleteReservation("res-1");

    expect(db.delete).toHaveBeenCalled();
    expect(whereStub).toHaveBeenCalledWith(expect.anything());
  });

  it("revalidates the trip path after a successful delete", async () => {
    await deleteReservation("res-1");

    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });
});

describe("deleteReservation — blob cleanup", () => {
  const baseRow = {
    id: "res-1",
    tripId: "trip-1",
    type: ReservationType.Flight,
    provider: "Acme Air",
    startAt: new Date("2026-08-01T10:00:00.000Z"),
    endAt: null,
    confirmationCode: null,
    notes: null,
  };

  const docRow = { id: "doc-1", url: "https://blob.example.com/doc.pdf", reservationId: "res-1" };

  beforeEach(() => {
    vi.clearAllMocks();
    db.select.mockReset();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    del.mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where: async () => undefined });
  });

  it("calls del() on each attached document blob URL before deleting the reservation row", async () => {
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where: deleteWhere });

    db.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [baseRow] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [docRow] }) });

    await deleteReservation("res-1");

    expect(del).toHaveBeenCalledWith(["https://blob.example.com/doc.pdf"]);
    expect(deleteWhere).toHaveBeenCalled();
  });

  it("skips del() when UPLOAD_STUB is 'true'", async () => {
    process.env.UPLOAD_STUB = "true";
    db.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [baseRow] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [docRow] }) });

    await deleteReservation("res-1");

    expect(del).not.toHaveBeenCalled();
    delete process.env.UPLOAD_STUB;
  });

  it("skips del() when there are no attached documents", async () => {
    db.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [baseRow] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) });

    await deleteReservation("res-1");

    expect(del).not.toHaveBeenCalled();
  });

  it("still deletes the reservation when blob cleanup fails (best-effort)", async () => {
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where: deleteWhere });
    del.mockRejectedValue(new Error("blob store unavailable"));

    db.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [baseRow] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [docRow] }) });

    await expect(deleteReservation("res-1")).resolves.toBeUndefined();
    expect(deleteWhere).toHaveBeenCalled();
  });
});

describe("uploadReservationDocument", () => {
  const reservationRow = { id: "res-1", tripId: "trip-1" };

  function makeFile(name: string, size: number): File {
    const file = new File(["x"], name, { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: size, configurable: true });
    return file;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    db.select.mockReset();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    put.mockResolvedValue({ url: "https://blob.example.com/doc.pdf" });
    saveLocalUpload.mockResolvedValue("http://localhost/stub/doc.pdf");
    db.insert.mockReturnValue({ values: async () => undefined });
  });

  it("throws when the reservation does not exist", async () => {
    db.select.mockReturnValue({ from: () => ({ where: async () => [] }) });

    const form = new FormData();
    form.append("file", makeFile("doc.pdf", 100));

    await expect(uploadReservationDocument("missing", form)).rejects.toThrow("Reservation not found.");
    expect(assertTripAccess).not.toHaveBeenCalled();
  });

  it("checks editor access before uploading", async () => {
    db.select.mockReturnValue({ from: () => ({ where: async () => [reservationRow] }) });

    const form = new FormData();
    form.append("file", makeFile("doc.pdf", 100));

    await uploadReservationDocument("res-1", form);

    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
  });

  it("rejects files larger than MAX_UPLOAD_BYTES", async () => {
    db.select.mockReturnValue({ from: () => ({ where: async () => [reservationRow] }) });

    const form = new FormData();
    form.append("file", makeFile("big.pdf", 30 * 1024 * 1024));

    await expect(uploadReservationDocument("res-1", form)).rejects.toThrow("File is too large.");
    expect(put).not.toHaveBeenCalled();
  });

  it("calls put() with the file and inserts a document row", async () => {
    db.select.mockReturnValue({ from: () => ({ where: async () => [reservationRow] }) });
    let insertedValues: Record<string, unknown> | undefined;
    db.insert.mockReturnValue({
      values: async (vals: Record<string, unknown>) => {
        insertedValues = vals;
      },
    });

    const form = new FormData();
    form.append("file", makeFile("doc.pdf", 100));

    await uploadReservationDocument("res-1", form);

    expect(put).toHaveBeenCalled();
    expect(insertedValues).toMatchObject({
      tripId: "trip-1",
      reservationId: "res-1",
      name: "doc.pdf",
      kind: "pdf",
      size: "0.1 KB",
      url: "https://blob.example.com/doc.pdf",
    });
  });

  it("derives the document kind from the file MIME type, not the filename", async () => {
    db.select.mockReturnValue({ from: () => ({ where: async () => [reservationRow] }) });
    let insertedValues: Record<string, unknown> | undefined;
    db.insert.mockReturnValue({
      values: async (vals: Record<string, unknown>) => {
        insertedValues = vals;
      },
    });

    // Filename ends in .pdf but the MIME type is an image — kind must follow the MIME type.
    const file = new File(["x"], "scan.pdf", { type: "image/png" });
    Object.defineProperty(file, "size", { value: 100, configurable: true });
    const form = new FormData();
    form.append("file", file);

    await uploadReservationDocument("res-1", form);

    expect(insertedValues).toMatchObject({ kind: "image" });
  });

  it("rolls back the uploaded blob when the document insert fails", async () => {
    db.select.mockReturnValue({ from: () => ({ where: async () => [reservationRow] }) });
    db.insert.mockReturnValue({
      values: async () => {
        throw new Error("insert failed");
      },
    });

    const form = new FormData();
    form.append("file", makeFile("doc.pdf", 100));

    await expect(uploadReservationDocument("res-1", form)).rejects.toThrow("insert failed");
    expect(del).toHaveBeenCalledWith("https://blob.example.com/doc.pdf");
  });

  it("does not attempt blob rollback when the insert fails under UPLOAD_STUB", async () => {
    process.env.UPLOAD_STUB = "true";
    db.select.mockReturnValue({ from: () => ({ where: async () => [reservationRow] }) });
    db.insert.mockReturnValue({
      values: async () => {
        throw new Error("insert failed");
      },
    });

    const form = new FormData();
    form.append("file", makeFile("doc.pdf", 100));

    await expect(uploadReservationDocument("res-1", form)).rejects.toThrow("insert failed");
    expect(del).not.toHaveBeenCalled();
    delete process.env.UPLOAD_STUB;
  });

  it("calls saveLocalUpload() when UPLOAD_STUB is 'true'", async () => {
    process.env.UPLOAD_STUB = "true";
    db.select.mockReturnValue({ from: () => ({ where: async () => [reservationRow] }) });

    const form = new FormData();
    form.append("file", makeFile("doc.pdf", 100));

    await uploadReservationDocument("res-1", form);

    expect(saveLocalUpload).toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
    delete process.env.UPLOAD_STUB;
  });

  it("revalidates the trip path after upload", async () => {
    db.select.mockReturnValue({ from: () => ({ where: async () => [reservationRow] }) });

    const form = new FormData();
    form.append("file", makeFile("doc.pdf", 100));

    await uploadReservationDocument("res-1", form);

    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });
});

describe("removeReservationDocument", () => {
  const docRow = { id: "doc-1", url: "https://blob.example.com/doc.pdf", reservationId: "res-1" };
  const reservationRow = { id: "res-1", tripId: "trip-1" };

  beforeEach(() => {
    vi.clearAllMocks();
    db.select.mockReset();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    del.mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where: async () => undefined });
  });

  it("resolves silently when the document does not exist (idempotent)", async () => {
    db.select.mockReturnValue({ from: () => ({ where: async () => [] }) });

    await expect(removeReservationDocument("missing")).resolves.toBeUndefined();
    expect(assertTripAccess).not.toHaveBeenCalled();
  });

  it("throws when the document is not attached to a reservation", async () => {
    db.select.mockReturnValue({
      from: () => ({ where: async () => [{ ...docRow, reservationId: null }] }),
    });

    await expect(removeReservationDocument("doc-1")).rejects.toThrow("Document is not attached to a reservation.");
  });

  it("throws when the reservation is not found", async () => {
    db.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [docRow] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [] }) });

    await expect(removeReservationDocument("doc-1")).rejects.toThrow("Reservation not found.");
  });

  it("checks editor access on the reservation's trip", async () => {
    db.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [docRow] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [reservationRow] }) });

    await removeReservationDocument("doc-1");

    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
  });

  it("calls del() on the blob URL before deleting the document row", async () => {
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where: deleteWhere });

    db.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [docRow] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [reservationRow] }) });

    await removeReservationDocument("doc-1");

    expect(del).toHaveBeenCalledWith("https://blob.example.com/doc.pdf");
    expect(deleteWhere).toHaveBeenCalled();
  });

  it("skips del() when UPLOAD_STUB is 'true'", async () => {
    process.env.UPLOAD_STUB = "true";
    db.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [docRow] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [reservationRow] }) });

    await removeReservationDocument("doc-1");

    expect(del).not.toHaveBeenCalled();
    delete process.env.UPLOAD_STUB;
  });

  it("skips del() when the document has no url", async () => {
    db.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [{ ...docRow, url: null }] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [reservationRow] }) });

    await removeReservationDocument("doc-1");

    expect(del).not.toHaveBeenCalled();
  });

  it("still deletes the document row when blob cleanup fails (best-effort)", async () => {
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    db.delete.mockReturnValue({ where: deleteWhere });
    del.mockRejectedValue(new Error("blob store unavailable"));

    db.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [docRow] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [reservationRow] }) });

    await expect(removeReservationDocument("doc-1")).resolves.toBeUndefined();
    expect(deleteWhere).toHaveBeenCalled();
  });

  it("revalidates the trip path after removal", async () => {
    db.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [docRow] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => [reservationRow] }) });

    await removeReservationDocument("doc-1");

    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });
});

describe("renameReservationDocument", () => {
  const reservationRow = { id: "res-1", tripId: "trip-1" };

  beforeEach(() => {
    vi.clearAllMocks();
    db.select.mockReset();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    db.update.mockReturnValue({ set: () => ({ where: async () => undefined }) });
  });

  it("does nothing when the document does not exist", async () => {
    db.select.mockReturnValue({ from: () => ({ where: async () => [] }) });

    await expect(renameReservationDocument("missing", "New name")).resolves.toBeUndefined();
    expect(assertTripAccess).not.toHaveBeenCalled();
  });

  it("resolves the trip via the reservation when the doc has no tripId", async () => {
    db.select
      .mockReturnValueOnce({
        from: () => ({ where: async () => [{ id: "doc-1", tripId: null, reservationId: "res-1" }] }),
      })
      .mockReturnValueOnce({ from: () => ({ where: async () => [reservationRow] }) });

    await renameReservationDocument("doc-1", "New name");

    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
  });

  it("updates the document name and revalidates the trip path", async () => {
    db.select.mockReturnValue({ from: () => ({ where: async () => [{ id: "doc-1", tripId: "trip-1" }] }) });
    const setSpy = vi.fn(() => ({ where: async () => undefined }));
    db.update.mockReturnValue({ set: setSpy });

    await renameReservationDocument("doc-1", "New name");

    expect(setSpy).toHaveBeenCalledWith({ name: "New name" });
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });
});

describe("promoteReservationDocToTrip", () => {
  const reservationRow = { id: "res-1", tripId: "trip-1" };

  beforeEach(() => {
    vi.clearAllMocks();
    db.select.mockReset();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
  });

  it("does nothing when the document does not exist", async () => {
    db.select.mockReturnValue({ from: () => ({ where: async () => [] }) });

    await expect(promoteReservationDocToTrip("missing")).resolves.toBeUndefined();
    expect(assertTripAccess).not.toHaveBeenCalled();
  });

  it("sets tripId and clears reservationId, resolving the trip via the reservation when needed", async () => {
    db.select
      .mockReturnValueOnce({
        from: () => ({ where: async () => [{ id: "doc-1", tripId: null, reservationId: "res-1" }] }),
      })
      .mockReturnValueOnce({ from: () => ({ where: async () => [reservationRow] }) });
    const setSpy = vi.fn(() => ({ where: async () => undefined }));
    db.update.mockReturnValue({ set: setSpy });

    await promoteReservationDocToTrip("doc-1");

    expect(setSpy).toHaveBeenCalledWith({ tripId: "trip-1", reservationId: null });
    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });

  it("uses the doc's existing tripId without a reservation lookup", async () => {
    db.select.mockReturnValueOnce({ from: () => ({ where: async () => [{ id: "doc-1", tripId: "trip-1" }] }) });
    const setSpy = vi.fn(() => ({ where: async () => undefined }));
    db.update.mockReturnValue({ set: setSpy });

    await promoteReservationDocToTrip("doc-1");

    expect(setSpy).toHaveBeenCalledWith({ tripId: "trip-1", reservationId: null });
  });
});

describe("attachTripDocToReservation", () => {
  const reservationRow = { id: "res-1", tripId: "trip-1" };

  beforeEach(() => {
    vi.clearAllMocks();
    db.select.mockReset();
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockResolvedValue(undefined);
    db.select.mockReturnValue({ from: () => ({ where: async () => [reservationRow] }) });
  });

  it("throws when the reservation does not exist", async () => {
    db.select.mockReturnValue({ from: () => ({ where: async () => [] }) });

    await expect(attachTripDocToReservation("doc-1", "missing")).rejects.toThrow("Reservation not found.");
  });

  it("checks editor access before attaching", async () => {
    const setSpy = vi.fn(() => ({ where: async () => undefined }));
    db.update.mockReturnValue({ set: setSpy });

    await attachTripDocToReservation("doc-1", "res-1");

    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
  });

  it("sets the reservationId on the document and revalidates the trip path", async () => {
    const setSpy = vi.fn(() => ({ where: async () => undefined }));
    db.update.mockReturnValue({ set: setSpy });

    await attachTripDocToReservation("doc-1", "res-1");

    expect(setSpy).toHaveBeenCalledWith({ reservationId: "res-1" });
    expect(revalidatePath).toHaveBeenCalledWith("/trips/trip-1");
  });
});

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  assertTripAccess,
  db,
  daysTable,
  documentsTable,
  fileCleanup,
  recordTripUpdated,
  recordDeletion,
  requireTripRole,
  requireUser,
  resolveDocumentTripId,
  reservationsTable,
  revalidatePath,
  tripsTable,
} = vi.hoisted(() => ({
  assertTripAccess: vi.fn(),
  recordTripUpdated: vi.fn(),
  recordDeletion: vi.fn(),
  db: {
    execute: vi.fn(),
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
  fileCleanup: { queueFileDeletions: vi.fn(), removeQueuedFiles: vi.fn() },
  requireTripRole: vi.fn(),
  requireUser: vi.fn(),
  resolveDocumentTripId: vi.fn(),
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

vi.mock("@/lib/trip-activity", () => ({ recordTripUpdated }));
vi.mock("@/lib/services/deletion-records", () => ({ recordDeletion }));
vi.mock("@/lib/file-cleanup", () => fileCleanup);
vi.mock("@/lib/document-ancestry", () => ({ resolveDocumentTripId }));
vi.mock("@/lib/services/trip-access", async (original) => ({
  ...(await original<typeof import("@/lib/services/trip-access")>()),
  requireTripRole,
}));

const { adapterDel, getStorageAdapter } = vi.hoisted(() => ({
  adapterDel: vi.fn(),
  getStorageAdapter: vi.fn(),
}));
vi.mock("@/lib/storage/storage-adapter", () => ({ getStorageAdapter }));

import { updateReservation, deleteReservation } from "./actions";
import { ReservationType } from "@/data/types";
import { notFound } from "next/navigation";
import { TripForbiddenError, TripNotFoundError } from "@/lib/services/trip-access";

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
    db.execute.mockResolvedValue([{ id: "trip-1" }]);

    mockSelectResults([{ tripId: "trip-1" }], [baseRow], [{ startDate: "2026-08-01", endDate: "2026-08-05" }]);
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
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("checks editor access on the reservation's trip before updating", async () => {
    await updateReservation("res-1", { provider: "New Name" });

    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(db.execute).toHaveBeenCalledOnce();
  });

  it("locks before reading current reservation state inside updateReservation", async () => {
    const transaction = {
      execute: vi.fn().mockResolvedValue([{ id: "trip-1" }]),
      select: vi
        .fn()
        .mockReturnValueOnce(createSelectMock([baseRow]))
        .mockReturnValueOnce(createSelectMock([{ startDate: "2026-08-01", endDate: "2026-08-05" }])),
      update: vi.fn(() => ({
        set: vi.fn((values: Record<string, unknown>) => {
          updatedReservationValues = values;
          return { where: async () => undefined };
        }),
      })),
    };
    db.select.mockReset();
    db.select.mockReturnValueOnce(createSelectMock([{ tripId: "trip-1" }]));
    db.transaction.mockImplementationOnce(async (callback: (tx: typeof transaction) => Promise<void>) => {
      await callback(transaction);
    });

    await updateReservation("res-1", { serviceNumber: "TP 202" });

    expect(transaction.execute.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.select.mock.invocationCallOrder[0]
    );
    expect(updatedReservationValues).toMatchObject({ serviceNumber: "TP 202" });
    expect(updatedReservationValues).not.toHaveProperty("provider");
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
    mockSelectResults([{ tripId: "trip-1" }], [baseRow], [{ startDate: "2026-08-01", endDate: "2026-09-05" }]);

    await updateReservation("res-1", { startAt: "2026-09-01T12:00:00.000Z" });

    expect(updatedReservationValues).toMatchObject({ startAt: new Date("2026-09-01T12:00:00.000Z") });
    expect(updatedReservationValues).not.toHaveProperty("provider");
  });

  it("updates endAt independently, converting to a Date", async () => {
    mockSelectResults([{ tripId: "trip-1" }], [baseRow], [{ startDate: "2026-08-01", endDate: "2026-09-05" }]);

    await updateReservation("res-1", { endAt: "2026-09-02T12:00:00.000Z" });

    expect(updatedReservationValues).toMatchObject({ endAt: new Date("2026-09-02T12:00:00.000Z") });
  });

  it("rejects over-length text before any update", async () => {
    await expect(updateReservation("res-1", { provider: "x".repeat(201) })).rejects.toThrow("Provider must be 200");
    await expect(updateReservation("res-1", { notes: "x".repeat(5001) })).rejects.toThrow("Notes must be 5000");
    await expect(updateReservation("res-1", { serviceNumber: "x".repeat(65) })).rejects.toThrow("Service number");
    await expect(updateReservation("res-1", { endLocationLng: 500 })).rejects.toThrow("Longitude");

    expect(db.update).not.toHaveBeenCalled();
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
      [{ tripId: "trip-1" }],
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
      [{ tripId: "trip-1" }],
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
      [{ tripId: "trip-1" }],
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

  it.each([ReservationType.Lodging, ReservationType.RentalCar, ReservationType.Cruise])(
    "rejects clearing endAt for %s reservations",
    async (type) => {
      mockSelectResults(
        [{ tripId: "trip-1" }],
        [
          {
            ...baseRow,
            type,
            startAt: new Date("2026-08-01T10:00:00.000Z"),
            endAt: new Date("2026-08-05T11:00:00.000Z"),
          },
        ]
      );

      await expect(updateReservation("res-1", { endAt: "" })).rejects.toThrow(
        "An end date and time is required for this reservation type."
      );

      expect(db.update).not.toHaveBeenCalled();
    }
  );

  it("rejects setting endAt when the resulting startAt is unset", async () => {
    mockSelectResults([{ tripId: "trip-1" }], [{ ...baseRow, startAt: null, endAt: null }]);

    await expect(updateReservation("res-1", { endAt: "2026-09-02T12:00:00.000Z" })).rejects.toThrow(
      "A start date and time is required when an end date and time is set."
    );

    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects clearing startAt when the resulting endAt is still set", async () => {
    mockSelectResults(
      [{ tripId: "trip-1" }],
      [
        {
          ...baseRow,
          startAt: new Date("2026-08-01T10:00:00.000Z"),
          endAt: new Date("2026-08-05T11:00:00.000Z"),
          type: ReservationType.Other,
        },
      ]
    );

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
    mockSelectResults(
      [{ tripId: "trip-1" }],
      [{ ...baseRow, startAt: new Date("2026-09-05T10:00:00.000Z"), endAt: null }]
    );

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
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
  });

  it("records nothing when the update is rejected", async () => {
    await expect(updateReservation("res-1", { provider: "  " })).rejects.toThrow("Provider is required.");

    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("extends trip date range when an updated startAt falls before the current range", async () => {
    mockSelectResults(
      [{ tripId: "trip-1" }],
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
      [{ tripId: "trip-1" }],
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
      [{ tripId: "trip-1" }],
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
      [{ tripId: "trip-1" }],
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
  const reservationRow = { id: "res-1", tripId: "trip-1" };
  const attached = (id: string, url: string | null) => ({
    id,
    url,
    tripId: null,
    eventId: null,
    reservationId: "res-1",
  });
  let order: string[];
  let transaction: {
    execute: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let underLock: { reservation: unknown[]; documents: unknown[] };
  let deletedTables: unknown[];

  function selecting(rows: () => unknown[], label: string) {
    return {
      from: () => ({
        where: async () => {
          order.push(label);
          return rows();
        },
      }),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    order = [];
    deletedTables = [];
    underLock = { reservation: [reservationRow], documents: [] };
    requireUser.mockResolvedValue({ id: "user-1" });
    assertTripAccess.mockImplementation(async () => void order.push("preflight"));
    requireTripRole.mockReset();
    requireTripRole.mockImplementation(async () => void order.push("role"));
    vi.mocked(notFound).mockImplementation(() => {
      throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
    });
    resolveDocumentTripId.mockReset();
    resolveDocumentTripId.mockImplementation(async () => "trip-1");
    fileCleanup.queueFileDeletions.mockReset();
    fileCleanup.queueFileDeletions.mockImplementation(async (_transaction: unknown, urls: string[]) => {
      order.push("queue");
      return urls.map((url, index) => ({ id: `queued-${index}`, url }));
    });
    fileCleanup.removeQueuedFiles.mockReset();
    fileCleanup.removeQueuedFiles.mockImplementation(async () => void order.push("cleanup"));
    recordTripUpdated.mockImplementation(() => void order.push("activity"));
    revalidatePath.mockImplementation(() => void order.push("revalidate"));
    getStorageAdapter.mockReturnValue({ put: vi.fn(), del: adapterDel });
    db.select.mockReset();
    db.select.mockReturnValue(selecting(() => [reservationRow], "preflight-read"));
    transaction = {
      execute: vi.fn(async () => {
        order.push("lock");
        return [{ id: "trip-1" }];
      }),
      select: vi.fn(() => ({
        from: (table: unknown) => ({
          where: async () => {
            const isReservation = table === reservationsTable;
            order.push(isReservation ? "read-reservation" : "read-documents");
            return isReservation ? underLock.reservation : underLock.documents;
          },
        }),
      })),
      delete: vi.fn((table: unknown) => ({
        where: async () => {
          order.push(table === reservationsTable ? "delete-reservation" : "delete-other");
          deletedTables.push(table);
        },
      })),
    };
    db.transaction.mockReset();
    db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) => {
      await callback(transaction);
      order.push("commit");
    });
  });

  it("resolves silently when the reservation does not exist (idempotent)", async () => {
    db.select.mockReturnValue(selecting(() => [], "preflight-read"));

    await expect(deleteReservation("missing")).resolves.toBeUndefined();

    expect(assertTripAccess).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("checks editor access on the reservation's trip before opening the transaction", async () => {
    await deleteReservation("res-1");

    expect(assertTripAccess).toHaveBeenCalledWith("trip-1", "user-1", "editor");
    expect(order.indexOf("preflight")).toBeLessThan(order.indexOf("lock"));
  });

  it("locks the trip, rechecks the role, then reads, queues and deletes before any effect or cleanup", async () => {
    underLock.documents = [attached("doc-1", "/api/storage/reservation-documents/res-1/a.pdf")];

    await deleteReservation("res-1");

    expect(order).toEqual([
      "preflight-read",
      "preflight",
      "lock",
      "role",
      "read-reservation",
      "read-documents",
      "queue",
      "delete-reservation",
      "commit",
      "activity",
      "revalidate",
      "cleanup",
    ]);
    expect(requireTripRole).toHaveBeenCalledExactlyOnceWith("trip-1", "user-1", "editor", transaction);
    expect(recordDeletion).toHaveBeenCalledExactlyOnceWith(transaction, "reservation", "res-1", "user-1");
    expect(fileCleanup.queueFileDeletions).toHaveBeenCalledWith(transaction, [
      "/api/storage/reservation-documents/res-1/a.pdf",
    ]);
    expect(fileCleanup.removeQueuedFiles).toHaveBeenCalledWith([
      { id: "queued-0", url: "/api/storage/reservation-documents/res-1/a.pdf" },
    ]);
    expect(recordTripUpdated).toHaveBeenCalledExactlyOnceWith("user-1", "trip-1");
    expect(revalidatePath).toHaveBeenCalledExactlyOnceWith("/trips/trip-1");
  });

  it("queues each attached file by name only and never deletes storage inside the action", async () => {
    underLock.documents = [
      attached("doc-1", "/api/storage/a.pdf"),
      attached("doc-2", null),
      attached("doc-3", "/api/storage/b.pdf"),
    ];

    await deleteReservation("res-1");

    expect(fileCleanup.queueFileDeletions).toHaveBeenCalledWith(transaction, [
      "/api/storage/a.pdf",
      "/api/storage/b.pdf",
    ]);
    expect(adapterDel).not.toHaveBeenCalled();
    expect(deletedTables).toEqual([reservationsTable]);
  });

  it("queues nothing when the document was promoted first, so its file survives the cascade", async () => {
    // A promotion that committed earlier cleared reservation_id, so the locked read no longer returns the row.
    underLock.documents = [];

    await deleteReservation("res-1");

    expect(fileCleanup.queueFileDeletions).toHaveBeenCalledWith(transaction, []);
    expect(fileCleanup.removeQueuedFiles).toHaveBeenCalledWith([]);
    expect(adapterDel).not.toHaveBeenCalled();
    expect(deletedTables).toEqual([reservationsTable]);
  });

  it("is a silent no-op with no effects when a concurrent deletion already removed the reservation", async () => {
    underLock.reservation = [];

    await expect(deleteReservation("res-1")).resolves.toBeUndefined();

    expect(order).not.toContain("read-documents");
    expect(fileCleanup.queueFileDeletions).not.toHaveBeenCalled();
    expect(transaction.delete).not.toHaveBeenCalled();
    expect(fileCleanup.removeQueuedFiles).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("is a silent no-op when the trip itself is gone before the lock", async () => {
    transaction.execute.mockResolvedValue([]);

    await expect(deleteReservation("res-1")).resolves.toBeUndefined();

    expect(requireTripRole).not.toHaveBeenCalled();
    expect(transaction.delete).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("propagates other lock failures", async () => {
    transaction.execute.mockRejectedValue(new Error("lock timeout"));

    await expect(deleteReservation("res-1")).rejects.toThrow("lock timeout");
    expect(transaction.delete).not.toHaveBeenCalled();
  });

  it("conceals a reservation that moved to another trip under the lock", async () => {
    underLock.reservation = [{ id: "res-1", tripId: "trip-2" }];

    await expect(deleteReservation("res-1")).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");

    expect(fileCleanup.queueFileDeletions).not.toHaveBeenCalled();
    expect(transaction.delete).not.toHaveBeenCalled();
    expect(fileCleanup.removeQueuedFiles).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it.each([new TripForbiddenError("editor"), new TripNotFoundError()])(
    "conceals the reservation when the role is lost under the lock (%s)",
    async (error) => {
      requireTripRole.mockRejectedValue(error);

      await expect(deleteReservation("res-1")).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");

      expect(order).not.toContain("read-reservation");
      expect(fileCleanup.queueFileDeletions).not.toHaveBeenCalled();
      expect(transaction.delete).not.toHaveBeenCalled();
      expect(recordTripUpdated).not.toHaveBeenCalled();
    }
  );

  it("does not swallow unexpected role-check failures", async () => {
    requireTripRole.mockRejectedValue(new Error("database down"));

    await expect(deleteReservation("res-1")).rejects.toThrow("database down");
    expect(notFound).not.toHaveBeenCalled();
  });

  it("does not catch the framework notFound raised by the preflight access check", async () => {
    assertTripAccess.mockImplementation(async () => notFound());

    await expect(deleteReservation("res-1")).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["is unresolved", undefined],
    ["belongs to another trip", "trip-2"],
  ])("conceals the reservation when an attached document's ancestry %s", async (_label, resolved) => {
    underLock.documents = [attached("doc-1", "/api/storage/a.pdf"), attached("doc-2", "/api/storage/b.pdf")];
    resolveDocumentTripId.mockResolvedValueOnce("trip-1").mockResolvedValueOnce(resolved);

    await expect(deleteReservation("res-1")).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");

    expect(resolveDocumentTripId).toHaveBeenCalledWith(transaction, expect.objectContaining({ id: "doc-2" }));
    expect(fileCleanup.queueFileDeletions).not.toHaveBeenCalled();
    expect(transaction.delete).not.toHaveBeenCalled();
    expect(fileCleanup.removeQueuedFiles).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("keeps every row and file, with no effects or cleanup, when the delete rolls back", async () => {
    underLock.documents = [attached("doc-1", "/api/storage/a.pdf")];
    transaction.delete.mockImplementation(() => ({
      where: async () => {
        throw new Error("rollback");
      },
    }));

    await expect(deleteReservation("res-1")).rejects.toThrow("rollback");

    expect(order).not.toContain("commit");
    expect(fileCleanup.removeQueuedFiles).not.toHaveBeenCalled();
    expect(adapterDel).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("deletes nothing when queueing the file names fails", async () => {
    underLock.documents = [attached("doc-1", "/api/storage/a.pdf")];
    fileCleanup.queueFileDeletions.mockRejectedValue(new Error("queue failed"));

    await expect(deleteReservation("res-1")).rejects.toThrow("queue failed");

    expect(transaction.delete).not.toHaveBeenCalled();
    expect(fileCleanup.removeQueuedFiles).not.toHaveBeenCalled();
    expect(recordTripUpdated).not.toHaveBeenCalled();
  });

  it("still succeeds when storage cleanup fails after the commit, leaving the queued names for a retry", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    underLock.documents = [attached("doc-1", "/api/storage/a.pdf")];
    fileCleanup.removeQueuedFiles.mockRejectedValue(new Error("storage down"));

    await expect(deleteReservation("res-1")).resolves.toBeUndefined();

    expect(order).toContain("commit");
    expect(recordTripUpdated).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("a retry after the commit finds nothing and runs no second effect", async () => {
    await deleteReservation("res-1");
    underLock.reservation = [];
    db.select.mockReturnValue(selecting(() => [], "preflight-read"));

    await expect(deleteReservation("res-1")).resolves.toBeUndefined();

    expect(recordTripUpdated).toHaveBeenCalledTimes(1);
    expect(fileCleanup.removeQueuedFiles).toHaveBeenCalledTimes(1);
  });
});
